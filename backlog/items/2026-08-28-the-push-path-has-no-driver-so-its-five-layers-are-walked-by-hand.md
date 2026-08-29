---
schema: pipeline.backlog-item.v1
id: pipeline.push-path-has-no-driver
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
done_when: manual
tracking: "Nova B — PO-raised 2026-08-28 on seeing the guided onboarding reach ready: 'dann braucht der push pfad auch so was weil der kostet auch mega viel'. Deliberately NOT Nova A: the candidate must not grow a second driver before its first one is reviewed."
source: "PO request 2026-08-28. Scope established by reading what onboarding-init.mjs actually drives (project-onboarding-v3.mjs's own subcommand table, nothing else) and docs/push-release-flow.md's five authorization layers."
---

# The push path has no driver, so its five layers are walked by hand every time

## What the existing driver does and does not cover

`onboarding-init.mjs` drives exactly one command family: `project-onboarding-v3.mjs`'s
own subcommand table. It holds no domain knowledge and follows only the `nextAction`
field. It does not touch the push path, and it does not touch the design →
implementation path (`2026-08-28-the-design-to-implementation-path-has-no-driver.md`).

## Why a driver is the cheap half, and what the real work is

The driver itself is a small generic loop. What made the onboarding chain drivable was
not writing it — it was making every plan and apply publish a `nextAction` naming the
next command with its digest already filled in. Five separate builders had to be changed
for that, and two still remain.

So "the push path needs a driver too" is really "the push path's commands need to speak
the `nextAction` protocol." The driver is then almost free, and it is the same driver.

## What can and cannot be chained here

`docs/push-release-flow.md` names five authorization layers. They are not equally
automatable, and the distinction is the whole design:

- **Agent-executable, and therefore chainable**: the gate evaluations, the evidence
  readbacks, the candidate binding, `approve-push`'s own preimage computation, the
  digest steps of the human-override ceremony (`plan`, `prepare-authorization`,
  `emit-signature-digest` — ADR-0059 Decision 1 already establishes these need no key).
- **Irreducibly human, and must stay so**: the detached Ed25519 signature against a key
  held outside the repository. That is the one act that is actual protection rather than
  ceremony, and no driver may ever collapse it.

This matches the standing PO position that the external-key sign step is the real gate
and the rest should eventually be agent-run. A push driver's entire value is to make the
signature the ONLY place a human is asked — today it is one of several.

## Why this is worth more than it looks

The onboarding measurement is the argument: a fresh project needed 4 human rounds where
3 is the floor, and the driver chained 15 commands by itself between them. Before the
driver, every one of those 15 was a turn. The push path today is in the pre-driver state,
and unlike onboarding it is walked repeatedly rather than once per project.

Two live incidents this week are the same class: a signature spent on a capability that
had already expired, and a ceremony seeded from a request that did not match the retried
call. Both are sequencing errors of the kind a driver removes by construction — it does
not mis-order steps, and it does not interleave other work between seeding and consuming.

## Direction

1. Establish which push-path commands already publish a `nextAction` and which do not.
   Expect most not to; the protocol was built for the onboarding chain.
2. Give each one a `nextAction` naming its own successor with the digest filled in,
   following the convention already established (compute the action once, publish it as a
   sibling field attached AFTER the digest so no binding changes).
3. At the signature, publish a `collect-input`-shaped stop, exactly as the onboarding
   chain does for the PO's acknowledgement — the driver stops, states what the human must
   do, and never offers a command that would do it for them.
4. Reuse `onboarding-init.mjs`'s loop rather than writing a second driver, or extract it
   if it cannot be reused as-is. Two drivers with two stop conventions would be worse than
   none.

## Acceptance criteria

- A push from a clean candidate to a landed commit is driven end to end with the human
  asked exactly once, at the signature.
- Measured the way the onboarding path was measured — human rounds, chained commands,
  repair subcommands — against a real repository, not asserted.
- No gate is satisfied by the driver on the human's behalf, and no ceremony step is
  reordered or skipped. A test asserts the signature stop cannot be passed by any
  driver-executable action.

## Related

- `2026-08-28-no-preflight-checks-whether-the-push-gate-is-satisfiable-before-a-signature-is-requested.md`
  — NOW/Nova A, and the first piece of this: knowing the gate is satisfiable before a
  human is asked to sign.
- `2026-08-28-an-expired-override-is-armed-instead-of-refused.md` — a sequencing failure
  that cost a live signature; fixed, but the class is what a driver removes.
- `2026-08-28-onboarding-needs-one-guided-init-instead-of-a-turn-by-turn-state-machine.md`
  — the pattern this follows.
