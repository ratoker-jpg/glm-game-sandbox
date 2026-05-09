# GLM-AUDIT-01 — Sandbox Readiness Audit Report

**Task:** GLM-AUDIT-01
**Date:** 2026-05-10
**Branch:** glm/audit-01-sandbox-readiness (from sandbox/main)
**Auditor:** GLM agent
**Repo:** https://github.com/ratoker-jpg/glm-game-sandbox

---

## 1. Summary Verdict

**GO with minor caveats.**

The repository is safe for GLM browser/GitHub agent work. All dangerous sync actions are disabled. Production paths are referenced only in documentation and disabled files. The `.gitignore` covers the critical exclusions. AGENTS.md provides clear guardrails. The repo is ready for small branch-based PR tasks with one low-priority recommendation: update `package-lock.json` legacy name.

---

## 2. Files Inspected

| # | File | Status |
|---|------|--------|
| 1 | AGENTS.md | Inspected — clear and sufficient |
| 2 | README.md | Inspected — sandbox rules present |
| 3 | README_GLM_SANDBOX.md | Inspected — comprehensive sandbox guide |
| 4 | PATCH_REPORT.txt | Inspected — SANDBOX-00 preparation documented |
| 5 | .gitignore | Inspected — key folders excluded |
| 6 | package.json | Inspected — only devDependencies |
| 7 | package-lock.json | Inspected — legacy name `four_elements_core_base` |
| 8 | 00_START_GAME_WORK_8010.bat | Inspected — safe, starts local http.server |
| 9 | 01_BUILD_GPT_CONTEXT_WORK.bat | Inspected — see risk item below |
| 10 | 02_RUN_PATCH_AND_CHECK.bat | Inspected — safe, local patch runner |
| 11 | 03_PREPARE_GPT_STATE.bat | Inspected — runs prepare_gpt_state.py |
| 12 | 04_SYNC_WORK_MIRROR_TO_GOOGLE_DRIVE.DISABLED_IN_GLM_SANDBOX.bat | Inspected — correctly disabled |
| 13 | 05_RUN_VISUAL_SCENARIOS.bat | Inspected — sandbox-safe, local only |
| 14 | tools/prepare_gpt_state.py | Inspected — writes to _gpt_state/, contains prod paths |
| 15 | tools/sync_work_mirror.DISABLED_IN_GLM_SANDBOX.py | Inspected — correctly disabled |
| 16 | tools/sync_visual_screenshots.DISABLED_IN_GLM_SANDBOX.py | Inspected — correctly disabled |
| 17 | tools/audit_main.py | Inspected — safe, local read-only audit |
| 18 | tools/distill_local.py | Inspected — safe, connects to local LM Studio |
| 19 | patch.py | Inspected — safe placeholder, no-op |
| 20 | src/main.js | Inspected (first ~30 lines + SAVE_KEY/SETTINGS_KEY) — legacy key names |
| 21 | src/main_before_restore_04a.js | Inspected — legacy backup, same key names |
| 22 | src/main_broken_04c3.js | Inspected — legacy backup |
| 23 | src/main_broken_04c5.js | Inspected — legacy backup |
| 24 | index.html | Inspected — game entry point, safe |
| 25 | THIS_IS_WORK_PROJECT.txt | Inspected — historical marker |
| 26 | docs/project/four_elements_workflow_reglament.md | Inspected — many prod path refs, documentation only |
| 27 | docs/project/four_elements_patch_roadmap_actual.md | Inspected — many prod path refs, documentation only |
| 28 | docs/project/NEW_CHAT_START_PROMPT.md | Inspected — prod path refs, documentation only |
| 29 | docs/project/archive/four_elements_workflow_reglament_v5_20260506.md | Inspected — archived, historical |
| 30 | docs/project/памятка.txt | Inspected — reference note |
| 31 | playwright.config.js | Inspected — safe, local 127.0.0.1:8010 |

---

## 3. Active Risks

### RISK-1: `01_BUILD_GPT_CONTEXT_WORK.bat` copies disabled sync BAT into temp ZIP (LOW)

**File:** `01_BUILD_GPT_CONTEXT_WORK.bat`, line 48
**Detail:** The context packer script copies `04_SYNC_WORK_MIRROR_TO_GOOGLE_DRIVE.bat` into the GPT context ZIP if it exists. In the sandbox, this file is renamed to `.DISABLED_IN_GLM_SANDBOX.bat`, so the `if exist` check will NOT find the original name and will skip it. This is safe by accident — the rename prevents the copy. However, the line is still logically misleading and could confuse a future agent reading the script.
**Severity:** LOW — no runtime impact because the file does not exist under the original name.
**Recommendation:** No immediate action needed. In a future cleanup task, add a comment or adjust the file list to exclude the sync BAT explicitly.

