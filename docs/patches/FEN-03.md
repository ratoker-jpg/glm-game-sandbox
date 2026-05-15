# FEN-03: FE Next resource harvester and separator economy

## Summary

Adds the first FE Next economy loop inside `fe-next/`:

resource node -> harvester gather -> HQ dropoff -> minerals increase -> separator converts minerals into energy and cyan element -> HUD updates.

Root game code remains untouched.

## Architecture

- `fe-next/src/systems/harvesting.js` owns harvester commands, gather timing, cargo, HQ dropoff, and auto-resume.
- `fe-next/src/systems/economy.js` owns separator conversion rules, cycle progress, cap checks, and resource mutation.
- `fe-next/src/game/state.js` remains a state factory with simple selectors for units, resource nodes, and buildings.
- `fe-next/src/main.js` stays a composition root that wires movement, harvesting, economy, rendering, and HUD updates.

## Initial Economy

- Minerals: `100/200`
- Energy: `160/300`
- Cyan element: `0/20`
- Resource nodes: 3 mineral nodes, each `remaining: 8`, `yield: 10`
- Harvester cargo: `0/10`
- Separator cycle: `15 minerals -> 10 energy + 1 cyanEl` every 6 seconds

## Scope Guardrails

No construction, build menu, factory production, combat, enemy bot, fog of war, territory, save/load, root runtime changes, package changes, or asset changes.

## Tests

Updated FE Next smoke coverage verifies boot, resource node/harvester/separator state, harvest command routing, accelerated gather/dropoff, separator conversion, and separator cap blocking.
