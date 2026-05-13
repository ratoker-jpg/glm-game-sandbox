# ARCH-AI-05C-DESIGN — Enemy Tank Decision / Priority Stack Migration Design

**Date:** 2026-05-13
**PR:** TBD
**Branch:** TBD
**Scope:** Docs-only — design document for enemy tank tactical decision migration from legacy FE_10H1 to FE_TANK_DECIDER

## Summary

This document defines the design for migrating enemy tank tactical decisions (defend, retreat, stand-and-fight, keep attacking, idle) from the legacy FE_10H1 retreat-and-defense system to the `src/ai/tank_decider.js` Priority Stack module. The document covers current systems analysis, gap identification, target priority stack, migration path, and QA criteria. No code changes are proposed in this PR.

---

## 1. Why 05C Design Is Needed

There are two parallel decision systems governing enemy tank behavior in `src/main.js`:

1. **Legacy FE_10H1 retreat/defense system** (lines 6662–7026): A bulk-oriented system that evaluates all enemy tanks together, decides whether to retreat or defend HQ, and issues movement/attack orders for the entire group. It owns the `game.enemyRetreatMvp` telemetry object and the `state.phase` state machine transitions (defend → regroup → prepare_attack → attack).

2. **FE_TANK_DECIDER Priority Stack** (`src/ai/tank_decider.js`): A per-tank decision module that evaluates each enemy light_tank independently through a priority stack of rules (defend_hq → retreat → keep_attacking → idle). It owns the `game._tankDecider01` telemetry object and uses `_tankDeciderManagedAt` markers to suppress legacy overwrites.

The problem: `FE_TANK_DECIDER_ENABLED` defaults to `false` in `src/config/runtime_flags.js` (line 111). The decider is not yet a safe replacement for 10H1 because it partially overlaps with 10H1 behavior but does not cover all decision paths. Enabling it today would produce behavioral regressions in several specific scenarios (detailed in Section 5). A design document is needed to clearly define the gap, the target behavior, and the staged migration path before any implementation work begins.

---

## 2. Current Systems Map

### 2.1 FE_10H1 Family (main.js lines 6662–7026)

| Function | Lines (approx.) | Responsibility |
|----------|-----------------|----------------|
| `FE_10H1_getGameObject()` | 6663–6668 | Accessor: delegates to FE_10E1/FE_10D1 or `game` |
| `FE_10H1_getTelemetry()` | 6670–6688 | Lazily initializes `game.enemyRetreatMvp` telemetry |
| `FE_10H1_getEnemyHq(state)` | 6690–6698 | Resolves enemy HQ via 08B, 10D1, or 10E1 |
| `FE_10H1_getEnemyTanks()` | 6700–6703 | Returns enemy combat units via FE_PATCH_08B |
| `FE_10H1_isScout(unit)` | 6705–6708 | Checks if unit is a scout |
| `FE_10H1_isRetreating(unit)` | 6710–6716 | Checks if unit has retreat role marker |
| `FE_10H1_hasActiveAttackOrder(unit)` | 6718–6732 | Checks if unit has any active attack state/order |
| `FE_DEFENSE_RETREAT01ShouldStandAndFight(unit, state, threats, now)` | 6737–6777 | Stand-and-fight guard: near home + valid target in range |
| `FE_10H1_clearAttackOrder(unit)` | 6779–6789 | Clears attack state on a unit |
| `FE_10H1_moveToSafePoint(unit, enemyHQ, index, state)` | 6791–6806 | Returns unit home via FE_PATCH_08BReturnUnitHome or 10E1 |
| `FE_10H1_getLocalPlayerThreatsNearHq(enemyHQ, radius)` | 6808–6828 | Collects player tank threats near enemy HQ |
| `FE_10H1_getPlayerThreatEstimate()` | 6830–6839 | Returns player threat estimate from 10E1 |
| `FE_10H1_shouldRetreat(state, enemyTanks, telemetry)` | 6841–6869 | Bulk retreat decision logic |
| `FE_10H1_startRetreat(state, enemyTanks, enemyHQ, telemetry, reason, now, threats)` | 6871–6928 | Executes retreat for all eligible tanks, sets phase='regroup' |
| `FE_10H1_defendHqWithAvailableTanks(state, enemyTanks, enemyHQ, threats, telemetry, now)` | 6930–6981 | Assigns tanks to defend HQ against threats |
| `FE_10H1_updateEnemyRetreatAndDefenseMvp(state, enemyTanks, now)` | 6983–7025 | Top-level 10H1 orchestrator: defend → retreat → cooldown → idle |

