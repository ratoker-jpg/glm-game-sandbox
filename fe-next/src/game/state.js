// FEN-03: Game state factory and simple selectors.
// Creates FE Next initial state only; runtime systems live in systems/.
// Exposed as window.FE_NEXT_STATE.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;
  var COORDS = window.FE_NEXT_COORDS;

  function generateTerrain(w, h) {
    var grid = [];
    for (var y = 0; y < h; y++) {
      var row = [];
      for (var x = 0; x < w; x++) {
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

  function createMineralNode(id, tx, ty) {
    return {
      id: id,
      type: 'minerals',
      tx: tx,
      ty: ty,
      remaining: C.RESOURCE_NODE_REMAINING,
      yield: C.RESOURCE_NODE_YIELD,
      depleted: false
    };
  }

  function createInitialState() {
    var terrain = generateTerrain(C.MAP_W, C.MAP_H);

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

    var separator = {
      id: 'player_separator_1',
      type: 'separator',
      owner: 'player',
      tx: 7,
      ty: 3,
      size: C.SEPARATOR_SIZE,
      hp: 300,
      maxHp: 300,
      constructionState: 'completed',
      complete: true,
      progress: 1,
      separatorState: 'idle',
      cycleProgress: 0,
      cyclesCompleted: 0
    };

    var testUnit = {
      id: 'test_unit_1',
      type: 'light_tank',
      owner: 'player',
      tx: 7,
      ty: 5,
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

    var harvester = {
      id: 'harvester_1',
      type: 'harvester',
      owner: 'player',
      tx: 6,
      ty: 7,
      hp: C.UNIT_HP,
      maxHp: C.UNIT_HP,
      selected: false,
      moving: false,
      moveTarget: null,
      moveProgress: 0,
      moveFrom: null,
      path: null,
      pathIndex: 0,
      speed: C.HARVESTER_SPEED,
      cargo: 0,
      maxCargo: C.HARVESTER_MAX_CARGO,
      harvestState: 'idle',
      harvestTarget: null,
      gatherTimer: 0
    };

    var builder = {
      id: 'builder_1',
      type: 'builder',
      owner: 'player',
      tx: 9,
      ty: 5,
      hp: C.UNIT_HP,
      maxHp: C.UNIT_HP,
      selected: false,
      moving: false,
      moveTarget: null,
      moveProgress: 0,
      moveFrom: null,
      path: null,
      pathIndex: 0,
      speed: C.BUILDER_SPEED,
      buildState: 'idle',
      buildOrder: null
    };

    var enemyBunker = {
      id: 'enemy_bunker_1',
      type: 'enemy_bunker',
      owner: 'enemy',
      tx: 16,
      ty: 10,
      size: 1,
      hp: C.ENEMY_DUMMY_HP,
      maxHp: C.ENEMY_DUMMY_HP,
      destroyed: false
    };

    // FEN-07: Enemy HQ
    var enemyHq = {
      id: 'enemy_hq',
      type: 'enemy_hq',
      owner: 'enemy',
      tx: 18,
      ty: 18,
      size: C.ENEMY_HQ_SIZE,
      hp: C.ENEMY_HQ_HP,
      maxHp: C.ENEMY_HQ_HP,
      destroyed: false
    };

    var resourceNodes = [
      createMineralNode('mineral_node_1', 14, 8),
      createMineralNode('mineral_node_2', 10, 14),
      createMineralNode('mineral_node_3', 3, 12)
    ];

    var hqScreen = COORDS.tileToScreen(hq.tx + 0.5, hq.ty + 0.5);

    return {
      running: true,
      time: 0,
      tickCount: 0,

      mapW: C.MAP_W,
      mapH: C.MAP_H,
      terrain: terrain,
      occupancyGrid: null,

      camera: {
        x: hqScreen.x,
        y: hqScreen.y,
        zoom: 1.0
      },

      keys: {},
      mouseDown: false,
      middleMouseDown: false,
      lastMouseX: 0,
      lastMouseY: 0,
      panStartX: 0,
      panStartY: 0,
      camPanStartX: 0,
      camPanStartY: 0,

      buildings: [hq, separator, enemyBunker, enemyHq],
      units: [testUnit, harvester, builder],
      resourceNodes: resourceNodes,

      resources: {
        minerals: C.START_MINERALS,
        energy: C.START_ENERGY,
        cyanEl: C.START_CYAN_EL,
        caps: {
          minerals: C.MINERALS_CAP,
          energy: C.ENERGY_CAP,
          cyanEl: C.CYAN_EL_CAP
        }
      },

      selectedUnitId: null,
      selectedBuildingId: null,
      moveMarkers: [],

      // FEN-07: Enemy state
      enemy: {
        spawnTimer: C.ENEMY_TANK_INITIAL_DELAY,
        tanksSpawned: 0
      },

      // FEN-07: Game result
      gameResult: null,     // null | 'victory' | 'defeat'
      winner: null,         // null | 'player' | 'enemy'
      resultReason: null    // null | 'enemy_hq_destroyed' | 'player_hq_destroyed'
    };
  }

  function findUnitAtTile(state, tx, ty) {
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      var d = Math.abs(u.tx - tx) + Math.abs(u.ty - ty);
      if (d < 1.0) return u;
    }
    return null;
  }

  function findResourceNodeAtTile(state, tx, ty) {
    if (!state.resourceNodes) return null;
    for (var i = 0; i < state.resourceNodes.length; i++) {
      var node = state.resourceNodes[i];
      if (Math.floor(node.tx) === tx && Math.floor(node.ty) === ty) return node;
    }
    return null;
  }

  function findResourceNodeById(state, id) {
    if (!state.resourceNodes) return null;
    for (var i = 0; i < state.resourceNodes.length; i++) {
      if (state.resourceNodes[i].id === id) return state.resourceNodes[i];
    }
    return null;
  }

  function findBuildingByType(state, type) {
    if (!state.buildings) return null;
    for (var i = 0; i < state.buildings.length; i++) {
      if (state.buildings[i].type === type) return state.buildings[i];
    }
    return null;
  }

  function findBuildingAtTile(state, tx, ty) {
    if (!state.buildings) return null;
    for (var i = state.buildings.length - 1; i >= 0; i--) {
      var b = state.buildings[i];
      var s = b.size || 1;
      if (b.complete === false) continue;
      if (b.destroyed) continue;
      if (tx >= b.tx && tx < b.tx + s && ty >= b.ty && ty < b.ty + s) return b;
    }
    return null;
  }

  function findEnemyBuildingAtTile(state, tx, ty) {
    if (!state.buildings) return null;
    for (var i = 0; i < state.buildings.length; i++) {
      var b = state.buildings[i];
      if (b.owner !== 'enemy' || b.destroyed) continue;
      var s = b.size || 1;
      if (tx >= b.tx && tx < b.tx + s && ty >= b.ty && ty < b.ty + s) return b;
    }
    return null;
  }

  function findBuildingById(state, id) {
    if (!state.buildings) return null;
    for (var i = 0; i < state.buildings.length; i++) {
      if (state.buildings[i].id === id) return state.buildings[i];
    }
    return null;
  }

  // FEN-07: Find unit by ID
  function findUnitById(state, id) {
    if (!state.units) return null;
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].id === id) return state.units[i];
    }
    return null;
  }

  window.FE_NEXT_STATE = {
    createInitialState: createInitialState,
    findUnitAtTile: findUnitAtTile,
    findUnitById: findUnitById,
    findResourceNodeAtTile: findResourceNodeAtTile,
    findResourceNodeById: findResourceNodeById,
    findBuildingByType: findBuildingByType,
    findBuildingAtTile: findBuildingAtTile,
    findBuildingById: findBuildingById,
    findEnemyBuildingAtTile: findEnemyBuildingAtTile
  };
})();
