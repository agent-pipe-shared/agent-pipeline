# Sprint Phoenix — acceptance evidence map and issue reconciliation

Status: measurement

Date: 2026-08-09

Parent specification: [../spec.md](../spec.md) · Acceptance matrix: [../acceptance.md](../acceptance.md)

## What this document is

One durable record answering two questions the Product Owner asked together: what evidence
exists for each of the 157 Phoenix acceptance criteria, and what remains open when those
verdicts are reconciled against the 105 live acceptance bullets of the eight open
`sprint:phoenix` issues.

It supersedes `acceptance-evidence-map-20260805.md` as the current measurement. It is generated
by its own generator, `acceptance-evidence-map.mjs` in this directory, which carries the verdict
map, the evidence pointers and
the bullet-to-criterion map as auditable data rather than prose — regenerate it after any
re-measurement instead of hand-editing this file.

**Candidate.** Measured at `de69756` on `sprint_phoenix`. The gate evidence belongs to `3387065`
(`evidence/verify-latest.json`: `exitCode 0`, `status passed`, 368 registered suites, 368
terminal receipts, `binding: "exact"`, tree clean at start and finish); the two commits between
that candidate and the measured HEAD touch `docs/` and `backlog/` only, so no product surface
moved. Security: `pipeline.security-verdict.v2`, `blocking: false`, `cap.sast` pass,
`cap.secrets` pass.

**Evidence base.** Four read-only measurements, each dispatched to a fresh context and each
adjudicating from the tree rather than from the handover:

| tag | measurement | scope |
|---|---|---|
| C | `PHX-COVERAGE`, 2026-08-08 | all 157 criteria, first full pass |
| J | `PHX-ADJ2`, 2026-08-08 | the ten criteria the first pass could not adjudicate |
| A | `PHX-FIN-A`, 2026-08-09 | the 13 PX0/P criteria moved by later product commits |
| B | `PHX-FIN-B`, 2026-08-09 | the 10 A/H/EPIC criteria moved by later product commits |

The `A` and `B` runs re-measured, and did not inherit, every row they touched. Their run output
lives under `evidence/` and is git-ignored by QG-03, which is why the operative content is
reproduced here rather than referenced.

## The direct answer

**Phoenix cannot claim complete.** 134 of 157 criteria carry a named assertion in a
gate-registered suite; 23 do not. EPIC-AC-05 forbids a completion claim while any
criterion remains unimplemented or unverified, and it currently bites. No issue is closeable on
its own live acceptance bullets.

The shape of the remainder has not changed since the first pass and is worth stating plainly:
Phoenix built the libraries and left the integration. Most non-implemented rows are not absent
features but unpinned sub-clauses of features that exist — and a smaller, harder set is the
seams between packages that are each individually implemented and mutually unaware.

Closure rule applied verbatim from `specs/sprint-phoenix-epic/design/issue-coverage.md:201-204`:
an issue remains open if any mapped criterion is unimplemented, unverified, dependent on
unpublished sibling work, or deferred without explicit PO disposition, owner and expiry.
A bullet is therefore BLOCKED unless every criterion mapped to it is `implemented`.

## Criterion verdict totals

| verdict | count |
|---|---|
| implemented | 134 |
| partial | 19 |
| designed-only | 0 |
| not-started | 3 |
| constraint | 1 |
| **total** | **157** |

## Per criterion — verdict and evidence