### RISK-2: `tools/prepare_gpt_state.py` hardcodes production paths in generated content (LOW)

**File:** `tools/prepare_gpt_state.py`, lines 86-88
**Detail:** The script writes `LAST_SYNC.txt` with hardcoded production paths:
```
Source path: C:/Users/Den/Desktop/four elements/four_elements_core_base_v03
Target path: C:/Users/Den/Desktop/four elements/four_elements_core_base
```
These are informational strings written into `_gpt_state/LAST_SYNC.txt`, which is gitignored and never committed. The script itself does not write outside the sandbox. However, if an agent reads `_gpt_state/` contents, it could be confused by these paths.
**Severity:** LOW — `_gpt_state/` is gitignored, content is local-only, no execution path touches prod.
**Recommendation:** In a future cleanup, update `prepare_gpt_state.py` to use sandbox-relative paths instead of hardcoding production paths.

### RISK-3: `package-lock.json` contains legacy project name (LOW)

**File:** `package-lock.json`, line 2
**Detail:** `"name": "four_elements_core_base"` — this is a cosmetic issue. The name does not affect npm behavior since there are no `npm run` scripts and only a single devDependency (`@playwright/test`).
**Severity:** LOW — no functional impact.
**Recommendation:** In a future cleanup, run `npm install` after updating `package.json` with a `"name": "glm-game-sandbox"` field to regenerate the lockfile.

### RISK-4: SAVE_KEY and SETTINGS_KEY in src/main.js contain legacy product name (INFORMATIONAL)

**File:** `src/main.js`, lines 7-8
**Detail:** `SAVE_KEY = 'four_elements_core_base_v04_save'` and `SETTINGS_KEY = 'four_elements_core_base_v04_settings'`. Changing these would break existing browser localStorage saves for anyone who played the game before. This is a browser-side storage key, not a file system path.
**Severity:** INFORMATIONAL — no security or safety risk. Changing these keys would actively harm user experience by invalidating saves.
**Recommendation:** Do NOT change these keys. They are localStorage identifiers and must remain stable.

### RISK-5: Legacy backup JS files in src/ (INFORMATIONAL)

**Files:** `src/main_before_restore_04a.js`, `src/main_broken_04c3.js`, `src/main_broken_04c5.js`
**Detail:** Three old backup copies of main.js exist with the same legacy SAVE_KEY/SETTINGS_KEY names. They are not loaded by index.html and serve only as historical reference.
**Severity:** INFORMATIONAL — dead code, no execution path.
**Recommendation:** Consider removing in a future cleanup to reduce repo noise, but not urgent.

---

## 4. Non-Risks / Historical References

The following files contain production path references (`C:\Users\Den\Desktop\four elements\four_elements_core_base`, `FourElements_WORK_MIRROR`, `G:\Мой диск`, `G:\My Drive`) but are **documentation, archived, or disabled** — they have NO execution capability:

| File | Nature | Why Non-Risk |
|------|--------|-------------|
| `docs/project/four_elements_workflow_reglament.md` | Documentation | Read-only reference, describes production workflow |
| `docs/project/four_elements_patch_roadmap_actual.md` | Documentation | Read-only reference, patch history |
| `docs/project/NEW_CHAT_START_PROMPT.md` | Documentation | GPT/Codex prompt template, not executed |
| `docs/project/PLAYWRIGHT_VISUAL_SCENARIOS.md` | Documentation | Scenario description, no code execution |
| `docs/project/archive/four_elements_workflow_reglament_v5_20260506.md` | Archived | Historical version, not active |
| `docs/project/памятка.txt` | Reference note | Personal memo, not executable |
| `AGENTS.md` line 14 | Guardrail documentation | Lists prod path as "must not touch" |
| `README.md` line 14 | Guardrail documentation | Lists prod path as "must not touch" |
| `README_GLM_SANDBOX.md` line 14 | Guardrail documentation | Lists prod path as "must not touch" |
| `01_BUILD_GPT_CONTEXT_WORK.bat` line 7 | REM comment | Comment-only, not executed |
| `02_RUN_PATCH_AND_CHECK.bat` line 7 | REM comment | Comment-only, not executed |
| `04_SYNC...DISABLED_IN_GLM_SANDBOX.bat` | Disabled file | Cannot be executed by normal BAT invocation |
| `tools/sync_work_mirror.DISABLED_IN_GLM_SANDBOX.py` | Disabled file | Cannot be executed by normal Python invocation |
| `tools/sync_visual_screenshots.DISABLED_IN_GLM_SANDBOX.py` | Disabled file | Cannot be executed by normal Python invocation |

