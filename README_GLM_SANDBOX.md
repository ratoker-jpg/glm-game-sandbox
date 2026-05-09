# GLM Sandbox Repository

This folder is a safe Git/GitHub sandbox copy of the browser RTS project for GLM browser and GitHub agent work.

Sandbox path:

```text
C:\Users\Den\Desktop\GLM_test\glm_game_sandbox
```

Production path that must not be touched:

```text
C:\Users\Den\Desktop\four elements\four_elements_core_base
```

Purpose:

- prepare a private, isolated repository for GLM experiments;
- keep production and Google Drive mirror workflows out of the sandbox;
- allow safe branch-based infrastructure and code review work later.

Basic run command:

```bat
00_START_GAME_WORK_8010.bat
```

Local URL:

```text
http://localhost:8010/index.html
```

Basic checks:

```bat
node --check src/main.js
```

If more checks are needed later, prefer safe static or syntax checks first.

GitHub workflow:

1. Base branch is `sandbox/main`.
2. Create a feature branch for each task.
3. Make minimal diffs.
4. Review changed files and checks in `PATCH_REPORT.txt`.
5. Never push directly to `main`.

What GLM is allowed to do:

- inspect and edit files only inside this sandbox folder;
- make minimal, reversible changes;
- update docs, tooling, tests, and safe infrastructure;
- prepare feature branches and commits;
- report changed files, checks, risks, and next steps.

What GLM is forbidden to do:

- touch the production folder;
- sync anything to `FourElements_WORK_MIRROR`;
- run Google Drive sync from this sandbox;
- rewrite architecture without an explicit request;
- modify assets without an explicit request;
- make broad gameplay changes when the task is infra-only;
- push directly to `main`.

## GitHub-first workflow

### Source of truth

The **GitHub branch `sandbox/main`** is the single source of truth for the GLM sandbox. All GLM work flows through GitHub PRs. The local folder is a disposable snapshot, not the authoritative copy.

### Local snapshot: when needed

The local folder does **not** need to be updated after every GLM PR. It is only needed when you plan to:

- run **Codex** (Codex works on a local folder);
- do a **manual local test** of the game;
- **copy changes to production**;
- build a **fresh snapshot** for any other reason.

### Safe snapshot process before Codex

When you need to give Codex a fresh local copy, follow these steps exactly:

1. Go to GitHub: `https://github.com/ratoker-jpg/glm-game-sandbox`
2. Make sure branch **sandbox/main** is selected.
3. Click **Code → Download ZIP**.
4. **Delete** the old local snapshot folder entirely:
   ```
   C:\Users\Den\Desktop\GLM_test\glm_game_sandbox
   ```
   Do NOT unpack on top of an existing folder — always delete first.
5. Unpack the ZIP into the same location:
   ```
   C:\Users\Den\Desktop\GLM_test\glm_game_sandbox
   ```
6. Give Codex the fresh snapshot.

### Helper usage

`00_GLM_SANDBOX_HELPER.bat` option 4 (sync + git status + node --check) is **not required** after every PR. Use it only when you actively need the local folder to be up to date — for example, before Codex, before a manual test, or before copying to production.
