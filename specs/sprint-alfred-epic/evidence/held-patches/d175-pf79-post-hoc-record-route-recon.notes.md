# D175 — PF-79 recon: is there an honest post-hoc dispatch-record route for work that was dispatched in the background?

Read-only recon (no production change). Follows `d172-pf79-admission-dispatch-record-recon.notes.md`, which left the producer route for "cause (a): dispatches happened but records were never written" open (PF-79 Wanted 3a).

## Findings (read from `plugins/pipeline-core/scripts/dispatch-record-write.mjs`, `lib/dispatch-record.mjs`)

1. **A native Claude/Codex authored v4 record cannot be written after the fact.** `publishDispatchRecord` (lines 204-216) refuses an authored Claude/Codex v4 record on the public JSON and object writers (`record-host-observation`: "authored Claude/Codex v4 must use the native host-observed writer"). The host-observed writer (`writeHostObservedNativeGoldfishDispatchRecord`) reopens the private native pending state and the host observation receipt through `inspectNativeGoldfishHostObservation`; if the dispatch was a background call, no host return reached the hook (the `NGHF-PENDING-UNAVAILABLE` notice) and that state never existed. A project cannot reconstruct it later.
2. **The remaining public route writes v3 or non-authored v4 records only, and for a terminal v3 record it demands a model/effort that matches the agent type or an exact declared override** (lines 221-228). A v3 record asserting work by a named agent is an authorship claim the writer cannot verify; writing one for work that had no recorded dispatch is the forgery the consumer correctly refused to do. This is not a route to document or to widen.
3. Consequently **documenting the existing writer (Wanted 3a) does not unblock a project whose dispatches were background calls.** What can honestly be done for that case is the new `undispatchedRangeEvidence` shape (Wanted 2), which is blocked on PO questions Q1-Q3 in the D172 notes.
4. What can be done without a PO decision, and is the content of the follow-up patch (D176): make the refusal at `scripts/check-critic-skip-coverage.mjs` `:903` / `scripts/critic-packet-preflight.mjs` `:512` name the missing path (`evidence/dispatch-record-<taskId>.json`), state that a record is produced by the host at the end of a foreground goldfish dispatch (host commit) and cannot be authored by hand, and point at the PO-decision item for a range without dispatch history. That addresses Wanted 4 and the consumer-visible part of Wanted 3.

## Preventive consequence for the dispatcher (Elephant)

A goldfish dispatch that the project later needs to review must run as a foreground call (or one whose host return reaches the hook), otherwise it leaves no admissible record. The background dispatches used in this repo's own overnight work are acceptable only because the work is reviewed through held-patch custody, not through record-based Critic admission. Whether a consumer ran background dispatches remains unknown; the consumer's `docs/pipeline-handover-07-critic-blocker.md` would settle it.

## Not established

Which of the two causes applies to Glossover; whether a typed "no dispatch history" declaration may ever be admitted (PO Q1).
