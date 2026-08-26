# The `agent-decision` producer — scoping result

**Status:** scoping step, 2026-08-16. Executes step 2 of
`agent-decision-journal-production-producer.md` §6 ("Run the `agent-decision`
scoping step … Elephant-context investigation, not a dispatch"). No code is
written or dispatched by this document.

**Revision note.** This document was written in three passes on the same day and
the conclusion moved twice (commits `5d2b8240`, `6c3f66ca`, and this one). The
text below is the third pass; the git history carries the earlier two. Both
revisions came from checking a claim rather than from new information, which is
recorded here because the pattern is the point: the first pass named a candidate
without tracing its fields, and the second asserted a cause without reading the
registry.

**Result in one line:** the producer candidate §4 named at medium confidence is
wrong, and A-AC-05's substance is not missing — it is collected in at least
three production paths that each separate a requested route from an observed
one, none of which speaks the journal's vocabulary.

---

## 1. The question, and the answer

§6.2 asked:

> does `continuity-select-course` / `continuity-apply-decision` carry the
> selection/escalation/fallback semantics A-AC-05 names, and is there a point
> that is genuinely *before* a dependent action for A-AC-01?

**No, it does not.** That machinery is real — `pipeline-state.mjs` carries
`courseDecisionIntents` and `courseDecisionReceipts` as first-class collections
with their own splice/readback discipline (`:1294`–`:1330`, `:1908`–`:2042`),
and the two subcommands exist (`:2120`, `:2179`). But what it records is *which
course was chosen for a work package*, correlated by `intentSha256`. It carries
none of the seven identity dimensions A-AC-05 names. Marking that row "medium
confidence" was right, and the confidence was misplaced rather than merely
uncertain.

**The answer is bigger than a replacement candidate.** A-AC-05 says: *WHEN
runner, model, effort, profile, role, adapter, or capability identity is
recorded, THE SYSTEM SHALL include its provenance and assurance.* Three separate
production paths already record several of those dimensions, and all three
already draw the provenance distinction the criterion demands — under their own
names, and in their own comments. **The gap is translation into the journal's
vocabulary, not collection.**

## 2. The three collection sites

`IDENTITY_DIMENSIONS` (`agent-decision-journal.mjs:8`) is
`runner, model, effort, profile, role, adapter, capability`.

| site | dimensions recorded | requested vs. observed | bound to |
|---|---|---|---|
| `lib/advisory-receipt.mjs` + `lib/advisory-coordinator.mjs` | `adapter`, `runner`, `model`, `effort`, `profile` — **five of seven** | `configuredRoute` vs. `observed.identity` | a dispatch (`dispatchId`, `candidateCommit`, `candidateTree`) |
| `lib/route-receipt.mjs`, consumed at `lib/runner-usage-v1.mjs:498` | `runner`, `model`, `effort` (as `effectiveModelId`/`effectiveEffort`) | `projectedRoute` vs. effective model | `dispatchBinding` + `trustedEvidence` |
| `lib/main-session-route.mjs` | `runner`, `model`, `effort`, `profile` | `desired` vs. `observed` | a host-introspection observation |

`role` is recorded elsewhere and thinly: `continuity-state.mjs`'s `RUNTIME_KEYS`
(`:21`) admits `activeDuty`, validated only as a safe id (`:163`). It carries no
provenance and no assurance at all. `capability` remains unmapped (§6).

### 2.1 The advisory receipt is the strongest of the three

It is worth separating out, because it is the only one of the three that is
both **produced in this repository** and **persisted as its own evidence
artifact** with a committed schema (`scripts/advisory-receipt.schema.json`).

- `makeReceipt` (`advisory-coordinator.mjs:115`) constructs it; `adapter` comes
  from `step.kind` (`:123`). This is a real producer, not a validator waiting
  for a caller — the distinction that makes the `agent-decision` journal itself
  empty (§6).
- `ADVISORY_ADAPTERS` is `["native", "consult"]` (`advisory-receipt.mjs:25`),
  enforced at `:89`. That is A-AC-05's `adapter` dimension, closed and
  validated, in production.
- Its header states the provenance rule in the criterion's own terms (`:57`):
  *"Validate a receipt without treating an agent's self-report as route
  attestation. Callers that need route attestation must bind this receipt to
  their own dispatch/route evidence separately."*
- `fallback` is a first-class field (`:109`), with a `reason` and a
  `redactedErrorClass` cross-checked against it (`semanticFailure`, `:48`).
  A-AC-05's `IDENTITY_KINDS` are exactly `selection`, `escalation`, `fallback`.
- `observed-runner-drift` (`:97`) rejects a receipt whose observed provider
  contradicts the configured runner. That is an assurance check, not a
  recording — the system already refuses to record an identity it can
  contradict.

## 3. The vocabulary maps term for term

`IDENTITY_PROVENANCE` is
`same-dispatch-observed, requested-route, inherited-session, unknown`;
`IDENTITY_ASSURANCE` is `verified, reported, inferred, unknown`.

- **`requested-route`** is the `configuredRoute` / `projectedRoute` / `desired`
  half of all three sites. `main-session-route.mjs`'s header states it verbatim
  (`:6`): *"A requested profile route is policy, not identity evidence."*
- **`same-dispatch-observed`** is the advisory receipt's `observed.identity`
  and the route receipt's effective model — both bound to a dispatch id.
- **`unknown`** is `observed.identity === null` (advisory) and
  `MSR-HOST-OBSERVATION-UNAVAILABLE` (main session).
- **Assurance** is the outcome ladder: advisory's `observed.status`
  (`answered, unavailable, failed, timed-out, permission-denied`) and
  main-session's five `MSR-*` codes. `MSR-ALIGNED` and `MSR-PO-EXCEPTION`
  require a host-attested observation → `verified`; a receipt accepted only
  after `observed-runner-drift` passes is likewise `verified` rather than
  `reported`.

So a producer here is a **translation** of values already computed and already
justified. Nothing has to be inferred and no new policy decision is smuggled in.
That is deliberately the opposite of the P-AC-11 failure mode, where
representation landed ahead of any decision point that could use it.

## 4. A-AC-01's ordering requirement, and which site satisfies it

A-AC-01 requires recording *before* the dependent action. The three sites differ
here, and this is what keeps `main-session-route.mjs` in the picture despite §2.1:

- **The receipts record after the fact.** An advisory receipt is emitted once
  the adapter has answered or failed; a route receipt describes a dispatch that
  has run. Both are excellent A-AC-05 evidence and neither is an A-AC-01
  "before".
- **`main-session-route.mjs` records before.** `reconcileMainSessionRoute` is
  pure by contract — its header states it "cannot change a model, persist an
  acknowledgement, or infer identity from a child route receipt" (`:76`) — and
  the drift path returns `action: { kind: "request-main-session-route-change",
  automatic: false }` (`:118`) with the instruction to *"persist
  `observed.eventId` only after displaying a drift request"* (`:78`). The
  dependent action is explicitly deferred to the caller, with an explicitly
  stated ordering constraint. A journal append slots in ahead of it without
  restructuring anything.

## 5. The seam is live, not hypothetical

`post-compact-reground.mjs` calls the reconciliation on every re-grounding
(`mainSessionRouteProjection`, `:83`; wired at `:138`). The 2026-08-16 session's
own re-grounding payload carried, verbatim:

```
"mainSessionRoute":{"code":"MSR-UNVERIFIED","desired":null,"observed":null,
"action":null,"reasonCode":"MSR-DESIRED-ROUTE-UNAVAILABLE"}
```

An identity reconciliation ran, produced a typed unverified result, and was
recorded nowhere machine-readable. `activeDuty: "Elephant"` rode in the same
payload with no provenance or assurance beside it — §2's `role` gap in the same
artifact.

### 5.1 Why that result was `MSR-DESIRED-ROUTE-UNAVAILABLE`

The obvious reading is that the runner-profiles-v3 registry has no cell for this
profile/phase/runner combination. **That reading is wrong, and checking it
changes the recommendation.**

`config/runner-profiles-v3.json` carries `execution_phase` → `claude` for every
registered profile (`:12`, `:22`, `:32`, and the duty entries at `:39`–`:63`),
and `phaseRouteId` (`post-compact-reground.mjs:72`) maps everything that is not
`design` to `execution_phase`. The phase was `implementation`. A cell exists.

The lookup had no arguments. `mainSessionRouteProjection` (`:83`) reads
`profile` and `runner` out of `input.pipelineMainSessionRoute` and falls back to
`{}` when that key is absent — which the hook's own comment describes as the
normal case: *"SessionStart input is not a model attestation by itself. A host
adapter may provide one separately under `pipelineMainSessionRoute`"* (`:77`).
No adapter supplied one, so `desiredRoute` returned `null` before any cell was
consulted.

**Consequence:** in a session where the host supplies no route context, every
main-session reconciliation yields `MSR-UNVERIFIED` with all four dimensions
absent. A producer wired *only* there would record that an identity decision
happened while recording no identity. This is the single strongest argument for
starting at the advisory receipt instead, where the values are present by
construction.

## 6. What this scoping does NOT resolve

- **No `agent-decision` producer exists, confirmed by reading both import
  sites.** `validateAgentDecisionEvent` is imported in exactly two places: its
  own test, and `governance-event-store.mjs` (`:29`), which uses it only as a
  *validator* on the append path (`:320`, `:351`) and additionally requires
  `event.eventType === "agent.${journal.kind}"` and a candidate-digest binding
  (`:353`). The store side is finished; the caller is what is missing. Contrast
  `makeReceipt` (§2.1), which is what a real producer looks like in this
  codebase.
- **`capability` is unmapped.** A keyword sweep of `plugins/pipeline-core/lib`
  returns ~44 files, almost all matching unrelated senses of the word (security
  capability plans, forge capabilities, runner capability reports). Whether any
  of them *records an identity* in A-AC-05's sense needs its own pass.
- **The route receipt's producer was not traced.** `runner-usage-v1.mjs:498`
  *validates* one; who constructs it — a host adapter, a runner, or in-repo
  code — was not established here, and neither was whether that call site is
  reached in ordinary operation or only under test. Establish both before
  choosing it as the producer seam.
- **A-AC-01 has a field gap.** It names "domain, status, selected option,
  stable reason codes, evidence basis/gaps, and revalidation trigger".
  `validateAgentDecisionEvent` (`agent-decision-journal.mjs:40`) covers the
  first five — `kind`, `state`, `candidateDigest`/`identity`, `reasonCode`,
  `assumptionState` (whose `unavailable`/`unknown` members are exactly the
  "gaps" half). **No field carries a revalidation trigger.** Whether that is a
  missing field, a caller's concern, or an amendment is undecided, and it is the
  one thing that could keep A-AC-01 from reaching `implemented` even with a
  working producer.
- **Nothing here changes a criterion's status.** No code changed. A-AC-01 and
  A-AC-05 stay where they were.

## 7. Recommended sequencing, revised

1. **Finish the `command-offer` producer first**
   (`PHX-WP-RAC08-OFFER-PRODUCER`, in flight). It proves the append/readback
   integration shape end-to-end against a state machine that is already complete
   and tested; the `agent-decision` producer reuses that shape rather than
   inventing a second one.
2. **Build the A-AC-05 producer at the advisory receipt** (§2.1) — five of seven
   dimensions, both axes, a closed `adapter` enum, a first-class `fallback`, an
   existing drift check, and a real in-repo constructor to hang it off. It has
   no missing-host-context precondition, which is what disqualifies the main
   session seam as a starting point (§5.1).
3. **Then extend to `main-session-route.mjs` for A-AC-01's ordering clause**
   (§4) — at the *caller* boundary, never inside the pure function. Settle
   §5.1's precondition first: if no Claude host adapter can supply
   `pipelineMainSessionRoute`, this step records `unknown` for every dimension
   and should be deferred rather than built.
4. **Resolve A-AC-01's revalidation-trigger gap** (§6) as a decision before, not
   during, that build. A producer alone cannot close it.
5. **Trace the route receipt's producer and the `capability` dimension** (§6)
   only if steps 2–3 leave A-AC-05 short of `implemented`.
