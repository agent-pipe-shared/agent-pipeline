# PRD — Nova human authorization and Cyborg handover extension

**Profile:** feature extension to `sprint-nova-epic`
**Source evidence:** [design input](design-input.md)

## Outcome

The Pipeline must accept a detached, externally verified human proof at each
critical remote-effect approval boundary, while ordinary planning and local
implementation continue to use the existing chat approval model. It must offer
a short-lived one-time remote acknowledgement only for non-final local
continuation, then require the trusted-terminal proof again for a final push,
deploy or publication. It must reconcile the Cyborg handover only through
candidate-bound evidence and Nova's canonical backlog writer.

## Requirements

| ID | Requirement |
| --- | --- |
| HAO-1 | A push, deploy or publication approval SHALL verify a clean-candidate-bound detached proof before durable authorization is written. |
| HAO-2 | A proof SHALL bind action kind, plan/Spec digests and the digest of the exact external action subject; stale, replayed, cross-kind or drifted proof SHALL fail closed. |
| HAO-3 | Plan/design/review and other non-final gates SHALL retain chat approval and SHALL NOT require an external signer. |
| HAO-4 | A remote provisional code SHALL be one-time, candidate-and-scope-bound, expire within 30 minutes, and authorize no action beyond the declared local continuation. |
| HAO-5 | A provisional code SHALL NOT be accepted by push, deploy, publication, override, merge, release or deletion paths. |
| HAO-6 | Nova SHALL rerun the six Cyborg handover validations on its selected candidate, retain the required tuple per item and use the sanctioned writer for a passing transition only. |

## Non-goals

No remote app/provider, IAM/passkey/hardware-key adapter, credential,
automatic release, push, tag, merge or remote backlog mutation is delivered by
this extension.

## Acceptance

Focused negative tests prove proof binding, expiry, replay and cross-kind
rejection; a valid external proof permits only its exact durable critical
authorization. Remote-code tests prove single use, expiry and final-gate
rejection. The six handover rows produce candidate-bound evidence tuples; any
stale or failing row remains open with a narrow follow-up. Full Verify,
Security and an independent Critic rerun on the final candidate precede a
separately authorized release.
