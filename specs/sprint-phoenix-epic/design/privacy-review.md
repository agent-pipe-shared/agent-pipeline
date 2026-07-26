# Sprint Phoenix data-privacy review

Status: two privacy review rounds failed; second corrections prepared for fresh re-review

Date: 2026-07-26

This document is the blocking data-privacy review contract for the Phoenix
design. It is not legal advice, a compliance declaration, or a self-issued
review pass. The first fresh read-only review returned FAIL because ordinary
Git reads bypassed the claimed per-stream access boundary and immutable
portable records could retain personal attribution/free-form rationale without
an erasable operation. Those findings are accepted. The corrected contract
then received a correction re-review. It also returned FAIL because the bound
Spec wording remained open to a false per-stream confidentiality
interpretation, H-AC-06 did not scope append-only preservation away from
restricted erasure, and the architecture introduced restricted-store files
outside the bound Spec inventory. All three findings are accepted. The
normative Acceptance interpretation, scoped lifecycle rule, and
Spec-inventory-only ownership below must receive a fresh bounded re-review
before the design can reach the Product Owner gate.

## 1. Processing boundary

Phoenix processes governance facts only when they are necessary to reconstruct
an authority decision, material declared assumption, deterministic lifecycle
event, policy result, or bounded external delivery. The portable Git profile
is one repository-wide access and retention trust zone. It admits only complete
records proven `repository-public-safe`; it cannot claim per-stream ACLs,
selective erasure, or shorter retention. A record containing or contextually
revealing natural-person data, a joinable pseudonym, free-form rationale, or
any stricter access/erasure/retention duty is rejected from portable
persistence and may exist only as a complete event in the separately protected
machine-local profile.

Phoenix does not collect hidden reasoning, full prompts, transcripts, terminal
history, unrestricted tool output, credentials, endpoints, tenant
coordinates, private paths, or machine-local actor mappings in portable
artifacts.

| Data class | Purpose | Portable representation | Retention/access boundary |
| --- | --- | --- | --- |
| Portable human decision | Reconstruct a scoped non-personal authority decision | non-identifying actor/authority class, assurance, outcome, scope, stable reason code; no person reference, pseudonym, free text, or local join handle | repository-wide access/retention; append is denied when stream policy is stricter |
| Restricted human decision | Reconstruct a decision that contains personal attribution, joinable pseudonym, free-form rationale, or other restricted content | complete encrypted event outside Git; no portable counterpart, digest, mapping, or join handle | owner-only per-stream local root; explicit expiry/erase/key destruction; authorized local query only |
| Agent declaration | Preserve a material declared assumption/selection without hidden reasoning | role/route reference, selected option, evidence class/gaps, status and revalidation trigger | repository-wide retention when portable; independently filtered downstream; never authority |
| Lifecycle correlation | Reconstruct execution, verification, review, recovery, and delivery states | feature/package/request/dispatch/candidate/evidence identifiers and typed outcomes | repository-wide retention when portable; no raw model/tool content |
| External reference or ITSM observation | Reconcile a governed external object without importing its content as authority | canonical target class, allowlisted public-safe reference, capability/revision/content digests | destination-specific policy; inbound content stays untrusted |
| Export delivery state | Retry and reconcile one-way sanitized projections | machine-local destination binding, cursor, idempotency key, payload digest, typed acknowledgement | machine-local queue; destination-specific expiry; never portable authority |
| Recovery evidence | Prove a bounded workaround or repair without exposing the host | stable reason/status codes, public-safe operation class, pre/post digests, candidate binding, typed omissions | lifecycle/recovery retention; raw command, path and private configuration excluded |

Direct or pseudonymous personal identifiers and free-form rationale are
prohibited in the portable v1 schema. An adopting organization that needs
them stores the complete decision/event in a machine-local, owner-only,
encrypted profile and applies its own lawful basis, retention, access,
correction, deletion, backup, and audit obligations. Phoenix does not create a
portable counterpart or correlation handle for that event and does not turn
the restricted store into Public Core data.

## 2. Data-flow review

| Boundary | Required privacy behavior | Failure behavior |
| --- | --- | --- |
| capture request → policy | classify purpose, materiality, personal/contextual identifiability, storage profile, data/disclosure/retention compatibility, and source assurance before persistence | unknown field/class/purpose or uncertain identifiability fails closed |
| policy → canonical writer | allowlist and redact in memory; bind capture/redaction policy digests | prohibited content never reaches a temporary or final durable file |
| portable streams → repository readers | treat Git/repository access as one coarse trust zone; every byte must already be public-safe and retention-compatible | no claim that query policy, directories, or metadata restrict a clone/direct read |
| portable streams → query/viewer | use the query service as the sole sanctioned semantic source; validate repository, chain checkpoint, candidate, policy, and disclosure class before projection | invalid/unknown completeness cannot render authority or pass; this is not an OS ACL |
| restricted local stream → authorized query | enforce physical root, owner/ACL, encryption generation, purpose, retention, and operator authorization; never correlate to a portable counterpart | absent/expired/unavailable/unauthorized stays typed and cannot be inferred from Git |
| canonical streams → bundle | include only policy-selected artifacts and explicit omissions; verify offline | tampering, stale checkpoints, or disallowed class blocks build/verify |
| inbound external/ITSM → Pipeline | parse as untrusted observation; sanitize references/content; compose only with separate human authority | external state/content never grants authority |
| projection → machine-local outbox | generate one-way minimal payload before queue persistence; keep endpoint/tenant/credential local | classification or redaction failure blocks enqueue |
| outbox → destination | enforce capability, target allowlist, consent, idempotency, TLS and acknowledgement/readback policy | no false success; partial/unknown stays retryable or blocked |
| recovery → stream/projection | disclose only public-safe operation/digests; require retained checkpoint and decision where authority changes | no generic cleanup, deletion, history fabrication, or raw host trace |