`src`: **C** = the 2026-08-08 baseline measurement, **J** = its ten-row adjudication follow-up,
**A**/**B** = the 2026-08-09 delta re-measurement. For `implemented`, the pointer names the
gate-registered suite that pins the operative clause; for every other verdict it names the exact
clause that is not pinned or not built.

### PX0 — Lifecycle-authority revision and runner-neutral ruleset source (15/17 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| PX0-AC-01 | implemented | WP-PX0 | pipeline-state-tests AR01a-d (PHX-WP-PX0, break-proofed, TP-5 window): a generic continuity-cas rewriting authority.prd or authority.spec is refused (CS-PROTECTED-AUTHORITY), zero mutation, both proved |
| PX0-AC-02 | implemented | A | continuity-authority-revision-plan emits the closed request; pinned in pipeline-state.test.mjs (registered) |
| PX0-AC-03 | implemented | ELEPHANT | pipeline-state-tests AR03a-i (PHX-WP-PX0 + DELTA-0811 2026-08-11): apply rechecks the next-authority artifact (AR03c), its own fresh State preimage (AR03e-g), and now the active-feature decision-scope axis (AR03h/i, a real plan-approval fixture) -- all five recheck axes pinned, all under the continuity writer lock. 504/504 pipeline-state-tests pass (independently re-run). CLOSES 2026-08-11: independent first-pass Critic review returned PASS, no findings (specs/sprint-phoenix-epic/evidence/px0-ac0305-06-critic-review-d827c1b3.md) |
| PX0-AC-04 | implemented | WP-PX0 | pipeline-state-tests AR04a-i (PHX-WP-PX0, measurement correction -- already fully covered pre-dispatch): feature/revision/prestate/old-and-next-authority/expiry/candidate/decision-scope/idempotency-reuse all pinned; no new test needed |
| PX0-AC-05 | partial | DELTA-0811 | pipeline-state-tests AR05a-f (PHX-WP-PX0 + DELTA-0811 2026-08-11): RETRACTS the prior CONFIRMED-ABSENT finding -- authorityRevisionReceipts (correlated by intentSha256, no absolute path/root/machine identifier) is now durably retained in State on both a fresh apply (AR05d) and a completed-forward recovery (AR05f), independently re-run and confirmed passing. Narrower than full retention: pinned immediately after the write, not across a later unrelated State write (the field sits outside continuity-state.mjs's own validated shape by design). CORRECTED 2026-08-11 (independent first-pass Critic FAIL, verified independently before acting -- specs/sprint-phoenix-epic/evidence/px0-ac0305-06-critic-review-d827c1b3.md): the receipt's POSITIVE half (retention/correlation) is genuinely implemented, but its NEGATIVE half -- "SHALL NOT persist raw commands, private paths, prompts, user/account data, or private machine identifiers" -- has NO enforcing code path. decision.id (authority-revision-proof.mjs:19) is checked only as typeof === "string", unlike its sibling featureId/idempotencyKey (both ID-regex-checked), and flows verbatim into the durably-retained, git-tracked receipt (pipeline-state.mjs:3398, :3424-3429). AR05b's "no banned needle" test only proves the implementation injects no path of its OWN; no case supplies private content through the caller-controlled decision.id field. Fix dispatched same night: PHX-WP-PX0AC05-DECISIONID (goldfish-deep). UPDATE 2026-08-11: fix landed (commit 022718b0) -- decision.id now enforces the same bounded ID slug pattern (/^[a-z][a-z0-9-]{0,63}$/u) already used for sibling featureId/idempotencyKey; every existing decision.id fixture in the repo was already slug-shaped, so no real caller is affected. Genuine reproduce-first evidence: 3/6 new unit cases failed red against the unfixed module (private-path/whitespace/length-boundary rejections all missing), 6/6 green after. Independently re-verified by the Elephant (not accepted from the dispatch report): read the source diff directly (exactly the one-line !ID.test(decision.id) addition claimed), re-ran both suites myself -- 6/6 authority-revision-proof-tests, 504/504 pipeline-state-tests, no regression. One DoD item explicitly NOT done, not silently dropped: the planned end-to-end AR05g case in pipeline-state.test.mjs is blocked by TP-5 (guard-testpath has no task-type distinction; only a signed human-guard-override can lift it, which a Goldfish must not attempt) -- the exact drafted case is recorded in PHX-WP-PX0AC05-DECISIONID.dispatch-record.json's blocked-scope-item entry, ready for whenever a TP-5 window is next open. UPDATE 2026-08-12: the TP-5 window opened (PO-signed) and PHX-WP-PX0AC05-AR05G landed the drafted AR05g case exactly as specified -- decision.id crafted as an absolute path is refused closed (AR-INTENT-INVALID), State left byte-for-byte unchanged, 506/506 full suite, zero regressions. (Content verified tree-correct; a concurrent-dispatch commit-attribution race swapped this commit's message/trailer with a different dispatch's -- disclosed, content-safe, see docs/state.md's 2026-08-12 checkpoint, not a gap in the test itself.) Verdict stays partial: the fix and now both the unit AND end-to-end regression tests are verified, but a fresh independent Critic re-review of this exact candidate does not exist yet -- the one remaining, agent-dispatchable next step. UPDATE 2026-08-12: that Critic re-review ran (opus-tier, corrected after a first round self-failed on a dispatch-model-tier mistake, not a code issue) -- FAIL, but explicitly not on the decision.id fix itself ("I found no code defect... A pass cannot issue over a hard-rule violation that is still present in the repository's history"); its own independent probe of the ID regex against private-path/null-byte/case/Unicode/length-boundary inputs found no bypass either. Both findings are about the 979e579c/ad5a537e commit-attribution swap (already disclosed above) and 979e579c's still-missing trailer -- not about whether the security fix works. Verdict stays partial: a FAIL is a FAIL regardless of which half concerns code vs. provenance. The remaining path is PO-only: the prepared git commit-tree fix (6c889079/cd38619e, docs/state.md 2026-08-12) needs the PO's own terminal or a GG-07 double-confirmation override, then a delta Critic re-review |
| PX0-AC-06 | implemented | ELEPHANT | pipeline-state-tests AR06a-i (PHX-WP-PX0 + DELTA-0811 + PHX-WP-PX0-CASOUTCOME + PHX-WP-PX0-V1JOURNAL-TESTS, all landed 2026-08-11 under the signed TP-5 window): RETRACTS the prior CONFIRMED-ABSENT finding -- recovered-preimage now exists alongside recovered-postimage/clean/diverged, gated by one fresh under-lock expiry recheck (AR06e/f). STALE-NOTE CORRECTED 2026-08-11: the "fix sits uncommitted" / "no test pins the bug" residual this note previously named is CLOSED -- AR06g (commit 433e73db) now asserts the recovered-preimage branch echoes receipt.casOutcome "stale", not the frozen "applied" (Critic round-2 F1, fixed). The separately-named F4 (zero .v1 legacy-journal regression coverage) is ALSO closed -- AR06h/AR06i (commit 0d9f3690) cover a genuine hand-rewritten .v1-shaped journal (loads via expiresAt:null, completes recovery) and its fail-closed contrast (missing receipt, refused AR-JOURNAL). 504/504 pipeline-state-tests pass (independently re-run, 2026-08-11, same run that verified the unrelated PHX-WP-PAC08-LOCK-REENTRANCY delta). No known residual gap remains in this criterion's own test coverage. CLOSES 2026-08-11: independent first-pass Critic review returned PASS (specs/sprint-phoenix-epic/evidence/px0-ac0305-06-critic-review-d827c1b3.md) with two disclosed MINOR, non-blocking findings that don't defeat the mechanism: (1) the zero-write replay branch in runAuthorityRevisionApplyCommand is checked before the pending-journal check, so a retry after an interrupted-but-State-written transaction reports "replayed" without surfacing the still-retained journal (fails closed eventually via AR-JOURNAL-CONFLICT on a later unrelated revision, just not on this exact retry); (2) the legacy .v1 journal sentinel (expiresAt: null) skips the expiry recheck unconditionally, undated but bounded to the single superseded in-sprint build that could have left one. Both filed for follow-up, not fixed tonight -- neither is security-relevant the way PX0-AC-05's finding is |
| PX0-AC-07 | implemented | WP-PX0 | pipeline-state-tests AR07a-b (PHX-WP-PX0, measurement correction -- already fully covered pre-dispatch): exact zero-write replay (AR07a) and a second/conflicting writer failing closed with State preserved (AR07b) both pinned, reinforced incidentally by the new AR03e-g |
| PX0-AC-08 | implemented | WP-PX0AC08 | pipeline-start-preflight-tests (PHX-WP-PX0AC08, break-proofed): observePipelineStartPreflight emits a closed rulesetSource observation on every bootstrap run that resolves a loaded distribution -- real content-hash identity for self-application/dev-checkout, honest {status:"unavailable"} elsewhere, both validated against ruleset-source.mjs's own closed schema |
| PX0-AC-09 | implemented | A | bootstrap-source-attestation-acceptance-tests (verify.mjs:333) — Codex-only marketplace resolution |
| PX0-AC-10 | implemented | A | bootstrap-source-attestation-acceptance-tests — pre-HEAD consumer compares loaded plugin identity |
| PX0-AC-11 | implemented | A | bootstrap-source-attestation-acceptance-tests — one common closed contract across the four source classes |
| PX0-AC-12 | implemented | C | ruleset-source-tests: source/loaded/installed/mismatch/remote unavailable each typed distinctly |
| PX0-AC-13 | partial | DELTA-0811 | pipeline-start-preflight-tests + ruleset-freshness-tests (PHX-WP-PX0AC13-TESTS, 7dffa72e + DELTA-0811 2026-08-11 independent re-run): createWslHostAttestedSpawn/executionBoundary's WSL host-transport gate is now exercised end-to-end through the real call path -- 36/36 and 16/16 pass, exit 0 both. CORRECTED 2026-08-11 (independent first-pass Critic FAIL, verified independently before accepting -- specs/sprint-phoenix-epic/evidence/px0-ac13-critic-review-d2743353.md): "code and tests are complete" was wrong, not merely unreviewed. createWslHostAttestedSpawn (ruleset-freshness.mjs:848-867) does NOT delegate to any genuine host-side process -- the "attested" branch still spawns git in the calling process's OWN sandbox via the same local spawn primitive, only with a sterile env swap; the function's own comment (:882-889) admits its boundary check is a duplicated copy of the real preflight decision, never consumed from it. In the exact situation the criterion governs (Codex+WSL sandbox), the doomed ls-remote is still issued and its failure is indistinguishable from an ordinary remote outage (F1, F4, both verified independently by reading the source directly). Design doc's own mandated harness/session-bootstrap.md:159 update was never made -- the file contains no occurrence of "WSL" at all (F2). The CLI-side boundary copy has zero discriminating test coverage; deleting its runner check leaves all 52 supplied assertions green (F3). Two further minor findings (F5 PATH-resolved attestation binary vs. literal-path payload asymmetry; F6 a dropped GIT_ALTERNATE_OBJECT_DIRECTORIES causing a latency regression, not a correctness one). Genuinely substantial remaining work, not a quick fix -- correctly NOT dispatched same night given its architectural scope; left as the clear, accurately-scoped next item rather than rushed. F2 CLOSED 2026-08-11 (commit 2a1a0903): the design-mandated harness/session-bootstrap.md:159 sentence now correctly scopes the instruction to Codex+WSL only. FORMAL PO DECISION POINT recorded 2026-08-11, not just "left open": F1/F3 checked directly against the codebase before deferring -- the genuine mechanism this criterion needs (selectHostTransport/observeThroughSelectedHost, ruleset-freshness.mjs:504-557) requires a caller-supplied hostTransport.execute function that actually crosses the sandbox boundary and returns a specific cryptographically-bound receipt; NO such function exists anywhere in this codebase to wire createWslHostAttestedSpawn into. The question this criterion cannot close without an answer to: does building that cross-boundary executor belong in this Node process at all, or is the F2 doc-level instruction (an agent/runner choosing a different execution TOOL TIER, e.g. a Codex host-tier tool call instead of its sandboxed one) the actually-intended mechanism, making createWslHostAttestedSpawn's whole in-process-attestation approach a structurally wrong answer to a question the RUNNER, not the script, is meant to answer? Resolving this needs a PO/design decision on which shape is intended BEFORE any further code -- the same category of blocker this session already formally recorded for K-AC-05/O-1/O-2 (PO-gated design questions) and H-AC-09 (Class S -> Class P, PO-confirmed 2026-08-09). PO ANSWERED 2026-08-11 (AskUserQuestion): build genuine host delegation. Dispatched as PHX-WP-PX0AC13-HOSTDELEGATION, investigation-first; it returned "no in-process mechanism can exist" -- createWslHostAttestedSpawn's attestation was always fake (verifies an App-Server health check, then spawns git in the SAME sandbox with only a sterile env swap), and every executionBoundary consumer in the codebase treats it as a label for an external actor to act on, never something in-process code consumes to cross a sandbox -- confirmed against ruleset-freshness-host.mjs's own header comment and docs/phoenix-governance-threat-model.md:53-57, both stating this as an explicit operating contract, not an inferred gap. PO answered the tight follow-up 2026-08-11: remove the fake attestation, trust the doc instruction. Dispatched as PHX-WP-PX0AC13-REMOVEATTESTATION to delete createWslHostAttestedSpawn and reuse the existing selectHostTransport/host-transport-required refusal path -- it ALSO self-stopped without any edit (2026-08-12), on two further findings: (1) runPipelineUpdateAvailabilityCli, what the CLI actually calls, is never connected to observePublicRemoteIdentity, the one function owning the selectHostTransport machinery -- confirmed via the run()/git() helpers at ruleset-freshness.mjs:42-50, which consult only options.spawn; these are two disconnected subsystems, not one path with a missing wire; (2) even granting that connection, no legitimate value for the schema-required expectedControlIdentitySha256 field is reachable from inside the sandboxed CLI process -- its only real producer needs a live observeCodexAppServer daemon observation made from OUTSIDE the sandbox (ruleset-freshness-host.mjs:72-96), so supplying anything else would recreate the exact fake-attestation defect being removed. PX0-AC-13 now has a THIRD open decision point: (a) redesign inspectPipelineUpdateAvailability's two network call sites to genuinely thread a host transport through, which first needs the preflight step to supply a real expectedControlIdentitySha256 -- actual new implementation work; (b) delete createWslHostAttestedSpawn and let the host-authorized-wsl boundary fail closed via a plain no-network-attempt path, no typed host-transport-required reason since that machinery is not reachable from here -- removes the misleading code, satisfies clause 2 more crudely but honestly, leaves clause 1 open; (c) reconsider whether clause 1 is achievable for this CLI at all today, i.e. an acceptance.md amendment/rescoping, the same route already used for other structurally-unsatisfiable clauses in this epic (e.g. H-AC-11's GMW no-join-handle clause). Presented to the PO with a recommendation. PO ANSWERED 2026-08-12: (b)+(c). RESOLVED same session: PHX-WP-PX0AC13-FAILCLOSED removed createWslHostAttestedSpawn and its constants, replacing them with an honestly-named createWslHostFailClosedSpawn -- network-delegated calls under host-authorized-wsl now always refuse without ever attempting to spawn (clause 2 satisfied honestly), local calls unchanged; ruleset-freshness.test.mjs 15/15 pass, zero regressions. acceptance.md amended (commit 7fa07d54) with the conditional H-AC-11-style form: clause 1 stays unsatisfied, not as a proved impossibility but as an already-designed, unbuilt path (design/codex-wsl-freshness-host-action-family.md, 2026-08-08, never implemented -- its own open §13 PO question is the actual remaining blocker, tracked in backlog/items/2026-08-07-ruleset-freshness-wsl-subsystem-absent.md, not invented fresh here). Verdict stays partial: clause 1 genuinely open, not resolvable by more autonomous dispatch work without that design's own PO question answered first. UPDATE 2026-08-17 (PHX-WP-POAMEND, commit e9054995): clause 1's disposition upgraded from "designed but unbuilt" to structurally unreachable in-process -- runPipelineUpdateAvailabilityCli never supplies networkPreflight/hostTransport into inspectPipelineUpdateAvailability (confirmed: ruleset-freshness.mjs:843-864 threads only options.spawn; selectHostTransport(undefined, undefined) returns null), and no legitimate expectedControlIdentitySha256 is reachable from inside the sandboxed CLI process -- only a live observeCodexAppServer daemon observation produces one, independently re-verified against current source. Does not close clause 1: satisfying it still needs the out-of-process host adapter design/codex-wsl-freshness-host-action-family.md designs; the upgrade settles the disposition, not the exit |
| PX0-AC-14 | implemented | C | ruleset-source-tests: private-coordinate-rejected, private-remote-rejected |
| PX0-AC-15 | implemented | C | ruleset-source-tests: private-classification-preserved, local-classification-preserved |
| PX0-AC-16 | implemented | A | bootstrap-source-attestation-acceptance-tests — equality bound to exact loaded and observed public remote identity |
| PX0-AC-17 | implemented | A | bootstrap-source-attestation-acceptance-tests — unknown keys, ambiguous selectors, more than one selected plugin all fail closed |

### K — Governance event kernel (10/10 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| K-AC-01 | implemented | C | governance-event-core/store-tests: closed envelope, origin payload, physical target, policy, size limits |
| K-AC-02 | implemented | C | governance-event-store-tests: exact idempotency is a zero-write replay |
| K-AC-03 | implemented | C | same assertion, conflicting-key half |
| K-AC-04 | implemented | C | governance-event-store-tests: canonical bytes, readback checkpoint, source-last head, RFC 8785 canonicalization |
| K-AC-05 | implemented | WP-K-AC05 | governance-event-store/po-human-approval/po-approval-gate-tests (ADR-0063, WP-K-AC05-REDESIGN + 2 reworks + F1F2FIX, 2026-08-10): fork disposition now requires a verified PO approval proof -- no longer self-mintable, the blocker the prior Critic named. Reachable through the sanctioned CLI (governance-event.mjs dispose; po-human-approval.mjs/po-approval-gate.mjs prepare-/approve-/verify-fork-disposition). The read path re-verifies acknowledgedEventIds and the approved subject against the fork as it stands now, not only at write time; binds sorted CONTENT digests, not eventId; checks symlink ancestry on read too. The compensating/superseding-record question is a named, dated, owned residual in ADR-0063, not an undated comment. Mode (signature/chat) governed by the existing gates.push_approval. Independent Opus-routed Critic: fresh 4-round cap, PASS on round 4 (final) -- one major finding scoped explicitly outside this mechanism (a pre-existing gap in the SHARED push/deploy/publication signing-confirmation ceremony, filed separately as its own backlog defect) and two minors fixed directly. 52/52 tests pass |
| K-AC-06 | implemented | C | governance-event-store-tests: checkpoint-aware verification; symlink and cross-repository rejection |
| K-AC-07 | implemented | C | governance-event-store-tests: projection recovery requires a retained checkpoint |
| K-AC-08 | implemented | WP-K | governance-event-store-tests: governance-event-store.mjs:673 (GES-CHECKPOINT) rejects a head/index checkpoint asserting an absent or digest-mismatched canonical record, for both verify and query (PHX-WP-K, break-proofed) |
| K-AC-09 | implemented | C | governance-event-core-tests: six exact typed absence states preserved |
| K-AC-10 | implemented | WP-K-AC10 | governance-event-store-tests (PHX-WP-K-AC10): queryPortableGovernanceStreams queries the human/agent/lifecycle streams in one call, keyed by streamId, proven to return exactly what the singular query would for each stream (origin/authorityClass/timeAssurance per event, integrity/completeness per stream) unflattened |

### H — Human Governance Decision Ledger (#30) (11/15 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| H-AC-01 | implemented | C | human-governance-ledger-tests: closed portable grant, single-use consumption under the canonical stream lock |
| H-AC-02 | implemented | C | governance-authority-resolver-tests + guard-push consumption receipt |
| H-AC-03 | implemented | C | human-governance-ledger-tests: one event-specific link and outcome per authority disposition |
| H-AC-04 | implemented | C | human-governance-ledger-tests: repository/candidate drift, expiry, consuming disposition all fail closed |
| H-AC-05 | implemented | C | human-governance-ledger-tests: detached proof verified without upgrading to human identity; no attribution field admitted |
| H-AC-06 | implemented | C | human-governance-ledger-tests: append-only consumption disposition; restricted-store erasure pinned separately |
| H-AC-07 | implemented | C | human-governance-ledger-tests: cross-repository decision rejected before mutation |
| H-AC-08 | partial | WP-HAC08 | agent-decision-journal-tests (PHX-WP-HAC08): a third, independent event kind `legacy-import-observation` (closed legacySourceClass/authorityProofStatus/sourceReference shape, non-authoritative by construction via the existing origin==="agent" binding) is now representable, drift-tested. Still no production caller: CONFIRMED ABSENT (repo-wide search) that any code path imports/migrates a legacy record at all |
| H-AC-09 | not-started | J | NO CARRIER: external-push-ledger is scoped to single-repo push proofs; nothing binds cross-repository guarded work to one physical target. RECLASSIFIED Class S -> Class P 2026-08-09 (PO-confirmed): the clause's own subject -- authorizing guarded work IN another repository -- is exactly the capability CLAUDE.md's Sprint-0 hard rule currently forbids outright ("Read-only toward the three project repos ... never a write ... until an explicitly approved Phase-4 migration"). There is no design to scope: building a cross-repository binding mechanism for a write capability this repo is not yet authorized to exercise would be building ahead of its own governing policy, not closing a gap. Closes only if/when a Phase-4 migration lifts the restriction, or the PO narrows the clause's scope by amendment (the same route H-AC-11 already used) -- either way, not a code task available now |
| H-AC-10 | implemented | C | five named assertions covering scope, reason, expiry, constraints, follow-up review, no standing bypass |
| H-AC-11 | partial | C | portable reconstruction surface pinned; the no-join-handle clause is proved UNSATISFIABLE for the GMW half (acceptance.md amendment, tracked as O-4). UPDATE 2026-08-17 (PHX-WP-POAMEND, commit e9054995): O-4 decided by acceptance.md amendment -- the clause is scoped to the restricted machine-local decision record (design/gmw-hgo-evidence-intake-into-the-human-ledger.md §3.4), not a producer's own enforcement material, which this intake path never creates. Verdict STAYS partial: the restricted profile is structurally separate and tested (GES-RESTRICTED-ROOT/-IN-REPOSITORY/-KEY, agent-decision-journal.test.mjs:422-426), but no intake path yet produces such a record at all -- design §9 places that in a later increment (D-1), not built here |
| H-AC-12 | partial | WP-H-AC12 | guard-devplan/change-control-tests (WP-H-AC12): the shared dual-evaluation primitive (decision-reference-dual-evaluation.mjs) closes guard-devplan.mjs and change-control.mjs. Release planning and deploy/override consumption: PO decided 2026-08-11 the existing alternate mechanisms (release-version-plan.mjs content-hash decisionId; critical-action-authorization.mjs Ed25519 proof) satisfy intent. UPDATE 2026-08-17 (PHX-WP-POAMEND, commit e9054995): that decision now landed as an acceptance.md amendment, closing release planning and deploy approval/consumption specifically -- 2 of 6 named readers. Verdict STAYS partial: guard-push.mjs, pipeline-state.mjs (TP-5/GMW-blocked), and Git-guard override consumption (guard-git.mjs Phoenix override -- read, not yet verified/dispositioned) remain open, unaffected by this amendment; the migration dual-evaluation/shared-owner/expiry sentence is also untouched. 40/40 + 33/33 + 10/10 + 3/3 tests pass |
| H-AC-13 | implemented | C | human-governance-ledger-tests + store admission: prohibited content rejected before any temporary file exists |
| H-AC-14 | implemented | WP-DOC | docs/governance-events.md (PHX-WP-DOC-1 + PHX-WP-DOC-3): all eight named parts present -- migration/retention/recovery/operator-guidance and schema/taxonomy/authority-trust-model were already solid, and a dedicated "Human ledger: threat model" section now covers eight scenarios each tied to an HGL-* code and, where one exists, an H-AC-15 test |
| H-AC-15 | implemented | WP-H | human-governance-ledger-tests (PHX-WP-H): all thirteen named scenarios pinned (grant/consumption/expiry/redaction pre-existing; denial/revocation/correction/retry/concurrency/interruption/tampering/stale-candidate/cross-repository-binding new and break-proofed) |

### A — Agent Decision and Assumption Journal (#31) (11/16 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| A-AC-01 | partial | C | record shape pinned; nothing enforces recording BEFORE dependent action where policy requires |
| A-AC-02 | implemented | WP-A | agent-decision-journal-tests (PHX-WP-A): all five lifecycle transitions (verified/contradicted/expired/invalidated/superseded) accept a linked follow-up event, exercised end-to-end through the store with the original proven byte-for-byte unchanged |
| A-AC-03 | not-started | STALE4 | reconfirmed 2026-08-11: NO CARRIER: no revalidation/invalidation path identifies objects affected by a changed assumption (direct grep of "A-AC-03" and "material assumption"/"invalidat*"/"revalidat*" across plugins/pipeline-core/{lib,scripts} finds nothing beyond unrelated Cyborg control-waiver revalidationTrigger fields; agent-decision-journal.mjs validates event shape only, no cascade logic) |
| A-AC-04 | implemented | WP-AAC04FIX3 | CORRECTED AGAIN 2026-08-09 (Elephant, direct code read): a second, real, production-wired carrier exists that the first correction missed -- guard-git.mjs's Phoenix override path (consumePhoenixOverrideAuthority, guard-git.mjs:697-728) correlates an agent's override reference to the real human ledger via governance-authority.mjs, binds it to the exact repository/candidate/rule/artifact-digest tuple, and single-use-consumes it; guard-git-phoenix.test.mjs proves refuse-without-reference, one-time-allow, and refuse-on-replay end to end (1/1, independently re-run). The correlate-and-cannot-replay half of the clause is proven, not absent. What is still missing, narrowly: no production entry point ever CREATES a granted human-governance-decision -- appendHumanGovernanceDecision, createExternalHumanGovernanceIntent and verifyExternalHumanGovernanceProof (human-governance-ledger.mjs:150,73,101) are each called only from tests (repo-wide grep confirms), so a PO has no CLI to actually grant this authority today; governance-authority.mjs's own CLI only ever consumes an existing grant, never creates one. See design/class-s-scoping.md's 2026-08-09 correction for the exact three-function wiring this needs -- no new schema or cryptography, the trust anchor at project/critical-human-proof.json already covers the same PO key. CLOSED 2026-08-09 (PHX-WP-AAC04-FIX3, commit 0022d13): the missing create-half was built (human-authority-grant.mjs, a prepare/external-sign/install ceremony), survived an independent round-3 Critic PASS after two prior FAIL rounds closed a blocker, a major, and five other findings, and its final three minor findings (a docstring overclaim, runPrepare reading the wrong root, missing command/exit-code evidence headers) are also closed and independently re-verified (14/14 unit, 1/1 e2e, 25/25 regression). Both halves of the clause are now real, tested, and production-wired |
| A-AC-05 | partial | WP-AAC05 | agent-decision-journal-tests (PHX-WP-AAC05): the observational shape now carries an optional identity array (dimension/value/provenance/assurance, closed enums, 1-7 entries, no duplicate dimension) on selection/escalation/fallback only, rejected elsewhere via ADJ-IDENTITY-SCOPE, schema/validator drift-tested. Still no production caller: CONFIRMED ABSENT (repo-wide search) that any code path emits a selection/escalation/fallback event at all |
| A-AC-06 | implemented | C | agent-decision-journal-tests: free text, authority-shaped fields and unbound supersession rejected |
| A-AC-07 | implemented | WP-A-AC07 | agent-decision-journal/governance-event-store-tests (WP-A-AC07): all seven named event classes now recognized through existing fields/kinds, no new kind needed; capture-policy.json carries an additive mandatoryEventClasses list; appendPortableGovernanceEvent fails closed (GES-MANDATORY-CAPTURE) rather than silently sampling out a mandatory class, scoped to the policy-selected agent origin only. 38/38 + 28/28 tests pass |
| A-AC-08 | implemented | WP-A-AC08 | NO CARRIER: no detector for missing dispatch provenance; the Dispatch: trailer is convention only |
| A-AC-09 | partial | STALE4 | RETRACTS "no code enforces or measures it" -- governance-event-store.mjs's captureDecision:"sampled-out" path (assertMandatoryCaptureNotSkipped, landed 2026-08-10 commit 90283a0c for A-AC-07, never credited here) lets a caller avoid durably persisting a non-mandatory agent-origin event -- exactly the "avoid producing... telemetry" behavior for non-material activity this criterion names. Tested: governance-event-store.test.mjs "A-AC-07 a mandatory event class cannot be silently sampled out, while a non-mandatory class still can" and "...only the policy-selected agent stream may ever be sampled out" (both pass). Partial only: nothing computes "routine/low-impact" itself (the caller decides captureDecision), and no independent Critic PASS exists for this candidate |
| A-AC-10 | partial | C | the offer path fails closed on unavailable journaling; no per-event-class fail-open/fail-closed policy exists |
| A-AC-11 | implemented | B | agent-decision-event.schema.json:14 assumptionState enumerates exactly the seven required epistemic states (landed 5d0fc6a) |
| A-AC-12 | implemented | WP-A2 | agent-decision-journal-tests (PHX-WP-A + PHX-WP-A2): downstream export/projection policy is independently configurable from capture eligibility and structurally cannot weaken it; the portable path fails closed for any narrower-than-repository-public-safe stream, and the restricted profile is confirmed owner-authenticated and outside the repository |
| A-AC-13 | implemented | WP-A2 | agent-decision-journal-tests (PHX-WP-A + PHX-WP-A2): the duplicate-submission clause is pinned, and agent-kind fixtures now mirror the generic store's interrupted/concurrent/out-of-order guarantees directly rather than relying on them by implication |
| A-AC-14 | implemented | WP-A-AC14 | 12 of 13 named conformance scenarios now have dedicated coverage (PHX-WP-A + PHX-WP-A2 + PHX-WP-A-AC14): "tampering" now proven via GES-EVENT-INVALID on a digest-stale agent-kind fixture; "decomposition" is confirmed not representable in the current `kind` enum. CLOSES 2026-08-17 (PHX-WP-POAMEND, acceptance.md amended, commit e9054995): PO accepts 12/13 as the closed scope -- a scope narrowing, not a claim the 13th scenario does not matter; a later package wanting decomposition coverage must add its own enum value and tests |
| A-AC-15 | implemented | WP-DOC | docs/agent-decision-journal.md (PHX-WP-DOC-1 + PHX-WP-DOC-3): all eight named parts present -- taxonomy/materiality/trust/retention/recovery/operator docs, plus Schema (grounded in agent-decision-event.schema.json) and Privacy threat model (grounded in the R-AC-05 test and assertPortablePayload) closing the two the original briefing accidentally omitted |
| A-AC-16 | implemented | C | agent-decision-journal-tests: a journal event cannot present as approval |

### L — Lifecycle stream and replay (#17) (7/8 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| L-AC-01 | partial | C | the closed lifecycle schema and validator are pinned. PHX-WP-LAC01 (2026-08-17, commit fd57d390): first real producer landed -- continuity-cas now builds a validated control/execution-exchange admission and durably persists a schema-valid dispatch-kind lifecycle event via a new pure translator (control-execution-lifecycle-event.mjs), opt-in and byte-for-byte backward compatible when unused. Independently re-verified: unit tests, the new call-site suite, and the gated harness/scripts/pipeline-state.test.mjs regression (506/506) all green; e2e evidence re-run confirms a real event on disk revalidates. 1 of 9 named kinds now has a real producer (dispatch); status/cancellation/candidate-invalidation/verification/review/gate/recovery/reconciliation remain unproduced -- candidate-invalidation recommended next, the translator already refuses invalidated exchanges by name |
| L-AC-02 | implemented | WP-L-AC02 | lifecycle-governance-events-tests + governance-replay-view-tests (PHX-WP-L-AC02): all eight #10 exchange identities are now retained -- queueRevision and correlationId close the correlation shape from 4 to 6 keys, updated in both the primary validator and its redundant replay-side re-validator together |
| L-AC-03 | implemented | C | lifecycle-governance-events-tests: registered namespace only, no credential-carrying namespace, no opaque digest |
| L-AC-04 | implemented | WP-L-AC04 | governance-replay-view-tests (PHX-WP-L-AC04): the 9 verified lifecycle kinds now render with one of four distinct value-record-<class> CSS classes (human/agent/deterministic/runner-observed) instead of the shared "fact" default, proven by per-class tests plus a cross-class distinctness assertion within one rendered view |
| L-AC-05 | implemented | C | lifecycle-governance-events-tests: candidate invalidation visible, duplicate sequences fail closed |
| L-AC-06 | implemented | C | replay rejects extra event data instead of exposing raw lifecycle bodies |
| L-AC-07 | implemented | WP-L | governance-replay-core-tests: serial/parallel/retry/cancellation/recovery fixtures replay to identical bounded output on repeat, and a malicious duplicate-sequence fixture is rejected deterministically (PHX-WP-L, break-proofed twice) |
| L-AC-08 | implemented | J | docs/governance-replay.md "Traceability" (PHX-WP-DOC-3): 8 of 9 lifecycle-governance-events.mjs kinds traced to a stated user/audit need; the `cancellation` kind is honestly flagged unclear -- no structural distinction from `status: "cancelled"` exists in the code, so no confident justification could be constructed. CLOSES 2026-08-17 (PHX-WP-LAC08, commit 20014aab): `cancellation` removed from both hand-duplicated KINDS sets (lifecycle-governance-events.mjs, governance-replay-view.mjs) and the renderer's KIND_RECORD_CLASS map -- the remaining 8 kinds are each traced to a stated need in docs/governance-replay.md, none justified only by parity. One residual duplicate found and left out of scope: governance/schemas/lifecycle-governance-event.schema.json:11 still enumerates `cancellation` in its published kind enum (a third hand-duplicated copy, nothing reads it today) -- filed as its own backlog item, not silently dropped |

### P — Policy packs and signed audit bundles (#9) (10/13 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| P-AC-01 | implemented | WP-P-AC01-AC03 | organization-policy-tests (WP-P-AC01-AC03): schema/compatibility/merge pinned, AND provenance/dependencies/signaturePolicy now validated as optional, pack-scoped, closed fields (OPP-PROVENANCE/OPP-DEPENDENCIES/OPP-SIGNATURE), mirroring the targetBinding precedent. 17/17 tests pass |
| P-AC-02 | implemented | C | organization-policy-tests: floor weakening, unknown rule, single-owner conflict all rejected |
| P-AC-03 | implemented | WP-P-AC01-AC03 | organization-policy-activation-tests (WP-P-AC01-AC03): planOrganizationPolicyActivation now computes newlyRequiredArtifacts/externalEffects/backfillRange deterministically from the transition, never caller-supplied; assertPlan fails closed on a tampered preview (OPA-PREVIEW). 4/4 tests pass |
| P-AC-04 | implemented | C | organization-policy-activation-tests: activation only after a bound authority readback; stale plan preimage rejected |
| P-AC-05 | implemented | C | organization-policy-tests: credential, endpoint, coordinate, actor-mapping and signing-key fields refused at every level |
| P-AC-06 | partial | WP-P | audit-bundle-core-tests: missing, misplaced, illegally-mutable, stale and truncated each pinned (PHX-WP-P, break-proofed). legacy and orphaned remain unpinned: the legacy classification exists (feature-package-topology.mjs:78) but no rejection path consults it, and no code checks a package file is referenced by an artifact |
| P-AC-07 | implemented | C | audit-bundle-tests: signs and verifies only an unchanged manifest, without identity or authority claims |
| P-AC-08 | implemented | ELEPHANT | CORRECTED 2026-08-09 (independent Critic FAIL, F3): the reconcile transaction is built and gate-registered (444/444, harness/scripts/pipeline-state.test.mjs), but no shipped entry point ever supplies deps.featurePackageReconcileApproval -- pipeline-state.mjs:5644 has no default (`??`) fallback, unlike its sibling deps, and both CLI entry points call run() with none. Only the test file ever provides the resolver. The command as shipped cannot be invoked by any real operator or agent -- structurally identical to the "interface built, no caller" gap this session found and disclosed for A-AC-04, just not caught here until independent review. FIX LANDED 2026-08-11 (PHX-WP-PAC08-RECONCILE-APPROVAL, PO-authorized, commits c6bd3a6b/4021299d/55e60f67): the missing default resolver is now built -- defaultFeaturePackageReconcileApproval closes over the GOVERNING SESSION's own pipeline-state.json (never --root), resolves signature/chat mode via a new gates.reconcile_approval key mirroring gates.push_approval, and is wired as runFeaturePackageWriteCommand's fallback only when no deps.featurePackageReconcileApproval is explicitly injected (Object.hasOwn, so an explicit-undefined test injection is not silently overridden). Independently re-verified, not accepted from either dispatch report: 468/468 (harness/scripts/pipeline-state.test.mjs, no regression), 31/31 (critical-human-proof-policy.test.mjs), 5/5 (critical-action-approval-request.test.mjs), 21/21 (runner-profiles-v3.test.mjs), 0 implicated ADRs (doc-reconciliation). Two items remained at that point, BOTH human-signature-gated: (a) the real committed pipeline.user.yaml still lacks gates.reconcile_approval (GS-1, out-of-session Ed25519 override required; absence still validates and defaults to the strongest signature mode, nothing weakened by the gap); (b) the proving tests, designed but not yet registered (TP-5). UPDATE 2026-08-11: a signed GMW window (--scope TP-3,TP-5) landed (b) -- RGi-RGn in harness/scripts/pipeline-state.test.mjs (commit 3fdf8b9f), 490/490, genuine Ed25519 proofs throughout, closing that gap. A fresh independent Critic review of the full range (c6bd3a6b..3fdf8b9f) then ran and returned FAIL (specs/sprint-phoenix-epic/evidence/pac08-f3-critic-review-3fdf8b9f.md): F3 itself is confirmed closed, but F-A (major, guard-testpath-override-tests OT09 broken by c6bd3a6b's own generalization, blocked on TP-7 which the current window does not cover), F-B (major, the verified approval is checked by defaultFeaturePackageReconcileApproval then discarded -- no criticalProofConsumption-style replay ledger for this kind, no durable attribution record, chat-mode --by unbound to any candidate; remediation dispatched same night as PHX-WP-PAC08-APPROVAL-LEDGER, goldfish-deep, scoped to pipeline-state.mjs + pipeline-state.test.mjs under the still-active TP-5 window), F-C (major, the bundled staleReceipt/casOutcome production hunk in 55e60f67 had no dispatch record claiming it -- fixed directly, attribution added to evidence/PHX-WP-PX0-CASOUTCOME/dispatch-record.json, no code change), and F-D (minor, three commit trailers cited a PHX-GMW-TP5-TESTS dispatch record that did not exist -- fixed directly, record written). Verdict stays partial: F-B is a live security/audit gap against P-AC-08's own candidate/evidence-binding language, Critic-confirmed rather than self-assessed, and remains open until PHX-WP-PAC08-APPROVAL-LEDGER lands and is itself independently re-verified. UPDATE 2026-08-11: PHX-WP-PAC08-APPROVAL-LEDGER landed (commit 5420c5e7), independently re-verified (501/501, plus genuine RED-before-GREEN evidence: reverting only the source to HEAD~1 reproduced exactly the 5 fix-dependent assertion failures the report predicted). Rather than self-declaring F-B closed, a further independent delta Critic review of 5420c5e7 alone was dispatched and returned FAIL (specs/sprint-phoenix-epic/evidence/pac08-fb-critic-review-5420c5e7.md) -- this time a MORE serious result than F-B itself: F1 (blocker), the state write the fix added is placed INSIDE a continuity lock runFeaturePackageReconcileCommand already holds on --root for the whole transaction; when the governing session directory and --root are the SAME directory -- the actual topology Phoenix uses, reconciling its own specs/sprint-phoenix-epic/lifecycle.json from within its own checkout -- the inner writeState call collides with the still-held outer lock at the identical lock path and refuses PS-CONTINUITY-LOCKED unconditionally, misreported as a PO-approval rejection. Independently reproduced the mechanism in isolation before accepting it (a same-process, same-path, different-token second lock acquisition collides while the first is held; succeeds once released) without touching any real project state. F2 (major): no test in the fix exercises this topology (every case injects a separate dir from --root), so 501/501 green could not have caught F1. F3 (minor): a replayed proof is reported to the operator with a message asserting a false cause. F4 (minor, an Elephant process error, not the dispatch's): the red-before-green evidence for F-B was reconstructed after the commit landed rather than produced before the fix. Remediation for F1+F3 dispatched same night as PHX-WP-PAC08-LOCK-REENTRANCY (goldfish-deep), required to reproduce F1 red BEFORE writing the fix this time. Verdict stays partial, now for F1 specifically -- a capability regression, not merely an audit gap. CLOSES 2026-08-11: PHX-WP-PAC08-LOCK-REENTRANCY landed (commit 3e1a727e) with genuine reproduce-first evidence (RED/GREEN TAP timestamps independently confirmed to predate the commit) -- an explicit lock hand-off (runFeaturePackageReconcileCommand passes its already-held root lock into the approval closure via holderLock/holderRoot; the closure reuses it, only when resolved paths match, via a new writeState(..., {reuseLock}) option) rather than the module-level reentrant-registry approach originally offered, because the dispatch found that approach would have broken PS44Vc (a real foreign-token-contender test). Independently re-verified: 504/504, PS41a-PS41d and RGi-RGr unchanged, F1-reproducing RGs/RGs-2/RGs-3 pass. A third independent Critic round on 3e1a727e alone returned PASS (specs/sprint-phoenix-epic/evidence/pac08-f1-critic-review-3e1a727e.md): F1/F2/F3 all confirmed closed; one minor, fail-closed, non-blocking residual (lock-identity comparison uses resolve() not realpathSync(), so a symlinked --root would still self-collide) filed as backlog/items/2026-08-11-reconcile-lock-reuse-uses-lexical-not-real-path-comparison.md. Verdict flips to implemented: P-AC-08's own criterion text (acceptance.md:346-373) is satisfied and gate-registered (pipeline-state-tests, harness/scripts/verify.mjs:373); the separate epic-close "Full Verify passes" gate (spec.md:690, DoD §13) stays unmet via F-A (OT09, TP-7-blocked), the same distinction already relied on for the other 127 implemented criteria |
| P-AC-09 | partial | STALE4 | RETRACTS the "no export-backfill preview... exists" half -- organization-policy-activation.mjs's computeBackfillRange/backfillRange preview field (already credited to P-AC-03 as implemented, WP-P-AC01-AC03) is real and tested (organization-policy-activation.test.mjs "P-AC-03 computes newlyRequiredArtifacts, externalEffects, and backfillRange deterministically from the transition", 4/4 pass). Partial only: this is the preview half shared with P-AC-03; activateOrganizationPolicy's authorize() is one generic activation grant, not a distinct "explicit backfill consent" scoped to the identified historical range, and no code actually exports/backfills the historical events themselves |
| P-AC-10 | implemented | WP-P | organization-policy-core-tests + audit-bundle-core-tests: pack-side compliance-claim rejection and signed-bundle no-identity-claim shape both pinned (PHX-WP-P, break-proofed). Log/viewer halves were out of the dispatched carrier scope and remain unevaluated either way |
| P-AC-11 | partial | WP-P-AC11 | organization-policy-core-tests: mode (closed reference-only/projection/controlled-publication set), approval (union, no downgrade), targetBinding (optional, closed, provider-neutral, never-merged) and revision readback (per-contributing-pack revisions, always appended) pinned (PHX-WP-P + WP-P-AC11, break-proofed). UPDATE 2026-08-16: the "no field exists" half is closed and the gap is now narrower and differently shaped. PHX-WP-PAC11 (9352331d) gave all five remaining dimensions a representation -- ownedSections, lifecycleEvents, previewRequired, retention, conflictPolicy, each a closed provider-neutral vocabulary, each with an accept/reject case and a tested merge rule (intersection, OR, exact-match-or-OPP-RESOLVE-CONFLICT, ranked max), backward compatible so pre-existing 3-key and 4-key entries validate unchanged (28/28 organization-policy-core-tests, re-run independently by the Elephant, not accepted from the dispatch report). PHX-WP-PAC11-ENFORCE (8be6c308) then ran investigation-first against the real decision path and found only ONE of the five has a genuine enforcement point: ownedSections is now enforced on external write plans (reason policy-owned-sections), while previewRequired, conflictPolicy and retention were ruled no-enforcement-point on evidence an independent Critic re-verified and CONFIRMED (preview() is unconditional at external-reference-adapter.mjs:83; the conflict branch at :82 blocks unconditionally regardless of policy; identity.retention's [active,retain,archive] has zero overlap with the policy's three categorical commitments). An independent Critic review of the whole range returned FAIL with five findings (specs/sprint-phoenix-epic/evidence/pac11-critic-review-8be6c308.md), four of which are now closed by PHX-WP-PAC11-FIX (c7eb2297) and two Elephant commits: F1 (major) -- ownedSections items were validated against TARGET_REF while the compared changes[].field uses ID, so every field name with an uppercase letter, dot, underscore, colon or leading digit was unrepresentable in policy and permanently rejected, i.e. exactly the field conventions of the systemClass values the adapter supports; fixed by widening the domain and, more importantly, pinned by a source-equality test so a future narrowing of either pattern fails loudly. F2 (major) -- the recorded "disjoint vocabularies" justification for leaving lifecycleEvents unenforced was FALSE (four of six values are verbatim identical to FEATURE_STATES and a carrier exists before the first external call); the dispatch re-verified this, chose to leave it unenforced rather than invent what a policy naming only proposed/active should mean for a write observed in draft/implementing, and replaced the false claim with a true one in the source comment where a reader meets it -- the two vocabularies are two different lifecycle AUTHORITIES (epic-level publication events vs a feature package's own build lifecycle) that share four terminal values, not one vocabulary with gaps. F3 (blocker) -- four declared-but-inert dimensions had no owner and no expiry anywhere; closed by filing backlog/items/2026-08-16-p-ac-11-four-dimensions-declared-but-inert.md. F4 (minor) -- the new gate called .includes() on caller-supplied ownedSections without the shape check its neighbours use, degrading ownership into a substring test for a bare string and throwing a raw TypeError for null; fixed with reproduce-first tests for both. F5 (minor) -- docs/organization-policy-packs.md now documents all six optional entry keys, their merge rules, and the two that fail resolution outright. Verdict stays PARTIAL, deliberately: "scope permission by" is satisfied for mode, approvalRequired, targetBinding and ownedSections by an actual rejection on an actual decision path, and that is the bar the remaining four have not met -- they validate and merge but change no behaviour. A delta Critic re-review of the fix range has NOT been run: QG-01 forbids handing a diff to the Critic while deterministic gates are red, and the full Verify gate cannot go green until the PO-signed feature-package-reconcile lands (four suites fail FTP-ARTIFACT-2 on a stale acceptance.md digest). That is a structural block on the re-review, recorded rather than worked around |
| P-AC-12 | implemented | C | audit-bundle-tests: tampered or missing bundle bytes detected; signature invalidated when the manifest changes |
| P-AC-13 | implemented | WP-DOC | docs/organization-policy-packs.md + docs/audit-bundles.md (PHX-WP-DOC-2): threat model, pack/schema/activation policy, bundle policy, and compatibility/migration/versioning policy all present and grounded -- the compatibility section honestly states no pack-schema migration mechanism exists (only v1 is accepted; revision is a content digest, not a version number) |

### V — Human-readable Evidence Viewer (#5) (9/10 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| V-AC-01 | implemented | C | evidence-view-model-tests: offline report with source links and a candidate-bound receipt |
| V-AC-02 | partial | WP-V-AC02 | evidence-view-renderer-tests: fact, unknown, unavailable, redacted, invalid, not-applicable, and now human decision (PHX-WP-V + WP-V-AC02, break-proofed) -- seven of nine. `approved` is the sole feature-package lifecycle state gated behind PO-specific authority (feature-package-topology.mjs:171), labelled distinctly in the renderer. estimate and assumption remain unpinned: investigated, confirmed no field anywhere represents an approximate or unverified-premise value -- disclosed, not fabricated |
| V-AC-03 | implemented | C | evidence-view-model-tests: claims linked to canonical source record and exact candidate |
| V-AC-04 | implemented | C | evidence-view-model-tests: invalid topology yields an invalid view with no candidate or artifact leak |
| V-AC-05 | implemented | C | evidence-view-renderer-tests: deterministic redacted projection withholding artifact paths |
| V-AC-06 | implemented | WP-V-AC06 | evidence-view-renderer-tests (PHX-WP-V + WP-V-AC06): exact CSP directive value, skip-link keyboard focus target, landmark/table accessibility structure, AND mobile/desktop snapshot checks all pinned via deterministic string-level assertions against the rendered HTML -- the same technique V-AC-09 established, no visual-regression infrastructure needed. 8/8 tests pass |
| V-AC-07 | implemented | WP-V | evidence-viewer-tests: input-side rejection was already pinned; a new assertion tampers the generated viewer file and proves canonical authority stays unchanged and re-derivation never yields a pass claim (PHX-WP-V, break-proofed) |
| V-AC-08 | implemented | C | evidence-view-model-tests: exact canonical lifecycle state or a typed unavailable result |
| V-AC-09 | implemented | WP-V | evidence-view-renderer-tests: all seven required fixtures now covered -- pass/fail/unknown pre-existing, tampered/misplaced/orphaned/legacy-layout added with deterministic snapshots (PHX-WP-V, break-proofed) |
| V-AC-10 | implemented | C | evidence-viewer-tests: candidate binding rendered before any derived summary |

### X — Traceability and documentation adapters (#23) (15/15 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| X-AC-01 | implemented | C | external-reference-adapter-tests: unclosed references rejected, non-pipeline-owned writes blocked |
| X-AC-02 | implemented | C | external-reference-adapter-tests: one ownership class per synchronized field/section |
| X-AC-03 | implemented | C | external-reference-adapter-tests: inspect, exact preview, authority, idempotent apply, matching readback |
| X-AC-04 | implemented | C | external-reference-adapter-tests: no success reported for revision, capability, authority or readback conflict |
| X-AC-05 | implemented | C | external-reference-adapter-tests: external observations reconciled without importing them as authority |
| X-AC-06 | implemented | C | external-reference-adapter-tests: deterministic typed state for every abnormal external observation |
| X-AC-07 | implemented | C | external-reference-adapter-tests: credentials and private coordinates kept out of every portable record |
| X-AC-08 | implemented | C | external-reference-adapter-tests: provider names and fields kept out of the normative core schemas |
| X-AC-09 | implemented | C | external-reference-adapter-tests: external content treated as untrusted data, no execution or authority injection |
| X-AC-10 | implemented | C | external-reference-adapter-tests: identity resolved through the feature package, not a path guess |
| X-AC-11 | implemented | WP-XAC11 | external-reference-adapter-tests (PHX-WP-XAC11, break-proofed): planExternalReferenceWrite consults an injected organizationPolicy for a governed documentClass, failing closed on no policy / no covering class / mode mismatch / outstanding approval; approval-binding itself is a named open follow-on, not built here |
| X-AC-12 | implemented | WP-X | external-reference-adapter-tests: plan->apply->reconcile proven identical across synthetic issue-tracker, knowledge-base, document-store and secondary-forge profiles, and every cross-profile capability mismatch rejected (PHX-WP-X, break-proofed) |
| X-AC-13 | implemented | C | external-reference-adapter-tests: defaults to reference-only or projection, never last-write-wins |
| X-AC-14 | implemented | WP-XAC14 | external-reference-adapter-tests (PHX-WP-XAC14, break-proofed): both inspect() call sites now catch a thrown/rejected inspect and return the typed reconciliation-required/external-unreachable shape instead of an uncaught rejection; backlog item pipeline.external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system closed |
| X-AC-15 | implemented | WP-DOC | docs/external-traceability.md (PHX-WP-DOC-2): threat model, ownership/lifecycle mapping, publication guide, recovery procedure, and conformance suite added and grounded; the recovery procedure names the adapter's uncaught-inspect()-rejection gap and its backlog item explicitly rather than describing a graceful path that does not exist |

### C — ITSM change control (#24) (13/13 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| C-AC-01 | implemented | C | change-control-tests: profile validation plus the exact bound tuple for mandatory promotion |
| C-AC-02 | implemented | WP-C-AC02 | change-control-tests (PHX-WP-C-AC02): "standard" is pinned as a distinct changeClass paired with mandatory authority, alongside emergency and not-required, AND carries its own required standardTemplate {templateId, revision} field (null for every other class), closing the standard-vs-normal field-level distinction per issue #24 §5. detectChangeClassShopping now closes the remaining half: flags a proposed classification against same-tuple alternatives via resolveChangeControlProfile whenever the fuller candidate set would not have landed on it. 27/27 tests pass |
| C-AC-03 | implemented | C | change-control-tests: Pipeline and external authority validated independently against the same tuple |
| C-AC-04 | implemented | C | change-control-tests: stale, unauthenticated, mismatched, unavailable and outside-window state all block |
| C-AC-05 | implemented | C | change-control-tests: external update published only after the local deployment event; failed attempts preserved |
| C-AC-06 | implemented | C | change-control-tests: reconciliation-required entered instead of claiming completed change control |
| C-AC-07 | implemented | WP-C-AC07 | change-control-tests (PHX-WP-C, break-proofed): explicit emergency authority and bounded-scope rejection of a scope mismatch are pinned; retrospective evidence proving the emergency was real or reviewed is not -- the journal binding does not even carry changeClass, so nothing is gated on it |
| C-AC-08 | implemented | C | change-control-tests: the deploy adapter stays independently usable when not-required |
| C-AC-09 | implemented | WP-C-AC09 | CONFIRMED ABSENT (PHX-WP-C, repo-wide search): no resolver over multiple candidate change-control profiles exists anywhere in this module or its CLI -- there is no data shape representing "release configuration for an environment" as a set of candidates, so nothing exists to test |
| C-AC-10 | implemented | C | change-control-tests: an automatically created external record stays draft or observation |
| C-AC-11 | implemented | C | change-control-tests: provider names and fields kept out of the provider-neutral core schema |
| C-AC-12 | implemented | WP-C-AC12 | change-control-tests (PHX-WP-C, break-proofed): unavailable external state blocks via C-AC-04, and the distinct "external-unavailable" gate reason is now pinned by name; the explicit advisory-vs-mandatory policy distinction remains absent -- mandatory:false is only representable together with changeClass:"not-required", which short-circuits before ITSM availability is ever inspected |
| C-AC-13 | implemented | WP-DOC | docs/change-control.md (PHX-WP-DOC-1): threat model, policy precedence, migration, operator runbook, and failure/rollback/recovery procedures all present and grounded in change-control.mjs; migration section honestly states no migration tooling exists |

### E — Governance event export (#32) (21/21 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| E-AC-01 | implemented | C | governance-export-adapter-tests: one validated source mapped deterministically with stable identity |
| E-AC-02 | implemented | WP-E-AC02 | governance-export-adapter-tests (PHX-WP-E-AC02): deterministic mapping was already pinned; loss is now computed per call -- RFC 5424 names every EXPORT_FIELDS key it drops (proven with a full eight-key and a minimal-key fixture), CloudEvents/OTLP/NDJSON proven to stay loss:[] under the same full-key fixture |
| E-AC-03 | implemented | C | governance-export-adapter-tests: policy-less exports denied, only explicitly allowed fields projected |
| E-AC-04 | implemented | WP-E-AC04 | governance-export-adapter-tests (PHX-WP-E, break-proofed): default omission of rationale/summary is pinned; CONFIRMED ABSENT: the "policy allows and redacts" path -- EXPORT_FIELDS is a closed, non-configurable constant (adapter.mjs:15), no policy can ever admit the field |
| E-AC-05 | implemented | C | governance-export-outbox-tests: independent destination queues, idempotent enqueue, retryable and quarantined entries preserved |
| E-AC-06 | implemented | WP-A2 | governance-export-delivery-tests (PHX-WP-E + PHX-WP-A2): stable idempotency and at-least-once redelivery are pinned; the receipt's closed enums carry no exactly-once wording and structurally cannot ever admit one -- the SHALL-NOT-claim-exactly-once negative is now pinned directly |
| E-AC-07 | implemented | C | governance-export-delivery-tests: only the safely acknowledged prefix advances after partial delivery |
| E-AC-08 | implemented | WP-EAC08-TRUNCATION | governance-export-outbox-tests (PHX-WP-E-AC08): 7 of 8 detections pinned (destination-mismatch/forged-ack/event-gap/schema-downgrade pre-existing, cursor-bound/source-fork/invalid-hash new, each with its own typed code); outbox truncation (a cross-state comparison this module has no capability for) remains absent |
| E-AC-09 | implemented | WP-E-AC09 | governance-export-delivery-tests (PHX-WP-E, break-proofed): lag exposed on a failed acknowledgement is pinned; CONFIRMED ABSENT: the "advisory destination" concept itself -- no such distinction exists anywhere in scope, so "canonical governance continues under an unavailable advisory destination" is not representable |
| E-AC-10 | implemented | WP-E-AC10 | NO CARRIER: no named lifecycle boundary blocks only the exact unacknowledged source range |
| E-AC-11 | implemented | WP-E-AC11 | governance-export-delivery-tests (PHX-WP-E-AC11): the closed 10-field receipt schema is pinned, rejecting any retention/immutability/analyst-review/compliance-implying extension, AND now carries a projectionDigest alongside policyRevision -- deterministic over batch content, proven to change when batch content changes |
| E-AC-12 | implemented | C | governance-export-adapter-tests: profile and acknowledgements are closed, non-authoritative and deduplicated |
| E-AC-13 | implemented | C | governance-export-outbox-tests: destination queues, cursors and failure domains stay independent |
| E-AC-14 | implemented | WP-EAC14 | governance-export-delivery-tests (PHX-WP-EAC14, break-proofed): all five named fixture classes individually evidenced -- in-memory/local-file/OTLP-profile/syslog (pre-existing) plus a genuine failure-injection fixture (new): a rejected adapter.deliver() call leaves the outbox untouched and a later retry recovers cleanly. Corrects the prior partial verdict, which had leaned on CAS-conflict/forged-ack tests that direct re-examination found to be validation assertions, not simulated transport failure |
| E-AC-15 | implemented | C | governance-export-adapter-tests: allowlisting/redaction completed before every persistence boundary |
| E-AC-16 | implemented | C | nine named assertions: batching bound, compression, payload bound, rate limit, retry budget, backpressure, flush, restart resume, replay |
| E-AC-17 | implemented | C | governance-export-outbox-tests: duplicate delivery preserves one canonical source history |
| E-AC-18 | implemented | C | governance-export-adapter-tests: destination secrets excluded from every portable export record |
| E-AC-19 | implemented | C | evidence-viewer-tests: export lag and receipts rendered as a separate non-authoritative observation |
| E-AC-20 | implemented | WP-E-AC20 | audit-bundle-tests (WP-E-AC20): planAuditBundle now accepts optional exportEvidence, narrowed to exportMetadata {profileDigest, receipt} on the plan/manifest -- never mappings/outbox/acknowledgement, never consulted by signature/verification logic (proven: a bundle with wrong export metadata still verifies). 16/16 tests pass |
| E-AC-21 | implemented | WP-DOC | docs/governance-event-export.md (PHX-WP-DOC-2): threat model, data-flow diagram, mapping/loss guide, retention guidance, operator runbook, and incident/recovery procedures all present and grounded; the loss guide names the known loss:[] gap explicitly, the retention section reports no pruning/archival/expiry function exists anywhere in the outbox modules |

### R — External command offer, workaround and recovery audit profile (11/13 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| R-AC-01 | implemented | C | external-command-offer-tests: public-safe offer recorded before presentation, verified append readback required |
| R-AC-02 | implemented | WP-R-AC02 | CONFIRMED ABSENT (PHX-WP-R): recovery-proposed/recovered states exist in the schema but are unreachable through any exported function -- no capability correlates a rejected path, alternatives, or selected recovery to the offer |
| R-AC-03 | implemented | C | external-command-offer-tests: a bound human decision is required for destructive attempts and appended before execution |
| R-AC-04 | implemented | WP-R-AC04 | agent-decision-journal/external-command-offer-tests (PHX-WP-R + WP-R-AC04): operation class, target, exact pre/post digests, and recoverability are bound and validated together, AND requiredCleanup now records the distinct WHAT-is-required half (cleanupClass/status/digest), optional, scoped to non-"not-applicable" recoverability. 39/39 + 28/28 tests pass |
| R-AC-05 | implemented | C | agent-decision-journal-tests: every enumerated private field and every untyped digest refused at both journal boundaries |
| R-AC-06 | implemented | C | external-command-offer-tests: user execution stays unobserved; completion admitted only with bounded evidence |
| R-AC-07 | implemented | C | external-command-offer-tests: failed, partial, cancelled, mismatch and unknown outcomes retained distinctly |
| R-AC-08 | partial | WP-R | external-command-offer-tests (PHX-WP-R): a readback lifecycle event appends exactly once and never rewrites the original offer; rollback/cleanup as *occurred* events are absent -- no such state exists at all, only prospective values inside recoverability |
| R-AC-09 | partial | WP-R-AC09 | agent-decision-journal/external-command-offer-tests (PHX-WP-R + WP-R-AC09): missing offer link, contradictory outcome evidence, and cross-repository/cross-scope substitution all fail closed (never successful), AND occurredAtEpochMs now closes the stale clause. Duplicate detection remains at the store layer by design (idempotencyKey, governance-event-store.mjs), not re-built here -- deliberate, not absent. 41/41 + 30/30 tests pass |
| R-AC-10 | implemented | WP-R-AC10 | fail-closed on the append is pinned; the policy-defined typed non-material exception is absent |
| R-AC-11 | implemented | WP-R-AC11 | external-command-offer/agent-decision-journal-tests (PHX-WP-R + WP-R-AC11): a mandatory public-safe typed omission is pinned, AND recordPrivateHandoffCommitment now wires this module to the existing restricted-machine-local store via a caller-supplied put callback, exposing only a commitment digest + receipt id. 44/44 + 36/36 tests pass |
| R-AC-12 | implemented | WP-R-AC12 | external-command-offer-tests (PHX-WP-R-AC12): the motivating Phoenix bootstrap trajectory is now encoded end to end -- a rejected guard-bypass attempt, an attended local repair through the sanctioned non-authoritative channel, an unchanged public-privacy boundary, a verified readback, and digest-only targets that never embed a machine-specific value |
| R-AC-13 | implemented | WP-R | external-command-offer-tests (PHX-WP-R): 9 of 11 required fixture classes now named (7 pre-existing + secret/malicious command rejection + governed-script identity); approval-without-run and duplicate/retry are confirmed structurally unreachable, each pinned by a dedicated test showing the gap rather than left silently missing. CLOSES 2026-08-17 (Elephant, measurement correction, no code change): re-read all 11 required fixture classes from acceptance.md against the actual test titles in external-command-offer.test.mjs (36/36 pass, independently re-run) -- Pipeline-initiated + user-requested/Pipeline-supplied offers (:12, :28), guard override (:20), failed/partial/cancelled/readback-mismatch (:37), substitution (:41), approval-without-run (:168), duplicate/retry (:175), secret-bearing + malicious-content rejection (:154), governed-script identity (:161) are ALL named. The prior 9/11 count wrongly excluded approval-without-run and duplicate/retry from "named" because their fixtures pin delegated/unreachable behavior rather than a positive success path -- but R-AC-13's own text requires providing a fixture, not preventing the scenario; both fixtures exist and pass. 11/11 |

### EPIC — Epic integration and release (1/6 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| EPIC-AC-01 | partial | C | the issue-to-criterion mapping exists; no independent closure status exists for any of the eight issues |
| EPIC-AC-02 | not-started | STALE4 | reconfirmed 2026-08-11: NO CARRIER: planParallelSprintIntegration (plugins/pipeline-core/lib/parallel-sprint-integration.mjs) still has no concept of "unpublished" (direct grep for "unpublished"/"Nova"/"Cyborg"/"Nightwing" in the file: zero hits) and is still imported only from its own test file (grep for the import across plugins/pipeline-core and harness: only parallel-sprint-integration.test.mjs) |
| EPIC-AC-03 | partial | C | an outstanding deviation is recorded (the bound Spec section 7 inventory omits six implemented modules) and is not yet repaired through the sanctioned route |
| EPIC-AC-04 | partial | C | Full Verify and blocking Security pass only on the last PUSHED candidate (`3387065`), not the integrated one measured here (see the gates table below). An independent high-risk Critic on the integrated candidate is no longer absent -- it ran 2026-08-09 and returned FAIL (5 major, 2 minor); privacy review and explicit PO acceptance remain absent |
| EPIC-AC-05 | constraint | C | a prohibition, and it currently bites -- see the summary count above for the exact figure; deliberately not hardcoded here after an independent Critic FAIL found this line stale against the generated total more than once (F4, 2026-08-09) |
| EPIC-AC-06 | implemented | C | the PRD header records the PO approval binding the first implementation dispatch |

## Per issue

### #5 — Generate a local human-readable Evidence Viewer

6 of 6 live acceptance bullets fully carried; **0 blocked**.

No blocking criterion. Closeable subject to the epic-level gates (EPIC-AC-01..06).

### #9 — Introduce organization policy packs and signed audit bundles

5 of 11 live acceptance bullets fully carried; **6 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Required documentation stays provider-neutral | P-AC-11 (partial) |
| 2 | External permission is scoped by class/target/mode/ownership/event/approval | P-AC-11 (partial) |
| 3 | Policy cannot grant unrestricted edits or import prose authority | P-AC-11 (partial) |
| 4 | Publications require preview, source digest, revision readback, reconciliation | P-AC-11 (partial) |
| 5 | Bundle artifacts resolve through canonical inventory | P-AC-06 (partial) |
| 6 | Invalid/misplaced/orphaned/unreconciled artifacts cannot enter silently | P-AC-06 (partial) |

### #17 — Define a sanitized multi-agent event model and local replay view

6 of 6 live acceptance bullets fully carried; **0 blocked**.

No blocking criterion. Closeable subject to the epic-level gates (EPIC-AC-01..06).

### #23 — Define external work-system and knowledge-base traceability adapters

16 of 16 live acceptance bullets fully carried; **0 blocked**.

No blocking criterion. Closeable subject to the epic-level gates (EPIC-AC-01..06).

### #24 — Add policy-governed ITSM change control to release and promotion

12 of 12 live acceptance bullets fully carried; **0 blocked**.

No blocking criterion. Closeable subject to the epic-level gates (EPIC-AC-01..06).

### #30 — Add a repository-scoped tamper-evident human governance decision ledger

11 of 17 live acceptance bullets fully carried; **6 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Every human authority transition records a decision first | H-AC-12 (partial) |
| 2 | Full decision lifecycle is reconstructable | H-AC-11 (partial) |
| 3 | Cross-repository writes/consumption are rejected | H-AC-09 (not-started) |
| 4 | Guard/plan/release/deploy/override paths reference decision IDs | H-AC-12 (partial) |
| 5 | Unverified legacy material cannot satisfy a current gate | H-AC-08 (partial) |
| 6 | #9 bundles verified ledger records/integrity | P-AC-06 (partial) |

### #31 — Add a privacy-preserving agent decision and assumption journal

13 of 17 live acceptance bullets fully carried; **4 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Closed schema/materiality policy selects journaled events | A-AC-01 (partial) |
| 2 | Changed assumptions invalidate/revalidate affected work | A-AC-03 (not-started) |
| 3 | Runner/model/profile/role/capability carries assurance | A-AC-05 (partial) |
| 4 | #5 shows uncertainty/status/decision with evidence | V-AC-02 (partial) |

### #32 — Add provider-neutral governance event export for SIEM and audit platforms

20 of 20 live acceptance bullets fully carried; **0 blocked**.

No blocking criterion. Closeable subject to the epic-level gates (EPIC-AC-01..06).

## Summary

| issue | bullets | carried | blocked | closeable |
|---|---|---|---|---|
| #5 | 6 | 6 | 0 | yes |
| #9 | 11 | 5 | 6 | **no** |
| #17 | 6 | 6 | 0 | yes |
| #23 | 16 | 16 | 0 | yes |
| #24 | 12 | 12 | 0 | yes |
| #30 | 17 | 11 | 6 | **no** |
| #31 | 17 | 13 | 4 | **no** |
| #32 | 20 | 20 | 0 | yes |

Issues closeable on their own live acceptance bullets: **5 of 8**.

## The blocking set, ranked

10 distinct criteria block at least one live acceptance bullet.

| criterion | verdict | live bullets blocked |
|---|---|---|
| P-AC-11 | partial | 4 |
| P-AC-06 | partial | 3 |
| H-AC-12 | partial | 2 |
| A-AC-01 | partial | 1 |
| A-AC-03 | not-started | 1 |
| A-AC-05 | partial | 1 |
| H-AC-08 | partial | 1 |
| H-AC-09 | not-started | 1 |
| H-AC-11 | partial | 1 |
| V-AC-02 | partial | 1 |

## Criteria not mapped to any live issue bullet

53 of 157 criteria are Phoenix's own stricter contract rather than a live issue obligation.
They block no issue, but EPIC-AC-05 still forbids an epic completion claim while any of them is not `implemented`.
13 of those 53 are currently not `implemented` and are listed below; the rest are omitted because they are done.

| criterion | verdict |
|---|---|
| A-AC-09 | partial |
| A-AC-10 | partial |
| EPIC-AC-01 | partial |
| EPIC-AC-02 | not-started |
| EPIC-AC-03 | partial |
| EPIC-AC-04 | partial |
| EPIC-AC-05 | constraint |
| L-AC-01 | partial |
| P-AC-09 | partial |
| PX0-AC-05 | partial |
| PX0-AC-13 | partial |
| R-AC-08 | partial |
| R-AC-09 | partial |

## The epic gates, one by one

EPIC-AC-04 names seven gates for a completion claim. Their current state, so that the remaining
work is not mistaken for paperwork:

| gate | state | evidence |
|---|---|---|
| Focused package checks | **partial** | per-package suites are green; the signed TP-3+TP-5 window was used and the reconcile suite is now gate-registered (444/444), but an independent Critic FAIL (2026-08-09, F3) found no shipped entry point ever supplies the required approval resolver -- the command is built and tested but structurally unreachable by any real caller |
| Full Verify | **not verifiable for the integrated candidate** | `evidence/verify-latest.json` binds `3387065`, an ancestor of the whole reviewed range -- an independent Critic (2026-08-09, F5) found no full-gate Verify run is bound to the current candidate; per-suite reruns are not a substitute |
| Blocking Security | **passed (as of `3387065`, not re-run against the integrated candidate)** | `pipeline.security-verdict.v2` — `blocking: false`, `cap.sast` pass, `cap.secrets` pass |
| Privacy review | **absent** | no privacy-review artifact exists for the integrated candidate |
| Independent high-risk Critic | **FAIL, 2026-08-09** | one full-range Critic dispatch reviewed all 57 commits from the epic-wide measurement through this correction; verdict FAIL, 5 major + 2 minor findings; F1/F3/F4/F5 addressed in this same correction, F2/F6 filed as disclosed defects (see backlog) |
| Exact branch push and readback | **passed** | `origin/sprint_phoenix = 3387065`, readback OID equality confirmed, approval bound to that exact commit |
| Explicit PO acceptance | **absent** | the only recorded PO approval binds the first implementation dispatch (EPIC-AC-06), not completion |

Two epic criteria are open for reasons that are not implementation debt and cannot be closed by
writing code:

- **EPIC-AC-03** — a deviation is recorded and unrepaired: the bound Spec §7 inventory omits six
  already-implemented Phoenix modules. The criterion requires the Spec updated and the affected
  approval renewed; the sanctioned route is the continuity-authority revision writer, which now
  exists (PX0-AC-02 implemented), so this is executable where it previously was not.
- **H-AC-11** — its own PO amendment records that Increment 1 does **not** satisfy the
  no-join-handle clause for the GMW half, as a proved impossibility rather than an unfinished
  implementation. It closes only by a separately reviewed amendment scoping the clause, or by
  changing GMW's machine-local storage. Tracked as O-4.

