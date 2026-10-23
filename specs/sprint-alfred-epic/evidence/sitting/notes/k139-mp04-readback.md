# K139-MP04-READBACK notes (Goldfish, Sonnet 5.5, ruleset 0.7.0+claude.20261022204428.79cda46)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.

## Cause
PO decision 2026-10-23 batch 7 row 8: the Elephant MP-04 check had no sanctioned readback inside the preflight.
Finding: a separate script `plugins/pipeline-core/scripts/bootstrap-env-check.mjs` (receipt `status: clear|blocked`)
already exists and is named in `harness/session-bootstrap.md`, but the preflight line and the pipeline-start skill
never mention it; this change adds the readback to the preflight line as briefed. I did NOT import the existing
script (it would become a kernel path via GMWKC01); the one-line presence test is duplicated by design.

## Change
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` (PROTECTED, kernel list line 374): exported
  `SUBAGENT_MODEL_ENV_NAME`, `observeSubagentModelEnv({env})` -> `{status: "set"|"unset"}` via `Object.hasOwn`
  (any present value, empty string included, reads set; same rule as bootstrap-env-check). Carried as top-level
  `subagentModelEnv` beside `nodeSandbox` (like `environmentReadiness`), set in `main()` options and `runEntry()` for
  role absent or `elephant` only. The pinned key set / payload budget of `observePipelineStartPreflight` is untouched
  (additive; no envelope schema/validator exists for the outer line).
- `plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs` (existing registered suite, committed): 5 cases.
- `plugins/pipeline-core/skills/pipeline-start/SKILL.md` step 4: two-line sentence naming `subagentModelEnv.status`.
- `architecture/boundary-policy.json`: ratchet 2355->2374 (script) and 2375->2456 (suite) in `K139-ratchet.diff`.

## Open reading (smallest chosen)
Role scope: Elephant only (MP-04 is the Elephant duty). Third state "unavailable" not added (hasOwn cannot throw on process.env).

## Results (exact commands, run alone, private tmp not needed)
- RED (k139 clone, before the script change): `node --test --test-name-pattern=K139 scratch/clones/k139/plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs` -> 5 fail / 0 pass (missing export; `subagentModelEnv` undefined).
- GREEN after: same command -> 5 pass.
- Full suite, clone k139: before 87 pass / 0 fail, after 92 pass / 0 fail.
- Post-sitting state (throwaway clone `scratch/clones/k139-check` of `scratch/clones/k133`, HEAD 12149c72c):
  `node --test .../pipeline-start-preflight.test.mjs`: before 87 pass, after applying both diffs 92 pass / 0 fail.
- `node harness/scripts/check-doc-contracts.mjs`: valid before and after (2577 files, 1977 links, 106 anchors).
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs`: 9/9 before and after.
- Also green after: `check-product-capability-inventory.mjs` (PASS), `check-session-bootstrap-directory-contract.test.mjs` 5/5, `generate-elephant-role-prohibitions.test.mjs` 13/13.
- `git apply --check` of both diffs on k139-check: ok, then applied for real: ok.
- Boundary check (`node plugins/pipeline-core/scripts/architecture-boundary-check.mjs --root scratch/clones/k139-check`):
  over-line-bound findings 0 before; 2 after (script 2374 lines vs accepted 2355; suite 2456 vs 2375);
  with `K139-ratchet.diff` applied: 0 again (21 violations, all pre-existing unowned-path, same as baseline).

## Artifacts (all in scratch/agent-out/)
- K139-mp04-protected.diff (preflight script; apply as human operator)
- K139-mp04-unprotected.diff (test file + SKILL.md; = clone commit f501b88d3)
- K139-ratchet.diff (boundary-policy.json, two lines)
- K139-msg-protected.txt, K139-msg-unprotected.txt (trailers AI-Assisted: true / Dispatch: stage-0 (elephant))
- Apply order: unprotected + ratchet first or together, then protected; the cases are red until the protected diff lands.

## Risks
- The unprotected suite cases are red in the main tree until the protected diff is applied (documents contract).
- Duplicated presence logic with bootstrap-env-check.mjs; `harness/session-bootstrap.md` line 135 still names only that script (not changed; the briefing scoped to skill text).
- Spawn cases take about 11 s extra in the suite (3 preflight processes plus one extra).

## Clone state
`scratch/clones/k139` still carries the protected edit in its working tree (uncommitted); commit f501b88d3 holds the unprotected parts. `scratch/clones/k139-check` carries all three diffs applied (throwaway).
Provenance: the clone commit uses `Dispatch: K139-MP04-READBACK (goldfish)`; no dispatch record file was written by me.
