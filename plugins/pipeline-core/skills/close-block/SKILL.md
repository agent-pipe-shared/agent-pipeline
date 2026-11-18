---
name: close-block
description: "Durable block-close ritual only: finalizes a stopped topic or a real runtime transfer. Normal same-topic restarts use handover-only and must not invoke this ritual."
disable-model-invocation: false
argument-hint: "<durable-stop|runtime-transfer> [block-id or short session label]"
allowed-tools: Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(git diff:*), Bash(node plugins/pipeline-core/scripts/close-coordinator.mjs:*)
---

## Hard entry gate — never close a normal restart

`close-block` is not a generic session-cut, restart, Compact, or “save the
handover” command. Before reading calibration, running an extension, Verify,
cleanup, or *any* close-coordinator command, the caller must supply exactly
one explicit intent as the first argument:

- `durable-stop`: the PO has decided not to continue the current topic after
  this block; or
- `runtime-transfer`: the PO is deliberately transferring the work to another
  PC, CLI/runtime, or separately operated environment.

No intent, a mere short restart, a context-window cut, “continue tomorrow”,
or an ambiguous request to save progress is a refusal: report
`CLOSE-INTENT-REQUIRED`, perform no close-block step, and use the
**handover-only route** below. Do not infer either intent from a session name,
a pending working tree, an active feature, or a request to start a new chat.
The executable coordinator enforces the same contract: `plan-start` and
`apply-start` require the matching digest-bound `--close-intent` value.

### Handover-only route for normal continuation

For a same-topic restart, write only the calibrated handover file with the
current worktree state, explicit unfinished items, and the next re-entry step.
Capture a sanitised resume hint when material input needs to cross the session
boundary. Then recommend a new session that begins with `pipeline-start`.
Do **not** invoke `close-block`, `close-feature`, `close-coordinator`, Verify,
cleanup, HISTORY/telemetry/retro, a final commit, or a plugin installation as
part of this route. An ordinary handover is not proof of a completed block.

H5 compatibility rule: after this gate admits a durable intent, close-block delegates checkpoint/finalization planning
to the unified close coordinator. It must not maintain a parallel completion
state or require push; inspect → plan-transition → confirmed `--activate`
apply, with publication and release handled as separate gates.

## Runtime-truth rule for either close profile

Carry the current bootstrap's `dutyNotRuntimeLive` readback into the close
report. If it names differing agent, skill or template files, attach the typed
`DUTY-NOT-RUNTIME-LIVE` note and those relative files to any claim about the
work just closed; never say the changed checkout duties are already "in
force" in the installed plugin. If no installed-versus-checkout comparison
was observed, say `runtime-live unverified`, not `in force`. A stale install
does not by itself prohibit an honest local-source close or require the user
to reinstall before recording unfinished work. This applies equally to the
full and close-light report.

## Mandatory H5 dispatcher

The coordinator decides which close mode is legal. The numbered ritual below
supplies tracked effects and evidence to that one state machine; it is not an
independent sequence and must not advance when its coordinator phase is stale.

1. Run `close-coordinator.mjs inspect` for the active lifecycle and use only a
   phase listed in its `next` result.
2. For a **checkpoint**, plan `checkpointed`, present its exact plan digest and
   returned action, and apply it only after confirmation. Stop there:
   `activeFeature` remains active; do not close State, create a final close
   commit, publish, release, or run cleanup.
3. For **completion**, advance in this exact order:
   `feature-close-prepared` (then execute only its returned, separately
   confirmed State-writer action, including any continuity close request) →
   complete the ritual's tracked Result/backlog/handover/HISTORY/telemetry/
   retrospective effects (a feature with active Continuity first follows the
   ordered route in `close-feature`: bootstrap, reconcile signature, close
   request) → bind them as `tracked-close-finalized` → create the
   one final tracked commit → `candidate-frozen` → persist exact private
   Verify/Security evidence → `final-verify-green`.
