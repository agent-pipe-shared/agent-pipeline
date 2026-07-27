# B2-I D1 — GitLab CI constrained remote-executor pilot

**Status:** Decision accepted as ADR-0049. It authorizes the exact local
contract implementation manifest below, but no provider mutation, credential
use, CI job, project setting, branch or live-pilot invocation.

## Decision proposed

Use GitLab CI only as a constrained remote-executor pilot for an
operator-selected Consumer project. It is not a product control plane, a
permanent broker, a credential store, or a migration target for
Agent-Pipeline. Git remains the transport engine; GitLab CI is one B2-I
executor target and GitLab Forge is one B4 provider target.

The local operator boundary may use a short-lived, project-scoped GitLab
fine-grained token to request the pilot. A remote job must receive only its
GitLab-issued `CI_JOB_TOKEN`, and only for the lifetime of that exact job.
The operator token must never be passed to a job, committed, written to an
artifact/cache, printed, or represented in machine evidence.

## Bounded pilot

| Dimension | Contract |
| --- | --- |
| Target | One PO-designated private test project, represented in durable evidence only by provider/base-url class and a project-coordinate digest. |
| Jobs | At most two: one deterministic no-op success and one PO-cancelled or unavailable observation. |
| Job code | Repository-contained, deterministic, no network install, no secret/environment dump, no arbitrary shell input and no branch, tag, release, issue, MR or settings write. |
| Credential | The job's `CI_JOB_TOKEN` only; its GitLab lifecycle/revocation remains provider-owned. No user personal token reaches the job. |
| Git transport | Read-only fetch/ref observation only in B2-I. A B4 preview-bound branch publication is a separate operation contract. |
| Observation | API metadata and bounded state transition readback only; logs, trace output, artifacts, caches and raw provider credentials are out of scope. |
| Result | Provider completion is `succeeded-unverified` until the exact candidate, job identity, target digest and allowed observation chain reconcile. The candidate must descend from the fixed Nova base commit and matching base tree; it cannot self-declare a different base. |

## Required denials

The broker and observer reject or leave unobserved:

- a missing, foreign, expired or unbound job token;
- cross-project access, an allowlist broader than the exact project, or a job
  that can push with its job token;
- project/member/visibility/settings/protection mutations;
- provider logs, artifacts, caches, variables, trace downloads or environment
  enumeration as evidence;
- dynamic commands, arbitrary ref names, arbitrary URLs, callback endpoints,
  host mounts, credential forwarding or a successful result without exact
  job/target/candidate binding;
- a shared-runner isolation claim. The pilot records shared-runner isolation as
  unobserved rather than assuming it.

## State and cancellation model

The planned broker record is closed and digest-bound. Its states are
`requested`, `submitted`, `provider-running`, `succeeded-unverified`,
`reconciled`, `cancel-requested`, `cancelled`, `failed`, `unavailable` and
`expired`. Genesis is only `requested`; every successor embeds and verifies
its sealed predecessor as well as its predecessor digest, so a standalone
terminal record cannot invent a history. `expired` is an explicit sealed
terminal transition from an admitted pending record. A cancellation action binds the exact provider job identity and
pre-state before either `cancel-requested` or `cancelled` provider metadata is
accepted; persisted validation proves that pre-state is the exact predecessor
digest, and a provider cancellation claim without that sealed local intent is
rejected. A cancel request is never reported as cancellation success. A retry is a separate, attempt-numbered genesis only
when it embeds the exact reconciled preceding attempt with the same immutable
idempotency subject; there is no implicit retry.

Fixed-base admission is internal to the public reducer contract. No caller may
replace, relax or inject an alternative candidate-admission predicate.

`submittedAt`, `requestedAt` and `observedAt` are local broker monotonic
milliseconds (`local-monotonic-ms`), never provider wall-clock values. Provider
ordering remains the separate `providerSequence` / `not-provided` contract;
each later local observation and cancellation intent is non-decreasing against
the preceding local observation. Every successor of a retry preserves that
attempt number and exact retry genesis.

No background retry, credential renewal, remote cleanup or host process may
outlive the bound request. A new request needs a new PO-authorized preview.

## Exact implementation manifest proposed for approval

The PO accepted this manifest as one set through ADR-0049:

- `docs/adr/0049-gitlab-ci-constrained-remote-executor-pilot.md`
- `docs/adr/README.md`
- `docs/gitlab-ci-pilot-threat-model.md`
- `governance/observation-doc-governance.json` for that document's
  maintainer/maintained classification
- `specs/sprint-nova-epic/design/b2-i-gitlab-ci-pilot.md`
- `plugins/pipeline-core/lib/gitlab-ci-execution-broker.mjs` and its test
- `plugins/pipeline-core/scripts/gitlab-ci-execution-broker.mjs` and its test
- `plugins/pipeline-core/scripts/gitlab-ci-execution-broker.schema.json`
- `plugins/pipeline-core/scripts/gitlab-ci-execution-broker-observation.schema.json`
- `plugins/pipeline-core/scripts/fixtures/nova-b2-gitlab/` exact
  request/observation/cancellation fixtures
- only the necessary B2 acceptance, Spec, Nova B plan, lifecycle, Result and
  Verify/inventory registrations.

No new dependency, generic CI adapter, provider-wide token store, external
callback service, GitLab project creation, project setting change, or secret
fixture is in this manifest.

## PO gates before execution

1. Approve the exact target digest, the two-job YAML preview, the requested
   operator capability and the job-token push prohibition readback.
2. Approve each provider mutation separately. The first pilot invocation and
   cancellation each require their own exact preview and post-action readback.
3. Before any B2-I completion claim, bind focused tests, Full Verify, Security
   and independent Critic evidence to the exact candidate; a provider success
   alone is insufficient.

## Alternatives rejected for this pilot

- Passing a personal/fine-grained token into CI: violates credential
  containment and makes revocation/trace exposure harder to prove.
- Treating GitLab CI as a general always-on worker: creates an unbounded
  executor and lifecycle that B2-I has not specified.
- Reusing the GitLab test project as product-repository hosting: it confuses
  B4 evidence with a migration and is explicitly outside Nova.
- Using a successful Git push as proof of forge merge, release, issue or CI
  governance behavior: those are distinct B4 operation contracts.
