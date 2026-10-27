# Held patch notes: Critic skill evidence route and pin re-baseline (D41, slice 4a)

Status: INTERIM, targeted delivery blocked. The patch applies cleanly but its one new test case is red (a defect in the case, see below). Candidate 1bf345155d9b8da6f30b6d0fd63bf31f0421937b.

Patch: `w7-skill-evidence-route.patch` (git diff --binary of the clone against the candidate; 3 files, 23 insertions, 1 deletion). Apply check in clone2 at the candidate: exit 0.

This re-baselines a protected Critic policy preimage (baseline label nova-autonomous-critic-review-policy). The independent batch Critic must review it; the PO applies the patch. Independent Critic review stays a parent-owned batch gate.

## Cause
The Critic skill states the accepted evidence shape (SKILL.md lines 116-126) but not the route that produces and registers diagnostic evidence; the route appeared only in an error message (D41).

## Changed lines (in the patch)
- `plugins/pipeline-core/skills/critic-review/SKILL.md`: 7 lines added after the evidence-shape paragraph (route: producer `scripts/critic-diagnostic-evidence.mjs`, commit, registrar `scripts/register-feature-package.mjs --root <root> --add-diagnostic-evidence <path>`, commit manifest, rerun `scripts/critic-dispatch-preflight.mjs` with `--registration-commit`). No machine-specific path.
- `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`: SKILL.md rawSha256 60cd00b9281b4522eff1bb2f176555084d032d54598bfca22d85223e8d92efab -> d440420c0fcc8f96225303ddff9f7bbd1dbdce0d622bcbdbbfda49612ed88ca7. Nothing else.
- `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs`: one new case "D41 the Critic skill states the diagnostic evidence route ...".

## RED and GREEN
- RED 1 (unchanged SKILL, new case): exit 1, case failed at the first assertion (log red.*, scratch only).
- RED 2 (SKILL edited, pin not updated): existing case 3 mismatch assertion failed with expected 60cd00b9... actual d440420c... as designed.
- After pin update, in the clone: cases 1-4 print `ok 1`..`ok 4`; the NEW case (5) FAILS with "preflight script follows the registration step". Cause, in the case not the SKILL: it compares FIRST occurrences via indexOf, and `scripts/critic-dispatch-preflight.mjs` already appears earlier in SKILL.md than the new paragraph. Fix not yet applied: locate the paragraph by its heading "Diagnostic evidence route" and run the ordering assertions on the text from that anchor on; then regenerate the patch (driver mode patch) and rerun.
- Baseline (clone2, unchanged): 4 ok lines, `1..4`, exit 0.
- Other suites (governance, contract, finalizer, install-agy, two agy pins): logs were still running at checkpoint; failing-name comparison NOT completed. Names are not reported as green.

## Inventory digest
`plugins/pipeline-core/reader-inputs/product-capability-inventory.json` lines 1600 and 1645 only list the SKILL path (no digest of the entry); no change needed there.

## NOT done
- New case fix, patch regeneration, full baseline versus patched failing-name comparison for the seven suites.
- Dependent-copy tests (install-agy etc.) not confirmed unaffected.

## Proposed commit message
`docs(critic): state the diagnostic evidence route in the Critic skill and re-baseline its pin`

## Operator flow
Apply the diff (`git apply`), `git add -u` with a path limit to the three files, commit with `--no-verify`, stamp, install.

## Protected-path classification observed
The three patched files match no TP-1..TP-13 pattern of the agent obligations list; the preimage JSON is a protected policy baseline by nature (Critic gate), not a guard-config entry as far as observed.
