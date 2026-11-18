# w319 — the Critic briefing carries one derived hint for risks without behaviour (candidate 31, lane L3 part two, slice C31-M9)

Applies AFTER the base clone of candidate 31 (lane L3 part one: the Spec and PRD template texts, the readiness question and `RISK_TRACE_FORMS`). The patch is the delta on that base clone and therefore does not
apply to the real checkout until the base clone is applied first; it applies to the integration clone (`apply --check` exit 0 there).

## What it changes

- `plugins/pipeline-core/lib/critic-briefing-build.mjs`: `renderBody` fills one new whole-line slot, `RISKS_WITHOUT_BEHAVIOUR_LINE`. A small helper reads the Spec (the reviewer input's `specPath`, resolved under the project root)
  through `inspectSpecRiskTrace` and takes only the ids of the rows the reader classifies `untraced` (not stale, not malformed). With at least one id the line becomes
  `- risks without behaviour: <ids>; inspect whether the delivered behaviour or a stated residual covers each`; otherwise the line is removed, like the other whole-line slots.
  Nothing is returned when the root or the Spec cannot be read, when the Spec path leaves the root, or when a read throws: the briefing is then byte-identical to one for a Spec without a table.
  The line carries only ids (the reader admits no other shape for an id) and the fixed sentence, never Spec prose. The Antigravity paths-only envelope is not touched.
- `templates/prompts/critic-review.md` and `plugins/pipeline-core/templates/prompts/critic-review.md`: the matching template line (one line, byte-identical in both copies), placed after the Advisor line.
  Like the three existing whole-line slots it is required by the builder: a template without it is refused with `CBB-TEMPLATE-MARKER` (the template and builder ship together; the vendored-sync check pins the copies).
- `plugins/pipeline-core/lib/critic-briefing-build.test.mjs` (NEW file): 8 cases. The first 7 were written first and run RED against the original builder (3 failing: untraced row yields the line, the Codex carrier yields it, the template line is required;
  the 4 guard cases passed already), GREEN after the change; the 8th (the rendered line trips none of the `dispatchFindings` contamination checks) was added after a review of the dispatch-side checks. They cover: an untraced row yields the line with only its id (covered, residual-stated, not-applicable, stale, malformed rows and Spec prose stay out);
  no table or a fully traced table leaves the briefing byte-identical; stale or malformed rows alone yield no line; an unreadable Spec (missing file, no root, a path leaving the root, a directory) leaves the briefing unchanged;
  the Codex carrier gets the line and the Antigravity envelope does not depend on the Spec; the template line is required; the two template copies are equal.

## Why

Plan lane L3 (PO tile: never blocking, derived on read, never stored): run A accepted a risk that never became behaviour or a Critic question. The Critic now sees an inspection hint for exactly the risks the Spec table leaves untraced.
No gate, no refusal on Spec content, no stored status, no record shape, digest or key change. The criterion binding AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Checks (all in the slice clone, one at a time, `test-in.mjs`)

- `plugins/pipeline-core/lib/critic-briefing-build.test.mjs`: 8 of 8 pass (RED 3 of 7 before the builder change, for the first 7 cases).
- `plugins/pipeline-core/lib/spec-risk-trace.test.mjs`: 15 of 15. `plugins/pipeline-core/scripts/prepare-dispatch.test.mjs`: 37 of 37. `harness/scripts/check-critic-fail-closed.test.mjs`: 1 of 1.
  `plugins/pipeline-core/scripts/check-vendored-template-sync.test.mjs`: 6 of 6. `harness/scripts/generate-vendored-canon.test.mjs`: 9 of 9. `plugins/pipeline-core/lib/dispatch-policy.test.mjs`: 46 of 46.
- Template-reading pins, all green: `codex-critic-host` 141, `guard-dispatch` 93, the four `lib/pins` template pins 70, the five further `lib/pins` 93 (3 skipped by their own condition), `sandboxed-readonly-duty` plus `check-module-cluster-reachability` 30.
- `antigravity-pretool-guard.test.mjs`: 37 of 38 pass; the one red case, "GS-1 widening of pipeline.user.yaml stays denied without an armed capability (k92 negative control)", failed with an empty `Process failed:` while two other suites ran in parallel
  (the run took about 580 s) and concerns the gate-strength guard, not the template (the Antigravity envelope region is unchanged). A rerun alone was started and not finished within the budget: NOT VERIFIABLE here, rerun it alone.
  `guard-lifecycle-ready.test.mjs` was started and not finished within the budget (it only uses a stand-in body for the template file): not verifiable here.
- `w319-...check.test.mjs`: the patch exists, is non-empty and touches only the six files of the lane write list.

## Pins outside the write list that this change turns (or finds) red

- `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` is RED in the slice clone on two digests of `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`:
  `templates/prompts/critic-review.md` (this patch changes those bytes; the pin needs the new raw sha256, the same re-pin step the earlier template changes needed) and
  `plugins/pipeline-core/skills/critic-review/SKILL.md` (NOT touched by this patch: already out of step in the base clone, so a re-pin covers both). The pin file is outside this slice's write list and a digest change is
  excluded by the candidate 31 safety rules, so it is left for the coordinator's re-pin patch; the pin test goes green with the two new digests.

- `harness/scripts/check-verify-suite-registration.mjs` reports `plugins/pipeline-core/lib/critic-briefing-build.test.mjs` as UNREGISTERED in the slice clone until `harness/verify-suites.json` (protected, TP-13, outside the write list) gets an entry,
  e.g. `{ "name": "critic-briefing-build-tests", "file": "plugins/pipeline-core/lib/critic-briefing-build.test.mjs", "invariantPinned": "The Critic briefing carries one derived whole-line hint 'risks without behaviour: <ids>' for the Spec risk rows the reader finds untraced (ids and a fixed sentence only), none when there is no table, no untraced row or an unreadable Spec, and the template line is required and equal in both copies (C31-M9, AC-112)", "nonOverlapNote": "Unique cases: the hint slot of lib/critic-briefing-build.mjs; prepare-dispatch-tests pins the rest of the briefing" }`.
  (The same check also lists the browser-smoke test of another lane; that one is not part of this slice.)

## Not changed / not proven

- Not proven: that a live Critic accepts the hint as admissible input under the template's "anything else handed to you" stop rule. The line carries ids and a fixed sentence only and trips none of the
  dispatch-side contamination checks (one case), but no live Critic run was made.
- Case edit after RED: `assert.notEqual(stripped, TEMPLATE, ...)` became `assert.ok(stripped !== TEMPLATE, ...)` in the template-line case only to stop a failing assertion from printing the whole template (about 44 kB);
  the assertion is the same ("the template carries the line"), nothing was weakened.

- `critic-briefing-build.test.mjs` is a NEW test file: it runs in Verify only after it is registered in `harness/verify-suites.json` (a protected path outside this slice's write list; the coordinator registers it).
- The hint reads the Spec in the working tree under the root, not the Spec blob at the reviewed candidate (derive on read, the same as the other root-based readers).
- `spec-risk-trace.mjs` is unchanged (its reader already returns the per-row status the hint needs). `prepare-dispatch.mjs` already passes `root`, so no caller change was needed.
- The close report's "without behaviour" listing named in the plan table is a separate surface and is not part of this slice.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only. Integrated review and PO acceptance are pending.
