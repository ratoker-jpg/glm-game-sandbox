// FEN-05: Input handler - camera pan/zoom, selection, move, build, production.
// Wires DOM events to state mutations and routes commands to runtime systems.
// Exposed as window.FE_NEXT_INPUT.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;
  var COORDS = window.FE_NEXT_COORDS;
  var STATE = window.FE_NEXT_STATE;
  var MOVEMENT = window.FE_NEXT_MOVEMENT;
  var HARVESTING = window.FE_NEXT_HARVESTING;
  var CONSTRUCTION = window.FE_NEXT_CONSTRUCTION;
  var PRODUCTION = window.FE_NEXT_PRODUCTION;

  function initInput(canvas, state) {
    function onKeyDown(e) {
      state.keys[e.code] = true;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) !== -1) {
        e.preventDefault();
      }
    }

    function onKeyUp(e) {
      state.keys[e.code] = false;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    function getCanvasCoords(e) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
      };
    }

    function onMouseDown(e) {
      var pos = getCanvasCoords(e);

      if (e.button === 0) {
        state.mouseDown = true;
        handleLeftClick(state, pos);
      } else if (e.button === 1) {
        e.preventDefault();
        state.middleMouseDown = true;
        state.panStartX = pos.x;
        state.panStartY = pos.y;
        state.camPanStartX = state.camera.x;
        state.camPanStartY = state.camera.y;
      } else if (e.button === 2) {
        e.preventDefault();
        handleRightClick(state, pos);
      }
    }

    function onMouseMove(e) {
      var pos = getCanvasCoords(e);
      state.lastMouseX = pos.x;
      state.lastMouseY = pos.y;

      if (state.middleMouseDown) {
        var dx = (pos.x - state.panStartX) / state.camera.zoom;
        var dy = (pos.y - state.panStartY) / state.camera.zoom;
        state.camera.x = state.camPanStartX - dx;
        state.camera.y = state.camPanStartY - dy;
      }
    }

    function onMouseUp(e) {
      if (e.button === 0) {
        state.mouseDown = false;
      } else if (e.button === 1) {
        state.middleMouseDown = false;
      }
    }

    function onWheel(e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -C.CAMERA_ZOOM_STEP : C.CAMERA_ZOOM_STEP;
      state.camera.zoom = COORDS.clamp(
        state.camera.zoom + delta,
        C.CAMERA_MIN_ZOOM,
        C.CAMERA_MAX_ZOOM
      );
    }

    function onContextMenu(e) {
      e.preventDefault();
    }

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    var touchId = null;
    function onTouchStart(e) {
      if (e.touches.length === 1 && touchId === null) {
        var t = e.touches[0];
        touchId = t.identifier;
        var rect = canvas.getBoundingClientRect();
        handleLeftClick(state, {
          x: (t.clientX - rect.left) * (canvas.width / rect.width),
          y: (t.clientY - rect.top) * (canvas.height / rect.height)
        });
      }
    }

    function onTouchEnd() {
      touchId = null;
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd);

    bindBuildButton(state, 'build-separator', 'separator');
    bindBuildButton(state, 'build-factory', 'units_factory');
    bindProductionButton(state, 'produce-harvester', 'harvester');
    bindProductionButton(state, 'produce-builder', 'builder');
  }

  function bindBuildButton(state, id, buildingType) {
    var button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('click', function () {
      var selected = state.selectedUnitId ? MOVEMENT.findUnit(state, state.selectedUnitId) : null;
      if (selected && selected.type === 'builder') {
        CONSTRUCTION.issueBuildCommand(state, selected.id, buildingType);
      }
    });
  }

  function bindProductionButton(state, id, unitType) {
    var button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('click', function () {
      if (state.selectedBuildingId) {
        PRODUCTION.queueUnit(state, state.selectedBuildingId, unitType);
      }
    });
  }

  function handleLeftClick(state, canvasPos) {
    var canvasW = document.getElementById('game').width;
    var canvasH = document.getElementById('game').height;
    var tile = COORDS.canvasToTile(canvasPos.x, canvasPos.y, state.camera, canvasW, canvasH);
    var tx = Math.floor(tile.x - 0.5);
    var ty = Math.floor(tile.y - 0.5);

    var unit = STATE.findUnitAtTile(state, tile.x - 0.5, tile.y - 0.5);
    if (unit) {
      clearUnitSelection(state);
      unit.selected = true;
      state.selectedUnitId = unit.id;
      state.selectedBuildingId = null;
      return;
    }

    var building = STATE.findBuildingAtTile(state, tx, ty);
    if (building) {
      clearUnitSelection(state);
      state.selectedUnitId = null;
      state.selectedBuildingId = building.id;
      return;
    }

    clearUnitSelection(state);
    state.selectedUnitId = null;
    state.selectedBuildingId = null;
  }

  function clearUnitSelection(state) {
    if (!state.selectedUnitId) return;
    var selected = MOVEMENT.findUnit(state, state.selectedUnitId);
    if (selected) selected.selected = false;
  }

  function handleRightClick(state, canvasPos) {
    if (!state.selectedUnitId) return;

    var canvasW = document.getElementById('game').width;
    var canvasH = document.getElementById('game').height;
    var tile = COORDS.canvasToTile(canvasPos.x, canvasPos.y, state.camera, canvasW, canvasH);
    var tx = Math.floor(tile.x - 0.5);
    var ty = Math.floor(tile.y - 0.5);

    if (tx < 0 || ty < 0 || tx >= state.mapW || ty >= state.mapH) return;

    var selectedUnit = MOVEMENT.findUnit(state, state.selectedUnitId);
    if (selectedUnit && selectedUnit.type === 'builder' && selectedUnit.buildState !== 'idle') return;

    var node = STATE.findResourceNodeAtTile(state, tx, ty);
    if (node && selectedUnit && selectedUnit.type === 'harvester') {
      HARVESTING.issueHarvestCommand(state, selectedUnit.id, node.id);
      return;
    }

    MOVEMENT.issueMoveCommand(state, state.selectedUnitId, tx, ty);
  }

  function update(state, dt) {
    var speed = C.CAMERA_PAN_SPEED * dt / state.camera.zoom;

    if (state.keys['KeyW'] || state.keys['ArrowUp']) state.camera.y -= speed;
    if (state.keys['KeyS'] || state.keys['ArrowDown']) state.camera.y += speed;
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) state.camera.x -= speed;
    if (state.keys['KeyD'] || state.keys['ArrowRight']) state.camera.x += speed;
  }

  window.FE_NEXT_INPUT = {
    initInput: initInput,
    update: update
  };
})();
