# Inventory baseline reds PCI16 / PCI24 / PCI30 (c14) (targeted delivery: green)

Candidate 6c41c8e418b0a039c3289f0bba9bb087d5e8054a. The patch is the INCREMENT on top of the follow-up bundle v2 (`w7-round3-followup-bundle-v2-2026-10-28.patch`): apply the bundle and commit it first, then this patch. Apply check in a second clone at the candidate with the bundle applied and committed: exit 0.

## Fault 1, PCI16 (HAW-A04c)
`finalizeSessionCriticReview(criticRequest)` ended in `SCF-ORIGINAL-SOURCE-UNAVAILABLE` from `originGate` (session-critic-finalizer.mjs lines 99-122, re-verified): a finalized verdict needs a Source-issued record or the caller option `allowCallerAuthoredFallback`. The fixture predates that gate. Fixed in the FIXTURE only: the finalize call now passes `{ readOriginalSourceReturnFn }` returning a record built as `originStub()` in session-critic-finalizer.test.mjs (lines 46-52): same schema, `issuer: "source"`, packetId/packetDigest/claimant/sessionId/verdictSha256 from the query, issuedAt/expiresAt around now. The Source-issued route is used, not the caller-authored fallback. The gate is untouched. Every later step (export prepare, signature verify, public export write, fresh-clone verify, tampered export, tampered inventory) passed in the green run; no second stale fixture assumption appeared.

## Fault 2, PCI24 (HAW-B01)
Printed finding before: `entry point admitted by plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs but named by no skill or guard: plugins/pipeline-core/scripts/architecture-measure.mjs (Usage: node scripts/architecture-measure.mjs --root <dir> [--apply] [--json])`.
Evidence: "admitted" is real (constants.mjs line 203 declares `scripts/architecture-measure.mjs`, scanned from lib/guard). "Named" scans only skill bodies, skill references, `hooks/guard-*.mjs` (not lib/guard) and prompt templates. The only prose naming (lib/guard/entry-gates.mjs line 124, architecture-entry-readiness.mjs line 344) lives outside that corpus, so the NAMING for an agent-read surface is missing, the checker is right. Decision (a): one real sentence in `plugins/pipeline-core/skills/pipeline-start/references/architecture-orientation.md` (migration paragraph) naming `scripts/architecture-measure.mjs` with its Usage line and that it only reports without `--apply`. No allowlist, no checker change. After: HAW-B01 passes (PCI24 green). `generate-architecture-overview.mjs --check` printed "Architecture overview current"; no architecture/map entry mentions the reference file, so no regeneration was needed (the check was invoked with `--root` at the clone; I did not independently confirm it resolved the clone rather than the repository).

## Consequence, PCI30
Turned green by itself once both faults were fixed (sub-run expects 29 pass / 1 fail). No third fault.

## RED / GREEN and counts (printed lines)
- RED = the existing cases PCI16, PCI24, PCI30 at the unchanged prerequisite state (clone2, log base.*): tests 30, pass 27, fail 3; failing names {PCI16, PCI24, PCI30}.
- GREEN (clone, patched, log green.*): tests 30, pass 30, fail 0. Failing-name set empty; baseline set {PCI16, PCI24, PCI30}. No existing case weakened or changed beyond the fixture argument in PCI16; no new case was added (the three existing cases are the criterion cases).
- session-critic-finalizer.test.mjs and check-verify-case-completion.test.mjs in the clone: started (logs green2.*), result NOT read before the budget checkpoint: not verified by me. Known baseline for the finalizer suite: one pre-existing failure `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`. This patch touches no file those suites cover.

## NOT done
Full Verify; independent Critic review (parent-owned batch gate); native Windows; PO acceptance; the two extra suite counts above.

## Proposed commit message
fix(inventory): give the PCI16 fixture a Source-issued origin record and name the architecture-measure entry point so the inventory suite is green

## Operator flow
Apply the bundle v2 and commit, then apply this patch (apply-diff), `git add -u` limited to the two patched paths, `git commit --no-verify`, stamp, install. Protected-path classification observed: neither patched path matches TP-1..TP-13. Note the patch also touches `architecture-orientation.md` and `check-product-capability-inventory.test.mjs`; the former is outside the host write scope list but inside the briefing's "files that may differ in the patch" list.