4. After `final-verify-green`, a no-push close uses confirmed descriptor-bound
   cleanup and ends at `closed-local`. Publication is a separate authorization
   branch (`publication-authorized` → `published` → `readback-confirmed` →
   cleanup → `delivered`). Release eligibility and promotion each require
   another independent authorization; neither is implied by close or push.
5. Every transition is first a read-only `plan-transition`. Show the exact
   request/action digest and execute only the returned `--activate` action
   after confirmation. A changed plan, State byte, candidate OID/tree,
   evidence file, destination, or coordinator CAS requires a new plan.

# close-block — session close ritual (parametrized)

Normative sources (agent-pipeline repo — canon pointers, not runtime reads): `docs/operating-model.md`, `harness/checklists/session-close.md`, `policies/model-policy.md` MP-16/MP-19/MP-20, ADR-0012 (handover), single source of truth. The shipped frontmatter keeps `disable-model-invocation: false`, as required by plugin validation; therefore the hard entry gate above is essential. An invocation without the PO's explicit `durable-stop` or `runtime-transfer` intent must refuse before any close step or commit. This skill runs IN the main context (no fork): it needs the session's own state (`/usage`, `/context`, what actually happened this block).

Intent: first argument, exactly `durable-stop` or `runtime-transfer` (mandatory).
The remaining arguments form the optional block label used in the telemetry
line and HISTORY entry.

## Step 0 — Read the project calibration (parametrization)

Read the project calibration at its resolved authority tier (`project/pipeline.json`, else `.claude/pipeline.json`) of the current project. Keys starting with `$` are documentation — ignore them. Fields this ritual consumes:

| Field | Used for | Default when absent |
|---|---|---|
| `project` | telemetry + report naming | — (required) |
| `verify` | step 3 gate run (the ONE verify command) | — (required) |
| `claudeMdMaxLines` | step 4 length gate | warn "uncalibrated length gate" (no silent number) |
| `handover` | step 5 target file | `docs/state.md` (convention, `docs/operating-model.md`, *The lifecycle* — step 8, Close; *Project calibration and extensions*) |
| `wipLimit` | step 4 stale-worktree/WIP check | 3 (base rule) -- caps concurrently open blocks/worktrees, not parallel Goldfish within one block |
| `ritualExtensions` | steps 1 and 9 extension points | none |

**File missing or required fields missing → fail-safe, no silent guessing (`docs/operating-model.md`, *Project calibration and extensions*):** announce explicitly that the project is **"uncalibrated"**, STOP for all writing steps of this ritual, offer to draft the calibration from the field table above (canonical filled example: `templates/pipeline.json.example` in the agent-pipeline repo; an installed plugin cannot read repo templates, so generate the draft from the field list) and name the new file to the PO for confirmation. Read-only reporting of the session state stays allowed.

## Extension-point contract (extend WITHOUT forking)

**Reference:** the extension-point contract (`close.pre`, `close.post`, entry semantics) moved to `references/close-light-and-extensions.md` section 1; load it when the calibration declares `ritualExtensions` (steps 1 and 9).

## Ritual steps (in order)

1. **Run `close.pre` extensions** (contract above). Report each entry + outcome.
2. **Close the block honestly:**
   - Block/task boundary reached? No close mid-task unless forced — then record why.
   - Assign DoD status per task: `done` / `🟡 not-human-verified` / `blocked` (`harness/definition-of-done.md` §3). Nothing ships as "done" without evidence.
   - Every blocker/major Critic finding of the block is dispositioned (fix / rejected with reason / escalated to the PO); mandatory-trigger tasks have a findings report before merge (`harness/review-protocol.md` §2.1, *Trigger decision table*).
