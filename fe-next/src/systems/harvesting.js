// FEN-03: Harvester command and resource node state machine.
// Uses FEN-02 movement/pathfinding; state.js remains a factory only.
// Exposed as window.FE_NEXT_HARVESTING.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;
  var STATE = window.FE_NEXT_STATE;
  var MOVEMENT = window.FE_NEXT_MOVEMENT;
  var PATHFINDING = window.FE_NEXT_PATHFINDING;
  var OCCUPANCY = window.FE_NEXT_OCCUPANCY;

  function issueHarvestCommand(state, unitId, nodeId) {
    var unit = MOVEMENT.findUnit(state, unitId);
    var node = STATE.findResourceNodeById(state, nodeId);
    if (!unit || unit.type !== 'harvester' || !node || node.depleted) return false;

    unit.harvestTarget = node.id;
    unit.gatherTimer = 0;
    return sendToNode(state, unit, node);
  }

  function updateHarvesting(state, dt) {
    if (!state.units) return;
    for (var i = 0; i < state.units.length; i++) {
      var unit = state.units[i];
      if (unit.type !== 'harvester') continue;
      updateHarvester(state, unit, dt);
    }
  }

  function updateHarvester(state, unit, dt) {
    var node = unit.harvestTarget ? STATE.findResourceNodeById(state, unit.harvestTarget) : null;

    if (unit.harvestState === 'moving_to_node') {
      if (!unit.moving) {
        if (node && !node.depleted && isNearTile(unit, node.tx, node.ty, 0.25)) {
          unit.harvestState = 'gathering';
          unit.gatherTimer = 0;
        } else {
          setIdle(unit);
        }
      }
      return;
    }

    if (unit.harvestState === 'gathering') {
      gatherFromNode(state, unit, node, dt);
      return;
    }

    if (unit.harvestState === 'moving_to_hq') {
      if (!unit.moving) {
        if (isNearDropoff(state, unit)) {
          unit.harvestState = 'dropping_off';
        } else {
          setIdle(unit);
        }
      }
      return;
    }

    if (unit.harvestState === 'dropping_off') {
      dropOffCargo(state, unit);
      if (node && !node.depleted && node.remaining > 0) {
        sendToNode(state, unit, node);
      } else {
        setIdle(unit);
      }
    }
  }

  function gatherFromNode(state, unit, node, dt) {
    if (!node || node.depleted) {
      if (unit.cargo > 0) sendToDropoff(state, unit);
      else setIdle(unit);
      return;
    }

    unit.gatherTimer += dt;
    while (unit.gatherTimer >= C.HARVESTER_GATHER_TIME && unit.cargo < unit.maxCargo && node.remaining > 0) {
      unit.gatherTimer -= C.HARVESTER_GATHER_TIME;
      unit.cargo = Math.min(unit.maxCargo, unit.cargo + node.yield);
      node.remaining = Math.max(0, node.remaining - 1);
      node.depleted = node.remaining <= 0;
    }

    if (unit.cargo >= unit.maxCargo || node.depleted) {
      if (unit.cargo > 0) sendToDropoff(state, unit);
      else setIdle(unit);
    }
  }

  function dropOffCargo(state, unit) {
    var caps = state.resources.caps || {};
    var cap = typeof caps.minerals === 'number' ? caps.minerals : C.MINERALS_CAP;
    state.resources.minerals = Math.min(cap, state.resources.minerals + Math.max(0, unit.cargo || 0));
    unit.cargo = 0;
    unit.gatherTimer = 0;
  }

  function sendToNode(state, unit, node) {
    unit.harvestState = 'moving_to_node';
    unit.gatherTimer = 0;
    if (!hasPath(state, unit, node.tx, node.ty)) {
      markBlocked(state, node.tx, node.ty);
      setIdle(unit);
      return false;
    }
    MOVEMENT.issueMoveCommand(state, unit.id, node.tx, node.ty);
    return true;
  }

  function sendToDropoff(state, unit) {
    var hq = STATE.findBuildingByType(state, 'hq');
    var target = hq ? findNearestDropoffTile(state, unit, hq) : null;
    if (!target) {
      setIdle(unit);
      return false;
    }
    unit.harvestState = 'moving_to_hq';
    if (!hasPath(state, unit, target.tx, target.ty)) {
      markBlocked(state, target.tx, target.ty);
      setIdle(unit);
      return false;
    }
    MOVEMENT.issueMoveCommand(state, unit.id, target.tx, target.ty);
    return true;
  }

  function hasPath(state, unit, tx, ty) {
    if (!state.occupancyGrid) return true;
    if (OCCUPANCY.isTileBlocked(state.occupancyGrid, tx, ty)) return false;
    var startX = Math.round(unit.tx);
    var startY = Math.round(unit.ty);
    var path = PATHFINDING.findPath(state.occupancyGrid, startX, startY, tx, ty);
    return !!path;
  }

  function findNearestDropoffTile(state, unit, building) {
    var candidates = [];
    var s = building.size || 1;
    for (var y = building.ty - 1; y <= building.ty + s; y++) {
      for (var x = building.tx - 1; x <= building.tx + s; x++) {
        var outsideX = x < building.tx || x >= building.tx + s;
        var outsideY = y < building.ty || y >= building.ty + s;
        if (!outsideX && !outsideY) continue;
        if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) continue;
        if (state.occupancyGrid && OCCUPANCY.isTileBlocked(state.occupancyGrid, x, y)) continue;
        candidates.push({ tx: x, ty: y, d: Math.abs(unit.tx - x) + Math.abs(unit.ty - y) });
      }
    }
    candidates.sort(function (a, b) { return a.d - b.d; });
    return candidates[0] || null;
  }

  function isNearDropoff(state, unit) {
    var hq = STATE.findBuildingByType(state, 'hq');
    if (!hq) return false;
    var cx = hq.tx + (hq.size || 1) / 2;
    var cy = hq.ty + (hq.size || 1) / 2;
    return Math.abs(unit.tx - cx) + Math.abs(unit.ty - cy) <= 2.2;
  }

  function isNearTile(unit, tx, ty, radius) {
    return Math.abs(unit.tx - tx) <= radius && Math.abs(unit.ty - ty) <= radius;
  }

  function markBlocked(state, tx, ty) {
    state.moveMarkers.push({ tx: tx, ty: ty, life: 0.8, blocked: true });
  }

  function setIdle(unit) {
    unit.harvestState = 'idle';
    unit.gatherTimer = 0;
    unit.moving = false;
    unit.moveTarget = null;
    unit.moveFrom = null;
    unit.path = null;
    unit.pathIndex = 0;
  }

  window.FE_NEXT_HARVESTING = {
    issueHarvestCommand: issueHarvestCommand,
    updateHarvesting: updateHarvesting
  };
})();
