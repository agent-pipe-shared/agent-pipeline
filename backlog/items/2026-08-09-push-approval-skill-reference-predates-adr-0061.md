---
schema: pipeline.backlog-item.v1
id: pipeline.push-approval-skill-reference-predates-adr-0061
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Turn-efficiency root-cause analysis of the PO's private Claude+Pipeline 0.5.4 happy-path test run, 2026-08-09 (sanitized, no PO-identifying data). Confirmed by direct file comparison, not only transcript inference."
due: 2026-08-16
---

# The `push-approval.md` skill reference agents load at runtime still describes the pre-ADR-0061 ceremony

## What's wrong

`docs/push-release-flow.md` (updated 2026-08-07 under
[ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md)) describes
push approval as one PO command: `authorize-critical`, typed `approve`, the
passphrase — that's the whole human ceremony. But the skill reference an agent
actually consults **mid-session**,
`plugins/pipeline-core/skills/pipeline-start/references/push-approval.md`,
was never updated to match: it does not mention `authorize-critical` anywhere,
and still frames the two-step `prepare-critical`/`approve-critical` shape as
current, plus "run it with no arguments to see the current subcommand set" —
sending the agent to `--help` output to rediscover a command the canonical doc
already names. Confirmed byte-identical between this repo's copy and the
local marketplace's shipped copy — both stale.

## What it cost, measured

In the 2026-08-09 Claude test run, the agent spent roughly 4.5 minutes (turns
around the point the PO said "push this branch") reading its own plugin
source (`po-human-approval.mjs --help`, grepping for subcommands) to
reconstruct the *current* one-command shape from scratch, then separately
re-asked the PO which approval mode to use — a question `pipeline.user.yaml`
already answers and `push-approval.md`'s own stated rule says to state, not
ask. Push approval overall consumed 55% of the session's wall clock; this
specific staleness is one of several contributing causes (see the sibling
items on the `critical-human-proof.json` materialization gap and the HGO
digest-emission gap for the rest of that phase's cost).

## Direction

1. Update `plugins/pipeline-core/skills/pipeline-start/references/push-approval.md`
   to lead with the `authorize-critical` one-command shape, matching
   `docs/push-release-flow.md`'s framing (by reference or by copying the
   relevant paragraph) — not the raw subcommand list.
2. Consider a structural fix closing the whole class: a test or generation
   step that asserts the skill reference names every subcommand
   `po-human-approval.mjs --help` actually reports, the same drift class
   already flagged for `guard-lifecycle-ready.mjs`'s allowlist
   (`2026-08-07-lifecycle-guard-does-not-know-the-human-signing-commands.md`).
3. The marketplace-shipped copy needs the identical fix applied through
   whatever process publishes this repo's plugin content there — out of
   scope for a fix confined to this repo's checkout.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted (direction 1 only).
- **Rationale:** self-triaged in the same block, disclosed as such — PO is AFK, standing instruction to close bounded non-judgment items directly. Direction 1 (lead with the `authorize-critical` one-command shape, mirroring `docs/push-release-flow.md`'s already-canonical framing) is a content-sync fix with a named source of truth to mirror, not a new design. Direction 2 (a structural drift-prevention test) has real design latitude (schema/generation-step choice) — declined here, left for its own dispatch. Direction 3 (marketplace-shipped copy) is explicitly out of scope per the item's own text.
- **Assignment (if accepted):** immediate, this block (GF-114).
- **Date:** 2026-08-11
