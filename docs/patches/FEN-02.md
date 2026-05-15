# FEN-02: FE Next occupancy, pathfinding, and asset fallback

## Summary

Adds obstacle-aware pathfinding, occupancy grid, and optional sprite asset loading
with geometric fallback to the FE Next isometric scaffold. Units now navigate around
buildings and blocked terrain (water, rock) using BFS pathfinding instead of walking
in a straight line through obstacles.

## Architecture

- **state.js** — State fields + selectors/factories only. No runtime movement logic.
- **movement.js** (NEW) — Runtime move orchestrator: issueMoveCommand (path-aware),
  updateMovement (waypoint following), updateMoveMarkers, findUnit, getSelectedUnit.
- **pathfinding.js** (NEW) — Pure BFS `findPath(grid, sx, sy, gx, gy)` returning
  waypoints array or null. No state mutation, no side effects.
- **occupancy.js** (NEW) — Builds boolean occupancy grid from terrain + building
  footprints. `isTileBlocked`, `isTilePassable`, `markBuilding`.
- **assets.js** (NEW) — Minimal manifest-based asset loader. `createAssetStore()`
  returns `{ loadManifest, get, stats }`. Never throws; missing assets return null.

## Key Design Decisions

1. **State.js stays thin** — Per user correction, state.js is state fields + simple
   selectors/factories only. All runtime movement logic moved to movement.js.
2. **Fallback-first assets** — Missing assets must NOT break boot, tests, or render.
   Sprite rendering is a soft requirement; geometric fallback always works.
3. **Asset path prefix** — From fe-next/index.html, root assets need `../assets/...`.
4. **BFS pathfinding** — 4-directional on 24x24 grid. Pure function. Returns waypoints
   or null. Caller (movement.js) handles the result.
5. **Occupancy grid is static** — Built once at init from terrain + buildings. Units
   do not block tiles yet (deferred to FEN-03+).
6. **Blocked marker feedback** — Right-clicking on a blocked tile shows a red X marker.

## Files Changed (14)

### New files (5)
- `fe-next/src/core/assets.js` — Minimal asset loader
- `fe-next/src/game/occupancy.js` — Occupancy grid builder
- `fe-next/src/systems/pathfinding.js` — Pure BFS pathfinding
- `fe-next/src/systems/movement.js` — Runtime movement orchestrator
- `docs/patches/FEN-02.md` — This file

### Modified files (9)
- `fe-next/index.html` — Added script tags for new modules, updated title
- `fe-next/src/core/constants.js` — Added BLOCKED_TERRAIN, ASSET_MANIFEST, BLOCKED_MARKER_COLOR
- `fe-next/src/game/state.js` — Removed movement runtime, added path/occupancy fields
- `fe-next/src/render/renderer.js` — Optional sprite rendering with geometric fallback
- `fe-next/src/input/input.js` — Uses MOVEMENT.issueMoveCommand (path-aware)
- `fe-next/src/main.js` — Asset loading init, occupancy grid init, movement wiring
- `fe-next/src/ui/hud.js` — Uses MOVEMENT.findUnit for selection info
- `tests/e2e/fe-next-smoke.spec.js` — Added pathfinding/occupancy/asset tests
- `docs/patches/INDEX.md` — Added FEN-02 entry

## Test Verification

All existing FEN-01 smoke tests still pass plus new tests for:
1. Occupancy grid built on boot
2. BFS pathfinding finds valid path around building
3. BFS returns null for unreachable destination
4. Asset store created and stats available
5. Units path around buildings (not through them)
6. Blocked marker shown for impassable right-click target
7. Root game (index.html, src/main.js, runtime_flags.js) unchanged
