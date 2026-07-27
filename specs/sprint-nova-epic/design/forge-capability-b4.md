# B4 forge capability design

## Purpose and boundary

`pipeline.forge-capability.v1` is a provider-neutral observation contract.
Git remains the version-control system, but transport and hosting together form
one dual-provider target surface for GitHub and GitLab.
The core report identifies the provider, base-URL class, a digest of project
coordinates, authentication mode, capability cells, governance/tier
observations, and sanitized evidence. It must not contain credentials,
provider-private payloads, or assumptions about unobserved behavior.

Each neutral capability cell is exactly one of `native`, `emulated`, `manual`,
`unsupported`, or `unavailable`. The vocabulary covers exact remote
resolution, fetch/ref readback and bounded branch publication, plus projects,
issues, change requests/merges, CI pipelines/jobs, releases, branch-protection
and governance observations. Provider-specific names, IDs, statuses, and
fields stay inside the adapter extension; they never leak into the neutral
report.

## Nova public brand handover

For new public-facing B4 prose, use the display brand **Arbitheon** with the
claim: “Arbitheon — The constitutional harness for deterministic agentic
delivery. Human intent becomes enforceable boundaries, restart-safe execution,
and verifiable evidence.” This is a presentation-layer handover only. The
technical repository, marketplace, and schema coordinates remain unchanged as
`agent-pipeline`, `pipeline-core`, `pipeline-core@agent-pipeline`, and
`pipeline.*`; keep those identifiers exact wherever implementation, discovery,
or machine-readable references require them. GitHub issue #50 is the
authoritative decision for this brand wording.

## Provider mappings

The GitHub adapter maps its issue, pull-request, Actions, branch-protection,
and governance observations into the neutral vocabulary while retaining any
raw provider details only in its isolated extension. The GitLab adapter uses
the same mapping for issues, merge requests, pipelines/jobs, protected
branches, and governance/tier observations.

GitLab.com and an explicitly selected Self-Managed GitLab host are different
targets, not aliases. The adapter binds the base-URL class and project
coordinates digest, and reports capability differences independently. An
ambiguous host or project is not inferred or normalised; it stops the
operation.

Live read-only capability discovery is opt-in and is required for B4 closure.
Live access or mutation additionally requires a B2 credential lease or a
separately approved operator-local authentication boundary. A provider's
acknowledgement is never accepted as Pipeline success without exact readback.

## Transport and provider-target boundary

Git transport is common to GitHub and GitLab: the adapter resolves one HTTPS
remote, observes exact refs, fetches without mutating the remote and may
publish only one explicitly named new branch after preview confirmation. The
preview binds source commit, remote URL class, full destination ref and remote
preimage; force, delete, wildcard and broad refspecs are denied. A Git push
proves only ref publication. Merge, release, project and governance outcomes
remain provider forge operations with their own preview and readback.

The private `swos1/aps-test` GitLab target is an operator-local pilot only.
Its 2026-07-27 transport probe published the disposable commit
`5f8eea638f8a24c8d10b6f840fa61460f1e51f09` solely to
`nova-transport-probe/20260727-01` and read the same ref back. This is
transport evidence only. It is not a migration of Agent-Pipeline, a release, a
merge or an Issue `#51` closure claim.

## External-mutation lifecycle

All writes implement `pipeline.external-mutation.v1`:

```text
requested -> previewed -> confirmed -> applied-unverified -> readback-verified
requested | previewed -> rejected | expired
confirmed -> failed | partial | unknown
applied-unverified -> readback-verified | mismatch | unknown
```

A preview is immutable and binds provider and base-URL class, project
coordinates, exact target, before-state digest, proposed patch, operation,
idempotency key, capability observation, and expiry. Confirmation names the
exact preview digest and does not permit target or patch substitution. The
applied result remains `applied-unverified` until readback matches the
expected post-state; a mismatch or inability to observe is explicit, never a
false success. On retry, reuse the idempotency key and reconcile remote state
first (including an already-applied or partially-applied result) before
issuing another request.

By default, delete, transfer, settings, permissions, silent close/relabel,
and broad batch operations are `unsupported`. They require a separate,
explicitly PO-approved operation contract with its own preview, confirmation,
lease, and readback rules.

## Stop and privacy rules

Stop and leave the operation non-success when the target is ambiguous, a
token or credential could be exposed, execution would use weaker controls,
or provider-specific fields would cross into the neutral contract. Stop also
on missing/expired lease, absent capability evidence, failed or partial
readback, provider/host drift, or any unknown state. No access, mutation,
credential acquisition, network use, push, or release is implied by this
design.

**Live-pilot boundary:** The PO admitted only operator-local read discovery and
the one exact new-branch transport probe on the private test target. Every
forge mutation, existing-branch transport write, merge, release, project
creation, deletion, settings and permission route remains blocked pending its
own exact preview and confirmation. This pilot expires on **2026-08-09**;
expiry does not activate any broader capability or Issue `#51` closure.

## Proposed implementation path manifest

The existing closed forge report and GitLab mapping are necessary but not yet
sufficient for the product promise: there is no common Git-transport contract
or GitHub provider adapter in the current candidate. After an explicit B4
Design approval, implementation is limited to these paths:

- `plugins/pipeline-core/lib/forge-capability.mjs` and its matching test;
- `plugins/pipeline-core/lib/git-transport-contract.mjs` and its matching
  test, for provider-independent exact remote/ref/fetch/new-branch records;
- `plugins/pipeline-core/scripts/git-transport-contract.schema.json`;
- `plugins/pipeline-core/scripts/github-forge-adapter.mjs` and its matching
  test;
- `plugins/pipeline-core/scripts/gitlab-forge-adapter.mjs` and its matching
  test;
- `plugins/pipeline-core/scripts/forge-capability.schema.json`; and
- `plugins/pipeline-core/scripts/external-mutation.schema.json`.

GitHub and GitLab adapters may use the common transport record but cannot
interpret a successful push as a merge, release, issue or CI result. No other
path changes, live-operation integration, credentials, network activation or
consumer-repository migration are in scope before the separate approval gates.
