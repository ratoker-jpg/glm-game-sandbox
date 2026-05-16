# FEN-07: FE Next simple enemy loop with win/lose

## Summary

Adds the first minimal playable enemy loop to FE Next: enemy HQ exists, enemy periodically spawns light_tank, enemy tanks attack player HQ, player tanks can attack enemy tanks and enemy HQ, win/lose conditions.

Root game code remains untouched.

## Architecture

- `fe-next/src/systems/enemy.js` owns enemy spawn runtime: `updateEnemy`, `spawnEnemyTank`, `countEnemyTanks`. Scripted spawn timer, no AI planner, no enemy economy.
- `fe-next/src/systems/game_result.js` owns win/lose detection: `updateGameResult`, `setGameResult`. Checks if enemy HQ destroyed (win) or player HQ destroyed (lose). Does not pause main.js closure. Does not add Play Again.
- `fe-next/src/game/state.js` adds enemy HQ entity (id:enemy_hq, tx:18, ty:18, hp:500), enemy state object {spawnTimer, tanksSpawned}, gameResult/winner/resultReason fields, `findUnitById` selector.
- `fe-next/src/core/constants.js` adds ENEMY_HQ_HP, ENEMY_HQ_SIZE, ENEMY_TANK_INITIAL_DELAY, ENEMY_SPAWN_INTERVAL, ENEMY_MAX_TANKS.
- `fe-next/src/systems/combat.js` extended for unit-vs-unit combat: `issueAttackCommand` rejects same-owner targets, `getTargetByRef` supports kind:'unit', `isInRange` supports unit targets, unit death handling (remove from state.units, clear attackTarget refs). Keeps existing building target behavior.
- `fe-next/src/input/input.js` right-click routing: enemy unit -> attack unit, enemy building -> attack building, ground -> move. Non-light_tank right-click enemy must not crash.
- `fe-next/src/render/renderer.js` renders enemy HQ (red/dark variant), enemy tanks (red light_tank geometry), result overlay (VICTORY/DEFEAT).
- `fe-next/src/ui/hud.js` shows result status text when game ends.
- `fe-next/src/main.js` thin wiring: ENEMY and GAME_RESULT module references, `updateEnemy` and `updateGameResult` calls in update loop.

## Scope

No smart AI planner, no enemy economy/factory/construction, no Play Again button, no root game modifications. Enemy spawning is purely scripted/timer-based.

## Enemy Rules

- Enemy HQ: id=enemy_hq, tx=18, ty=18, size=2, hp=500
- Initial spawn delay: 10 seconds
- Spawn interval: 20 seconds
- Max enemy tanks: 3
- Enemy tanks are light_tank with same stats as player (hp=100, damage=20, range=3)
- Enemy tanks automatically attack player HQ on spawn
- Enemy tanks do NOT use smart AI — they get a single attack command at spawn time

## Win/Lose Conditions

- Win: enemy HQ destroyed (hp <= 0, destroyed = true)
- Lose: player HQ destroyed (hp <= 0, destroyed = true)
- Systems early-return when gameResult is set
- Main loop keeps rendering (does not stop)

## Unit-vs-Unit Combat

- Player light_tank can right-click enemy light_tank to attack
- Combat uses Manhattan distance for unit-vs-unit range checks
- Dead units are removed from state.units
- Attack refs pointing to dead units are cleared
- Same-owner attack commands are rejected

## Tests

E2E smoke coverage verifies: enemy HQ exists, enemy state fields, enemy tank spawn on timer, combat fields on spawned tank, enemy tank targets player HQ, enemy tank damages player HQ, player tank attacks enemy tank, unit-vs-unit damage, unit death cleanup, win condition, lose condition, gameResult stops spawning.
