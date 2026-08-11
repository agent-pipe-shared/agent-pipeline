---
schema: pipeline.backlog-item.v1
id: pipeline.cross-repository-redirect-eligibility-does-not-consult-the-sensitive-path-boundary
type: defect
owner: pipeline
status: open
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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
