---
name: close-block
description: "Durable block-close ritual only: finalizes a stopped topic or a real runtime transfer. Normal same-topic restarts use handover-only and must not invoke this ritual."
disable-model-invocation: true
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
   retrospective effects → bind them as `tracked-close-finalized` → create the
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

Normative sources (agent-pipeline repo — canon pointers, not runtime reads): `docs/operating-model.md`, `harness/checklists/session-close.md`, `policies/model-policy.md` MP-16/MP-19/MP-20, ADR-0012 (handover), single source of truth. `disable-model-invocation: true` is deliberate: closing writes a commit — the PO times it, the model never self-triggers it. This skill runs IN the main context (no fork): it needs the session's own state (`/usage`, `/context`, what actually happened this block).

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

This skill defines two **named extension points**; the project hangs its own steps there via `ritualExtensions` in the project calibration at its resolved authority tier (`project/pipeline.json`, else `.claude/pipeline.json`):

- **`close.pre`** — runs as step 1, after the calibration read (step 0), BEFORE any of this ritual's own steps 2–11. **Repo state it sees:** HEAD and the working tree are exactly the state the block/session was in when this skill was invoked — none of the ritual's writes (handover, HISTORY, telemetry, retro item, final commit) exist yet (typical use: changelog sync, generated-docs refresh).
- **`close.post`** — runs as step 9, AFTER handover/telemetry/retro (steps 5–8), BEFORE the final commit (step 10). **Repo state it sees:** the handover update (step 5), HISTORY entry (step 6), retro item (step 7) and telemetry rows (step 8) are already written to the WORKING TREE, but HEAD is still the PRE-close commit — the final commit has not happened yet (typical use: project hygiene checks whose output should be committed with the close). **Hint for gate authors:** a hook here that reads HEAD's commit date/timestamp as "now" sees yesterday's commit, not this close — use system time (`date` / `Date.now()`), never HEAD's commit date, as the freshness reference.

Entry semantics (each entry is a string, executed in array order):

1. Invoke as a **skill** ONLY when the entry starts with `/` (e.g. `/acme-db-hygiene`) OR the WHOLE entry matches `^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$` — no whitespace, exactly one namespace colon (e.g. `pipeline-core:pipeline-start`).
2. Anything else → execute as a **shell command** from the project root. A colon inside a longer command line does NOT make it a skill: `pnpm run sync:changelog`, `npm run build:prod`, `docker run image:tag` are shell commands.

Rules: extension points not defined by this skill (e.g. a future `newBlockReview.post`) are ignored here. A failing entry STOPS the ritual with an explicit report naming the entry — never skip silently. **DoD anchor (hard):** a project-specific ritual step is addable via this file WITHOUT forking the central skill — forking restarts the copy-paste inheritance (anti-pattern AP1).

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

3b. **Transfer classification (`runtime-transfer` close-intent only; backlog `pipeline.spec-retention-on-close`, criterion 2)** — mandatory when this close's `--close-intent` is `runtime-transfer` (the PO is moving the work to another PC, CLI/runtime, or separately operated environment, incl. a Public/Private boundary crossing); skipped for `durable-stop` closes. This sub-step does not renumber the surrounding steps (same contract as 6b): run `node plugins/pipeline-core/lib/transfer-classification.mjs` BEFORE step 4's drift checks. A `blocked` result means at least one active PRD/Spec/acceptance-matrix authority named in `governance/spec-retention.json` would be omitted from THIS transfer without both a durable archive destination (an existing, bound archive-manifest entry) and an explicit recorded PO disposition (`governance/transfer-dispositions.json`, schema `pipeline.transfer-disposition.v1`) — leave the close unfinished, report the exact blocked id/key from the tool's findings, and do not proceed past this sub-step by re-running `checkSpecRetention` instead (that gate answers a different, later question: whether the archive already lost fidelity, not whether this transfer is about to omit an unarchived, undispositioned authority). A recorded disposition is never inferred from silence, an "obviously fine" omission, or a prior close's disposition for a different authority/key pair.
4. **Drift checks ("Docs are a snapshot, code is truth"):**
   - **Handover freshness / merge-completion gate:** after any merge of this block, the handover file must already carry the new state — if the repo state is newer than the handover, fix that NOW (that exact post-merge step is where the documented drift was born).
   - **CLAUDE.md length gate:** project CLAUDE.md line count ≤ `claudeMdMaxLines`. Over the limit → consolidate, move procedures to skills/hooks, or delete — growing means consolidating (`docs/operating-model.md`, *What the model protects*).
   - **Memory mirror:** memory (user/project scope) contradicting the repo is corrected in favor of the repo — memory is mirror only.
   - **Stale worktrees / WIP:** `git worktree list`; clean or explicitly list leftovers; respect `wipLimit` (max open human-gate processes per project).
   - **Session-owned residue:** when continuity runtime carries a `sessionCleanup` handle, first run its read-only `hygiene` command with the exact bound handle, then run `session-cleanup.mjs cleanup --repo "$PWD" --session-descriptor <sessionId> --expected-descriptor-sha256 <persisted-digest>`. Successful cleanup writes the closure receipt, retires the private descriptor and CAS-releases the exact State tuple. If cleanup committed but State release was interrupted, run `session-cleanup.mjs release-binding --repo "$PWD"`; it requires that same closure receipt. A failed cleanup, missing or changed active descriptor, remaining manifest, noncanonical linked worktree or unreleased tuple makes the close unfinished; never infer deletion targets or print the descriptor path/nonce. Only the digest-bound `plan-recovery`/`apply-recovery` path with explicit PO confirmation may resolve the ambiguous case where both descriptor and closure receipt are absent.
