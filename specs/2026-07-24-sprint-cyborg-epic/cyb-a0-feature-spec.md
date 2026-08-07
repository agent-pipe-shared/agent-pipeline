# CYB-A0 — assurance quickfix: recovery-preview callback attestation (feature spec)

> **Status: DRAFT, design-phase, pre-gate.** Self-contained Phase I package
> (spec.md §4: "Boundary: none (self-contained defect)"; no CYB-1 dependency).
> Absorbed backlog item: `pipeline.recovery-preview-callback-attestation`
> (`backlog/items/2026-07-20-recovery-preview-callback-attestation.md`), due
> 2026-07-27, expires 2026-08-03 if untriaged. Canonical status lives in the
> Nova ledger (`in_progress`, Cyborg-assigned per
> `backlog-acceptance-matrix.md`); this spec only prepares the Cyborg-side
> delivery, it does not self-close the Nova item.

## 1. What already exists (do not re-litigate)

`plugins/pipeline-core/lib/recovery-preview-attestation.mjs` (91 lines) already
implements: `createRecoveryPreviewInvocation`, `attestRecoveryPreviewDelivery`,
exact-key/invocation validation, a bounded synchronous callback timeout
(`RP-CALLBACK-TIMEOUT`), and fail-closed coverage for absent, empty, throwing,
async, malformed, replayed, invocation-mismatched, and digest-mismatched
acknowledgements (`docs/state.md` lines ~139-149, `HISTORY.md` 2026-07-21
entry). Full Host Verify + Security passed on the candidate that introduced
this. **This is real, already-landed work — the package is NOT starting from
zero.**

## 2. What remains open (the actual CYB-A0 scope)

The independent Critic did **not** approve the broader recovery package. The
only locally-persisted description of the findings (`HISTORY.md` 2026-07-21,
`docs/state.md`) is at this granularity: "replay acknowledgement state,
consumer API migration, and candidate-bound review evidence remain open." No
more detailed Critic report artifact was found in this repository (searched
`backlog/`, `docs/adr/`, root `HISTORY.md`) — this is itself a minor process
gap (Critic findings should be durably recorded per ADR-0014, not only
summarized in prose), but not one to fix by inventing detail that isn't
grounded.

**Consequence for sequencing:** CYB-A0 cannot go straight to a Goldfish fix
briefing, because the concrete current findings aren't precisely known (the
code may have partially moved since that Critic pass — e.g. the bounded
timeout addition may already address part of "replay acknowledgement state").
The honest next step is:

1. **Fresh independent Critic review** of the current `recovery-preview-attestation.mjs`
   HEAD state, dispatched with the backlog item's acceptance boundary as its
   brief (see §3), to get concrete, current, file/line-level findings —
   fresh-context, evidence-gated, per the standard Critic contract
   (ADR-0014). This replaces, not supplements, the stale prose summary.
2. **Goldfish fix briefing** built from that fresh Critic's actual findings
   (cannot be written correctly before step 1 completes).
3. **Second Critic pass** to confirm the fix, per the mandatory "every
   package: Full Verify + Security green, independent fresh-context Critic
   BEFORE the package PO gate" rule (spec.md §6).
4. **Ledger transition** back to Nova: `{item-ID, spec, candidate commit,
   evidence}` per the absorbed-backlog-items contract
   (`backlog-acceptance-matrix.md` note) — CYB-A0 never self-closes the Nova
   item.

## 3. Acceptance boundary (verbatim from the backlog item, already checkable)

- One preview invocation produces one acknowledgement bound to that preview.
- Success requires matching schema, preview digest, and invocation identity.
- Every missing, malformed, replayed, or mismatched acknowledgement is
  covered by deterministic negative tests and creates no delivery or
  recovery-success claim.
- The design adds no external identity, secret, network service, or private
  receipt authority.

These four bullets are already fixture-shaped (each maps to an existing or
addable negative test) and do not need further translation — unlike CYB-1's
issue-derived ACs, this item's proposal section was already written in
checkable form.

## 4. Gate

Self-contained (spec.md: "Boundary: none") — no cross-package re-approval
needed. Still subject to the universal package gate (Verify + Security green,
fresh Critic, PO gate) before the Nova ledger transition. No dispatch yet:
step 1 (fresh Critic dispatch) is the next actionable item, and dispatching a
Critic (read-only, no code changes) is consistent with staying in design-phase
tonight — but is deliberately NOT done in this AFK session either, since
Critic dispatch is itself a real resource-consuming action the PO should see
initiated with eyes open, not one more autonomous overnight decision stacked
on top of three others. Flagged as the concrete first action for the PO's
morning review.
