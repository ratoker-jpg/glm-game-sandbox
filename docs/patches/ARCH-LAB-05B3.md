# ARCH-LAB-05B3 — Enemy Targeting Fallback Cleanup

**Date:** 2026-05-14
**Branch:** `glm/arch-lab-05b3-enemy-targeting-fallback-cleanup`
**Scope:** Fallback removal — remove legacy inline code from ATTACK11/ATTACK12 wrappers
**Prerequisite:** ARCH-LAB-05B2 (#87) — runtime wiring with delegation guards + legacy fallback

## Summary

Remove legacy fallback bodies from `FE_ATTACK11ChooseIntelTarget()` and
`FE_ATTACK12EvaluateAttackDecision(enemyTanks, now)` in main.js, making them
thin delegation wrappers around `window.FE_ENEMY_TARGETING`.

This PR completes the migration started in ARCH-LAB-05B (#86) and wired in
ARCH-LAB-05B2 (#87). The module is always loaded before main.js (script order
in index.html: line 805 enemy_targeting.js, line 810 main.js), so the
fallback code was defensive and is no longer needed after QA PASS of #87.

## What was changed

### src/main.js

Two functions converted from delegation-with-fallback to thin wrappers:

#### FE_ATTACK11ChooseIntelTarget (line ~4018)

**Before (05B2):** 45-line function with delegation guard + full legacy fallback body
**After (05B3):** 6-line thin wrapper

```
function FE_ATTACK11ChooseIntelTarget() {
  return window.FE_ENEMY_TARGETING.chooseIntelTarget(
    game && game.enemyIntel,
    game ? (game.time || 0) : 0
  );
}
```

Removed: delegation guard (`if (typeof window !== 'undefined' && ...)`) and
entire legacy fallback body (35 lines of inline intel target selection logic).

#### FE_ATTACK12EvaluateAttackDecision (line ~4031)

**Before (05B2):** 111-line function with delegation guard + full legacy fallback body
**After (05B3):** 24-line thin wrapper with adapter + options

```
function FE_ATTACK12EvaluateAttackDecision(enemyTanks, now) {
  var _a12statuses = [];
  for (var _a12si = 0; _a12si < (enemyTanks || []).length; _a12si++) {
    var _a12su = enemyTanks[_a12si];
    _a12statuses.push({
      isAlive: !!_a12su && (_a12su.hp || 0) > 0,
      isIntelRally: !!(_a12su && _a12su._attack11IntelRally),
      isWaveLocked: !!(_a12su && typeof FE_ATTACK10IsWaveLocked === 'function' && FE_ATTACK10IsWaveLocked(_a12su)),
      hasAttackTargetId: !!(_a12su && _a12su.attackTargetId),
      hasAttackApproachTargetId: !!(_a12su && _a12su.attackApproachTargetId)
    });
  }
  return window.FE_ENEMY_TARGETING.evaluateAttackDecision(
    game && game.enemyIntel,
    _a12statuses,
    now,
    {
      attack11DispatchSource: game && game._botAttack11 ? (game._botAttack11.dispatchSource || '') : '',
      maxIntelAgeSec: FE_ATTACK12_MAX_INTEL_AGE_SEC,
      minAttackTanks: FE_ATTACK12_MIN_ATTACK_TANKS,
      forceAdvantage: FE_ATTACK12_FORCE_ADVANTAGE
    }
  );
}
```

Removed: delegation guard and entire legacy fallback body (85 lines of inline
decision logic, tank counting, intel evaluation, and full ATTACK-12 result
construction).

### What was NOT removed

- `FE_ATTACK12_MAX_INTEL_AGE_SEC` (180) — kept in main.js, passed via options
- `FE_ATTACK12_MIN_ATTACK_TANKS` (2) — kept in main.js, passed via options
- `FE_ATTACK12_FORCE_ADVANTAGE` (1) — kept in main.js, passed via options
- tankStatuses adapter — kept in main.js, necessary for closure access
- options object — kept in main.js, necessary for closure access

These constants remain in main.js scope because they are also referenced by
other functions outside ATTACK11/12 (e.g., telemetry at lines 7563-7564).
Replacing them with `FE_ENEMY_TARGETING.ATTACK12_DEFAULTS` is separate scope.

## What was NOT changed (hard limits respected)

- `FE_PATCH_08BPrepareAttack` — untouched (calls ATTACK12, call site not modified)
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
- `src/ai/enemy_targeting.js` — untouched
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
- Decision output shape (full ATTACK-12 result shape) is identical
- Return shape of ATTACK11 (7-field object or null) is identical

## Files changed

| File | Action | Description |
|------|--------|-------------|
| `src/main.js` | MOD | 2 functions: legacy fallback removed, now thin wrappers |
| `docs/patches/ARCH-LAB-05B3.md` | NEW | This document |
| `docs/patches/INDEX.md` | MOD | Added ARCH-LAB-05B3 entry |

## Architecture KPI

| Metric | Value |
|--------|-------|
| main.js lines before | 15,766 |
| main.js lines after | 15,641 |
| net delta | **-125** |
| fallback lines removed | 125 (35 ATTACK11 body + 85 ATTACK12 body + 5 guard lines) |
| functions changed in main.js | 2 (FE_ATTACK11ChooseIntelTarget, FE_ATTACK12EvaluateAttackDecision) |
| functions removed from main.js | 0 (functions still exist as thin wrappers) |
| whether this PR reduces main.js | **Yes** — first main.js-reducing architecture PR |

## Fallback removal justification

1. **Script load order verified**: `src/ai/enemy_targeting.js` loads at index.html line 805,
   `src/main.js` loads at line 810. Module is always available before main.js runs.
2. **QA PASS of #87**: Both delegation paths exercised in e2e tests (6/6 pass) with
   the module active, confirming behavior equivalence.
3. **No runtime path where module is missing**: In production, both scripts are bundled
   in index.html. There is no lazy loading or conditional script injection.
4. **Pure functions**: Both `chooseIntelTarget` and `evaluateAttackDecision` are
   read-only, no side effects, no mutations — safe to delegate unconditionally.

## Verification

- `node --check src/main.js` — pass
- `node --check src/ai/enemy_targeting.js` — pass
- `node --check src/config/runtime_flags.js` — pass
- `npm run test:e2e` — 6/6 pass
