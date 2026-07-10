---
name: close-block
description: "Session/block close ritual, parametrized by the project's .claude/pipeline.json (operating-model SS8): run close.pre extensions, verify + machine evidence, drift checks (handover freshness, CLAUDE.md length gate, memory mirror, stale worktrees), handover + HISTORY sync (single source), telemetry line (MP-20), mandatory self-retro, close.post extensions, final commit. Invoke at a block/task boundary or before a planned session cut."
disable-model-invocation: true
argument-hint: "[block-id or short session label]"
allowed-tools: Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(git diff:*)
---

# close-block — session close ritual (parametrized)

Normative sources (agent-pipeline repo — canon pointers, not runtime reads): `docs/operating-model.md` §5–§8, `harness/checklists/session-close.md`, `policies/model-policy.md` MP-16/MP-19/MP-20, ADR-0012 (handover), single source of truth. `disable-model-invocation: true` is deliberate: closing writes a commit — the PO times it, the model never self-triggers it. This skill runs IN the main context (no fork): it needs the session's own state (`/usage`, `/context`, what actually happened this block).

Block label: `$ARGUMENTS` (optional; used in the telemetry line and HISTORY entry).

## Step 0 — Read the project calibration (parametrization)

Read `.claude/pipeline.json` of the current project. Keys starting with `$` are documentation — ignore them. Fields this ritual consumes:

| Field | Used for | Default when absent |
|---|---|---|
| `project` | telemetry + report naming | — (required) |
| `verify` | step 3 gate run (the ONE verify command) | — (required) |
| `claudeMdMaxLines` | step 4 length gate | warn "uncalibrated length gate" (no silent number) |
| `handover` | step 5 target file | `docs/state.md` (convention, operating-model §6) |
| `wipLimit` | step 4 stale-worktree/WIP check | 1 (base rule) |
| `ritualExtensions` | steps 1 and 9 extension points | none |

**File missing or required fields missing → fail-safe, no silent guessing (operating-model §8):** announce explicitly that the project is **"uncalibrated"**, STOP for all writing steps of this ritual, offer to draft the calibration from the field table above (canonical filled example: `templates/pipeline.json.example` in the agent-pipeline repo; an installed plugin cannot read repo templates, so generate the draft from the field list) and name the new file to the PO for confirmation. Read-only reporting of the session state stays allowed.

## Extension-point contract (extend WITHOUT forking)

This skill defines two **named extension points**; the project hangs its own steps there via `ritualExtensions` in `.claude/pipeline.json`:

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
   - Every blocker/major Critic finding of the block is dispositioned (fix / rejected with reason / escalated to the PO); mandatory-trigger tasks have a findings report before merge (operating-model §4.2).
3. **Run the verify gate:** execute the calibration's `verify` command. The evidence is the **machine-written output** (file/log written by the script) + exact command + exit code — never model prose. Red verify → the block cannot close as "done": record the failure state honestly, mark affected tasks `blocked`/`🟡`, and say so in the handover. Closing with a red gate is allowed ONLY as an explicitly marked unfinished state — no merge on red.
4. **Drift checks ("Docs are a snapshot, code is truth"):**
   - **Handover freshness / merge-completion gate:** after any merge of this block, the handover file must already carry the new state — if the repo state is newer than the handover, fix that NOW (that exact post-merge step is where the documented drift was born).
   - **CLAUDE.md length gate:** project CLAUDE.md line count ≤ `claudeMdMaxLines`. Over the limit → consolidate, move procedures to skills/hooks, or delete — growing means consolidating (operating-model §7).
   - **Memory mirror:** memory (user/project scope) contradicting the repo is corrected in favor of the repo — memory is mirror only.
   - **Stale worktrees / WIP:** `git worktree list`; clean or explicitly list leftovers; respect `wipLimit` (max open human-gate processes per project).
5. **Handover update (single source):** update the handover file (calibration `handover`, default `docs/state.md`): current state, decisions, open items (including all 🟡/blocked from step 2 — nothing silently dropped), next block, re-entry protocol. This file is the ONLY carrier of "open/next". Register-append discipline: append new register rows at the TABLE END (edit anchor = the last existing row, never a mid-table line), then re-check row order (two mis-ordered appends in one session motivated this rule).
6. **HISTORY entry (append-only past):** append the block entry with the mandatory lessons block. Its "open/next" part is **generated from or references the handover — never hand-duplicated** (two hand-maintained copies drift by construction).

6b. **Authorship check (EL-01/EL-16)** — mandatory, BEFORE step 7's self-retro (an incident reclassifies the retro, not vice versa; this sub-step does not renumber the surrounding steps):
   - Enumerate the session's production diffs: `git log` over the session range (lower bound = the repo HEAD recorded by this session's bootstrap, named in the handover session block; fallback: all commits of the current calendar day) + diff stat.
   - Answer the mandatory question (verbatim): "Whose are this session's production diffs?" — every diff MUST map to a Goldfish/Critic dispatch (`dispatch-record.json` + `Dispatch: <TASK_ID> (goldfish)` trailer line) or to the OM §3.3 stage-0 fast path. Cross-reference source: the session block's dispatch enumeration and the telemetry line.
   - Any Elephant-authored production diff outside stage-0 ⇒ **INCIDENT**, never a retro "discussion point": flag explicitly to the PO in the close output, write an incident note into the handover file and the telemetry line.