5. **Handover update (single source):** update the handover file (calibration `handover`, default `docs/state.md`): current state, decisions, open items (including all 🟡/blocked from step 2 — nothing silently dropped), next block, re-entry protocol. This file is the ONLY carrier of "open/next". Register-append discipline: append new register rows at the TABLE END (edit anchor = the last existing row, never a mid-table line), then re-check row order (two mis-ordered appends in one session motivated this rule).
6. **HISTORY entry (append-only past):** append the block entry with the mandatory lessons block. Its "open/next" part is **generated from or references the handover — never hand-duplicated** (two hand-maintained copies drift by construction).

6b. **Authorship check (EL-01/EL-16)** — mandatory, BEFORE step 7's self-retro (an incident reclassifies the retro, not vice versa; this sub-step does not renumber the surrounding steps):
   - Enumerate the session's production diffs: `git log` over the session range (lower bound = the repo HEAD recorded by this session's bootstrap, named in the handover session block; fallback: all commits of the current calendar day) + diff stat.
   - Answer the mandatory question (verbatim): "Whose are this session's production diffs?" — every diff MUST map to a Goldfish/Critic dispatch (`evidence/dispatch-record-<TASK_ID>.json` + `Dispatch: <TASK_ID> (goldfish)` trailer line) or to the `roles/elephant.md`, *EL-01*, stage-0 fast path. Cross-reference source: the session block's dispatch enumeration and the telemetry line.
   - Any Elephant-authored production diff outside stage-0 ⇒ **INCIDENT**, never a retro "discussion point": flag explicitly to the PO in the close output, write an incident note into the handover file and the telemetry line.
   - **PO-waived direct implementation (the one narrow exception to the line above).** If, and only if, the PO explicitly pre-authorized Elephant-direct implementation for this specific bounded block (a stated waiver in the transcript/handover — "go ahead and implement this yourself," AFK pre-authorization for a fix-and-reverify round, or equivalent — never inferred from silence or from the absence of a Goldfish dispatch), the diff is not an INCIDENT, but the close output MUST record: (a) the waiver, quoted or closely paraphrased, with its scope; (b) that no live Critic review covered this diff before push; and (c) a `workflow-improvement`-typed backlog item (or a dedicated handover flag if no backlog item is filed) requiring a fresh-context Critic review of exactly this diff as the FIRST action of the next session that touches this repository, before the diff is treated as gate-complete. This turns a PO waiver into an explicit, trackable follow-up rather than a silent gap the next authorship check might or might not notice.

