---
schema: pipeline.backlog-item.v1
id: pipeline.a7-gate-review-found-a-spec-plan-contradiction-and-a-lifecycle-admission-question
type: defect
owner: pipeline
status: closed
created: 2026-08-17
source: "Nova A Slice A7 comprehensive gate Critic review (continuation dispatch), 2026-08-17, findings F3 (major) and F4 (minor). Both are documentation/spec-conformance questions deliberately NOT resolved unilaterally by the Elephant, per spec.md's own rule that a contradiction fails closed to the applicable human gate rather than being silently narrowed."
closed_at: "2026-08-19T11:39:04Z"
closure_repository: self
closure_commit: "fe645b8290de651f48f0a638db1841eb15915481"
closure_evidence: "backlog/items/2026-08-17-a7-gate-review-found-a-spec-plan-contradiction-and-a-lifecycle-admission-question.md"
---

# A7 gate review found a spec/plan contradiction (F3) and a lifecycle-admission question (F4)

## F3 (major) — `acceptance.md`'s NVA-G15 appears to contradict an already-made, well-reasoned PO decision

**Finding.** `specs/sprint-nova-epic/acceptance.md`'s NVA-G15 requires "an exact externally
verified human proof … attribution alone SHALL fail closed" at the push/deploy/publication/
release-preflight boundaries. But `plugins/pipeline-core/lib/critical-human-proof-policy.mjs`
(confirmed by reading the code, not assumed) resolves an absent/empty v3 `trustAnchors` set by
deriving the trust identity **from the proof itself** and verifying against that — i.e. any
well-formed Ed25519 key satisfies the check when no anchor is committed. `critical-action-authorization.mjs`'s
`trustAnchorsFor` passes an empty set straight through, so this is the live behavior for
push/deploy/publication/release-preflight, not a hypothetical.

**This is not an accidental gap — it is a deliberate, extensively reasoned PO decision, already on
record.** `specs/sprint-nova-epic/plans/nova-setup-bootstrap.md` §5a (2026-08-08) documents the
PO's own stated intent at length: *"the system must assure that **a** human audited, deliberately
**not which** one"*, and the PO's own generalizing principle: *"we make sure agents do not break
out and do strange things; humans doing strange things is a layer addressed elsewhere."* §5a
concludes explicitly: *"This resolves §5's downgrade rule, and it resolves it downward."* Attribution
is explicitly preserved (the record still names which key signed) even though the key is not
restricted to one pinned anchor.

**The actual gap is that `acceptance.md`'s NVA-G15 text was never updated to reflect this
2026-08-08 decision**, so the two documents now read as contradictory on paper even though the
underlying design is sound and already decided. Per `spec.md` §1's own rule (*"A contradiction
fails closed and returns to the applicable human gate; this document cannot silently narrow
acceptance"*), reconciling NVA-G15's wording is a PO-visible action, not something to resolve
silently in an AFK block — even though the PO has, in substance, already made this call once.

