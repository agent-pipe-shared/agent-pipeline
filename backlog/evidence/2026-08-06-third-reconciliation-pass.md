# Third backlog reconciliation pass, 2026-08-06 night

Continues the same evening's autonomous reconciliation work as
`backlog/evidence/2026-08-06-onboarding-runner-identity-reverification.md`
and `backlog/evidence/2026-08-06-second-reconciliation-pass.md`. Covers the
"verify hygiene / Windows / worker-supervisor" batch of a five-way parallel
read-only investigation.

## Closed in this pass

### `pipeline.windows-verify-brittle-test-hygiene`

Fixed by `79da4a76c985ea512764dde2894865a5c7ccf816` ("fix(pipeline-core):
use posix.normalize in canonicalRelative for native Windows"), dated the
same day the item was filed. Current
`plugins/pipeline-core/lib/feature-package-topology.mjs` imports `posix`
explicitly and uses `posix.normalize(value)` at the comparison this item's
Proposal targets. Re-verified: `node --test
plugins/pipeline-core/lib/feature-package-topology.test.mjs` → the
forward-slash regression fixture passes, 1/1.

### `pipeline.close-spec-retention-and-consent`

Both halves independently resolved by different, already-tested-and-green
code paths (neither closure was originally aimed at this specific item):

- Archive-digest reconciliation: `check-spec-retention.mjs` (created
  `00fcc336cfd163d85fed20aa0a7ec2dbcfb6c31a`, "feat(sentinel): bind recovery
  and retention gates") enforces byte-identity fail-closed, registered
  twice in Verify. Its own `SR03 rejects archive byte drift` case is exactly
  this item's Triggering situation. Re-run: valid, SR01-SR05 pass.
- Advisor-export consent readback:
  `plugins/pipeline-core/lib/advisory-coordinator.mjs`'s
  `advisorExport: { consent: "approved" | "declined" }` field and typed
  `advisory_disabled_no_consent` result. Re-run:
  `node plugins/pipeline-core/lib/advisory-coordinator.test.mjs` → 7/7 pass.

## Investigated, narrowed, kept open

### `pipeline.local-worker-supervisor-cli-suite-flakes-under-full-verify`

Root cause found and reproduced (6 concurrent copies of the suite, 1/6
failed reproducibly): a torn-read race in the test's own `waitForRecord()`
helper against `local-worker-supervisor.mjs`'s first-write path
(`createJsonExclusive`, no atomic rename, unlike every later write). All
production readers already tolerate this via `readBoundedJson()`; only the
test helper does not. Fix (wrap the read/parse in try/catch, poll again on
failure) drafted and matched against the live file, but **not committed** —
`plugins/pipeline-core/scripts/local-worker-supervisor.test.mjs` sits inside
`plugins/pipeline-core/**`, this session's live enforcing plugin root
(self-application: checkout and installed copy coincide), and GS-6 refused
the edit with no in-session override, by design. Full fix text recorded in
the item itself for the PO or a differently-rooted session to apply.

### `pipeline.spec-retention-on-close`

Acceptance criteria 1, 3, 4, 5 confirmed delivered via the same
`check-spec-retention.mjs`/Sentinel-archive mechanism as the item above.
Criterion 2 (transfer-time typed-blocked classification for an omitted
normative Spec) confirmed still absent — no
`classifyTransfer`/equivalent module exists, and `close-block/SKILL.md` has
no transfer-time retention/consent step. Narrowed to exactly that gap. Its
`expires: 2026-08-03` frontmatter field has passed; flagged for
administrative handling independent of the technical finding.

### `pipeline.guard-lifecycle-ready-blocks-claude-memory-writes`

Technical gap reconfirmed unchanged (read `guard-lifecycle-ready.mjs` in
full, 1057 lines: zero mentions of "memory," no carve-out). **Citation gap
found and flagged, not resolved either way:** the item's own text cites "PO
decision (2026-07-29, recorded `docs/state.md`): Option B for now," but an
extensive search of `docs/state.md` (multiple term variants, plus `git log
-S`) found no matching record. Recorded in the item's Triage as something
to re-confirm or re-record, not silently trusted or silently removed.

## Net observation

Two more instances of the same "fix delivered, item never reconciled"
pattern this evening's earlier passes already found (4 items in the prior
pass, 1 in the onboarding-runner closure) — six total tonight. The
`workflow-improvement` candidate item that pattern suggests (a mechanical
step or reminder enforcing that a written Triage decision also flips
`status`/runs the ledger reconciliation) was noted in the prior evidence
file and is not re-filed here to avoid duplication.
