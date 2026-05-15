// FEN-03: Separator economy runtime.
// Converts raw minerals into energy and cyan element over time.
// Exposed as window.FE_NEXT_ECONOMY.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;

  function updateEconomy(state, dt) {
    if (!state.buildings) return;
    for (var i = 0; i < state.buildings.length; i++) {
      var separator = state.buildings[i];
      if (separator.type !== 'separator' || separator.complete === false || separator.constructionState === 'constructing') continue;
      updateSeparator(state, separator, dt);
    }
  }

  function updateSeparator(state, separator, dt) {
    if (!canRunSeparator(state)) {
      separator.separatorState = getBlockedReason(state);
      separator.cycleProgress = 0;
      return;
    }

    separator.separatorState = 'running';
    separator.cycleProgress += dt;

    while (separator.cycleProgress >= C.SEPARATOR_CYCLE_TIME && canRunSeparator(state)) {
      separator.cycleProgress -= C.SEPARATOR_CYCLE_TIME;
      runSeparatorCycle(state, separator);
    }
  }

  function canRunSeparator(state) {
    var res = state.resources;
    var caps = res.caps || {};
    var energyCap = typeof caps.energy === 'number' ? caps.energy : C.ENERGY_CAP;
    var cyanCap = typeof caps.cyanEl === 'number' ? caps.cyanEl : C.CYAN_EL_CAP;

    return res.minerals >= C.SEPARATOR_INPUT_MINERALS &&
      res.energy + C.SEPARATOR_OUTPUT_ENERGY <= energyCap &&
      res.cyanEl + C.SEPARATOR_OUTPUT_CYAN_EL <= cyanCap;
  }

  function runSeparatorCycle(state, separator) {
    var res = state.resources;
    var caps = res.caps || {};
    var energyCap = typeof caps.energy === 'number' ? caps.energy : C.ENERGY_CAP;
    var cyanCap = typeof caps.cyanEl === 'number' ? caps.cyanEl : C.CYAN_EL_CAP;

    res.minerals = Math.max(0, res.minerals - C.SEPARATOR_INPUT_MINERALS);
    res.energy = Math.min(energyCap, res.energy + C.SEPARATOR_OUTPUT_ENERGY);
    res.cyanEl = Math.min(cyanCap, res.cyanEl + C.SEPARATOR_OUTPUT_CYAN_EL);
    separator.cyclesCompleted++;
  }

  function getBlockedReason(state) {
    var res = state.resources;
    var caps = res.caps || {};
    if (res.minerals < C.SEPARATOR_INPUT_MINERALS) return 'waiting_for_minerals';
    if (res.energy + C.SEPARATOR_OUTPUT_ENERGY > (caps.energy || C.ENERGY_CAP)) return 'energy_cap';
    if (res.cyanEl + C.SEPARATOR_OUTPUT_CYAN_EL > (caps.cyanEl || C.CYAN_EL_CAP)) return 'cyan_cap';
    return 'idle';
  }

  window.FE_NEXT_ECONOMY = {
    updateEconomy: updateEconomy,
    canRunSeparator: canRunSeparator
  };
})();