6c. **Handover rotation (head-size discipline — keeps the handover file slim, not just once but ON EVERY CLOSE)** — mandatory check, same non-renumbering contract as 6b:
   - **Register discipline (every close, no threshold, no exception, where the project's handover maintains a decision register/log):** a new register entry's 1-line title stays in the handover file's decision-register/index (step 5's "append at table end" rule, applied to the index row, if the project uses one); the entry's full prose paragraph is appended in the SAME close to the project's own archive (an append-only `docs/state-archive/`-style location) — never written into the head as full prose, not even transiently. This is what keeps the head from re-accumulating register bulk between rotations; where a project's handover uses a register at all, this is how new entries are written from now on.
   - **Session-block rotation (threshold-triggered, where the handover accumulates per-session/per-block prose in its head):** after step 5 updates this close's state in the head, check the handover file's size. Target: the operative head (re-entry pointer, environment, open items, next steps, plus any recently-kept session/block entries) stays **≤ ~25k tokens — readable in one pass** (the measurable goal this step protects). Over target, OR more than the last **2 full session/block entries** are sitting in the head → move the OLDEST entries verbatim (byte-for-byte, no paraphrasing) into the project's own archive file(s) (append-only; start a new dated file rather than growing one file without bound, e.g. per month) — keep only the operative sections plus the last 1–2 entries in the head.
     **For `docs/state.md` specifically, this half of the step is executable, not manual:** run `node plugins/pipeline-core/scripts/rotate-handover-sections.mjs` (dry-run) to see the plan, then `--apply` to write it. The script archives only entries that are simultaneously older than the retained newest N (`--retain-count`, default 2), carry no open marker (`(current)`/`(in progress)` in the heading), and are not cross-referenced from the never-rotatable tail sections (Operational head, Open items and next block, Observation publication queue, Re-entry, Recovery) — fail-safe toward retaining, never toward archiving something still live. Archive destination: `docs/state-archive/<YYYY-MM>.md`, one file per calendar month of the archived entry's own date. Regression coverage: `plugins/pipeline-core/scripts/rotate-handover-sections.test.mjs`. Never run `--apply` while this session's own work is still open in the head — only after this close's own entry has been written and is itself either retained (newest-N) or already closed by an explicit non-`(current)` heading.
   - No archive convention yet on this project (first rotation) → the script creates one automatically (a standard header on the first write to each new `docs/state-archive/<YYYY-MM>.md` file); report the new archive location(s) in the close report (bundled at the gate, not a separate mid-task confirmation — approval-fatigue, §4.2).
   - **Automated size-gate check (where `plugins/pipeline-core/scripts/handover-rotate.mjs` is present — ported from Nova's ADR-0066 shape, this repo's own ADR-0073; COEXISTS with the `docs/state.md`-specific `rotate-handover-sections.mjs` above rather than replacing it, per step 6d below):** run `node plugins/pipeline-core/scripts/handover-rotate.mjs --check-size --file <handover path>` as a machine-checked backstop to the manual size judgment above — it reports the file's current byte size against the configured (or default 12,000-byte) threshold and exits non-zero when over, so "check the handover file's size" is a run command, not a guess. This check is READ-ONLY and makes no rotation decision by itself: an over-threshold result is a signal to perform the session-block rotation above (or, for a section old enough and already extraction-acknowledged per ADR-0060/ADR-0073, to run the same script's `--dry-run` mode and review its proposed archive plan before any actual move) — it never triggers an automatic rewrite of the handover file. A missing script (older plugin copy) is not a close blocker; fall back to the manual size judgment.
   - For a project with no `docs/state.md`-specific automation and no `handover-rotate.mjs` present → create an archive convention manually (purpose, append-only contract, file list) BEFORE moving content; report the new archive location in the close report (bundled at the gate, not a separate mid-task confirmation — approval-fatigue, `harness/review-protocol.md` §2.1, *Trigger decision table*).
   - Name the rotation explicitly in the close report (what moved, to which path) if anything moved this close — a silent rotation is a lost trail exactly like any other silently-skipped step in this ritual.

