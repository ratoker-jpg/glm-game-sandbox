# ARCH-LAB-05B2 — Enemy Targeting Runtime Wiring

**Date:** 2026-05-14
**Branch:** `glm/arch-lab-05b2-enemy-targeting-wiring`
**Scope:** Runtime wiring — delegation from main.js wrappers to FE_ENEMY_TARGETING module with legacy fallback

## Summary

Wire `FE_ATTACK11ChooseIntelTarget()` and `FE_ATTACK12EvaluateAttackDecision(enemyTanks, now)` in main.js
to `window.FE_ENEMY_TARGETING` module functions, with full legacy fallback when module is unavailable.

This PR activates the contract created in ARCH-LAB-05B (#86). Runtime behavior is preserved exactly —
when `FE_ENEMY_TARGETING` is available, delegation is used; when not, original inline code runs unchanged.

## What was changed

### src/main.js

Two functions modified to become delegation wrappers with legacy fallback:

#### FE_ATTACK11ChooseIntelTarget (line ~4018)

- Added delegation guard at top: if `window.FE_ENEMY_TARGETING.chooseIntelTarget` exists,
  delegates with `(game.enemyIntel, game.time)` parameters
- Original body preserved as legacy fallback (unchanged)
- Return shape: 7-field object or null — identical
- No string changes, no threshold changes

#### FE_ATTACK12EvaluateAttackDecision (line ~4068)

- Added delegation guard at top: if `window.FE_ENEMY_TARGETING.evaluateAttackDecision` exists,
  builds tankStatuses adapter and options object, then delegates
- **tankStatuses adapter** preserves all 5 legacy checks:
  - `isAlive`: `!!u && (u.hp || 0) > 0`
  - `isIntelRally`: `!!(u && u._attack11IntelRally)`
  - `isWaveLocked`: `!!(u && typeof FE_ATTACK10IsWaveLocked === 'function' && FE_ATTACK10IsWaveLocked(u))`
  - `hasAttackTargetId`: `!!(u && u.attackTargetId)`
  - `hasAttackApproachTargetId`: `!!(u && u.attackApproachTargetId)`
- **options object** passes closure values as explicit parameters:
  - `attack11DispatchSource`: `game._botAttack11.dispatchSource`
  - `maxIntelAgeSec`: `FE_ATTACK12_MAX_INTEL_AGE_SEC` (180)
  - `minAttackTanks`: `FE_ATTACK12_MIN_ATTACK_TANKS` (2)
  - `forceAdvantage`: `FE_ATTACK12_FORCE_ADVANTAGE` (1)
- Original body preserved as legacy fallback (unchanged)
- Return shape: full ATTACK-12 result shape — identical
- No decision string changes, no threshold changes

### src/ai/enemy_targeting.js

Comments only — replaced stale "20 fields" / "20-field" wording with "full ATTACK-12 result shape".
No logic, constants, validators, factories, or function behavior changes.

## What was NOT changed (hard limits respected)

- `FE_PATCH_08BPrepareAttack` — untouched (calls ATTACK12, but call site not modified)
- `FE_PATCH_08BSilentMoveTo` — untouched
- `FE_PATCH_08BCommandEnemyTankAttack` — untouched
- `FE_PATCH_08BReturnUnitHome` — untouched
- `FE_ATTACK10*` wave creation/lock/release — untouched (FE_ATTACK10IsWaveLocked only called in adapter, not modified)
- `hq_push` logic — untouched
- Scout lifecycle — untouched
- `FE_10C1_trySetScoutMove` — untouched
- Pathfinding/findPath/passable/inBounds — untouched
- Production/economy/caps — untouched
- Combat damage/range/cooldown — untouched
- `updateLightTankCombat` — untouched
- `tank_decider` behavior — untouched
- `FE_TANK_DECIDER_ENABLED` default — untouched
- Render/input/selection — untouched
- Save/load — untouched
- `index.html` — untouched
- `src/ai/enemy_intel.js` — untouched
- `src/ai/tank_decider.js` — untouched
- `src/config/runtime_flags.js` — untouched
- Tests — untouched
- Assets — untouched

## No attack execution changes

- No attack order logic modified
- No rally dispatch modified
- No wave logic modified
- No telemetry writes moved
- No mutation of game objects or units
- Decision output shape is identical

## Files changed

| File | Action | Description |
|------|--------|-------------|
| `src/main.js` | MOD | 2 functions become delegation wrappers with legacy fallback |
| `src/ai/enemy_targeting.js` | MOD | Comments only: "20 fields" → "full ATTACK-12 result shape" |
| `docs/patches/ARCH-LAB-05B2.md` | NEW | This document |
| `docs/patches/INDEX.md` | MOD | Added ARCH-LAB-05B2 entry |

## Architecture KPI

| Metric | Value |
|--------|-------|
| main.js lines before | 15,730 |
| main.js lines after | ~15,755 |
| net delta | +25 |
| functions changed in main.js | 2 (FE_ATTACK11ChooseIntelTarget, FE_ATTACK12EvaluateAttackDecision) |
| functions removed from main.js | 0 |
| whether this step reduces main.js | No — increases by ~25 lines due to delegation guard + adapter |
| why wiring is still necessary | Activates FE_ENEMY_TARGETING module at runtime; enables future fallback removal (-100+ lines) |
| future cleanup path | LAB-07/05B3: remove legacy fallback → net -100+ lines from current |

## Verification

- `node --check src/main.js` — pass
- `node --check src/ai/enemy_targeting.js` — pass
- `node --check src/config/runtime_flags.js` — pass
- `npm run test:e2e` — 6/6 pass
