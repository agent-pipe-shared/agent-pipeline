# Active PO topic register — 2026-09-17

This is the single working list for PO topics raised in the current 0.6.2
release and Greenfield cycle.  It is a prioritisation aid, not a replacement
for the detailed backlog records or an authority to publish changes.

| Priority | PO topic | Current disposition | Next safe action |
| --- | --- | --- | --- |
| P0 | A public `v0.6.2` exists, but its GitHub Verify is red. | Local CI repair candidate: `de3ccdc4`, reconciled by `b86ceb28`; targeted runtime suite 15/15. | Qualify this isolated candidate, then obtain a fresh action-specific push authorization for an external Verify readback. |
| P0 | A Codex Greenfield must retain and read the complete first-session design input. | Implemented in the SessionStart intake checkpoint path; direct suite 49/49. | Reproduce only if a new real Greenfield run demonstrates a failing lifecycle edge. |
| P0 | Read-only recovery must access appropriate prior session transcripts. | Implemented by the repository-matching, bounded transcript reader; direct suite 4/4. | Test the real runner/session identity handoff before expanding read scope. |
| P1 | A kickoff lock must not force agents into an unsafe or confusing recovery route. | The reported incident was repaired in the test project; no new pipeline defect is yet reproduced here. | Capture the next typed lock failure with its exact owner/age state before changing locking semantics. |
| P1 | The pre-push hook must not remain stale after the plugin cache updates. | The installed 0.6.2 cache uses an older status model that always reports `ready-to-upgrade` after installation; the current source has the stricter integrity/currentness check and its installer suite is green. | Ship the current installer through the normal next plugin publication; do not silently overwrite hooks. |
| P1 | Release governance must stop re-running the same evidence under several names. | Detailed Nova-B requirement is open: `pipeline.release-evidence-promotion-repeats-full-qualification`. | Design the fail-closed S→R promotion envelope before code changes. |
| P1 | A push ceremony should require the PO only for the external signature. | Detailed Nova-B item is open: `pipeline.push-artifacts-precede-operator-intent`. | Split read-only readiness from explicit operator intent and preserve the signature boundary. |
| P1 | Greenfield runner reports must drive validated work, not duplicate backlog noise. | All three reports reviewed; validated triage is in the three 2026-09-17 backlog items. | Reproduce native-Windows and runner-adapter claims before filing further security defects. |
| P2 | The release flow should be fast enough for ordinary releases. | Current delay is measured and tied to exact candidate/mode/evidence duplication. | Implement the promotion envelope only after its trust and ADR implications are reviewed. |

## Explicit non-actions

- No retroactive edit, retag, or replacement of public `v0.6.2`.
- No external push, release, branch-rule bypass, or signature attempt without
  fresh, candidate-bound PO authorization.
- No blanket session-transcript read access beyond the existing
  project-matching, read-only recovery contract.
