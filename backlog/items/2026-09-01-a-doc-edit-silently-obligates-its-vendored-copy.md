---
schema: pipeline.backlog-item.v1
id: pipeline.a-doc-edit-silently-obligates-its-vendored-copy
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
source: "Measured live, twice, in the 2026-09-01 0.6.0 release range: docs/push-release-flow.md drift caught in commit 62ba638b, docs/adr/0076-global-chat-attributed-unattested-approval-mode.md drift caught in commit 56e91858."
done_when: manual
---

# A doc edit silently obligates its vendored copy

## Description

Certain repo-root documents are mirrored byte-identically under
`plugins/pipeline-core/` (`harness/scripts/generate-vendored-canon.mjs`'s
manifest, e.g. `docs/push-release-flow.md` and specific ADRs such as
`docs/adr/0076-global-chat-attributed-unattested-approval-mode.md`).
`generate-vendored-canon.test.mjs` (`checkVendoredCanon`) fails the suite when
a vendored copy differs from its repo-root origin, and the repair is a
generator run (`node harness/scripts/generate-vendored-canon.mjs`). Nothing at
edit time tells the editor that changing the repo-root original just created
this obligation at the vendored destination — it only surfaces later, when a
full verify run turns red on the stale-mirror check.

## Triggering situation

Measured twice in one release range on 2026-09-01:

- Correcting `docs/push-release-flow.md` staled its vendored mirror under
  `plugins/pipeline-core/`; caught only after a full verify run (~10 minutes),
  repaired in commit `62ba638b` ("chore(canon): regenerate the vendored
  push-release-flow copy").
- Repairing the `Governs:` line in
  `docs/adr/0076-global-chat-attributed-unattested-approval-mode.md` staled
  that ADR's vendored mirror; caught by the next full verify run, repaired in
  commit `56e91858` ("chore(canon): regenerate the vendored ADR-0076 copy").

Each occurrence cost one complete verify run to surface, and each repair
commit moved HEAD, which voided whatever gate result (verify evidence, a push
approval) had just been paid for at the prior HEAD — the same whole-tree-
binding cost recorded generally in
`backlog/items/2026-08-16-every-gate-binds-the-whole-tree-so-any-later-commit-voids-it.md`.

This is a concrete instance of a shape `docs/state.md` already names but has
not yet filed as its own backlog item: a change to artifact A silently creates
an obligation at artifact B, and only a later gate run reveals it. This item
files the vendored-canon instance specifically, not the general shape.

## Affected artifact

`harness/scripts/generate-vendored-canon.mjs` (the manifest and generator);
`harness/scripts/generate-vendored-canon.test.mjs` (`checkVendoredCanon`, the
suite that fails on drift); the editing workflow for any repo-root file
appearing in the vendored manifest (`docs/push-release-flow.md`, select
`docs/adr/*.md` entries, `roles/*.md`, `guardrails/*.md`,
`templates/prompts/*.md`).

## Proposal

No fix decided here. Options worth naming without deciding between them:

- Run the generator from a pre-commit hook, so a commit touching a vendored
  origin regenerates (or at minimum flags) its mirror before the commit lands,
  rather than at the next full verify run.
- Have the checker (`checkVendoredCanon` / the CLI `--check` path) offer its
  own repair as a typed recovery action at the point it reports drift, instead
  of only naming the remedy command in prose.
- Fail at edit time rather than at gate time — e.g. a guard on Edit/Write
  against a vendored-origin path that surfaces the obligation immediately,
  the same class of edit-time surfacing this repo already uses for other
  guarded paths.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** {{accepted | deferred | rejected | merged-into-<filename>}}
- **Rationale:** {{mandatory for rejected/deferred; optional for accepted}}
- **Assignment (if accepted):** {{phase/release}}
- **Date:**