### 2.2 FE_DEFENSE_RETREAT01ShouldStandAndFight (main.js lines 6737–6777)

This function implements a "stand-and-fight" guard that prevents tanks near home with valid targets from being pulled into retreat or reassigned to defense. It checks:

1. Tank has an active attack/approach target (resolved via FE_PATCH_06B)
2. Target is alive (hp > 0)
3. Tank is near home (within `FE_DEFENSE_RETREAT_01_NEAR_HOME_RADIUS` = 6 tiles)
4. Current target is in range or near range (within `stats.range + FE_DEFENSE_RETREAT_01_NEAR_RANGE_MARGIN` = range + 2)

If all conditions are met, the tank keeps its current attack order and is not reassigned. This guard writes to `game._botDefenseRetreat01` telemetry.

### 2.3 Tank Decider Wiring in updateEnemyBot (main.js lines 7479–7656)

When `FE_TANK_DECIDER_ENABLED` is true, the following per-tank loop runs:

1. Build context object `_tdCtx` for each tank with: tank snapshot, botState snapshot, homeBase, threatsNearHome (from FE_10H1_getLocalPlayerThreatsNearHq), nearbyThreats (scanned inline), currentOrder, helpers (isAlive, distTiles, resolveTarget, getCombatStats)
2. Call `window.FE_TANK_DECIDER.evaluateTankDecision(_tdCtx)`
3. Execute the decision result through existing helpers:
   - `defend_hq` → `FE_PATCH_08BCommandEnemyTankAttack(tank, target, state, 'defend')`
   - `retreat` → `FE_10H1_moveToSafePoint(tank, enemyHQ, index, state)` or `FE_10E1_returnToHq`
   - `keep_attacking` → mark `_tankDeciderManagedAt` to prevent legacy overwrite
   - `idle` → no action, let legacy handle
4. Set `_tankDeciderManagedAt` and `_tankDeciderLastAction` on managed tanks
5. Legacy 10H1 checks `_tankDeciderManagedAt` to skip decider-managed tanks (2-second window)

### 2.4 FE_ATTACK10 Wave Logic (main.js lines 3451–3625)

| Function | Responsibility |
|----------|----------------|
| `FE_ATTACK10CreateWave(state, targetId, unitIds, orderType)` | Creates a new attack wave, locks units |
| `FE_ATTACK10ReleaseWave(state, reason)` | Releases wave, unlocks units |
| `FE_ATTACK10IsWaveLocked(unit)` | Checks if unit is in a locked wave |
| `FE_ATTACK10IsWaveTargetAlive(state)` | Checks if wave target still exists |
| `FE_ATTACK10AliveWaveUnitCount(state)` | Counts alive units in wave |
| `FE_ATTACK10GetReserveTanks(enemyTanks, state)` | Gets tanks not in a wave |
| `FE_ATTACK10UpdateTelemetry(state)` | Updates wave telemetry |
| `FE_ATTACK10CheckAndRelease(state)` | Auto-releases wave if target dead / all dead / game ended |

Wave logic is bulk-level: it operates on groups of tanks committed to an attack target. Tank decider respects wave locks via `_attack10WaveLocked` — wave-locked tanks are not recalled by defend_hq or retreat rules.

### 2.5 FE_PATCH_08BPrepareAttack (main.js lines 5192–5430+)

This is the main attack dispatch function. It:
1. Checks army score threshold
2. Resolves attack target via FE_PATCH_08BAttackTarget
3. If no vision target, runs ATTACK-12 intel gate (FE_ATTACK12EvaluateAttackDecision)
4. If intel gate passes, runs ATTACK-11 intel rally (FE_ATTACK11ChooseIntelTarget)
5. Assigns tanks to attack or intel rally
6. Creates attack wave via FE_ATTACK10CreateWave

