# PF-97 slice F4: drive the real registration route of a consumed course round with special file names (held patch, stacked)

Candidate c3f08c3ae. Stacked on the path rule patches F1, F1-c2, F2 and F3 (apply them first, in that order). The patch (`w7-critic-path-charset-f4.patch`) touches `plugins/pipeline-core/lib/critic-course-admission.test.mjs` and one number in `harness/scripts/check-verify-case-completion.test.mjs`. No production file changed: the route showed no remaining refusal once F1 to F3 are applied.

## Cause

`consumedCourseRoundFixture` ran the real route (preflight, course admission, finalize, `addCriticReviewLineage`) only with plain file names. No case drove special file names through the registration verb, which is where the consumer saw `FPR-LINEAGE-COMPILE` / `CRL-V2-PACKET`.

## Changed lines

- Test file: `dirname` imported next to `join`. `consumedCourseRoundFixture` takes one new optional option `extraCandidateFiles` (default empty, every existing caller unchanged); a loop before the candidate commit writes a small file at each path. The record report `changedFiles` is not changed: no route file reads it.
- New case `PF97 LINEAGE (special file names) ...` after PF94 LINEAGE (a). Paths: route groups with parentheses, a bracket segment, an at-sign slot with a dot-parenthesis segment, a dollar-sign name, a space, U+00FC (built with `String.fromCodePoint(252)`), plus/equals/comma/tilde, a colon. Separate step-named assertions: the fixture completes; `addCriticReviewLineage` returns `lineage-added`; the registered lineage `diff.changedPaths` equal `git diff --name-only -z` of the range (unquoted, no octal escapes); the next delta admission is not `CCA-REQUESTED-MODE` and its decision text names no path refusal.
- `check-verify-case-completion.test.mjs`: VCR01 pin of `critic-course-admission-tests` 232 to 238 (measured from the VCR01 failure after the new case; the new case adds six top-level assertions).

## Results (measured by the Elephant on a fresh clone of c3f08c3ae with F1, F1-c2, F2, F3, F4 applied in order)

- critic-course-admission 66/66, critic-generic-batch 35/35, critic-dispatch-preflight 63/63, critic-packet-preflight 18/18, critic-review-lineage 1/1, review-economy 1/1, check-verify-case-completion 32/32 (before the pin edit VCR01 was the only failure, 31/32), session-critic-finalizer 86/87 (pre-existing baseline red, identical without these patches), architecture overview check current.
- Goldfish measured the stacked baseline without F4: 65/65, failing-name set empty on both sides.
- RED proof: the F4 patch applied alone on the candidate WITHOUT F1 to F3 (patch applies cleanly there): the new case fails at the step `addCriticReviewLineage`, actual status `refused`, expected `lineage-added`. That is the consumer failure. With F1 to F3 the same case is green at once.

## Survey of printed hints (partial, read-only)

Printed `add-diagnostic-evidence` / `add-delta-request` / register-feature-package commands in non-test lib and scripts use placeholder text for the path (angle-bracket path or `input.json`), not an interpolated range path: critic-course-admission.mjs line 39, feature-package-registration.mjs line 641, register-feature-package.mjs lines 54, 59, 71, 79, 101, critic-diagnostic-evidence.mjs line 40. Other hint sites (preflight CLI evidence hints, other repair hints) were NOT surveyed; that stays a separate slice.

## Not done

Full hint-quoting survey; the bidi override characters stay accepted (named residual of the path rule); native Windows run; independent Critic review (parent-owned batch gate); PO acceptance.

## Proposed commit message

test(critic): drive the real registration route of a consumed course round with special file names

## Operator flow

`git apply` the patch after F1, F1-c2, F2, F3; `git add -u` limited to the two test files; commit with `--no-verify`; Elephant stamps; PO refreshes the plugin copy. Protected-path classification: neither test file is in TP-1 to TP-13; no ceremony.
