# FEN-04: FE Next builder construction MVP

## Summary

Adds the first player-driven FE Next construction loop:

select builder -> click Build Separator -> auto-find valid build spot -> validate resources, footprint, access, and path -> reserve construction site -> builder travels to access tile -> construction completes -> occupancy updates -> completed separator joins economy.

Root game code remains untouched.

## Architecture

- `fe-next/src/systems/construction.js` owns auto-placement, validation, access tile selection, energy spending, construction site creation, progress, completion, and occupancy rebuilds.
- `fe-next/src/main.js` stays a thin composition root and only calls `CONSTRUCTION.updateConstruction`.
- `fe-next/src/game/state.js` only adds initial builder state and remains non-orchestrating.
- `fe-next/src/systems/economy.js` now processes every completed separator and ignores construction sites.

## Scope

No manual map placement, ghost preview, cancel/refund, unit production, combat, enemy bot, fog, territory, save/load, or root runtime changes.

## Validation Rules

Build orders start only after:

- enough energy exists;
- a separator footprint is inside the map;
- footprint avoids blocked terrain, buildings, construction sites, units, and resource nodes;
- at least one adjacent passable access tile exists;
- the builder can pathfind to that access tile.

Only then does the system spend 30 energy, add a construction site, rebuild occupancy, and send the builder.

## Tests

FE Next smoke coverage now verifies builder state, build UI/API, auto-placement, energy spend, site creation, builder travel, accelerated completion, occupancy blocking, invalid build rejection, and multi-separator economy participation.
