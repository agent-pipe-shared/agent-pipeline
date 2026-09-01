---
schema: pipeline.backlog-item.v1
id: pipeline.an-onboarding-test-depends-on-a-clean-working-tree-through-a-security-scan-subprocess
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Hypothesis raised in scratch/critic-contract-round-H.md, D-2 (an unrelated pre-existing security-scan.mjs subprocess failure with exit code 2, observed during unrelated work, established not to be caused by that diff). Investigated live 2026-09-01 against plugins/pipeline-core/lib/project-onboarding-v3.test.mjs and plugins/pipeline-core/scripts/security-scan.mjs; refuted by direct measurement."
---

# An onboarding test's dependency on a clean working tree through a `security-scan.mjs` subprocess — investigated and refuted

## The hypothesis, as raised

`scratch/critic-contract-round-H.md`'s D-2 records that during unrelated work,
`project-onboarding-v3.test.mjs` produced an unrelated pre-existing failure
where a `security-scan.mjs` subprocess call returned exit code 2. The round
established that `security-scan.mjs` does not import the module that diff
changed, and recorded the failure as out of scope rather than investigating
its cause. This item's briefing framed a specific candidate explanation: that
a test spawns `security-scan.mjs`, which types a dirty tree as
`working-tree-not-clean` and exits non-zero — i.e. that the test's pass/fail
depends on the ambient cleanliness of the outer checkout's own working tree.

## What was established

1. **`security-scan.mjs`'s dirty-tree check is scoped to an explicit
   `--root` argument, not the process's ambient CWD or the outer checkout.**
   `observeCandidate(rootDir)` (`plugins/pipeline-core/scripts/security-scan.mjs`,
   around line 333) runs `git status --porcelain=v1 --untracked-files=all`
   against the `rootDir` parameter, and every test call in
   `project-onboarding-v3.test.mjs` that spawns this script passes
   `--root <fixture path>` — an isolated, freshly created temporary git
   repository the test itself builds and commits into
   (`hostGit(path, ["init", ...])`, explicit `commit(...)` helper calls
   before each `security-scan.mjs` invocation). The outer checkout's own
   `git status` is never consulted by this mechanism.
2. **The two tests that actually call `security-scan.mjs` as a subprocess
   with meaningful assertions on its exit code** — "the seeded push gate
   refuses an unapproved push and admits it after the shipped commands"
   (asserting `produceSecurityEvidence().status === 0` after committing the
   fixture's own tree) and "the seeded security gate refuses a push with
   missing security evidence and admits it after the shipped scan command
   runs (SECGATE-1)" — both explicitly commit every fixture-tree write
   before invoking the scan, and both are commented as depending on this
   ("a real remote is required so `security-scan.mjs` can compute
   `candidate.repositorySha256`" and similar notes throughout, confirmed by
   reading the surrounding source directly).
3. **Live measurement, 2026-09-01, with the outer checkout genuinely
   dirty** (three new untracked backlog item files present in the outer
   working tree at the time, confirmed via `git status --porcelain`): ran
   the full `project-onboarding-v3.test.mjs` suite (158 tests, including
   both SECGATE tests above) with `node --test
   plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`. Result:
   **158 passed, 0 failed, exit code 0.** Both security-scan-dependent
   tests passed, confirming the outer checkout's dirtiness has no bearing on
   their result.

## Conclusion

The specific hypothesis in this item's briefing — that a test depends on the
ambient outer working tree being clean via a `security-scan.mjs` subprocess
call — is **refuted by direct live measurement**: the outer tree was dirty
during the run and every relevant test passed, because `security-scan.mjs`'s
cleanliness check is bound to the isolated fixture root each test explicitly
constructs and commits into, never to the outer checkout.

## What remains genuinely unestablished

D-2's original observation (an actual `security-scan.mjs` subprocess exit-2
failure, seen once during unrelated prior work) is not reproduced here and its
root cause is not identified by this investigation. It may have been a
transient environment condition (a fixture left uncommitted mid-test by a
different, unrelated code path at that time; a stale scanner binary on PATH;
a timing race) rather than the ambient-dirty-tree mechanism this item's
briefing hypothesized. No further evidence was gathered toward that original,
narrower question — this item closes only the specific ambient-working-tree
hypothesis, not every possible explanation for D-2's one observed failure.

## Recommendation for triage

Filed `status: open` per this dispatch's briefing (which specifies
`status: open` for every item this dispatch files), even though the
investigation above found no live defect — recorded as a refutation rather
than left unfiled, so the question is not silently re-asked by a future
session reading D-2 in isolation. The next triaging Elephant should read this
as a candidate for reject (per `backlog/README.md`'s triage rules: the
hypothesis did not hold against direct measurement, and no residual defect
is proposed), moving `status:` to `closed` with the rationale recorded in its
own `## Triage` section at that time — this item does not pre-empt that
decision by setting `closed` itself.
