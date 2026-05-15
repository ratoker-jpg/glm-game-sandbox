// FEN-02: Game state factory and simple selectors.
// Creates and manages the FE Next game state object.
// Movement runtime logic lives in fe-next/src/systems/movement.js.
// Exposed as window.FE_NEXT_STATE.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;
  var COORDS = window.FE_NEXT_COORDS;

  /**
   * Create a terrain grid for the given map size.
   * Each cell is a string: 'grass', 'sand', 'dirt', 'water', 'rock'.
   * For FEN-01/FEN-02 we use a simple deterministic pattern.
   *
   * @param {number} w
   * @param {number} h
   * @returns {string[][]}
   */
  function generateTerrain(w, h) {
    var grid = [];
    for (var y = 0; y < h; y++) {
      var row = [];
      for (var x = 0; x < w; x++) {
        // Simple pattern: mostly grass with sand borders and a few dirt patches
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
          row.push('sand');
        } else if ((x + y) % 7 === 0) {
          row.push('dirt');
        } else {
          row.push('grass');
        }
      }
      grid.push(row);
    }
    return grid;
  }

  /**
   * Create initial game state for FE Next.
   * @returns {object}
   */
  function createInitialState() {
    var terrain = generateTerrain(C.MAP_W, C.MAP_H);

    // Player HQ at tile (4, 4) — a 2x2 building
    var hq = {
      id: 'player_hq',
      type: 'hq',
      owner: 'player',
      tx: 4,
      ty: 4,
      size: C.HQ_SIZE,
      hp: 500,
      maxHp: 500
    };

    // One test unit near the HQ
    var testUnit = {
      id: 'test_unit_1',
      type: 'light_tank',
      owner: 'player',
      tx: 7,
      ty: 5,
      hp: C.UNIT_HP,
      maxHp: C.UNIT_HP,
      selected: false,
      moving: false,
      moveTarget: null,       // {tx, ty} — current waypoint
      moveProgress: 0,        // 0..1 interpolation to current waypoint
      moveFrom: null,         // {tx, ty} — origin of current segment
      path: null,             // Array of {x, y} waypoints (from pathfinding)
      pathIndex: 0            // Current index in path
    };

    // Camera centered on HQ
    var hqScreen = COORDS.tileToScreen(hq.tx + 0.5, hq.ty + 0.5);

    return {
      // Meta
      running: true,
      time: 0,
      tickCount: 0,

      // Map
      mapW: C.MAP_W,
      mapH: C.MAP_H,
      terrain: terrain,

      // Occupancy grid (built by occupancy.js, stored here)
      occupancyGrid: null,

      // Camera
      camera: {
        x: hqScreen.x,
        y: hqScreen.y,
        zoom: 1.0
      },

      // Input state
      keys: {},
      mouseDown: false,
      middleMouseDown: false,
      lastMouseX: 0,
      lastMouseY: 0,
      panStartX: 0,
      panStartY: 0,
      camPanStartX: 0,
      camPanStartY: 0,

      // Entities
      buildings: [hq],
      units: [testUnit],

      // Resources
      resources: {
        minerals: C.START_MINERALS,
        energy: C.START_ENERGY
      },

      // Selection
      selectedUnitId: null,

      // Move markers (visual feedback for right-click commands)
      moveMarkers: []
    };
  }

  /**
   * Find a unit at the given tile position (within radius tolerance).
   * @param {object} state
   * @param {number} tx
   * @param {number} ty
   * @returns {object|null}
   */
  function findUnitAtTile(state, tx, ty) {
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      var d = Math.abs(u.tx - tx) + Math.abs(u.ty - ty);
      if (d < 1.0) return u;
    }
    return null;
  }

  window.FE_NEXT_STATE = {
    createInitialState: createInitialState,
    findUnitAtTile: findUnitAtTile
  };
})();
