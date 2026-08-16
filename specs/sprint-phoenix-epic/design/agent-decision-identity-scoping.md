# The `agent-decision` producer — scoping result

**Status:** scoping step, 2026-08-16. Executes step 2 of
`agent-decision-journal-production-producer.md` §6 ("Run the `agent-decision`
scoping step … Elephant-context investigation, not a dispatch"). No code is
written or dispatched by this document.

**Result in one line:** the producer candidate that §4 named at medium
confidence is wrong, and the right one already implements A-AC-05's substance
in a different vocabulary.

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

**The right candidate is `plugins/pipeline-core/lib/main-session-route.mjs`.**
Its `reconcileMainSessionRoute` (`:80`) records four of the seven dimensions on
every call, and it already separates the two axes A-AC-05 requires — it just
names them `desired`/`observed` and `code`/`reasonCode` instead of
`provenance`/`assurance`.

## 2. Why that module, read from source

`IDENTITY_DIMENSIONS` (`agent-decision-journal.mjs:8`) is
`runner, model, effort, profile, role, adapter, capability`.
`reconcileMainSessionRoute`'s inputs and outputs cover four of them directly:

| A-AC-05 dimension | where it appears in `main-session-route.mjs` |
|---|---|
| `runner` | `desired.runner` (`:30`), `observed.runner` (`:46`); constrained to `["claude","codex"]` at `:41` |
| `model` | `observed.modelId` (`:47`), carried as `selector: { kind: "model-id", value }` (`:97`) |
| `effort` | `desired.effort` (`:32`), `observed.effort` (`:48`) |
| `profile` | the `profile` argument that selects the registry cell (`:26`) |

`role` is recorded elsewhere and thinly: `continuity-state.mjs`'s
`RUNTIME_KEYS` (`:21`) admits `activeDuty`, validated only as a safe id
(`:163`). It carries no provenance and no assurance at all. `adapter` and
`capability` were not mapped in this pass — see §6.

## 3. The vocabulary already matches, term for term

This is the substance of the finding. `IDENTITY_PROVENANCE` is
`same-dispatch-observed, requested-route, inherited-session, unknown`;
`IDENTITY_ASSURANCE` is `verified, reported, inferred, unknown`. The module
draws exactly those distinctions, and its own comments say so:

- **`requested-route` is stated verbatim in the header** (`:6`): *"A requested
  profile route is policy, not identity evidence."* `desiredRoute` (`:25`)
  reads the runner-profiles registry — that is the requested route, and the
  module already refuses to treat it as evidence.
- **The evidence bar is a provenance bar.** `observedMainSession` (`:36`)
  admits a value only when `subject === "main-session"` **and**
  `source === "host-introspection"`. The header adds (`:8`): *"a
  child/dispatch receipt can never satisfy this boundary"* — which is the
  module refusing to let `same-dispatch-observed` stand in for a main-session
  observation.
- **The five outcome codes are an assurance ladder.** `MSR-ALIGNED` (`:101`)
  and `MSR-PO-EXCEPTION` (`:104`) both require a host-attested observation →
  `verified`. `MSR-UNVERIFIED` with `MSR-HOST-OBSERVATION-UNAVAILABLE` (`:93`)
  is `unknown` by name. `MSR-DRIFT-RETURN-REQUESTED` (`:113`) carries a
  verified observation that contradicts the requested route — the
  `contradicted` state, on a `selection` kind.

So a producer here is a **translation**, not a new judgment. Every value the
event needs is already computed and already justified in this module; nothing
has to be inferred, and no new policy decision is smuggled in. That is the
opposite of the P-AC-11 failure mode, where representation landed ahead of any
decision point that could use it.

## 4. A-AC-01's ordering requirement is satisfiable here

A-AC-01 requires recording *before* the dependent action. Two properties make
this seam unusually favourable, both read from source rather than assumed:

1. `reconcileMainSessionRoute` is **pure** — the header states it "cannot
   change a model, persist an acknowledgement, or infer identity from a child
   route receipt" (`:76`). A pure reconciliation followed by a caller-side
   action is already the "decide, record, then act" shape.
2. The drift path returns `action: { kind: "request-main-session-route-change",
   automatic: false }` (`:118`) and the header instructs callers to *"persist
   `observed.eventId` only after displaying a drift request"* (`:78`). The
   dependent action is therefore explicitly deferred to the caller, with an
   explicitly-stated ordering constraint — the journal append slots in ahead of
   it without restructuring anything.

## 5. The seam is live, not hypothetical

`post-compact-reground.mjs` calls it on every re-grounding
(`mainSessionRouteProjection`, `:83`; wired at `:138`). The 2026-08-16 session's
own re-grounding payload carried, verbatim:

```
"mainSessionRoute":{"code":"MSR-UNVERIFIED","desired":null,"observed":null,
"action":null,"reasonCode":"MSR-DESIRED-ROUTE-UNAVAILABLE"}
```

An identity reconciliation ran, produced a typed unverified result, and was
recorded nowhere machine-readable. That is one observation of the gap this
package would close, from this repository's own operation.

### 5.1 Why that result was `MSR-DESIRED-ROUTE-UNAVAILABLE` — and why it matters

The obvious reading is that the runner-profiles-v3 registry has no cell for
this profile/phase/runner combination. **That reading is wrong, and checking it
changes the conclusion.**

`config/runner-profiles-v3.json` carries `execution_phase` → `claude` for every
registered profile (`:12`, `:22`, `:32`, and the duty entries at `:39`–`:63`),
and `phaseRouteId` (`post-compact-reground.mjs:72`) maps everything that is not
`design` to `execution_phase`. The phase was `implementation`. So a cell exists,
and a lookup with real arguments would have found one.

The lookup did not have real arguments. `mainSessionRouteProjection` (`:83`)
reads `profile` and `runner` out of `input.pipelineMainSessionRoute`, and falls
back to `{}` when that key is absent — which the hook's own comment says is the
normal case: *"SessionStart input is not a model attestation by itself. A host
adapter may provide one separately under `pipelineMainSessionRoute`"* (`:77`).
No such adapter supplied one here, so `desiredRoute` was called with
`profile === undefined` and returned `null` before any registry cell was
consulted.

**Consequence for the producer, and it is a real constraint:** in a session
where the host supplies no route context, every reconciliation yields
`MSR-UNVERIFIED` with all four dimensions absent. A producer wired here without
that context would emit nothing but `unknown` identities — recording that an
identity decision happened while recording no identity. Whether the Claude host
adapter can supply `pipelineMainSessionRoute` at all is therefore a
**precondition** of this producer being worth building, not a detail to settle
afterwards. It is not answered here.

`activeDuty: "Elephant"` was carried in the same payload with no provenance or
assurance beside it — §2's `role` gap showing up in the same artifact.

## 6. What this scoping does NOT resolve

- **`adapter` is registered but was not traced to a recording site.**
  `runner-profiles-v3.json` carries `adapter` as a first-class field on the
  advisory duty's fallback chain (`"adapter": "native-opus"` and
  `"adapter": "consult"`, `:76`–`:77`), alongside an `assuranceClass` (`:101`)
  and an `"evidence": "dispatch-receipt"` marker on every profile cell. That is
  strong evidence A-AC-05's `adapter` dimension has a home in this repository —
  but registry *content* is not a *recording site*, and this pass did not
  follow those fields to whichever code reads them. Do that before assuming the
  four dimensions of §2 are the whole surface.
