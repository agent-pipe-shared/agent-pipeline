---
schema: pipeline.backlog-item.v1
id: pipeline.test-path-guard-blocks-the-briefed-edit-and-offers-no-route
type: defect
owner: pipeline
status: open
created: 2026-08-08
sprint: alfred
due: 2026-08-15
source: "Elephant, 2026-08-08, GF-057. Third confirmed instance across two blocks; each one verified at a line before filing. The first (GF-056) was walked around with a shell write, the second and third were reported and stopped."
done_when: contains plugins/pipeline-core/lib/human-guard-override.mjs briefed-test-change
---

# A briefed test edit is refused, and the refusal's own route is closed too

## The pattern, three times

`guard-testpath.mjs` exists to stop an implementor quietly rewriting the test
that judges its work. That is right, and nothing here argues against the rule.

The defect is what happens when the edit is *the task*. A dispatch briefed to
add regression coverage to a protected suite is refused exactly like an
implementor sneaking a passing assertion past a gate, and the refusal names a
route that cannot be taken from inside a session:

1. **GF-056** — refused; the dispatch walked around it with a shell write. That
   workaround is itself the failure this guard exists to prevent, and it worked.
2. **GF-057, earlier** — refused; reported and stopped. Recorded in
   `docs/state.md` as "the discipline improved, the mechanism did not."
3. **GF-057, C2** — refused; reported and stopped, with the finished content
   handed to a human.

Three for three, the guard was right that an agent was editing a protected test,
and three for three it was wrong about why.

## Why the override does not close it

For a TP-protected path the override route depends on what the target is. For
`harness/scripts/verify.mjs` (TP-3) it is a signature: expensive, but a route.

For a test file under `plugins/pipeline-core/**` in a source checkout it is not
a route at all. `recordHumanGuardDenial()` takes the `eligible.authorCandidate`
branch (`plugins/pipeline-core/lib/human-guard-override.mjs:1466`) and returns
`status: "author-repair-required"` with a `candidateSourceRoot`, never
`status: "planned"`. Author repair needs an explicit author source root, which a
guard deliberately will not select on a human's behalf. So the guard's own
override planner reports, correctly, that it has nothing to offer.

State this precisely, because a previous session's report generalised it wrongly:
this is **not** a blanket rule about `plugins/pipeline-core/**`. The same block
wrote and committed `guard-lifecycle-ready.test.mjs`,
`project-onboarding-v3.test.mjs` and a new
`guard-lifecycle-recovery-contract.test.mjs` with no trouble at all. It is the
TP-listed patterns in `project/guard-config.json`, and only those.

## What this costs, measured

A hardening block's whole job is to add the coverage that would have caught the
defects it is fixing. The protected suites are, by construction, the ones
guarding the highest-value rules — which is exactly where new coverage is worth
most. So the guard is strictest precisely where the block most needs to write,
and the work ends as a handover artifact a human must paste.

That is not a hypothetical cost. This block ends with two such handovers: four
unregistered suites (TP-3) and four validated-but-unapplied checks (TP-6).

## Direction, not a design

The shape that fits the existing model is a **briefed test-change authorization**
— the thing `project/guard-config.json`'s own reason strings already name, three
times, in the words "no ad-hoc edits outside a briefed test-change task". The
guard enforces the prohibition; nothing implements the exception the prohibition
is phrased around.

Constraints any design must hold:

1. **The authorization is bound to the exact target and the exact briefing**, not
   to a session or a time window. A blanket "test edits allowed now" is the
   weakening this guard exists to prevent.
2. **It is granted before the work, not after the refusal.** A route discovered
   by hitting a wall is how the GF-056 shell-write workaround happened.
3. **A human still decides.** The point is not to remove the human from the
   loop; it is that the human's decision should be expressible *as* an
   authorization the session can then act under, instead of as a manual paste
   after the fact.
4. **The refusal must say which of the two situations it is in** — "this is an
   in-scope briefed edit and here is how it gets authorized" versus "there is no
   route for this target at all". Today both produce the same message, and only
   reading `human-guard-override.mjs:1466` distinguishes them. That is the
   block's standing generalisation again: the assurance holds, the signpost
   points at a route that is closed.

## Related

- `docs/pending-verify-registrations.md` — both handover artifacts this defect
  produced, and the exact human steps.
- `docs/state.md`, GF-057 — the second instance, recorded there.
- `2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md` — the
  TP-3 half of the same problem, filed separately because its override *is* a
  route, only an expensive one.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted — build the briefed-test-change authorization this
  item's own Proposal describes (bound to exact target + exact briefing,
  granted before the work not after a refusal, human decides, refusal states
  which of the two situations it is in). **Plus an explicit addition:** a
  human override must also remain possible via signature-or-chat depending on
  `gates.push_approval` config — same duality as push approval elsewhere in
  this repo. Designed together with
  `2026-08-08-an-authority-gate-is-bypassable-by-choosing-a-different-write-tool.md`
  (cluster C) — see that item for the full three-component design (bypass
  closure + this authorization + the override path) and the shared rationale.
- **Rationale:** PO, 2026-08-11, same decision as the sibling item (cluster
  C): "Empfehlung aber auch human override muss möglich sein per Signatur
  oder Chat je Config." SECURITY/GUARDRAIL-class, MP-07 max-tier model.
- **Assignment (if accepted):** Unassigned — see the sibling item for the
  combined assignment; this item's own four constraints (exact target/exact
  briefing binding, granted before not after, human decides, refusal states
  which situation) are the acceptance bar for this specific component of that
  combined design.
- **Date:** 2026-08-11

### Sprint deferral (2026-08-17)

- **Decision:** deferred — owned by Sprint Alfred.

Deferred to Sprint Alfred ("Agent-first architecture, mechanical governance,
measurable rigor, and control integrity" — ADR-0043's 2026-08-17
amendment) — SECURITY/GUARDRAIL-class design work, matches Alfred's scope
directly. The two same-day workarounds it produced (docs/pending-verify-
registrations.md handovers) remain a live cost until this lands, but the
work itself is a deliberate cross-cutting design, not a same-session patch.
