# HGO audit-repair Critic — round 1

**Range:** `67ccaf8fdd0ed0b7e6af8f3b0d47e6df58995009..ba2b745b91b6ca5a379dc90bd6c0c28eb324da56`

**Candidate tree:** `e59ea3d95f1963ee90876ef4eff04d19e8849540`

**Assurance:** functional-equivalent read-only; no OS-isolation claim

**Verdict:** FAIL

This is the coordinator-authored durable transcription and disposition of the
fresh-session Critic's in-session return. No separate raw Critic execution receipt
was produced; this document does not claim to be one.

The coordinator recorded that the Critic confirmed the implementation's fixture behavior,
reachability, additive interface, tamper checks, interruption/idempotency
coverage, malformed-UTF-8 refusal and absence of a guard relaxation. It found
three acceptance gaps in that reviewed candidate:

1. The repository's real torn ledger has not yet been repaired through the new
   attended operation and read back with `verify-audit`. Follow-up read-only
   verification found the live ledger already valid, with 6165 authenticated
   entries at the captured observation. The [live readback](2026-09-12-hgo-live-audit-readback.json)
   proves that state; fixture tests prove the new repair operation. It does not
   prove that the historical ledger was repaired by that operation. The
   [backlog disposition](../items/2026-09-02-a-torn-audit-append-has-disabled-every-human-guard-override-since-august-20.md)
   records why a valid live ledger is not deliberately damaged to repeat the
   historical incident. This evidence remains subject to correction review.
2. Abrupt-death stale-lock recovery lacked a named owner and expiry. This is
   now separated into
   `backlog/items/2026-09-12-a-crashed-hgo-writer-leaves-an-unrecoverable-audit-lock.md`,
   owned by the Pipeline team with a 2026-09-30 due date.
3. The final candidate still needs a detached threat-model approval binding;
   the rollback path also had to be explicit. The ADR now documents rollback.
   The detached approval must bind the final corrected candidate at push
   preparation; an approval of the provisional implementation commit would not
   cover later changes. This approval remains outstanding.

The implementation therefore remains under correction review. No PASS or
closure is claimed from this round.

After the review, the coordinator performed the missing read-only live check.
The first read passed with 6160 authenticated entries; a later capture on the
same day passed with 6165 after five ordinary denial events had been appended.
The final exact result is preserved in
`backlog/evidence/2026-09-12-hgo-live-audit-readback.json`. The ledger had
already been restored before `repair-audit` existed, so the correction does
not intentionally tear it merely to manufacture a live invocation.
