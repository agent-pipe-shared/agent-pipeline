# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-09-06 | Historical candidate assembly; current decisions and remaining rules retained in the live handover. | [docs/state-archive/2026-09-07--nova-candidate-assembly-2026-09-06.md](state-archive/2026-09-07--nova-candidate-assembly-2026-09-06.md) |
| 2026-09-06 | Closed Nova-B blocks 2026-09-02..06: rebase deadlock, evidence-slot fix, worktree liveness, read containment, full gate green, five Critic-cleared items | [docs/state-archive/2026-09-06--closed-blocks-2026-09-02-06.md](state-archive/2026-09-06--closed-blocks-2026-09-02-06.md) |
| 2026-09-02 | The 0.6.0-to-0.6.1 release run, the overnight Nova B block, and the four dispatcher errors it recurred: superseded by the 0.6.1 release entry. | [docs/state-archive/2026-09-02--where-the-release-stands-interim-update-2026-09-01-evening.md](state-archive/2026-09-02--where-the-release-stands-interim-update-2026-09-01-evening.md) |
| 2026-09-01 | The 2026-08-31 interim-release handover: the 0.6.0 candidate pushed to nova and stopped one step short of main, the nine ordered PO terminal actions, the privacy sweep disposition, and the carried-forward open questions. Extraction pass performed first and recorded in the survey behind commit 53262b1d; its homeless durable rules and still-live carry-forwards were re-stated in the 2026-09-01 handover. | [docs/state-archive/2026-09-01--current-handover-0-6-0-is-an-interim-release-nova-b-continue.md](state-archive/2026-09-01--current-handover-0-6-0-is-an-interim-release-nova-b-continue.md) |
| 2026-08-25 to 2026-08-26 | The 2026-08-25/26 chat-gate-ceremony standardization block: AGY-HGOFIX-2/3, the four chat-gate regressions and their closure, the Agent-tool worktree-isolation incident, the 17-agent AFK sweep and its reconciliation, and the 2026-08-26 sprint_agy push. Extraction pass performed first: every durable rule in it already lives in CLAUDE.md or its own backlog item; the single carry-forward with no home (GWM has no chat-mode activation path) was moved into the current handover before rotation. | [docs/state-archive/2026-09-01--chat-gate-standardization-and-afk-sweep.md](state-archive/2026-09-01--chat-gate-standardization-and-afk-sweep.md) |
| 2026-08-23 | The Phoenix-line pointer block: a preamble stating that Nova became the authoritative line and that Phoenix's own checkpoints 61-71 are history. Its content was already archived separately and indexed; the block itself carried no live carry-forward. | [docs/state-archive/2026-09-01--phoenix-line-pointer-block.md](state-archive/2026-09-01--phoenix-line-pointer-block.md) |
| 2026-08-31 | The CI release blocker: diagnosis, the measured repair at ed491309, the PO decision to repair rather than bypass, and the inverted push-before-CI sequencing. Its live carry-forwards were extracted into the 2026-08-31 release handover before rotation. | [docs/state-archive/2026-08-31--ci-release-blocker-diagnosed-and-repaired.md](state-archive/2026-08-31--ci-release-blocker-diagnosed-and-repaired.md) |
| 2026-08-31 | The 2026-08-30 block: the 6a93fec2 candidate stamp at 501/503, the six closed retrospective follow-up items, ADR-0076, and the unapproved emergency push of both branches. Its two live carry-forwards -- retro items 7 and 8 deferred to Nova B, and the unresolved Critic FAIL on the sandbox quickfix -- were extracted into the 2026-08-31 handover first. | [docs/state-archive/2026-08-31--prior-current-handover-nova-0-6-0-local-candidate-stamped-re.md](state-archive/2026-08-31--prior-current-handover-nova-0-6-0-local-candidate-stamped-re.md) |
| 2026-08-31 | The 2026-08-28 three-runner greenfield block: rounds A-U2, the ready-gate blocker T, the 2+2 Critic round, and the candidate's state on the night of 2026-08-28/29. Its still-live carry-forward items were extracted into the 2026-08-31 handover before rotation. | [docs/state-archive/2026-08-31--prior-current-handover-the-three-runner-greenfield-findings-.md](state-archive/2026-08-31--prior-current-handover-the-three-runner-greenfield-findings-.md) |
| 2026-08-28 | Ledger merge across parallel sprints (ADR-0068), ADR renumbering at acceptance (ADR-0069), and the first handover rotation; its four live open items -- ADR collision 0063, the unregistered check-adr-consistency, BS25/BS26 durability, and the Nova A candidate list -- are carried forward to the current handover. | [docs/state-archive/2026-08-28--earlier-handover-ledger-merge-capability-adr-renumbering-han.md](state-archive/2026-08-28--earlier-handover-ledger-merge-capability-adr-renumbering-han.md) |
| 2026-08-28 | Verify green 471/471 in one run at candidate 5fd963fc; EP07 tree-dirtying cause named and fixed; +build stamp convention restored; AK-5 closed, AK-6 ready to re-dispatch; the open 0.6.0 combined-release decision carried forward to the current handover. | [docs/state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md](state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md) |
| 2026-08-27 | sprint_agy fetch, fast-forward, and the 2026-08-26 clean local candidate | [docs/state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md](state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md) |
| 2026-08-19 through 2026-08-23 | Phoenix-line checkpoints 61-71 (2026-08-19 through 2026-08-23), preserved verbatim as history after the Nova merge made the Nova line authoritative. | [docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md](state-archive/2026-08-27--phoenix-checkpoints-61-71.md) |
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [docs/state-archive/2026-08-19--checkpoints-1-through-60.md](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| 2026-08-26 | 2026-08-25 Antigravity chat-gate-ceremony standardization, verify-tuner stage 2 acceptance, sprint-agy-runner delta4 Critic fix and candidate status | [docs/state-archive/2026-08-26--agy-runner-2026-08-25-handover.md](state-archive/2026-08-26--agy-runner-2026-08-25-handover.md) |

## Current handover — 2026-09-12: Nova-B implementation and deferred native Windows work

**Lifecycle phase:** feature `sprint-nova-epic` · phase `implementation`

**Current native-Codex scope decision (reaffirmed 2026-09-12):** The ordinary
fresh-session Critic remains the supported default. Native Codex sandbox and
App-Server execution under WSL is deactivated and deferred to a separate future
native-Windows package; it is neither Nova-B acceptance evidence nor a Nova-B
blocker, and no WSL result establishes native readiness. Earlier WSL startup,
preflight, smoke, receipt and review passages below are immutable diagnostic
history rather than current operating instructions. Platform-neutral and
offline contracts remain in scope. The deferred work reuses the existing
`sprint: none` items for
[worker sandbox selection](../backlog/items/2026-08-30-codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn.md),
[Selected-Critic contract binding](../backlog/items/2026-09-06-the-selected-critic-lane-briefs-contract-files-it-neither-pins-nor-binds.md),
and [fallback routing](../backlog/items/2026-09-06-the-t1-fallback-waits-for-failure-codes-the-route-collapses-before-they-arrive.md).

Continue the accepted local 0.6.2 test-candidate goal, then approved Nova work;
collect actual human decisions in
`backlog/evidence/2026-09-06-po-decision-queue.md`. Ordinary implementation,
tests, local commits and reviews remain authorized. Do not repeat historical
startup diagnosis, missing-record searches or completed review rounds.

Nova-B status reconciliation is active. The pass began at 61 open and 54
closed `nova-b` items; after the evidence-backed closures and scope
dispositions through 2026-09-12, the canonical ledger projection contains 33
open and 80 closed. Every open item's
`done_when` is being checked against the current code before that count is
treated as remaining work. B3 and B4 are implemented:
the later native Antigravity runner supersedes Nova's historical Alpha-only
boundary, and the provider-neutral GitHub/GitLab forge adapter package is
present and tested. The Nova-B plan now records that distinction without
rewriting immutable historical candidate-freeze evidence.

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

## Earlier handover — 2026-09-09: lifecycle recovery and selected review blocker

**Lifecycle phase:** feature `sprint-nova-epic` · phase `implementation`

The latest local candidate goal remains the 0.6.2 test build under
`specs/sprint-nova-epic/design/2026-09-07-local-candidate-delta.md`.
The PO's evening instruction is to finish that candidate first, then continue
approved Nova backlog work autonomously and collect human decisions in
`backlog/evidence/2026-09-06-po-decision-queue.md`. Candidate preparation is
not evidence of installation or release.

The recovered migration repair is committed in `653703e9` and `93423c67`;
rollback/compatibility documentation is in `a695c5e9`. Independent review
then exposed the real legacy frontdoor bypassing the migration plan.
Corrections `7cc72e48` and `5b21e726` cover the actual activation route and
restrict terminal migration readback to preserve Greenfield intake.
Full Verify completed with 517/517 steps, zero failures, fresh receipts and
an exact clean binding at `5b21e7260abdbb6b2fecec2eae25a9d3ac2945a1`, tree
`921e4dfc915edd91627f7f37dfb344c754e24521`.
Evidence: `evidence/verify-1788986681947-494491b0d04a1ba5.json` and
`evidence/dispatch-record-NVA-V3-MIGRATION-FRONTDOOR.json`.
This subsequent handover edit is not covered by that preceding Verify.

The correction review's selected Codex transport was actually invoked.
It returned `selected-critic-transport-failed`: child started, exit 1,
initialization/thread/model turn all false, cleanup complete. There is no
review verdict. The bound result is
`scratch/v3-frontdoor-selected-review-result.json`; dispatch admission is
`scratch/v3-frontdoor-critic-preflight.json`; the bounded coordinator is
`scratch/review-v3-frontdoor-selected.mjs`. The prior finding is retained in
`scratch/v3-frontdoor-prior-critic.json` as a report, not a transport receipt.
Investigate this startup failure through the selected runner contract;
do not infer that a healthy daemon proves this child starts, or substitute
generic-agent review for the candidate's selected-transport requirement.

Startup diagnosis now has a terminal read-only-filesystem failure and a
negative log-directory-override control. The version-bound Codex source
requires write-opening its installation-ID file before Stdio initialization;
the inherited home is read-only in the legacy whole-process sandbox. The
exact local failing syscall is not traced. See
`backlog/evidence/2026-09-09-selected-critic-startup-diagnosis.md` for evidence
and limits. Do not retry the unchanged transport or activate the separate
native lane without its own current physical and tool-surface proof.

Resumption inventory `a7a08652` confirms the existing repairs and exact historical
Verify; see `backlog/evidence/2026-09-09-critic-resumption-inventory.md`.
The existing native components now have a model-free preflight (`049b0edd`,
`04e5883b`) and scratch coordinator. Full Verify at `04e5883b` finished clean,
exact and green: 517/517, zero reused results, run
`verify-1788989991645-2d255110bd894c78`. A fresh native smoke then admitted a
real independent review of `b876302d..04e5883b`; the model turn completed and
the native host validated its execution receipt. The result is **FAIL**, with
two major preflight defects: a late protocol failure can be lost, and stdin
errors/null frames can escape bounded failure handling. Immutable result:
`backlog/evidence/2026-09-09-native-preflight-critic-round-1.json`.
Task `NVA-NATIVE-PREFLIGHT-FIX-1` repaired those findings in `0e8732a0`.
Full Verify then passed 517/517, exact and clean, at `b4818e66` (run
`verify-1788991424686-4009c7355553278a`). The single correction review completed
with one further major finding: post-failure requests could remain unsettled.
Immutable result: `backlog/evidence/2026-09-10-native-preflight-critic-round-2.json`.
Final correction `d71f9fd6` rejects post-failure work and preserves the first
failure while settling pending requests. Runtime tests pass 15/15 and consumer
tests pass 9/9. Parent direct self-verification of the extracted current RPC
class confirms one request write, immediate original-error rejection, no
pending request and closed child; capture
`evidence/NVA-NATIVE-PREFLIGHT-FIX-2-parent-self-verification.txt` is an
in-memory fixture, not live Codex or Critic PASS. The two-round cap is exhausted;
do not dispatch a third review of this package. Full Verify of the final
correction passed 517/517 with zero reused results and exact clean binding at
`e8374a5f221e8acc1576afda4a9fa2ff0a953092`, tree
`d0ac4ca90fd2a8f78ee2ce01b98c4c7dd12c259e`, run
`verify-1788992531351-c080575401c72593`, finished
`2026-09-09T22:24:57.401Z`. Live model-free smoke also passed, capture
`evidence/NVA-NATIVE-FINAL-SMOKE-1.txt`: actual read and denied write,
unchanged canary/source, host control, clean termination, zero model turns.
This subsequent handover-only edit is outside that preceding Verify.
The completed correction review's scratch coordinator is
`scratch/NVA-NATIVE-REREVIEW-COORDINATOR-1/native-rereview-coordinator.mjs`:
it binds the original native receipt to review base `04e5883b`, retains prior
verdict material only at the coordinator boundary, and requests full inspection
of the exact correction range. This is coordinator lineage validation, not
native-host lineage enforcement or a review PASS. Remaining original coverage
and exact recovered refs are preserved in
`backlog/evidence/2026-09-10-remaining-candidate-review-coverage.md`; do not
reinvestigate missing historical packets or reopen closed GG22 packages.
This new-package review does not close the migration correction review or
inventory/reader-checker/Nova-B coverage. Do not repeat the old initialization
probes or infer a PASS from a completed model turn. Subsequent edits require
their own fresh final Verify; the cited result covers only `04e5883b`.

Documentation reader binding passed for `5b21e726`, reviewed documentation
commit `7fc1bc503473339bfe1b15c34082e86a175eba43`, with assurance
`committed-state-and-evidence-presence-only`. The capability inventory still
declares `required-before-publication`; no current passing Critic receipt
has activated it. A claim that every documentation deliverable is complete
would therefore be premature. Preserve D.6's explicit comparison dependency.

Remaining candidate work: usable selected independent review and finding
disposition; inventory/reader obligations from the candidate delta; final
runner build stamps, fresh final full gate, and the local test handover.
The Alfred checkout and its three pending migration files were not changed
during this recovery. Live Alfred readiness remains unverified.

## Earlier handover — 2026-09-09: candidate evidence and remaining closure

**Lifecycle phase:** feature `sprint-nova-epic` · phase `implementation`

The candidate contract is
`specs/sprint-nova-epic/design/2026-09-07-local-candidate-delta.md`.
The PO returned on 2026-09-09 and separately authorized a feature-branch push
once the candidate is final. Release and installed-plugin exchange remain
unauthorized. The latest completed full Verify is exact and clean at
`c597aa9d466e00fb02c6ff9a414a2ed08b4b1e8e`, tree
`f046e6748a379c34bb6f66543a88e85b6a415943`: 517/517 terminal receipts,
all fresh, exit 0 (`evidence/verify-latest.json`). This state correction is
not covered by that preceding gate; a final stamp, fresh full gate and only
then the authorized feature push remain future work.

D.2 declares 35 capabilities and assigns 616 surfaces exactly once. Its actual
public targets are complete in `bf376474`; inventory activation remains blocked
on a genuine candidate-bound Critic PASS. D.3 frontdoor work is integrated in
`c89d8848`; D.4 is integrated in `ad8087fe`; D.5 pages and generated reference
have focused proof. D.6 retains its explicit missing comparable two-runner
measurement dependency; supplied labels and the one-runner metering result do
not establish that comparison. GG22's attended insertion is complete in
`bdaa374b`, with seven committed pathspec regressions.

The authorized selected Critic attempt for `c597` failed before child
initialization, thread, or model turn and produced no verdict; its bound,
sanitized result is `scratch/local-candidate-critic-c597aa9d466e-1788936988168/result.json`.
Do not infer a phase or command defect as its cause. The clean-home preflight
does not prove inherited-home Critic startup. Separately observed EROFS and the
version-matched installation-id startup source are a candidate cause, not a
path-level proof. The inherited-home control is recorded at
`scratch/codex-sandbox-inherited-init-1788938492051/result.json`.

A genuine Critic PASS remains required before inventory activation, then a
fresh two-stage reader review and its committed binding. A final new stamp,
fresh full gate, and the authorized feature push remain future work.

The PO completed model-authority commit `f895abaf` and attended Claude hook
commit `2dab5966`; both were read back against the expected changes. Active
routes exclude Fable. The prior rollback and waiting ceremonies are historical.
The dated decision table in `backlog/evidence/2026-09-06-po-decision-queue.md`
records the complete decisions and execution boundaries.

Integrated packages include native advisory slicing (`9732a9ea`, `8a39fe7e`),
bootstrap identity/receipt enforcement (`771587ab`), model registry/projections
(`175600ea`), candidate-bound selected and normal Critic routing (`d71de830`,
`e2f7ed40`), advisory routing (`08deebd0`), bounded bootstrap scratch authoring
(`74a8152f`), concurrent session-probe cleanup (`a346b511`) and resumed-material
provenance guidance (`0bbed49c`). Package evidence records the individual checks;
these results do not constitute a full candidate gate or independent review.

The repaired model-free intermediate Codex sandbox preflight passed on this
host: both handshakes and bounded stops, scratch write and other-write denial.
Input/network isolation is not asserted. Receipt:
`scratch/candidate-intermediate-preflight-20260907-late.json`.
The selected and normal Critic/advisory routes now use the committed V3 model
authority. Generated-checkpoint Greenfield fixtures persist both documents
and reach the real plan-acknowledgement request, with simulated host readback
explicitly disclosed. This does not complete the user's live game session.
Concurrent probe cleanup, bounded scratch containment and intake provenance
are repaired; the historical intermittent capability failure and live-source
timeout are not causally proved resolved. Do not turn successful fixture runs
into a live-host stability claim.

GitLab has imported successful Desktop/WSL read evidence, validated locally;
see `backlog/evidence/2026-09-07-gitlab-read-access-observation.md`. This is neither
a new Nova network execution nor B2 CI/worker proof. Reads only are authorized.

Historical Verify evidence: an earlier complete run was **505/517, failed**, exactly bound to
`94bbc6a6ac0e17c91af08e1370810d5b06e55af3`, tree
`c2808190083ad81e98b527fc7a971698d81a72a6`, with clean start and finish.
Read `evidence/verify-1788823644708-c3279dedde58cddd.json` for its twelve failed
steps. The 514/517 run at `37aa24fc` is also historical. Neither is the current
gate; `evidence/verify-latest.json` is the current exact 517/517 proof for
`c597`. A future full gate is nevertheless required after final candidate changes.

All three collected PO steps are complete: the human project-model mirror
commit `5971da14`, the four separately transcribed Critic integrity pins
`4d1f0b9a`, and the exactly signed Notebook coverage repair `4ab11a53`.
The external Author-Repair proof was verified, armed and actually consumed
once (audit sequence 1401). Eight Notebook and nine consumer checks pass.
Read `backlog/evidence/2026-09-08-po-authorized-critic-pin-transcription.md`
and `backlog/evidence/2026-09-08-signed-notebook-matcher-repair.md`.
Do not repeat these steps or the prior source-model and Claude-hook ceremonies.

Independent repairs include the truthful unparsed-command denial
(`8f667a42`, operational closure `ab61e512`) and bounded budget observations
(`40eda94b`, operational closure `dc121506`). The latter passes its combined
296-test capture and bounds repeated observations per session/reason, without
claiming global retention or crash durability. Full candidate review is pending.

The ADR source inventory at `7232b834d41c7441eadaa3d7057370f50bc5dfe0`
contains declarations for all 75 accepted decisions. The separate three
historical, one provisional and one proposed exclusions are unchanged.
All twelve latest header additions preserve their bodies against the actual
baseline and every glob matches tracked nonempty files using the real matcher.
Source counts and responsibility evidence are indexed in
`backlog/evidence/2026-09-08-adr-coverage-progress.md`. ADR0047's final universal
copy is synchronized in `9cafae6b`; generator, consumer and document checks
pass without a new consumer allowance. The actual reconciliation checker at this source
commit, base `f94882ba`, reports 244 changed paths and 54 implicated, unreconciled
ADRs. This is an open push/documentation obligation, not a local-candidate gate;
no blanket ledger entries were created. Reader-review binding remains later.

The previous committed handover lacked its lifecycle marker. It now reflects
the actual observed feature and phase; the phase check is consistent and the
authoritative state file is unchanged. Readback:
`scratch/state-phase-marker-repair-20260908.json`.

The handover CLI repair is committed in `d50a4fbc`: explicit size and dry-run
modes are read-only; malformed and unsupported flags refuse before mutation.
Actual child-CLI regressions preserve complete fixture state and all existing
test assertions. Candidate-wide independent review remains pending. Evidence:
`backlog/evidence/2026-09-08-handover-size-command-mismatch.md`.

The installed plugin read back at this session's re-entry is
`0.6.1+codex.20260908050949.b281527`; bootstrap and session readiness passed.
The later source-only stamp is `0.6.1+codex.20260908184831.408738b` and was
not installed. Subsequent source commits deliberately have no new stamp under
the PO's latest instruction. This continuation performs no installation,
daemon restart, release or push. Current operational notes:
`scratch/candidate-autonomous-continuation-20260908.md`.

## Durable rules carried forward — these have no other home

### Candidate assembly rules retained before archiving the September 6 checkpoint

- User documentation describes the next release, never a local candidate or
  branch. D.2–D.6 use the committed September 6 positioning inputs under
  `specs/sprint-nova-epic/design/` and the reader-review findings.
- Distinguish Verify suite span from run envelope. The remaining process-global
  suites are not established eviction candidates; consult the lane annotations
  and `backlog/evidence/2026-09-06-verify-lane-achievable-win.md` before tuning.
- Critic briefs provide independently checkable paths, not prior conclusions.
  Absence claims state their search boundary. Give a worker the valid completion
  criterion, never an instruction merely to silence a check. Treat a disclosed
  implementation limitation as a finding to investigate.
- D.1 commits `94277a0b`, `a82a1415`, `9a3c188f` and T1 CLI `b3b7cb7e` still
  need their independent review accounted for; the new candidate delta alone
  must not imply that those earlier packages were reviewed.
- Remaining September 6 investigations include error-code collapse in
  `advisory-host-bridge.mjs`, the selection layer's T1 fallback composition, and
  an ADR-0063 disposition for force-added evidence captures. Their historical
  measurements remain in the archived checkpoint and referenced backlog records.

Searched for in `CLAUDE.md`, `docs/adr/`, `guardrails/`, `backlog/items/`;
found in none. Condensed 2026-09-06 (was verbose since 2026-08-31/09-02) —
each still needs a real permanent home, not further compression.

1. Release sequence: commits → security scan → full verify → Critic →
   signature ceremony → push feature branch → CI → `main`/tag/release
   (version-manifest stamp in the pre-verify batch). Not in
   `docs/push-release-flow.md`.
2. `git push --no-verify` stays available as a PO-only manual escape outside
   Pipeline authority, never agent-usable, no retroactive `approve-push`
   record — resolved 2026-09-01, [ADR-0079](adr/0079-hook-bypass-is-never-agent-overridable.md),
   but the rule itself isn't restated anywhere else.
3. A `resume-hint` receipt proves only that a card's bytes were read, never
   understood/acted on; a `--resume` restart's same session id makes
   capture-then-consumption indistinguishable from false re-grounding.
4. "GS-6" (a cited human-only mutation-adjacent rule) has no text anywhere —
   stale id or a rule never given a home.
5. `push-prepare`'s `authorize-critical` command has an `--expires-at`
   window: re-run immediately before signing, never reuse a printout.
   `docs/push-release-flow.md` names the flag but not this operational
   warning.
6. TP-5 owes nothing until re-established — no backlog item names a
   surviving carve-out; what the maintenance window owes is four suite
   registrations plus promoting `check-suite-registration.mjs` to a gate
   step (TP-3, signature-gated).
7. A Critic's input must be an authorship-only dispatch-record projection
   (`taskId`/`agentType`/`dispatcher`/`commits` only) — not stated in
   `CLAUDE.md`, `critic-review.md`, or `roles/critic.md`.

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
  ([ADR-0079](adr/0079-hook-bypass-is-never-agent-overridable.md)):
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

## Open — 2026-09-06 design threads

**B1 (`#21`) descoped by PO decision** — `docs/adr/draft-b1-worker-pool-superseded-by-workflow-tool.md`
(`90405d8b`). The runner's Workflow tool supersedes the Pipeline's own
parallel worker pool, so NVA-B21-1/6/9 are *withdrawn*, not merely unmet.
**Amended same day (`4876185d`, PO challenge, correct):** that holds only for
Claude Code — Codex/AGY have no Workflow tool, so the B1-I supervisor is
RETAINED for runner neutrality. It has never run a real provider
(`codex-exec` needs `allowProviderExecution: true`, never passed); a one-site
live probe is offered, not approved. Workflow tool still uncertified vs `#7`.

**Parallel-dispatch slicing enforcement — designed, cleared to build**
(`9e40548b`, corrections `f17a63d1`, opus/max). Answers the four open
questions of
`2026-08-29-the-pipeline-defaults-to-sequential-work-with-no-enforced-task-slicing.md`
with a conjunctive Parallel-Safety Predicate and a staged notion of
"enforced". Two T1 Critic rounds: round 1 **FAIL** on F1, the Elephant's own
error — it struck the design's blocking probe and wrote "the build may
proceed" on documentation-only evidence. Closing round **PASS** with four
more, F-A major (PSP-3 cited from two wrong incidents). All corrected except
F-D, filed as its own item. Cap exhausted; the Elephant self-verifies.
Registries: `backlog/evidence/2026-09-06-nva-b-parallelslicing-design-1*`.

**Channel probe PASSED 2026-09-06 — the build is unblocked.** A `PreToolUse`
exit-0 `additionalContext` does reach the model here. The probe session knew
the marker, so what carries the result is an accidental negative control:
~15 `Bash` calls silent under a `Read`-only matcher, the first real `Read`
fired. Detail and the residual caveat in the ADR's step-1 result block.
Untouched and still unevidenced: that a *non-blocking* nudge changes
behaviour. Increment 1 is built as a hypothesis the ledger measures.

**Verify runtime measured** (analysis only). Wall clock 674.6s; the 60-member
serial lane sums to 673.8s — the lane *is* the runtime, so raising
concurrency or deleting fast suites cannot help. The lane was filled by a
sweep flagging "plausibly unsafe", never proven. **The four-module lever is
refuted** (audit `1b5b2793`): `pipeline-state` and `human-guard-override` are
process-global — `projectDir()` is `CLAUDE_PROJECT_DIR` or `cwd()`, and that
CLI has no `--repo` flag at all — so the two heavy suites the win was
expected from are ineligible. 12 members are eligible on that criterion
alone; two further modules still gate them. Tracked at
`2026-09-01-verify-runtime-is-concentrated-in-ten-suites-not-spread-across-many.md`
(open).

## PO decisions and todos — collected during the autonomous run, not waited on

Per the PO's 2026-09-02 instruction. None blocks further Nova-B work.

1. **A machine-specific path is in published history.** `79bc79b8` carries this
   machine's repository path seven times in an evidence artifact; the working
   tree was sanitised in `68c164e8` but the bytes remain. The only remedy is a
   history rewrite, which the guard union forbids — so this is a PO call on an
   accepted exposure, not a task. Prevention is filed as its own item.
2. **Hook-bypass override removal (ADR-0079) needs one PO sentence:** does the
   decision cover `git commit` and `git push`, or push only? Also scheduled for
   the maintenance window, and its test file is TP-1 protected.
3. **Vendored-canon drift** names two options and decides neither. The effective
   one is a pre-commit hook — new enforcement surface, which a standing
   constraint holds back until the current diff is reviewed.
4. **Three `hooks.json` edits await one shared TP-4 ceremony** rather than three:
   the worktree-isolation matcher, the resume-hint delivery hook, and the
   handover-size guard's registration. Deliberately not seeded — a ceremony is
   seeded only when the PO can sign immediately.
5. **GIT-01 does not admit `revert`.** Deliberate or oversight? Two reverts this
   week were committed as `fix` with the reason in the body.
6. **Superseded count:** the 2026-09-06 snapshot contained 68 open Nova-B
   items. The current audit started at 61 open and 54 closed; its first two
   sanctioned reconciliation batches plus the Codex-dispatch duplicate,
   tilde-mutation, write-lane disposition, ADR-coverage, runtime-identity and
   reader-review and dispatch-record Critic-projection closures leave 49 open
   and 66 closed at that checkpoint; the 2026-09-11 reconciliation now records
   39 open and 69 closed. Frontmatter plus
   the append-only ledger remains authoritative, and each further change needs
   checked completion evidence.
7. **Installed-copy action completed:** the local Codex plugin is running the
   0.6.2 development build that contains the read-scope and GG-22 corrections.
   Later Nova-B commits still require a fresh local candidate sync before they
   can be claimed as installed behavior.
8. **Open from the 2026-09-06 design work:** whether the slicing nudge stays
   non-blocking if the channel probe fails.

### 2026-09-11 scope and Verify update

- Native Codex sandbox and App Server evidence under WSL is deferred to the
  three existing `sprint: none` items linked in the current decision above. It
  is neither Nova-B acceptance evidence nor a Nova-B blocker. Platform-neutral
  contracts and the ordinary fresh-session Critic remain in scope.
- Boundary-aware impacted Verify is closed by ADR-0081, implementation
  `2c890778`, correction `5c826023`, and a PASS delta Critic. Invalid impact
  bases force full execution and the push guard independently verifies strict
  ancestry; release and publication remain full-only.
- The current Main-Verify consumer-safe-path false positive was corrected in
  `23f178b2`; its repository check and 35 focused tests pass.

### 2026-09-12 Nova-B design update

- The non-dispatch governance-action gap now has a proposed design at
  `docs/adr/draft-governance-action-events.md`. It keeps dispatch/status on the
  existing dispatch-correlated lifecycle payload and introduces a separate,
  closed `pipeline.governance-action-event.v1` payload in the same stream for
  verification, review, gate, recovery, and reconciliation actions. The
  candidate binding, envelope equalities, ID derivation and complete
  kind/status/reason matrix are specified, but the prior claimed Critic pass
  was not candidate- or trajectory-bound. A fresh review therefore failed the
  admission/evidence boundary. No reviewed-design or PASS claim is active.
- Implementation remains unstarted pending formal ADR acceptance. The first
  slice also repairs the already measured four-versus-six lifecycle correlation
  schema drift. Exact-candidate deterministic evidence and a fresh refs-only
  review belong with the next stable candidate. Native Codex sandbox or
  App-Server behavior under WSL is not an input, acceptance criterion, or
  readiness claim for this work.

## Operational head

- Project calibration: [`project/pipeline.json`](../project/pipeline.json).
- Required gate: `node harness/scripts/verify.mjs`.
- Formal decisions: [`docs/adr/README.md`](adr/README.md); no state-local
  override is active.
- No reusable full-bootstrap receipt is stored publicly; run the full
  bootstrap. Machine-local installation details and private receipts are not
  versioned here.
- Active Sentinel authority and retention are governed by
  `governance/spec-retention.json` and the linked recovery package; no
  completion or go-live claim is made by this handover.
- Nova B is the active line of work; 0.6.0 ships as an interim release.

### Sentinel Links

Retained per `backlog/items/2026-07-20-spec-retention-on-close.md`,
enforced by `governance/spec-retention.json` + `check-spec-retention.mjs` —
keep linking all seven; do not prune (note carried over from the Phoenix
line's own checkpoint 71).

- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md
