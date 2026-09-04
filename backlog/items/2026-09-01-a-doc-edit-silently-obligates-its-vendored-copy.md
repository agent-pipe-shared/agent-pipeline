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

- **Decision:** accepted, and the item's premise is split rather than answered
  whole — clause 1 is closed by other work, clause 2 stays open at a measured
  and much lower cost than when this was written.
- **Rationale:** see the triage record below.
- **Assignment (if accepted):** Nova B, no dispatch queued — see the
  re-evaluation trigger.
- **Date:** 2026-09-04

### Triage record, 2026-09-04

NVA-B-VENDOBL-1 was dispatched against this item and **built nothing, correctly**:
picking one of the three named options would have been triage-by-implementation,
which is the Elephant's call, not a dispatch's. What it did instead is separate
the premise into two clauses that have different answers.

**Clause 1 — "it only surfaces later, when a full verify run turns red" — is now
false.** `harness/scripts/pre-gate.mjs` (commit `a64b09ea`, closing the sibling
item `pipeline.a-change-creates-an-obligation-elsewhere-that-only-a-gate-run-reveals`)
runs `generate-vendored-canon-tests` as one of six checks in about four seconds
against a ~13-minute gate. This exact obligation fired twice on 2026-09-04, hours
apart — once on a `templates/prompts/goldfish-task.md` edit, once on a new file
in `docs/adr/` — and the pre-gate named both immediately. The expensive half of
this item is closed by work done elsewhere.

**Clause 2 — "nothing at edit time tells the editor" — is still true.** The
editor learns at pre-gate time, not at edit time.

**Why that is accepted-but-not-queued rather than deferred.** Deferral is
terminal in this repository and hides live defects
(`backlog/items/2026-08-31-a-deferred-item-is-terminal-so-a-live-defect-can-be-parked-invisibly.md`),
so this item stays open. But the remaining gap costs one pre-gate run and one
`node harness/scripts/generate-vendored-canon.mjs`, both measured today at
seconds — and buying edit-time surfacing means a `PreToolUse` advisory firing on
every Edit to a canon origin, which is noise on a path already covered.

**The named candidate, with its real cost, if that judgement ever turns out
wrong.** Option 3 (edit-time surfacing) is *partly* reachable: the dispatch
verified that `plugins/pipeline-core/hooks/guard-testpath.mjs` already sits on
the `Edit|Write|NotebookEdit` matcher and is itself unprotected, so no
`hooks.json` change and no TP-4 ceremony is needed. But its coverage would have
to land in `guard-testpath.test.mjs`, which is **TP-2-protected** — so the option
costs a PO signature ceremony, not a dispatch. The exact change is recorded in
`evidence/dispatch-record-NVA-B-VENDOBL-1.json`: a non-blocking advisory firing
on Edit/Write against any `generate-vendored-canon.mjs` manifest `origin`, naming
the vendored destination and the regenerate command.

**Re-evaluation trigger, so this is a decision and not a shrug.** Revisit when
this obligation next reaches a *commit* — i.e. lands in history rather than being
caught before it. That is the observable that separates "the pre-gate covers it"
from "the pre-gate is only run when someone remembers", and it is the only
evidence that would justify paying a TP-2 ceremony for clause 2.
