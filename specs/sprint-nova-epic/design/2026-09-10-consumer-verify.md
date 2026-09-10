# Consumer Verify parity

The PO requests the optimized Verify behavior in consumer repositories and
meaningful general checks in a greenfield project. This implementation slice
belongs to the local candidate work. Existing green deterministic gates on
older candidates do not prove this new behavior.

## Observable contract

The installed `scripts/verify-evidence-producer.mjs` remains the public entry.
The resolved calibration's `verify` remains the actual project command and is
never rewritten to the producer itself. A consumer run uses the shipped
Verify journal for bounded execution, progress, private diagnostics, durable
suite receipts and exact candidate evidence. It must work when the installed
plugin lies outside the consumer Git repository.

Baseline checks and product verification are separate named outcomes. Required
baseline checks validate the resolved project calibration/authority and the
Verify command contract. A present runtime manifest must validate; an absent
optional manifest is explicitly not applicable. Product verification runs the
configured command verbatim, freshly by default, and preserves its failure.
No automatic npm/lint/build invocation is invented. Missing or placeholder
product verification remains unconfigured and cannot yield overall success.
A successful command does not prove acceptance-criterion coverage.

Keep candidate clean-start and unchanged clean-finish binding. An unborn
repository is unavailable, not a synthetic commit. An interrupted or failed
new attempt must not leave consumable stale success at the canonical output.
Use the existing consumer evidence schema and real publication reader to
verify successful output compatibility. Baseline resume must remain bound to
candidate, actual installed implementation bytes, policy and declared inputs;
opaque project commands cannot reuse past success without a proven contract.
Cross-candidate reuse stays disabled by default.

## Integration boundary

Use a deterministic project-local Node adapter, registered with separate
check arguments, so the existing journal's repository-file containment rule
does not need broadening. Bind the actual installed dispatcher and its
dependencies as policy inputs. Seed the adapter in the existing onboarding
transaction before the clean candidate exists. For existing projects provide
an idempotent explicit preparation action; preserve user-owned conflicting
files and report a concrete conflict. Do not create deliverable source files
as a side effect of a clean evidence run. No runtime-specific shell syntax,
source-checkout harness paths or Nova-only suite lists in consumer defaults.

## Verification

Extend existing producer and onboarding suites, using real consumer Git
fixtures separate from the plugin root. Cover idempotent preparation and
conflicts; preserved project command; an actually passing and failing product
assertion; missing product verification; invalid present manifest; candidate
drift; installed implementation changes; interrupted/failing attempts and
stale canonical evidence; journal receipts/progress and eligible resume;
acceptance by the existing publication-evidence consumer. Do not weaken old
checks merely to obtain green. A necessary change from no failure artifact to
explicit non-success evidence must preserve the essential no-stale-green
contract and be documented in the tests.

This slice creates no release, installation, network access, Critic PASS or
PO signature. Independent review and final candidate gates remain required.
