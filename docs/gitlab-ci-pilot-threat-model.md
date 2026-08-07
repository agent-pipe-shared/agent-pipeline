# GitLab CI constrained-pilot threat model

**Status:** Nova B2-I design baseline. This document covers the approved
deterministic broker contract only. It authorizes neither a provider request
nor a GitLab CI job, credential, token, project setting, branch, release or
migration.

| Threat | Control | Verification | Residual boundary |
| --- | --- | --- | --- |
| An operator token is passed into a remote job, artifact, cache, variable, log or evidence record. | The broker contract accepts only a local authority digest. A job receives only its provider-issued `CI_JOB_TOKEN`; neither secret value nor raw project coordinate is representable in a request, observation or fixture. | Closed-shape, credential-field, privacy and hostile log/artifact/cache denial fixtures. | The local operator credential store and GitLab token issuance remain provider/operator controlled; no remote call occurs in this slice. |
| A job reads or writes another project, branch, tag, release, issue, merge request or setting. | Each request binds one project-coordinate digest, candidate digest and read-only job class. The B2-I job contract has no Git write, API mutation, dynamic ref, shell input, callback or host-mount field. | Cross-project, write-operation, dynamic-command, arbitrary-ref and confused-deputy fixtures. | GitLab's own enforcement must be read back in a separately approved live pilot; synthetic evidence cannot certify provider isolation. |
| A successful provider acknowledgement is reported as pipeline success. | The state machine keeps completion at `succeeded-unverified` until exact candidate, job identity, target digest and metadata-only readback reconcile. Unknown, cancelled, failed and unavailable remain non-success. | Out-of-order, duplicate, cancellation-race, unavailable and mismatching-readback fixtures. | A real remote job remains an opt-in B2 gate and still needs candidate-bound Verify, Security, Critic and PO close evidence. |
| A cancellation request affects the wrong or a reused provider job. | Cancellation binds exact job identity and pre-state, then requires metadata readback before it may report `cancelled`. No background retry, renewal, cleanup or process can outlive the request. | Wrong-job, stale-prestate, repeated-cancel and no-readback fixtures. | Provider outages can leave `unknown`; the contract does not infer terminal state. |
| Shared-runner execution is mistaken for an isolation guarantee. | The contract records shared-runner isolation as `unobserved` and never advertises OS, host, network or workload isolation. | Capability/report fixtures reject certification without eligible evidence. | A provider-specific isolation claim needs a separate accepted contract and native evidence. |

Rollback is one ordinary forward revert of the ADR-0049/B2-I contract and its
tests, followed by fresh Verify, Security and Critic evidence. It does not
revoke, delete or mutate an external GitLab resource.
