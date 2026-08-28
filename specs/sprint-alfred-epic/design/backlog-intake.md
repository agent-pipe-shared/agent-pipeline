# Backlog intake — the 24 open `sprint: alfred` items (read in full, 2026-08-27)

> **Set update, 2026-08-28 (PO design-gate decisions).** This document's
> analysis covers the 24 items as read on 2026-08-27. Two of them moved to
> Sprint Nightwing at the gate (§A below), and this design phase itself filed
> five further `sprint: alfred` items after the intake was written. The live
> in-scope set is therefore **27 open items**, not the 24 analysed here;
> `acceptance.md` AC-13 is the binding statement and
> `check-backlog-sprint-assignment.mjs` the live count. The five
> self-filed items —
> `2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes`,
> `2026-08-27-no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits`,
> `2026-08-27-set-feature-to-submit-plan-is-not-closed-without-a-coordinator-only-continuity-init`,
> `2026-08-27-a-fresh-clone-loses-all-machine-local-pipeline-state-with-no-provisioning-readback`,
> `2026-08-28-a-design-phase-prd-and-spec-are-frozen-by-their-own-continuity-binding`
> — are measured process defects of this sprint's own subject matter and are
> dispositioned at wave boundaries, not re-analysed here.

Every open item carrying `sprint: alfred` was read completely on 2026-08-27,
its "still open" status re-verified against the live file and recent `git log`
(per the CLAUDE.md re-verification rule), and mapped to a work package.
Counts cross-checked against `check-backlog-sprint-assignment.mjs` (alfred: 24
after the two 2026-08-27 filings; the checker output of 22 predates them).

Prior PO decisions recorded inside items are **binding design input** and are
marked ⚖. Where an item was partially delivered already, the remaining scope
is stated — not the item's history.

## A. Assignment conflicts found by this intake (PO-decided 2026-08-28)

**Decision:** both recommendations below were accepted — the two items follow
their own Triage to Sprint Nightwing (`e4c3f2db`). The deciding line the PO
applied, and which the next triage should reuse: *test- and
evidence-discipline belongs to Alfred; product and onboarding experience
belongs to Nightwing.* For the bootstrap-skill item a second argument carried
weight: its entry condition (SETUP-3's content landing in the same file
first) lies outside Alfred, so inside Alfred it would have been the only work
package whose start condition the epic does not control.

| Item | Frontmatter | Its own Triage prose | Recommendation |
|---|---|---|---|
| `2026-08-12-stale-checkout-runs-outdated-human-approval-ceremony…` | `sprint: alfred` | "deferred — owned by Sprint **Nightwing**" (2026-08-17) | Honor the triage: reassign field to `nightwing`. Diagnosability/UX of a self-resolving version-skew, squarely Nightwing's scope. |
| `2026-08-08-the-bootstrap-skill-grows-by-budget-raise…` | `sprint: alfred` | "deferred — owned by Sprint **Nightwing**" (2026-08-17) | Honor the triage: reassign field to `nightwing`. Bootstrap-skill modularisation is onboarding-surface work. |

Both conflicts stem from the 2026-08-27 mass sprint-field assignment
(`6d81b33b`, NVA-SPRINTASSIGN-1), which set `alfred` on open items without
reconciling against existing triage prose. Neither item is designed for in
this spec; if the PO keeps them in Alfred they slot into B2 (stale-checkout
diagnostics) and a small B3 addendum (bootstrap modularisation) respectively.

**Deferred items (not in the 24):**
`2026-07-25-managed-onboarding-success-contract` — `status: deferred`, this
branch's triage says Alfred, the Phoenix-line cross-triage says Nova/general.
Recommendation: accept into Alfred as an A5 acceptance constraint (host-layout
onboarding tests assert the success contract, not rejection) — one review-lens
rule, not a work package. **PO-decided 2026-08-28: accepted**, bound as
`acceptance.md` AC-16/§D, with the PO's constraint that the rule's target set
is re-derived after the Nova rebase because the onboarding surface changed in
the Nova line. Two mechanical facts measured while recording it: the item's
own `sprint:` field cannot be set (ledger event 41's rescoped byte-pin binds
its pre-Triage bytes and the backlog gate refuses the edit), and `deferred`
has no forward transition in the ledger
(`backlog-state.mjs` `FORWARD_TRANSITIONS`), so the item stays outside
AC-13's closure set by mechanism rather than by choice. `2026-07-19-regulated-document-hooks` — Phoenix-owned
per standing 2026-07-24 assignment; **not** Alfred; no action.

## B. Item-by-item disposition

Type key: D=defect, W=workflow-improvement, I=idea. "Fresh?" = live
re-verification result on 2026-08-27.

### Cluster 1 — Enforcement ground truth (→ WP-A1, WP-A2)