3. **Run the verify gate:** execute the calibration's `verify` command. The evidence is the **machine-written output** (file/log written by the script) + exact command + exit code — never model prose. Red verify → the block cannot close as "done": record the failure state honestly, mark affected tasks `blocked`/`🟡`, and say so in the handover. Closing with a red gate is allowed ONLY as an explicitly marked unfinished state — no merge on red.
   - **Observation/document governance precheck (Agent-Pipeline checkout only):** when either `governance/observation-doc-governance.json` or `.github/ISSUE_TEMPLATE/observation.yml` exists, require both plus `harness/scripts/check-observation-governance.mjs` and run `node harness/scripts/check-observation-governance.mjs` before the full Verify. A missing counterpart, non-zero result, unclassified `docs/` artifact, or Issue/Backlog/overlay contract drift leaves close unfinished and must be reported explicitly. Do not auto-classify, delete, promote, create a network object, or treat the later Verify as a substitute for this finding.
   - **P3 close-transition evidence:** Stage-1 Verify is green before semantic Critic review. After Critic/corrections/delta re-gates and every candidate mutation are complete, append one deterministic Result-first close intent binding the active authority, graph and package-binding digests plus Stage-1 evidence; then apply the expected-revision State CAS. The CAS is the logical commit point, not a claim of a cross-file atomic rename. Retry a crash window with the same intent bytes, Result digest and receipt identity.
   - **Exact delivery tail:** run the same full verify again on the exact post-CAS candidate and persist only its command/result digests and candidate OID/tree. Any tracked candidate mutation makes that final-verify evidence stale and blocks delivery until regeneration. After it passes, delivery and fetch-back are confirmation-only: do not mutate candidate bytes; fetch-back must equal the pushed exact OID before the lifecycle may close.

**Reference:** steps 3b and 3c (`runtime-transfer` only: transfer classification, bound-artifact transfer fidelity) moved to `references/close-light-and-extensions.md` section 2; load it for a `runtime-transfer` close, before step 4.

4. **Drift checks ("Docs are a snapshot, code is truth"):**
   - **Handover freshness / merge-completion gate:** after any merge of this block, the handover file must already carry the new state — if the repo state is newer than the handover, fix that NOW (that exact post-merge step is where the documented drift was born).
   - **CLAUDE.md length gate:** project CLAUDE.md line count ≤ `claudeMdMaxLines`. Over the limit → consolidate, move procedures to skills/hooks, or delete — growing means consolidating (`docs/operating-model.md`, *What the model protects*).
   - **Memory mirror:** memory (user/project scope) contradicting the repo is corrected in favor of the repo — memory is mirror only.
   - **Stale worktrees / WIP:** `git worktree list`; clean or explicitly list leftovers; respect `wipLimit` (max open human-gate processes per project).
   - **Session-owned residue:** when continuity runtime carries a `sessionCleanup` handle, first run its read-only `hygiene` command with the exact bound handle, then run `session-cleanup.mjs cleanup --repo "$PWD" --session-descriptor <sessionId> --expected-descriptor-sha256 <persisted-digest>`. Successful cleanup writes the closure receipt, retires the private descriptor and CAS-releases the exact State tuple. If cleanup committed but State release was interrupted, run `session-cleanup.mjs release-binding --repo "$PWD"`; it requires that same closure receipt. A failed cleanup, missing or changed active descriptor, remaining manifest, noncanonical linked worktree or unreleased tuple makes the close unfinished; never infer deletion targets or print the descriptor path/nonce. Only the digest-bound `plan-recovery`/`apply-recovery` path with explicit PO confirmation may resolve the ambiguous case where both descriptor and closure receipt are absent.
