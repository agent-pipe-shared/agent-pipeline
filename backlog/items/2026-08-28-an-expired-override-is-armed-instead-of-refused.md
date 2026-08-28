---
schema: pipeline.backlog-item.v1
id: pipeline.an-expired-override-is-armed-instead-of-refused
type: defect
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: 621a19c68649787b20886bbcfd998a7516afb75f
closure_evidence: backlog/items/2026-08-28-an-expired-override-is-armed-instead-of-refused.md
sprint: nightwing
source: "Hit live, 2026-08-28, consuming a PO signature for a TP-3 guard override; then located in plugins/pipeline-core/lib/human-guard-override.mjs by reading the arming and consuming paths against each other."
---

# An expired guard-override capability is armed instead of refused, and the failure only surfaces as an ordinary denial

## What happened

The PO signed the intent for a TP-3 override. `authorize-by-signature` reported

```json
{"schema":"pipeline.human-guard-override-capability.v2","status":"armed","mutated":true}
```

and the byte-identical Edit retry was then **denied** as if no capability existed.
The denial carried no hint that an armed capability had been rejected; it read
exactly like a first denial, and it seeded a fresh request.

The capability file records the contradiction in plain sight:

```json
"authorizedAt": "2026-08-28T10:03:47.822Z",
"expiresAt":    "2026-08-28T09:47:32.089Z",
"consumedAt":   null
```

Armed sixteen minutes after its own expiry. The PO's signature was spent for
nothing, and a second signing ceremony was needed.

## Where it is

`plugins/pipeline-core/lib/human-guard-override.mjs`.

The arming path builds `capabilityCore` and copies the plan's expiry forward
without ever comparing it to now (≈ line 3216):

```js
authorizedAt: new Date(nowMs).toISOString(),
expiresAt: planned.expiresAt,
consumedAt: null,
```

The consuming path does check it (line 3359):

```js
const expired = new Date(capability.expiresAt).getTime() <= nowMs;
```

So the window is enforced exactly one step too late. The asymmetry is not a
general blind spot: the *request* layer already refuses an expired input at
line 1908 (`new Date(request.expiresAt).getTime() <= nowMs`). Only the arming of
a plan/selection skips the equivalent test.

## Why this is worth more than the minute it costs

The wasted step is a **human passphrase entry against an external key**, the one
irreducibly manual act in the whole model. Everything else in the ceremony is
digest computation an agent can redo for free. Spending that step and then
discovering, several tool calls later, that it could never have worked is the
most expensive possible place to fail.

It also mis-teaches. `CLAUDE.md` currently states that a `guard-testpath.mjs`
denial's admission failure "is a byte-identity mismatch, not a code defect —
verify before spending a PO ceremony", and prescribes hunting for a re-derived
`old_string`, a different path spelling, or a stray optional field. In this
incident `toolInputSha256` was **identical** across both requests
(`f8415554…`, confirmed by running `plan` on each), so that guidance sent the
diagnosis in the wrong direction. The rule is right about its own case and wrong
as a general claim; both causes produce the same undiagnosed denial.

## Proposal

Not designed here, but the shape is narrow.

1. **Refuse at arming.** `authorize-by-signature` (and any sibling arming route)
   compares `planned.expiresAt` against now before writing the capability, and
   returns a typed refusal — the window is over, re-plan — instead of `armed`.
   Fail-closed already holds at consumption, so this changes no authority; it
   moves the answer to where the human is still in the loop.
2. **Say which check refused.** A denial that rejected an existing armed
   capability should be distinguishable from a first denial. Today both render
   identically, which is what turned a one-line cause into a multi-step
   investigation. `driftChecks` already computes a per-reason breakdown at the
   consumption site; nothing surfaces it.
3. **Correct the `CLAUDE.md` paragraph** so the next session does not start from
   the byte-identity hypothesis alone.

## Acceptance

- Arming a capability whose plan window has passed returns a typed refusal, and
  no capability file is written.
- A denial that rejected an armed-but-unusable capability names the reason.
- A test covers the expired-plan arming path specifically, not only the expired
  consumption path.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Reproduced live at cost, then confirmed by reading the two code
  paths against each other and by comparing the `toolInputSha256` of both
  requests. The `CLAUDE.md` claim it contradicts was checked rather than assumed.
- **Assignment (if accepted):** `sprint: nightwing`. Same subject and very likely
  the same fix session as
  `pipeline.two-signature-ceremonies-overwrite-each-others-proof`: both waste a
  human signature through a mechanical detail nothing surfaces. Alfred is in
  flight and closed to new scope (PO, 2026-08-28).
  **Condition for picking it up:** before any further batching of signature
  ceremonies is treated as routine. Interim mitigation is procedural and belongs
  to the dispatcher, not the signer: consume a signature immediately, and do not
  interleave other work between seeding a ceremony and the PO signing it.
- **Date:** 2026-08-28

## Closing note (reconciliation, 2026-08-29)

Landed ahead of its `nightwing` scheduling. Commit
`87a9400745f66bb185b39ce3234de6e99918716f` adds `assertPlanNotExpired()`
(mirroring `assertRequestNotExpired()`'s HGO-EXPIRED shape) and calls it in both
arming routes (`authorize-by-signature` and the chat-mode activate path) before
`capabilityCore` is ever built, confirmed at lines 1929/2935/3155 of
`plugins/pipeline-core/lib/human-guard-override.mjs`; the pre-existing
consumption-side distinction between an armed-but-expired capability
(`status:"replan"`, `code:"HGO-EXPIRED"`) and a first denial (`status:"absent"`)
is unchanged and now has its own dedicated test. Commit
`621a19c68649787b20886bbcfd998a7516afb75f` then corrected the three copies of
the now-stale `CLAUDE.md` Cause-2 paragraph (`CLAUDE.md`,
`push-gate-satisfiability.mjs`'s header comment, `checkSignatureWindow`'s own
runtime message) that still described the fixed defect as current. All three
acceptance criteria confirmed: `node --test
plugins/pipeline-core/lib/human-guard-override.test.mjs` (94/94) exits 0,
including `NVA-G-EXPIREDARM: authorize-by-signature refuses to arm...`,
`NVA-G-EXPIREDARM: authorizeHumanGuardOverride (chat mode) refuses to arm...`,
and `NVA-G-EXPIREDARM: a consumption denial that rejected an existing (but
now-expired) armed capability is distinguishable from a first denial`.
