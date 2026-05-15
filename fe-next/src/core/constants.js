// FEN-02: FE Next core constants.
// Zero dependencies. All values are pure constants for the FE Next game.
// Exposed as window.FE_NEXT_CONSTANTS.

(function () {
  'use strict';

  window.FE_NEXT_CONSTANTS = Object.freeze({
    // Map
    MAP_W: 24,
    MAP_H: 24,

    // Isometric tile dimensions (half-width, half-height for diamond)
    TILE_W: 76,
    TILE_H: 38,

    // Camera
    CAMERA_MIN_ZOOM: 0.4,
    CAMERA_MAX_ZOOM: 3.0,
    CAMERA_PAN_SPEED: 400,      // pixels per second
    CAMERA_ZOOM_STEP: 0.12,

    // Rendering
    TERRAIN_COLORS: {
      grass:  '#a8c256',
      sand:   '#d9c67a',
      dirt:   '#b8944e',
      water:  '#4a8fb8',
      rock:   '#8a8a7a'
    },
    HQ_COLOR:     '#d4a544',
    HQ_OUTLINE:   '#8b6914',
    UNIT_COLOR:   '#5eaaef',
    UNIT_OUTLINE: '#2d6fa0',
    UNIT_SELECTED: '#ffd66c',
    GRID_COLOR:   'rgba(0,0,0,0.08)',
    MOVE_MARKER_COLOR: 'rgba(255,214,108,0.7)',
    BLOCKED_MARKER_COLOR: 'rgba(224,82,67,0.8)',

    // Unit
    UNIT_SPEED: 3.0,            // tiles per second
    UNIT_RADIUS: 0.35,          // in tile units
    UNIT_HP: 100,

    // HQ
    HQ_SIZE: 2,                 // tiles (2x2 building)

    // Occupancy — terrain types that block movement
    BLOCKED_TERRAIN: ['water', 'rock'],

    // Asset manifest — paths relative to fe-next/index.html
    // These use ../ to reach the root assets/ directory.
    // All assets are optional; missing assets fall back to geometric rendering.
    ASSET_MANIFEST: {
      terrain_sand:       '../assets/tiles/sand_tile.png',
      terrain_sand_dark:  '../assets/tiles/sand_tile_dark.png',
      terrain_sand_light: '../assets/tiles/sand_tile_light.png',
      terrain_grid:       '../assets/tiles/base_grid_tile.png',
      building_hq:        '../assets/factions/cyan/buildings/hq_base.png',
      unit_light_tank:    '../assets/factions/cyan/units/light_tank.png'
    },

    // Resources
    START_MINERALS: 200,
    START_ENERGY: 160,

    // Tick
    TARGET_FPS: 60,
    FRAME_BUDGET_MS: 16.67
  });
})();