**Conclusion:** All production path references in active code are either comments, guardrail documentation, or inside disabled files. None can cause writes to production locations.

---

## 5. Google Drive Sync Safety

**Status: SAFE**

All Google Drive sync mechanisms are disabled:

| Mechanism | Original Name | Sandbox Name | Status |
|-----------|--------------|--------------|--------|
| Sync BAT launcher | `04_SYNC_WORK_MIRROR_TO_GOOGLE_DRIVE.bat` | `04_SYNC...DISABLED_IN_GLM_SANDBOX.bat` | Disabled by rename |
| Mirror sync Python | `tools/sync_work_mirror.py` | `tools/sync_work_mirror.DISABLED_IN_GLM_SANDBOX.py` | Disabled by rename |
| Screenshot sync Python | `tools/sync_visual_screenshots.py` | `tools/sync_visual_screenshots.DISABLED_IN_GLM_SANDBOX.py` | Disabled by rename |

**Verification:**
- No active BAT file calls the disabled sync BAT. The `01_BUILD_GPT_CONTEXT_WORK.bat` references it only in an `if exist` copy block, which will not match because the file is renamed.
- The `05_RUN_VISUAL_SCENARIOS.bat` explicitly prints: `[INFO] Sandbox mode: screenshots stay local only and are not copied to Google Drive mirror.`
- No active Python script imports or calls the disabled sync modules.
- The `tools/visual_scenarios.mjs` writes only to a local `_reports/screenshots/latest` directory and has no Google Drive logic.
- `tools/prepare_gpt_state.py` writes only to `_gpt_state/` (gitignored local folder). It references mirror paths in generated text content only.

**Dangerous path patterns checked:**
- `G:\Мой диск` — only in disabled `.DISABLED_IN_GLM_SANDBOX.*` files and docs
- `G:\My Drive` — only in disabled `.DISABLED_IN_GLM_SANDBOX.*` files and docs
- `FourElements_WORK_MIRROR` — only in disabled files, docs, and guardrail text
- Google Drive mirror detection logic (scanning drives C-I for `Мой диск`/`My Drive`) — only in disabled `.DISABLED_IN_GLM_SANDBOX.py` files

---

## 6. .gitignore Review

**Status: ADEQUATE with minor note**

Current `.gitignore` covers:

| Category | Pattern | Verdict |
|----------|---------|---------|
| OS artifacts | `.DS_Store`, `Thumbs.db`, `desktop.ini` | OK |
| IDE | `.vscode/`, `.idea/` | OK |
| Dependencies | `node_modules/` | OK |
| Python cache | `__pycache__/`, `*.pyc` | OK |
| Logs | `*.log`, `*.out` | OK |
| Secrets | `.env`, `.env.*`, `*.key`, `*.pem` | OK |
| Temp/generated | `_exports/`, `_reports/`, `test-results/`, `*.tmp`, `*.bak`, `backup/` | OK |
| Archives | `*.zip`, `*.7z`, `*.rar` | OK |
| Old builds | `_archive/` | OK |
| Backup policy | `backup/**` with `!backup/**/PATCH_REPORT.txt` exception | OK — sophisticated |
| Inbox assets | `_inbox/generated_assets/`, `_inbox/temp/`, `_inbox/**/*.png`, etc. | OK |
| Screenshots/cache | `screenshots/`, `**/screenshots/cache/`, `**/cache/`, `**/temp/` | OK |
| Agent context | `_gpt_state/`, `_inbox/` | OK |

**Minor note:** The `_gpt_state/` and `_inbox/` entries are listed at the bottom but the `_inbox/` section also has granular image/blend exclusions above. This creates a slight redundancy: the blanket `_inbox/` ignore at the bottom already covers everything, making the specific image/blend patterns above unreachable. This is harmless but slightly confusing.

**Recommendation:** No immediate change needed. The net effect is correct — both folders are fully ignored.

---

## 7. AGENTS.md Review

**Status: GOOD — clear and actionable**

**Strengths:**
1. **Clear identity statement** — "This repository is a GLM sandbox copy... not the production project"
2. **Explicit sandbox path** — `C:\Users\Den\Desktop\GLM_test\glm_game_sandbox`
3. **Explicit forbidden production path** — `C:\Users\Den\Desktop\four elements\four_elements_core_base`
4. **10 numbered core rules** — easy to parse programmatically
5. **Working expectations** — preference for infrastructure/tooling changes over broad refactors
6. **Git workflow** — feature branches from `sandbox/main`, no direct push to main
7. **Ambiguity protocol** — "If the task is ambiguous, stop and ask before changing files"
8. **PATCH_REPORT.txt discipline** — always update after changes
9. **Minimal diff philosophy** — "Keep diffs minimal and reversible"

