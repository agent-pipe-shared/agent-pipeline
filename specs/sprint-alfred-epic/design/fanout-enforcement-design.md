# FANOUT: making sustained, sliced parallel dispatch the enforced default of every Elephant

> Design, implementation-ready. Dispatch `FANOUT`, ruleset `0.7.0+claude.20261005173906.866be213`, candidate `efed495b4`.
> Status: design only. Independent review: pending. Nothing here is built, wired or accepted.
> Language note (ADR-0011): the PO's requirement is paraphrased in English; the verbatim German wording is in the dispatch briefing.

## 0. Requirement and verdict

**PO requirement (2026-10-05, paraphrased):** every Elephant should, as its permanent default, work in many small slices and
many parallel dispatches, and keep free slots filled without the PO reminding it. The PO says there is no good approach
today that actually forces this. The Elephant's main job is cutting slices that can run in parallel without overlapping.

**Verdict in four sentences.**
1. The failure is an *omission* (the Elephant makes no tool call and ends its turn), and a `PreToolUse` hook cannot see an
   omission. The only event that fires at that moment is the runner's turn-end event (`Stop`).
2. A runner-neutral **fan-out governor** reads a tracked **slice queue** (declared slices, disjoint write scopes,
   dependencies, tier) plus a **slot ledger** (live dispatches, derived), and at turn end it blocks idling while
   `ready slices > 0` and `live < target`, naming the next ready slices. Every escape is a durable, auditable declaration,
   never silence.
3. Safety (disjoint scopes, monolith rule, one committer, protected-package bundling) is checked **before** parallelism is
   pushed: at queue validation time and at dispatch time (overlap check in the existing `guard-dispatch`).
4. Rollout is staged shadow -> advisory -> enforce, because this repository has zero recorded evidence that a
   non-blocking message changes an Elephant's default (`docs/adr/0080-parallel-dispatch-slicing-enforcement.md:495-505`).

## 1. Root cause: why instruction-level rules fail here

### 1.1 What the model sees when it decides to stop or wait

- **The cheapest local action is to end the turn.** Delegation costs template filling, a record, guard checks and a
  bootstrap-receipt detour of 2-3 tool calls (`specs/sprint-alfred-epic/evidence/elephant-load-findings-2026-10-05.md:25-38`).
  Ending the turn costs nothing and nothing refuses it.
- **The written rules contradict each other, so any number can be justified.** `roles/elephant.md:157-160` (EL-11) says
  "max 3-5 concurrent goldfish"; `specs/sprint-alfred-epic/plans/0.7-execution-order.md:91-94` says "max 2 concurrent
  dispatches, one committing"; the same plan later records "raised to 4-5" (`:126-130`); EL-22 (`roles/elephant.md:182-190`)
  says all independent work runs in the same turn. A self-made "max 2" is therefore *textually defensible*. Enforcement has
  to own the number; prose cannot.
- **Parallelism is conditional, so the model reads it as optional.** EL-22 requires a named dependency for sequential work
  (`roles/elephant.md:184`), but nothing records the dependency structure anywhere a machine can read it. The briefing
  template has no declared write scope: no hit for write-scope fields in `plugins/pipeline-core/lib/dispatch-policy.mjs`,
  `templates/prompts/goldfish-task.md` or `docs/operating-model.md` (searched for `writeScope|write scope|write-scope`);
  `declaredPaths()` reads only the *post-hoc* `report.changedFiles` (`plugins/pipeline-core/lib/dispatch-record.mjs:93-98`).
  ADR-0080 already named this limit for PSP-1/PSP-2 (`docs/adr/0080-...md:140-165`).
- **After a completion notification the Elephant sees one finished slice and a context full of other things.** There is no
  structured "ready queue" in front of it. Re-deriving the next slices means a repo read in the most expensive context
  (`elephant-load-findings-2026-10-05.md:25-28`), so it replies with a status line instead.

### 1.2 Why the existing mechanisms do not reach the failure

| Existing mechanism | What it can see | Why it misses the omission |
|---|---|---|
| ADR-0080 nudge, `plugins/pipeline-core/hooks/guard-slicing.mjs` (wired at `plugins/pipeline-core/hooks/hooks.json:132-139`) | A `Task`/`Agent`/`Workflow`/`TodoWrite` *call* | Fires only when the Elephant already dispatches; "NEVER BLOCKING" (`guard-slicing.mjs:27-32`); fires after 3 consecutive single dispatches (`:39-68`); ADR-0080 itself records zero evidence a non-blocking message changes behaviour (`docs/adr/0080-...md:495-505`). |
| `stop-suggest.mjs` (`hooks.json:179-189`) | Turn end | By contract it "NEVER blocks: no code path here can ever produce a `decision` field" (`plugins/pipeline-core/hooks/stop-suggest.mjs:58-62`), and it only knows manifest phases, not slices. |
| `guard-dispatch-budget.mjs` (`hooks.json:27-37`) | Each *subagent* tool call | Counts a subagent's calls; the orchestrator is exempt by design (`hooks.json:28`). It never limits or feeds the Elephant. |
| `guard-dispatch.mjs` (`hooks.json:6-15`) | A dispatch being written | Checks template conformance of a dispatch that exists; has "no opinion on whether one is written at all" (`docs/adr/0080-...md:44-50`). |
| Role/memory prose (`roles/elephant.md:182-190`, PO memory) | Nothing at decision time | Context decay; observed to fail repeatedly. |

### 1.3 The one event that fires on an omission

At the moment the Elephant decides to "wait for the notification", it ends its turn. Every runner has a turn-end event.
Repository evidence of the runner events (found by searching `hooks/hooks.json`, `hooks/codex-hooks.json`,
`plugins/pipeline-core/hooks.json`):

