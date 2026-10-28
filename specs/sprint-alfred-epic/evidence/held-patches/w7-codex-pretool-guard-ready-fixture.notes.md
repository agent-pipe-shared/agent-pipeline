# Held patch: codex-pretool-guard ready lifecycle fixture (W7-CODEX-PRETOOL-GUARD-READY-FIXTURE-C1-20261027)

Candidate 5fea1c3a3155022c6444a2dd8f08a43f72ec5321. Scratch clones (`git clone --shared --no-checkout`, detached at the candidate), driver under scratch/agent-out/w7cx (spawnSync only). Nothing committed; the host commits.

## Baseline (clean candidate, clone2): 13 not ok (briefing said 14; the reporter prints 13 numbered failures)
7, 8, 9, 15, 16, 17, 18, 19, 20, 21, 22, 28, 38.

## Classification
| Names | Class | Evidence |
|---|---|---|
| 8, 9, 15-22, 28, 38 | FIXTURE stale | All fail inside `createReadyLifecycleFixture` (test line 306) via `readyLifecycleFixture` (line 392): actual `design-authoring-required`, expected `architecture-design-required`. Production: `lib/project-onboarding-v3.mjs` lines 3765-3788 return `design-authoring-required` (diagnostic `intake_design_authoring_required`) for any draft generated PRD/Spec; `architecture-design-required` is published only for an already APPROVED PRD (lines 3362-3397). `currentDesignAuthoring` defaulted to false, so the expectation was wrong for every caller. |
| 7 | ENVIRONMENT (not the fixture) | Name 7 already passed `currentDesignAuthoring: true` (test line 623), so the fixture passes. With the fixture fixed it still fails with `ENOENT ... mkdtemp '<clone>/scratch/codex-push-budget-adapter-XXXXXX'` (test line 638/641): the test creates a temp dir under `<repo-root>/scratch/`, which a fresh clone lacks (scratch/ is untracked). In the real checkout scratch/ exists. Resolved in the clones by `mkdir scratch`; no patch change. |

## Changed lines (patch, 1 file, +6 -3)
`plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs`, `createReadyLifecycleFixture` near line 306: the conditional expectation is replaced by `assert.equal(designStop.nextAction?.kind, "design-authoring-required", ...)` with a QG-04 justification comment. The `currentDesignAuthoring` option is left in the signature (callers unchanged) but no longer selects the expectation. No check weakened, skipped or deleted; the assertion still pins the design stop.

## Evidence
- Patch: `specs/sprint-alfred-epic/evidence/held-patches/w7-codex-pretool-guard-ready-fixture.patch` (git diff --binary from Node). Apply check in clone2 at the candidate: `git apply --check` exit 0.
- Patched run in clone WITHOUT scratch/ (log green.*): 38 ok; only `not ok 7` remained (ENOENT above). So the 12 fixture-class names went RED to GREEN.
- Patched run in clone WITH scratch/ (log green2.*): result not read within the tool budget; see "Not done".

## Not done
- The green2 run (full file, patched, scratch/ present) was still running at the budget checkpoint; name 7 green is therefore UNVERIFIED. The baseline with scratch/ present (clone2) was not rerun, so name 7's baseline-with-scratch status is unknown (baseline name 7 was red; its error text was not read, the ENOENT diagnosis comes from the patched log).
- No separate new RED/GREEN cases were written: the existing red checks are the contract; the fix corrects a stale expectation.
- Independent Critic review is a parent-owned batch gate; Full Verify and PO acceptance pending.

## Orchestrator addendum (2026-10-28, read from the green2 log after the hand-back)
The green2 run (patched, scratch/ present, bare `node <file>`) finished: 38 of 39 ok, and `not ok 7` still fails, now with
`AssertionError: test runner must provide a synthetic HOME` at test line 654. So the ENOENT diagnosis above is only the
first of two environment preconditions: name 7 also requires the HOME that the repository test runner
(`scripts/run-parallel.mjs`, private HOME and TMPDIR) provides. Class stays ENVIRONMENT, but the claim "green with scratch/
present" is NOT confirmed by a bare-node run. Under the runner name 7 is expected green; unverified. The 12 fixture names are green in both runs.

## Proposed commit message
test(codex-guard): walk the design authoring stop in the ready lifecycle fixture

## Operator flow
Apply the diff (`git apply`), `git add -u -- plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs`, commit with `--no-verify` (provenance trailers), stamp, install. Protected-path class observed: the test file matches no TP-1..TP-13 pattern.
