---
schema: pipeline.backlog-item.v1
id: pipeline.nothing-checks-that-a-capability-is-reachable
type: workflow-improvement
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_repository: self
closure_commit: e7a3f5a468cbd95b1366bef1fc60187a689d99f7
closure_evidence: harness/scripts/check-product-capability-inventory.test.mjs
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — three separate instances in one session, each found by the PO or by an end-to-end walk rather than by any check. This is the check that would have caught all three."
source: "Pattern identified 2026-08-28 after the PO asked whether agents can even find the guided driver. Each instance below was verified in code or by measurement in the same session."
done_when: contains harness/scripts/check-product-capability-inventory.mjs reachab
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

## Progress, 2026-08-29 (dispatch NVA-W8-VERIFYREG2, landed by the Elephant, commit `e7a3f5a4`)

`harness/scripts/check-product-capability-inventory.mjs` gained `discoverEntryPoints()`
(derived from the established `Usage: node <path> ...` convention) and
`checkEntryPointReachability()`, asserting both failure shapes mechanically. A
consumer-shaped fixture (HAW-B02) degrades to zero findings, satisfying AC4. The three named
instances (AC3) are each covered by a dedicated fixture test (HAW-B03/B04/B05).
`check-product-capability-inventory.test.mjs`: 23/23 pass.

Running the new check against this live repo surfaced two real, previously-unknown
admitted-but-unnamed entry points (`runner-profile-migration-v3.mjs`,
`v3-bootstrap-authority.mjs`) — filed separately as
`2026-08-29-two-v3-scripts-are-admitted-but-unnamed.md` rather than guessed at inline, since
naming them correctly needs real usage-scenario knowledge, not a mechanical fix. Tracked as
an explicit, commented exception in the checker itself so the check stays load-bearing for
every other entry point.

## Correction, 2026-08-29 (Elephant): AC1 was already satisfied, closing for real

The note above was wrong. `harness/scripts/verify.mjs` line 408 already registers
`check-product-capability-inventory.test.mjs` itself as an unconditional suite
(`product-capability-inventory-tests`, inside the main `TEST_SUITES` array, not a scoped or
Windows-only one) — that registration predates this dispatch and needed no new insertion.
Since HAW-B00 through HAW-B05 (the new reachability tests) live in that same file, they run
under ordinary Verify already. `harness/scripts/verify.mjs` was never touched by this
dispatch, and did not need to be — NVA-R26's TP-3 work is unrelated (a manual-check
placeholder mechanism and a separate `resume-hint-scripts-tests` registration), not this
item.

All four acceptance criteria are met: (1) Verify-registered, as above; (2) DERIVED
enumeration (`discoverEntryPoints()`, the `Usage: node ...` convention, no hand-maintained
list); (3) the general named-but-refused/admitted-but-unnamed shape is covered by dedicated
fixture tests (HAW-B03/B04), and HAW-B05 proves both directions — named+admitted passes,
removing either makes it fail — for AC3 exactly; (4) a consumer-shaped fixture (HAW-B02)
degrades to zero findings rather than a false failure.

Status: closed. Closure evidence: `harness/scripts/check-product-capability-inventory.test.mjs`,
commit `e7a3f5a4`. Verified: 23/23 pass, exit 0; `node harness/scripts/check-product-capability-inventory.mjs --check-reachability` → PASS.

## Related

- `2026-08-28-the-guided-driver-is-neither-discoverable-nor-runnable.md` — instance 1, and
  the pairwise version of this check.
- `2026-08-28-the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md` —
  instance 2, and the reason a consumer-shaped fixture is an acceptance criterion here.
- `2026-08-28-a-blind-session-gets-zero-followable-steps-on-the-feature-and-push-path.md` —
  instance 3, and the harness that found it.
- `2026-08-27-registering-a-verify-suite-silently-invalidates-the-capability-inventory.md` —
  why the enumeration must be derived rather than declared.

## Closing note (reconciliation, 2026-08-28)

Partially resolved. `roles/critic.md` line 103 now names "reachability and effect" as a
mandatory Critic search-surface dimension, using this item's exact three-shape vocabulary
(*named but not admitted*, *admitted but not named*, *published but not consumed*) — so a
human/agent review now has a contractual prompt to check this pattern per diff.

The item's actual acceptance criteria are NOT met: it asks for a Verify-REGISTERED,
DERIVED (not hand-maintained) mechanical check enumerating agent-facing entry points and
failing on named-but-refused/admitted-but-unnamed. Checked: `harness/scripts/verify.mjs`
has no such suite (grepped for the three shape-phrases, no match);
`harness/scripts/check-product-capability-inventory.mjs` still only asserts every
discovered surface belongs to exactly one capability (categorization), not reachability —
grepped for "named"/"admitted"/"reachab" in that file, no match beyond the unrelated
`SURFACE_KINDS` set name. The landed half is a review-time prompt, not the mechanical gate
the acceptance criteria require. Status left `open`.
