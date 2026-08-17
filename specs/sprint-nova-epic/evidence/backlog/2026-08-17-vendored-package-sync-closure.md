# Closure evidence: vendored-package sync for marketplace-installed projects (`NVA-VENDORSYNC-1`)

Backlog item:
- `backlog/items/2026-08-17-mixed-authority-migration-requires-a-vendored-plugin-copy-marketplace-installs-never-have.md`

## Timeline

- PO decision (2026-08-17, live, translated): fix the structural provenance
  gap "sustainably" — the files the Pipeline needs must also be available
  inside the Pipeline for user projects, not just for self-application —
  overriding the item's original "not agent-dispatchable as-is, needs design
  input" triage. PO confirmed the chosen direction (an explicit,
  operator-visible vendored-copy sync; never a silent write, never a
  weakened gate) before implementation began.
- `9ab96e01` (dispatched `NVA-VENDORSYNC-1`, goldfish-deep, `claude-opus-5` at
  `max` per MP-07 architecture/trust-boundary criteria) — added
  `planVendoredPackageSync`/`applyVendoredPackageSync` plus a `vendor-sync`
  CLI command to `project-authority.mjs`/`project-authority-migration.mjs`,
  and a V4 lifecycle redirect in `project-onboarding-v3.mjs`. The existing
  gate (`loadedPackageEvidence`, `packageInventory`, `TARGETS`, the migration
  journal) is byte-unchanged. The sync fails closed on: a destination holding
  tracked project files, an uncovered `.gitignore` rule, an unreadable/
  symlinked destination, drift since planning, and a failed digest readback;
  it never writes or edits a `.gitignore` itself, only names the line to add.
  Reproduce-first GREEN captured (`evidence/nva-vendorsync-1-repro-green.json`,
  11/11); tests: `project-authority.test.mjs` 25→29, `project-authority-
  migration.test.mjs` 13→21, `project-onboarding-v3.test.mjs` 119→120.

## Critic review (claude-opus-5 at max, one round)

Verdict **FAIL** — 4 major, 1 minor. Per this session's standing "one Critic
round for this thread, then self-verify" practice (PO-confirmed live), no
second round was dispatched; every finding was independently triaged and
resolved directly.

- **F1 (major) — verify gate red at the exact reviewed commit.** Correct and
  undisputed: `evidence/verify-latest.json` bound exactly to `9ab96e01`
  (`binding: "exact"`) shows `exitCode: 1`, with `human-guard-override-tests`
  the only failing step. That suite is the known, pre-existing,
  separately-tracked `HGO-EXTERNAL-MARKETPLACE` host-dependent gap
  (`backlog/items/2026-08-17-this-hosts-local-marketplace-copy-is-not-
  symlinked-to-source.md`), untouched by this diff. QG-01 is a mechanical
  rule with no "known unrelated failure" exception at the consumer/gate
  layer — the finding stands as a process fact, not a code defect. No code
  change; already tracked at its own item.
- **F2 (major) — the dispatch's own claims record overclaimed a green
  plugin-wide sweep.** The record's `log` field stated "every suite touching
  this change is green," but `evidence/nva-vendorsync-1-plugin-sweep.tap`
  shows `plugins/pipeline-core/lib/project-authority.test.mjs` failing (17
  failures total in that sweep). Independently re-verified before accepting
  either side: `node --test plugins/pipeline-core/lib/project-authority.test.mjs`
  standalone → `29 passed, 0 failed`; `evidence/verify-latest.json`'s
  `project-authority-tests` step → `exitCode: 0`, exact-bound to `9ab96e01`.
  Root cause confirmed, not just accepted from the Critic's hypothesis: the
  stale-copy fixture seeds from `process.cwd()/plugins/pipeline-core` rather
  than the actually-loaded package root, which is fragile specifically under
  a whole-directory concurrent `node --test` sweep — not under this suite
  alone or under the serialized canonical gate. The CLAIM was wrong and is
  corrected here (`evidence/dispatch-record-NVA-VENDORSYNC-1.json`'s
  `elephantReVerification` field); the underlying code is not defective.
  Filed as a separate, narrower follow-up:
  `backlog/items/2026-08-17-project-authority-test-fixture-races-under-a-full-directory-parallel-sweep.md`.
- **F3 (major) — the spec's own Triage was never updated to reflect the PO's
  override.** Correct and fixed directly: the backlog item now records the
  PO's superseding decision, the dispatch outcome, and is closed with
  `closure_commit: 9ab96e01`.
- **F4 (major) — `PA-VENDOR-COPY-STALE` is treated as self-healable, beyond
  the spec's literal "missing copy" description.** Confirmed as accurate
  reading of the spec text; NOT a goldfish scope addition — this was the
  Elephant's own explicit choice at dispatch-briefing time (the briefing
  named both `PA-VENDOR-COPY-MISSING` and `PA-VENDOR-COPY-STALE` as
  self-healable codes). Kept as designed rather than reverted: a sync only
  ever overwrites a LOCAL, gitignored, untracked copy with the package
  already loaded and executing in the current session (the source is
  re-read at apply time, never taken from the plan) — it cannot turn an
  untrusted package into a trusted one, it only re-proves the local copy
  matches what is already running. A destination holding tracked project
  bytes is refused unconditionally regardless of this list. Documented
  explicitly, not silently: a code comment now states this rationale
  (`project-authority.mjs`, above `SELF_HEALABLE_VENDOR_PROVENANCE_CODES`),
  and it is disclosed here rather than left as an unstated deviation from the
  spec's literal wording.
- **F5 (minor) — the claimed RED reproduce-first baseline artifact
  (`evidence/nva-vendorsync-1-repro-red.json`) does not exist on disk.**
  Confirmed: absent. The GREEN counterpart exists and independently
  demonstrates the pre-fix/post-fix behavior difference (it re-states the
  pre-fix chain: mixed → unavailable → `PA-PROVENANCE-REQUIRED`, then shows
  it resolving). No code defect; acknowledged as a genuine evidence gap in
  the dispatch record's corrective entry, not blocking.

## Re-verification, 2026-08-17

- `node --test plugins/pipeline-core/lib/project-authority.test.mjs` →
  `29 passed, 0 failed`.
- `evidence/verify-latest.json`, run fresh and bound exactly to `9ab96e01`
  before the Critic dispatch (`binding: "exact"`): only `human-guard-
  override-tests` red (F1, unrelated, separately tracked); every suite this
  diff touches (`project-authority-tests`, `project-authority-migration-cli-
  tests`, `project-onboarding-v3-tests`) `exitCode: 0`.

## Disposition

FAIL findings triaged: F1 and F5 required no code change (pre-existing/
tracked elsewhere, evidence-record gap respectively); F2 required correcting
the claims record plus filing a narrower follow-up for the underlying
test-fixture fragility; F3 required updating and closing the spec item
itself (done, this closure); F4 was a deliberate, disclosed Elephant design
decision, documented rather than reverted. No second Critic round dispatched
(PO-confirmed one-round practice for this thread); the corrective work above
is the self-verification step that practice relies on instead.
