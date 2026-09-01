---
schema: pipeline.backlog-item.v1
id: pipeline.hook-bypass-rules-are-overridable-against-the-stated-policy
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "ADR-0079 (docs/adr/0079-hook-bypass-is-never-agent-overridable.md), recording the PO decision (2026-09-01, in session) that hook-bypass has no agent-side override route."
---

# The hook-bypass rules (`GG-17`…`GG-20`) are overridable today, against the stated policy

## What is wrong

`guardrails/git.md` GIT-07 states, at the line documenting `GG-17`…`GG-20`: "The GIT-04
double-confirmation override mechanism applies to `GG-17`…`GG-20` exactly like every other rule id
— no separate procedure." That sentence is mechanically accurate as the code stands:
`plugins/pipeline-core/hooks/guard-git.mjs` places `GG-17`/`GG-18`/`GG-20` as ordinary members of
the `UNION_BLOCKERS` array and `GG-19` in the separate `PRENORM_BLOCKERS` array (needed there only
so it matches before global-option normalization strips the `-c core.hooksPath=...` token) — but
both arrays' matches feed the same `matched` list the `PIPELINE_GUARD_OVERRIDE` arming mechanism
evaluates. A correctly-armed `OVERRIDE GG-17` (or `GG-18`/`GG-19`/`GG-20`) would in fact lift the
corresponding block today.

`CLAUDE.md`'s push-policy bullet already says the opposite — hook-skip stays forbidden, enforced by
the guard union "not by asking". ADR-0079 resolves which of the two governing documents is right:
hook-bypass has no agent-side override route, ever, following the `GIT-03` non-overridable
precedent (evaluated before the deny-rule union, with a stated recoverability rationale: a
published bypass cannot be un-published).

## What must change for the code to match the decision

1. **`guardrails/git.md` GIT-07** — remove or replace the sentence stating that GIT-04's
   double-confirmation override applies to `GG-17`…`GG-20` "exactly like every other rule id".
   State instead that these four rules have no override route at all, citing the `GIT-03`
   precedent and its rationale.
2. **`plugins/pipeline-core/hooks/guard-git.mjs`** — move `GG-17`, `GG-18`, `GG-19`, and `GG-20`
   out of the overridable `UNION_BLOCKERS` array (or otherwise exclude them from the
   `PIPELINE_GUARD_OVERRIDE` arming/matching path), following the `GIT-03` precedent: evaluated
   non-overridably, with the same kind of stated rationale in the code comment.
3. Existing test coverage in `plugins/pipeline-core/hooks/guard-git.test.mjs` (a protected test
   path, `TP-1`) needs a case proving `OVERRIDE GG-17`/`GG-18`/`GG-19`/`GG-20` does NOT lift the
   block, alongside the existing BLOCK/ALLOW pairs per rule id.
4. Resolve the open scope question ADR-0079 leaves open: whether the PO's decision covers the
   whole hook-bypass family for both `git commit` and `git push` (the ADR's recommended reading) or
   push only. Confirm with the PO before or during implementation.

## Why this needs a mandatory T1 Critic round

This is guard code — a change to `plugins/pipeline-core/hooks/guard-git.mjs`'s deny-rule matching
and override eligibility. Guard/guardrail diffs are Critic-mandatory by trigger T1
(`harness/review-protocol.md` §2.1), and `guardrails/git.md` GIT-04 already states this explicitly
for the existing override mechanism: "A guardrail diff that implements the override mechanism is
itself Critic-mandatory (trigger T1)." Removing four rule ids from that mechanism is the same class
of change.

## Why this is scheduled for the maintenance window, not immediate

A guard change immediately before a release sequence is the wrong moment: this repository's current
handover has a release candidate (0.6.0) queued through nine ordered PO terminal actions, ending
with a maintenance window already scoped for TP-5/TP-3-protected work. Landing a guard-matching
change to `guard-git.mjs` outside that window risks destabilizing the exact release-adjacent gate
this change touches, for a fix whose urgency is a documentation/policy correctness gap rather than
an active exploit. This item is scheduled for that maintenance window rather than done immediately.
