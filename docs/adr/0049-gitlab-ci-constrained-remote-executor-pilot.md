# ADR-0049 — GitLab CI constrained remote-executor pilot

**Status:** accepted by PO design approval · **Date:** 2026-07-27

## Context

Nova must support consumer-selected GitHub and GitLab targets without making a
forge a product control plane or treating a disposable GitLab test project as
a migration destination. B2-I needs a small remote-executor contract, while
the actual provider invocation, project selection, token use and cancellation
remain separately human-approved operations.

## Decision

GitLab CI is admitted only as a constrained executor pilot. Git remains the
transport engine; GitLab CI is not a credential store, permanent broker,
background worker, control plane or migration path. A local operator may hold
a short-lived project-scoped authority only outside the job. The job may use
only its GitLab-issued `CI_JOB_TOKEN`; no personal token, credential value,
raw coordinate, log, trace, artifact, cache or variable is accepted as durable
Pipeline evidence.

The deterministic broker record binds one candidate, target-coordinate digest,
job identity and allowed metadata observation. It may report provider
completion only as `succeeded-unverified` until exact readback reconciles it.
Cancellation binds the exact job and pre-state, then needs readback. Shared
runner isolation remains unobserved. The initial live pilot remains outside
this ADR and needs its own exact two-job YAML/target/credential preview and
post-action readback.

## Consequences

- The approved implementation set is the B2-I design artifact, this ADR, the
  pure execution-broker library/CLI/schema/fixtures/tests and necessary Nova
  acceptance, Spec, plan, lifecycle, Result and Verify registrations.
- No dependency, generic CI broker, callback service, token store, project
  creation, setting mutation, remote cleanup, credential fixture, network
  activation or consumer migration is allowed by this decision.
- `docs/gitlab-ci-pilot-threat-model.md` is the maintained trust-boundary
  companion. A material boundary change requires an ADR successor and a fresh
  Threat-Model/Verify/Security/Critic tail.

## Alternatives rejected

- Passing a personal token into CI, because it breaches credential containment.
- Treating GitLab CI as an always-on worker, because its lifecycle is
  unbounded.
- Treating a Git push as forge, CI or governance evidence, because each is a
  distinct operation contract.

## Resubmission

Review before any live pilot and no later than **2026-08-09**. Owner: Nova
Product Owner. Expiry leaves B2-I provider execution unavailable; it does not
activate a capability or permit a mutation.