| Item | T | Fresh? | Disposition |
|---|---|---|---|
| `2026-08-27-pretooluse-guards-do-not-fire-in-dispatched-subagents` | D | new today; four measurements, runner-scoped (Claude Code; Antigravity differs) | **Design-shaping.** A1 turns its measurements into a standing typed conformance probe; A2 relocates enforcement accordingly. Also: official docs claim subagent hooks fire (`agent_id`/`agent_type` "populated when the hook fires inside a subagent") — the measured contradiction is exactly why the probe must be continuous, not a one-time claim. Its second finding (payload indirection defeats parameter-text guards, runner-independent) sets A2's design floor: parameter classification is friction, not a boundary; the boundary layers are git hooks, tool scoping, post-hoc verification. |
| `2026-08-08-long-dispatches-truncate-before-emitting-their-report` | D | open; 14 occurrences, 6-row measured sample, ⚖ PO direction "budget as handover, not cliff" | → WP-C2. Deliver the closing-allowance contract (⚖ shape: reserve spendable only on commit-green/record/report), record-as-opening-act + phase/tool-count log entries in `goldfish-task.md`, report-persistence question 1, Critic report-early duty question 2. Truncation *rate* is runner-side and stays out of scope; the design makes the cost structural-zero. |
| `2026-08-17-goldfish-critic-dispatch-bootstrap-token-cost-is-disproportionate` | W | open; ⚖ triage: first step is the measurement pass, reassigned to Alfred 2026-08-18 | → WP-C2. Phase-by-phase token breakdown of one `goldfish-deep` + one `critic` dispatch before any optimization; optimization itself only if the measurement names a dominant lever. |

### Cluster 2 — Protected surfaces and authority (→ WP-A3, WP-A4, WP-A5)

