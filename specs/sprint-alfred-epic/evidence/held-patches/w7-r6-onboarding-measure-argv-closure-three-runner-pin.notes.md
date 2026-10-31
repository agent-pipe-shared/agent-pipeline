# W7-R6 last pre-existing onboarding reds: TOFU measurement, argv-closure, AC-264 pin, design-authoring branch of the turn helper

Slice W7-R6-ONBOARDING-MEASURE-ARGV-CLOSURE-THREE-RUNNER-PIN-20261031 (R5 follow-up). Targeted delivery: green (see the evidence
section for the exact runs). The patch changes FOUR files, three tests and one measurement helper; `project-onboarding-v3.mjs` (the
second named production file) is NOT changed. It is cut against the candidate in the prepared clones (HEAD 5dda62a8c plus the eighteen
candidate-13 patches, 7d7de764f) and applies after them (driver `patch` mode runs `git apply --check` in the baseline clone).
Batch Critic, final Verify and PO acceptance stay pending.

## Decisions per item (all four traced to a decided contract change; no regression found)

| # | Case | Deciding commit | Decision | File changed |
|---|---|---|---|---|
| 1 + 4 | `measure-tofu-push-e2e.test.mjs` TOFU stop + the helper's missing branch | **5e939278b** (`stagingDesignNeedsAuthoring`, `design-authoring-required`, `BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED`) | (a) restate the case; (b) add the missing branch to the helper (the helper is a measurement harness, the walk is the fixture of case 1) | `measure-fresh-repo-onboarding-turns.mjs`, `measure-tofu-push-e2e.test.mjs` |
| 2 | `project-onboarding-v3-argv-closure.test.mjs` mini/feature/epic | **5e939278b** (same bind refusal reached through `bootstrap-bind-plan`) | (a) restate | `project-onboarding-v3-argv-closure.test.mjs` |
| 3 | AC-264 pin plus its two RED mirrors | **c3898ac93** (2026-10-29, "let the PO accept the minor residue of a failed Critic round", adds the `approve-residual-acceptance` verb to `pipeline-state.mjs`) | (a) classify the new verb off the happy path | `three-runner-happy-path-with-two-po-approvals.test.mjs` |

### 1 + 4: the walk now stops at `design-authoring-required`, the helper authors there

Before 5e939278b the bind accepted the unauthored staging bytes, the walk met an `architecture-design-required` stop (code
`ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE`), the helper wrote the architecture block and the plan acknowledgement then refused the still
unauthored Spec (`BOOTSTRAP-ACK-PLACEHOLDER-CONTENT`): the old stop. After 5e939278b the Driver stops EARLIER, at
`design-authoring-required` (`intake-generate-apply`), and the helper had no branch for it, so it reported a `dead-end` round
(baseline log: `unsupported-next-action`, round `dead-end`). `architecture-design-required` is published only for an already approved PRD
(sibling pins and the W7-R5 notes), so the old branch is not reached before the authoring.

- Helper (`measure-fresh-repo-onboarding-turns.mjs`): new `authorStagingDesign()` and a `design-authoring-required` branch placed before
  the `architecture-design-required` one. The stand-in PO replaces the Spec's skeleton criterion and traceability row with a real AC-1 row
  (the same two rows the W7-R5 e2e restatement replaces), authors the architecture block exactly as the existing function does (the reserved
  draft template, banner included, is REPLACED, never duplicated) and moves the PRD's Spec digest to the authored Spec bytes. Round name
  `authored-staging-design`; a failed authoring returns the typed outcome `design-authoring-failed`. No new mutation verb, no argv shape change.
- Case 1 (`measure-tofu-push-e2e.test.mjs`, name unchanged) restated, intent kept (setup ok, onboarding ends typed BEFORE the signed push,
  within the measured six turns, no `approve-push` and no later ceremony step): the walk now gets one step further than the old stop. It
  reaches the Driver's own typed return `pipeline.bootstrap-plan-acknowledgement-plan.v1` with `status: signature-required` and a
  `sign-intent` external action, and the measurement's operator step exits 2 because the disposable fixture key is UNENCRYPTED and the signing
  step refuses it (`PO-KEY-UNENCRYPTED`, commit 5cd3c2f87 of 2026-10-09, before the old restatement; it never fired because the old walk
  stopped at the placeholder refusal first). Assertions: round `authored-staging-design` ok, no `authored-architecture-design` round, last round
  the executed external action with exit 2, onboarding outcome `external-operator-failed`, the typed final, the stderr code. Dropped from the
  old case: the `authored-architecture-design` round and the `bootstrap-acknowledge-plan` / `BOOTSTRAP-ACK-PLACEHOLDER-CONTENT` last-step
  assertions (the stop they describe no longer exists); `lastStep` / `stopStderr` are only emitted on the helper's dead-end form.
- Why the full authoring and not the minimal pass of the W7-R5 e2e restatement: that case deliberately leaves one reserved value to
  observe the intermediate stop; a stand-in PO that authors the design authors it completely, and the minimal pass would end on a
  `repair-required` stop the helper has no (and should not get a) branch for.

### 2: bind refusal per profile