5. **Handover update (single source):** update the handover file (calibration `handover`, default `docs/state.md`): current state, decisions, open items (including all 🟡/blocked from step 2 — nothing silently dropped), next block, re-entry protocol. This file is the ONLY carrier of "open/next". Register-append discipline: append new register rows at the TABLE END (edit anchor = the last existing row, never a mid-table line), then re-check row order (two mis-ordered appends in one session motivated this rule).
   - **Scratch custody report (WARN only):** after that handover write, run `node plugins/pipeline-core/scripts/scratch-custody-check.mjs --root "$PWD"`. Record the report path/status and each typed warning in the close output and handover. This action reads bounded bytes, modes and SHA-256 values only; it never writes, stages, or deletes. A missing report or any finding does not refuse the close.
   - **Bound-path status report (WARN only):** after the handover write, run `node plugins/pipeline-core/scripts/bound-path-status-report.mjs --root "$PWD"` and record its rendered lines in the handover. It lists each State-bound path as tracked, ignored, untracked or modified and names the device-local artifacts; it never writes, stages, or deletes. A finding (ADR-0063 amendment 2026-10-15) or a missing report does not refuse the close.
6. **HISTORY entry (append-only past):** append the block entry with the mandatory lessons block. Its "open/next" part is **generated from or references the handover — never hand-duplicated** (two hand-maintained copies drift by construction).

6b. **Authorship check (EL-01/EL-16)** — mandatory, BEFORE step 7's self-retro (an incident reclassifies the retro, not vice versa; this sub-step does not renumber the surrounding steps):
   - Enumerate the session's production diffs: `git log` over the session range (lower bound = the repo HEAD recorded by this session's bootstrap, named in the handover session block; fallback: all commits of the current calendar day) + diff stat.
   - Answer the mandatory question (verbatim): "Whose are this session's production diffs?" — every diff MUST map to a Goldfish/Critic dispatch (`evidence/dispatch-record-<TASK_ID>.json` + `Dispatch: <TASK_ID> (goldfish)` trailer line) or to the `roles/elephant.md`, *EL-01*, stage-0 fast path. Cross-reference source: the session block's dispatch enumeration and the telemetry line.
   - Any Elephant-authored production diff outside stage-0 ⇒ **INCIDENT**, never a retro "discussion point": flag explicitly to the PO in the close output, write an incident note into the handover file and the telemetry line.
   - **PO-waived direct implementation (the one narrow exception to the line above).** If, and only if, the PO explicitly pre-authorized Elephant-direct implementation for this specific bounded block (a stated waiver in the transcript/handover — "go ahead and implement this yourself," AFK pre-authorization for a fix-and-reverify round, or equivalent — never inferred from silence or from the absence of a Goldfish dispatch), the diff is not an INCIDENT, but the close output MUST record: (a) the waiver, quoted or closely paraphrased, with its scope; (b) that no live Critic review covered this diff before push; and (c) a `workflow-improvement`-typed backlog item (or a dedicated handover flag if no backlog item is filed) requiring a fresh-context Critic review of exactly this diff as the FIRST action of the next session that touches this repository, before the diff is treated as gate-complete. This turns a PO waiver into an explicit, trackable follow-up rather than a silent gap the next authorship check might or might not notice.

6c. **Handover rotation (head-size discipline — keeps the handover file slim, not just once but ON EVERY CLOSE)** — mandatory check, same non-renumbering contract as 6b:
   - **Register discipline (every close, no threshold, no exception, where the project's handover maintains a decision register/log):** a new register entry's 1-line title stays in the handover file's decision-register/index (step 5's "append at table end" rule, applied to the index row, if the project uses one); the entry's full prose paragraph is appended in the SAME close to the project's own archive (an append-only `docs/state-archive/`-style location) — never written into the head as full prose, not even transiently. This is what keeps the head from re-accumulating register bulk between rotations; where a project's handover uses a register at all, this is how new entries are written from now on.

