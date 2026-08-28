---
schema: pipeline.backlog-item.v1
id: pipeline.nothing-checks-that-a-capability-is-reachable
type: improvement
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — three separate instances in one session, each found by the PO or by an end-to-end walk rather than by any check. This is the check that would have caught all three."
source: "Pattern identified 2026-08-28 after the PO asked whether agents can even find the guided driver. Each instance below was verified in code or by measurement in the same session."
---

# Nothing checks that a shipped capability is reachable

## The pattern, three times in one session

Every one of these passed its own tests, and every one was unreachable in the product:

| built | tested as | actually |
| --- | --- | --- |
| the guided onboarding driver | its own suite green, smoke test reaching `ready` in 5 invocations | refused by the readiness guard at every non-ready status, and named by no skill, preflight or doc |
| the security gate's satisfying path | measured CLEAN, exit 0, on a fresh project | measured inside *this* checkout, the one place `.gitleaks.toml` resolves; unsatisfiable for every installed-plugin consumer |
| the `nextAction` protocol on the feature/push path | five plan builders publishing correctly, unit-tested | nothing on that path consumed it; a blind session chained zero commands |

One defect, three faces: **the mechanism was measured, the path to the mechanism was not.**

None of the three was caught by a test, by Verify, or by review. Two were caught by the PO
asking; the third by an end-to-end walk written only because the PO insisted the paths be
tested without the Pipeline's own context knowledge.

## Why the existing inventory does not catch it

`harness/scripts/check-product-capability-inventory.mjs` discovers ~570 surfaces and
requires each to belong to exactly one capability. That is a **categorization** check: it
asks whether a surface is accounted for, never whether an agent can find or run it. Its
`SURFACE_KINDS` covers skills, guards, hooks, agent roles and verify phases — an executable
entry point like `scripts/onboarding-init.mjs` is not a surface kind at all, so the driver
was never in scope for the one check that might plausibly have noticed.

## The check

For every agent-facing entry point, assert two properties mechanically:

1. **Named.** Something an agent actually reads — a skill body, a returned `nextAction`, a
   guard's own refusal text — names it. Documentation an agent may never load does not
   count, and that exclusion is the point: the driver *is* documented in its own header
   comment, and that changed nothing.
2. **Admitted.** The guard union admits it in the states where it is meant to be used. A
   command that is named but refused is the failure this repository has now hit twice, in
   two unrelated places.

Both are cheap to assert and neither depends on judgement. The second one already has a
sibling requirement filed against the bootstrap
(`2026-08-28-the-guided-driver-is-neither-discoverable-nor-runnable.md`, acceptance
criterion 3: whatever the bootstrap names, the guard admits). This item generalizes that
from one pair to the whole set, so the next entry point cannot repeat it.

## What this does not attempt

It does not check that a capability is *correct*, or that agents *choose* it over an
alternative. "Exactly one published route" is a separate property, filed separately
(`2026-08-28-a-blind-session-gets-zero-followable-steps-on-the-feature-and-push-path.md`).
This item only closes the gap between "it exists and works" and "it can be reached at all",
which is the gap all three instances fell into.

## Acceptance criteria

- A Verify-registered check enumerates the agent-facing entry points and fails when one is
  named-but-refused, or admitted-but-unnamed.
- The enumeration is DERIVED, not hand-maintained. The inventory's own v3 history is the
  argument: its hand-maintained surface array went stale four times, and each fix added the
  missing entries without removing the reason they go missing.
- The three instances above are covered: adding the driver's admission and the preflight
  pointer makes the check pass; removing either makes it fail.
- A consumer-shaped fixture is used wherever the entry point behaves differently there.
  The security-gate instance was invisible precisely because everything was measured in
  this repository's own checkout.

## Related

- `2026-08-28-the-guided-driver-is-neither-discoverable-nor-runnable.md` — instance 1, and
  the pairwise version of this check.
- `2026-08-28-the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md` —
  instance 2, and the reason a consumer-shaped fixture is an acceptance criterion here.
- `2026-08-28-a-blind-session-gets-zero-followable-steps-on-the-feature-and-push-path.md` —
  instance 3, and the harness that found it.
- `2026-08-27-registering-a-verify-suite-silently-invalidates-the-capability-inventory.md` —
  why the enumeration must be derived rather than declared.
