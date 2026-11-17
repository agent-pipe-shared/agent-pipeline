# w30g1 — a refused Result close names its cause, the owner route carries the entry's text, the one-shot close names it early (candidate 30, slice C30G-D1)

Criterion binding: AC-108 is the closest existing accepted criterion (a fresh bounded attempt under its unchanged text); the PRD and the Spec are unchanged. Held patch, developed and tested in a scratch clone of the applied chain.

## What it adds

- **Part A, `pipeline-state.mjs`:** `diagnoseResultCloseBinding(dir, binding, prdPath, specPath)` (exported, pure, read-only). Null when the bound Result can close, else `{cause, text, repair}` for exactly the conditions `PS-RESULT-CLOSE-RESULT` covered before:
  `is-prd-or-spec`, `missing-or-unsafe` (missing, symbolic link, hard-linked, not a regular file), `empty-or-oversized`, `digest-changed`. The text names the Result path; for a changed file the first 12 hex characters of the bound and the current digest.
  The close plan and the close apply print `PS-RESULT-CLOSE-RESULT: <cause text>`; the code, exit code 2 and zero mutation are unchanged, and a Result that can close behaves exactly as before.
- **The repair text names one route only: the bound bytes from Git** (`git restore -- <path>` for an edit that was not committed; `git restore --source=<commit> -- <path>` for a change that was committed or reverted). By reading the code, no entry re-binds a changed Result:
  the Result rebind pair only moves a binding between `Result.md` and `result.md` when both exist and requires the bound digest to equal the current file; the retire pair requires `authority.result.sha256` to equal the current file digest and a decline record;
  the bootstrap plan runs only while `authority.result` is null. The text says so and never names the rebind route as a repair; the cause text also says a commit or revert of the Result after the bootstrap changes the bytes the State binds.
- **Part B, `continuity-owner-route.mjs` (no lib change needed):** the entry runs in the owner-route process and writes its refusal to the process streams, so the script tees `process.stderr`/`process.stdout` for exactly the synchronous entry call (pass-through unchanged, restored in `finally`).
  A refused entry now returns `{status, code:'COR-ENTRY-EXIT', entry, exitCode, message, released}` with `message` = the first 400 characters of the entry's stderr (stdout when stderr is empty), ANSI removed; the `COR-ENTRY-HELD` and `refuse(...)` texts carry the same text. `COR-ENTRY-EXIT` is never bare.
- **Part C, `finish-feature.mjs`:** the Part A helper runs read-only on the bound Result and, on a cause, returns `ONESHOT-RESULT-CLOSE-BLOCKED` (stage `result-close-block`) with the cause text and the exact repair, nothing written. It runs at the stage as briefed AND once earlier, before Verify and the package moves
  (the same place the unbound-Result stop sits), so a Result that changed after binding costs no Verify run. A plan or apply failure of the stage now appends the owner-route envelope's refusal text (and code) to the stop reason instead of dumping the raw envelope. The import of the helper from `pipeline-state.mjs` creates no import cycle (no non-test module imports `finish-feature.mjs`).
- **Part D (root cause): the normal one-shot flow does not produce the state.** The Result bootstrap appends the canonical fence and binds the digest of the appended bytes; the agent-run reconcile rewrites the manifest digest of the Result entry; `commit-pipeline-owned.mjs --agent` treats `specs/<feature>/result.md` as owned exactly when its bytes hash to the bound digest
  (`lib/pipeline-owned-files.mjs`, `featurePackageFileOwned`) and `lifecycle.json` when it is a valid manifest of the feature, so the bootstrap commit carries both and leaves the tree clean. `close-path-e2e.test.mjs` already asserted the clean tree after the bootstrap (`porcelain() === ""`); this patch adds
  that the committed Result file hashes to the bound digest, that the package validates, and (non-decline walks) that the file is unchanged from the bootstrap to `closed-local`, which covers acceptance, Verify, the package moves, the audit request, the close block and the close. The one realistic way a Result changes after binding is a person or agent editing result.md after the bootstrap commit (or committing and reverting it) and then rerunning the close: the new stop names `digest-changed` and the Git restore.

## Checks (run in the clone, one suite at a time)

- `pipeline-state-result-close.test.mjs`: 9 of 9 (3 new: every cause on plan and apply, the Spec-path cause, the restore case). Written RED first: 3 of 9 failed with the bare code.
- `pipeline-state-result-bootstrap.test.mjs`: new cases for the `COR-ENTRY-EXIT` message (RED first: `message` undefined) and the real-bootstrap restore proof (bootstrap, owned commit, an edit, `git restore --`, then a commit and a revert, `git restore --source=<commit>`, plan and apply go through).
- `finish-feature.test.mjs`: 84 of 84 (3 new: changed Result stops before Verify and any State write, the stop is gone after the named `git restore`; a Result that changes between the early check and the block; the owner-route entry text in the stage stop).
- `close-path-e2e.test.mjs`: the new walk assertions.
- `node --test specs/sprint-alfred-epic/evidence/held-patches/w30g1-result-close-refusal-names-its-cause.check.test.mjs`: 3 of 3 (patch non-empty, applies to the repository root, touches only the briefed files).

## Not changed / not proven

- Not proven: that the guard union admits `git restore --source=<commit> -- <path>` as an agent shell command (the clone fixtures run plain Git). If it does not, the printed restore is a command for the PO's terminal; nothing else re-binds a changed Result.
- Not changed: no new State schema, entry or owner-route entry; no signed, approval or push path; `lib/onboarding-continuity.mjs` untouched; the `ONESHOT-VERIFY-RED` "dirty" stop still names no dirty path (a request of the coordinator addendum, see below; open item).
- The 400-character `message` of the owner-route envelope cuts the long `digest-changed` text before its repair; the entry's full text still passes through on stderr, and the one-shot names the cause from its own read-only check.
- The coordinator addendum sent mid-task (extra requirements D1-D4 and F) was not authenticated as a fresh briefing; the in-scope Part D investigation and the proven-repair rule were carried out, item F (listing dirty paths in the Verify candidate-preflight stop) was not built.
- Not run: the full Verify; integrated review and PO acceptance stay with the Coordinator.
