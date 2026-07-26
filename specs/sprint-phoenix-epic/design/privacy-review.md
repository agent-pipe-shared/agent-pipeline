# Sprint Phoenix data-privacy review

Status: candidate prepared; independent sign-off pending

Date: 2026-07-26

This document is the blocking data-privacy review contract for the Phoenix
design. It is not legal advice, a compliance declaration, or a self-issued
review pass. A fresh read-only reviewer must assess the fixed candidate against
this inventory and the repository policy checklist before the design can reach
the Product Owner gate.

## 1. Processing boundary

Phoenix processes governance facts only when they are necessary to reconstruct
an authority decision, material declared assumption, deterministic lifecycle
event, policy result, or bounded external delivery. It does not collect hidden
reasoning, full prompts, transcripts, terminal history, unrestricted tool
output, credentials, endpoints, tenant coordinates, private paths, or
machine-local actor mappings in portable artifacts.

| Data class | Purpose | Portable representation | Retention/access boundary |
| --- | --- | --- | --- |
| Human decision attribution | Reconstruct who was locally attributed to a scoped decision and at what assurance | public-safe actor class/reference, outcome, scope, reason code, optional bounded rationale | separate human-stream retention; least-privilege query; direct identity mapping remains machine-local |
| Agent declaration | Preserve a material declared assumption/selection without hidden reasoning | role/route reference, selected option, evidence class/gaps, status and revalidation trigger | separate agent-stream retention; never authority |
| Lifecycle correlation | Reconstruct execution, verification, review, recovery, and delivery states | feature/package/request/dispatch/candidate/evidence identifiers and typed outcomes | separate lifecycle retention; no raw model/tool content |
| External reference or ITSM observation | Reconcile a governed external object without importing its content as authority | canonical target class, allowlisted public-safe reference, capability/revision/content digests | destination-specific policy; inbound content stays untrusted |
| Export delivery state | Retry and reconcile one-way sanitized projections | machine-local destination binding, cursor, idempotency key, payload digest, typed acknowledgement | machine-local queue; destination-specific expiry; never portable authority |
| Recovery evidence | Prove a bounded workaround or repair without exposing the host | stable reason/status codes, public-safe operation class, pre/post digests, candidate binding, typed omissions | lifecycle/recovery retention; raw command, path and private configuration excluded |

Direct personal identifiers are not a portable schema requirement. An adopting
organization that needs identity resolution keeps the mapping in a
machine-local, access-controlled binding store and applies its own lawful basis,
retention, access, correction, deletion, and audit obligations. Phoenix does
not turn that mapping into Public Core data.

## 2. Data-flow review

| Boundary | Required privacy behavior | Failure behavior |
| --- | --- | --- |
| capture request → policy | classify purpose, materiality, data/disclosure/retention class, and source assurance before persistence | unknown field/class/purpose fails closed |
| policy → canonical writer | allowlist and redact in memory; bind capture/redaction policy digests | prohibited content never reaches a temporary or final durable file |
| canonical streams → query/viewer | validate repository, chain checkpoint, candidate, policy, and disclosure class before projection | invalid/unknown completeness cannot render authority or pass |
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
2. Bounded rationale is optional and must pass prohibited-content scanning;
   stable reason codes are preferred.
3. Occurrence and observation times carry explicit assurance; no location,
   device, network, or provider telemetry is inferred.
4. Public-safe pseudonymous references remain personal data where applicable;
   the design does not claim anonymization.
5. Rich identity attributes, endpoints, credentials, tenant/project mappings,
   destination cursors, and encryption/signing keys remain machine-local.
6. Retention is independently configured per stream and destination. Policy
   cannot silently extend an existing record's disclosure or retention class.
7. An immutable portable record must not contain data that the adopting policy
   requires to be erasable in place. Erasable identity/content belongs in a
   separately controlled local binding or encrypted extension with an explicit
   deletion/key-destruction procedure.
8. Correction, restriction, expiry, and supersession are appended as typed
   dispositions; they do not rewrite historical facts or imply that legal
   erasure obligations are satisfied.
9. Access defaults to local least privilege. Viewer, bundle, adapter, ITSM, and
   export paths each re-evaluate disclosure policy instead of inheriting source
   access.
10. Backfill after policy/destination change requires exact preview and
    explicit consent; prior eligibility is never inferred.

## 4. Required privacy fixtures

The implementation cannot close until candidate-bound tests prove:

- secret, token, credential, private-key, private-path, private-remote,
  endpoint, tenant, actor-mapping, prompt, transcript, command/output, and
  high-cardinality injection rejection before every durable boundary;
- nested, encoded, Unicode-confusable, multiline, oversized, malformed,
  external-content, and error-path variants;
- separation of portable actor references from machine-local identity mapping;
- independent stream retention and access decisions;
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

Until that review passes, governance checklist item 1 remains NOT MET and
Phoenix remains blocked before the Product Owner gate.
