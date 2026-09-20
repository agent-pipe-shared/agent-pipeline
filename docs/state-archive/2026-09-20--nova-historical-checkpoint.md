# Handover archive -- Current handover — 2026-09-12: Nova-B implementation and deferred native Windows work, Nova B session log — 2026-09-01 through today

> Rotated from `docs/state.md` on 2026-09-20 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Current handover — 2026-09-12: Nova-B implementation and deferred native Windows work, Nova B session log — 2026-09-01 through today.
> Summary: Historischer Nova-Checkpoint; aktueller Alfred-Intake bleibt live.
> Append-only once written; never edited by hand.
> Content below is verbatim except that relative markdown link target(s) were rewritten to keep resolving correctly at this file's directory depth (link text and all other content are untouched).

## Current handover — 2026-09-12: Nova-B implementation and deferred native Windows work

### 2026-09-19 recovery: Nova-B audit

129 items/99 AC rows; acceptance open. Latest full Verify `04052891`:
RED 548/555, Security green. Later fixture/guidance fixes: focused green only.
New red probes: AGY recovery consults Codex; Codex clear loses goal identity.
Fix briefs ready; fresh dispatches hit `agent thread limit reached`.
[PO queue](../../backlog/PO-TOPICS.md): review/no-commit conflicts, protected
patches, D5, calibration/push/promotion architecture and host reachability open.
Three-runner/platform caller checks continue; retain native deferrals.
No release approval or new full qualification.
**Release state:** version `0.6.1` · tag `v0.6.1` · commit `6262d408aa616651232b46ab8ecbfd88ce4055b0` · tree `69b12f1d8714de57e22acb730a09f4bbac067360` · status `published`

**Lifecycle phase:** feature `sprint-nova-epic` · phase `design`

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


## Nova B session log — 2026-09-01 through today

### Still-live open questions carried forward

Each was checked against `backlog/STATUS.md` and the git log; where liveness
could not be positively established, that is said rather than glossed.

- ~~`project-onboarding-v3-tests` fails in CI and is not explained.~~ **Closed
  2026-09-02.** The cause was inode reuse on ext4 versus tmpfs, fixed at
  `9a7c309b`; the suite reported zero in CI run `33595311782`. Struck rather
  than deleted, because this line stood as "not explained" through several
  handovers and a later reader should see that it was answered, not dropped.
- Four defects re-verified as still present sit in terminal `deferred` status,
  invisible to every mechanical sprint-gate check.
- The privacy sweep FAIL is disposed of as disclosed-unremediated; both findings
  (contract drift, a sign-off bound to a superseded candidate) remain open. A
  privacy re-review covering the current candidate is recommended after the
  freeze and would resolve both.
- GWM has no chat-mode activation path. **No item was ever filed** for this.
- AK-6 is recorded as ready to re-dispatch against
  `pipeline-user-v3.schema.json`. Nothing shows it ran; liveness established
  only by absence of evidence — the weakest entry here.
- The standing Nova authorization in Spec §8 to lift TP-1/TP-3/TP-5 for an exact
  task **cannot be honoured**: `guard-testpath` reads `gates.push_approval`,
  this repo is `signature`, and that mode has no in-session activation step.
  Recorded only here; no filed item.
- BS25/BS26 durability: three positional ledger lookups remain in
  `backlog-state.mjs`; two can bind by `entryHash`, `amendsSequence` needs an
  additive `amendsEntryHash`. The cited line numbers were not re-verified.
- Two of the four documented reasons for `security: off` are stale; what
  actually blocks is the v2 verdict's three offending required capabilities plus
  a license allowlist resolving only inside this repository. No filed item.
- Codex restarts: whether `codex resume` re-reads `.codex/*` is **unmeasured**.
  Measure before changing any instruction.
- The sibling defect shape — a change to A creates an obligation at B, revealed
  only by a later gate run — is still unfiled as a general pattern.
- Also live, established by keyword search only: the PO's acceptance-bar
  question ("nothing forces the authoring step"); retrospective follow-up items
  #7 and #8, deferred to Nova B; the sandbox-quickfix Critic FAIL (1 major, 1
  minor) left unresolved; the `f7ab9b42`/NVA-DOC060 gap with no independent
  Critic review; and the two open NVA-CIVERIFY questions.

Dropped on rotation as genuinely resolved: the Antigravity hard-enforcement
layer's two fail-open paths, closed by `ab347a74`, which built the self-check
the item's own proposal named.

### 0.6.1 is released — 2026-09-02

`main` moved `dd1eb9ee..6262d408`, tag `v0.6.1` (`CHANGELOG.md`, `f0290fe8`),
under an explicit PO-decided `protect-main` bypass (bypass-free route for
next release: dispatch `verify` on a feature branch first, then push that
SHA to `main`). Two incidents from this release, each its own backlog item,
not restated here: the torn audit-ledger append
(`pipeline.a-torn-audit-append-has-disabled-every-human-guard-override-since-august-20`)
and the LWSC04 CI red
(`backlog/items/2026-09-02-worker-cancellation-is-denied-when-the-record-digest-ages-between-read-and-cancel.md`).
Full verify green at `7cc0b649`, 506 suites.

### At the freeze — what the PO decides

- **Seven local commits carry no recognised `AI-Assisted: true`.** Git's trailer
  parser needs a blank line before the trailer block and none inside it; the
  hand-composed stage-0 messages get one of those two right. All seven are
  unpushed, so amending needs no force-push — but `CLAUDE.md` prohibits
  rewriting history without an unpushed carve-out, so it was not done. Three
  directions are in the item; the seventh instance, produced under an explicit
  briefing warning, refutes the "fix the habit" direction outright.
- **`GG-17` vs. the PO's `--no-verify` instruction — RESOLVED 2026-09-01**
  ([ADR-0079](../adr/0079-hook-bypass-is-never-agent-overridable.md)):
  hook-bypass is never agent-overridable, no `OVERRIDE` route, following the
  `GIT-03` precedent; the PO's own manual `--no-verify` push in their own
  terminal stays a human exception outside Pipeline authority, never
  retroactively legitimised. Worth keeping from how it was found: the
  extraction pass read `guardrails/git.md` as the authority and reported a
  contradiction — `CLAUDE.md` already carried the answer, and it was the
  guardrail that disagreed with it, not the reverse. Implementation filed at
  `backlog/items/2026-09-01-hook-bypass-rules-are-overridable-against-the-stated-policy.md`
  (maintenance window).

The most recent full-run result is in the machine-written
`evidence/verify-latest.json`, which names its own candidate commit and tree —
read that rather than trusting any prose claim about which HEAD was green.

### Owed, not started

- An **ADR and register entry** for the marketplace-attestation narrowing
  decision (EL-04). Not written today on purpose: the decision stands, but its
  implementation route was refuted this session, and an ADR whose mechanism is
  known broken would record a plan nobody can follow. The refutation is filed as
  its own item; the ADR waits for a workable enumeration.
- The authorship-only dispatch-record projection, applied once by hand, is not
  yet a mechanism.

