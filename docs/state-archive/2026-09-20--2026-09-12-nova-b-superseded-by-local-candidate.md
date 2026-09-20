# Handover archive -- Current handover — 2026-09-12: Nova-B implementation and deferred native Windows work

> Rotated from `docs/state.md` on 2026-09-20 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Current handover — 2026-09-12: Nova-B implementation and deferred native Windows work.
> Summary: Superseded by the 2026-09-20 local-candidate checkpoint; retained in docs/state-archive for historical recovery.
> Append-only once written; never edited by hand.
> Content below is verbatim except that relative markdown link target(s) were rewritten to keep resolving correctly at this file's directory depth (link text and all other content are untouched).

## Current handover — 2026-09-12: Nova-B implementation and deferred native Windows work

**Release state:** version `0.6.1` · tag `v0.6.1` · commit `6262d408aa616651232b46ab8ecbfd88ce4055b0` · tree `69b12f1d8714de57e22acb730a09f4bbac067360` · status `published`

**Lifecycle phase:** feature `sprint-alfred-epic` · phase `implementation`

**Current native-Codex scope decision (reaffirmed 2026-09-12):** The ordinary
fresh-session Critic remains the supported default. Native Codex sandbox and
App-Server execution under WSL is deactivated and deferred to a separate future
native-Windows package; it is neither Nova-B acceptance evidence nor a Nova-B
blocker, and no WSL result establishes native readiness. Earlier WSL startup,
preflight, smoke, receipt and review passages below are immutable diagnostic
history rather than current operating instructions. Platform-neutral and
offline contracts remain in scope. The deferred work reuses the existing
`sprint: none` items for
[worker sandbox selection](../../backlog/items/2026-08-30-codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn.md),
[Selected-Critic contract binding](../../backlog/items/2026-09-06-the-selected-critic-lane-briefs-contract-files-it-neither-pins-nor-binds.md),
and [fallback routing](../../backlog/items/2026-09-06-the-t1-fallback-waits-for-failure-codes-the-route-collapses-before-they-arrive.md).

Continue the accepted local 0.6.2 test-candidate goal, then approved Nova work;
collect actual human decisions in
`backlog/evidence/2026-09-06-po-decision-queue.md`. Ordinary implementation,
tests, local commits and reviews remain authorized. Do not repeat historical
startup diagnosis, missing-record searches or completed review rounds.

Nova-B status reconciliation is active. The pass began at 61 open and 54
closed `nova-b` items; after the evidence-backed closures and scope
dispositions through the Verify-runtime concentration closure on 2026-09-12,
the canonical ledger projection contains 30 open and 83 closed. Every open item's
`done_when` is being checked against the current code before that count is
treated as remaining work. B3 and B4 are implemented:
the later native Antigravity runner supersedes Nova's historical Alpha-only
boundary, and the provider-neutral GitHub/GitLab forge adapter package is
present and tested. The Nova-B plan now records that distinction without
rewriting immutable historical candidate-freeze evidence.

The latest exact clean baseline is Full Verify run
`verify-1789190187745-453056d9cdc07532` on commit `1e667395`, tree
`0293641ce576bba952317e172999b91e83ca4590`: 534/534 registered steps and a
fresh Security exit 0. A later POSIX terminal-action audit corrected the
published schema's missing `host` boundary but deliberately did not activate
the public `run` command. A tool-created pseudo-terminal passed a proposed
TTY-only provenance check, so that shortcut was rejected and the existing
human-terminal template item remains open for a non-caller-asserted host
adapter. Details:
`backlog/evidence/2026-09-12-posix-terminal-launcher-gap-and-schema-correction.md`.

The genuine migration correction review is retained in
`backlog/evidence/2026-09-10-migration-correction-critic.json`. Final correction
`712f2aa3` preserves required input after activation; the parent inspected the
driver and reproduced `collect-input` on the formerly false-ready path. This
direct self-verification closes the final correction under the two-round cap;
it is not a Critic PASS. Full Verify at
`712f2aa390d07423d802e2c53cb99a558f7345e5`, tree
`561a26e14263a1ba3fb9f6a75d4e9229556a71ca`, passed 517/517 with no reuse and
exact clean binding, including security. Run:
`verify-1788995343057-eaf89c315d0e6573`. Later edits need their own final gate.

Inventory review withheld substantive judgment because of historical review
commentary in its input. The exact result is retained and the live reason is
now neutral; the inventory remains pending with no receipt digest. The old
reader-package candidate failed Verify outside its eleven unchanged source
files. Main already has that guard repair. Neither attempt establishes reader
or inventory clearance. Details and immutable references:
`backlog/evidence/2026-09-10-review-progress-and-input-repair.md`.

The native current-artifact adapter is implemented in `243dd1a0`. Its first
independent review cleared the production contract and found one missing
end-to-end fixture. Correction `dbd20a2f` passed the genuine correction review,
with no findings. A preceding input refusal did not assess the correction;
all three actual results are retained in `backlog/evidence/2026-09-10-native-artifact-adapter-*.json`.
Full Verify at `dbd20a2ff1c0fbc6f853b14efb9fad528140a29f`, tree
`02594b12f70f58573382a9941cbddc48e6652f25`, passed 517/517 exact/clean with
zero reuse: `verify-1788997609815-26ee5b0e4bdce08a`.

The genuine current-artifact review completed on `243dd1a0`; all nineteen
reviewed files were byte-identical at `dbd20a2f`. Result:
`backlog/evidence/2026-09-10-current-artifact-critic-round-1.json`.
It found two major inventory defects (working-directory rather than committed
baseline discovery, and comment-only public anchors) plus four documentation
inconsistencies. Reader binding, release integration, compatibility schema pins
and GG22 regression tests were explicitly cleared within that review's scope.
These six findings were corrected in `f0e1f5b1`; focused checker tests passed
27/27 and full Verify passed 517/517 exact/clean, with zero reuse, at that
commit (`verify-1788999328347-b2ae127599874ff9`). The separate nineteen-artifact
correction review has no completed verdict: two interrupted coordinator
attempts produced neither a result nor a proven termination cause. Complete
one substantive correction review; do not repeat the completed initial hunt.
Inventory remains pending; no PASS or attestation is inferred from execution.

The PO's external terminal run completed the remaining 54-artifact review
process. Its actual report is retained in
`backlog/evidence/2026-09-10-remaining-candidate-critic-partial.json`: partial,
`pass: false`, three major and two minor findings. The packet exhausted its
24-call budget and did not complete whole-scope coverage. Correct archive
symlink containment, Claude Advisor route instructions, advisory message
phase handling, pending-plan deduplication and close instructions. Split the
remaining paths into bounded review packets instead of repeating the same
54-file invocation. The external execution request is resolved; these
technical corrections need no new PO decision. See the canonical PO queue's
morning entry. No source review process was live when correction work began.

The five findings are now corrected in `18a37515`, `ee7aa80c`, `3b47536a`,
`d5764361`, `babdae8d`, `14c82b8a` and `c3de6d00`. Parent inspection exposed
additional archive symlink variants before the correction review; permanent
real CLI tests cover them. Focused tests passed. Full current-candidate
Verify and independent correction/remaining coverage are still pending.
Exact scope, actual evidence and the missing pre-edit captures are recorded
in `backlog/evidence/2026-09-10-remaining-candidate-corrections.md`.

After actual inventory attestation, run fresh two-stage reader review and
binding, final build stamp, fresh Verify/security and reproducible local test
handover. D.6's missing comparison remains an evidence dependency. Installed
plugin and Alfred readiness are unchanged; push still needs its exact proof,
and release/plugin replacement are outside the authorization.

