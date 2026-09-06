# A1 implementation plan — enforcement conformance

## Purpose and boundary

Implement the frozen `pipeline.enforcement-conformance.v1` probe and its
fixtures as the first Alfred implementation increment. The probe measures
where controls execute for a named runner; it does not add authority, change
guard policy, install hooks, or infer another runner's behavior.

In scope:

- `plugins/pipeline-core/scripts/enforcement-conformance.mjs`;
- its injectable fixture/test module(s), a schema/record validator if needed,
  and the A1 evidence record produced by the command;
- standalone registration/readiness checks and the exact PO follow-up text
  for the stale `hooks.json` comment.

Non-goals are production guard changes, runner-specific forks, payload
sandboxing, `hooks.json` mutation, `harness/scripts/verify.mjs` mutation,
product-inventory mutation, and any TP-3/TP-4 ceremony. A model or
self-attestation is evidence about an observation only and can never emit
`pass`.

## Closed record contract

Emit exactly one closed record per `{runner, layer}`. Unknown keys are
refused. Required keys are:

`schema`, `recordId`, `candidate`, `runner`, `layer`, `probeSurfaces`,
`measurement`, `observations`, `evaluator`, `staleness`, `sanitization`,
`provenance`, `measuredAt`.

`schema` is `pipeline.enforcement-conformance.v1`; `recordId` is a stable
canonical `{runner,layer}` identity; `candidate` binds the exact HEAD commit,
tree, and artifact SHA-256; `runner` carries runner name/version; `layer` is
one of `git-hook | tool-scope | runner-hook | posthoc-verify | prose`.
`probeSurfaces` is a non-empty, unique subsequence in the approved global
order of `runner-hook/orchestrator`, `runner-hook/subagent`,
`payload-indirection`, and `git-hook`. `observations` has exactly one closed
`{probeSurface, hookObservation, evidenceKind, exitCode, markerSha256}` item
for each surface, in the identical correlated order. Singular `probeSurface`
and `observation` shapes are refused.

`measurement` keeps quantitative values beside `status`, whose only values
are `measured | estimated | unavailable | unknown`. Each observation is raw
probe data with `hookObservation` one of `fires | fires-not | unknown`; it is
never the evaluator verdict. `evaluator.outcome` is one of `pass | finding |
unavailable | unsupported | unknown | excepted`. A `pass` requires every
observation to be deterministic execution or human acceptance; a human
acceptance requires the record-level acceptance hash. `excepted` requires at
least one human acceptance, that hash, and no model, self, or unavailable
observation. Model/self-attestation forbids `pass` and `excepted`, and an
acceptance hash is forbidden without human acceptance. `staleness` records the
runner/plugin versions and invalidation reason; `sanitization` records the
applied redaction policy and must contain no secrets, credentials, transcripts,
private paths, or organization coordinates. `provenance` identifies command,
fixture, and source inputs without private data. All records are candidate
bound before qualification.

## Probe behavior and increments

1. Build pure adapters for command execution, runner metadata, clock, Git
   binding, scratch allocation, and observation-marker reads. Refused probes
   run only in disposable fixture repositories; payload indirection writes
   only below `scratch/`.
2. Implement `runner-hook/orchestrator`: submit canonical compound-shell
   refused shapes and capture raw refusal/allow outcome.
3. Implement `runner-hook/subagent`: dispatch a minimal probe that attempts
   the same shapes, capture raw report and guard markers, and classify each
   hook family as `fires`, `fires-not`, or `unknown`; do not treat prose or a
   self-report as proof of firing.
4. Implement `payload-indirection`: stage a refused command in a scratch
   script and execute it, recording which layer catches it and the accepted
   residual gap when it does not.
5. Implement `git-hook`: with pre-push installed, exercise the refused push
   shape from each invoking context; record `--no-verify` as the PO-accepted
   residual gap, never as a pass for the hook.
6. Validate exact keys/enums, candidate binding, sanitization, and version
   staleness. Re-run on runner/plugin version change; never reuse a stale
   record as current evidence.

## Phased commit boundaries

- **A1-1 (probe core):** adapters, closed-record validator, candidate and
  sanitization helpers, and pure fixtures. Commit only the implementation
  and its direct tests after standalone checks are green.
