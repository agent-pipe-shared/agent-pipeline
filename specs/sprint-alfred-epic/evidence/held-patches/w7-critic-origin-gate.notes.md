# W7 held patch: Critic finalize requires a Source-issued origin record (Cut A)

Candidate: fa6cb7f99ea071b789c38d16aaef0c74e996ef04. Slice W7-CRITIC-ORIGIN-GATE-C1-20261027. Recon: scratch/wave3/recon-critic-finalizer-independence.md (cited lines re-verified against the clone: finalize at the old :453-562, recordCandidateResult before the gate, CLI passes deps through, REQUEST_KEYS and RECEIPT_KEYS closed; no contradiction found).

## Cause
`finalizeSessionCriticReview` accepted any caller-authored, schema-valid verdict for an admitted packet; nothing proved a fresh session returned it.

## Change (patch touches only the two files below)
- `plugins/pipeline-core/scripts/session-critic-finalizer.mjs` (+30): new `originGate()` plus constants after `fail()`; one call between `validateSessionCriticReceipt(receiptFor(result))` and `recordCandidateResult`; `...independence` spread into both result envelopes (completed, source-complete/event-unavailable).
  - Injectable `deps.readOriginalSourceReturnFn(query)` with query `{packetId, packetDigest, claimant:{runner,adapter}, sessionId, verdictSha256}`. Default reader: typed `SCF-ORIGINAL-SOURCE-UNAVAILABLE` (a throw or null/undefined result also counts as unavailable).
  - Record shape `pipeline.session-critic-source-return.v1`: exact keys schema, issuer("source"), packetId, packetDigest, claimant, sessionId, verdictSha256, issuedAtMs, expiresAtMs. Any mismatch, extra key, or expiry gives `SCF-ORIGINAL-SOURCE-BINDING`. Replay is refused by the existing packet consumption.
  - Opt-in `options.allowCallerAuthoredFallback === true` (options only, never the request file) covers only the unavailable case: envelope gets `independence: "caller-authored-fallback"`, `origin: "caller-authored"`, `nativeAttestation: false`. A bound record gives `independence: "source-issued-origin"`, `origin: "source"`, `nativeAttestation: false`. Receipt, RECEIPT_KEYS and request schema unchanged.
  - Validator stays in the finalizer; no new lib file; finalizeSessionCriticReviewWithLaunchContext not rewired.
- `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs` (+120/-2): import renamed `finalizeSessionCriticReview as finalizeRaw`; a local wrapper named `finalizeSessionCriticReview` injects a bound origin stub through deps so every pre-existing case keeps its assertions untouched; the CLI happy-path case passes the stub as the CLI deps argument (only change to an existing case body, justified: the gate is unavailable-by-default). New cases "Cut A (1)" to "Cut A (6)" per the recon: unavailable and unconsumed; caller-offered origin ignored (options, verdict, CLI request gives SCF-REQUEST); wrong packetDigest/sessionId/claimant/verdictSha256/packetId/issuer/schema/expiry/extra key and replay; bound record completes with source marker; fallback marker, bad binding not masked, non-true flag ignored; CLI without origin exits 2 with the typed code.

## Evidence (driver logs in the scratch w7d directory, gitignored)
- RED (unchanged production code, new cases in place): 6 new cases failed (Cut A 1-6) plus 1 pre-existing failure.
- GREEN (patched clone): the only failing case is the pre-existing "a root-authored candidate keeps its empty-tree base but cannot register a generic batch review unit"; all six Cut A cases pass.
- Baseline (clone2, unchanged candidate): failing-name set = {that same pre-existing case}; patched failing-name set = identical. The pre-existing failure (GenericCriticBatchError, assertion at the old line 496) is unrelated to this slice and untouched.
- Pass/total counts were not captured: the node reporter tail printed by the driver only lists failures (not verified beyond failing-name sets).
- Apply check: `git apply --check` of the patch in clone2 at the candidate: exit 0.

## NOT done
- critic-review SKILL.md note about the opt-in (out of scope; follow-up). The CLI offers no opt-in, so the live CLI finalize flow fails typed-unavailable until Cut B (runner-side producers: Claude SubagentStop, Codex, AGY) or a CLI opt-in lands.
- Cut B producers; no native positive claimed.
- Independent Critic review stays a parent-owned batch gate; Full Verify, native host and PO acceptance pending.

## Proposed commit message
feat(critic): finalize requires a Source-issued origin record, unavailable by default, with an explicit caller-authored fallback marker (Cut A)

## Operator flow
1. `git apply` the patch from the repository root.
2. `git add -u -- plugins/pipeline-core/scripts/session-critic-finalizer.mjs plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs` (path-limited).
3. Commit with `--no-verify` using the provenance message file route.
4. Stamp, then install.

## Protected-path classification observed
Neither edited file matched any TP-1..TP-13 pattern; edits were made only in the scratch clone, so no guard denial occurred. Nothing under plugins/ was edited in the repository.
