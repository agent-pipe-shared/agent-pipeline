---
schema: pipeline.backlog-item.v1
id: pipeline.runner-neutrality-before-third-runner
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-08
due: 2026-12-31
source: "PO question of 2026-08-08 during the greenfield hardening block: whether Antigravity/AGY support is tracked anywhere, given that it will require runner neutrality to hold far better than it does today."
---

# Runner neutrality has to hold before a third runner lands, not because of it

## Why this item exists

Antigravity/AGY **is** recorded — but only as prose, in three places, none of them
a governed item:

- [ADR-0051](../../docs/adr/0051-dual-runner-tri-platform-development-contract.md)
  §64 names it "planned but not yet realized", explicitly out of scope for the
  dual-runner hard requirement, and points at an observation in `docs/state.md`.
- `docs/runner-support.md` gives it an `alpha-documentation-only` descriptor that
  identifies Gemini as the model family and **fails selection closed** — no
  discovery, installation, authentication, network access or invocation.
- `docs/adr/README.md` flags ADR-0051 for revision when it is realized.

So the *runner* is tracked. What is not tracked is the **precondition**: that the
Pipeline's runner neutrality actually works. That gap is the subject of this item.

## The evidence base already exists, and it is not encouraging

Every one of these is a separately filed, separately measured defect in which a
runner other than Codex was mishandled. They were found one at a time, by running
the product, over four days:

- `2026-08-05-pipeline-state-rebind-codex-default-runner.md`
- `2026-08-05-claude-dir-leftovers-defeat-runner-neutral-project-migration.md`
- `2026-08-06-restart-launch-is-codex-only-for-every-runner.md`
- `2026-08-07-onboarding-restart-flow-is-codex-only-not-runner-aware.md`
- `2026-08-07-greenfield-onboarding-writes-mixed-authority-tiers.md`
- `2026-08-08-kickoff-apply-action-drops-the-runner-the-plan-was-made-for.md`
  — the sharpest instance: the promotion entry points take no runner parameter at
  all, so promotion is unreachable for every non-Codex runner.

The PO's own framing of the last one is the argument for this item: *"das ist dann
die 4. Runde Fixes damit Claude geht, das muss nachhaltiger werden."* Four rounds
were needed for the **second** runner, on a code base that already declared
dual-runner support a hard requirement. A third runner arriving on top of that
does not find a neutral system; it finds the same class again, in the places
nobody happened to exercise with Claude.

## The load-bearing claim

Adding AGY is not primarily an AGY task. The defects above are not about Gemini,
Claude or Codex — they are about a runner identity that is accepted at the edge
and then silently replaced by a default somewhere inside. That failure is
invisible while only one runner is exercised in anger, and every new runner
re-discovers it at full cost.

Therefore: **a third runner must not be the mechanism by which these are found.**
The entry criterion is that runner identity is provably carried, not that AGY
happens to work.

## Direction, not a design

1. **Make the class measurable.** An enumeration of every place a runner identity
   enters, is stored, is defaulted, or is dropped — produced by measuring, not by
   reading. The 2026-08-08 finding is the argument: the guarding comment existed
   sixty lines above the functions that lacked the guard, so reading found nothing.
2. **Make the default explicit and loud.** `runner = "codex"` as a silent
   parameter default is what turns every omission into a wrong answer instead of
   an error. Whether the default should exist at all, or only at the outermost
   entry point, is the decision to take.
3. **Adopt a third-runner readiness criterion**, stated before AGY work starts:
   which suites must be runner-parameterised, and what "supported" means for a
   runner whose adapter is not yet written. ADR-0057 already holds that support is
   an implementation obligation rather than a per-cell evidence duty — this item
   is that obligation applied one runner ahead.
4. **Decide where AGY itself is tracked.** Today it lives in three prose
   locations. Either this item becomes its home, or a dedicated epic does — but a
   plan referenced only from an ADR's parenthesis will not survive the next
   roadmap.
5. **Do not start AGY adapter work from this item.** It is deliberately not an
   implementation request. It exists so that when the decision is made, the
   precondition is already known and not re-derived.

## Relationship to the current sprint

Nothing here blocks Sprint Nova. The per-site defects listed above stay separately
owned and separately fixed; this item is the reason to prefer the structural fix
over the fourth patch when both are on the table, and the place where that
preference is recorded.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
