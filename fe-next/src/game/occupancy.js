// FEN-02: Occupancy grid builder.
// Builds a 2D boolean grid from terrain and building data.
// Static for FEN-02: buildings block their footprint tiles,
// water/rock terrain is blocked. Units do NOT block tiles yet.
// Exposed as window.FE_NEXT_OCCUPANCY.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;

  /**
   * Build an occupancy grid from the game state.
   * Grid is a 2D array: grid[y][x] = true means tile is BLOCKED.
   * Blocked by: terrain types in BLOCKED_TERRAIN + building footprints.
   *
   * @param {object} state - Game state with terrain, buildings, mapW, mapH
   * @returns {boolean[][]} Occupancy grid (true = blocked)
   */
  function buildOccupancyGrid(state) {
    var w = state.mapW;
    var h = state.mapH;
    var blockedTypes = C.BLOCKED_TERRAIN || ['water', 'rock'];

    // Initialize grid from terrain
    var grid = [];
    for (var y = 0; y < h; y++) {
      var row = [];
      for (var x = 0; x < w; x++) {
        var terrain = state.terrain[y] && state.terrain[y][x];
        row.push(blockedTypes.indexOf(terrain) !== -1);
      }
      grid.push(row);
    }

    // Mark building footprints as blocked
    if (state.buildings) {
      for (var i = 0; i < state.buildings.length; i++) {
        markBuilding(grid, state.buildings[i], w, h);
      }
    }

    return grid;
  }

  /**
   * Mark a building's footprint tiles as blocked in the grid.
   * @param {boolean[][]} grid
   * @param {object} building - { tx, ty, size }
   * @param {number} w - Map width
   * @param {number} h - Map height
   */
  function markBuilding(grid, building, w, h) {
    var s = building.size || 1;
    for (var dy = 0; dy < s; dy++) {
      for (var dx = 0; dx < s; dx++) {
        var bx = building.tx + dx;
        var by = building.ty + dy;
        if (bx >= 0 && bx < w && by >= 0 && by < h) {
          grid[by][bx] = true;
        }
      }
    }
  }

  /**
   * Check if a tile is blocked in the occupancy grid.
   * Returns true if out of bounds or blocked.
   *
   * @param {boolean[][]} grid
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  function isTileBlocked(grid, x, y) {
    if (!grid) return true;
    if (x < 0 || y < 0 || y >= grid.length) return true;
    if (x >= grid[0].length) return true;
    return grid[y][x];
  }

  /**
   * Check if a tile is passable (not blocked).
   * @param {boolean[][]} grid
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  function isTilePassable(grid, x, y) {
    return !isTileBlocked(grid, x, y);
  }

  window.FE_NEXT_OCCUPANCY = {
    buildOccupancyGrid: buildOccupancyGrid,
    markBuilding: markBuilding,
    isTileBlocked: isTileBlocked,
    isTilePassable: isTilePassable
  };
})();
