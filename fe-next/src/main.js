// FEN-03: FE Next composition root.
// Thin wiring layer that initializes state, canvas, input,
// asset loading, occupancy, and starts the requestAnimationFrame loop.
// Movement runtime lives in systems/movement.js.
//
// Target: < 160 lines. Hard stop at 200.
// Exposes window.FE_NEXT_DEBUG for test/debug access.

(function () {
  'use strict';

  // ---- Module references ----
  var C = window.FE_NEXT_CONSTANTS;
  var COORDS = window.FE_NEXT_COORDS;
  var STATE = window.FE_NEXT_STATE;
  var RENDERER = window.FE_NEXT_RENDERER;
  var INPUT = window.FE_NEXT_INPUT;
  var HUD = window.FE_NEXT_HUD;
  var MOVEMENT = window.FE_NEXT_MOVEMENT;
  var HARVESTING = window.FE_NEXT_HARVESTING;
  var CONSTRUCTION = window.FE_NEXT_CONSTRUCTION;
  var ECONOMY = window.FE_NEXT_ECONOMY;
  var OCCUPANCY = window.FE_NEXT_OCCUPANCY;
  var ASSETS_LIB = window.FE_NEXT_ASSETS;

  // ---- Canvas setup ----
  var canvas = document.getElementById('game');
  if (!canvas) {
    throw new Error('[FE Next] Canvas element #game not found');
  }
  var ctx = canvas.getContext('2d');

  function resizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ---- Game state ----
  var state = STATE.createInitialState();

  // ---- Occupancy grid ----
  state.occupancyGrid = OCCUPANCY.buildOccupancyGrid(state);

  // ---- Asset loading (optional, non-blocking) ----
  var assets = ASSETS_LIB.createAssetStore();
  if (C.ASSET_MANIFEST) {
    assets.loadManifest(C.ASSET_MANIFEST);
  }

  // ---- Input ----
  INPUT.initInput(canvas, state);

  // ---- Game loop ----
  var lastTime = 0;
  var running = true;

  function update(dt) {
    if (dt > 0.25) dt = 0.25;

    INPUT.update(state, dt);
    MOVEMENT.updateMovement(state, dt);
    HARVESTING.updateHarvesting(state, dt);
    CONSTRUCTION.updateConstruction(state, dt);
    ECONOMY.updateEconomy(state, dt);
    MOVEMENT.updateMoveMarkers(state, dt);

    state.time += dt;
    state.tickCount++;
  }

  function render() {
    RENDERER.render(ctx, state, assets);
    HUD.updateHUD(state);
  }

  function tick(timestamp) {
    if (!running) return;

    var dt = lastTime ? (timestamp - lastTime) / 1000 : 0;
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  // ---- Debug / test access ----
  window.FE_NEXT_DEBUG = {
    getState: function () { return state; },
    getCanvas: function () { return canvas; },
    getContext: function () { return ctx; },
    getAssets: function () { return assets; },
    getHarvesting: function () { return HARVESTING; },
    getConstruction: function () { return CONSTRUCTION; },
    getEconomy: function () { return ECONOMY; },
    isRunning: function () { return running; },
    pause: function () { running = false; },
    resume: function () {
      running = true;
      lastTime = 0;
      requestAnimationFrame(tick);
    }
  };

  window.FE_NEXT_GAME = {
    state: state,
    canvas: canvas,
    assets: assets,
    debug: window.FE_NEXT_DEBUG
  };

  console.info('[FE Next] FEN-04 initialized. Construction loop ready. Assets loading:', assets.stats());
})();