**Reference:** the session-block rotation bullets of step 6c (threshold-triggered rotation, `rotate-handover-sections.mjs`, first-rotation archive, automated size-gate check) moved to `references/close-light-and-extensions.md` section 3; load it when the handover head is over target or step 6c's size check asks for a rotation. The register discipline above and the bullets below stay here.

   - For a project with no `docs/state.md`-specific automation and no `handover-rotate.mjs` present → create an archive convention manually (purpose, append-only contract, file list) BEFORE moving content; report the new archive location in the close report (bundled at the gate, not a separate mid-task confirmation — approval-fatigue, `harness/review-protocol.md` §2.1, *Trigger decision table*).
   - Name the rotation explicitly in the close report (what moved, to which path) if anything moved this close — a silent rotation is a lost trail exactly like any other silently-skipped step in this ritual.

**Reference:** step 6d (hard-cap rotation, ADR-0066) moved to `references/close-light-and-extensions.md` section 4; load it after step 6c, mandatory check.

**Reference:** step 7 (Learn + measure: self-retro, fan-out utilisation, tooling radar, growth rule, three-artifacts archive) moved to `references/close-light-and-extensions.md` section 5; load it at step 7, the self-retro is mandatory on every close.

7b. **Error-register update (mandatory, after Learn + measure, before Telemetry)** — this sub-step does not renumber the surrounding steps (same contract as 6b): `backlog/error-register.md` is the sole public concrete form authority; `docs/operating-model.md` is the process authority. Its checker must pass before a close claims this update. Add only a semantically consolidated, sanitized class in that exact form; never raw events, chronology, counts, rankings, priorities, or private data. A recurring class gets in the same close exactly one disposition in the order mechanism (hook/guard/script) > template (briefing/checklist line) > curated lesson, or a reasoned deferral — never a bare recurring marker. Never inject, cite, or load the board in a Goldfish or Critic briefing. A missing or unreadable adopted public authority is a fail-closed close finding, not a private fallback.

**Reference:** step 8 (telemetry line, MP-20, `usage-ledger.mjs`) moved to `references/close-light-and-extensions.md` section 6; load it at step 8.

9. **Run `close.post` extensions** (contract above).
10. **Final commit:** conventional, small, atomic; include handover + HISTORY + telemetry + extension outputs. Agent-authored commits carry `AI-Assisted: true`; provider/model co-author metadata, session URLs/IDs, and account correlation are prohibited, as are secrets and machine-specific absolute paths. **Push per the project's push policy** (committed calibration/CLAUDE.md). Never force-push; the git-guard union additionally blocks destructive git.

### Strict feature-branch delivery extension

**Reference:** the strict feature-branch delivery extension (`publicPushIdentity.mode: required`) moved to `references/close-light-and-extensions.md` section 7; load it when the calibration declares that mode.

11. **Session cut recommendation:** check `/context`; at ~70–80 % fill or a natural boundary recommend the planned session cut — the next session bootstraps from the handover via `/pipeline-core:pipeline-start` (`docs/operating-model.md`, *The lifecycle* — steps 1 and 8; a session that drifts into auto-compaction is a process error).

## Close-light variant (hard eligibility gate — small-session shortcut)

A compressed ritual for genuinely small blocks (companion to `harness/checklists/small-session.md`).

**Reference:** the close-light eligibility gate (four boxes), the close-light ritual and what it skips moved to `references/close-light-and-extensions.md` section 8; load it before choosing close-light. Without that gate checked box by box the full ritual applies.

## Completion report to the PO (end of ritual)

Short, in order: calibration used (file + project) · extensions run (pre/post, outcomes) · verify result + evidence path + exit code · drift-check results (handover, CLAUDE.md gate, memory, worktrees) · handover + HISTORY updated (paths) · telemetry rows appended (count) · self-retro filed (item/path, or explicit "nothing") · commit hash · `/context` reading + cut recommendation. If ANY step was skipped, name it and why — a silently incomplete close is worse than an honestly partial one. **Close-light closes** report the same shape, condensed: which gate box made it eligible, verify result, authorship-check outcome, telemetry row, push, and the one-paragraph handover update — name explicitly that steps 4 (formal)/6/11 were skipped by the light-profile contract, not silently omitted.