6c. **Handover rotation (head-size discipline — keeps the handover file slim, not just once but ON EVERY CLOSE)** — mandatory check, same non-renumbering contract as 6b:
   - **Register discipline (every close, no threshold, no exception, where the project's handover maintains a decision register/log):** a new register entry's 1-line title stays in the handover file's decision-register/index (step 5's "append at table end" rule, applied to the index row, if the project uses one); the entry's full prose paragraph is appended in the SAME close to the project's own archive (an append-only `docs/state-archive/`-style location) — never written into the head as full prose, not even transiently. This is what keeps the head from re-accumulating register bulk between rotations; where a project's handover uses a register at all, this is how new entries are written from now on.
   - **Session-block rotation (threshold-triggered, where the handover accumulates per-session/per-block prose in its head):** after step 5 updates this close's state in the head, check the handover file's size. Target: the operative head (re-entry pointer, environment, open items, next steps, plus any recently-kept session/block entries) stays **≤ ~25k tokens — readable in one pass** (the measurable goal this step protects). Over target, OR more than the last **2 full session/block entries** are sitting in the head → move the OLDEST entries verbatim (byte-for-byte, no paraphrasing) into the project's own archive file(s) (append-only; start a new dated file rather than growing one file without bound, e.g. per month) — keep only the operative sections plus the last 1–2 entries in the head.
   - No archive convention yet on this project (first rotation) → create one (purpose, append-only contract, file list) BEFORE moving content; report the new archive location in the close report (bundled at the gate, not a separate mid-task confirmation — approval-fatigue, §4.2).
   - Name the rotation explicitly in the close report (what moved, to which path) if anything moved this close — a silent rotation is a lost trail exactly like any other silently-skipped step in this ritual.