This function is **wave-level dispatch**, not per-tank decision. It remains in main.js and is not in scope for the tank decider migration.

### 2.6 FE_PATCH_08BCommandEnemyTankAttack (main.js lines 2972–3010)

Issues an attack order to a specific tank. Checks order gap, range, sets attackTargetId/attackApproachTargetId, updates last order timestamp. Used by both 10H1 defend logic and tank decider defend_hq execution.

### 2.7 FE_PATCH_08BReturnUnitHome (main.js lines 3048–3066)

Returns a unit to its home destination. Checks wave lock, computes home cell, checks order gap, issues silent move. Used by 10H1 retreat logic and tank decider retreat execution (via FE_10H1_moveToSafePoint).

### 2.8 Telemetry Fields

| Object | Location | Written by |
|--------|----------|------------|
| `game.enemyRetreatMvp` | main.js line 6673 | FE_10H1_getTelemetry (init), FE_10H1_startRetreat, FE_10H1_defendHqWithAvailableTanks, FE_10H1_updateEnemyRetreatAndDefenseMvp |
| `game._tankDecider01` | main.js line 7487 | updateEnemyBot tank decider block |
| `game._botDefenseRetreat01` | main.js line 6761 | FE_DEFENSE_RETREAT01ShouldStandAndFight |
| `game._attack04LastOverrideCheck` | main.js line 7721 | updateEnemyBot ATTACK-04 override logic |

---

## 3. Current tank_decider.js API

### 3.1 Entry Point

```
window.FE_TANK_DECIDER.evaluateTankDecision(context) → result
```

### 3.2 Current Rules (evaluated highest-priority-first)

| Priority | Rule Name | Conditions |
|----------|-----------|------------|
| 100 | `defend_hq_if_base_threatened` | threatsNearHome exists, tank near home or idle, not wave-locked, not hq_push, not already fighting near home |
| 90 | `retreat_if_losing_or_overextended` | HP < 25%, or outnumbered (2+ nearby + HP < 60%), or overextended (dist > 20 + HP < 55%); skipped if wave-locked or stand-and-fight near home |
| 80 | `keep_attacking_valid_current_target` | Has attackTargetId/attackApproachTargetId, target alive, in attack_approach/attacking state, has path or in range |
| 10 | `idle_fallback` | Always matches — no rule matched |

### 3.3 Current Result Shape

```javascript
{
  action:              string,  // 'defend_hq' | 'retreat' | 'keep_attacking' | 'idle'
  priority:            number,  // rule priority (100, 90, 80, 10)
  reason:              string,  // human-readable reason
  targetId:            any,     // target unit ID (defend_hq) or null
  targetX:             number,  // target X (retreat: home X) or null
  targetY:             number,  // target Y (retreat: home Y) or null
  ruleName:            string,  // exact rule name
  suppressLegacyOrders: boolean, // whether to suppress legacy 10H1 overwrite
  telemetry:           object   // { evaluatedRules: number }
}
```

### 3.4 Current Context Shape

```javascript
{
  tank: {
    id, type, hp, maxHp, x, y, state, command,
    attackTargetId, attackApproachTargetId, attackTarget,
    hasPath, _attack10WaveLocked, _attack11IntelRally,
    _fe10h1Role, _attackCommanded
  },
  botState: {
    phase, homeX, homeY, _attack02HqPush
  },
  homeBase: { x, y, hp, id },
  threatsNearHome: [{ unit, distance }],
  nearbyThreats: [{ unit, distance }],
  currentOrder: {
    state, attackTargetId, attackApproachTargetId,
    command, targetX, targetY, hasPath
  },
  helpers: {
    isAlive(obj), distTiles(a, b), resolveTarget(id), getCombatStats(tank)
  },
  now: number,        // performance.now()
  gameTime: number    // game.time
}
```

---

## 4. Important Correction

**tank_decider partially overlaps with 10H1 but is not yet a safe replacement.**

