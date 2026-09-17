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
| P1 | The pre-push hook must not remain stale after the plugin cache updates. | The installed cache and current source both identify as `0.6.2+codex.20260917090016.4c10f238`, yet their installer source differs: the cache has the old unconditional `ready-to-upgrade` model, while source has integrity/currentness detection and a green installer suite. This is the already-tracked cachebuster/runtime-source divergence, not a hook overwrite failure. | In the next normal plugin publication, mint a new immutable build identity and read it back from the installed runtime; connect that delivery to the existing cachebuster and installed-source backlog items. Do not silently overwrite hooks. |
| P1 | Release governance must stop re-running the same evidence under several names. | The Nova-B requirement now contains a prepared, non-executing S→R envelope: immutable source/record bindings, allowlisted record-only diff, declared one-way mode inclusion and canonical Security evidence. | PO/ADR review of the envelope, allowlist owner and release→push inclusion table before code changes. |
| P1 | A push ceremony should require the PO only for the external signature. | The Nova-B item now defines disjoint read-only readiness and candidate-bound intent, plus typed `stopped-by-po`/`expired`/`superseded` outcomes. | PO/ADR review of intent lifetime, invalidation and remote-readback result semantics before code changes. |
| P1 | Codex test runs that create Git fixtures need an explicit sandbox boundary. | The apparent pre-commit test failure was reclassified: restricted sandbox child spawning returned `EPERM` before hook execution; the authorized local path passed 51/51. Existing item `pipeline.codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn` remains the single owner. | Use narrowly scoped elevated execution only for affected local Git/child-process suites; defer native-sandbox redesign to the existing future Windows work package. |
| P1 | Greenfield runner reports must drive validated work, not duplicate backlog noise. | All three reports reviewed; validated triage is in the three 2026-09-17 backlog items. | Reproduce native-Windows and runner-adapter claims before filing further security defects. |
| P2 | The release flow should be fast enough for ordinary releases. | Current delay is measured and tied to exact candidate/mode/evidence duplication. | Implement the promotion envelope only after its trust and ADR implications are reviewed. |

## Explicit non-actions

- No retroactive edit, retag, or replacement of public `v0.6.2`.
- No external push, release, branch-rule bypass, or signature attempt without
  fresh, candidate-bound PO authorization.
- No blanket session-transcript read access beyond the existing
  project-matching, read-only recovery contract.

## Evidence note: cache identity collision

The current source and the active cache share the exact same Codex build
metadata, although their `pre-push-hook-install.mjs` files are not identical.
That means an installer run can be internally successful while still executing
older logic.  The next release must treat the build identity and installed
runtime readback as one publication outcome.  This is additional evidence for,
not a duplicate of,
`pipeline.a-stale-version-stamp-makes-a-plugin-reload-a-silent-no-op` and
`pipeline.repository-agent-definition-is-inert-runtime-loads-installed-copy`.