7. **Learn + measure:**
   - **Self-retro:** the **session elephant writes the close retro itself** — concrete improvement item(s), or an explicit "nothing" — filed as a `workflow-improvement` backlog item (agent-pipeline repo's `backlog/items/`, or a transfer note in the handover per the mechanic below if that repo is absent on this machine), addressed to the pipeline elephant (continuous-improvement process). MANDATORY part of EVERY close, never silently skipped — silence is not an option (operating-model §7). The PO submits his own observations separately, on his own channel; there is no ritual prompt to the PO anymore.
   - **Tooling radar due? (tooling-policy R2 anchor):** compare the date of the newest `tooling-radar` backlog item in the agent-pipeline repo's `backlog/items/` with the current calendar month. If the newest radar item is older than the current calendar month (or none exists), the monthly radar run is OVERDUE: say so LOUDLY in the ritual output and recommend a radar dispatch (per `policies/tooling-policy.md` §4 R2–R4) — never pass over it silently. This check is the deterministic anchor of the R2 catch-up rule.
   - File `workflow-improvement` items in the agent-pipeline repo's `backlog/`; if that repo is not present on this machine, record the item verbatim in the handover for transfer.
   - Growth rule: any agent failure of this block traced to a missing/vague rule → add/sharpen the rule in the right artifact (CLAUDE.md fact, hook, skill) — and keep the length gate green.
   - Three-artifacts archive for rigor ≥ 1: (1) problem/spec, (2) acceptance criteria, (3) result report — versioned; full chat logs are NEVER archived (the `Claude-Session:` commit trailer is the bridge).
   - Rigor-0 lessons may be bundled into one collective entry (operating-model §3.3).
7b. **Error-register update (mandatory, after Learn + measure, before Telemetry)** — this sub-step does not renumber the surrounding steps (same contract as 6b): read `backlog/error-register.md` (project's error-register, if the project has adopted one — the agent-pipeline repo's own copy is the canonical reference for the mechanics below). For every distinct error/friction class surfaced this block (Goldfish stop conditions, Critic findings ≥ minor, harness/tooling friction, Elephant process misses):
   - **New class** → append one row (error class · category · first seen = today · last seen = today · status = `new`). Merge into an existing similar row instead of adding a near-duplicate (semantic consolidation, capped board, ~30 rows) — never a growing single-incident list.
   - **Recurring class** (same root cause, already listed) → update `last seen` to today; flip status to `RECURRING → triage required` if this is genuinely the second occurrence of the SAME root cause (a class already `dispositioned` by a working mechanism does not flip back to `RECURRING` merely because a superficially similar symptom occurred once more with a different root cause — note the reasoning in the row if this judgment call comes up).
   - **Every `RECURRING` row gets a disposition or an explicit, reasoned deferral note THIS SAME close** — hierarchy mechanism (hook/guard/script) > template (briefing/checklist line) > curated lesson (retro entry/prose rule), never left bare.
   - **NEVER count/rank:** no frequency column, no numeric priority — the register is prose-curated triage only (community anti-pattern: rule blindness via counted error-list injection). A register with a count/ranking column is itself a defect to flag.
   - **NEVER inject this register into a Goldfish/Critic briefing** — it is triage-only by contract (see the register's own header). A briefing, Goldfish, or Critic that cites the register as context is itself a register-worthy incident.
   - Register genuinely absent in this project → skip this sub-step silently (nothing to update); do not create one as a side effect of a close.

8. **Telemetry line (MP-20), auto-captured via `usage-ledger.mjs`:** `/usage` is a **user command and session-scoped** — numbers are NOT retrievable after the session ends, which is why the token half of this step now runs through `harness/scripts/usage-ledger.mjs` instead of a manual paste. New order of operations:

   1. **Run the ledger for the CURRENT session** with `--row <block label>`: prefer `--session <own-uuid>` when the session's own UUID is derivable from the environment; otherwise `--latest` (with a sanity check that the printed self-evidence — the chosen session/file — IS the running session before trusting the row). Transcripts root is the mandatory first CLI argument (GL-03, C-4) — invoke via the env-based standard path, never a machine-specific absolute path: `"$HOME/.claude/projects"` (POSIX) resp. `"%USERPROFILE%\.claude\projects"` (Windows), e.g. `node harness/scripts/usage-ledger.mjs "$HOME/.claude/projects" --latest --row "<block label>"`.
   2. **Append the row** to the project's `telemetry/costs.md` (create the file with the header below if absent) — token half = **collected (script)**, $-half = **estimated** (marked with the `asOf` date of `harness/scripts/model-prices.json`); the advisor-model $ estimate is additionally called out on its own in "Notes" (the real-money share when a paid external model is configured). As before, **one row per session/block AND one row per goldfish dispatch** of this block.
   3. **`/usage` paste stays OPTIONAL**, asked once as before (EL-17c) — now framed as "Limits/reconciliation" (limit standings %, credit %), no longer the data source for the token column. Decline/absence is fine; the row still exists — this replaces "not collected" as the default outcome. "not collected" remains reserved for actual script failure (5. below).
   4. **Standing addendum rule:** a PO `/usage` paste arriving at ANY later time (any session of this repo) is worked into the NAMED session's existing row as a dated addendum — real numbers OVERRIDE the estimate, the estimate stays visible in parentheses (calibration data for the estimator, MP-21); accompanying PO comments land in "Notes".
   5. **Fail-open:** script failure (missing/unreadable transcripts root, malformed price file, etc.) → record "not collected (script error: <short>)" in the token column and continue the ritual — telemetry must never block a close.

   | Date | Session/Block | Role | Model/Effort | Task (short) | Tokens per `/usage` | First-Pass (y/n) | Interventions needed (y/n) | Notes |
   |---|---|---|---|---|---|---|---|---|

   Conventions (MP-20): Role ∈ {Elephant, Goldfish, Critic, Workflow}; First-Pass/Interventions are maintained per goldfish dispatch, Elephant/Critic rows carry "—"; "Notes" = escalations (MP-05/MP-07), advisor-model fallback / advisor-model $ share, cache anomalies, calibration runs, workflow agent count, addendum entries (see 4. above); headless/`--bare` runs add `total_cost_usd` (marked as $) in the token column. `/context` reading may be noted here too. **Long sessions:** append the telemetry row per completed dispatch wave DURING the session, not only at the close — close-anchored-only persistence loses `/usage` data irrecoverably on a crash.
9. **Run `close.post` extensions** (contract above).
10. **Final commit:** conventional, small, atomic; include handover + HISTORY + telemetry + extension outputs. `Claude-Session:` trailer; no secrets, no machine-specific absolute paths. **Push per the project's push policy** (committed calibration/CLAUDE.md; the agent-pipeline repo itself standing-approves pushing `main` at work-package boundaries — project repos keep their own rules until their calibration says otherwise). Never force-push; the git-guard union additionally blocks destructive git.
11. **Session cut recommendation:** check `/context`; at ~70–80 % fill or a natural boundary recommend the planned session cut — the next session bootstraps from the handover via `/pipeline-core:pipeline-start` (operating-model §5.2; a session that drifts into auto-compaction is a process error).

## Close-light variant (hard eligibility gate — small-session shortcut)

A compressed ritual for genuinely small blocks (companion to `harness/checklists/small-session.md`).
This is a **checklist gate, never a judgment call**: ALL four boxes must hold, checked explicitly
before choosing this path over the full ritual above.

- [ ] **≤ 1 package/dispatch delivered** this block (the close act itself does not count).
- [ ] **No guardrail/canon diff:** no changes to `docs/operating-model.md`, `roles/*`, `policies/*`,
      any hook (`plugins/pipeline-core/hooks/*`), `.claude/settings.json`, the project's
      `.claude/pipeline.json`/`pipeline.yaml`, or any ADR.
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

**What close-light deliberately SKIPS vs. the full ritual:** the full drift-check bundle (step 4:
formal CLAUDE.md length gate re-measure, memory-mirror pass, stale-worktree enumeration — spot-check
only if something looks obviously wrong, no formal report); the separate HISTORY append (folded into
the handover paragraph); a full self-retro backlog item (rigor-0 bundling per OM §3.3 already allows
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