The decider's `defend_hq_if_base_threatened` rule overlaps with `FE_10H1_defendHqWithAvailableTanks`, and its `retreat_if_losing_or_overextended` rule overlaps with `FE_10H1_shouldRetreat` + `FE_10H1_startRetreat`. However, the decider lacks several critical behaviors that 10H1 provides:

- Bulk phase management (state.phase transitions: defend → regroup → prepare_attack → attack)
- Retreat cooldown management (state.regroupUntil, state.retreatCooldownUntil)
- hq_push army score evaluation logic
- Stand-and-fight near home with full DEFENSE_RETREAT01 conditions
- Threat collection via the 10H1/10E1/10D1 helper chain

Replacing 10H1 with the current decider would cause tanks to lose regroup coordination, retreat cooldowns, and the nuanced hq_push protection logic.

---

## 5. Gap List Before Enabling FE_TANK_DECIDER_ENABLED=true

### Gap 1: Regroup State Management Missing

The decider has no concept of a "regroup" phase. When 10H1 triggers retreat, it sets `state.phase = 'regroup'`, `state.regroupUntil = now + cooldown`, and `state.retreatCooldownUntil = now + cooldown`. The updateEnemyBot function then holds tanks near home until regroupUntil expires. The decider's retreat rule sends a tank home but has no mechanism to coordinate a cooldown period across all tanks before the next attack cycle begins.

### Gap 2: state.phase Ownership Unclear

Currently, `state.phase` is mutated by both 10H1 (setting 'defend', 'regroup') and by the updateEnemyBot main flow (setting 'prepare_attack', 'attack'). The decider does not write to `state.phase` at all. If 10H1 is disabled and the decider takes over per-tank decisions, nothing manages the global phase transitions. This means `FE_PATCH_08BPrepareAttack` would never be called (it only runs when `state.phase === 'prepare_attack'`), and the bot would never launch a new attack wave.

### Gap 3: state.regroupUntil / retreatCooldownUntil Ownership Unclear

These fields are set by `FE_10H1_startRetreat` and consumed by the regroup block in updateEnemyBot (line 7768: `if (state.phase === 'regroup')` / `if (now < state.regroupUntil) return`). The decider does not set or read these fields. Without them, there is no cooldown mechanism between retreat and the next attack attempt, leading to oscillation (retreat → immediately prepare_attack → attack → retreat).

### Gap 4: hq_push Army Score Logic Not Fully Represented

The 10H1 retreat logic includes nuanced hq_push protection (FE_10H1_shouldRetreat lines 6854–6867): during hq_push, retreat is only triggered for critical reasons (last tank, >50% losses, 2:1 outnumbering). The decider's retreat rule checks `_attack02HqPush` to skip retreat entirely, but this is an all-or-nothing guard. It does not implement the graduated "allow retreat only if critical" logic that 10H1 uses for hq_push armies. A tank on hq_push with 3 HP tanks facing 6 player tanks would never retreat under the current decider (blocked entirely), whereas 10H1 would allow retreat because `enemyTankCount * 2 <= playerThreatEstimate`.

### Gap 5: DEFENSE_RETREAT01 Stand-and-Fight Overlap Not Fully Migrated

The decider's retreat rule has an approximation of stand-and-fight (lines 114–126): if a tank is near home (6 tiles) and has a target in range + 2 tiles, skip retreat. However, `FE_DEFENSE_RETREAT01ShouldStandAndFight` uses more precise checks:

- Resolves attack/approach targets via `FE_PATCH_06BResolveAttackTarget` / `FE_PATCH_06BResolveApproachTarget`
- Uses `unitDistanceCells` for distance (not Manhattan distance)
- Checks `FE_DEFENSE_RETREAT_01_NEAR_HOME_RADIUS` (6) and `FE_DEFENSE_RETREAT_01_NEAR_RANGE_MARGIN` (2) constants
- Writes telemetry to `game._botDefenseRetreat01`

The decider's approximation uses `helpers.distTiles` (Manhattan distance), which differs from `unitDistanceCells` (potentially Chebyshev or Euclidean depending on implementation). This discrepancy could cause false positives or false negatives in stand-and-fight decisions.

### Gap 6: Bulk-vs-Per-Tank Decision Divergence

