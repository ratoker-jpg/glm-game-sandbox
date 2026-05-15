// FEN-04: Builder construction runtime.
// Owns auto-placement, validation, access pathing, progress, completion,
// and occupancy rebuilds for FE Next construction.
// Exposed as window.FE_NEXT_CONSTRUCTION.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;
  var MOVEMENT = window.FE_NEXT_MOVEMENT;
  var PATHFINDING = window.FE_NEXT_PATHFINDING;
  var OCCUPANCY = window.FE_NEXT_OCCUPANCY;

  function issueBuildCommand(state, builderId, buildingType) {
    var builder = MOVEMENT.findUnit(state, builderId);
    if (!builder || builder.type !== 'builder' || builder.buildState !== 'idle') {
      return { ok: false, reason: 'builder_unavailable' };
    }

    var plan = findBuildPlan(state, builder, buildingType);
    if (!plan.ok) {
      markBlocked(state, Math.round(builder.tx), Math.round(builder.ty));
      return plan;
    }

    state.resources.energy = Math.max(0, state.resources.energy - plan.cost.energy);

    var site = createConstructionSite(state, plan);
    state.buildings.push(site);
    rebuildOccupancy(state);

    builder.buildState = 'moving_to_site';
    builder.buildOrder = {
      buildingId: site.id,
      buildingType: buildingType,
      accessTile: plan.accessTile
    };

    MOVEMENT.issueMoveCommand(state, builder.id, plan.accessTile.tx, plan.accessTile.ty);

    return {
      ok: true,
      tx: plan.tx,
      ty: plan.ty,
      accessTile: plan.accessTile,
      cost: plan.cost,
      buildingId: site.id
    };
  }

  function findBuildPlan(state, builder, buildingType) {
    var spec = getBuildingSpec(buildingType);
    if (!spec) return { ok: false, reason: 'unknown_building' };
    if ((state.resources.energy || 0) < spec.cost.energy) return { ok: false, reason: 'not_enough_energy' };

    var startX = Math.round(builder.tx);
    var startY = Math.round(builder.ty);
    var lastReason = 'no_valid_footprint';

    for (var radius = 1; radius <= C.BUILD_SEARCH_RADIUS; radius++) {
      for (var y = startY - radius; y <= startY + radius; y++) {
        for (var x = startX - radius; x <= startX + radius; x++) {
          if (Math.max(Math.abs(x - startX), Math.abs(y - startY)) !== radius) continue;
          var result = validateCandidate(state, builder, x, y, spec);
          if (result.ok) {
            return {
              ok: true,
              tx: x,
              ty: y,
              accessTile: result.accessTile,
              cost: spec.cost
            };
          }
          lastReason = result.reason || lastReason;
        }
      }
    }

    return { ok: false, reason: lastReason };
  }

  function updateConstruction(state, dt) {
    if (!state.units) return;
    for (var i = 0; i < state.units.length; i++) {
      var builder = state.units[i];
      if (builder.type !== 'builder' || !builder.buildOrder) continue;
      updateBuilderConstruction(state, builder, dt);
    }
  }

  function updateBuilderConstruction(state, builder, dt) {
    var site = findBuildingById(state, builder.buildOrder.buildingId);
    if (!site || site.complete) {
      clearBuilder(builder);
      return;
    }

    if (builder.buildState === 'moving_to_site') {
      if (!builder.moving && isAtAccessTile(builder, builder.buildOrder.accessTile)) {
        builder.buildState = 'constructing';
      }
      return;
    }

    if (builder.buildState !== 'constructing') return;

    site.progress = Math.min(1, (site.progress || 0) + dt / site.buildTime);
    if (site.progress >= 1) {
      completeSite(state, site);
      clearBuilder(builder);
      rebuildOccupancy(state);
    }
  }

  function validateCandidate(state, builder, tx, ty, spec) {
    var footprint = validateFootprint(state, tx, ty, spec.size);
    if (!footprint.ok) return footprint;

    var accessTile = findAccessTile(state, builder, tx, ty, spec.size);
    if (!accessTile) return { ok: false, reason: 'no_access_path' };

    return { ok: true, accessTile: accessTile };
  }

  function validateFootprint(state, tx, ty, size) {
    if (tx < 0 || ty < 0 || tx + size > state.mapW || ty + size > state.mapH) {
      return { ok: false, reason: 'out_of_bounds' };
    }

    for (var y = ty; y < ty + size; y++) {
      for (var x = tx; x < tx + size; x++) {
        var terrain = state.terrain[y] && state.terrain[y][x];
        if ((C.BLOCKED_TERRAIN || []).indexOf(terrain) !== -1) return { ok: false, reason: 'blocked_terrain' };
        if (hasBuildingAt(state, x, y)) return { ok: false, reason: 'occupied' };
        if (hasUnitAt(state, x, y)) return { ok: false, reason: 'unit_overlap' };
        if (hasResourceNodeAt(state, x, y)) return { ok: false, reason: 'resource_overlap' };
      }
    }

    return { ok: true };
  }

  function findAccessTile(state, builder, tx, ty, size) {
    var candidates = [];
    for (var y = ty - 1; y <= ty + size; y++) {
      for (var x = tx - 1; x <= tx + size; x++) {
        var insideX = x >= tx && x < tx + size;
        var insideY = y >= ty && y < ty + size;
        if (insideX && insideY) continue;
        if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) continue;
        if (state.occupancyGrid && OCCUPANCY.isTileBlocked(state.occupancyGrid, x, y)) continue;
        if (hasUnitAt(state, x, y)) continue;
        candidates.push({ tx: x, ty: y, d: Math.abs(builder.tx - x) + Math.abs(builder.ty - y) });
      }
    }

    candidates.sort(function (a, b) { return a.d - b.d; });
    for (var i = 0; i < candidates.length; i++) {
      if (hasPathTo(state, builder, candidates[i].tx, candidates[i].ty)) {
        return { tx: candidates[i].tx, ty: candidates[i].ty };
      }
    }
    return null;
  }

  function hasPathTo(state, builder, tx, ty) {
    if (!state.occupancyGrid) return true;
    var sx = Math.round(builder.tx);
    var sy = Math.round(builder.ty);
    return !!PATHFINDING.findPath(state.occupancyGrid, sx, sy, tx, ty);
  }

  function getBuildingSpec(buildingType) {
    if (buildingType !== 'separator') return null;
    return {
      type: 'separator',
      size: C.SEPARATOR_SIZE,
      cost: { energy: C.SEPARATOR_BUILD_ENERGY_COST },
      buildTime: C.SEPARATOR_BUILD_TIME
    };
  }

  function createConstructionSite(state, plan) {
    return {
      id: 'separator_site_' + state.tickCount + '_' + state.buildings.length,
      type: 'separator',
      owner: 'player',
      tx: plan.tx,
      ty: plan.ty,
      size: C.SEPARATOR_SIZE,
      hp: 300,
      maxHp: 300,
      constructionState: 'constructing',
      complete: false,
      progress: 0,
      buildTime: C.SEPARATOR_BUILD_TIME,
      separatorState: 'constructing',
      cycleProgress: 0,
      cyclesCompleted: 0
    };
  }

  function completeSite(state, site) {
    site.constructionState = 'completed';
    site.complete = true;
    site.progress = 1;
    site.separatorState = 'idle';
    site.cycleProgress = site.cycleProgress || 0;
    site.cyclesCompleted = site.cyclesCompleted || 0;
  }

  function rebuildOccupancy(state) {
    state.occupancyGrid = OCCUPANCY.buildOccupancyGrid(state);
  }

  function hasBuildingAt(state, tx, ty) {
    for (var i = 0; i < state.buildings.length; i++) {
      var b = state.buildings[i];
      var s = b.size || 1;
      if (tx >= b.tx && tx < b.tx + s && ty >= b.ty && ty < b.ty + s) return true;
    }
    return false;
  }

  function hasResourceNodeAt(state, tx, ty) {
    if (!state.resourceNodes) return false;
    for (var i = 0; i < state.resourceNodes.length; i++) {
      var n = state.resourceNodes[i];
      if (Math.floor(n.tx) === tx && Math.floor(n.ty) === ty) return true;
    }
    return false;
  }

  function hasUnitAt(state, tx, ty) {
    if (!state.units) return false;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (Math.round(u.tx) === tx && Math.round(u.ty) === ty) return true;
    }
    return false;
  }

  function findBuildingById(state, id) {
    for (var i = 0; i < state.buildings.length; i++) {
      if (state.buildings[i].id === id) return state.buildings[i];
    }
    return null;
  }

  function isAtAccessTile(builder, accessTile) {
    return Math.round(builder.tx) === accessTile.tx && Math.round(builder.ty) === accessTile.ty;
  }

  function clearBuilder(builder) {
    builder.buildState = 'idle';
    builder.buildOrder = null;
  }

  function markBlocked(state, tx, ty) {
    state.moveMarkers.push({ tx: tx, ty: ty, life: 0.8, blocked: true });
  }

  window.FE_NEXT_CONSTRUCTION = {
    issueBuildCommand: issueBuildCommand,
    findBuildPlan: findBuildPlan,
    updateConstruction: updateConstruction
  };
})();
