// FEN-06+FEN-07: Combat runtime — attack commands, range checks, damage, death.
// Owns issueAttackCommand, updateCombat, findEnemyAtTile, and helpers.
// FEN-07 extends: unit-vs-unit combat, unit death/removal, same-owner rejection.
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
   * Find an enemy unit at the given tile position (FEN-07).
   * @param {object} state
   * @param {number} tx
   * @param {number} ty
   * @returns {object|null}
   */
  function findEnemyUnitAtTile(state, tx, ty) {
    if (!state.units) return null;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.owner !== 'enemy') continue;
      var d = Math.abs(u.tx - tx) + Math.abs(u.ty - ty);
      if (d < 1.0) return u;
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
   * Check if a unit is within attack range of a target.
   * Supports both building and unit targets (FEN-07).
   * @param {object} unit
   * @param {object} target - building {tx, ty, size} or unit {tx, ty}
   * @param {string} kind - 'building' or 'unit'
   * @returns {boolean}
   */
  function isInRange(unit, target, kind) {
    if (kind === 'unit') {
      var dx = Math.abs(Math.round(unit.tx) - Math.round(target.tx));
      var dy = Math.abs(Math.round(unit.ty) - Math.round(target.ty));
      return (dx + dy) <= unit.range;
    }
    var dist = distanceToBuilding(Math.round(unit.tx), Math.round(unit.ty), target);
    return dist <= unit.range;
  }

  /**
   * Find the nearest passable tile that brings the unit within range of the target.
   * Supports both building and unit targets (FEN-07).
   * @param {object} state
   * @param {object} unit
   * @param {object} target
   * @param {string} kind - 'building' or 'unit'
   * @returns {{tx: number, ty: number}|null}
   */
  function findApproachTile(state, unit, target, kind) {
    var range = unit.range || C.LIGHT_TANK_RANGE;
    var candidates = [];

    if (kind === 'unit') {
      // For unit targets, search tiles within range of the target unit
      var ttx = Math.round(target.tx);
      var tty = Math.round(target.ty);
      for (var y = tty - range; y <= tty + range; y++) {
        for (var x = ttx - range; x <= ttx + range; x++) {
          if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) continue;
          if (state.occupancyGrid && OCCUPANCY.isTileBlocked(state.occupancyGrid, x, y)) continue;
          var d = Math.abs(x - ttx) + Math.abs(y - tty);
          if (d <= range && d > 0) {
            candidates.push({ tx: x, ty: y, d: Math.abs(unit.tx - x) + Math.abs(unit.ty - y) });
          }
        }
      }
    } else {
      var s = target.size || 1;
      for (var y2 = target.ty - range; y2 <= target.ty + s - 1 + range; y2++) {
        for (var x2 = target.tx - range; x2 <= target.tx + s - 1 + range; x2++) {
          if (x2 < 0 || y2 < 0 || x2 >= state.mapW || y2 >= state.mapH) continue;
          if (state.occupancyGrid && OCCUPANCY.isTileBlocked(state.occupancyGrid, x2, y2)) continue;
          var dist = distanceToBuilding(x2, y2, target);
          if (dist <= range && dist >= 0) {
            candidates.push({ tx: x2, ty: y2, d: Math.abs(unit.tx - x2) + Math.abs(unit.ty - y2) });
          }
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
   * Supports both building and unit targets (FEN-07).
   * @param {object} state
   * @param {object} targetRef - { id, kind }
   * @returns {object|null}
   */
  function getTargetByRef(state, targetRef) {
    if (!targetRef) return null;
    if (targetRef.kind === 'building') {
      return STATE.findBuildingById(state, targetRef.id);
    }
    if (targetRef.kind === 'unit') {
      return STATE.findUnitById(state, targetRef.id);
    }
    return null;
  }

  /**
   * Issue an attack command to a unit.
   * FEN-07: rejects same-owner targets, supports unit-vs-unit.
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
    } else if (targetKind === 'unit') {
      target = STATE.findUnitById(state, targetId);
    }
    if (!target) return { ok: false, reason: 'target_not_found' };

    // FEN-07: reject same-owner targets
    if (target.owner === unit.owner) return { ok: false, reason: 'not_enemy' };

    if (targetKind === 'building' && target.destroyed) return { ok: false, reason: 'target_already_destroyed' };

    unit.attackTarget = { id: targetId, kind: targetKind };

    if (isInRange(unit, target, targetKind)) {
      unit.attackState = 'attacking';
      unit.moving = false;
      unit.moveTarget = null;
      unit.moveFrom = null;
      unit.path = null;
      unit.pathIndex = 0;
    } else {
      var approachTile = findApproachTile(state, unit, target, targetKind);
      if (approachTile) {
        unit.attackState = 'moving_to_attack';
        MOVEMENT.issueMoveCommand(state, unitId, approachTile.tx, approachTile.ty);
      } else {
        unit.attackState = 'moving_to_attack';
        var centerX, centerY;
        if (targetKind === 'unit') {
          centerX = Math.round(target.tx);
          centerY = Math.round(target.ty);
        } else {
          centerX = target.tx + (target.size || 1) / 2;
          centerY = target.ty + (target.size || 1) / 2;
        }
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
      updateUnitCombat(state, unit, dt, i);
    }
  }

  function updateUnitCombat(state, unit, dt, unitIndex) {
    var targetKind = unit.attackTarget.kind;
    var target = getTargetByRef(state, unit.attackTarget);

    // Target gone or destroyed (building) or removed (unit)
    if (!target) {
      clearAttack(unit);
      return;
    }
    if (targetKind === 'building' && target.destroyed) {
      clearAttack(unit);
      rebuildOccupancy(state);
      return;
    }

    if (unit.attackState === 'moving_to_attack') {
      if (!unit.moving) {
        if (isInRange(unit, target, targetKind)) {
          unit.attackState = 'attacking';
        } else {
          var approachTile = findApproachTile(state, unit, target, targetKind);
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
      if (!isInRange(unit, target, targetKind)) {
        var approachTile2 = findApproachTile(state, unit, target, targetKind);
        if (approachTile2) {
          unit.attackState = 'moving_to_attack';
          MOVEMENT.issueMoveCommand(state, unit.id, approachTile2.tx, approachTile2.ty);
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
          if (targetKind === 'building') {
            target.hp = 0;
            target.destroyed = true;
            clearAttack(unit);
            rebuildOccupancy(state);
          } else if (targetKind === 'unit') {
            // FEN-07: remove dead unit from state.units
            target.hp = 0;
            clearAttack(unit);
            removeDeadUnit(state, target.id);
          }
        }
      }
      return;
    }
  }

  /**
   * Remove a dead unit from state.units and clear any attack refs to it (FEN-07).
   * @param {object} state
   * @param {string} deadId
   */
  function removeDeadUnit(state, deadId) {
    // Clear attack refs pointing to the dead unit
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.attackTarget && u.attackTarget.id === deadId && u.attackTarget.kind === 'unit') {
        clearAttack(u);
      }
    }
    // Remove the dead unit
    for (var j = state.units.length - 1; j >= 0; j--) {
      if (state.units[j].id === deadId) {
        state.units.splice(j, 1);
        break;
      }
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
    findEnemyUnitAtTile: findEnemyUnitAtTile,
    getTargetByRef: getTargetByRef,
    distanceToBuilding: distanceToBuilding,
    isInRange: isInRange
  };
})();
