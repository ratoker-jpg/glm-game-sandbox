// FEN-02: Movement runtime — path-aware move command + path-following update.
// Separated from state.js per architecture decision: state.js = state only,
// movement.js = runtime orchestrator.
// Exposed as window.FE_NEXT_MOVEMENT.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;
  var COORDS = window.FE_NEXT_COORDS;
  var PATHFINDING = window.FE_NEXT_PATHFINDING;
  var OCCUPANCY = window.FE_NEXT_OCCUPANCY;

  /**
   * Find a unit by its ID.
   * @param {object} state
   * @param {string} id
   * @returns {object|null}
   */
  function findUnit(state, id) {
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].id === id) return state.units[i];
    }
    return null;
  }

  /**
   * Get the currently selected unit (if any).
   * @param {object} state
   * @returns {object|null}
   */
  function getSelectedUnit(state) {
    if (!state.selectedUnitId) return null;
    return findUnit(state, state.selectedUnitId);
  }

  /**
   * Issue a path-aware move command to a unit.
   * Uses BFS pathfinding on the occupancy grid.
   * Falls back to direct movement if no grid is available.
   * Adds a blocked marker if the destination is impassable.
   *
   * @param {object} state
   * @param {string} unitId
   * @param {number} targetTx
   * @param {number} targetTy
   */
  function issueMoveCommand(state, unitId, targetTx, targetTy) {
    var unit = findUnit(state, unitId);
    if (!unit) return;

    // Clamp target to map bounds
    targetTx = COORDS.clamp(targetTx, 0, state.mapW - 1);
    targetTy = COORDS.clamp(targetTy, 0, state.mapH - 1);

    // Current tile (floored)
    var startX = Math.round(unit.tx);
    var startY = Math.round(unit.ty);

    // If unit is currently moving, use its current position
    if (unit.moving && unit.moveFrom) {
      startX = Math.round(unit.moveFrom.tx);
      startY = Math.round(unit.moveFrom.ty);
    }

    // Check if target is blocked
    if (state.occupancyGrid && OCCUPANCY.isTileBlocked(state.occupancyGrid, targetTx, targetTy)) {
      // Show blocked marker
      state.moveMarkers.push({
        tx: targetTx,
        ty: targetTy,
        life: 0.8,
        blocked: true
      });
      return;
    }

    // Try pathfinding
    var path = null;
    if (state.occupancyGrid) {
      path = PATHFINDING.findPath(state.occupancyGrid, startX, startY, targetTx, targetTy);
    }

    if (path && path.length > 1) {
      // Path found — store it and start following
      unit.path = path;
      unit.pathIndex = 1;  // Skip start position
      unit.moving = true;
      unit.moveFrom = { tx: unit.tx, ty: unit.ty };
      // First waypoint is the next tile in the path
      var nextWaypoint = path[unit.pathIndex];
      unit.moveTarget = { tx: nextWaypoint.x, ty: nextWaypoint.y };
      unit.moveProgress = 0;
    } else if (path && path.length === 1) {
      // Already at target (path = [start])
      unit.tx = targetTx;
      unit.ty = targetTy;
      unit.moving = false;
      unit.path = null;
      unit.pathIndex = 0;
    } else {
      // No path found or no grid — direct move (FEN-01 fallback)
      unit.moving = true;
      unit.moveFrom = { tx: unit.tx, ty: unit.ty };
      unit.moveTarget = { tx: targetTx, ty: targetTy };
      unit.moveProgress = 0;
      unit.path = null;
      unit.pathIndex = 0;
    }

    // Add move marker (success)
    state.moveMarkers.push({
      tx: targetTx,
      ty: targetTy,
      life: 0.8,
      blocked: false
    });
  }

  /**
   * Update movement for all units — path-following with waypoint progression.
   * Each frame, units move toward their current waypoint (moveTarget).
   * When a waypoint is reached, advance to the next one in the path.
   *
   * @param {object} state
   * @param {number} dt - Delta time in seconds
   */
  function updateMovement(state, dt) {
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u.moving || !u.moveTarget || !u.moveFrom) continue;

      var dx = u.moveTarget.tx - u.moveFrom.tx;
      var dy = u.moveTarget.ty - u.moveFrom.ty;
      var pathLen = Math.hypot(dx, dy);

      if (pathLen < 0.01) {
        // Reached current waypoint
        advanceWaypoint(u);
        continue;
      }

      var speed = C.UNIT_SPEED;
      u.moveProgress += (speed * dt) / pathLen;

      if (u.moveProgress >= 1) {
        // Reached waypoint
        advanceWaypoint(u);
      } else {
        // Interpolate position
        u.tx = u.moveFrom.tx + dx * u.moveProgress;
        u.ty = u.moveFrom.ty + dy * u.moveProgress;
      }
    }
  }

  /**
   * Advance a unit to the next waypoint in its path.
   * If no more waypoints, unit has arrived at final destination.
   *
   * @param {object} u - Unit object
   */
  function advanceWaypoint(u) {
    // Snap to current waypoint
    u.tx = u.moveTarget.tx;
    u.ty = u.moveTarget.ty;

    // Check for next waypoint in path
    if (u.path && u.pathIndex < u.path.length - 1) {
      u.pathIndex++;
      u.moveFrom = { tx: u.tx, ty: u.ty };
      var next = u.path[u.pathIndex];
      u.moveTarget = { tx: next.x, ty: next.y };
      u.moveProgress = 0;
    } else {
      // Path complete — stop
      u.moving = false;
      u.moveFrom = null;
      u.moveTarget = null;
      u.moveProgress = 1;
      u.path = null;
      u.pathIndex = 0;
    }
  }

  /**
   * Update move markers (fade out over time).
   * @param {object} state
   * @param {number} dt
   */
  function updateMoveMarkers(state, dt) {
    for (var i = state.moveMarkers.length - 1; i >= 0; i--) {
      state.moveMarkers[i].life -= dt;
      if (state.moveMarkers[i].life <= 0) {
        state.moveMarkers.splice(i, 1);
      }
    }
  }

  window.FE_NEXT_MOVEMENT = {
    findUnit: findUnit,
    getSelectedUnit: getSelectedUnit,
    issueMoveCommand: issueMoveCommand,
    updateMovement: updateMovement,
    updateMoveMarkers: updateMoveMarkers
  };
})();