| Item | T | Fresh? | Disposition |
|---|---|---|---|
| `2026-08-27-a-closed-result-can-be-amended-after-close…` | D | new today (this session's incident) | → WP-A5(i): closed-evidence paths join the protected baseline at close time; every classifier branch verifies bindings identically; typed PO-gated repair (restore-from-history / re-pin-with-authority). |
| `2026-08-27-discard-feature-writes-a-state-the-cleanup-observer-rejects…` | D | new today (this session's incident) | → WP-A5(ii): direct observer fix + the writer/observer conformance suite (every sanctioned `pipeline-state.mjs` verb outcome classified ready/valid by every observer). |
| `2026-08-08-the-authority-gate-reads-the-worktree…` | D | open; ⚖ deferred-to-Alfred 2026-08-17 | → WP-A5(iii): worktree-vs-HEAD divergence warning naming the differing path; semantics documented; PRD-cardinality case covered. Warning, not refusal (pre-commit checking is the point of reading the worktree). |
| `2026-08-27-plan-approval-binds-a-staging-draft-as-project-authority` | D | new (2026-08-27, Antigravity greenfield evidence) | → WP-A4 entry guard: refuse approval binding staging/banner-carrying paths, typed reason naming promotion. The item's open route-vs-precondition question is answered in the spec: precondition on approval (cheapest, closes every route). |
| `2026-08-09-critical-human-proof-policy-seeded-without-trust-anchor` | I | open; ⚖ PO-decided direction: TOFU **per key**, signature-or-chat gated; +2026-08-17 evidence: bootstrap-time "signature mode but no anchor" check missing | → WP-B2(iv). Implement the decided per-key trust flow + the bootstrap-time surfaced check. Agent can never originate trust. |

### Cluster 3 — Guard friction with typed routes (→ WP-B2)

| Item | T | Fresh? | Disposition |
|---|---|---|---|
| `2026-08-08-the-test-path-guard-blocks-the-briefed-edit-and-offers-no-route` | D | open; ⚖ accepted design: briefed test-change authorization, 4 constraints + signature-or-chat override (cluster C, PO 2026-08-11); deferred-to-Alfred 2026-08-17 | → WP-B2(i). Build the briefed authorization exactly per the four ⚖ constraints; refusal states which of the two situations applies. |
| `2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes` | D | open; detector half shipped 2026-08-17; ⚖ directions 1/2 deferred-to-Alfred 2026-08-18 | → WP-B2(ii). Answer direction 1 in the spec (registration ≠ gate-logic edit: an append-only suite-list change is a distinct, lower-risk act) and make the remaining ceremony batchable/predictable (one exact reviewable command per block). |
| `2026-08-27-a-read-only-command-is-refused-for-naming-a-protected-path` | D | new; related-but-different lane from `8e3cdb8e` (cat-in-pipeline admission — verified: different lane) | → WP-B2(iii). Item's own option 2: keep fail-closed, return a typed read-only retry action instead of a signature ceremony. |
| `2026-08-07-lifecycle-guard-does-not-know-the-human-signing-commands` | D | open; direction 1 (3-name patch) landed 2026-08-19 (verified in item); ⚖ direction 2 is the Alfred scope | → WP-B2(v). Derive the signing-command list from the CLI's parsed command set, or a drift check that fails when they disagree. Registration-that-nothing-forces-complete is the class; same pattern as B2(vi). |
| `2026-08-27-registering-a-verify-suite-silently-invalidates-the-capability-inventory` | D | new; 4th recurrence; instance fixes landed same day (`14e3b9b1`, `5071b049`) — class open | → WP-B2(vi). Item option 1: derive `verify-phase` surfaces from `verify.mjs`'s own arrays; drift becomes impossible instead of detected late. |
| `2026-08-11-critic-route-pre-check-not-in-force-in-installed-plugin` | D | open; ⚖ deferred-to-Alfred 2026-08-17 | → WP-B2(vii). Release-process control: a typed "this duty is repo-live but not runtime-live until republish" disclosure derived from comparing checkout vs installed plugin identity (the preflight already reads both); plus the local-dev refresh route documented at the point of change. |
| `2026-08-27-gitleaks-content-fingerprint-breaks-on-any-line-insertion-above-it` | D | new; workaround known+mechanical | → WP-B2(viii). Diagnostic on block ("entry exists for file/rule/column at different line") + recompute helper; binding stays line-bound (the safe direction, per the item's own analysis). |

### Cluster 4 — Rules-as-code, small mechanical batch (→ WP-B3)

| Item | T | Fresh? | Disposition |
|---|---|---|---|
| `2026-08-27-ledger-commit-discipline-rules-live-only-in-checkpoint-prose` | W | new; rule 2 violated again same week — the recurrence is the case | → B3: define GG-22 in `guardrails/git.md`; ledger-workflow rules into `backlog/README.md`; full-OID note beside them. |
| `2026-08-26-sendmessage-mid-task-scope-relay-rule-has-no-durable-home` | W | open | → B3: the no-scope-widening-via-SendMessage rule into `workflow-dispatch.md` (its natural home, alongside existing dispatch-relay pitfalls). |
| `2026-08-27-expires-at-rejects-a-non-round-trip-timestamp…` | D | new; known-uncorrected since 2026-08-19 | → B3: fix `docs/push-release-flow.md` (half 1); CLI keeps strict form deliberately but its error message must state the wanted form + show the corrected value (half 2, decided in spec). |

### Cluster 5 — Verify economics and cadence (→ WP-C2, WP-C3)

| Item | T | Fresh? | Disposition |
|---|---|---|---|
| `2026-08-16-verify-has-grown-to-269-suites-with-no-recorded-cost` | W | open; part 1 DONE (durationMs/reused landed `cd95c333`); ⚖ part 3 shape PO-decided (selective work tier, full at candidate/push); ADR-0065 owns part 2 | → WP-C2. Remaining scope only: the concrete selective-set design from now-available `durationMs` data (needs the one fresh full run), and part 4's consolidation rule ("a new check names the invariant no existing check pins" — becomes a Verify-registration precondition, same lever as B2(vi)). |
| `2026-08-24-critic-and-verify-cadence-may-be-too-fine-grained` | W | open; ⚖ analysis done + policy already encoded (`9e68599d`: bounded collection-block batching, lever 1 unchanged); `due: 2026-08-31` | → WP-C3. Validate the encoded policy against C1 dogfood data; close with evidence. No new design. |
| `2026-08-25-verify-range-mode-registration-for-orchestrator-commit-control` | I | open; design carried verbatim from closed parent; explicitly not required | → WP-C2 optional tail. Build as specified when a TP-3 ceremony batch is convenient (B2(ii) makes that cheap); explicitly droppable without breaking the epic. |

### Cluster 6 — Consumed as constraints (no own WP)

| Item | T | Disposition |
|---|---|---|
| `2026-07-25-managed-onboarding-success-contract` (deferred) | W | **PO-accepted 2026-08-28.** An acceptance-review rule for host-layout onboarding tests (success-contract test required; rejection-only tests only for unsupported layouts) applied wherever Alfred touches onboarding tests — `acceptance.md` AC-16/§D, not a WP. Target set re-derived post-Nova-rebase per the PO's constraint. |
| `2026-08-25-backlog-strip-for-dispatch-drops-every-section-after-triage` | D | ⚖ its own triage: deferred, workaround stands (cite raw paths in briefings). Alfred *uses* the workaround in every dispatch of this sprint; the one-line fix (strip only the Triage section's own body) rides in B3 as a mechanical fix since Alfred's own dispatches depend on correct stripping. |

## C. Verification notes (the re-checks behind "Fresh?")

- `8e3cdb8e` ("admit cat as a source in the bounded read-only pipeline
  family") — checked against the read-only-refusal item: different lane
  (bounded pipelines vs `opaque-interpreter-code`); item stands.
- `feab1246`/`7d0b8943` (flag-order-insensitive not-ready allowlist) — guard
  UX fixes; unrelated to the signing-command list; item stands.
- `14e3b9b1`/`5071b049` — capability-inventory *instance* repairs by the same
  session that filed the class defect; class stands (the item says so itself).
- `9e68599d` — the cadence policy paragraph exists in
  `docs/operating-model.md` §4 step 7; the item's remaining scope is
  validation, matching its own acceptance text.
- Verify suite count in the item title (269) is historical; the live count is
  471 (2026-08-27 handover). The item's parts, not its number, are the scope.