- **A1-2 (probe matrix):** four surfaces, raw-vs-outcome separation,
  staleness, and fixture transcripts. Commit only after the full A1 test
  matrix and doc-contract checks pass.
- **A1-3 (evidence package):** command output/evidence wiring, registration
  debt note, PO replacement text, and this plan's evidence handoff. Commit
  only after candidate-bound readback and `git diff --check`.

Every commit uses exact paths. No commit is made while Verify is running
(QG-08), and a new Verify registration is incomplete until its capability
inventory `surfaceIds` covers the derived `verify-phase:` surface in the same
PO-authorized change.

## Verification matrix

| Area | Required check |
|---|---|
| closed shape | exact-key acceptance; unknown-key, missing-key, enum, and non-canonical record rejection |
| measurement | each quantitative value has a status; absent telemetry is never zero |
| observations | simulated hooks-fire and hooks-do-not-fire transcripts classify correctly; plural surfaces are uniquely ordered and exactly correlated with separate raw observations |
| evaluator | deterministic or human-accepted pass only; model/self-attestation cannot pass or except; unavailable/unsupported/unknown remain visible |
| surfaces | orchestrator, subagent, payload-indirection, and git-hook adapters each exercise positive, refusal, and residual-gap cases |
| binding | commit/tree/artifact digest mismatch and changed runner/plugin version mark stale and prevent qualification |
| privacy | secret, credential, transcript, private-path, and organization-coordinate sanitization fixtures |
| integration | `node plugins/pipeline-core/scripts/check-suite-registration.mjs`; capability-inventory coupling check; full `node harness/scripts/verify.mjs` at the candidate when registration is available |
| required docs | `node harness/scripts/check-doc-contracts.mjs --root /home/skar667/src/agent-pipeline-shared_alfred`; `git diff --check` |

## Registration debt and PO follow-up

The A1 suite may be run standalone and reported as explicit debt while
`harness/scripts/verify.mjs` remains TP-3 protected. A later PO-executed
maintenance act must add the exact suite entry to the appropriate
`TEST_SUITES`/registration array and the matching derived capability
`surfaceIds`; it must preview and run the suite, read back the registration,
and verify the exact candidate. Do not seek an agent override.

QG-08 coupling is therefore tracked as a typed `registration-debt` row until
both surfaces are present. `docs/product-capability-inventory.json` and
`plugins/pipeline-core/hooks/hooks.json` are not changed by A1.

The PO-produced contiguous replacement for the stale `hooks.json` `$comment`
is:

> `pipeline-core hook wiring is measured by pipeline.enforcement-conformance.v1 records, one per runner and enforcement layer. The record is authoritative for observed execution; this comment is descriptive only. Re-run A1 after runner or plugin version changes. This TP-4 file requires a PO maintenance act to replace this text.`

This text is non-load-bearing follow-up, prepared for the PO to apply in
their own shell; it is not an agent edit or a claim that the replacement has
landed.

## Rollback, authority, and revalidation

Rollback triggers are a failed closed-record test, an unbound/stale evidence
record, a privacy fixture failure, a registration/inventory mismatch, or a
Critic finding that the probe inferred enforcement. The implementor reverts
the A1 commit(s) by exact commit ID (or restores the pre-A1 bytes through the
normal Git revert path); no generated evidence is silently edited. The PO
alone decides whether to accept an exception, apply TP-3/TP-4 maintenance,
or rerun after a runner/plugin change. After rollback or repair, re-run the
entire matrix, candidate/tree/artifact binding, doc-contract check, and
registration check before a new evidence record can qualify. A changed
runner/plugin version invalidates prior records and requires fresh probes.

## Evidence and Critic handoff

Hand off the exact candidate SHA/tree, record files and digests, command
outputs, fixture results, staleness decisions, residual gaps, and the
standalone-versus-Verify registration status. Critic receives paths and
constructs its own diff/evidence input; review lenses include AC-1, AC-16
when onboarding tests are touched, deterministic-pass, privacy, candidate
binding, and QG-08. A1 currently plans no onboarding-test edit.