| Runner | Turn end | Subagent lifecycle | Delivery channel into the model | Repository evidence |
|---|---|---|---|---|
| Claude Code | `Stop` (only `stop-suggest` wired, `hooks/hooks.json:179-189`) | `SubagentStart`/`SubagentStop` **not wired**; `PostToolUse` on `Task\|Agent` is wired for the native host-commit route (`hooks.json:143-154`) | Stop block feedback (measured: stop-hook re-invocations are 21.8 % of Elephant load, `elephant-load-findings-2026-10-05.md:10`); `additionalContext` (ADR-0080 Decision 1) | Stop-block semantics are proven by the `/goal` stop hook in the load measurement; `stop_hook_active` and notification-wake behaviour are **not used anywhere in the repository** and need the probe in slice S0. |
| Codex | **No `Stop` entry** in `plugins/pipeline-core/hooks/codex-hooks.json` (events present: `SessionStart:4`, `PreToolUse:18`, `SubagentStart:68`, `SubagentStop:94`) | `SubagentStart`/`SubagentStop` wired (`codex-hooks.json:68-119`), observed by `codex-slicing-hint.mjs` | PreToolUse hint on `spawn_agent\|update_plan` (`codex-hooks.json:20-30`) | Whether Codex has a blockable turn-end event is unverified; probe S0. |
| Antigravity | `Stop` wired (`plugins/pipeline-core/hooks.json:21-27`, `hooks/antigravity-stop-hook.mjs`) | none wired | `PreInvocation` injects `injectSteps[].ephemeralMessage` on every model invocation (`hooks.json:28-33`, `hooks/antigravity-slicing-hint.mjs:18`) | `antigravity-stop-hook.mjs:4` claims to "translate ... into Antigravity Stop decisions" but only writes stderr (`:47-59`); whether AGY Stop can block is unverified; probe S0. |

`SubagentStop` is **not** the lever for the Elephant: on the runners that have it, it concerns the finishing *subagent*, and
a block there keeps the *subagent* running. It is useful only as a free finish signal for the ledger (Codex already has it).
The design therefore needs **no new Claude subagent-lifecycle wiring**: launch is seen in `guard-dispatch` (already on
`Task|Agent|Workflow`), finish is derived from dispatch records and budget counters (section 3.2).

## 2. Prior art that this design must not contradict

- **ADR-0080 Decision 5 rejects "a hard block on proceeding without slicing"** on three grounds
  (`docs/adr/0080-...md:418-435`): (i) the guard cannot prove a batch was slice-able; (ii) under EL-16 a dispatch block is a
  block on all execution work; (iii) pushing toward parallel without the predicate reproduces the 2026-08-07 collisions.
  The governor is a *different* decision and answers each ground:
  - (i) It does not judge slice-ability. It acts only on a queue the **Elephant itself declared** with write scopes and
    dependencies, validated mechanically (section 3.5). "Ready" means the Elephant's own declaration plus mechanical checks.
  - (ii) It never blocks a dispatch or any tool. It blocks only *ending the turn* while declared work is startable. Sequential
    work is expressed by declaring a dependency, and costs one CLI line (section 3.3 step 7).
  - (iii) Disjointness is checked at queue validation and again at dispatch time (section 3.4), which is the one direction
    ADR-0080 Decision 3 calls legitimate for a hard block ("refusing a parallel round whose slices collide",
    `docs/adr/0080-...md:229-243`).
  This needs an ADR amendment (slice S10), because Decision 5 is an accepted decision.
- **ADR-0080 PSP-0..PSP-3** (`:130-200`) are adopted as the slicing predicate; the queue makes PSP-1/PSP-2 machine-decidable
  because it adds the affirmative write scope that briefings lack today.
- **Native lifecycle state already exists** for Codex/AGY: `plugins/pipeline-core/hooks/native-slicing.mjs:53-69` keeps
  `activeChildren` and `serialRun` under `<git-common-dir>/agent-pipeline/native-slicing/`, deliberately storing "hashes,
  counters, and lifecycle overlap only" (`:6-7`, `MAX_CHILDREN = 32` at `:23`). The ledger reuses that private root and
  that privacy rule but needs slice ids and scopes, so it is a new file family, not an extension of that state.
- **Template/briefing generation** is already a named fix direction (`elephant-load-findings-2026-10-05.md:31-32`).

## 3. Mechanism design

### 3.1 (a) Slice queue: CHOSEN, tracked, one file per feature

`specs/<feature>/slice-queue.json`, schema `pipeline.slice-queue.v1`, written and edited only through
`plugins/pipeline-core/scripts/slice-queue.mjs` (so it is always schema-valid) and committed like any design artifact
(`specs/` is a draft-phase-writable prefix, `templates/prompts/agent-obligations.md:106-115`). Nothing durable lives only in a
private directory. Resolution by convention, read-only: the directory of `.claude/pipeline-state.json` `activeFeature.planPath`
(the field `stop-suggest.mjs` already reads) plus `/slice-queue.json`; absent file means the governor is silent (fail-open).
Open point for the PO: whether the Alfred epic's `activeFeature.planPath` points into `specs/sprint-alfred-epic/` (not checked).

```jsonc
{
  "schema": "pipeline.slice-queue.v1",
  "feature": "sprint-alfred-epic",
  "defaults": { "commitMode": "diff-only", "tier": "implementor" },
  "limits": { "deadline": "2026-10-06T04:45:00Z", "maxAttemptsPerSlice": 2 },   // deadline optional
  "monoliths": ["plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs"],        // at most one slice per monolith at a time
  "slices": [{
    "id": "S2-10",                       // == dispatch taskId == evidence/dispatch-record-<id>.json (SAFE_TASK_ID)
    "title": "one line",
    "state": "ready",                    // declared: ready | hold-po | blocked-external | deferred | cancelled   (done/live are DERIVED)
    "holdReason": null,                  // required for every non-ready declared state
    "dependsOn": ["S2-00"],
    "writeScope": ["plugins/pipeline-core/lib/guard/foo.mjs", "plugins/pipeline-core/lib/guard/foo.test.mjs"],
    "readScope": ["docs/adr/0080-parallel-dispatch-slicing-enforcement.md"],
    "tier": "implementor",               // mechanic | implementor | deep | critic  (MP-07 route is the Elephant's, validated below)
    "tierReason": null,                  // required for deep/critic
    "commitMode": "host-commit",         // host-commit | worktree | diff-only | self-commit   (see 3.7)
    "loadClass": "light",                // light | test-heavy   (host-stability caps, see 3.6)
    "briefing": { "ref": "specs/sprint-alfred-epic/briefings/S2-10.md" },
    "estimatedToolCalls": 30
  }]
}
```

