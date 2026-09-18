# Active PO topic register — 2026-09-17

This is the single working list for PO topics raised in the current 0.6.2
release and Greenfield cycle.  It is a prioritisation aid, not a replacement
for the detailed backlog records or an authority to publish changes.

| Priority | PO topic | Current disposition | Next safe action |
| --- | --- | --- | --- |
| P0 | A public `v0.6.2` exists, but its GitHub Verify is red. | Local CI repair candidate `8b4aa6aa` contains `de3ccdc4`/`b86ceb28` plus the portable local-supervisor fixture correction; clean candidate-mode Verify without receipt reuse passed 551/551. | Obtain a fresh action-specific push authorization, then require an external GitHub Verify readback before closing the item. |
| P0 | A Codex Greenfield must retain and read the complete first-session design input. | Implemented in the SessionStart intake checkpoint path; rechecked locally on 2026-09-17: direct suite 49/49. | Reproduce only if a new real Greenfield run demonstrates a failing lifecycle edge. |
| P0 | Read-only recovery must access appropriate prior session transcripts. | Implemented by the repository-matching, bounded transcript reader; rechecked locally on 2026-09-17: direct suite 4/4. | Test the real runner/session identity handoff before expanding read scope. |
| P1 | A kickoff lock must not force agents into an unsafe or confusing recovery route. | The reported incident was repaired in the test project; no new pipeline defect is yet reproduced here. | Capture the next typed lock failure with its exact owner/age state before changing locking semantics. |
| P1 | The pre-push hook must not remain stale after the plugin cache updates. | The installed cache and current source both identify as `0.6.2+codex.20260917090016.4c10f238`, yet their installer source differs: the cache has the old unconditional `ready-to-upgrade` model, while source has integrity/currentness detection and a green installer suite. This is the already-tracked cachebuster/runtime-source divergence, not a hook overwrite failure. | In the next normal plugin publication, mint a new immutable build identity and read it back from the installed runtime; connect that delivery to the existing cachebuster and installed-source backlog items. Do not silently overwrite hooks. |
| P1 | Release governance must stop re-running the same evidence under several names. | The Nova-B requirement now contains a prepared, non-executing S→R envelope: immutable source/record bindings, allowlisted record-only diff, declared one-way mode inclusion and canonical Security evidence. | PO/ADR review of the envelope, allowlist owner and release→push inclusion table before code changes. |
| P1 | A push ceremony should require the PO only for the external signature. | The Nova-B items now define disjoint read-only readiness/candidate-bound intent and a single push transaction with audit-fold and exact remote-readback outcomes. | PO/ADR review of intent lifetime, invalidation, audit-fold and remote-readback result semantics before code changes. |
| P1 | Codex test runs that create Git fixtures need an explicit sandbox boundary. | The apparent pre-commit test failure was reclassified: restricted sandbox child spawning returned `EPERM` before hook execution; the authorized local path passed 51/51. Existing item `pipeline.codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn` remains the single owner. | Use narrowly scoped elevated execution only for affected local Git/child-process suites; defer native-sandbox redesign to the existing future Windows work package. |
| P1 | Greenfield runner reports must drive validated work, not duplicate backlog noise. | All three reports reviewed; validated triage is in the three 2026-09-17 backlog items. | Reproduce native-Windows and runner-adapter claims before filing further security defects. |
| P2 | PO-facing commands must remain copy-safe across every runner. | The Greenfield-driven audit reconciled `onboarding-init.mjs` with the central renderer on 2026-09-18; the renderer and onboarding focused suites pass. | Continue the bounded emitter inventory; do not treat the one import correction as proof of the broader “every emitter” criterion. |
| P2 | The release flow should be fast enough for ordinary releases. | Current delay is measured and tied to exact candidate/mode/evidence duplication. | Implement the promotion envelope only after its trust and ADR implications are reviewed. |

## Explicit non-actions

- No retroactive edit, retag, or replacement of public `v0.6.2`.
- No external push, release, branch-rule bypass, or signature attempt without
  fresh, candidate-bound PO authorization.
- No blanket session-transcript read access beyond the existing
  project-matching, read-only recovery contract.

## Canonical runner-report mapping

The three Greenfield reports remain source observations; this table prevents a
later reread from creating a second item for the same confirmed issue.

| Reported concern | Canonical owner / disposition |
| --- | --- |
| `verify: null` blocks a new consumer project's legitimate first verify command. | [baseline-only Verify recovery](items/2026-09-13-baseline-only-verify-needs-an-actionable-release-recovery.md) — open; needs a sanctioned late configuration route, not a bypass of calibration protection. |
| Browser/Playwright proof is unavailable in some runner environments. | [portable browser evidence](items/2026-09-13-greenfield-browser-evidence-is-not-portably-provisioned.md) — open; preserve the distinction between unavailable evidence and a failing browser test. |
| A runner lacks a native dispatch parent identity. | [runner-native subagent identity](items/2026-09-13-runner-native-subagent-tool-identity-is-not-portable.md) — open; require a sanitized native envelope before changing fail-closed binding. |
| An invalid role packet wastes launcher time. | [role-dispatch packet preflight](items/2026-09-10-role-dispatch-payload-errors-fail-before-model-launch.md) — remaining work is real production-coordinator coverage, not another adapter-local validator. |
| Completed local work remains visibly `implementing` after a deferred public release. | [feature-close and usage-ledger recovery](items/2026-09-13-feature-close-recovery-and-usage-ledger-need-runner-selectors.md) — open; terminal recovery must not fabricate a publication. |
| Windows or native-runner claims that are not reproducible here. | Keep the existing platform-specific owners; do not promote a report assertion to a new security defect until its native sanitized fixture is captured. |

## Evidence note: cache identity collision

The current source and the active cache share the exact same Codex build
metadata, although their `pre-push-hook-install.mjs` files are not identical.
That means an installer run can be internally successful while still executing
older logic.  The next release must treat the build identity and installed
runtime readback as one publication outcome.  This is additional evidence for,
not a duplicate of,
`pipeline.a-stale-version-stamp-makes-a-plugin-reload-a-silent-no-op` and
`pipeline.repository-agent-definition-is-inert-runtime-loads-installed-copy`.
