---
Task ID: 1
Agent: main
Task: ARCH-LAB-05B3 — enemy_targeting fallback cleanup implementation

Work Log:
- Fetched origin sandbox/main, created branch glm/arch-lab-05b3-enemy-targeting-fallback-cleanup
- Read current ATTACK11 (lines 4018-4062, 45 lines) and ATTACK12 (lines 4068-4179, 111 lines) wrappers
- Confirmed script load order: enemy_targeting.js (index.html line 805) before main.js (line 810)
- Removed legacy fallback body from FE_ATTACK11ChooseIntelTarget: 45 → 6 lines
- Removed legacy fallback body from FE_ATTACK12EvaluateAttackDecision: 111 → 24 lines (adapter + options retained)
- Kept FE_ATTACK12_MAX_INTEL_AGE_SEC / FE_ATTACK12_MIN_ATTACK_TANKS / FE_ATTACK12_FORCE_ADVANTAGE untouched
- node --check src/main.js — pass
- node --check src/ai/enemy_targeting.js — pass
- node --check src/config/runtime_flags.js — pass
- npm run test:e2e — 6/6 pass
- Created docs/patches/ARCH-LAB-05B3.md
- Updated docs/patches/INDEX.md
- Committed: 4fc89b69c5d07b4c3fdf0c1c917928304b596c6d

Stage Summary:
- main.js: 15,766 → 15,641 (net -125 lines)
- First main.js-reducing architecture PR
- Exactly 3 files changed: src/main.js, docs/patches/ARCH-LAB-05B3.md, docs/patches/INDEX.md
- Only FE_ATTACK11ChooseIntelTarget and FE_ATTACK12EvaluateAttackDecision modified
- Push not attempted (no GitHub auth in environment)
