# Phoenix acceptance evidence map — working draft, 2026-08-05

Status: **working evidence artifact, not bound authority.** It lives in the
gitignored `evidence/` directory on purpose: the feature lifecycle is `draft`
and the bound design set cannot take a new inventoried document until the
Product Owner has reopened design and the successor Spec is bound. Promote it
into `specs/sprint-phoenix-epic/design/` through the ordinary reviewed path
afterwards.

## Why this exists

`acceptance.md` states that "each criterion must map to a named test or
deterministic Verify step and exact candidate evidence", and `EPIC-AC-05`
prohibits a completion claim while any criterion is unverified.

**Finding (2026-08-05): that binding does not exist yet.** Scanning every
Phoenix test file for acceptance-criterion identifiers returns exactly two
hits, both in `phoenix-governance-threat-model.test.mjs` (`K-AC-01`,
`K-AC-07`). All other suites are named after their module, not after the
criteria they discharge. The suites are green and real; what is missing is the
*traceable* criterion-to-evidence binding the Epic's own acceptance rule
requires. No amount of passing suites substitutes for it, and no closure claim
should be made until it is authored.

## Criterion inventory

157 criteria across 12 groups:

| Group | Criteria | Scope |
| --- | --- | --- |
| PX0 | 17 | Lifecycle-authority revision, runner-neutral ruleset source/freshness |
| K | 10 | Governance event kernel |
| H | 15 | Human Governance Decision Ledger (#30) |
| A | 16 | Agent Decision and Assumption Journal (#31) |
| L | 8 | Lifecycle stream and replay (#17) |
| P | 13 | Policy packs and signed audit bundles (#9) |
| V | 10 | Human-readable Evidence Viewer (#5) |
| X | 15 | Traceability and documentation adapters (#23) |
| C | 13 | ITSM change control (#24) |
| E | 21 | Governance event export (#32) |
| R | 13 | External command offer, workaround, recovery audit |
| EPIC | 6 | Integration and release |

## Group-level suite map

Each row lists the registered Verify suite names that cover the group's
implementing modules. **This is a module-name correspondence, not a verified
per-criterion binding** — it is the scaffolding for the real matrix, and an
independent reviewer must confirm each line before it carries weight.

| Group | Registered Verify suites |
| --- | --- |
| PX0 | `phoenix-authority-revision-proof-tests`, `pipeline-state-tests`, `continuity-state-tests`, `continuity-host-adapter-tests`, `ruleset-source-tests`, `ruleset-freshness-tests`, `repository-freshness-tests`, `pipeline-start-preflight-tests`, `pipeline-start-v3-tests` |
| K | `phoenix-governance-event-tests`, `phoenix-governance-event-store-tests`, `phoenix-governance-event-projection-tests`, `phoenix-governance-event-cli-tests` |
| H | `phoenix-human-governance-ledger-tests`, `phoenix-governance-authority-resolver-tests`, `phoenix-governance-authority-tests`, `phoenix-guard-git-authority-tests`, `guard-git-tests`, `guard-push-tests`, `pipeline-state-tests` |
| A | `phoenix-agent-decision-journal-tests` |
| L | `phoenix-governance-replay-tests`, `phoenix-governance-replay-view-tests`, `phoenix-governance-replay-cli-tests`, `phoenix-governance-replay-viewer-tests`, `phoenix-lifecycle-governance-events-tests` |
| P | `phoenix-organization-policy-tests`, `phoenix-organization-policy-activation-tests`, `phoenix-audit-bundle-tests`, `phoenix-audit-bundle-cli-tests` |
| V | `phoenix-evidence-view-model-tests`, `phoenix-evidence-view-renderer-tests`, `phoenix-evidence-viewer-tests` |
| X | `phoenix-external-reference-adapter-tests`, `phoenix-external-reference-cli-tests` |
| C | `phoenix-change-control-tests`, `phoenix-change-control-cli-tests` |
| E | `phoenix-governance-export-outbox-tests`, `phoenix-governance-export-outbox-store-tests`, `phoenix-governance-export-adapter-tests`, `phoenix-governance-export-delivery-tests`, `phoenix-governance-export-cli-tests` |
| R | `phoenix-external-command-offer-tests`, `phoenix-governance-threat-model-tests` |
| EPIC | aggregate `node harness/scripts/verify.mjs` plus `security-scan`; the remaining EPIC criteria are process gates (independent Critic, exact push/readback, Product Owner acceptance) and cannot be discharged by a suite at all |

## Depth check — and the correction it forced

A first pass ranked the groups by module and test line counts and concluded
that group A was materially unimplemented. **Reading the modules disproved
that.** The finding is retracted here rather than left standing.

This codebase is written in an extremely dense one-statement-per-line style and
shares infrastructure across groups, so line count is a worthless proxy for
coverage. Two concrete disproofs:

- `governance-export-outbox.mjs` (24 lines) is a complete per-destination
  outbox state machine: deduplicating enqueue, delivery application with
  contiguous-prefix cursor advance, quarantine, and bounded batching.
- `change-control.mjs` (30 lines) is a complete composed gate: local authority
  match, emergency authorization, mandatory/not-required handling, external
  receipt match, authentication, state and window checks.

**Group A (#31) re-assessed.** `agent-decision-journal.mjs` is only the payload
boundary; it is *not* the whole implementation. `governance-event-store.mjs`
(882 lines / 292 test lines) treats `agent` as a first-class origin, binding the
journal payload to its envelope, candidate and effective capture policy, and it
supplies append-only canonical records, digests, chain linkage, checkpoints,
idempotency and fork detection. `external-command-offer.mjs` builds the offer /
attempt / outcome lifecycle on the same validator, and
`docs/agent-decision-journal.md` exists. So `A-AC-02`, `A-AC-13` and much of
`A-AC-15` are supported after all.

**What actually remains open for group A** is narrower and still real:
`A-AC-14` requires a conformance suite covering thirteen named scenario classes
(unverified assumption, later confirmation, contradiction, candidate
invalidation, route selection, decomposition, verification-scope change,
escalation, fallback, redaction, tampering, retry, missing availability); the
two relevant test files carry nine cases in total and none is labelled by
scenario class. `A-AC-03`'s governed revalidation/invalidation path was not
located.

**The finding that survives.** No Phoenix test cites an acceptance-criterion
identifier except two hits in `phoenix-governance-threat-model.test.mjs`. The
implementation looks broadly present; what is missing is the *traceable
criterion-to-evidence binding* that `acceptance.md` and `EPIC-AC-05` require.
That is a genuine blocker for a completion claim, and it is unaffected by the
retraction above.

Groups `L`, `P`, `V`, `C`, `E`, `R`, `X` and `PX0` were measured but not
read criterion by criterion.

## Candidate evidence

| Candidate | Aggregate Verify | Notes |
| --- | --- | --- |
| `270a923382c6fb57d985eb1acd2d82eed5b37c23` | exit 1 | `product-capability-inventory-tests` and `license-contract-check` red |
| `9aebc4b` (inventory repair) | exit 1 | only `license-contract-check` red; Security `CLEAN` |
| `faa5e08` (§7 revision amendment) | see `verify-faa5e08.log` | documentation-only successor to `9aebc4b` |

## Recommended closure mechanism

1. Author `specs/sprint-phoenix-epic/acceptance-evidence.json`: one entry per
   criterion ID naming its covering suite(s) and the assertion(s) that
   discharge it.
2. Add a deterministic Verify step that fails when any criterion ID in
   `acceptance.md` is absent from that file, when it names an unregistered
   suite, or when a named suite is not part of the aggregate run.
3. Annotate the covering assertions with their criterion IDs so the binding is
   checkable from both directions rather than asserted in prose.
4. Only then can `EPIC-AC-05` be evaluated honestly, and only then can the
   eight `sprint:phoenix` issues receive a disposition.

## Worked reference — group K bound criterion by criterion

This is the pattern the other eleven groups need. Each row names the covering
test case by its exact title. **The binding is title-level: it was derived by
reading test titles against criteria, not by reading each assertion.**
Assertion-level confirmation is the next step and is what makes a row count as
evidence. Suites: `phoenix-governance-event-tests` (`governance-event.test.mjs`,
short `GE`) and `phoenix-governance-event-store-tests`
(`governance-event-store.test.mjs`, short `GES`).

| Criterion | Covering test case(s) | Binding |
| --- | --- | --- |
| K-AC-01 | GE "envelope binds each origin to its payload and cannot collapse authority"; GE "primitive validation rejects unknown fields, cross-origin payloads, and digest tampering"; GE "primitive validation enforces payload and full-envelope size limits before storage"; GES "portable admission requires the exact effective policy and closed safe payload" | title-level |
| K-AC-02 | GES "exact idempotency is a zero-write replay while a conflicting key fails closed" | title-level |
| K-AC-03 | GES "exact idempotency is a zero-write replay while a conflicting key fails closed" (conflicting-key half) | title-level |
| K-AC-04 | GES "portable append publishes canonical bytes, readback checkpoint, and source-last head"; GE "RFC 8785-compatible canonicalization sorts member names and uses one UTF-8 representation"; GE "receipt checkpoint is independently repository and candidate bound" | title-level |
| K-AC-05 | GES "tampering, non-canonical bytes, and forks fail before projection or query"; GES "projection recovery requires a retained checkpoint and rebuilds a stale head without touching canonical events" | title-level |
| K-AC-06 | GES "verification is checkpoint-aware and queries return only validated chain records"; GES "symlink, cross-repository, and writer-owned intent fields are rejected" | title-level |
| K-AC-07 | GES "projection recovery requires a retained checkpoint and rebuilds a stale head without touching canonical events"; `phoenix-governance-threat-model.test.mjs` cites `K-AC-07` directly | title-level plus one explicit citation |
| K-AC-08 | GES "verification is checkpoint-aware and queries return only validated chain records" | **weak — no test title names the head-asserts-absent-record case; confirm or author** |
| K-AC-09 | GE "envelope rejects unknown fields and preserves the six exact typed absence states" | title-level |
| K-AC-10 | GES "verification is checkpoint-aware and queries return only validated chain records" | **weak — multi-stream origin/authority/integrity/assurance preservation is not named by any title; confirm or author** |

Even at title level the exercise immediately surfaces two criteria (`K-AC-08`,
`K-AC-10`) with no clearly corresponding test. That is the value of the
mechanism.

## All remaining groups, bound the same way

Same rule throughout: **title-level binding**, derived from the criterion text
against the exact test titles of the registered suites. A row marked **GAP**
has no test title that plausibly covers it. A row marked *weak* has a partial
or generic match that must be confirmed or replaced. Rows marked *doc* are
documentation obligations that no suite can discharge.

### H — Human Governance Decision Ledger (15)

Suites: `phoenix-human-governance-ledger-tests` (LG),
`phoenix-governance-authority-resolver-tests` (RS),
`phoenix-governance-authority-tests` (GA), `phoenix-guard-git-authority-tests`
(GG), plus `phoenix-governance-event-store-tests` (GES) for restricted storage.

| Criterion | Covering test case(s) | Binding |
| --- | --- | --- |
| H-AC-01 | LG "validates a closed portable grant and resolves matching authority"; LG "consumes a persisted single-use grant exactly once under the canonical stream lock"; GA "authority CLI grants only a verified checkpoint-bound human decision" | title-level |
| H-AC-02 | RS "resolver exposes only exact granted authority"; GG "Phoenix Git override requires and single-consumes checkpoint-bound human authority" | title-level |
| H-AC-03 | LG "requires one event-specific link and outcome for every authority lifecycle disposition"; LG "rejects open payloads and invalid lifecycle link cardinality" | weak — the nine distinct event types are not enumerated by any title |
| H-AC-04 | LG "fails closed for repository/candidate drift, expiry, and consuming disposition"; LG "binds an external proof to the ledger grant, its candidate, and both scoped artifacts" | title-level |
| H-AC-05 | LG "verifies an external detached proof without upgrading caller-supplied trust to human identity"; RS "external resolver reports proof verification without claiming human identity provenance" | title-level |
| H-AC-06 | LG "derives an append-only consumption disposition without rewriting the grant"; GES "restricted storage stays outside the repository, is owner-only encrypted, and supports exact active-store erasure" | title-level |
| H-AC-07 | LG "fails closed for repository/candidate drift…"; GES "symlink, cross-repository, and writer-owned intent fields are rejected" | title-level |
| H-AC-08 | — | **GAP** — no test names legacy import as an unverified observation |
| H-AC-09 | GG "Phoenix Git override requires and single-consumes checkpoint-bound human authority" | weak — the no-private-coordinate-copying half is unnamed |
| H-AC-10 | — | **GAP** — bounded role exception with scope/expiry/follow-up is untested |
| H-AC-11 | — | **GAP** — reviewer reconstruction field set is untested |
| H-AC-12 | GG; GA "authority CLI consumes a checkpoint-bound single-use grant idempotently"; plus `guard-push-tests`, `guard-devplan-tests`, `pipeline-state-tests` | title-level, spread across suites |
| H-AC-13 | LG "rejects open payloads and invalid lifecycle link cardinality" | weak — the prohibited-content list is not enumerated |
| H-AC-14 | `docs/human-governance-ledger.md`, `docs/phoenix-governance-threat-model.md` | doc |
| H-AC-15 | eight unlabelled LG cases | weak — thirteen named classes vs eight cases |

### L — Lifecycle stream and replay (8)

Suites: `phoenix-lifecycle-governance-events-tests` (LGE),
`phoenix-governance-replay-tests` (GR), `phoenix-governance-replay-view-tests`
(GRV), `phoenix-governance-replay-cli-tests` (GRC).

| Criterion | Covering test case(s) | Binding |
| --- | --- | --- |
| L-AC-01 | LGE "accepts a closed correlated non-authoritative lifecycle event" | title-level |
| L-AC-02 | LGE "rejects open payloads, free text, private-shaped correlations, and invalid candidates" | weak — the eight retained identity fields are unnamed |
| L-AC-03 | — | **GAP** — namespaced runner extensions and unknown-namespace rejection are untested |
| L-AC-04 | GRV "builds a topology and ordered timeline without granting authority" | weak — distinct semantic/visual classes unnamed |
| L-AC-05 | GR "candidate invalidation remains visible and duplicate sequences fail closed"; GR "replay refuses an uncorrelated candidate change"; GRC "does not project an incomplete or invalid canonical stream" | title-level |
| L-AC-06 | GRV "rejects extra event data instead of exposing raw lifecycle bodies" | title-level |
| L-AC-07 | — | **GAP** — the six replay fixture classes are unnamed |
| L-AC-08 | — | **GAP** — retention-need traceability is a design obligation with no artifact |

### P — Policy packs and signed audit bundles (13)

Suites: `phoenix-organization-policy-tests` (OP),
`phoenix-organization-policy-activation-tests` (OPA),
`phoenix-audit-bundle-tests` (AB), `phoenix-audit-bundle-cli-tests` (ABC).

| Criterion | Covering test case(s) | Binding |
| --- | --- | --- |
| P-AC-01 | OP "accepts a closed compatible policy pack" | title-level |
| P-AC-02 | OP "rejects floor weakening, duplicate document ownership, unknown fields, and incompatible core" | strong title match |
| P-AC-03 | OPA "activates exactly the planned effective policy only after a bound authority readback" | weak — preview content and backfill range unnamed |
| P-AC-04 | OPA both cases; ABC "routes build and verify through their explicit local services" | title-level |
| P-AC-05 | — | **GAP** — credential/endpoint/coordinate exclusion from portable policy is untested |
| P-AC-06 | AB "builds and offline-verifies a candidate-bound bundle from a valid package"; ABC "passes closed plan inputs and every requested pack to the bundle planner" | title-level |
| P-AC-07 | AB "signs and verifies only an unchanged manifest without identity or authority claims" | title-level |
| P-AC-08 | — | **GAP** — durable topology retention at Close is untested here |
| P-AC-09 | — | **GAP** — backfill preview and explicit consent are untested |
| P-AC-10 | AB "…without identity or authority claims" | weak — the no-compliance-claim rule is broader |
| P-AC-11 | OP "resolves compatible packs without last-write-wins and unions approval requirements" | weak |
| P-AC-12 | AB "detects tampered or missing bundle bytes"; AB "invalidates a signature when the manifest changes after signing" | title-level |
| P-AC-13 | maintained threat model and migration policy documents | doc |

### V — Human-readable Evidence Viewer (10)

Suites: `phoenix-evidence-view-model-tests` (EVM),
`phoenix-evidence-view-renderer-tests` (EVR), `phoenix-evidence-viewer-tests`
(EV).

| Criterion | Covering test case(s) | Binding |
| --- | --- | --- |
| V-AC-01 | EVM "projects only a valid complete feature package and keeps its success claim unknown"; EV "builds a new offline report with source links and a candidate-bound receipt" | title-level |
| V-AC-02 | EVM "renders only candidate-bound non-authoritative explicit evidence" | title-level |
| V-AC-03 | EV "builds a new offline report with source links and a candidate-bound receipt" | title-level |
| V-AC-04 | EVM "invalid topology is an invalid view with no candidate or artifact leak" | title-level |
| V-AC-05 | EVM "redacted package projection is deterministic and withholds artifact paths"; EV "creates a redacted report without canonical paths" | title-level |
| V-AC-06 | EVR "renders an offline, accessible static report with candidate before summary" | weak — keyboard, CSP and mobile/desktop snapshot checks are unnamed |
| V-AC-07 | EVR "rejects an authority-bearing or unknown view shape" | weak |
| V-AC-08 | — | **GAP** — the six canonical artifact states are untested |
| V-AC-09 | — | **GAP** — the seven conformance fixture classes are unnamed |
| V-AC-10 | EVR "renders an offline, accessible static report with candidate before summary" | strong title match |

### X — Traceability and documentation adapters (15)

Suites: `phoenix-external-reference-adapter-tests` (XRA),
`phoenix-external-reference-cli-tests` (XRC).

| Criterion | Covering test case(s) | Binding |
| --- | --- | --- |
| X-AC-01 | XRA "rejects unclosed references and blocks non-pipeline-owned writes" | weak — the nine bound dimensions are unnamed |
| X-AC-02 | XRA "preserves the closed normative relation taxonomy and rejects unknown relation semantics" | title-level |
| X-AC-03 | XRA "requires inspection, exact preview, authority, idempotent apply and matching readback" | strong title match |
| X-AC-04 | XRA "does not report success for revision, capability, authority, or readback conflicts" | strong title match |
| X-AC-05 | XRA "reconciles external observations without importing them as authority" | strong title match |
| X-AC-06 | — | **GAP** — the seven external object states are untested |
| X-AC-07 | — | **GAP** — credential handling and portable-evidence exclusion are untested |
| X-AC-08 | — | **GAP** — provider-specific confinement to the adapter profile is untested |
| X-AC-09 | — | **GAP** — untrusted external content and injection prevention are untested |
| X-AC-10 | — | **GAP** — canonical identity resolution through #22 is untested |
| X-AC-11 | — | **GAP** — consuming the effective #9 policy is untested |
| X-AC-12 | XRC "previews one bounded external write using local synthetic observations" | weak — only one of four required synthetic profiles is named |
| X-AC-13 | — | **GAP** — reference-only default and last-write-wins rejection are untested |
| X-AC-14 | XRC "reconciles read-only and rejects a path outside the checkout" | weak |
| X-AC-15 | maintained contract, threat model, mapping, publication and recovery documents | doc |

### C — ITSM change control (13)

Suites: `phoenix-change-control-tests` (CC),
`phoenix-change-control-cli-tests` (CCC).

| Criterion | Covering test case(s) | Binding |
| --- | --- | --- |
| C-AC-01 | CC "allows mandatory promotion only when independent local and external authority bind the exact same tuple" | title-level |
| C-AC-02 | CC "requires explicit emergency authority and keeps not-required independent" | title-level |
| C-AC-03 | CC first case; CCC "loads explicit gate inputs, preserves an absent external receipt, and independently requires a bound ledger authority" | strong title match |
| C-AC-04 | CC "blocks stale, unauthenticated, mismatched, unavailable, and outside-window external change state" | strong title match |
| C-AC-05 | — | **GAP** — external update ordering and failed-attempt retention are untested |
| C-AC-06 | — | **GAP** — the `reconciliation-required` outcome is untested |
| C-AC-07 | CC "requires explicit emergency authority and keeps not-required independent" | title-level |
| C-AC-08 | CC same case | title-level |
| C-AC-09 | CCC "fails closed before evaluating legacy pipeline authority when the ledger scope is absent or mismatched" | weak — ambiguous/multiple mandatory profiles unnamed |
| C-AC-10 | — | **GAP** — auto-created records staying draft/observation is untested |
| C-AC-11 | — | **GAP** — provider-name confinement is untested |
| C-AC-12 | CC "blocks stale, unauthenticated, mismatched, unavailable, and outside-window external change state" | weak — the operator recovery path is unnamed |
| C-AC-13 | maintained threat model, precedence, runbook and rollback documents | doc |

### E — Governance event export (21)

Suites: `phoenix-governance-export-outbox-tests` (GEO),
`phoenix-governance-export-outbox-store-tests` (GEOS),
`phoenix-governance-export-adapter-tests` (GEA),
`phoenix-governance-export-delivery-tests` (GED),
`phoenix-governance-export-cli-tests` (GEC).

| Criterion | Covering test case(s) | Binding |
| --- | --- | --- |
| E-AC-01 | GEA "maps sanitized projections deterministically into all supported interchange profiles" | title-level |
| E-AC-02 | GEA same case | weak — declaring lossy conversions is unnamed |
| E-AC-03 | GEC "keeps policy absence explicit and passes only requested source inputs to projection" | title-level |
| E-AC-04 | — | **GAP** — free-form rationale omission before outbox persistence is untested |
| E-AC-05 | GEO "keeps destination queues independent and idempotently enqueues one source event"; GEOS "persists one destination outbox with an exact preimage and reloads it" | title-level |
| E-AC-06 | GED "local conformance collector delivers a bounded mapped batch and advances the acknowledged cursor" | weak — at-least-once semantics and the no-exactly-once prohibition are unnamed |
| E-AC-07 | GEO "advances only the safely acknowledged prefix after partial delivery"; GED "partial acknowledgement leaves an independent recoverable suffix with explicit receipt state" | strong title match |
| E-AC-08 | GED "forged or out-of-batch acknowledgements fail before a local outbox transition"; GEOS "does not overwrite a changed outbox from a stale preimage" | weak — cursor rollback, source fork and schema downgrade are unnamed |
| E-AC-09 | — | **GAP** — advisory-destination lag exposure is untested |
| E-AC-10 | — | **GAP** — boundary-scoped blocking of the exact unacknowledged range is untested |
| E-AC-11 | GEA "profile and acknowledgements are closed, non-authoritative and deduplicated"; GED "…explicit receipt state" | weak — the receipt field set is unnamed |
| E-AC-12 | GEA "profile and acknowledgements are closed, non-authoritative and deduplicated" | title-level |
| E-AC-13 | GEO "keeps destination queues independent and idempotently enqueues one source event" | title-level |
| E-AC-14 | GED "local conformance collector delivers a bounded mapped batch…" | weak — only one of five required fixture classes is named |
| E-AC-15 | GEA "maps only the already-sanitized projection and rejects profile or payload mismatch" | title-level |
| E-AC-16 | — | **GAP** — batching, rate limits, retry budget, backpressure, cancellation, flush and replay are untested |
| E-AC-17 | GEO "preserves retryable and quarantined entries without source-history mutation" | title-level |
| E-AC-18 | — | **GAP** — credential/endpoint exclusion from portable export evidence is untested |
| E-AC-19 | EVR "renders export lag and receipts as a separate non-authoritative observation"; EV "renders a supplied local export observation without turning it into authority" | title-level |
| E-AC-20 | — | **GAP** — bundle export-metadata limits are untested |
| E-AC-21 | `docs/governance-event-export.md` plus threat model and runbook | doc |

### R — External command offer, workaround and recovery audit (13)

Suites: `phoenix-external-command-offer-tests` (ECO),
`phoenix-governance-threat-model-tests` (TM).

| Criterion | Covering test case(s) | Binding |
| --- | --- | --- |
| R-AC-01 | ECO "records a public-safe offer before presentation and requires verified append readback" | strong title match |
| R-AC-02 | — | **GAP** — rejected-path and alternative-recovery correlation is untested |
| R-AC-03 | ECO "requires a bound human decision for destructive pipeline attempts and appends before execution" | strong title match |
| R-AC-04 | ECO "keeps user execution unobserved and admits completion only with bounded evidence" | weak — pre/post digests, recoverability and cleanup are unnamed |
| R-AC-05 | ECO "records a public-safe offer before presentation…" | weak — the prohibited-content list is not enumerated |
| R-AC-06 | ECO "keeps user execution unobserved and admits completion only with bounded evidence" | title-level |
| R-AC-07 | ECO same case | title-level |
| R-AC-08 | — | **GAP** — append-without-rewrite for recovery events is untested |
| R-AC-09 | ECO "rejects offer substitution across candidate, repository, and scope" | title-level |
| R-AC-10 | — | **GAP** — fail-closed on unavailable journaling is untested |
| R-AC-11 | — | **GAP** — machine-local private handoff with public-safe omission is untested |
| R-AC-12 | — | **GAP** — the motivating Phoenix bootstrap trajectory fixture does not exist |
| R-AC-13 | ECO "retains failed, partial, cancelled, mismatch and unknown outcomes distinctly" | weak — several required fixture classes are unnamed |

### PX0 — Lifecycle-authority revision and ruleset source/freshness (17)

Not bound in this session. Its criteria are discharged by large shared suites
(`pipeline-state-tests`, `continuity-state-tests`, `ruleset-source-tests`,
`repository-freshness-tests`, `ruleset-freshness-tests`,
`pipeline-start-preflight-tests`) plus the two-case
`phoenix-authority-revision-proof-tests`. Binding them requires reading
`pipeline-state.test.mjs`, which was not done here. Note that `PX0-AC-02`
through `PX0-AC-07` describe exactly the §7 revision path that is currently
blocked, so their evidence cannot be completed before that path runs once.

## Result of the binding pass

Across the eleven groups bound here plus group K, **35 criteria have no test
title that plausibly covers them** (`K-AC-08` and `K-AC-10` come from the
worked example above): H-AC-08, H-AC-10, H-AC-11, K-AC-08, K-AC-10, L-AC-03,
L-AC-07, L-AC-08, P-AC-05, P-AC-08, P-AC-09, V-AC-08, V-AC-09, X-AC-06,
X-AC-07, X-AC-08, X-AC-09, X-AC-10, X-AC-11, X-AC-13, C-AC-05, C-AC-06,
C-AC-10, C-AC-11, E-AC-04, E-AC-09, E-AC-10, E-AC-16, E-AC-18, E-AC-20,
R-AC-02, R-AC-08, R-AC-10, R-AC-11, R-AC-12.

That is 35 of the 140 criteria in these twelve groups; PX0's 17 are unbound and
excluded. Roughly as many again are *weak*: a generic or partial title match
that must be confirmed at assertion level or replaced by a named test. Six are
documentation obligations needing a document check rather than a suite:
A-AC-15, H-AC-14, P-AC-13, X-AC-15, C-AC-13, E-AC-21.

Two structural patterns dominate the gaps:

1. **Enumerated conformance suites are consistently unmet.** `A-AC-14` (13
   classes), `H-AC-15` (13), `V-AC-09` (7), `X-AC-12` (4 profiles), `E-AC-14`
   (5 fixture classes), `L-AC-07` (6) and `R-AC-13` all demand a named set of
   scenario classes, and in every case the existing suite carries fewer,
   unlabelled cases.
2. **Privacy and credential-exclusion criteria are the least tested surface.**
   `P-AC-05`, `X-AC-07`, `E-AC-18`, `R-AC-05` and `R-AC-11` all govern what must
   never reach portable evidence, and none has a dedicated test.

This is the concrete remaining work list for Phoenix. It needs no Product Owner
gate — only the reopened lifecycle, because closing it means writing files
under `plugins/`.

## Are the gaps missing tests or missing features?

That distinction decides what the next working session actually is, so the
following rows were classified by reading the modules. **Only rows verified by
reading are listed; the rest stay unclassified rather than guessed.**

**Missing test, feature present.** These criteria are satisfied *structurally*
by closed-key schema validation: every object is checked with an exact-keys
predicate, so a prohibited field cannot be constructed at all. That is a
stronger guarantee than a denylist, but nothing proves it today.

| Criterion | Mechanism found |
| --- | --- |
| P-AC-05 | `organization-policy.mjs` validates every pack object with exact keys; no credential, endpoint, tenant or signing-key field is representable |
| X-AC-07 | `external-reference-adapter.mjs` uses the same closed-key predicate throughout (ten call sites) |
| E-AC-18 | `governance-export-adapter.mjs` accepts only an already-sanitized projection, never a canonical payload or endpoint |
| R-AC-05 | `agent-decision-journal.mjs` enforces a mandatory omissions set (`raw-command`, `arguments`, `private-coordinates`, `unrestricted-output`) on every command-offer event |

**Missing feature, not just a test.** These have no implementing code at all:

| Criterion | What is absent |
| --- | --- |
| E-AC-16 | `governance-export-delivery.mjs` knows only a `retryable-failure` disposition — no retry budget, backoff, rate limit, backpressure, cancellation, flush or compression |
| X-AC-10 | `external-reference-adapter.mjs` contains no reference to the #22 feature-package topology; canonical identity is never resolved through it |
| C-AC-05 | `change-control.mjs` has no deployment-event ordering and no failed-attempt retention |
| C-AC-06 | the `reconciliation-required` outcome does not exist in `change-control.mjs` |
| L-AC-03 | `lifecycle-governance-events.mjs` has no namespaced-extension handling and therefore cannot reject an unknown namespace |

**Deliberately unclassified.** The remaining gap criteria were not read module by
module. Keyword scans gave weak or ambiguous signals, and several of them —
`X-AC-09` (untrusted external content) and `E-AC-04` (free-form rationale
omission) in particular — may well be structurally satisfied by the same
closed-schema mechanism as the privacy cluster. Classifying them on a keyword
count would be a guess, so they are left open.

**Consequence for planning.** The next session is a mixed one: partly test
authorship against mechanisms that already exist, partly real implementation
for at least five criteria. It is not a pure documentation exercise, and it is
not a rebuild either.

Nothing in this document establishes implementation, verification, or closure
for any criterion.

## Closure log — 2026-08-06

The nine classified criteria above are now closed. Everything else in this
document stands unchanged: the unclassified rows are still unclassified, and no
criterion outside this list has moved.

**Test authored against an existing mechanism** (four rows from the
"missing test, feature present" table):

| Criterion | Test |
| --- | --- |
| P-AC-05 | `plugins/pipeline-core/lib/organization-policy.test.mjs` |
| X-AC-07 | `plugins/pipeline-core/lib/external-reference-adapter.test.mjs` |
| E-AC-18 | `plugins/pipeline-core/lib/governance-export-adapter.test.mjs` |
| R-AC-05 | `plugins/pipeline-core/lib/agent-decision-journal.test.mjs` |

One of these corrected an assumption rather than confirming it: the first
X-AC-07 draft expected a credential-bearing inspection to be ignored. The
adapter is stricter — it fails closed with `reconciliation-required`. The test
asserts the behaviour that exists.

**Implemented, not merely tested** (the five "missing feature" rows):

| Criterion | Implementation | Commit |
| --- | --- | --- |
| L-AC-03 | `lifecycle-governance-events.mjs` gains an additive `extensions` field gated by the reviewed namespace registry, now loaded once in `extension-namespaces.mjs` | `d907676` |
| C-AC-05 | `change-control.mjs` gains an append-only deployment journal whose order forbids an external update before its local event | `38de29c` |
| C-AC-06 | the same projection reports `reconciliation-required` with deployment evidence retained instead of `completed` | `38de29c` |
| X-AC-10 | `resolveCanonicalArtifactIdentity` in `feature-package-topology.mjs`, consumed by the adapter and the operator CLI before any provider contact | `3323993` |
| E-AC-16 | `governance-export-delivery-policy.mjs`: bounded batching, compression, rate limit, retry budget with capped backoff, backpressure, cancellation, flush, replay and restart recovery | `aa873e2` |

### Classification pass 2 — 2026-08-06

Eleven of the twenty-six remaining gap criteria were classified by reading the
implementing module. The same rule as before applies: only rows verified by
reading are listed, and the mechanism found is named so the classification can
be checked rather than trusted.

**Missing test, feature present.**

| Criterion | Mechanism found |
| --- | --- |
| H-AC-11 | `human-governance-decision.mjs` carries every element the criterion enumerates — request/consumes/revokes/expires/supersedes/corrects links, `authorityClass` + `identityAssurance`, `timeAssurance` + `validity`, closed `scope`, `CODE`-bounded `reasonCode`, `policyDigest` + `ruleDigest`, `scope.artifacts`, `outcome` — and the closed key set makes a natural-person attribution or free-form rationale unrepresentable, so the restricted-record clause holds by construction |
| V-AC-08 | `evidence-view-model.mjs` carries the full `PACKAGE_STATES` lifecycle vocabulary plus `invalid`/`unavailable` in `VIEW_STATUSES` |
| X-AC-06 | `external-reference-adapter.mjs` `FRESHNESS` is exactly the eight states the criterion names, and `reconcileExternalReference` returns a typed status/reason for each |
| X-AC-08 | the reference, capability and write-intent schemas are closed-key throughout; a provider name or field has nowhere to enter the core, and `adapterProfile` is an opaque identifier |
| X-AC-09 | every provider answer passes a closed-key predicate before use and is only ever compared, never evaluated; an unexpected field fails the operation closed |
| X-AC-13 | the write path admits only an explicit `controlled-publication` mode and requires `expectedRevision` to match the inspected revision, so anything narrower falls back to reference-only and last-write-wins is structurally impossible |
| C-AC-10 | `validateChangeControlReceipt` admits a `draft` state, and the gate requires `state === "approved"` *and* `authenticated === true`, so an automatically created record cannot satisfy it |
| C-AC-11 | the profile, receipt and gate schemas are closed-key; a provider field cannot be added to the provider-neutral core |

**Missing feature, not just a test.**

| Criterion | What is absent |
| --- | --- |
| H-AC-08 | there is no legacy-import path at all. `resolveHumanGovernanceAuthority` admits only a fully validated decision, so a legacy approval/override/deploy record cannot be imported as an unverified observation because it cannot be imported at all |
| H-AC-10 | `scope` is `{repositoryFingerprint, candidate, packageId, action, environment, artifacts}`. Exact scope, reason and expiry are present, and the mandatory `expiresAtEpochMs` already forbids a standing bypass — but there is no `constraints` and no mandatory follow-up review field, so two of the criterion's five recorded elements have nowhere to live |
| X-AC-11 | `external-reference-adapter.mjs` never imports `organization-policy.mjs`; the effective #9 policy is not consumed on any path |

**Closed in the same session.** All eight "missing test, feature present" rows
above now carry executable evidence (`2a922b0`):

| Criterion | Test file |
| --- | --- |
| H-AC-11 | `plugins/pipeline-core/lib/human-governance-ledger.test.mjs` |
| V-AC-08 | `plugins/pipeline-core/lib/evidence-view-model.test.mjs` |
| X-AC-06, X-AC-08, X-AC-09, X-AC-13 | `plugins/pipeline-core/lib/external-reference-adapter.test.mjs` |
| C-AC-10, C-AC-11 | `plugins/pipeline-core/lib/change-control.test.mjs` |

**H-AC-10 is closed by implementation** (`015a08c`), by Product Owner decision
after the three options were laid out. A role exception is now its own decision
class (`pipeline.human-role-exception-decision.v1`) with mandatory constraints
and a mandatory follow-up review, rather than two new fields inside the plan
class. Nothing existing changed shape: no digest, no signature and no published
contract moved, because the plan class is untouched and the human stream simply
carries two classes discriminated by the envelope's declared payload schema.

Correction to the option analysis given at the time: the claim that adding the
fields would break every existing detached proof was overstated. This
repository has **no** persisted human decision at all (`governance/events/`
holds only `capture-policy.json` and `registry.json`), and under the additive or
separate-class options no signature would break in any case. The signature
consequence applied only to the make-them-required option.

The two remaining "missing feature" rows — H-AC-08 and X-AC-11 — are **not**
closed. H-AC-08 needs an import path that does not exist at all; X-AC-11 needs
the adapter to consume the effective #9 policy on every write path.

**Still unclassified after this pass.** K-AC-08, K-AC-10, L-AC-07, L-AC-08,
P-AC-08, P-AC-09, E-AC-04, E-AC-09, E-AC-10, E-AC-20, R-AC-02, R-AC-08,
R-AC-10, R-AC-11, R-AC-12. Several were partially probed — `heads.json` and the
`GES-CHAIN` fail-closed check for K-AC-08, the absence of any export metadata in
`audit-bundle.mjs` for E-AC-20 — but a partial probe is not a classification and
is recorded here as such rather than as a result.

**Gate coverage.** The E-AC-16 and H-AC-10 suites are folded into the already
registered `governance-export-delivery.test.mjs` and
`human-governance-ledger.test.mjs` rather than added as new Verify steps. That
keeps them inside the existing gate without editing `harness/scripts/verify.mjs`
— which `guard-testpath` (TP-3) blocks for the agent whose implementation that
gate governs, correctly. No Product Owner registration action is outstanding.

### Classification pass 3 — 2026-08-06

The remaining fifteen unclassified gap criteria were read module by module.
Same rule as passes 1 and 2: only rows verified by reading are listed;
ambiguous signal stays unclassified rather than guessed.

**Missing test, feature present.**

| Criterion | Mechanism found |
| --- | --- |
| K-AC-08 | `governance-event-store.mjs` `verifyPortableGovernanceStream` fails closed with `GES-CHECKPOINT` when a supplied checkpoint's witness record is absent from the stream or does not match (`!witness \|\| !checkpointMatches(...)`); no test exercises that path — only accurate checkpoints and the unrelated `GES-EVENT-INVALID`/`GES-FORK` tampering cases are covered |
| K-AC-10 | every governance envelope carries mandatory `origin`, `authorityClass`, `timeAssurance` (`governance-event.mjs` `REQUIRED_ENVELOPE_KEYS`); `queryPortableGovernanceStream` returns full untouched envelopes for exactly one `streamId` per call with no merge step that could lose them — but no test queries more than one stream |
| L-AC-08 | `specs/sprint-phoenix-epic/design/privacy-review.md` traces retained lifecycle fields to a stated audit need ("reconstruct execution, verification, review, recovery, delivery, and sanctioned authority-revision states"); no competitor/provider-parity justification appears anywhere in the repo — a documentation obligation, same class as the six already-recognized `doc` rows, with no dedicated test title |
| P-AC-08 | `harness/scripts/pipeline-state.mjs`'s `feature-package-inspect/plan/apply/status/recover` family (`reconcileDraftPreview`, `reconcileMutableDesignPreview`, transactional `writeBoundFile` with idempotency journal, exact readback) implements the durable-topology-retention-at-Close mechanism verbatim; `pipeline-state.test.mjs` exercises it heavily through a custom `ok()` label helper, not `test()` titles carrying the criterion ID — invisible to the identifier scan, not untested |
| E-AC-04 | `governance-event-projection.mjs`'s closed `FIELDS` allowlist (8 fixed keys, verified: `eventId, eventType, occurredAtEpochMs, eventDigest, repositoryFingerprint, correlation, candidate, policyDigest`) means `projectGovernanceEvent` can never construct an exported field from payload/rationale content, and `validateGovernanceExportPolicy` rejects any policy field outside `FIELDS` — free-form rationale is structurally unexportable, stricter than the criterion requires, same pattern as the closed E-AC-18/R-AC-05 rows |
| E-AC-09 | `governance-event-store.mjs` has no import of any export/outbox module (canonical append is architecturally independent of destination availability); `createGovernanceDeliveryReceipt` (verified) exposes `lag` and `"retryable-failure"`, and `evidence-view-model.mjs` renders an `unavailable` export state with `lag`/`cursor` to the viewer — no test title covers it |

**Missing feature, not just a test.**

| Criterion | What is absent |
| --- | --- |
| L-AC-07 | `governance-replay.mjs` (43 lines) has no concept of serial/parallel/retry/cancellation/recovery/malicious fixture classes — `projectGovernanceReplay` treats every input as one flat list and checks only sequence-fork and candidate-drift; none of the six named classes appears anywhere in the repo |
| P-AC-09 | `organization-policy-activation.mjs` has no export/destination/backfill concept at all — `backfill` appears nowhere in the codebase; no preview-and-consent mechanism exists for historical events becoming exportable after a policy/destination change |
| E-AC-10 | no required-vs-advisory destination distinction and no lifecycle-boundary-blocking concept exists in any export module or in `pipeline-state.mjs`'s lifecycle transitions — nothing can block a named boundary on an unacknowledged export range |
| E-AC-20 | `audit-bundle.mjs`'s manifest schema is exactly `["schema", "bundleId", "candidate", "effectivePolicySha256", "artifacts"]` (verified) — no export/delivery field anywhere, and the file imports no `governance-export-*.mjs` module; confirms the prior partial probe rather than extending it |
| R-AC-02 | neither the command-offer schema nor the generic agent-decision-event schema has a field for candidate alternatives (plural) or a distinct evidence-gap concept — only a single `offerEventId` link, a single `supersedesEventId` link, and one `reasonCode` string exist |
| R-AC-08 | command-offer recovery states are appended only to the agent stream; no code connects a command-offer recovery action to `lifecycle-governance-events.mjs`'s `"recovery"` kind, and no other module imports `external-command-offer.mjs` (verified: its only import is `agent-decision-journal.mjs`). The "SHALL NOT rewrite" half holds (append-only, no mutation function exists); the "append a lifecycle event" half does not |
| R-AC-11 | the public-safe typed-omission half is implemented cleanly (`omissions` field, mandatory 4-item minimum), but no field or code path anywhere stores the corresponding private handoff detail in sanctioned machine-local state — no import of `governance-event-store.mjs`'s restricted-store functions; the private detail is never captured, not merely unstored |
| R-AC-12 | no fixture named or shaped around "bootstrap"/"trajectory" exists in any `plugins/pipeline-core/lib/*.test.mjs`; no test combines rejected-guard-path + attended-local-repair + unchanged-privacy-boundary + successful-readback + no-remote-write into one named scenario |

**Still unclassified.**

| Criterion | Why |
| --- | --- |
| R-AC-10 | `recordCommandOffer`/`recordPipelineAttempt` never swallow an `append` rejection, which is fail-closed-shaped, but the module is a pure journal adapter with zero callers anywhere outside itself, its test, and one doc reference — the described system-level guarantee (blocking real presentation/initiation of a material action) is not demonstrable in code as it stands. There is also no "typed non-material exception" concept in the schema. Neither bucket fits without guessing which half of the criterion a (nonexistent) caller would satisfy. |

**Result.** All 35 originally-unbound gap criteria are now read and classified:
18 closed (passes 1–2), 6 more test-only ("missing test, feature present" —
not yet closed; writing their tests is deferred, see below), 10 genuine
feature gaps (H-AC-08 and X-AC-11 from pass 2, plus the 8 above), 1 remains
unclassified (R-AC-10). Zero criteria are left unread.

**Deliberately out of scope for this pass.** Per Product Owner decision,
`docs/state.md` records the project as paused, resuming with the rebase onto
the 0.5.2 release "before doing anything further... not more feature work."
This pass therefore stayed classification and documentation only: no test was
authored and no implementation module was touched. Writing the six pending
tests and implementing the ten feature gaps remain open work for a session
that either has the 0.5.2 rebase behind it or an explicit Product Owner scope
decision to proceed without it.
