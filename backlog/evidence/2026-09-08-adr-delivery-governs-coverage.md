# Delivery-9 responsibility rationale

The four accepted ADRs retain their historical normative text. Their new
`Governs:` declarations map each decision to its current canonical source,
direct producer and direct test or CI registration; they do not turn a named
path into a claim that a release or platform proof has run. The raw wrapped
check capture is preserved at
`scratch/NVA-B-ADR-GOVERNS-DELIVERY-9/raw-check-capture.md`. Its machine report
is `scratch/NVA-B-ADR-GOVERNS-DELIVERY-9/parser-report.json`.

The check imports the real reconciliation parser (`parseGovernsGlobs` and
`globMatches`), rejects a missing or duplicate declaration, proves every target
matches a tracked path, compares every non-header byte to baseline
`2deb86e52786004737c4f87f7c74e54a1b744fbb`, and records current source hashes.
It also applies the existing normative pre-`DE-REFERENCE-BELOW` status parser
to the whole ADR corpus. Its local result is 4/4 declarations and 75 accepted,
3 historical, 1 provisional and 1 proposed statuses. That is local coverage
only; concurrent global count and reconciliation remain outside this package.

## ADR-0033 — release and promotion

`docs/operating-model.md`, `guardrails/deploy.md`, and
`docs/push-release-flow.md` are the root-canonical explanation of the optional
release tail, deploy gate and human approval. `validate-manifest.mjs` and its
test own manifest admission; `deploy-policy.schema.json` supplies the policy
shape. The release-preflight, release-version-plan and release-state-consistency
scripts with their direct tests own candidate transition and verification.
`pipeline-state.mjs` and its test own the recorded deploy approval state;
publication executor and gate-evidence scripts with their direct tests own the
publication-side producer and evidence path. `harness/scripts/verify.mjs` and
`.github/workflows/verify.yml` register the source verification and CI route.

The source `guardrails/deploy.md` and ADR-0033 are shipped through the
allowlisted vendored-canon generator. The expected generated destinations are
`plugins/pipeline-core/guardrails/deploy.md` and
`plugins/pipeline-core/docs/adr/0033-release-promotion-phase.md`; this package
does not generate or edit either. Parent owns serial generation and the
byte-identity check. This mapping does not assert that an adapter has been run,
that the specified-but-untested local executor is covered, or that a release
has been approved or published.

## ADR-0043 — sprint planning and independent closure

`docs/operating-model.md` remains the lifecycle context. The scheduling
lifecycle library, schema and direct test own machine-readable scheduling
semantics. The sprint-assignment and done-predicate scripts with direct tests
own backlog classification and completion predicates. The parallel-sprint
integration library and test own common-base, write-set and sibling-consumption
assessment; the close coordinator and pipeline-state scripts with their tests
own close-state transitions rather than a sprint name itself.

`verify.mjs`, its suite-registration checker/test and the GitHub Verify
workflow name the current source and CI registrations. They are registration
owners, not proof that a particular Sprint branch, Issue, label, merge or
release action occurred. The ADR therefore continues to grant none of those
external actions.

## ADR-0051 — original dual-runner contract and successor

The historical ADR governs the original Claude Code/Codex contract. The
onboarding V3 library, CLI and direct tests, plus the lifecycle guard and its
satisfiability test, own explicit runner identity through the active flow.
`hooks.json`, the Codex pretool guard and Antigravity pretool guard with their
tests name current native adapter owners. The V3 runner-profile library,
registry and user schema name routing authority. Windows-private-state and its
test name a platform-specific filesystem/permission owner, while Verify and
the GitHub workflow register the source checks.

ADR-0067 is deliberately named as the later tri-runner Antigravity successor:
it changes the current supported-runner surface but does not rewrite ADR-0051's
historical body. The optional `live-runner-certification` script and test are
named as the current typed live lane. No live certification was run here, and
no Windows, macOS or Unix/WSL matrix result is inferred from the declarations.

## ADR-0057 — implementation obligation, not an evidence matrix

ADR-0057 shares the onboarding and lifecycle identity owners with ADR-0051,
then names `copy-safe-command.mjs` and its test for the paired human-copyable
command contract, and the Windows private-state owner for path/permission
neutrality. The same optional typed live-certification lane, Verify registry
and CI workflow are named so that its status is inspectable rather than
assumed.

The missing general mechanical checks remain missing: there is no declared
general check for every literal runner default or every shell rendering. The
known native-Windows red-suite class remains a defect class. Manual runner and
platform verification is optional and was not run by this package; it is not
represented as a PASS.

## Review and validation boundary

This is semantic governance mapping, not a T0 formatting-only change. Under
`harness/review-protocol.md` §2.1, it needs a Critic decision before integration;
no `criticSkip` is claimed. The local parser/body/status check passed, but it
is deterministic evidence only and is not independent review. No full Verify,
vendor generation, release operation, CI execution, or live runner/platform
proof was run by this package.
