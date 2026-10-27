# Held patch notes: Critic skill evidence route and pin re-baseline (D41, second attempt)

Status: targeted delivery green. Candidate b34bee8b8771f072ca28dd12f4b6e6d8c1b25429. Integrated Verify, independent batch Critic review and PO acceptance stay pending (parent-owned).

Patch: `w7-skill-evidence-route-c2.patch` (git diff --binary of the clone against the candidate; 3 files, 26 insertions, 1 deletion). It is the first attempt's committed patch (`w7-skill-evidence-route.patch`) applied in the clone plus the case fix. Apply check in clone2 at the candidate: exit 0.

This re-baselines a protected Critic policy preimage (baseline label nova-autonomous-critic-review-policy). The independent batch Critic must review it; the PO applies the patch.

## Cause
1. The Critic skill states the accepted evidence shape but not the route that produces and registers diagnostic evidence; the route appeared only in an error message (D41).
2. The first attempt's guard case failed: it compared first `indexOf` occurrences, and `scripts/critic-dispatch-preflight.mjs` already occurs earlier in SKILL.md than the new paragraph.

## Changed lines (in the patch)
- `plugins/pipeline-core/skills/critic-review/SKILL.md`: 7 lines added after the evidence-shape paragraph (the "Diagnostic evidence route" paragraph; producer, commit, registrar `--add-diagnostic-evidence`, commit manifest, preflight `--registration-commit`).
- `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`: SKILL.md rawSha256 60cd00b9... -> d440420c0fcc8f96225303ddff9f7bbd1dbdce0d622bcbdbbfda49612ed88ca7.
- `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs`: new case "D41 the Critic skill states the diagnostic evidence route ..." (18 lines). Case fix: it locates the heading "Diagnostic evidence route" (asserts present), slices the flattened text from that anchor and asserts the order producer, registrar, --add-diagnostic-evidence, preflight script, --registration-commit only inside that slice. Intent kept: dropping the route fails the case. No existing case changed.

## RED and GREEN
- RED (clone, first attempt's case, SKILL patched): exit 1, 4 ok lines, new case threw ERR_ASSERTION (strictEqual actual false) at "preflight script follows the registration step". Log: scratch/agent-out/w7rr/red.*.log.
- GREEN (clone, case fixed): exit 0, `ok 1`..`ok 5`, `1..5` (ok 5 = the D41 case).
- Baseline (clone2, unchanged): exit 0, `ok 1`..`ok 4`, `1..4`.
- Whole preimage test failing-name sets: baseline none, patched none.

## Other suites, failing-name sets baseline (clone2) vs patched (clone)
- lib/critic-packet-governance.test.mjs: 7/7 both, none failing.
- scripts/codex-isolated-critic-contract.test.mjs: 22 pass, 0 fail both.
- scripts/session-critic-finalizer.test.mjs: exit 1 in BOTH, identical single failure "a root-authored candidate keeps its empty-tree base but cannot register a generic batch review unit" (pre-existing, unrelated, not touched).
- plugins/pipeline-core/install-agy.test.mjs (real path; scripts/ path from the briefing does not exist): exit 0 both (tail shows only git advice output).
- lib/pins/agy-managed-copy-first-start-lacks-attestation.test.mjs: 11 pass, 1 skipped (host limitation), 0 fail both.
- lib/pins/antigravity-global-refresh-recovers-and-installs-a-runner-view.test.mjs: 34 pass, 0 fail both.
Logs: scratch/agent-out/w7rr/{base,green}.*.log (scratch, untracked).

## Inventory digest
`product-capability-inventory.json` lists the SKILL path only (no digest); no change needed.

## NOT done
- Full Verify, native checks, independent batch Critic review, PO acceptance.
- The fixed case was not run RED against an unpatched SKILL (the RED shown is the first attempt's case against the patched SKILL).

## Briefing note
Field 4 says only the test file may differ in the patch, while the Goal requires the combined patch (SKILL.md and preimage JSON too). Followed the Goal; the repository tree itself was not edited.

## Proposed commit message
`docs(critic): state the diagnostic evidence route in the Critic skill and re-baseline its pin`

## Operator flow
`git apply` the patch, `git add -u` limited to the three paths, `git commit --no-verify`, stamp, install.

## Protected-path classification observed
None of the three files matches TP-1..TP-13; the preimage JSON and SKILL.md are a protected Critic policy baseline by nature (batch Critic review required).
