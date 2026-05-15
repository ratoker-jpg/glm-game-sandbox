// FEN-05: Units factory production runtime.
// Owns queueing, production progress, spawn tile selection, and produced unit creation.
// Exposed as window.FE_NEXT_PRODUCTION.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;
  var STATE = window.FE_NEXT_STATE;
  var OCCUPANCY = window.FE_NEXT_OCCUPANCY;

  function queueUnit(state, factoryId, unitType) {
    var factory = STATE.findBuildingById(state, factoryId);
    var spec = getUnitSpec(unitType);
    if (!factory || factory.type !== 'units_factory') return { ok: false, reason: 'factory_not_found' };
    if (factory.complete !== true || factory.constructionState !== 'completed') return { ok: false, reason: 'factory_incomplete' };
    if (!spec) return { ok: false, reason: 'unknown_unit' };

    factory.productionQueue = factory.productionQueue || [];
    if (factory.productionQueue.length >= C.PRODUCTION_QUEUE_MAX) return { ok: false, reason: 'queue_full' };
    if ((state.resources.cyanEl || 0) < spec.cost.cyanEl) return { ok: false, reason: 'not_enough_cyanEl' };

    state.resources.cyanEl = Math.max(0, state.resources.cyanEl - spec.cost.cyanEl);
    factory.productionQueue.push({ unitType: unitType, progress: 0 });
    if (!factory.producing) factory.producing = unitType;
    return { ok: true };
  }

  function updateProduction(state, dt) {
    if (!state.buildings) return;
    for (var i = 0; i < state.buildings.length; i++) {
      var factory = state.buildings[i];
      if (factory.type !== 'units_factory' || factory.complete !== true) continue;
      updateFactory(state, factory, dt);
    }
  }

  function updateFactory(state, factory, dt) {
    factory.productionQueue = factory.productionQueue || [];
    if (factory.productionQueue.length === 0) {
      factory.producing = null;
      factory.productionProgress = 0;
      return;
    }

    var item = factory.productionQueue[0];
    var spec = getUnitSpec(item.unitType);
    if (!spec) {
      factory.producing = null;
      return;
    }

    factory.producing = item.unitType;
    item.progress = Math.min(1, (item.progress || 0) + dt / spec.productionTime);
    factory.productionProgress = item.progress;

    if (item.progress < 1) return;

    var spawnTile = findSpawnTile(state, factory);
    if (!spawnTile) return;

    state.units.push(createProducedUnit(state, item.unitType, spawnTile.tx, spawnTile.ty));
    factory.productionQueue.shift();
    factory.productionProgress = 0;
    factory.producing = factory.productionQueue[0] ? factory.productionQueue[0].unitType : null;
  }

  function findSpawnTile(state, factory) {
    var candidates = [];
    var s = factory.size || 1;
    for (var y = factory.ty - 1; y <= factory.ty + s; y++) {
      for (var x = factory.tx - 1; x <= factory.tx + s; x++) {
        var insideX = x >= factory.tx && x < factory.tx + s;
        var insideY = y >= factory.ty && y < factory.ty + s;
        if (insideX && insideY) continue;
        if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) continue;
        if (state.occupancyGrid && OCCUPANCY.isTileBlocked(state.occupancyGrid, x, y)) continue;
        if (hasUnitAt(state, x, y)) continue;
        candidates.push({ tx: x, ty: y, d: Math.abs(factory.tx - x) + Math.abs(factory.ty - y) });
      }
    }
    candidates.sort(function (a, b) { return a.d - b.d; });
    return candidates[0] || null;
  }

  function createProducedUnit(state, unitType, tx, ty) {
    var id = unitType + '_' + (state.units.length + 1) + '_' + state.tickCount;
    var base = {
      id: id,
      type: unitType,
      owner: 'player',
      tx: tx,
      ty: ty,
      hp: C.UNIT_HP,
      maxHp: C.UNIT_HP,
      selected: false,
      moving: false,
      moveTarget: null,
      moveProgress: 0,
      moveFrom: null,
      path: null,
      pathIndex: 0
    };

    if (unitType === 'harvester') {
      base.speed = C.HARVESTER_SPEED;
      base.cargo = 0;
      base.maxCargo = C.HARVESTER_MAX_CARGO;
      base.harvestState = 'idle';
      base.harvestTarget = null;
      base.gatherTimer = 0;
    } else if (unitType === 'builder') {
      base.speed = C.BUILDER_SPEED;
      base.buildState = 'idle';
      base.buildOrder = null;
    } else if (unitType === 'light_tank') {
      base.hp = C.LIGHT_TANK_HP;
      base.maxHp = C.LIGHT_TANK_HP;
      base.speed = C.LIGHT_TANK_SPEED;
      base.damage = C.LIGHT_TANK_DAMAGE;
      base.range = C.LIGHT_TANK_RANGE;
      base.attackCooldownMax = C.LIGHT_TANK_ATTACK_COOLDOWN;
      base.attackCooldown = 0;
      base.attackTarget = null;
      base.attackState = 'idle';
    }

    return base;
  }

  function getUnitSpec(unitType) {
    if (unitType === 'harvester') {
      return {
        cost: { cyanEl: C.PRODUCE_HARVESTER_CYAN_COST },
        productionTime: C.PRODUCE_HARVESTER_TIME
      };
    }
    if (unitType === 'builder') {
      return {
        cost: { cyanEl: C.PRODUCE_BUILDER_CYAN_COST },
        productionTime: C.PRODUCE_BUILDER_TIME
      };
    }
    if (unitType === 'light_tank') {
      return {
        cost: { cyanEl: C.PRODUCE_LIGHT_TANK_CYAN_COST },
        productionTime: C.PRODUCE_LIGHT_TANK_TIME
      };
    }
    return null;
  }

  function hasUnitAt(state, tx, ty) {
    if (!state.units) return false;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (Math.round(u.tx) === tx && Math.round(u.ty) === ty) return true;
    }
    return false;
  }

  window.FE_NEXT_PRODUCTION = {
    queueUnit: queueUnit,
    updateProduction: updateProduction,
    findSpawnTile: findSpawnTile
  };
})();
