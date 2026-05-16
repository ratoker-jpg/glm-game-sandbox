// FEN-03: Minimal HUD updater.
// Reads game state and updates DOM HUD elements.
// Exposed as window.FE_NEXT_HUD.

(function () {
  'use strict';

  function formatTime(sec) {
    sec = Math.floor(sec || 0);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function updateHUD(state) {
    var caps = state.resources.caps || {};
    setText('hud-minerals', state.resources.minerals + '/' + caps.minerals);
    setText('hud-energy', state.resources.energy + '/' + caps.energy);
    setText('hud-cyan', state.resources.cyanEl + '/' + caps.cyanEl);
    setText('hud-time', formatTime(state.time));
    setText('hud-separator', formatSeparator(state));

    // FEN-07: Game result status
    if (state.gameResult) {
      var resultEl = document.getElementById('hud-result');
      var resultRow = document.getElementById('hud-result-row');
      if (resultEl) {
        resultEl.textContent = state.gameResult === 'victory' ? 'VICTORY' : 'DEFEAT';
        resultEl.style.color = state.gameResult === 'victory' ? '#5de06b' : '#e05243';
      }
      if (resultRow) resultRow.style.display = 'flex';
    }

    var selInfo = document.getElementById('selection-info');
    var selTitle = document.getElementById('sel-title');
    var selType = document.getElementById('sel-type');
    var selPos = document.getElementById('sel-pos');
    var buildSeparator = document.getElementById('build-separator');
    var buildFactory = document.getElementById('build-factory');
    var produceHarvester = document.getElementById('produce-harvester');
    var produceBuilder = document.getElementById('produce-builder');
    var produceLightTank = document.getElementById('produce-light-tank');

    if (!selInfo) return;

    var selectedUnit = state.selectedUnitId
      ? window.FE_NEXT_MOVEMENT.findUnit(state, state.selectedUnitId)
      : null;
    var selectedBuilding = state.selectedBuildingId
      ? window.FE_NEXT_STATE.findBuildingById(state, state.selectedBuildingId)
      : null;

    hideActionButtons(buildSeparator, buildFactory, produceHarvester, produceBuilder, produceLightTank);

    if (selectedUnit) {
      selInfo.style.display = 'block';
      if (selTitle) selTitle.textContent = selectedUnit.type || 'Unit';
      if (selType) selType.textContent = 'HP: ' + selectedUnit.hp + '/' + selectedUnit.maxHp;
      if (selPos) selPos.textContent = formatSelectionLine(selectedUnit);
      if (selectedUnit.type === 'light_tank') {
        if (selPos) selPos.textContent = formatSelectionLine(selectedUnit);
      }
      if (selectedUnit.type === 'builder') {
        if (buildSeparator) {
          buildSeparator.style.display = 'block';
          buildSeparator.disabled = selectedUnit.buildState !== 'idle' || state.resources.energy < window.FE_NEXT_CONSTANTS.SEPARATOR_BUILD_ENERGY_COST;
        }
        if (buildFactory) {
          buildFactory.style.display = 'block';
          buildFactory.disabled = selectedUnit.buildState !== 'idle' || state.resources.energy < window.FE_NEXT_CONSTANTS.UNITS_FACTORY_BUILD_ENERGY_COST;
        }
      }
    } else if (selectedBuilding) {
      selInfo.style.display = 'block';
      if (selTitle) selTitle.textContent = selectedBuilding.type || 'Building';
      if (selType) selType.textContent = formatBuildingLine(selectedBuilding);
      if (selPos) selPos.textContent = 'Position: (' + selectedBuilding.tx + ', ' + selectedBuilding.ty + ')';
      if (selectedBuilding.type === 'units_factory' && selectedBuilding.complete === true) {
        var queueLength = selectedBuilding.productionQueue ? selectedBuilding.productionQueue.length : 0;
        if (produceHarvester) {
          produceHarvester.style.display = 'block';
          produceHarvester.disabled = queueLength >= window.FE_NEXT_CONSTANTS.PRODUCTION_QUEUE_MAX || state.resources.cyanEl < 1;
        }
        if (produceBuilder) {
          produceBuilder.style.display = 'block';
          produceBuilder.disabled = queueLength >= window.FE_NEXT_CONSTANTS.PRODUCTION_QUEUE_MAX || state.resources.cyanEl < 1;
        }
        if (produceLightTank) {
          produceLightTank.style.display = 'block';
          produceLightTank.disabled = queueLength >= window.FE_NEXT_CONSTANTS.PRODUCTION_QUEUE_MAX || state.resources.cyanEl < window.FE_NEXT_CONSTANTS.PRODUCE_LIGHT_TANK_CYAN_COST;
        }
      }
    } else {
      selInfo.style.display = 'none';
    }
  }

  function hideActionButtons() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i]) arguments[i].style.display = 'none';
    }
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatSeparator(state) {
    var separator = window.FE_NEXT_STATE.findBuildingByType(state, 'separator');
    if (!separator) return 'missing';
    var cycleTime = window.FE_NEXT_CONSTANTS.SEPARATOR_CYCLE_TIME;
    var progress = Math.floor(((separator.cycleProgress || 0) / cycleTime) * 100);
    return separator.separatorState + ' ' + progress + '%';
  }

  function formatSelectionLine(unit) {
    var text = 'Position: (' + Math.round(unit.tx) + ', ' + Math.round(unit.ty) + ')';
    if (unit.type === 'harvester') {
      text += ' Cargo: ' + unit.cargo + '/' + unit.maxCargo + ' ' + unit.harvestState;
    } else if (unit.type === 'builder') {
      text += ' Build: ' + unit.buildState;
      if (unit.buildOrder) text += ' ' + unit.buildOrder.buildingType;
    } else if (unit.type === 'light_tank') {
      text += ' ' + (unit.attackState || 'idle');
      if (unit.attackTarget) text += ' -> ' + unit.attackTarget.id;
    }
    return text;
  }

  function formatBuildingLine(building) {
    if (building.type === 'units_factory') {
      var queue = building.productionQueue || [];
      var progress = Math.floor((building.productionProgress || 0) * 100);
      return 'Queue: ' + queue.length + '/' + window.FE_NEXT_CONSTANTS.PRODUCTION_QUEUE_MAX + ' Progress: ' + progress + '%';
    }
    return 'HP: ' + building.hp + '/' + building.maxHp;
  }

  window.FE_NEXT_HUD = {
    updateHUD: updateHUD
  };
})();
