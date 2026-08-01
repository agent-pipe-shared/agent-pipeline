# F1 remediation package — applicability compatibility, rollout, and rollback

## Purpose and decision

This is the bounded follow-up to the Cyborg F1 global applicability correction
in commit `2ac4b5a` (`fix(cyborg): make SCA applicability source-aware`). The
PO decision recorded in `docs/state.md` authorizes the policy change globally:
only a completed OSV adapter result that positively identifies a repository as
having no package sources may make `cap.sca` `not-applicable`. A missing
binary, malformed output, timeout, crash, or unfamiliar result remains
`unknown`/required and must not create an exemption.

The package closes three review gaps without changing that decision:

1. every in-repository consumer accepts the new decisive applicability value;
2. rollout and rollback are explicit for every catalog consumer; and
3. the unrelated `project/` authority bootstrap is excluded from F1 evidence
   and remains independently reviewable.

## Compatibility contract

`resolveApplicableControls()` now has exactly three applicability outcomes:

| Resolver outcome | Meaning | Consumer rule |
| --- | --- | --- |
| `applicable` | The control applies. | Evaluate it normally. |
| `not-applicable` | A recognized closed condition was observed false. | Preserve the result; do not run or inherit evidence for that control. |
| `unknown` | Evidence for the condition is absent, malformed, or unrecognized. | Fail closed: retain requiredness and do not convert it to an exemption. |

The only currently recognized false condition is
`when-true:repo.hasPackageSources` with an explicitly supplied literal
`false`. `security-scan.mjs` supplies that value only after the OSV adapter
returns its exact successful no-package-sources result. The resolver treats a
missing input and any unsupported expression as `unknown`.

The result must not be emulated by a waiver, a disabled scanner, an empty
findings array, or a missing OSV executable. It is a result of applicability,
not an assertion that OSV itself passed.

## Consumer rollout plan

The rollout is source-first in the codebase but release-gated as one
compatibility package. A consumer must accept all three outcomes before it can
consume a catalog revision using `when-true:repo.hasPackageSources`.

| Consumer | Required behavior | Evidence |
| --- | --- | --- |
| `security-scan.mjs` | Derive `repo.hasPackageSources=false` only from the exact completed OSV no-source signal; otherwise leave it absent or set it true on an actual source result. | `security-scan-v2-integration.test.mjs` proves the no-source case and keeps missing-tool/error cases blocking. |
| `security-capability-plan-builder.mjs` | Omit only a `not-applicable` control from the capability plan; include `unknown` exactly as required. | Its unit suite exercises both branches. |
| `control-catalog-migration.mjs` | Accept `not-applicable`, emit the same explicit control-result status, and never consult prior evaluations for it. | `control-catalog-migration.test.mjs` supplies qualifying prior `met` data and still requires `not-applicable`. |
| `reference-catalog-views.mjs` | Preserve and display the resolver result without coercion. | `reference-catalog.test.mjs` checks the docs-only no-package-source fixture. |
| External/older consumers | Upgrade to the three-value contract before consuming catalog revision 2. If not upgraded, reject the unfamiliar value or fail closed; never coerce it to `applicable` or `met`. | Release notes must name this as a compatibility prerequisite; no consumer may claim a clean result until its three-value test exists. |

Promotion order:

1. land the consumer-compatible code and its tests;
2. run the focused suites listed below and the configured Verify command;
3. publish/consume catalog revision 2 only with those compatible consumers;
4. retain the prior catalog revision for one release window, and monitor for
   rejected `not-applicable` values rather than silently normalizing them.

## Explicit global rollback

Rollback is global because catalog applicability is shared policy, not a
repository-local waiver. If a false exemption, consumer incompatibility, or
unexpected policy result is observed:

1. stop promotion of catalog revision 2 and prevent new consumers from taking
   it;
2. revert this compatibility commit first, then revert `2ac4b5a` (the
   catalog/resolver/source change) as two ordinary, reviewable Git reverts;
3. verify that the restored catalog sets
   `ctl.base.sca.dependency-lockfile` back to revision 1 / `always`, and that
   no runtime source emits a policy-effective `not-applicable` for `cap.sca`;
4. run the focused consumer suites and the configured Verify command against
   the reverted candidate; and
5. record the reverted commit IDs and the new Verify evidence in
   `docs/state.md` before resuming a new, separately approved policy package.

Do not respond by disabling OSV, adding an unbounded waiver, editing a
consumer-local catalog copy, or mapping `unknown` to `not-applicable`.

## Test plan

Run at minimum:

```text
node --test plugins/pipeline-core/lib/security-policy-resolver.test.mjs
node --test plugins/pipeline-core/lib/security-capability-plan-builder.test.mjs
node --test plugins/pipeline-core/lib/control-catalog-migration.test.mjs
node --test plugins/pipeline-core/lib/reference-catalog.test.mjs
node --test harness/scripts/security-scan-v2-integration.test.mjs
```

The focused tests must demonstrate all three compatibility outcomes, the
real OSV no-source signal, missing/error fail-closed behavior, and the
no-prior-data-bypass property. The normal configured Verify command remains
required before claiming F1 remediated.

## Authority and review scope

`project/guard-config.json`, `project/pipeline-state.json`,
`project/pipeline.json`, and `project/pipeline.yaml` were introduced by the
separate bootstrap-authority commit `42fe35c`, not by F1. They are excluded
from this F1 remediation package and from its Critic candidate paths.

F1 review includes only the catalog, resolver, capability-plan, scan source,
their focused tests, `control-catalog-migration` and its focused test, plus
this briefing and its `docs/state.md` decision record. The four `project/`
files require their own authority review against `42fe35c^..42fe35c`; no F1
PASS claim may use them as unreviewed supporting evidence.

## Non-goals

- No new applicability expression language.
- No consumer-local policy waiver or scanner disablement.
- No change to the `project/` authority bootstrap.
- No claim that an external consumer has upgraded without its own evidence.