**Suggestions for future improvement (NOT blocking):**
1. Add a short "Quick Start for GLM agents" section at the top: clone, branch, change, commit, push. Currently this workflow is split across AGENTS.md and README_GLM_SANDBOX.md.
2. Add a "How to run checks" section listing the exact commands: `node --check src/main.js`, `npx playwright test`, etc.
3. Consider adding a "Branch naming convention" section (e.g., `glm/<task-id>-<short-description>`).
4. The `PATCH_REPORT.txt` rule (rule 4 under Working expectations) could be clarified: is it required for every commit, or only for commits that change source code?

---

## 8. Recommended Next 3 GLM Test Tasks

These tasks are designed to validate the sandbox workflow end-to-end with minimal risk:

### Task 1: GLM-DOC-01 — Documentation cleanup pass
**Goal:** Clean up legacy production path references in active documentation files (not in archive/).
**Scope:** Update `AGENTS.md`, `README.md`, `README_GLM_SANDBOX.md` to add a brief "Paths in this file are historical" note next to production path references. Do NOT remove the references — they serve as guardrails.
**Risk:** Minimal — documentation only.
**Validates:** Branch creation, editing, commit, push workflow.

### Task 2: GLM-INFRA-01 — Update package.json and regenerate package-lock.json
**Goal:** Set `"name": "glm-game-sandbox"` in `package.json` and run `npm install` to regenerate `package-lock.json` with the correct name.
**Scope:** `package.json` (1 line change), `package-lock.json` (regenerated).
**Risk:** Low — no source code change, lockfile regenerates cleanly.
**Validates:** npm tooling works in sandbox, lockfile is correct.

### Task 3: GLM-TEST-01 — Run existing Playwright smoke tests and report results
**Goal:** Run `npx playwright test tests/smoke.spec.js` and report pass/fail. Do not modify any test files.
**Scope:** Read-only — only running tests, no file changes.
**Risk:** Minimal — read-only execution.
**Validates:** Test infrastructure is functional, node_modules can be installed, Playwright works.

---

## 9. Exact Local Commands the User Should Run

### Initial setup verification
```bat
cd /d C:\Users\Den\Desktop\GLM_test\glm_game_sandbox
git status
git branch
```

### Syntax check (safe, read-only)
```bat
node --check src/main.js
```

### Run smoke tests
```bat
npm install
npx playwright install chromium
npx playwright test tests/smoke.spec.js
```

### Start the game locally
```bat
00_START_GAME_WORK_8010.bat
```

### Verify disabled sync files
```bat
dir *.DISABLED_IN_GLM_SANDBOX*
dir tools\*.DISABLED_IN_GLM_SANDBOX*
```

### Verify _gpt_state and _inbox are gitignored
```bat
git status _gpt_state/
git status _inbox/
```

### Verify no active file references Google Drive sync entry point
```bat
findstr /S /I "04_SYNC_WORK_MIRROR_TO_GOOGLE_DRIVE.bat" *.bat tools\*.bat
```
Expected: no matches (the file is renamed, so no BAT calls it).

---

## 10. Final Go/No-Go Verdict

### **GO**

The repository is ready for GLM browser/GitHub agent sandbox work.

**Rationale:**
1. All Google Drive sync mechanisms are disabled by file rename — safe.
2. No active script can write to production paths (`four_elements_core_base`, `FourElements_WORK_MIRROR`, `G:\Мой диск`, `G:\My Drive`).
3. `.gitignore` correctly excludes `_gpt_state/`, `_inbox/`, `node_modules/`, `backup/`, `_exports/`, `_reports/`, `test-results/`, and temp/archive files.
4. Production path references exist only in documentation, disabled files, and guardrail text — none are in executable paths.
5. AGENTS.md provides clear, actionable rules for GLM agents.
6. Branch-based workflow is established: `sandbox/main` is the protected baseline, feature branches are required.
7. `node --check src/main.js` passes (confirmed in PATCH_REPORT.txt).
8. The only active risks are LOW severity (legacy name in lockfile, hardcoded paths in generated local files, misleading comment in context packer).

**Pre-conditions for GO:**
- GLM agents must read AGENTS.md before any task.
- All work must happen on feature branches from `sandbox/main`.
- No direct pushes to `sandbox/main`.

**Recommended before first real task:**
- Run `npm install` to populate `node_modules/` locally.
- Run `node --check src/main.js` to confirm JS syntax is valid.

---

*End of GLM-AUDIT-01 report.*