- **`capability` is unmapped.** A keyword sweep of
  `plugins/pipeline-core/lib` returns ~44 files, almost all matching unrelated
  senses of the word (security capability plans, forge capabilities, runner
  capability reports). Deciding whether any of them *records an identity* in
  A-AC-05's sense needs its own pass; this document claims nothing about them.
- **A-AC-01 has a field gap.** It names "domain, status, selected option,
  stable reason codes, evidence basis/gaps, and revalidation trigger".
  `validateAgentDecisionEvent` (`agent-decision-journal.mjs:40`) covers the
  first five — `kind`, `state`, `candidateDigest`/`identity`, `reasonCode`,
  `assumptionState` (whose `unavailable`/`unknown` members are exactly the
  "gaps" half). **No field carries a revalidation trigger.** Whether that is a
  missing field, a caller's concern, or an amendment is undecided here, and it
  is the one thing that could keep A-AC-01 from reaching `implemented` even
  with a working producer.
- **No producer exists yet, confirmed.** `validateAgentDecisionEvent` is
  imported in exactly two places: its own test, and
  `governance-event-store.mjs` (`:29`), which uses it only as a *validator* on
  the append path (`:320`, `:351`) and additionally requires
  `event.eventType === "agent.${journal.kind}"` and a candidate-digest binding
  (`:353`). The store side of the integration is finished; the caller is what
  is missing. This matches the backlog item's premise rather than restating it
  on faith.
- **Nothing here changes a criterion's status.** No code changed. A-AC-01 and
  A-AC-05 stay where they were.

## 7. Recommended sequencing, revised

1. Finish the `command-offer` producer first (`PHX-WP-RAC08-OFFER-PRODUCER`,
   in flight). It proves the append/readback integration shape end-to-end
   against a state machine that is already complete and tested; the
   `agent-decision` producer reuses that shape rather than inventing a second.
2. **Settle §5.1's precondition before building anything here.** Determine
   whether a Claude host adapter can supply `pipelineMainSessionRoute`. If it
   cannot, a producer at this seam records `unknown` for every dimension and is
   not worth building yet — and that answer redirects the package rather than
   merely delaying it.
3. Then build the `agent-decision` producer at `main-session-route.mjs`'s
   caller boundary — **not inside the pure function**, which must stay pure
   (§4.1). One `selection` event per reconciliation, `identity` carrying the
   four dimensions of §2, provenance/assurance mapped per §3.
4. Resolve A-AC-01's revalidation-trigger gap (§6) as a decision before, not
   during, that build. It is the only part of A-AC-01 that a producer alone
   cannot close.
5. Trace the registry's `adapter` field (§6) to whatever code reads it. Unlike
   `capability`, it is already a first-class registry concept, so the odds of a
   real recording site are good and the cost of looking is one pass.