6d. **Hard-cap rotation (ADR-0066) — a SECOND, newer rotation mechanism, independent of 6c's session-block rotation** — mandatory check, same non-renumbering contract as 6b/6c. `plugins/pipeline-core/scripts/handover-rotate.mjs` (generalized, config-driven per project, ADR-0066 Decision 5) COEXISTS with 6c's `rotate-handover-sections.mjs` rather than replacing it as of this writing — reconciling the two into one mechanism is an open follow-up, not decided by this step:
   - Measure the handover file's current size against the configured hard cap (`plugins/pipeline-core/lib/handover-rotation.mjs`'s `resolveHandoverConfig()`; default `docs/state.md` / 12,000 utf8-byte-upper-bound bytes). Where this project's `hooks.json` has the `guard-handover-size.mjs` PreToolUse guard wired in, a growing write to the handover file already refuses once at/over the cap — this step is what actually clears that refusal, not merely a suggestion.
   - Whenever archiving the block just closed would keep the file comfortably under the cap, OR the file is already over/near the cap, run the rotation script against THIS block's own just-closed section before finishing the close. **Check status first, read-only:** `node plugins/pipeline-core/scripts/handover-rotate.mjs --root "$PWD" --status` — this reports whether `--acknowledge-extraction-done` has ever been recorded for this repository, with no side effect (it never writes the marker itself).
     - **Already acknowledged** (status reports RECORDED): proceed with rotation as before — `node plugins/pipeline-core/scripts/handover-rotate.mjs --root "$PWD" --section-heading "<exact heading of the block just closed>" --summary "<one-line summary>"`.
     - **NOT yet acknowledged** (status reports NOT recorded): STOP — do not run `--acknowledge-extraction-done` as a routine part of this ritual, and do not rotate. Acknowledging it asserts that the one-time durable-rule extraction pass (ADR-0066 Decision 7) is genuinely complete for THIS repository — a human/Elephant judgment call, never an automated step of routine closing. State this explicitly in the close output and leave the acknowledgment decision to a human/Elephant dispatch outside this ritual.
   - Report in the close output whether this step ran, and if so, which section moved to which `docs/state-archive/<ISO-date>--<slug>.md` file — a silent rotation is a lost trail, same rule as 6c.