10H1 makes a single decision for all tanks (defend all → or retreat all → or cooldown hold all), then iterates tanks to execute. This bulk approach means that if any tank should defend, all tanks defend. If retreat is warranted, all eligible tanks retreat. The decider makes independent per-tank decisions, which can produce mixed states: some tanks defending while others retreat, breaking the coordinated behavior that 10H1 provides. In practice, this means:

- During HQ defense, the decider may only send nearby tanks to defend while distant tanks idle — 10H1 sends all tanks to defend
- During retreat, the decider may only retreat low-HP tanks while high-HP tanks keep attacking — 10H1 retreats all tanks and sets regroup phase

### Gap 7: Telemetry Compatibility Issue

The 10H1 system writes to `game.enemyRetreatMvp` (with fields: status, phase, retreatActive, retreatReason, localThreatCount, etc.). The decider writes to `game._tankDecider01` (with fields: enabled, evaluated, applied, skipped, perRuleCounts, suppressedLegacyBlocks). These are separate telemetry objects with no bridge. Any monitoring or debug tools that read `enemyRetreatMvp` would show stale or missing data if 10H1 is bypassed by the decider. The decider's telemetry is per-tick counts, not the structured phase/status that `enemyRetreatMvp` provides.

### Gap 8: Threat Collection Helper Dependency

The decider context builder (main.js lines 7501–7507) calls `FE_10H1_getLocalPlayerThreatsNearHq` to populate `threatsNearHome`. This function internally calls `FE_10E1_getUnitList` and `FE_10D1_isPlayerUnit` and `FE_10D1_distTiles` and `enemyCanSeeTarget`. If 10H1 is removed, this threat collection helper must either be preserved or replaced. The decider does not have its own threat collection mechanism — it depends on 10H1 helpers.

---

## 6. Target Priority Stack

This section documents the target priority stack. This is a design specification, not implementation.

### 6.1 Stack Order (highest priority first)

| Priority | Rule | Condition Summary |
|----------|------|-------------------|
| 100 | `defend_hq` | Player threats near enemy HQ; tank is near home or idle; not wave-locked; not on hq_push |
| 95 | `stand_and_fight_near_home` | Tank is near home (6 tiles), has valid current target in/near range, player pressure near base; should keep fighting instead of retreating or being reassigned |
| 90 | `retreat_if_losing_or_overextended` | HP critically low, or outnumbered and weakened, or overextended and weakened; graduated hq_push exception (allow retreat only for critical reasons during hq_push) |
| 80 | `keep_attacking_valid_current_target` | Tank has valid attack/approach target, target alive, in attack state, has path |
| 10 | `idle_fallback` | No rule matched; let legacy handle |

### 6.2 Key Design Decisions

**stand_and_fight_near_home is a separate rule (priority 95), not a sub-condition of retreat.** In the current decider, stand-and-fight is an early-return inside the retreat rule. Making it a separate rule at priority 95 has two benefits: (1) it produces an explicit `stand_and_fight` action result (instead of retreat returning null), which improves telemetry visibility; (2) it places the rule between defend_hq and retreat in the priority order, which correctly models the tactical priority: defend HQ first, then keep fighting if near home, then retreat if losing, then keep attacking if valid target exists.

**Attack-wave dispatch is NOT a per-tank decider rule.** Attack dispatch remains a wave-level responsibility of `FE_PATCH_08BPrepareAttack`. The decider's job is per-tank tactical decisions: what should this specific tank do right now. Group-level decisions (when to launch an attack wave, which target to attack, how many tanks to send) belong to the wave dispatch system, not the per-tank decider.

**Regroup is a phase, not a per-tank rule.** When the bot enters regroup phase (all tanks retreat home and wait for cooldown), this is a global state managed by the phase machine in updateEnemyBot, not a per-tank decision. Individual tanks in regroup phase would receive `idle_fallback` or `retreat` decisions from the decider, but the phase transition itself is not a decider responsibility.

---

## 7. Recommended Migration Path

### 7.1 05C1: Update tank_decider Contract/Rules (No main.js Behavior Change)

**Scope:** Add `stand_and_fight_near_home` rule to `src/ai/tank_decider.js`, update context shape documentation, add constants for thresholds.

