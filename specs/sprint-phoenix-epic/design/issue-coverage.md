# Sprint Phoenix live issue coverage

Status: design audit

Date: 2026-07-26; implementation audit refreshed 2026-08-02

Source: the eight open issues in the public
[`sprint:phoenix` query](https://github.com/agent-pipe-shared/agent-pipeline/issues?q=is%3Aissue%20state%3Aopen%20label%3Asprint%3Aphoenix),
read back on the date above.

This document maps every acceptance bullet in the live issue bodies to the
normative binary criteria in [../acceptance.md](../acceptance.md). The live
issue remains the source for its product intent. The Phoenix criteria are the
stricter implementation/verification contract. A shared mapping means the
obligation is intentionally proven by more than one package; it is not
deferred or dropped.

## #5 — Human-readable Evidence Viewer

| Live criterion | Phoenix proof obligation |
| --- | --- |
| 1. One command produces offline HTML | `V-AC-01` |
| 2. All canonical lifecycle states are represented | `V-AC-08` |
| 3. Tampered/stale/mismatched/misplaced/orphaned evidence fails visibly | `V-AC-04`, `V-AC-09`, `K-AC-06` |
| 4. Exact candidate binding is prominent | `V-AC-10` |
| 5. Pass/fail/unknown/tampered/misplaced/legacy fixtures | `V-AC-09` |
| 6. Accessibility and mobile/desktop readability | `V-AC-06` |

Coverage: complete and strengthened with CSP, keyboard/navigation, source
linking, redacted sharing, and a hard non-authority boundary.

## #9 — Organization policy packs and signed audit bundles

| Live criterion | Phoenix proof obligation |
| --- | --- |
| 1. Policy origin and effective value are inspectable | `P-AC-03` |
| 2. Conflicting/incompatible packs cannot activate silently | `P-AC-01`, `P-AC-02`, `P-AC-04` |
| 3. Required documentation stays provider-neutral | `P-AC-11` |
| 4. External permission is scoped by class/target/mode/ownership/event/approval | `P-AC-11`, `X-AC-02`, `X-AC-03` |
| 5. Policy cannot grant unrestricted edits or import prose authority | `P-AC-02`, `P-AC-11`, `X-AC-05` |
| 6. Publications require preview, source digest, revision readback, reconciliation | `P-AC-11`, `X-AC-03`, `X-AC-04` |
| 7. Audit bundles verify offline and expose tampering | `P-AC-12` |
| 8. Bundle artifacts resolve through canonical inventory | `P-AC-06` |
| 9. Invalid/misplaced/orphaned/unreconciled artifacts cannot enter silently | `P-AC-06`, `P-AC-12` |
| 10. Private overlays cannot smuggle private authority or coordinates | `P-AC-05` |
| 11. Threat model and migration/versioning are documented | `P-AC-13` |

Coverage: complete. Simple precedence was deliberately replaced by explicit
per-field merge strategies so an organization pack cannot weaken a Core floor.

## #17 — Sanitized multi-agent event model and local replay

| Live criterion | Phoenix proof obligation |
| --- | --- |
| 1. Raw messages/prompts/credentials/private paths/logs excluded by default | `L-AC-06`, `A-AC-06` |
| 2. Unknown and unavailable remain distinct | `K-AC-09` |
| 3. Replay detects broken correlation and candidate invalidation | `L-AC-05` |
| 4. Replay is non-authoritative and links canonical evidence | `L-AC-04`, `L-AC-05`, `V-AC-03`, `V-AC-07` |
| 5. Serial/parallel/retry/cancellation/malicious fixtures | `L-AC-07` |
| 6. Design is driven by user/audit needs, not competitor parity | `L-AC-08` |

Coverage: complete. Phoenix consumes the accepted #10 exchange and has no
build dependency on unpublished Nova #14.

## #23 — External traceability and documentation adapters

| Live criterion | Phoenix proof obligation |
| --- | --- |
| 1. #22 is the sole canonical artifact/lifecycle source | `X-AC-10` |
| 2. #9 governs mandatory documents and external writes | `X-AC-11` |
| 3. Synthetic issue/wiki/document/secondary-forge adapters share one core | `X-AC-12` |
| 4. Every synchronized field/section has one ownership class | `X-AC-02` |
| 5. Reference-only/outbound projection is the default | `X-AC-13` |
| 6. Bidirectional mode rejects unmapped fields/conflicts | `X-AC-04`, `X-AC-13` |
| 7. External status/prose cannot grant Pipeline authority/evidence | `X-AC-05` |
| 8. Protected publication requires preview/digest/revision/readback/receipt | `X-AC-03` |
| 9. Externally owned sections cannot be overwritten | `X-AC-02`, `X-AC-04` |
| 10. Stale/deleted/inaccessible/duplicate/out-of-order states are typed | `X-AC-06` |
| 11. Writes support preview and capability-bounded idempotent retry | `X-AC-03`, `K-AC-02`, `K-AC-03` |
| 12. External outage cannot erase local authority | `X-AC-14` |
| 13. Credentials/private coordinates stay out of portable evidence | `X-AC-07` |
| 14. Provider-specific names stay outside core schemas | `X-AC-08` |
| 15. Contract/threat/mapping/publication/conformance docs exist | `X-AC-15` |
| 16. #24 consumes the contract without provider-specific core fields | `X-AC-08`, `C-AC-11` |

Coverage: complete and strengthened with an exact
inspect/preview/authorize/apply/readback/reconcile lifecycle.

## #24 — Policy-governed ITSM change control

| Live criterion | Phoenix proof obligation |
| --- | --- |
| 1. Existing deploy adapter remains independent/provider-neutral | `C-AC-08`, `C-AC-11` |
| 2. Environment selects no control or exactly one effective profile | `C-AC-09` |
| 3. One artifact/environment binds both authorities, deploy, evidence, rollback, close | `C-AC-01`, `C-AC-03`, `C-AC-05`, `C-AC-06` |
| 4. Automatic creation/documentation never implies approval | `C-AC-10` |
| 5. Invalid/stale/wrong-window/wrong-artifact mandatory records block | `C-AC-04` |
| 6. Standard/normal/emergency/not-required have distinct behavior | `C-AC-02` |
| 7. Status text or unauthenticated actor cannot satisfy Pipeline authority | `C-AC-03`, `C-AC-04` |
| 8. Failure/rollback updates retain the failed attempt | `C-AC-05` |
| 9. Post-deploy external-write failure enters reconciliation | `C-AC-06` |
| 10. Synthetic core; named products only in profiles | `X-AC-12`, `C-AC-11` |
| 11. Advisory/mandatory offline and unavailable behavior is explicit | `C-AC-12` |
| 12. Threat/policy/migration/runbook/recovery docs exist | `C-AC-13` |

Coverage: complete. External change approval and Pipeline human authority are
independently authenticated and composed at the exact promotion boundary; one
never imports the other.

## #30 — Human Governance Decision Ledger

| Live criterion | Phoenix proof obligation |
| --- | --- |
| 1. Every human authority transition records a decision first | `H-AC-01`, `H-AC-12` |
| 2. Mutable state without a valid decision cannot grant authority | `H-AC-02` |
| 3. Full decision lifecycle is reconstructable | `H-AC-03`, `H-AC-05`, `H-AC-06`, `H-AC-11` |
| 4. Decisions bind every policy-required target dimension | `H-AC-04` |
| 5. Cross-repository writes/consumption are rejected | `H-AC-07`, `H-AC-09`, `K-AC-06` |
| 6. Revocation/correction/expiry/supersession append history | `H-AC-06` |
| 7. Interrupted/concurrent append recovers without silent split authority | `K-AC-04`, `K-AC-05`, `K-AC-07` |
| 8. Idempotent duplicate submission cannot duplicate authority | `K-AC-02`, `K-AC-03` |
| 9. Truncation/reorder/change/fork/path/hash failures verify offline | `K-AC-05`, `K-AC-06`, `K-AC-08` |
| 10. Guard/plan/release/deploy/override paths reference decision IDs | `H-AC-12` |
| 11. Unverified legacy material cannot satisfy a current gate | `H-AC-08` |
| 12. Secrets/prompts/transcripts/commands/private paths are excluded | `H-AC-13` |
| 13. #5 renders the timeline without authority | `V-AC-03`, `V-AC-07` |
| 14. #9 bundles verified ledger records/integrity | `P-AC-06`, `P-AC-12` |
| 15. #24 links external and Pipeline decisions without conflation | `C-AC-03` |
| 16. Schema/taxonomy/authority/threat/migration/retention/recovery docs exist | `H-AC-14` |
| 17. Complete decision/failure/privacy fixture set | `H-AC-15` |

Coverage: **complete at the 2026-08-02 implementation audit**. The canonical
ledger, resolver, v3 plan-approval route, `guard-devplan`, and `guard-push`
validate candidate-bound decision references; `guard-push` accepts only a
separately read immutable consumption receipt, never mutable State alone.
Change Control now blocks deploy/release until its exact `APPROVE_DEPLOY`
ledger decision binds the candidate and artifact; Phoenix Git overrides require
and single-consume an exact `OVERRIDE.<rule>` decision bound to the guarded
artifact. The Cyborg-compatible detached PO-proof resolver remains explicit:
a caller-supplied trust policy proves only the detached signature and cannot
upgrade local attribution to human identity. Git and mutable State remain
projections/transport; neither is promoted to historical human authority.

## #31 — Agent Decision and Assumption Journal

| Live criterion | Phoenix proof obligation |
| --- | --- |
| 1. Closed schema/materiality policy selects journaled events | `A-AC-01`, `K-AC-01` |
| 2. Assumption states remain distinct | `A-AC-11`, `K-AC-09` |
| 3. Verification/contradiction/expiry/invalidation/supersession append events | `A-AC-02` |
| 4. Changed assumptions invalidate/revalidate affected work | `A-AC-03` |
| 5. Journal cannot satisfy any authority/evidence gate | `A-AC-16` |
| 6. Human confirmation correlates to #30; only #30 grants authority | `A-AC-04` |
| 7. Runner/model/profile/role/capability carries assurance | `A-AC-05` |
| 8. Prompts/transcripts/reasoning/secrets/private paths/raw output excluded | `A-AC-06` |
| 9. Redaction occurs before local persistence and external projection | `A-AC-06`, `E-AC-15` |
| 10. Mandatory material events are never sampled/discarded silently | `A-AC-07` |
| 11. Retention/access/integrity is independent of human ledger | `A-AC-12` |
| 12. Interrupted/concurrent/duplicate/out-of-order behavior is deterministic | `A-AC-13` |
| 13. Offline verification detects mutation/gaps/forks/path/repository errors | `K-AC-05`, `K-AC-06`, `K-AC-08` |
| 14. #17 replays all origins without authority collapse | `L-AC-04` |
| 15. #5 shows uncertainty/status/decision with evidence | `V-AC-02`, `V-AC-03` |
| 16. Complete assumption/selection/failure/privacy fixture set | `A-AC-14` |
| 17. Schema/taxonomy/materiality/trust/privacy/retention/recovery docs exist | `A-AC-15` |

Coverage: complete. Phoenix records declared, bounded rationale and reason
codes; it explicitly prohibits hidden chain-of-thought capture.

## #32 — Governance Event Export

| Live criterion | Phoenix proof obligation |
| --- | --- |
| 1. Human/agent/lifecycle origin and authority survive export | `K-AC-10`, `E-AC-01` |
| 2. Every export maps one validated source with stable identity/correlation | `E-AC-01` |
| 3. CloudEvents/OTLP/NDJSON/RFC 5424 mappings are deterministic/loss-declared | `E-AC-02` |
| 4. Default export excludes all prohibited/private material | `E-AC-03`, `E-AC-15`, `E-AC-18` |
| 5. Free-form rationale is explicit-policy-only and redacted | `E-AC-04` |
| 6. Sanitization precedes every queue/log/dead-letter/metric/receipt | `E-AC-15` |
| 7. At-least-once/idempotency/order/retry/rate/backpressure/replay/restart tested | `E-AC-06`, `E-AC-16` |
| 8. Duplicate delivery creates no canonical event/authority | `E-AC-17` |
| 9. Partial acceptance advances only acknowledged events | `E-AC-07` |
| 10. Cursor/gap/fork/hash/schema/ack failures are typed | `E-AC-08` |
| 11. Advisory failure preserves canonical operation | `E-AC-09` |
| 12. Required mode blocks only exact named boundary/range | `E-AC-10` |
| 13. Destination/alerts cannot change authority | `E-AC-12` |
| 14. Credentials/endpoints remain outside portable artifacts | `E-AC-18` |
| 15. Multiple destinations are independent | `E-AC-13` |
| 16. Receipts state exact acknowledgement without retention/review claims | `E-AC-11` |
| 17. External event correlates to sources/candidate/evidence/policy/chain | `E-AC-01`, `K-AC-10` |
| 18. #5 shows export lag/failure/receipt state without authority | `E-AC-19` |
| 19. #9 bundles sanitized export-policy/delivery metadata | `E-AC-20` |
| 20. Threat/data-flow/mapping/retention/runbook/recovery docs exist | `E-AC-21` |

Coverage: complete. Delivery is intentionally at-least-once and outbound-only;
an acknowledgement proves only the adapter's declared transport semantics.

## Cross-issue closure rule

The mapping covers all 105 live issue acceptance bullets. It does not claim
that implementation exists. During delivery each mapped Phoenix criterion must
name a test/Verify step and exact candidate evidence. An issue remains open if
any mapped criterion is unimplemented, unverified, dependent on unpublished
sibling work, or deferred without explicit Product Owner disposition,
owner, and expiry.

Current 2026-08-02 audit result: **Phoenix is not closeable yet**. In addition
to the open #30 migration above, the bound Spec §7 inventory omits six already
implemented Phoenix modules and their tests. That inventory correction needs a
candidate-bound human design decision and sanctioned authority revision; it
must not be hand-edited as a documentation-only workaround.
