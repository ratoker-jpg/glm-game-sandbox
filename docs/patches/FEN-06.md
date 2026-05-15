# FEN-06: FE Next basic combat and light tank production

## Summary

Adds the first FE Next combat loop:

factory produces light_tank -> player selects light_tank -> right-click enemy dummy bunker -> tank pathfinds into range -> tank attacks on cooldown -> target HP decreases -> target is destroyed -> destroyed target no longer blocks occupancy.

Root game code remains untouched.

## Architecture

- `fe-next/src/systems/combat.js` owns attack commands, range checks, damage application, target death, and occupancy rebuilds. No combat runtime in production.js, movement.js, input.js, or main.js.
- `fe-next/src/systems/production.js` is only extended with `light_tank` unit spec and combat field initialization.
- `fe-next/src/game/state.js` adds enemy bunker initial state, `findEnemyBuildingAtTile` selector, and combat fields on the initial test light_tank.
- `fe-next/src/game/occupancy.js` skips destroyed buildings when building the occupancy grid.
- `fe-next/src/input/input.js` routes right-click on enemy building to `combat.issueAttackCommand`.
- `fe-next/src/render/renderer.js` renders enemy bunker geometrically (red/dark), skips destroyed buildings, shows attack indicator line.
- `fe-next/src/ui/hud.js` adds Build Tank button and combat state display for selected light_tank.
- `fe-next/src/main.js` adds COMBAT module reference and `updateCombat` call.

## Scope

No enemy bot, no enemy economy, no enemy production, no attack waves, no tank_decider, no scout/intel, no fog of war, no territory, no save/load, no win/lose, no auto-aggro, no attack-move, no projectile visuals, no area damage, no multiple target priority system, no root game modifications.

## Combat Rules

- Light tank cost: 2 cyan element
- Light tank production time: 12 seconds
- Light tank HP: 100
- Light tank damage: 20 per hit
- Light tank range: 3 tiles (Manhattan distance to building edge)
- Light tank attack cooldown: 1.0 seconds
- Enemy bunker HP: 100
- Enemy bunker is pre-placed at (16, 10), size 1x1
- Attack command requires: unit is light_tank, target is enemy-owned, target is not destroyed
- Tank moves into range using existing movement/pathfinding
- Tank attacks when in range on cooldown timer
- Target destroyed at 0 HP: destroyed=true, attacker clears target, occupancy rebuilt
- Destroyed buildings no longer block pathfinding

## Tests

FE Next smoke coverage verifies enemy bunker exists, combat API is available, light_tank production from factory, light_tank combat fields, attack command acceptance/rejection, combat damage, bunker destruction, occupancy clearing after destruction, and invalid attack command rejection.