**Changes:**
- Add `stand_and_fight_near_home` rule at priority 95 in tank_decider.js
- Add `TANK_DECIDER_CONSTANTS` to tank_decider.js (NEAR_HOME_RADIUS, NEAR_RANGE_MARGIN, RETREAT_HP_THRESHOLD, etc.)
- Update context shape to include missing fields needed for stand_and_fight (unitDistanceCells or equivalent)
- Add validators for the new result action (`stand_and_fight`)
- `FE_TANK_DECIDER_ENABLED` remains `false`
- No main.js changes
- No behavior changes

**Risk:** Low. Additive-only changes to the decider module. Legacy code untouched.

### 7.2 05C2: Improve Context Builder / Wiring (Flag Remains false or Dev-Only)

**Scope:** Update the context builder in updateEnemyBot to provide richer data for the decider, wire hq_push graduated retreat logic into the context.

**Changes:**
- Extend context builder to include: playerThreatEstimate, enemyTankCount, previousEnemyTankCount, retreatCooldownUntil, regroupUntil
- Add graduated hq_push retreat logic to the retreat rule (allow critical retreat during hq_push)
- Wire stand_and_fight using unitDistanceCells instead of Manhattan distTiles
- Optionally: add regroup coordination signal to context (whether a global retreat was triggered this tick)
- `FE_TANK_DECIDER_ENABLED` remains `false` by default; can be enabled in dev console for testing
- main.js context builder changes only (no 10H1 removal)
- Add telemetry bridge: write decider summary to `game.enemyRetreatMvp` fields for compatibility

**Risk:** Medium. Context builder changes affect runtime when decider is enabled, but it remains disabled by default.

### 7.3 05C3: Enable FE_TANK_DECIDER_ENABLED (After QA Criteria Met)

**Scope:** Flip `FE_TANK_DECIDER_ENABLED` to `true` in `src/config/runtime_flags.js` after all QA criteria from Section 10 are met.

**Changes:**
- Set `window.FE_TANK_DECIDER_ENABLED = true` in runtime_flags.js
- Update 10H1 block in updateEnemyBot to be a fallback (only run when decider is disabled)
- Verify that `_tankDeciderManagedAt` suppression of 10H1 works correctly for all tank states

**Risk:** High. This is the behavioral flip. Must only happen after comprehensive QA.

### 7.4 05C4: Remove Legacy 10H1 Fallback (Reduce main.js)

**Scope:** Remove the legacy FE_10H1 code path, simplify updateEnemyBot decision flow.

**Changes:**
- Remove FE_10H1 family functions (approximately 350+ lines)
- Remove 10H1 hook block in updateEnemyBot (approximately 50+ lines)
- Remove `_tankDeciderManagedAt` suppression checks in 10H1 functions (no longer needed)
- Move threat collection helper to decider or a shared utility
- Update telemetry to use decider telemetry exclusively (or maintain bridge)
- Net main.js reduction: roughly 200–350 lines

**Risk:** High. Final removal of legacy path. Must verify no behavioral regressions through extensive playtesting.

---

## 8. What Stays in main.js

The following remain in main.js even after full 05C migration:

- **Command execution** — `FE_PATCH_08BCommandEnemyTankAttack` issues actual attack orders
- **Movement/pathfinding calls** — `FE_PATCH_08BSilentMoveTo`, `FE_PATCH_08BReturnUnitHome`
- **FE_PATCH_08BCommandEnemyTankAttack** — attack order issuance
- **FE_PATCH_08BReturnUnitHome** — return-to-base movement
- **FE_ATTACK10 wave state** — wave creation, lock, release, telemetry
- **FE_PATCH_08BPrepareAttack** — attack dispatch logic (wave-level, not per-tank)
- **Telemetry writes** — until separated in a later ARCH step
- **Global bot phase manager** — `state.phase` transitions (regroup → prepare_attack → attack → defend) unless separately extracted
- **FE_PATCH_08BEnsureBotState** — state initialization and persistence
- **FE_PATCH_BRAIN_01_ChoosePriorityAction** — top-level brain priority loop
- **10E1 strength gate** — enemy strength estimation
- **10D1 autopilot** — idle patrol behavior
- **10C1 scouting** — scout lifecycle

