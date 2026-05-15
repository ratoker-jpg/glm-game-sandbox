// FEN-06: Combat runtime — attack commands, range checks, damage, death.
// Owns issueAttackCommand, updateCombat, findEnemyAtTile, and helpers.
// No combat runtime in production.js, movement.js, input.js, or main.js.
// Exposed as window.FE_NEXT_COMBAT.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;
  var STATE = window.FE_NEXT_STATE;
  var MOVEMENT = window.FE_NEXT_MOVEMENT;
  var PATHFINDING = window.FE_NEXT_PATHFINDING;
  var OCCUPANCY = window.FE_NEXT_OCCUPANCY;

  /**
   * Find an enemy entity at the given tile.
   * Checks buildings with owner='enemy' that are not destroyed.
   * @param {object} state
   * @param {number} tx
   * @param {number} ty
   * @returns {object|null} Enemy entity or null
   */
  function findEnemyAtTile(state, tx, ty) {
    if (!state.buildings) return null;
    for (var i = 0; i < state.buildings.length; i++) {
      var b = state.buildings[i];
      if (b.owner !== 'enemy' || b.destroyed) continue;
      var s = b.size || 1;
      if (tx >= b.tx && tx < b.tx + s && ty >= b.ty && ty < b.ty + s) return b;
    }
    return null;
  }

  /**
   * Calculate Manhattan distance from a unit tile to a building footprint edge.
   * Returns 0 if unit is inside or adjacent to the footprint.
   * @param {number} ux - Unit tile X
   * @param {number} uy - Unit tile Y
   * @param {object} building - { tx, ty, size }
   * @returns {number} Manhattan distance (0 = touching/inside)
   */
  function distanceToBuilding(ux, uy, building) {
    var s = building.size || 1;
    var left = building.tx;
    var top = building.ty;
    var right = building.tx + s - 1;
    var bottom = building.ty + s - 1;
    var dx = ux < left ? left - ux : (ux > right ? ux - right : 0);
    var dy = uy < top ? top - uy : (uy > bottom ? uy - bottom : 0);
    return dx + dy;
  }

  /**
   * Check if a unit is within attack range of a target building.
   * @param {object} unit
   * @param {object} target - building with tx, ty, size
   * @returns {boolean}
   */
  function isInRange(unit, target) {
    var dist = distanceToBuilding(Math.round(unit.tx), Math.round(unit.ty), target);
    return dist <= unit.range;
  }

  /**
   * Find the nearest passable tile that brings the unit within range of the target.
   * @param {object} state
   * @param {object} unit
   * @param {object} target
   * @returns {{tx: number, ty: number}|null}
   */
  function findApproachTile(state, unit, target) {
    var s = target.size || 1;
    var range = unit.range || C.LIGHT_TANK_RANGE;
    var candidates = [];

    for (var y = target.ty - range; y <= target.ty + s - 1 + range; y++) {
      for (var x = target.tx - range; x <= target.tx + s - 1 + range; x++) {
        if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) continue;
        if (state.occupancyGrid && OCCUPANCY.isTileBlocked(state.occupancyGrid, x, y)) continue;
        var dist = distanceToBuilding(x, y, target);
        if (dist <= range && dist >= 0) {
          candidates.push({ tx: x, ty: y, d: Math.abs(unit.tx - x) + Math.abs(unit.ty - y) });
        }
      }
    }

    candidates.sort(function (a, b) { return a.d - b.d; });

    for (var i = 0; i < candidates.length; i++) {
      var startX = Math.round(unit.tx);
      var startY = Math.round(unit.ty);
      if (startX === candidates[i].tx && startY === candidates[i].ty) {
        return candidates[i];
      }
      if (state.occupancyGrid) {
        var path = PATHFINDING.findPath(state.occupancyGrid, startX, startY, candidates[i].tx, candidates[i].ty);
        if (path) return candidates[i];
      } else {
        return candidates[i];
      }
    }
    return null;
  }

  /**
   * Get a target entity by its reference object { id, kind }.
   * @param {object} state
   * @param {object} targetRef - { id, kind }
   * @returns {object|null}
   */
  function getTargetByRef(state, targetRef) {
    if (!targetRef) return null;
    if (targetRef.kind === 'building') {
      return STATE.findBuildingById(state, targetRef.id);
    }
    return null;
  }

  /**
   * Issue an attack command to a unit.
   * @param {object} state
   * @param {string} unitId
   * @param {string} targetId
   * @param {string} targetKind - 'building' or 'unit'
   * @returns {{ok: boolean, reason?: string}}
   */
  function issueAttackCommand(state, unitId, targetId, targetKind) {
    var unit = MOVEMENT.findUnit(state, unitId);
    if (!unit) return { ok: false, reason: 'unit_not_found' };
    if (unit.type !== 'light_tank') return { ok: false, reason: 'unit_cannot_attack' };

    var target = null;
    if (targetKind === 'building') {
      target = STATE.findBuildingById(state, targetId);
    }
    if (!target) return { ok: false, reason: 'target_not_found' };
    if (target.owner !== 'enemy') return { ok: false, reason: 'not_enemy' };
    if (target.destroyed) return { ok: false, reason: 'target_already_destroyed' };

    unit.attackTarget = { id: targetId, kind: targetKind };

    if (isInRange(unit, target)) {
      unit.attackState = 'attacking';
      unit.moving = false;
      unit.moveTarget = null;
      unit.moveFrom = null;
      unit.path = null;
      unit.pathIndex = 0;
    } else {
      var approachTile = findApproachTile(state, unit, target);
      if (approachTile) {
        unit.attackState = 'moving_to_attack';
        MOVEMENT.issueMoveCommand(state, unitId, approachTile.tx, approachTile.ty);
      } else {
        unit.attackState = 'moving_to_attack';
        var centerX = target.tx + (target.size || 1) / 2;
        var centerY = target.ty + (target.size || 1) / 2;
        MOVEMENT.issueMoveCommand(state, unitId, Math.round(centerX), Math.round(centerY));
      }
    }

    return { ok: true };
  }

  /**
   * Update combat for all units with attack targets.
   * @param {object} state
   * @param {number} dt - Delta time in seconds
   */
  function updateCombat(state, dt) {
    if (!state.units) return;
    for (var i = 0; i < state.units.length; i++) {
      var unit = state.units[i];
      if (unit.type !== 'light_tank' || !unit.attackTarget) continue;
      updateUnitCombat(state, unit, dt);
    }
  }

  function updateUnitCombat(state, unit, dt) {
    var target = getTargetByRef(state, unit.attackTarget);

    if (!target || target.destroyed) {
      clearAttack(unit);
      rebuildOccupancy(state);
      return;
    }

    if (unit.attackState === 'moving_to_attack') {
      if (!unit.moving) {
        if (isInRange(unit, target)) {
          unit.attackState = 'attacking';
        } else {
          var approachTile = findApproachTile(state, unit, target);
          if (approachTile) {
            MOVEMENT.issueMoveCommand(state, unit.id, approachTile.tx, approachTile.ty);
          } else {
            clearAttack(unit);
          }
        }
      }
      return;
    }

    if (unit.attackState === 'attacking') {
      if (!isInRange(unit, target)) {
        var approachTile = findApproachTile(state, unit, target);
        if (approachTile) {
          unit.attackState = 'moving_to_attack';
          MOVEMENT.issueMoveCommand(state, unit.id, approachTile.tx, approachTile.ty);
        } else {
          clearAttack(unit);
        }
        return;
      }

      unit.attackCooldown = Math.max(0, (unit.attackCooldown || 0) - dt);

      if (unit.attackCooldown <= 0) {
        target.hp = Math.max(0, target.hp - (unit.damage || C.LIGHT_TANK_DAMAGE));
        unit.attackCooldown = unit.attackCooldownMax || C.LIGHT_TANK_ATTACK_COOLDOWN;

        if (target.hp <= 0) {
          target.hp = 0;
          target.destroyed = true;
          clearAttack(unit);
          rebuildOccupancy(state);
        }
      }
      return;
    }
  }

  function clearAttack(unit) {
    unit.attackTarget = null;
    unit.attackState = 'idle';
    unit.attackCooldown = 0;
  }

  function rebuildOccupancy(state) {
    state.occupancyGrid = OCCUPANCY.buildOccupancyGrid(state);
  }

  window.FE_NEXT_COMBAT = {
    issueAttackCommand: issueAttackCommand,
    updateCombat: updateCombat,
    findEnemyAtTile: findEnemyAtTile,
    getTargetByRef: getTargetByRef,
    distanceToBuilding: distanceToBuilding,
    isInRange: isInRange
  };
})();