The case builds a real fixture per profile and calls `bootstrap-bind-plan` on the untouched generated staging package. After 5e939278b
feature and epic are refused with `BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED` (exit 2; before they bound the unauthored bytes, exit 0). Mini
is still refused with `KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING` (its early acknowledgement is checked first), unchanged. The
restated case asserts these refusals per profile and then applies one minimal authoring pass to the staging package (real AC-1 and
traceability row, banner gone, prose fields written, PRD Spec digest re-bound; the same edit the W7-R5 e2e restatement makes) and asserts
the ORIGINAL assertions on the authored package unchanged: mini keeps `KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING`, feature and
epic bind-plan exit 0 with `planApproved: false` and a `bootstrap-bind-apply` next action. Nothing weakened; the intent ("mini retains early
acknowledgement while feature and epic wait for the final package") is exactly the authored-package assertion.

### 3: AC-264 pin

`approve-residual-acceptance` now appears in the live `pipeline-state --help` command list and matches the pin's PO-verb pattern. Per the
pin's own rule (every PO-bearing verb is inventoried or declared off the happy path) it is declared in `OFF_HAPPY_PATH_VERBS`: it is the PO's
acceptance of the MINOR residue of a FAILED Critic round (inventory id `accept-residual-critic-findings`, docs/human-authorization-inventory.md;
a blocker or major finding can never be accepted), so it exists only after a Critic round has failed and is not a step of any happy-path
scenario. The happy path still needs exactly two per-feature approvals (plan, push); the inventory, the scenario counts, the exactly-two
assertion, the third-class mirror and the extra-ceremony mirror are untouched. The two RED mirrors were red only because the
unclassified-verb assertion fired first; they are green again with no edit of their own. The existing anchor case verifies the new off-path
verb still exists in the live command list.

## Open PO question (named, not decided here)

The restated case 1 now shows that for the default `mini` profile the returned onboarding chain ends at a PO SIGNATURE request for the
bootstrap plan acknowledgement (`signature-required`, `sign-intent`). The spec (21.3, "Decisions") says the bootstrap plan acknowledgement is
"folded into onboarding's single enrollment consent or removed", and the AC-264 pin's own RED mirror uses `bootstrap-plan-acknowledgement`
as its archetypal EXTRA per-feature ceremony. The argv-closure case name states the decided contract ("mini retains early acknowledgement"),
so this slice does not touch it, but whether mini's retained early acknowledgement signature counts as the folded plan decision or as a third
signature on the happy path is a product question for the PO. Nothing in this patch adds or removes an approval.

## Not changed / follow-up

- `plugins/pipeline-core/scripts/measure-tofu-push-e2e.mjs` (outside the write scope): its `fakeSetupSpawn` generates an unencrypted key
  (comments at lines ~117-121 and ~329-332 say it signs without a passphrase), which the approval path has refused since 5cd3c2f87. Measuring
  the signed push end to end needs an encrypted-key fixture and a passphrase feed there; until then case 1 pins the typed stop above and
  must be restated again when that fixture lands (it will fail loudly on `external-operator-failed`, by design).
- `project-onboarding-v3.mjs` unchanged: no regression found in the bind refusal; it is the decided contract.
- `check-verify-case-completion.test.mjs` unchanged: no `test(` was added, removed or renamed, so no pinned count moved.

## Order deviation (honest)

The helper edit was made before the restated case 1 was run; the red evidence for case 1 is the baseline run on the unchanged code
(`base2`) plus the driver `revert` run that restores the unchanged helper under the restated case.

## Evidence (finished logs in scratch/agent-out/w7r6, machine-written by the driver)

- Red on unchanged code (`base1.*`, `base2.measure-tofu-push-e2e.test.mjs.log`, clone2): TOFU case fails (`unsupported-next-action` /
  round `dead-end` instead of `error`; the first `base1` TOFU log was a fixture ENOENT because the clone had no `scratch/` directory, so it
  was re-run as `base2` after creating it); argv-closure: 1 fail of 42 (feature, exit 2 `BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED`); pin: 3 fail of
  22 (`approve-residual-acceptance` unclassified, plus the two RED mirrors).
- Green on the final state (`c3.*`, clone): measure-tofu-push-e2e 9 tests, 9 pass, 0 fail; project-onboarding-v3-argv-closure 42 tests, 42
  pass, 0 fail; three-runner-happy-path pin 22 tests, 21 pass, 0 fail, 1 typed skip (the pre-existing E-HOLD host proof); project-onboarding-e2e
  7 tests, 6 pass, 0 fail, 1 pre-existing skip; onboarding-init 58 pass, 0 fail; check-verify-case-completion 32 pass, 0 fail (baseline
  `base2.*`: e2e 6/0/1, onboarding-init 58/0, check-verify 32/0, identical).
- Revert proof (`revert.measure-tofu-push-e2e.test.mjs.log`): with the helper reverted to the candidate, the restated TOFU case fails; the
  helper restored byte-equal. argv-closure and pin changes are test-only: their revert proof is the original case red on the unchanged
  code (`base1`) against the restated case green on the same code (`c3`).
- Boundary: `scratch/agent-out/boundary-diff.mjs` base 103 violations, cand 103 violations, no ONLY CAND line.
- Patch: 14946 bytes, four files, `git apply --check` exit 0 on the candidate (driver `patch` mode).
- Downstream sweep: the only caller of `measureFreshRepoOnboardingTurns` is `measure-tofu-push-e2e.mjs` (the TOFU case, claude runner,
  green); the changed branch references no runner. Standalone helper runs, edited vs baseline (`c4.*` / `base4.*`): claude moves from
  `dead-end` at `design-authoring-required` to `BOOTSTRAP-ACK-TRUST-ANCHOR-UNAVAILABLE` (no signing-key directory in a standalone run,
  expected); codex and antigravity fail IDENTICALLY in both (`INTAKE-CAPTURE-TEXT-FILE-UNREADABLE`, in the helper's text-file collect-input route,
  before any authoring), so the new branch is not reached for those two in a standalone run: a separate pre-existing helper drift, named
  here, not fixed (outside this item). The authoring step itself is exercised for all three runners by the W7-R5 e2e case.
