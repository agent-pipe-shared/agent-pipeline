# Handover archive -- Earlier handover — 2026-09-09: lifecycle recovery and selected review blocker, Earlier handover — 2026-09-09: candidate evidence and remaining closure

> Rotated from `docs/state.md` on 2026-09-14 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Earlier handover — 2026-09-09: lifecycle recovery and selected review blocker, Earlier handover — 2026-09-09: candidate evidence and remaining closure.
> Summary: Archive superseded 2026-09-09 candidate and lifecycle checkpoints
> Append-only once written; never edited by hand.
> Content below is byte-for-byte identical to its original `docs/state.md` text at the time of rotation.

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

