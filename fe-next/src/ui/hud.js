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

    var selInfo = document.getElementById('selection-info');
    var selTitle = document.getElementById('sel-title');
    var selType = document.getElementById('sel-type');
    var selPos = document.getElementById('sel-pos');
    var buildSeparator = document.getElementById('build-separator');

    if (!selInfo) return;

    var selectedUnit = state.selectedUnitId
      ? window.FE_NEXT_MOVEMENT.findUnit(state, state.selectedUnitId)
      : null;

    if (selectedUnit) {
      selInfo.style.display = 'block';
      if (selTitle) selTitle.textContent = selectedUnit.type || 'Unit';
      if (selType) selType.textContent = 'HP: ' + selectedUnit.hp + '/' + selectedUnit.maxHp;
      if (selPos) selPos.textContent = formatSelectionLine(selectedUnit);
      if (buildSeparator) {
        buildSeparator.style.display = selectedUnit.type === 'builder' ? 'block' : 'none';
        buildSeparator.disabled = selectedUnit.buildState !== 'idle' || state.resources.energy < window.FE_NEXT_CONSTANTS.SEPARATOR_BUILD_ENERGY_COST;
      }
    } else {
      selInfo.style.display = 'none';
      if (buildSeparator) buildSeparator.style.display = 'none';
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
    }
    return text;
  }

  window.FE_NEXT_HUD = {
    updateHUD: updateHUD
  };
})();