7. **Learn + measure:**
   - **Self-retro:** the **session elephant writes the close retro itself** — concrete improvement item(s), or an explicit "nothing" — filed as a `workflow-improvement` backlog item (agent-pipeline repo's `backlog/items/`, or a transfer note in the handover per the mechanic below if that repo is absent on this machine), addressed to the pipeline elephant (continuous-improvement process). MANDATORY part of EVERY close, never silently skipped — silence is not an option (`docs/operating-model.md`, *The lifecycle* — step 8, Close). The PO submits his own observations separately, on his own channel; there is no ritual prompt to the PO anymore.
   - **Tooling radar due? (tooling-policy R2 anchor):** compare the date of the newest `tooling-radar` backlog item in the agent-pipeline repo's `backlog/items/` with the current calendar month. If the newest radar item is older than the current calendar month (or none exists), the monthly radar run is OVERDUE: say so LOUDLY in the ritual output and recommend a radar dispatch (per `policies/tooling-policy.md` §4 R2–R4) — never pass over it silently. This check is the deterministic anchor of the R2 catch-up rule.
   - File `workflow-improvement` items in the agent-pipeline repo's `backlog/`; if that repo is not present on this machine, record the item verbatim in the handover for transfer.
   - Growth rule: any agent failure of this block traced to a missing/vague rule → add/sharpen the rule in the right artifact (CLAUDE.md fact, hook, skill) — and keep the length gate green.
   - Three-artifacts archive for rigor ≥ 1: (1) problem/spec, (2) acceptance criteria, (3) result report — versioned; full chat logs are NEVER archived. `AI-Assisted: true` is an anonymous assistance marker only; the dispatch record plus grounded `Dispatch:` trailer carry work-package provenance. Provider/model co-author metadata, session URLs/IDs, and account correlation are prohibited.
   - Rigor-0 lessons may be bundled into one collective entry (`docs/operating-model.md`, *Rigor, risk and gates*).
7b. **Error-register update (mandatory, after Learn + measure, before Telemetry)** — this sub-step does not renumber the surrounding steps (same contract as 6b): `backlog/error-register.md` is the sole public concrete form authority; `docs/operating-model.md` is the process authority. Its checker must pass before a close claims this update. Add only a semantically consolidated, sanitized class in that exact form; never raw events, chronology, counts, rankings, priorities, or private data. A recurring class gets in the same close exactly one disposition in the order mechanism (hook/guard/script) > template (briefing/checklist line) > curated lesson, or a reasoned deferral — never a bare recurring marker. Never inject, cite, or load the board in a Goldfish or Critic briefing. A missing or unreadable adopted public authority is a fail-closed close finding, not a private fallback.

8. **Telemetry line (MP-20), auto-captured via `usage-ledger.mjs`:** `/usage` is a **user command and session-scoped** — numbers are NOT retrievable after the session ends, which is why the token half of this step now runs through `plugins/pipeline-core/scripts/usage-ledger.mjs` instead of a manual paste. New order of operations:

   1. **Run the ledger for the CURRENT session** with `--row <block label>`: prefer `--session <own-uuid>` when the session's own UUID is derivable from the environment; otherwise `--latest` (with a sanity check that the printed self-evidence — the chosen session/file — IS the running session before trusting the row). Transcripts root is the mandatory first CLI argument (GL-03, C-4) — invoke via the env-based standard path, never a machine-specific absolute path: `"$HOME/.claude/projects"` (POSIX) resp. `"%USERPROFILE%\.claude\projects"` (Windows), e.g. `node plugins/pipeline-core/scripts/usage-ledger.mjs "$HOME/.claude/projects" --latest --row "<block label>"`.
   2. **Append the row** to the project's `telemetry/costs.md` (create the file with the header below if absent) — token half = **collected (script)**, $-half = **estimated** (marked with the `asOf` date of `plugins/pipeline-core/scripts/model-prices.json`); the advisor-model $ estimate is additionally called out on its own in "Notes" (the real-money share when a paid external model is configured). As before, **one row per session/block AND one row per goldfish dispatch** of this block.
   3. **`/usage` paste stays OPTIONAL**, asked once as before (EL-17c) — now framed as "Limits/reconciliation" (limit standings %, credit %), no longer the data source for the token column. Decline/absence is fine; the row still exists — this replaces "not collected" as the default outcome. "not collected" remains reserved for actual script failure (5. below).
   4. **Standing addendum rule:** a PO `/usage` paste arriving at ANY later time (any session of this repo) is worked into the NAMED session's existing row as a dated addendum — real numbers OVERRIDE the estimate, the estimate stays visible in parentheses (calibration data for the estimator, MP-21); accompanying PO comments land in "Notes".
   5. **Fail-open:** script failure (missing/unreadable transcripts root, malformed price file, etc.) → record "not collected (script error: <short>)" in the token column and continue the ritual — telemetry must never block a close.

   | Date | Session/Block | Role | Model/Effort | Task (short) | Tokens per `/usage` | First-Pass (y/n) | Interventions needed (y/n) | Notes |
   |---|---|---|---|---|---|---|---|---|

   Conventions (MP-20): Role ∈ {Elephant, Goldfish, Critic, Workflow}; First-Pass/Interventions are maintained per goldfish dispatch, Elephant/Critic rows carry "—"; "Notes" = escalations (MP-05/MP-07), advisor-model fallback / advisor-model $ share, cache anomalies, calibration runs, workflow agent count, addendum entries (see 4. above); headless/`--bare` runs add `total_cost_usd` (marked as $) in the token column. `/context` reading may be noted here too. **Long sessions:** append the telemetry row per completed dispatch wave DURING the session, not only at the close — close-anchored-only persistence loses `/usage` data irrecoverably on a crash.
9. **Run `close.post` extensions** (contract above).
10. **Final commit:** conventional, small, atomic; include handover + HISTORY + telemetry + extension outputs. Agent-authored commits carry `AI-Assisted: true`; provider/model co-author metadata, session URLs/IDs, and account correlation are prohibited, as are secrets and machine-specific absolute paths. **Push per the project's push policy** (committed calibration/CLAUDE.md). Never force-push; the git-guard union additionally blocks destructive git.

### Strict feature-branch delivery extension

When the project calibration declares `publicPushIdentity.mode: required`, a successful close additionally requires this exact order: final commit → regenerate Full Verify and required privacy/security evidence for that commit → read back the calibrated SSH account with `ssh -T <sshHostAlias>` → push that exact OID to the approved explicit feature branch → fetch it into a fresh/disposable repository → compare fetched and source OIDs. The complete newly reachable range must pass the calibrated neutral Author/Committer, no-signature and no-private-metadata checks. A missing credential, account mismatch, push failure or fetch-back mismatch leaves the close **unfinished/blocked**; it is never a success claim. This extension does not authorize main, merge, tag, release, force-push or deletion.
11. **Session cut recommendation:** check `/context`; at ~70–80 % fill or a natural boundary recommend the planned session cut — the next session bootstraps from the handover via `/pipeline-core:pipeline-start` (`docs/operating-model.md`, *The lifecycle* — steps 1 and 8; a session that drifts into auto-compaction is a process error).

## Close-light variant (hard eligibility gate — small-session shortcut)

A compressed ritual for genuinely small blocks (companion to `harness/checklists/small-session.md`).
This is a **checklist gate, never a judgment call**: ALL four boxes must hold, checked explicitly
before choosing this path over the full ritual above.

- [ ] **≤ 1 package/dispatch delivered** this block (the close act itself does not count).
- [ ] **No guardrail/canon diff:** no changes to `docs/operating-model.md`, `roles/*`, `policies/*`,
      any hook (`plugins/pipeline-core/hooks/*`), `.claude/settings.json`, the project's
      calibration at its resolved authority tier (`project/pipeline.json`/`pipeline.yaml`,
      else `.claude/pipeline.json`/`pipeline.yaml`), or any ADR.
- [ ] **Session wall-clock < ~1h** (bootstrap to this close).
- [ ] **No Critic finding ≥ major open/undisposed.**

**Even ONE unchecked box → run the FULL ritual (steps 0–11 above).** Never partially apply close-light
to a session that fails the gate — the gate is binary, not "mostly small."

**Close-light ritual (only when ALL four hold):**

1. **Verify:** run the calibration's `verify` command against the final state — the SAME evidence bar
   as full-ritual step 3 (machine-written output + exact command + exit code). This gate never
   compresses (the invariant is untouched by any profile).
2. **Authorship check:** the same mandatory question as full-ritual step 6b — "Whose are this session's
   production diffs?" — a single-package close still gets this; the incident class it
   guards against (Elephant-authored diff outside stage-0) is exactly as costly at 1 package as at 10.
3. **Telemetry line:** append the one row for this block to `telemetry/costs.md` via the usual ledger
   mechanism (full-ritual step 8, mechanics unchanged).
4. **Push:** per the project's push policy (unchanged).
5. **One-paragraph handover update:** a SINGLE paragraph appended to the handover file — current
   state, the one thing that changed, next step. Not a full step-5 rewrite, no separate HISTORY entry
   (folded into this paragraph). If something genuinely new was learned, one sentence naming it is
   still owed here (the silence-is-not-an-option rule applies even in light form) — just folded into this
   paragraph instead of a separate backlog item.
6. **Session-owned residue:** apply the same descriptor-bound cleanup and hygiene gate as the full ritual; close-light never weakens deletion or clean-repository assurance.

**What close-light deliberately SKIPS vs. the full ritual:** the full drift-check bundle (step 4:
formal CLAUDE.md length gate re-measure, memory-mirror pass, stale-worktree enumeration — spot-check
only if something looks obviously wrong, no formal report); the separate HISTORY append (folded into
the handover paragraph); a full self-retro backlog item (rigor-0 bundling per `docs/operating-model.md`, *Rigor, risk and gates*, already allows
this — close-light makes it the default, not the exception); the session-cut/`/context` recommendation
(a <1h session is not near a cut boundary by construction). The error-register update (step 7b) is
**still done IF a new/recurring class was actually observed** — close-light compresses ceremony, never
observation; if nothing register-worthy happened, it is skipped silently like any other block with
nothing to report. The handover-rotation step (6c) keeps its **register-discipline half in full**
(index row + archive-append for any new register entry, where the project's handover uses one — costs
nothing extra and is exactly what keeps the next session's bootstrap slim); only the
**session/block-rotation half is skipped by default** (a <1h close-light session's one-paragraph append
rarely crosses the ~25k-token threshold by itself) — do the cheap size check anyway and rotate if the
head is already over target.

**Anything outside the gate = full ritual. No partial/hybrid close.**

## Completion report to the PO (end of ritual)

Short, in order: calibration used (file + project) · extensions run (pre/post, outcomes) · verify result + evidence path + exit code · drift-check results (handover, CLAUDE.md gate, memory, worktrees) · handover + HISTORY updated (paths) · telemetry rows appended (count) · self-retro filed (item/path, or explicit "nothing") · commit hash · `/context` reading + cut recommendation. If ANY step was skipped, name it and why — a silently incomplete close is worse than an honestly partial one. **Close-light closes** report the same shape, condensed: which gate box made it eligible, verify result, authorship-check outcome, telemetry row, push, and the one-paragraph handover update — name explicitly that steps 4 (formal)/6/11 were skipped by the light-profile contract, not silently omitted.
