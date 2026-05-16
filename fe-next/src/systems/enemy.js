// FEN-07: Enemy spawn runtime — scripted tank spawning.
// Owns updateEnemy, spawnEnemyTank, countEnemyTanks.
// No AI planner, no enemy economy, no enemy factory/construction.
// Exposed as window.FE_NEXT_ENEMY.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;
  var STATE = window.FE_NEXT_STATE;
  var COMBAT = window.FE_NEXT_COMBAT;
  var MOVEMENT = window.FE_NEXT_MOVEMENT;
  var OCCUPANCY = window.FE_NEXT_OCCUPANCY;

  /**
   * Count enemy light_tank units currently alive.
   * @param {object} state
   * @returns {number}
   */
  function countEnemyTanks(state) {
    if (!state.units) return 0;
    var count = 0;
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].owner === 'enemy' && state.units[i].type === 'light_tank') count++;
    }
    return count;
  }

  /**
   * Spawn an enemy light_tank adjacent to enemy HQ.
   * Assigns attack command toward player HQ.
   * @param {object} state
   * @returns {{ok: boolean, unitId?: string}}
   */
  function spawnEnemyTank(state) {
    var enemyHq = STATE.findBuildingById(state, 'enemy_hq');
    if (!enemyHq || enemyHq.destroyed) return { ok: false };

    // Find passable spawn tile adjacent to enemy HQ
    var spawnTile = findSpawnTile(state, enemyHq);
    if (!spawnTile) return { ok: false };

    var id = 'enemy_tank_' + (state.enemy.tanksSpawned + 1);
    var unit = {
      id: id,
      type: 'light_tank',
      owner: 'enemy',
      tx: spawnTile.tx,
      ty: spawnTile.ty,
      hp: C.LIGHT_TANK_HP,
      maxHp: C.LIGHT_TANK_HP,
      selected: false,
      moving: false,
      moveTarget: null,
      moveProgress: 0,
      moveFrom: null,
      path: null,
      pathIndex: 0,
      speed: C.LIGHT_TANK_SPEED,
      damage: C.LIGHT_TANK_DAMAGE,
      range: C.LIGHT_TANK_RANGE,
      attackCooldownMax: C.LIGHT_TANK_ATTACK_COOLDOWN,
      attackCooldown: 0,
      attackTarget: null,
      attackState: 'idle'
    };

    state.units.push(unit);
    state.enemy.tanksSpawned++;

    // Assign attack command toward player HQ
    var playerHq = STATE.findBuildingById(state, 'player_hq');
    if (playerHq && !playerHq.destroyed) {
      COMBAT.issueAttackCommand(state, unit.id, playerHq.id, 'building');
    }

    return { ok: true, unitId: id };
  }

  /**
   * Find a passable tile adjacent to a building for spawning.
   * @param {object} state
   * @param {object} building
   * @returns {{tx: number, ty: number}|null}
   */
  function findSpawnTile(state, building) {
    var s = building.size || 1;
    var candidates = [];
    for (var y = building.ty - 1; y <= building.ty + s; y++) {
      for (var x = building.tx - 1; x <= building.tx + s; x++) {
        var insideX = x >= building.tx && x < building.tx + s;
        var insideY = y >= building.ty && y < building.ty + s;
        if (insideX && insideY) continue;
        if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) continue;
        if (state.occupancyGrid && OCCUPANCY.isTileBlocked(state.occupancyGrid, x, y)) continue;
        candidates.push({ tx: x, ty: y, d: Math.abs(building.tx - x) + Math.abs(building.ty - y) });
      }
    }
    candidates.sort(function (a, b) { return a.d - b.d; });
    return candidates[0] || null;
  }

  /**
   * Update enemy spawn timer and spawn tanks when ready.
   * Early-returns if gameResult is set.
   * @param {object} state
   * @param {number} dt - Delta time in seconds
   */
  function updateEnemy(state, dt) {
    if (state.gameResult) return;
    if (!state.enemy) return;

    var tankCount = countEnemyTanks(state);
    if (tankCount >= C.ENEMY_MAX_TANKS) return;

    state.enemy.spawnTimer -= dt;
    if (state.enemy.spawnTimer <= 0) {
      var result = spawnEnemyTank(state);
      if (result.ok) {
        state.enemy.spawnTimer = C.ENEMY_SPAWN_INTERVAL;
      }
    }
  }

  window.FE_NEXT_ENEMY = {
    updateEnemy: updateEnemy,
    spawnEnemyTank: spawnEnemyTank,
    countEnemyTanks: countEnemyTanks
  };
})();
