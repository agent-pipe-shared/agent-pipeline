# Slice plan — HOOKREFRESH (M), hardened test temp root (O), scratch durability (P)

Read-only planning pass, 2026-10-07; decisions in [`po-decisions-2026-10-07.md`](po-decisions-2026-10-07.md). P = protected.
Every slice runs test-first (QG-04, decision N): a test-only dispatch, then the fix dispatch.

## A. HOOKREFRESH
Landed: S1 detection (`eb2478e24`), digest-once (`c1da25960`), S5 wedge rollback (`c974ed27c`, `ddabe0ae3`). Open: S3, S2, S4, S2b.
- **A-S3 admission (P, signed package):** catalogue admits exactly `<loaded-plugin>/scripts/{pre-commit,commit-msg}-hook-install.mjs --install`; everything else refused. Files `lib/guard/constants.mjs`, `lib/guard/command-catalogue.mjs` (~146), guard catalogue test.
- **A-S2b real error codes (unprotected, now):** installer CLIs keep the real refusal code (e.g. `PB-WINDOWS-ASSURANCE`) instead of `PREPUSH-INSTALL-UNAVAILABLE` (`pre-push-hook-install.mjs` ~780); pre-commit/commit-msg CLIs print `{"status":"refused","code"}` and exit 1.
- **A-S2 preflight surface (unprotected, after A-S3):** additive `hookRefresh:{pending:[ids]}` + one nextAction branch with one refresh command (`requiresConfirmation:false`, `mutation:true`); never for declined/foreign/absent; status stays `ready`. File `scripts/pipeline-start-preflight.mjs` (~1569–1604) + test.
- **A-S4 instruction (unprotected, after A-S2):** `skills/pipeline-start/SKILL.md` runs the one returned action, reruns preflight, stops on non-zero exit.

## B. Hardened private temp root (win32 fixtures)
Primitive exists: `hardenWindowsPrivateDirectory` (`lib/windows-private-state.mjs:230`); the assurance itself is not edited.
- **B-S1 helper (unprotected, now):** `lib/test-private-tmp.mjs` — `privateTempRoot()` (memoized, hardened on win32, 0700 on POSIX, exit cleanup, no ancestor `.git`), `privateMkdtemp(prefix)`; own test (child passes `assessWindowsPrivatePath`).
- **B-S2 migrate `lib/project-onboarding-v3.test.mjs`** (`temporaryBase` 403–419 + 7 direct sites); acceptance: win32 failure count drops. Closes the backlog item.
- **B-S3 next ring** (`project-authority`, `po-gate-authority`, `human-guard-override`, `codex-onboarding-runtime`, `git-hook-runtime-snapshot-fast-verify` tests). **B-S4** scripts tests already hardening locally (+ `harness/scripts/pipeline-state.test.mjs`, P). **B-S5** hooks tests (~35, P/TP) last, then a lint pin.

## C. Scratch durability warning + sweep
- **C-S1 lib (unprotected, now):** `lib/scratch-retention.mjs` — list scratch files, tracked references (`scratch/<path>` literals in tracked docs, slash-normalized), durability assessment, sweep plan (mtime > 14 days AND unreferenced); symlink/outside-scratch refused (reuse `lib/physical-scratch-boundary.mjs`).
- **C-S2 CLI:** `scripts/scratch-sweep.mjs` — default `--check` read-only; `--sweep` plan only; `--apply` deletes exactly the plan; never live descriptor dirs or live `scratch/dispatch/*`.
- **C-S3 close/handover warning:** `skills/close-block/SKILL.md` sub-step runs `--check`, lists referenced-not-durable files as a warning, never a blocker.
- **C-S4 (P, optional):** admit `--check` for agents in the catalogue; `--apply` stays with the human (decision P: "only when invoked").

Serialization: A-S3 and C-S4 share `lib/guard/command-catalogue.mjs` (one signed guard package). Parallel now: A-S2b, B-S1, C-S1.
