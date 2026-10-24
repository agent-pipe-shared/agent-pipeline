# 0.7.0 completion and Greenfield qualification plan

Status: operative PO direction, 2026-10-24. Applies to every runner and every
continuing session. Read this plan from the public handover before continuing
candidate work. It supersedes older sequencing notes in the Codex transfer and
next-local-candidate plans. It changes no PRD, Spec, accepted criterion, proof
authority or review budget.

## Release scope and matrix

- Remove every explicitly post-0.7.0-deferred item from the active 0.7.0
  denominator. Preserve historical measurements and a reasoned exclusion list.
- Include every P0/P1 from the three supplied Codex, Claude and Antigravity
  Greenfield reports. Preserve original clause references and exact duplicate
  aliases; count the same defect once. Retain other already mandated fixes.
- Stage 75 means the original content is implemented with matching focused
  qualification, ready for review. Native-only remaining work follows the
  recorded batch-10 rubric and remains visible. Stage 75 is not acceptance.
- Target all active content at stage 75. New Greenfield findings remain visible
  even when their addition lowers the aggregate index. Never manufacture a
  stage increase from a commit, installation, inert patch or skipped test.
- Prepare a separate 0.7.1 review inventory from currently unassigned `none`
  items, excluding active 0.7.0/Alfred and Nightwing work. Preserve closed history
  separately. Deferred items whose old header still says Alfred stay explicitly
  identified; preparation does not silently change their assignment.
- Do not review, implement or activate the 0.7.1 course until BOTH the 0.7.0
  release and its genuine close-block are complete.

## Execution sequence

1. **Complete the content and stabilize real Greenfield paths.** Finish the
   active P0/P1 and other release clauses. Disjoint implementation slices run
   concurrently with one owner per shared logical file. Each fix receives
   meaningful focused tests and retained negative controls. Consume matching
   owner evidence; requalify actual dependency drift or integration conflicts.
   Run genuine supported platform/runner Greenfield combinations on stamped,
   installed candidates. Start an informative run as soon as the known happy
   path blockers are fixed rather than postponing all feedback to the end.
2. **Run a preparatory full Verify and Security sweep.** Once the happy paths
   are stabilized, exercise the full configured test surface, classify every
   red as a product defect, stale examiner, environment fault or real pending
   prerequisite, and fix it. This sweep is preparation/diagnostic evidence;
   it does not claim the final consumed-Critic release qualification. Preserve
   unavailable/skipped native duties honestly. Repeat affected checks after
   corrections and rerun affected real Greenfield paths when warranted.
3. **Finish planned writes and freeze the review candidate.** Finish applicable
   documentation, registration, version/stamp preparation and configured
   tracked close effects in their sanctioned order. Resolve real operator or
   signing requirements. Name exact commit, tree, scope and evidence boundaries.
   Do not append casual tracked changes after this freeze.
4. **Run one full independent Critic batch.** Before admission, run the required
   targeted deterministic chain and the configured Critic-mode Verify or
   validated diagnostic route. Assemble evidence/review packets during earlier
   work, but do not spend full Critic reviews on each item or unstable drafts.
   Use one coherent Correction Goldfish for findings. Follow-ups cover only
   the correction diff from the immediately preceding reviewed candidate and
   its direct regressions. One full review plus AT MOST three correction-diff
   reviews per declared batch; stop earlier on genuine PASS. Renaming/splitting
   the batch does not reset its history. No automatic full-review restart.
5. **Run final release-mode Full Verify and Security.** After the final Critic
   PASS, use the release route against the frozen final candidate and bind the
   consumed Critic packet/lifecycle receipt. A preparatory pass does not replace
   this result. Require the original platform/runner qualification, acceptance
   and publication gates; no release follows a stale or diagnostic-only proof.
6. **Accept and publish through the existing gates.** Preserve separate actual
   PO acceptance, signing, publication authorization and remote readback duties.
   Release/close operations are not inferred from an ordinary continuation.

## Candidate binding and avoiding review/Verify loops

Critic is read-only. The Verify producer writes its evidence outside the
qualified tracked source. Therefore successful Critic and final Verify can bind
the same unchanged commit AND tree; generating their private evidence does not
require a new source commit.

If Critic finds a real defect, correct it, run matching checks, and review only
its correction diff before the final release Verify. If the final Verify finds
a new defect requiring a tracked change, that candidate is no longer final:
correct it, rerun the affected checks, use the remaining bounded delta-review
course and produce fresh release Verify evidence. Record the actual finding and
remaining review budget; do not restart the full Critic or loop indefinitely.
At the configured limit, follow the existing escalation/PO-decision route.

There is a narrow existing carry-forward contract for later immutable,
feature-package-registered evidence commits. It is usable only when its
validator proves the whole intervening range is eligible evidence. It is not
an exemption for code, version manifests, mutable documents or arbitrary
"documentation-only" commits. Final Verify must still bind the actual target
candidate. Complete planned source/version writes before freeze wherever the
sanctioned release order permits.

Source contracts: [Operating Model](../../../docs/operating-model.md),
[Critic/Verify lifecycle](../../../plugins/pipeline-core/lib/critic-verify-lifecycle.mjs),
[Verify producer](../../../plugins/pipeline-core/scripts/verify-evidence-producer.mjs),
[close coordinator](../../../plugins/pipeline-core/scripts/close-coordinator.mjs).
The existing Critic duty inside a consumer Greenfield scenario, if that
scenario requires it, is distinct from reviewing this pipeline's Source batch;
neither is silently waived to reduce cost.

## Greenfield observations and continuation discipline

Use a repeatable agreed consumer workflow: intake, actual authoring, required
plan approval, first implementation dispatch/return/integration, configured
checks, required review, close and publication where the scenario requires it.
Preserve the tested build, runner, OS/shell, scenario and outcome. Record
unplanned stops, recovery loops, manual repair commands and extra PO actions;
ordinary designed signatures remain part of the expected workflow. Do not
invent a numeric resource/toil limit or claim compliance without measurement.

Preserve all three original reports and their aliases. A fix is not native
qualification merely because a controlled fixture passes. A newly detected
blocker is source-confirmed, assigned to an owned slice and added to the matrix;
PRD/Spec changes still require separate explicit PO permission.

Prefer the supported exact signature recovery for a real guard refusal. A
misleading `NONOVERRIDABLE` message must explain the actual missing author-root
or unavailable route, not force each session to rediscover it. Human operator
escapes remain honestly recorded exceptions, never agent-issued bypasses or
proof that a signature was supplied. Routine approved-scope work does not
create repeated PO permission gates. No automatic early Critic, stamp, install,
push, release or close-block is created by this plan.
