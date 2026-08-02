# Nova plan amendment — human authorization and Cyborg handover

**Status:** draft for the reopened Nova design gate  
**Staging PRD/Spec:** [`../../2026-08-02_nova-human-authorization/prd_nova-human-authorization.md`](../../2026-08-02_nova-human-authorization/prd_nova-human-authorization.md), [`../../2026-08-02_nova-human-authorization/spec.md`](../../2026-08-02_nova-human-authorization/spec.md)

## Scope

1. Generalise the public detached-proof request/verification path for the
   closed critical kinds `push`, `deploy` and `publication`, without changing
   the existing threat-model request compatibility.
2. Require that proof at the sanctioned durable writer actions
   `approve-push`, `approve-deploy` and `publication-approve`/authorization
   activation. The subsequent fixed executor remains the only external-effect
   path. Chat approval remains unchanged elsewhere.
3. Add a local-only remote-provisional receipt with a one-time, candidate/scope
   bound code and a maximum 30-minute lifetime. It permits only an explicitly
   declared continuation class and is structurally rejected by every final or
   irreversible action.
4. Add user-facing guidance for the critical-proof path and provisional-code
   boundary, plus inventory/governance registration if new documentation is
   added.
5. Validate each of the six Cyborg handover rows on the final Nova candidate;
   retain evidence tuples and apply only passing canonical transitions through
   the Nova writer.

## File ownership and tests

| Area | Primary files | Proof |
| --- | --- | --- |
| Shared critical-proof contract | `plugins/pipeline-core/lib/po-approval-proof.mjs`, new critical-action request module and tests | exact kind/subject/candidate/expiry/replay failures |
| External signer adapter | `plugins/pipeline-core/scripts/po-human-approval.mjs`, `po-approval-gate.mjs` and tests | public external files only; trusted terminal signs exact intent |
| Critical state transitions | `plugins/pipeline-core/scripts/pipeline-state.mjs`, `harness/scripts/pipeline-state.mjs`, state/publication tests | no attribution-only final authorization; one-use durable binding |
| Remote provisional | new bounded module/script/schema and tests | one-time + expiry + scope; hard reject at final gates |
| User documentation | `docs/po-human-approval.md`, `docs/po-approval-proof-contract.md` plus governed inventory | no claim that a remote code is a secret or final proof |
| Cyborg handover | `specs/sprint-nova-epic/evidence/` and reconciliation writer/tool tests | six exact tuples and post-apply readback |

## Safety boundary

No push, tag, release, deploy, merge, remote app call, remote credential,
hardware/passkey/IAM integration or canonical backlog transition occurs while
implementing this plan. The final release still needs a newly prepared proof
for the final clean candidate and separately authorized external execution.

## Candidate gate sequence

1. Focused unit and integration suites for the new surfaces.
2. Re-run Cyborg's named validation suites; generate handover evidence tuples.
3. Candidate freeze, Full Verify and Security on the resulting exact commit.
4. Independent diff-scoped Critic, remediate any findings and rerun invalidated
   evidence.
5. Only then prepare the final external proof and seek the distinct release
   authorization for the fixed publication path.