Derived (never hand-edited) per-slice status: `done` when `evidence/dispatch-record-<id>.json` has a terminal outcome
(`isTerminalOutcome`, `dispatch-record.mjs:63`; non-terminal set at `:12`) and its classification is not an interim
hand-back; `live` when launched and not finished (3.2); `attempts` counts terminal-without-delivery records (a budget
checkpoint hand-back returns the slice to `ready` with `attempts+1`; at `maxAttemptsPerSlice` it becomes `hold` and leaves
the ready set, which matches the two-failed-attempts stop rule).

### 3.2 (b) Slot ledger: CHOSEN, but derived, not trusted

Private, append-only, one JSONL file per session at `<git-common-dir>/agent-pipeline/fanout/<runner>-<session-hash>.jsonl`
(same private root and hash-only privacy rule as `native-slicing.mjs:53-55`, `:6-7`; no prompt text, no paths of the
transcript). **Append-only with small `O_APPEND` writes, no lock-and-rewrite**, because the budget counter's lock already
races on parallel tool calls (`DISPATCH-BUDGET-INPUT-INVALID (counter-lock-busy)`, `elephant-load-findings-2026-10-05.md:40-43`).

Events: `launch {sliceId, agentType, model, writeScopeHash, commitMode, at}`, `finish {sliceId, how, at}`,
`stop-eval {live, target, ready, decision, reason, mode, at}`, `block`, `declined`, `pause`.

`live(slice)` is the **union of three sources**, never one:
1. a `launch` event (written by the `guard-dispatch` extension, 3.4) with no matching `finish`;
2. a dispatch record for the slice whose `outcome` is in `NON_TERMINAL_OUTCOMES` (`dispatch-record.mjs:12`);
3. a recent heartbeat: the mtime of the dispatch's budget counter
   `<git-common-dir>/agent-pipeline/dispatch-budget/<agentId>.json` (`guard-dispatch-budget.mjs:516-518`), which every
   subagent tool call touches.
It ends on: terminal record; `finish` event (Codex `SubagentStop` writes one for free, `codex-hooks.json:94-119`); or the
runner's completion notification being processed (the Elephant's `slice-queue.mjs finish <id>` line, or the record).
**A silent heartbeat never frees a slot by itself.** Per the PO rule that old dispatches are treated as alive until notified
or stopped (`0.7-execution-order.md:97-98`), a slice silent for more than `staleAfterMinutes` (default 20) stays *live* but is
reported in the block reason as "silent, check diff activity". Only an explicit `slice-queue.mjs reap <id> --reason` frees it.

### 3.3 (c) Stop governor: CHOSEN, bounded, with durable escapes

Runner-neutral core `plugins/pipeline-core/lib/fanout-governor.mjs`:
`evaluateFanoutStop({ input, queue, ledger, config, now }) -> { decision: "allow"|"block", reasonCode, reason?, telemetry }`
(pure; all I/O injected). Runner adapters translate: Claude `hooks/stop-fanout.mjs` (stdout
`{"decision":"block","reason":...}`, exit 0), Antigravity inside `hooks/antigravity-stop-hook.mjs` (already spawns
`stop-suggest` the same way, `:47-59`), Codex: observation only until probe S0 confirms a blockable turn end.

**Evaluation order. The first matching rule returns `allow` (silent, no output) unless stated:**