Feedback from viewer, SIEM, document, issue, ITSM, or delivery systems cannot
flow back into canonical authority. A new sanitized inbound observation must
pass the same capture policy and still cannot grant human authority.

## 3. Minimization, retention, and access rules

1. Portable schemas are default-deny and size/count bounded.
2. Portable records use stable reason codes only. Free-form rationale is a
   restricted-record field and cannot be made portable merely by scanning or
   truncating it.
3. Occurrence and observation times carry explicit assurance; no location,
   device, network, or provider telemetry is inferred.
4. A public-safe label or pseudonym can still be personal data through context.
   If classification cannot prove the complete portable record non-personal
   for the repository audience and retention, portable persistence is denied;
   the design never claims anonymization from redaction alone.
5. Rich identity attributes, personal/pseudonymous actor references,
   free-form rationale, endpoints, credentials, tenant/project mappings,
   destination cursors, and encryption/signing keys remain machine-local.
6. Portable stream policy independently controls capture eligibility and
   downstream projections, but all Git-resident streams share the repository's
   access and retention. A stricter stream requirement rejects portable append;
   policy cannot silently extend it. This is the normative interpretation of
   Spec §4.4; “independently configured” does not claim independent physical
   access or retention inside Git.
7. The restricted profile stores the complete event outside Git under an
   owner-only root, verified ACL/reparse boundary, encryption at rest, separate
   key custody, explicit expiry, and exact `erase`/`destroy-key` operations.
   It produces no portable counterpart or join handle.
8. Correction, restriction, expiry, and supersession append typed
   dispositions only for immutable public-safe records. Restricted records use
   explicit erase/key destruction where policy requires it. Neither path
   implies deletion from unobserved backups, clones, or external systems or
   satisfaction of a legal erasure obligation.
9. Repository access is coarse. Least privilege applies to the restricted
   local store and to viewer, bundle, adapter, ITSM, and export operations;
   projection policy is not described as protection from direct Git reads.
   Spec §4.5's “sole read boundary” means the sole sanctioned semantic source
   for those consumers, not the only physically possible repository read.
10. Backfill after policy/destination change requires exact preview and
    explicit consent; prior eligibility is never inferred.
11. Restricted storage, schema discrimination, policy, operations, tests, and
    operator guidance SHALL be implemented only inside the event-envelope,
    capture-policy, human-decision, event-store, `governance-event` CLI, and
    documentation files already listed in bound Spec §§7.3–7.4. No separate
    restricted-store implementation file is authorized by this design.

## 4. Required privacy fixtures

The implementation cannot close until candidate-bound tests prove:

- secret, token, credential, private-key, private-path, private-remote,
  endpoint, tenant, actor-mapping, prompt, transcript, command/output, and
  high-cardinality injection rejection before every durable boundary;
- nested, encoded, Unicode-confusable, multiline, oversized, malformed,
  external-content, and error-path variants;
- proof that a restricted human decision is a complete local event and has no
  portable actor reference, counterpart, digest, mapping, or join handle;
- rejection of personal identifiers, joinable pseudonyms, free-form rationale,
  contextually identifiable data, and finite-erasure/short-retention requests
  before any portable temporary or final file exists;
- proof that a direct repository read/clone exposes all portable streams and
  that every admitted fixture is safe for that complete audience and retention;
- repository-wide portable retention/access compatibility plus independent
  capture and downstream projection decisions;
- a complete restricted-store event with no portable counterpart/join handle,
  owner/ACL/reparse/encryption checks, explicit expiry, erase and key
  destruction, sanitized exact readback, and honest backup/clone limitations;
- redacted viewer/bundle/publication/export projections with explicit
  omissions;
- outbox, retry, dead-letter, diagnostic, telemetry, receipt, recovery, and
  crash artifacts containing no prohibited content;
- no feedback path from an external projection to human authority;
- exact candidate/checkpoint/policy binding and invalidation after drift;
- no compliance, legal-identity, trusted-time, destination-retention, or
  analyst-review claim without separate evidence.

## 5. Independent sign-off gate

The reviewer must:

1. inspect the complete Phoenix diff and the configured policy checklist;
2. trace all canonical, projected, external, machine-local, recovery, and
   diagnostic flows above;
3. verify purpose limitation, minimization, retention/access separation,
   pre-durability redaction, private-coordinate exclusion, and one-way
   authority boundaries;
4. identify any unresolved privacy risk with severity, owner, and expiry;
5. return an explicit pass/fail bound to the fixed candidate.

The initial independent review returned FAIL with one blocker and one major:
portable Git storage could bypass claimed stream ACLs, and personal/free-form
content had no executable erasure/key-destruction contract. The first
correction re-review returned FAIL with one blocker and two majors: normative
Spec wording remained ambiguous, append-only conflicted with restricted
erasure, and five new restricted-store files exceeded the Spec inventory. The
current correction makes Acceptance the explicit interpretation of Spec
§§4.4–4.5, scopes append-only to portable records, and assigns every restricted
operation to existing Spec-listed files. A fresh re-review must check all five
accepted privacy findings and direct regressions. Until it passes, governance
checklist item 1 remains NOT MET and Phoenix remains blocked before the Product
Owner gate.
