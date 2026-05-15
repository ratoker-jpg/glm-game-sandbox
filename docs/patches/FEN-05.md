# FEN-05: FE Next units factory production MVP

## Summary

Adds the first FE Next unit production loop:

builder builds units_factory -> completed factory can be selected -> player queues harvester or builder -> cyan element is spent immediately -> production timer runs -> produced unit spawns on a nearby passable tile -> produced unit is functional.

Root game code remains untouched.

## Architecture

- `fe-next/src/systems/production.js` owns production queueing, queue validation, cyan element spending, production progress, spawn tile selection, and produced unit creation.
- `fe-next/src/systems/construction.js` is only extended with `units_factory` build specs and factory field initialization on completion.
- `fe-next/src/game/state.js` adds `selectedBuildingId` and simple building selectors only.
- `fe-next/src/main.js` stays a thin composition root and calls `PRODUCTION.updateProduction`.

## Scope

No light tank production, combat, enemy bot, attack commands, save/load, fog, territory, rally points, cancel/refund, advanced UI, or root runtime changes.

## Production Rules

- `units_factory` cost: 55 energy
- `units_factory` build time: 10 seconds
- queue max: 2
- produced units: `harvester`, `builder`
- unit cost: 1 cyan element
- unit production time: 10 seconds
- spawn tile: nearest passable adjacent tile around factory

If no spawn tile exists, the first queue item remains ready and blocked; it is not deleted and the next item does not start.

## Tests

FE Next smoke coverage verifies factory construction, completed factory selection, queue rules, cyan element spending, queue cap, insufficient cyan rejection, accelerated production, spawn tile passability, and produced harvester/builder fields and behavior.
