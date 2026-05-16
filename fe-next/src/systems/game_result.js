// FEN-07: Game result runtime — win/lose detection.
// Owns updateGameResult and setGameResult.
// Does not pause main.js closure. Does not add Play Again.
// Exposed as window.FE_NEXT_GAME_RESULT.

(function () {
  'use strict';

  var STATE = window.FE_NEXT_STATE;

  /**
   * Set the game result state. Called when a win/lose condition is detected.
   * @param {object} state
   * @param {string} result - 'victory' | 'defeat'
   * @param {string} winner - 'player' | 'enemy'
   * @param {string} reason - 'enemy_hq_destroyed' | 'player_hq_destroyed'
   */
  function setGameResult(state, result, winner, reason) {
    state.gameResult = result;
    state.winner = winner;
    state.resultReason = reason;
  }

  /**
   * Check win/lose conditions each frame.
   * Early-returns if gameResult is already set.
   * - Win: enemy HQ destroyed
   * - Lose: player HQ destroyed
   * @param {object} state
   */
  function updateGameResult(state) {
    if (state.gameResult) return;

    var enemyHq = STATE.findBuildingById(state, 'enemy_hq');
    if (enemyHq && enemyHq.destroyed) {
      setGameResult(state, 'victory', 'player', 'enemy_hq_destroyed');
      return;
    }

    var playerHq = STATE.findBuildingById(state, 'player_hq');
    if (playerHq && playerHq.destroyed) {
      setGameResult(state, 'defeat', 'enemy', 'player_hq_destroyed');
      return;
    }
  }

  window.FE_NEXT_GAME_RESULT = {
    updateGameResult: updateGameResult,
    setGameResult: setGameResult
  };
})();