| # | Rule | Reason code | Why it is an escape |
|---|---|---|---|
| 1 | Hook input unparseable / any exception / state dir unwritable | `FANOUT-FAILOPEN` | Fail-open like every sibling hook (`stop-suggest.mjs:11-17`, `guard-slicing.mjs:34-37`). |
| 2 | Not the orchestrator (payload carries `agent_id`, `guard-dispatch-budget.mjs:1003-1028` discriminator) | `FANOUT-NOT-ORCHESTRATOR` | Goldfish never fan out (`workflow-dispatch.md:9`). |
| 3 | `observeGovernanceScope(...).requiresEnforcement` false, or `fanout.mode = off` | `FANOUT-OFF` | Consumer repos opt in; same admission rule every hook uses. |
| 4 | Queue absent, schema-invalid, or stale beyond `staleQueueHours` | `FANOUT-NO-QUEUE` | Cannot enforce what is not declared. One advisory line only (never a block). |
| 5 | **Explicit PO pause** present and unexpired | `FANOUT-PAUSED` | `slice-queue.mjs pause --by po\|elephant --reason --until`. Hard max 4 h per pause; recorded with `by`, so an Elephant self-pause is visible in the retro (attributable, not provable; the PO's untouchable switch is `fanout.mode: off` in `pipeline.user.yaml`). |
| 6 | `limits.deadline` passed or session budget cut-off reached | `FANOUT-CUTOFF` | The overnight "stamp at 06:45" case (`0.7-execution-order.md:148-149`). |
| 7 | `ready == 0` | `FANOUT-NO-READY` | Queue empty, or every remaining slice is dependency-blocked, `hold-po`, `blocked-external`, `deferred` or capped by attempts. **This is the "waiting only on the PO" escape**: PO-bound work is declared `hold-po` and is excluded from `ready`, so it can never keep the Elephant from stopping. |
| 8 | `slots == 0` where `slots = min(effectiveTarget - live, loadUnitsFree)` | `FANOUT-FULL` | At target or at a load cap (3.6). |
| 9 | **Anti-loop**: this is the 3rd consecutive block with no new `launch` since the first, or `stop_hook_active` is true with no launch since the last block, or the session already hit `maxBlocksPerSession` (default 12) | `FANOUT-DEFIED` | Bounded by construction, no infinite block. The defiance is logged (`defied`) and surfaced in the next `SessionStart` summary and the retro. |
| 10 | otherwise | `FANOUT-BLOCK` | Return **block** with the reason below. |

**Block reason (the only text that reaches the model; kept small because each block re-reads the full cached context,
about 0.5 M tokens, `elephant-load-findings-2026-10-05.md:10-11`, so a block must convert directly into dispatches):**

```
FANOUT-BLOCK: <slots> free slot(s), <ready> ready slice(s), live <live>/<target> (<units>/<cap> load units).
Dispatch now, in ONE message: <id1> (<tier>, <loadClass>), <id2> (...), ...   briefings: <ref1>, <ref2>
Silent live slice(s): <id> idle <n> min -> check diff activity.
Not startable and why: <id> waits on <dep>; <id> scope overlaps live <id>.
If you disagree with a slice, declare it instead of stopping silently:
  node <plugin-root>/scripts/slice-queue.mjs defer <id> --reason "<one line>"   (or hold <id> --po-question, or depend <id> <dep>)
```

**Step 7's companion, "declare instead of defy" (the key to not forcing parallelism onto sequential work):** the Elephant
may always disagree, but disagreement is a one-line durable edit of the queue (`defer`, `hold`, `depend`), which removes the
slice from `ready` for a stated reason and shows up in the retro. Silently ending the turn while ready slices exist is the
one thing that is not free.

**Modes (rollout, one config key `fanout.mode`, default `shadow`):**
`off` (silent) -> `shadow` (compute and log what it *would* do; never output) -> `advisory` (emit the reason as
`systemMessage`/`additionalContext` exactly like `stop-suggest`, never block) -> `enforce` (block with the counters above).
Shadow yields the would-have-blocked counts that are the acceptance data for moving to enforce.

### 3.4 (d) Dispatch-time overlap check: CHOSEN, in the existing `guard-dispatch`

`plugins/pipeline-core/hooks/guard-dispatch.mjs` is already wired on `Task|Agent|Workflow` (`hooks.json:7`) and is **not**
in PB-GUARD-HOOKS (`plugins/pipeline-core/protected-baseline.json:24-28`), so extending it needs no hook wiring and no
ceremony (ADR-0080 names the same zero-ceremony route, `docs/adr/0080-...md:262-266`). Add:
- briefing field 6 (`templates/prompts/goldfish-task.md`, dispatch metadata) gains two lines:
  `Slice: <id>` and `Write scope: <repo-relative paths, or "none" for read-only>`;
- `dispatchFindings()` in `plugins/pipeline-core/lib/dispatch-policy.mjs` (the surface ADR-0080 increment 2 already chose)
  gains `FANOUT-SCOPE-OVERLAP`: refuse when the declared scope intersects any `live` slice's scope (path-prefix and glob aware),
  when `Slice:` names an unknown, non-ready or dependency-blocked slice, when the declared scope is not contained in the queue
  entry's `writeScope`, and (only in `enforce`) when scope is undeclared while a live dispatch exists. Read-only dispatches
  declare `Write scope: none` and are never refused for overlap;
- the same call appends the `launch` event to the ledger (so launch is observed without any new PostToolUse wiring);
- for a `Workflow` call it evaluates all recovered dispatches pairwise, which is exactly the one-payload moment ADR-0080
  Decision 3 identified (`:229-243`); `${...}`-interpolated prompts that `extractWorkflowDispatches()` under-recovers
  (`docs/adr/0080-...md:300-323`) are treated as "scope unknown", so a queue-driven dynamic Workflow script cannot be checked.
  That is the reason the Workflow pool executor is rejected as the primary mechanism (3.8).

### 3.5 (e) Slicing-quality checks: CHOSEN, `validateSliceQueue()` + `slice-queue.mjs validate`

Pure function in `plugins/pipeline-core/lib/slice-queue.mjs`. Errors (block queue acceptance; the governor treats an invalid
queue as `FANOUT-NO-QUEUE`):
- `SQ-SCHEMA`, `SQ-ID` (unique, `SAFE_TASK_ID`, `dispatch-record.mjs:14`), `SQ-DEP-CYCLE`, `SQ-DEP-UNKNOWN`;
- **`SQ-OVERLAP`: any two slices that are not ordered by the dependency DAG (neither reaches the other) must have disjoint
  `writeScope`.** Scopes are normalised (case-fold on win32/darwin, `/` separators), compared as prefix/glob intersections.
  Slices ordered by a dependency chain may share files; that is how "two slices, one file" is made legal (sequenced), and
  how the monolith rule is stated precisely: **never two un-ordered slices in one file**;
- `SQ-MONOLITH`: a path listed in `monoliths` may appear in at most one *non-terminal* slice at a time even when ordered, so
  a monolith is frozen between package boundaries (the S2-00 rule, `0.7-execution-order.md:140-141`);
- `SQ-SHARED-SURFACE`: `docs/state.md`, the backlog ledger, `docs/adr/README.md`, handover/acceptance-matrix files
  (ADR-0080 PSP-1 denylist, `docs/adr/0080-...md:140-148`) appear in no slice's `writeScope`; they are written only by the
  Elephant after slices land (single integrator);
- `SQ-PROTECTED`: a slice whose scope matches a protected pattern (TP-1..13 in `templates/prompts/agent-obligations.md:87-101`,
  or any `PB-*` `pathPattern` in `plugins/pipeline-core/protected-baseline.json`) is auto-flagged `protected`; protected
  slices must be a single bundled package per PO signature (`0.7-execution-order.md:83-85`) and at most one is live;
- `SQ-TIER`: `deep`/`critic` need `tierReason`; a slice touching hook/guard/security/architecture paths needs a `critic`
  follow-up slice on the MP-07 route; tiers per agent definition, never silently upgraded;
- warnings: `estimatedToolCalls > 40` (the ~50-call cliff, `workflow-dispatch.md:105`), `writeScope` over 8 files, missing
  briefing ref, a `test-heavy` slice with no verify scope.

### 3.6 Load, host stability and cost

- **Load limits are first-class in `slots`.** `slots = min(target - live, loadUnitsFree)`; `loadClass` weights: `light = 1`,
  `test-heavy = 2`; defaults `maxLoadUnits` = 4 on win32/WSL and 6 elsewhere, ceiling `target <= 6`. This encodes the recorded
  facts: readiness flapped to `partial` at 6 agents and again at 5 (`0.7-execution-order.md:91-94`, `:126-130`), and at most
  2 agents may run tests in WSL at once, single files only (`:129-130`). A hard `wslTestSlots: 2` cap counts live slices
  whose `loadClass` is `test-heavy` and whose briefing runs WSL tests.
- **Adaptive back-off is deliberately out of scope for v1.** Reading readiness inside a Stop hook means running onboarding
  inspect (heavy), and the NOT-READY denial source is a protected guard (`PB-GUARD-HOOKS`). v1 = static caps the PO tunes;
  v2 = `effectiveTarget` lowered for 30 min after a recorded flap (needs a flap marker; PO decision).
- **Tier caps (MP-07 cost).** `tierCaps: { critic: 1, deep: 2 }` live at once by default; the governor never chooses a tier,
  it only counts. Critic slices occupy a slot like any dispatch.
- **Hook cost.** One short Node process per turn end; reads two small files and one directory listing; no `git`, no network
  (stop-suggest's rule). Budget well under the 10 s timeout other Stop/PreToolUse hooks use.
- **Default `target`: 4** (the PO-raised overnight value, `0.7-execution-order.md:126-128`); `maxTarget` 6. EL-11 says 3-5
  (`roles/elephant.md:159`), so a target of 6 needs an EL-11 amendment (PO question Q2).

### 3.7 Single-committer rule and the foreground/background conflict (a hard constraint, stated plainly)

- The shared-index hazard is real: disjoint file ownership protects only up to 2 concurrent committers and worktree isolation
  is mandatory from 3+ committing slices (`roles/elephant.md:187-190`); Elephant-side `git add/commit` must not run
  concurrently with a self-committing background dispatch (`roles/elephant.md:189`); shared non-code files need a single
  integrator (`:190`).
- **The native host-commit route is foreground-only**: `PostToolUse` finalizes "only a single marked foreground Task/Agent"
  and "background Claude dispatches remain unchanged" (`hooks/hooks.json:145`), and the plan says parallel slices use that
  route with `run_in_background: false` (`0.7-execution-order.md:76-79`). A foreground fan-out returns only when *all*
  siblings return, so it yields **waves, not sustained refill**.
- Resolution via the queue's `commitMode` (validated, and counted by the governor):
  - `host-commit` (foreground only): wave mode; the governor treats a wave as `k` live slices and refills at the wave boundary.
    Safe, but idles slots while the slowest slice finishes.
  - `diff-only`: background slice leaves changes uncommitted; the **Elephant is the single integrator**, committing each
    finished slice with explicit pathspecs one at a time (no concurrent self-committing dispatch exists, so the
    `roles/elephant.md:189` hazard does not arise). Sustained refill, at the price of one Elephant commit step per slice
    and of verifying inside a shared, partially edited tree (slice verify commands must stay inside their own scope).
  - `self-commit`: at most **one** live (`committingLive <= 1`, validated by `SQ-COMMIT` and counted by the governor).
  - `worktree`: unlimited by this rule, available only after R4 (`0.7-execution-order.md:65`) and subject to the
    containment/self-heal rules (`workflow-dispatch.md:26-103`).
- Consequence for the PO: **sustained refill at target >= 3 is only safe with `diff-only` + Elephant integrator today;
  worktree-per-Goldfish (R4) is the proper fix and should be prioritised if the PO wants fire-and-forget fan-out.**

### 3.8 Alternatives rejected or deferred

| Alternative | Verdict | Reason |
|---|---|---|
| Stronger prose / more role text | Rejected | Already failed repeatedly; ADR-0080 records the same (`:30-38`). |
| Non-blocking nudge only (ADR-0080 increment 1) | Kept as the *advisory* step of the ladder | No evidence it changes behaviour (`:495-505`); also cannot fire on an omission. |
| `PreToolUse` block on any tool call while slots are free | Rejected | Would block unrelated work (EL-16 ground, `:423-426`) and still cannot see a turn that makes no call. |
| `SubagentStop` as the steering lever | Rejected for steering, kept for ledger | It governs the subagent, not the Elephant; Claude does not wire it today. |
| External scheduler daemon spawning headless agents | Rejected | Leaves the Elephant's dispatch path: no template conformance (`guard-dispatch`), no dispatch record chain, no host-commit binding; Windows spawn storms; runner-specific. |
| Workflow tool as the pool executor (script pulls from the queue, refills in code) | Deferred (later executor) | Best "no model in the loop" refill, but `extractWorkflowDispatches()` cannot statically check dynamically built prompts (`docs/adr/0080-...md:300-323`), results can return empty (`workflow-dispatch.md:208`), shared-tree rounds orphan commits (`:61-103`). Revisit after R4. |
| Hard cap on one count ("always keep 6 busy") | Rejected | Ignores load facts and dependency structure; `target` is a ceiling, `ready` and load decide. |
| Per-slice dispatch-time *runtime* scope guard for the subagent's own writes | Deferred | Needs dispatch-to-scope binding at subagent start; the post-hoc check (`changedFiles` subset of `writeScope`) is in slice S7/S11. |

### 3.9 (f) Telemetry: CHOSEN

From the ledger (`stop-eval` events carry `live`, `target`, `ready`, `decision`, `mode`), `slice-queue.mjs report` prints per
session: **slot-idle minutes with ready slices** (the metric the PO is actually complaining about), mean `live/target` over
time while `ready > 0`, blocks / defied / declared-defers, pause time by `by`, slices launched vs queue size, flap-correlated
back-offs (v2). Summaries are written into the handover session block (EL-21 ledger discipline, `roles/elephant.md:180`) by
the `close-block` skill, and a short `evidence/fanout-utilization-<date>.json` is the retro input. Hash-only privacy rule
applies (`native-slicing.mjs:6-7`).

### 3.10 Making the Elephant keep the queue (the chicken-and-egg)

The governor is silent without a queue, so the *queue* needs its own pressure, in the weakest effective form:
- implementation phase active (`PHASE_GATE_MAP.implementation`, `stop-suggest.mjs:111-114`) and no queue -> one advisory
  line from the governor (`FANOUT-NO-QUEUE`);
- `post-compact-reground.mjs` and `SessionStart` add one summary line "slice queue: N ready, M live, target T" so a
  compacted or resumed Elephant is re-grounded on the queue (hooks bodies, no wiring change);
- dispatch-time: a Goldfish *implementation* dispatch without `Slice:` while a queue exists is `FANOUT-NO-SLICE` (shadow, then
  enforce), so work cannot bypass the queue;
- slicing itself stays the Elephant's design-phase judgment (EL-26 and ADR-0080 "PSP evaluation stays Elephant work"); the
  queue only forces it to be written down where a machine can check it.

## 4. Failure modes and their handling

| Failure | Handling |
|---|---|
| Stale queue (work done, queue not edited) | `done`/`live` are derived from records, not edited; a slice with a terminal record is never `ready`. Queue older than `staleQueueHours` (default 48) -> `FANOUT-NO-QUEUE`. |
| Governor crash / bad state / unwritable private dir (DrvFs 777 modes, `0.7-execution-order.md:86-88`) | Exit 0 silently (`FANOUT-FAILOPEN`); never a block on infrastructure error. |
| Infinite block | Rule 9: 3 blocks without a launch, `stop_hook_active` with no launch, `maxBlocksPerSession`. After that `FANOUT-DEFIED` is logged and surfaced. |
| Block while only the PO is awaited | Impossible by rule 7: PO-bound slices are `hold-po`; the Elephant declares it with one line. A PO pause (rule 5) and `fanout.mode: off` are the PO's switches. |
| Elephant fakes `hold-po`/`defer` to idle | Each is a durable queue edit with a reason, counted in telemetry per session; the Critic/retro can audit it. Attributable, not preventable (honest limit). |
| Wrongly parallel unsafe slices | Prevented earlier than the governor: `SQ-OVERLAP`/`SQ-MONOLITH`/`SQ-SHARED-SURFACE` at queue validation and `FANOUT-SCOPE-OVERLAP` at dispatch. |
| Dead background agent holds a slot forever | Reported as "silent N min" in every block reason; freed only by explicit `reap`. Never auto-freed (PO restart rule, `0.7-execution-order.md:97-98`). |
| Double wake-up cost with the `/goal` stop hook | Governor blocks only when a dispatch will follow; duplicated status-line wake-ups are a separate fix (`elephant-load-findings-2026-10-05.md:21-24`). |
| Interim hand-back (budget checkpoint, `guard-dispatch-budget`) | Slice returns to `ready` with a continuation pointer; two attempts then `hold` (`guard-dispatch-budget.mjs`, closing-act text near `:196-197`). |
| Lock race on counters | Ledger is append-only, no lock (3.2). |

## 5. Interaction with existing components

- **`guard-dispatch-budget.mjs`**: unchanged. The governor only *reads* its counter files as a heartbeat and reuses its exported
  `resolveGitCommonDir` (already imported by `native-slicing.mjs:13`). Its orchestrator exemption stays; the new Stop hook uses
  the same `agent_id` discriminator (`:1003-1028`).
- **Dispatch records** (`pipeline.dispatch-record.v4`, `dispatch-record.mjs:5`): no schema change. `sliceId == taskId`, so
  `evidence/dispatch-record-<id>.json` is the join key; terminal/interim state comes from existing fields.
- **Workflow tool**: `guard-dispatch` evaluates a fan-out round pairwise (3.4); the Workflow pool executor is deferred (3.8).
  A Workflow call keeps resetting ADR-0080 trigger A's run exactly as today (`guard-slicing.mjs:80-107`).
- **ADR-0080 guard-slicing**: stays as the advisory/backstop layer (its header says "not wired" at `guard-slicing.mjs:21-25`, but
  `hooks/hooks.json:132-139` now wires it; the header is stale, left untouched). The governor supersedes its "never blocking"
  posture only for the turn-end case, via the ADR amendment.
- **Elephant working rules** (`0.7-execution-order.md:76-98`) become the queue's validated fields instead of prose.

## 6. Exact change list

Protected-path status is read from `templates/prompts/agent-obligations.md` section 2 (TP-1..13) and
`plugins/pipeline-core/protected-baseline.json` (PB-*). "no" means: matches none of those patterns *as read here*; the
`NEVER_LIFTABLE_KERNEL_PATHS` list was not read and must be checked by S8's briefing.

| Slice | Files (new = N) | Function / hook event | Tests | Protected? |
|---|---|---|---|---|
| S0 probe | `specs/sprint-alfred-epic/evidence/fanout-runner-probe.md` (N) | Observe on each runner: Stop block reaches the model; `stop_hook_active`; Stop fires when a background task is alive and when a notification wakes the session; Claude `SubagentStop` fires; AGY Stop can block; Codex has a blockable turn end | n/a (measurement) | no |
| S1 queue lib | `plugins/pipeline-core/lib/slice-queue.mjs` (N), `.test.mjs` (N) | `loadSliceQueue`, `validateSliceQueue`, `normalizeScope`, `scopesOverlap`, `readyAndLive`, `protectedFlag` | unit: DAG, overlap matrix incl. win32 case-fold, monolith, shared-surface, tier | no (new) |
| S2 ledger lib | `plugins/pipeline-core/lib/fanout-ledger.mjs` (N), `.test.mjs` (N) | `appendEvent`, `liveSlices` (3-source union), `staleSlices`, `fanoutStatePath` | unit: concurrent appends, union, stale vs reap, hash-only privacy | no (new) |
| S3 governor | `plugins/pipeline-core/lib/fanout-governor.mjs` (N), `.test.mjs` (N) | `evaluateFanoutStop` per section 3.3 table, modes, counters, `slots` | unit: one case per rule 1-10, loop bounds, load caps, tier caps | no (new) |
| S4 CLI | `plugins/pipeline-core/scripts/slice-queue.mjs` (N), `.test.mjs` (N) | `validate`, `next`, `add`, `defer`, `hold`, `depend`, `pause`, `reap`, `finish`, `report` | CLI contract tests; atomic write | no (new) |
| S5 Claude adapter | `plugins/pipeline-core/hooks/stop-fanout.mjs` (N), `.test.mjs` (N) | `Stop` event: parse stdin, orchestrator check, call governor, emit JSON, always exit 0 on error | stdin fixtures incl. `stop_hook_active`, fail-open | no (new file); **wiring is S8** |
| S6 AGY/Codex adapters | `plugins/pipeline-core/hooks/antigravity-stop-hook.mjs` (edit), `plugins/pipeline-core/hooks/codex-slicing-hint.mjs` (edit, finish events only) | AGY `Stop`: also run governor, output per probe S0; Codex `SubagentStop`: append `finish`; AGY `PreInvocation deliver` slot line as the advisory fallback | extend existing hook tests | no as read (**not** TP-4: that pattern is `hooks/hooks\.json$`; root `plugins/pipeline-core/hooks.json` is not edited here) |
| S7 dispatch guard | `plugins/pipeline-core/hooks/guard-dispatch.mjs` (edit), `plugins/pipeline-core/lib/dispatch-policy.mjs` (edit), `templates/prompts/goldfish-task.md` (edit field 6) | `PreToolUse` on `Task\|Agent\|Workflow`: `FANOUT-SCOPE-OVERLAP`, `FANOUT-NO-SLICE`, append `launch`; `dispatchFindings()` new codes | extend `guard-dispatch` and `dispatch-policy` tests; shadow mode default | not in TP/PB lists; **verify `goldfish-task.md` preimage pinning** (a sibling template `critic-review.md` was re-pinned in `c26de7987`) |
| S8 wiring | `harness/scripts/wire-fanout-hook.mjs` (N, modelled on existing `harness/scripts/wire-slicing-hook.mjs`) and the run that adds a second command to the `Stop` array in `plugins/pipeline-core/hooks/hooks.json` | `Stop` event, second command `stop-fanout.mjs` | wiring test as for `wire-slicing-hook` | **YES: TP-4 and kernel-protected** (`agent-obligations.md:92`, ADR-0080 `:256-261`): attended PO operator-tool run, no in-session override |
| S9 re-ground | `plugins/pipeline-core/hooks/post-compact-reground.mjs` (edit), SessionStart summary via `staleness-check.mjs` or a new `session-fanout-summary.mjs` (N, **needs** wiring, so prefer reground-only in v1) | one summary line from `readyAndLive` | extend reground test | no |
| S10 canon | new ADR (number allocated at acceptance, ADR-0069) amending ADR-0080 Decision 5; `roles/elephant.md` EL-11/EL-22 (target, queue duty, "declare instead of defy"); `docs/operating-model.md` dispatch section | n/a | `check-doc-contracts` and doc-contract tests | no (docs); needs PO decision Q1 first |
| S11 telemetry/close | `plugins/pipeline-core/skills/close-block/SKILL.md` (edit), report subcommand test | `slice-queue.mjs report` into handover/retro | skill contract test | no |

**Test registration (open, needs the PO):** `harness/verify-suites.json` is TP-13 and `PB-VERIFY-REGISTRATION`
(`protected-baseline.json:36-40`). If `check-verify-suite-registration.mjs` requires every new `*.test.mjs` to be registered
(not read here), S1-S6 test files need a registration edit that only a signed protected package can make. Treat as one extra
bundled protected package, handled like the other protected packages (`0.7-execution-order.md:83-85`); until then, run the new
tests directly with `node <file>` on single files (never full Verify on native Windows).

## 7. Implementation slices, disjoint scopes, and waves

Interfaces are fixed in sections 3.1-3.3 (queue schema, `evaluateFanoutStop` signature, ledger event names, CLI verbs), so S1-S4
can run in parallel against the contract. Scopes below are pairwise disjoint; the only shared surfaces (`docs/state.md`, the
backlog ledger, `docs/adr/README.md`) are written by the Elephant alone. Never two slices in `guard-dispatch.mjs` (S7 owns it).

| Wave | Slices (parallel) | Tier | Commit mode | Load |
|---|---|---|---|---|
| W0 | S0 probe, S1, S2, S10 (doc draft only until PO answers Q1) | S0 `implementor` (+ PO-attended AGY/Codex runs), S1/S2 `implementor`, S10 `deep` | `diff-only`, Elephant integrates | S1/S2 `test-heavy` x 2 = 4 units; S0, S10 `light`; stays within target 4 if S10 starts when a slot frees |
| W1 | S3, S4, S5, S7, S9 (after S1+S2 integrated) | S3 `deep` (the decision core), S4/S5/S9 `implementor`, S7 `deep` (guard code) | `diff-only` | at most 2 `test-heavy` live |
| W2 | S6 (needs S0 verdicts), S11; then **S8 (PO ceremony)** | `implementor`; S8 operator tool run by the PO | `diff-only`; S8 attended | light |
| W3 | enable `shadow` -> measure -> `advisory` -> `enforce` (config only, no code) | n/a | n/a | n/a |

**Critic route.** Class: guardrail (a hook that can block the orchestrator, a dispatch-guard change, a `hooks.json` edit) plus
canon, so MP-07 mandates the higher-capability Critic at `max` for the bundled review, with T1 critical treatment for the
`hooks.json` edit. One bundled wave-end Critic over S3+S5+S7+S8 (EL-22 legitimately-serial item), receiving **artifact paths**
(this design, the S0 probe evidence, test logs), never a claims list or hunt list (`CLAUDE.md` dispatch rule); the Critic
re-review sees only the correction delta. S1/S2/S4/S9/S11 are covered by the wave's ordinary verify; S10 gets its own
document review because it changes an accepted ADR.

## 8. Matrix: runner x platform x repository

Enforcement strength per runner, as far as the repository shows; "probe" = unverified in the repository, resolved by S0.

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Turn-end block (the governor) | Expected via `Stop` decision; semantics proven only indirectly by the `/goal` hook measurement; probe `stop_hook_active` | **No Stop wired**; probe whether a blockable turn end exists. Until then: advisory only | `Stop` wired but only forwards stderr today; probe whether it can block. Fallback: `PreInvocation` `ephemeralMessage` slot line every invocation (advisory) |
| Finish signal | records + budget counters (no `SubagentStop` wiring needed) | `SubagentStop` already wired, append `finish` | records + counters |
| Dispatch-time overlap | `guard-dispatch` on `Task\|Agent\|Workflow` | `guard-dispatch` on `spawn_agent` (`codex-hooks.json:31-42`) | PreToolUse matcher includes `invoke_subagent` (`plugins/pipeline-core/hooks.json:6`); scope read from the `Subagents` array via `extractAntigravityDispatches()` |
| Wiring cost | one TP-4 ceremony (S8) | none for finish events; Stop wiring unknown | none (`antigravity-stop-hook.mjs` is a hook body); root `hooks.json` unchanged |

| Platform | Notes |
|---|---|
| Native Windows | Hook = one short Node process (no shell, no `git`); caps default to 4 load units because spawn storms and readiness flaps appeared at 5-6 agents; ledger append-only avoids `counter-lock-busy`; case-fold in scope compare; no console windows (the hook spawns nothing except AGY's existing `stop-suggest` child). Full Verify stays off native Windows. |
| WSL | Private state at `<git-common-dir>/agent-pipeline/fanout/`; **on a `/mnt/<drive>` checkout DrvFs 777 modes break private state** (`0.7-execution-order.md:86-88`) -> governor must fail open (rule 1). `wslTestSlots: 2` cap. Tests only in a disposable clone, never against the real checkout (`:95-96`). |
| macOS | Case-insensitive FS: scope compare case-folds; otherwise as Linux; no platform-specific code. |

| Repository | Notes |
|---|---|
| Own (this repo) | Default `fanout.mode: shadow`, Alfred overnight sessions switch to `enforce` after S0; queue at `specs/<feature>/slice-queue.json`. |
| Consumer | Governed only where `observeGovernanceScope(...).requiresEnforcement` (rule 3); config in `pipeline.user.yaml`/calibration; default `shadow`; queue convention identical; its own protected-baseline is read for `SQ-PROTECTED`; no host paths anywhere (`<git-common-dir>`, `<plugin-root>`, repo-relative). |

## 9. Open questions for the PO

1. **Q1 ADR amendment.** Allow the Stop-time governor, i.e. amend ADR-0080 Decision 5 ("no hard block") for the *turn-end*
   case only, with the declare-instead-of-defy escape? Without a yes, the ceiling is the `advisory` mode.
2. **Q2 Target and ceiling.** Default `target` 4 with ceiling 6 requires amending EL-11 ("3-5", `roles/elephant.md:159`); keep 5 as the ceiling?
3. **Q3 Wiring ceremony.** One attended operator-tool run for the `Stop` command in `hooks/hooks.json` (S8). Acceptable after a
   shadow period; how long (suggest 3 sessions or 1 week)?
4. **Q4 Test-registration package.** Should S1-S6 tests be registered in `harness/verify-suites.json` through one signed protected package?
5. **Q5 Background vs host-commit.** Accept `diff-only` + Elephant integrator as the sustained-refill route until R4, or prioritise R4 (worktree per Goldfish)?
6. **Q6 Pause authority.** Is an Elephant-recorded pause (attributed `by: elephant`, max 4 h) acceptable, or must only the PO's config switch pause fan-out?
7. **Q7 Queue location.** Convention `planPath`-sibling (`specs/<feature>/slice-queue.json`) vs one repo-wide file; the Alfred epic's `activeFeature.planPath` was not verified.

## 10. Not verified here (disclosed)

- No runner was executed; every runner behaviour listed as "probe" is read from adapter files only.
- `NEVER_LIFTABLE_KERNEL_PATHS`, `check-verify-suite-registration.mjs`, the protected status of `goldfish-task.md` and
  `plugins/pipeline-core/hooks.json` (Antigravity wiring) were not read; the change list marks them as to-be-checked.
- `stop_hook_active` and the Claude `decision: "block"` output shape are taken from the Claude Code hook contract, not from
  repository usage (searched `stop-suggest.mjs`, `codex-pretool-guard.mjs`, `native-goldfish-host.mjs`, ADR-0080: no hit).
- Tool budget: the design read roughly 36 files/regions; `guard-dispatch.mjs`, `dispatch-policy.mjs`, `close-block` and the
  operating model were not read in full, so S7/S11 signatures are proposals to be confirmed in their briefings.
