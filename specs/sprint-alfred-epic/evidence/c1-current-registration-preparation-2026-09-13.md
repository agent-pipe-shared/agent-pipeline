# C1 current registration preparation — 2026-09-13

## Scope and status

This is a routing preparation for the one current C1 observer/store registration
finding. It is not a registration, maintenance-window request, signature, or
Verify result. The authoritative PO queue identifies exactly one unregistered
suite, `plugins/pipeline-core/scripts/observe-critic-preflight.test.mjs`
([po-decision-queue.md](po-decision-queue.md), row 113). The current
route remains the legacy TP-3 protected edit until the planned B2-ii declarative
file exists ([spec.md](../spec.md)); the route note explicitly says
that no such file exists in this checkout
([c1-suite-registration-route-2026-09-08.md](c1-suite-registration-route-2026-09-08.md)).

The C1 deliverable covers orchestrator-side observation of interruption events,
including dispatch failures and readiness transitions; it does not make a
runner-hook claim ([spec.md](../spec.md)). C1's continuing evidence
obligation is real event → correlation → storage → honest report, with typed
limited-coverage outcomes, rather than an inferred release gate
([po-decision-queue.md](po-decision-queue.md)).

## PROPOSED protected Verify registration (not applied)

The matching unregistered file is
`plugins/pipeline-core/scripts/observe-critic-preflight.test.mjs` (the test
source begins at [observe-critic-preflight.test.mjs](../../../plugins/pipeline-core/scripts/observe-critic-preflight.test.mjs)).

**PROPOSED only:** append this object to the current `TEST_SUITES` array in
`harness/scripts/verify.mjs`, immediately after the adjacent current
`critic-dispatch-preflight-tests` object at
[verify.mjs](../../../harness/scripts/verify.mjs):

```js
{ name: "observe-critic-preflight-tests", file: join(pluginScriptsDir, "observe-critic-preflight.test.mjs") },
```

- Stable proposed suite id: `observe-critic-preflight-tests`.
- Expected test path: `plugins/pipeline-core/scripts/observe-critic-preflight.test.mjs`.
- Array/location anchor: `TEST_SUITES` (declared at
  [verify.mjs](../../../harness/scripts/verify.mjs)), adjacent to
  `critic-dispatch-preflight-tests` at lines 499–500.
- Object shape is the current `{ name, file: join(pluginScriptsDir, "...") }`
  form, not a scoped- or Windows-assurance registration. Verify folds
  `TEST_SUITES` with the other arrays into `registeredSuites`
  ([verify.mjs](../../../harness/scripts/verify.mjs)).

This proposed shape is accepted by the current checker only when its
`TEST_SUITES` `file` value is an entire `join(<recognized directory constant>,
<quoted segments...>)` expression; `pluginScriptsDir` is one of the recognized
constants ([check-suite-registration.mjs](../../../plugins/pipeline-core/scripts/check-suite-registration.mjs),
[check-suite-registration.mjs](../../../plugins/pipeline-core/scripts/check-suite-registration.mjs)).
The edit itself is TP-3 protected and needs the external human-proof and active
maintenance-window route; neither condition is asserted here
([c1-suite-registration-route-2026-09-08.md](c1-suite-registration-route-2026-09-08.md),
[c1-suite-registration-route-2026-09-08.md](c1-suite-registration-route-2026-09-08.md)).

## PROPOSED matching inventory surface (not applied)

The current semantically matching inventory surface exists: the existing
`capabilities[]` object with `id: "deterministic-verification"`, beginning at
[product-capability-inventory.json](../../../docs/product-capability-inventory.json).
It already owns the current adjacent Critic preflight registration surface,
`verify-phase:harness/scripts/verify.mjs:critic-dispatch-preflight-tests`, at
[product-capability-inventory.json](../../../docs/product-capability-inventory.json).

**PROPOSED only:** add exactly this new member to that same object's
`surfaceIds[]`, next to the existing Critic preflight member:

```json
"verify-phase:harness/scripts/verify.mjs:observe-critic-preflight-tests"
```

This derives the surface value from the current `verify-phase:<Verify path>:<suite
name>` members and the proposed stable suite id above; it does not create a new
capability id or semantics. The minimum inventory change is the one
`surfaceIds[]` member. Preserve the object's current required contextual fields
unchanged: `id`, `publicName`, `problem`, `benefit`, `status`, `surfaceIds`,
`runners`, `runnerDispositions`, `platforms`, `operatingShapes`,
`prerequisites`, `productionEvidence`, `testEvidence`, `targets`,
`configurationPath`, and `specializedOnlyReason` (the object's continuing
fields are visible at
[product-capability-inventory.json](../../../docs/product-capability-inventory.json)).

## Live checks

| Command | Exit | Observed result |
| --- | ---: | --- |
| `node plugins/pipeline-core/scripts/check-suite-registration.mjs` | 1 | Exactly one unregistered suite: `plugins/pipeline-core/scripts/observe-critic-preflight.test.mjs`. The checker defines exit 1 for unaccounted suite findings and distinguishes registration from whether a suite passes ([check-suite-registration.mjs](../../../plugins/pipeline-core/scripts/check-suite-registration.mjs)). |
| `node --test plugins/pipeline-core/scripts/observe-critic-preflight.test.mjs` | 0 | 3 pass / 0 fail: `observed controller preserves real rejected producer bytes and retains same-lineage immutable receipts`; `packet-ready and the direct CLI never auto-write an observation`; and `owner phase changes retain the operation lineage while recording the current phase`. This is focused execution evidence only, not Verify coverage. |
| `node --test harness/scripts/check-verify-suite-registration.test.mjs` | 1 | Cases 1–13 pass; the test then fails its assertion because the actual live unregistered suite is `observe-critic-preflight.test.mjs`, rather than the fixture's expected `unregistered-break.test.mjs`. No test was edited. |
| `git diff --check` | 0 | No whitespace error reported before this evidence file was created. |

The checker is intentionally standalone and does not establish a passing
registered suite ([check-suite-registration.mjs](../../../plugins/pipeline-core/scripts/check-suite-registration.mjs),
[check-suite-registration.mjs](../../../plugins/pipeline-core/scripts/check-suite-registration.mjs)). Neither focused failure is treated as a
registration, integrated Verify, C1-completion, collection-baseline, or Critic
verdict claim.

## Route handoff and remaining gates

The owner may use this exact proposed pair only through the current TP-3
author-repair / externally proved maintenance-window route, then read back the
protected registration and inventory change. Required later gates remain:

1. TP-3 external proof and an active authorized maintenance window.
2. Protected registration and inventory edit/readback by the authorized owner.
3. A passing applicable Full Verify on the resulting candidate.
4. Independent review and PO acceptance.

No exclusion, maintenance window, signature, protected edit, inventory edit,
or completion claim was made by this preparation.
