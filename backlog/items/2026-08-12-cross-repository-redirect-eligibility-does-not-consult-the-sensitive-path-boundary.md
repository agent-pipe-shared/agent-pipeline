---
schema: pipeline.backlog-item.v1
id: pipeline.cross-repository-redirect-eligibility-does-not-consult-the-sensitive-path-boundary
type: defect
owner: pipeline
status: closed
created: 2026-08-12
source: "NVA-BL-75, 2026-08-12, surfaced while measuring override-reachability for backlog/items/2026-08-08-a-guard-reclassification-changed-what-a-signature-can-lift.md. Explicitly disclosed by the dispatch as a measurement, not a claimed exploit."
---

# A signature can currently arm a Bash redirect targeting a sensitive out-of-root path like `/etc/passwd`

## What was measured

`printf implementation 2>/etc/passwd` measures as
`liftable-by-signature:cross-repository-target` under
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`'s current
eligibility logic — a human's signed override capability CAN currently be
armed for a shell command whose redirect target is a sensitive path
outside the project root.

This contradicts an existing stated invariant: `NOVA-XREPO-HGO-6` pins
that a sensitive out-of-root **Edit** target is unarmable
(`HGO-NONOVERRIDABLE-CROSS-BOUNDARY`). The gap is that `eligibility()`'s
Bash-command redirect-target loop hands an out-of-root target straight to
`crossBoundaryEligible()` without first consulting `hardBoundaryPath()` —
the sensitive-path check that DOES run for in-root relative Write/Edit
targets. So the sensitive-path protection exists, and is enforced for one
tool-call shape (a direct Edit/Write to a sensitive path) but not for
another (a Bash redirect writing to the same path).

## Why this needs a decision, not silent acceptance

This is not an agent-exploitable hole by itself — arming the capability
still requires a human's own private key or the chat-confirmation
ceremony, per [ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md)'s
"protects against the agent, not the human" design policy. The question is
narrower and still real: is the sensitive-path boundary meant to be a
property of the TARGET (any tool-call shape that could write there is
refused), or a property of the specific TOOL (only Edit/Write targets are
checked, Bash redirect targets are a structurally different case)? Today's
code implements the second reading by omission, not by a stated decision —
nothing documents that Bash redirects were deliberately excluded from
`hardBoundaryPath()`'s check.

## Direction, not a design

Not designed here. The measuring dispatch's own framing: whether the
sensitive-path refusal is meant to reach Bash redirect targets the same
way it reaches direct write-tool targets is a decision, not a fix that was
briefed. Whoever picks this up should:

1. Decide whether `hardBoundaryPath()` (or an equivalent check) should run
   on Bash redirect targets before `crossBoundaryEligible()` is consulted,
   the same way it already runs for in-root relative Write/Edit targets.
2. If yes: thread the check in at the point `eligibility()`'s Bash branch
   resolves a redirect target, mirroring the existing Write/Edit call site.
3. If no (a deliberate scope decision that Bash redirects are a different
   risk class): document that explicitly in code, near both
   `hardBoundaryPath()` and the Bash redirect-target resolution, so the
   next reader does not rediscover this as a silent gap again.
4. Either way, the new 12-command reachability corpus test added by
   `431776c3` (`plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`)
   already pins the CURRENT (gap-present) behavior as its baseline — update
   that pin once a decision is made, do not treat the existing pin as
   itself the intended-forever behavior.

## Related

- `2026-08-08-a-guard-reclassification-changed-what-a-signature-can-lift.md`
  — the item this measurement was performed for; a different, narrower,
  already-resolved question.
- [ADR-0059](../../docs/adr/0059-signed-human-guard-override.md) — the
  override-eligibility boundary this touches.
- [ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md) — the
  "protects against the agent, not the human" policy that bounds why this
  is real-but-not-urgent rather than an active exploit.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, deferred to Sprint Alfred.
- **Rationale:** matches Alfred's confirmed scope — "control integrity" —
  directly; this item's own text is explicit that arming the capability
  still requires a human's own key or the chat ceremony (ADR-0061's
  "protects against the agent, not the human" policy), so it is real but
  not urgent.
- **Assignment (if accepted):** next available Alfred slot — needs the
  target-vs-tool decision (question 1) before implementation.
- **Date:** 2026-08-17

## Closure, 2026-08-19 (verified live against current code, not against status text)

Confirmed resolved in code by an independent, code-first verification pass
(Workflow task wdyd7rk9g, 2026-08-19) run in response to a PO directive to
actively check every open backlog item against current code rather than
trusting frontmatter status. The item's own frontmatter/Triage text had not
been updated to reflect the landed fix; this closure catches that drift.

Read plugins/pipeline-core/lib/human-guard-override.mjs's eligibility() function directly (lines 1601-1652, the Bash-command redirect-target loop the item names). It now contains an explicit decision citing this exact item by path in an inline comment: 'PO decision 2026-08-18 #7 (backlog/items/2026-08-12-cross-repository-redirect-eligibility-does-not-consult-the-sensitive-path-boundary.md)'. The code (lines 1645-1647) now returns `{ eligible: false, code: 'HGO-NONOVERRIDABLE-CROSS-BOUNDARY' }` outright for BOTH 'refused' and 'cross-boundary' classifyPath() results on a Bash redirect target -- never routing it through crossBoundaryEligible() at all. This is a stronger, categorical fix (a Bash redirect is declared to never be a 'permitted target type' for the cross-repository-target liftable class) than the item's own Direction 1/2 suggestion (threading hardBoundaryPath() into the check). Traced to commit fcdee923 ('fix(human-guard-override): redirect targets are never a permitted cross-repo target type'). Confirmed the item's own exact measured test case is now pinned: guard-lifecycle-ready.test.mjs:3378 lists `printf implementation 2>/etc/passwd` with expected reach `never-liftable:external-operator-required:HGO-EXTERNAL-PROJECT-BOUNDARY`, replacing the old `liftable-by-signature:cross-repository-target` behavior the item measured and flagged. The item's Triage text ('needs the target-vs-tool decision before implementation') is stale as of this fix.