The decider module (`src/ai/tank_decider.js`) owns only the **per-tank tactical decision** (what should this tank do right now). It does not own wave dispatch, phase management, command execution, or movement. These remain in main.js as the composition/wiring layer.

---

## 9. Hard Limits for Future Implementation

The following must NOT be touched without explicit future approval:

- **pathfinding/findPath/passable/inBounds** — core pathfinding infrastructure
- **combat damage/range/cooldown** — combat execution mechanics
- **scout lifecycle** — FE_10C1 scouting system
- **production/economy/caps** — economy and production systems
- **enemy_targeting wrappers** — FE_ATTACK11/12 delegation wrappers (05B/05B2/05B3)
- **FE_PATCH_08BPrepareAttack execution** — attack dispatch logic
- **save/load** — game state persistence
- **render/input/selection** — UI and rendering
- **runtime flags** — `src/config/runtime_flags.js` (except the FE_TANK_DECIDER_ENABLED flip in 05C3)
- **tests** — test infrastructure and test files
- **assets** — visual and audio assets

---

## 10. QA Criteria Before Enabling Decider by Default

Before `FE_TANK_DECIDER_ENABLED` can be set to `true` by default, all of the following criteria must be met:

1. **E2E 6/6 PASS** — All existing Playwright E2E smoke tests pass with the decider enabled
2. **Manual skirmish with decider enabled** — At least one full skirmish game played to completion (win or lose) with `FE_TANK_DECIDER_ENABLED = true`, verifying normal bot behavior throughout
3. **Enemy defends HQ when attacked** — When player tanks approach enemy HQ, at least some enemy tanks must issue defend orders and engage the player tanks near the base
4. **Enemy retreats when losing** — When enemy tanks are significantly outnumbered or have critically low HP, they must retreat toward base instead of continuing to fight
5. **Enemy keeps attack when valid target exists** — When enemy tanks have a valid attack target in range, they must not be pulled into retreat or reassign (stand-and-fight)
6. **hq_push tanks are not recalled incorrectly** — Tanks committed to an hq_push attack on the player base must not be recalled for base defense unless the situation is critical (>50% losses or 2:1 outnumbering)
7. **Intel rally tanks are not overwritten** — Tanks on intel rally (moving to scout-identified rally point) must not have their rally orders cancelled by defend/retreat decisions
8. **Telemetry remains readable** — Both `game.enemyRetreatMvp` and `game._tankDecider01` must contain meaningful, non-stale data that correctly reflects the current bot state

---

## 11. Architecture KPI

| Metric | Value |
|--------|-------|
| src/main.js touched | **No** — this is a docs-only PR |
| main.js line count before | 15,641 |
| main.js line count after | 15,641 |
| main.js delta | **0** |
| This PR type | Design-only |
| Future reduction opportunity | Removing FE_10H1 fallback may reduce main.js by roughly 200–350 lines, but only after safe migration through 05C1–05C4 |

---

## 12. Files Changed

| File | Action | Description |
|------|--------|-------------|
| `docs/patches/ARCH-AI-05C-DESIGN.md` | NEW | This design document |
| `docs/patches/INDEX.md` | MOD | Added ARCH-AI-05C-DESIGN entry |

## Files NOT Touched

- `src/main.js` — no changes
- `src/ai/tank_decider.js` — no changes
- `src/ai/enemy_targeting.js` — no changes
- `src/ai/enemy_intel.js` — no changes
- `src/config/runtime_flags.js` — no changes (FE_TANK_DECIDER_ENABLED stays false)
- `index.html` — no changes
- `tests/` — no changes
- `assets/` — no changes
- `package.json` / `package-lock.json` / `bun.lock` — no changes

---

## No Behavior Changes

- No runtime behavior changes
- No decision logic changes
- No telemetry changes
- No flag changes
- No code changes whatsoever

---

## Verification

- No code changes to verify — docs-only PR
- Confirm `git diff --name-only origin/sandbox/main...HEAD` shows only docs/patches/ files
