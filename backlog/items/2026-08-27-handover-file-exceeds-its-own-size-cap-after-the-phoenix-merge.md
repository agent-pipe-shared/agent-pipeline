---
schema: pipeline.backlog-item.v1
id: pipeline.handover-file-exceeds-its-own-size-cap-after-the-phoenix-merge
type: defect
owner: pipeline
status: closed
created: 2026-08-27
closed_at: "2026-08-27"
closure_repository: "self"
closure_commit: "7081e476015c41a54b9f3f960e9dde89bfdafbf8"
closure_evidence: "docs/state.md"
source: "Observed directly while trying to record merge open points in the canonical handover, 2026-08-27"
---

## Closed — 2026-08-27

The handover was rotated on 2026-08-27; `docs/state.md` now measures 20,890
bytes against the 30,000-byte hard cap (measured directly via `wc -c
docs/state.md`), so a session can edit it again.

# docs/state.md is 48,825 bytes against a 30,000-byte hard cap, so no session can edit it

## Description

`guard-handover-size.mjs` enforces a hard cap of 30,000 bytes on
`docs/state.md`. After the `origin/sprint_phoenix` merge the file is **48,825
bytes** — the merge unioned both branches' handover content, and each side was
individually under the cap.

The consequence is not cosmetic: the guard blocks every write to that file, so
the canonical handover cannot be updated by any session at all. The one
artifact whose entire purpose is to carry state across sessions is frozen, and
it is frozen in a state that predates the merge that froze it.

This was found the practical way — by trying to record the merge's open points
where they belong, per two Critic findings that they must not live in
untracked scratch, and being refused.

## Why the obvious fix is not just "trim it"

`handover-rotate.mjs` exists for exactly this and moves sections into
`docs/state-archive/`. But per ADR-0066 Decision 6/7 a rotation is gated on
`--acknowledge-extraction-done` per section, keyed to `{title, contentHash}`:
a section never acknowledged, or edited since its acknowledgment, is
mechanically refused. The acknowledgment is meant to certify that someone
actually read those bytes for durable rules with no home yet (an ADR, a
guardrail, CLAUDE.md) — the tool can only confirm the hash matches, never that
anyone read anything.

So the work here is a genuine reading pass over the merged handover's history,
oldest-first, extracting anything durable before archiving it. Doing it as a
mechanical size-reduction would satisfy the guard and defeat the gate's
purpose.

## Note on scope

The merged file contains BOTH branches' handover history, so the extraction
pass has to consider Phoenix-side content that this repository's sessions have
never read. That is more than a routine rotation and should be scoped as its
own piece of work rather than squeezed into whatever session next needs to
write a handover line.

## Triage

- **Decision:** open, unassigned. Blocking for any session that needs to
  update `docs/state.md`, which is every session that follows the Pipeline's
  own bootstrap protocol.
