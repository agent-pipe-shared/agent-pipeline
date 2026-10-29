# Critic range bindings, slice D2: operator hints name the derive step and the exact request field (held patch, no stacking)

Candidate 759f93fd4. The patch (`w7-critic-range-bindings-operator-text-d2.patch`) is text only, no behaviour change. It applies on the candidate without any other held patch.

## Cause

For a Critic range that contains the calibration handover file, a handover file of the same naming or a retained Critic result, the route is derive, preflight (`--correction-input-bindings <file>`), admit and finalize (request key `review.correctionInputBindings`, the same value in both). The hints printed by the diagnostic evidence route, the feature package registration route and the push preparation remedy said only that the preflight should be rerun, so an operator who followed them was refused with `CDP-CORRECTION-INPUT-REQUIRED` and had to find the rest alone.

## Changed lines

- `plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs`: new numbered help line 6 after the rerun step.
- `plugins/pipeline-core/scripts/register-feature-package.mjs`: new help line 6 in the evidence route and new help line 8 in the delta request route, each after the rerun step.
- `plugins/pipeline-core/scripts/push-prepare.mjs`: the remedy for `private-critic-binding-unavailable` keeps every old word and appends the same clause.
- `plugins/pipeline-core/skills/critic-review/SKILL.md`: the operator note adds the exact preflight flag, the exact admit and finalize request key with the same value in both, the omit-when-absent and never-null rule, and the re-derive rule when the bindings file was swept.
- `plugins/pipeline-core/lib/critic-diagnostic-evidence.test.mjs`: four cases `D2 text (1)` to `D2 text (4)`; each keeps the old sentence asserted and adds the derive step and `correctionInputBindings`. Cases (1) and (2) read the exported help constants, (3) and (4) read the source line of the push remedy and the skill note.

## Results (measured by the Elephant on a fresh clone of the candidate, baseline versus patched)

- critic-diagnostic-evidence 12/12 baseline, 16/16 patched (four new cases, failing-name sets empty on both sides).
- push-prepare 88/88 both, critic-dispatch-preflight 63/63 both, check-verify-case-completion 32/32 both (no count pin exists for the extended file), check-product-capability-inventory 30/30 both.
- RED before the change: the Goldfish measured the four new cases failing on the unchanged clone (16 tests, 12 pass, 4 fail). One first GREEN run of case (1) failed because the case imported the help constant from the wrong module; the import was fixed, no assertion was changed.
- No existing test pinned the old hint texts (search over all test files), so no existing case was touched.

## Not done

Stacked check: with all ten held patches of the combined note applied in order on a fresh clone, this patch applies cleanly, critic-diagnostic-evidence is 17/17 (F1 adds one case), the other suites above stay green and the architecture overview check reports current. The text of `CCA-REQUESTED-MODE` and other hints were not briefed and are unchanged. Hint sites that interpolate a path unquoted are a separate slice. Independent Critic review (parent-owned batch gate), Full Verify, PO acceptance.

## Proposed commit message

docs(critic): name the derive step and the exact request field in the operator hints for a Critic range with state or retained-result paths

## Operator flow

`git apply` the patch; `git add -u` limited to the five touched files; commit with `--no-verify`; Elephant stamps; PO refreshes the plugin copy. Protected-path classification: none of the touched files is in TP-1 to TP-13 as far as the Goldfish and the Elephant observed; no ceremony.