**Not fixed this block, deliberately.** Recommended direction, for the PO to confirm rather than
assume: reconcile NVA-G15's text to state the "attribution, not restriction" property §5a actually
decided (any well-formed key may sign; the approval record must capture which key did, so "who
approved this" stays answerable after the fact even though it is not enforced beforehand) — matching
`docs/adr/0058-guard-maintenance-window.md`'s OWN opposite posture for the Guard Maintenance Window
specifically (which correctly stays fail-closed on an absent/empty anchor set — GMW lifts protection
rather than gating a human-authored action, so §5a's "humans doing strange things is a layer addressed
elsewhere" reasoning does not transfer to it, and `NVA-ADR65TIERFIX`'s GMW fix this same session
independently confirmed the two mechanisms should NOT share the same posture).

## F4 (minor) — `po-authority-rebind-apply` may be admitted more broadly than `spec.md` §1.1 states

**Finding.** `spec.md` §1.1 item 1: the lifecycle guard "admits only the exact physical
State-writer command `po-authority-rebind-plan` as a read-only recovery while the matching
`po_authority_rebind_unavailable` partial condition exists. It does not admit apply, any other
writer subcommand."

Independently re-verified (not just the Critic's claim): `guard-lifecycle-ready.mjs`'s
`isExactPoAuthorityRebindPlannerRecovery` (~line 1523) correctly gates the read-only `-plan` command
behind a live check of the current diagnostic condition. But `sanctionedPoAuthorityRebindArgs`
(~line 1487), which admits `po-authority-rebind-apply` by matching its digest/timestamp/`--activate`
argv shape, is reached via `sanctionedPipelineStateArgs` → `sanctionedArgs`'s `PIPELINE_STATE_SCRIPT`
branch (~line 1746) with **no condition check at that call site** — contrast the SAME file's own
`apply-legacy-v2-revocation-recovery`, which explicitly `return`s `false` unconditionally with a
comment stating exactly why ("state deliberately remains denied so the central adapter can consume
its exact, one-time attended Human-override capability. Merely spelling a valid digest-bound argv is
never Human authority") — `po-authority-rebind-apply` gets no equivalent treatment or comment.

**Genuinely ambiguous, not resolved here.** Two readings, both plausible: (a) the code is right and
`spec.md` §1.1's sentence is imprecisely scoped — it may have meant only the narrow read-only
recovery LANE, which the digest-bound apply doesn't belong to at all; (b) the code under-gates a
genuine writer action the spec explicitly excludes. Distinguishing them needs tracing whether
`--plan-sha256` can only ever be populated by a value the condition-gated `-plan` step itself
produced (in which case the practical exposure is much narrower than "admitted unconditionally"
suggests) — not done this block.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — deferred. F3 needs PO confirmation of the reconciliation direction
  (not a new decision — ratifying wording to match a decision already made 2026-08-08). F4 needs
  a proper trace of the plan-sha256 provenance chain before either reading can be ruled out.
- **Rationale:** F3 touches acceptance-criterion wording directly (`spec.md`'s own contradiction
  rule applies); F4's ambiguity means a rushed fix risks solving the wrong problem (over-restricting
  a legitimately narrow digest-bound path, or leaving a real gap open).
- **Assignment (if accepted):** F3 — next PO touchpoint. F4 — a dedicated, focused read of the
  plan-sha256 provenance chain, owner `pipeline`, due `2026-08-30`.
- **Date:** 2026-08-17

### F3 resolved, PO-confirmed 2026-08-19

F3's reconciliation was already implemented earlier this session (commit
`4a227a79`, dispatch `NVA-W3-1`, PO decision 2026-08-18 #1 direction D):
`specs/sprint-nova-epic/acceptance.md`'s NVA-G15 row now states the
any-well-formed-key/attribution-not-restriction posture; `lifecycle.json`'s
digest was re-hashed to match. PO explicitly confirmed 2026-08-19 that this
reconciliation is correct and complete — F3 is resolved. **F4 remains
genuinely open** (own due date 2026-08-30, does not block the Nova A 0.6.0
candidate) — item stays `open` for F4 only.

### F4 design, 2026-08-19

Traced the actual provenance of `--plan-sha256` end to end, per the item's
own stated next step. Conclusion: **reading (a) — the code is correctly
gated; `spec.md` §1.1's sentence is imprecisely scoped. No code fix is
needed.**

`sanctionedPoAuthorityRebindArgs`'s `po-authority-rebind-apply` branch
(`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:2007-2015`, current
line numbers — shifted from the finding's original `~1487`/`~1523`/`~1746`
estimates) admits the command purely by argv SHAPE (`--plan-sha256 <hex>
--updated-at <ISO> --activate`), with no live diagnostic-condition check at
that call site — confirmed exactly as F4 describes. But the guard is only
ONE of two independent gates. The actual state-writer,
`runPoAuthorityRebindApply` (`plugins/pipeline-core/scripts/pipeline-state.mjs:4882-4926`),
re-derives the plan from scratch against the CURRENT live repository state
— `buildPoAuthorityRebindPlan` (`pipeline-state.mjs:4067-4112`) computes
`planSha256` purely from the sha256 of the actual on-disk PRD/spec/state
file bytes (`physicalRebindFile` reads, not caller input) — and REFUSES
with "PO authority rebind plan is stale; zero mutation" the moment the
caller-supplied `--plan-sha256` doesn't match that live recomputation
(`pipeline-state.mjs:4896-4898`), then checks it a SECOND time immediately
before the actual mutation for same-run drift (`:4903-4907`, "preimage
drifted"). The only caller-supplied input besides the digest itself is
`--updated-at`, an ISO timestamp validated for format only — it does not
feed the digest's preimage.

This means `--plan-sha256` cannot be forged or replayed: producing a value
that passes `runPoAuthorityRebindApply`'s check requires the exact sha256 a
genuine `po-authority-rebind-plan` run against the CURRENT live state would
itself produce — computationally equivalent to actually having run the
real diagnostic-gated planner at that moment. The guard's argv-shape-only
admission is therefore not a security gap; the live-state verification the
finding was looking for happens one layer down, in the state-writer itself,
exactly the same way it already does for the file's OTHER two digest-bound
applies (`po-authority-decision-apply`, `po-authority-acknowledge-apply`),
neither of which has a guard-level condition check either — this is the
established, consistent pattern for this whole family, not a one-off gap.

**Recommended follow-up (optional, documentation-only, no behavior
change):** reword `spec.md` §1.1 to state that the guard admits
`po-authority-rebind-apply` by argv shape alone because the digest-bound
apply is self-verifying against live state in the underlying state-writer,
distinguishing it from the read-only `-plan` recovery lane's own guard-level
diagnostic gate. A short comment could also be added at
`guard-lifecycle-ready.mjs:2007` mirroring the existing
`apply-legacy-v2-revocation-recovery` comment's style, to make this
reasoning locally discoverable without needing this trace again. Neither is
required to close F4's ambiguity — the ambiguity itself is now resolved.

## Closure, 2026-08-19

Both findings resolved: F3 confirmed PO-accepted 2026-08-19 (see above).
F4's ambiguity is resolved by direct code trace — reading (a), the code
is correctly gated, no fix needed; the only remaining action is an
optional, non-blocking documentation reword, not required to close this
item's own ambiguity. No further code or design work is pending against
this item. Closing.
