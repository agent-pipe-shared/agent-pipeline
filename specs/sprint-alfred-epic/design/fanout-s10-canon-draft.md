# FANOUT S10: canon amendment draft for the fan-out governor

> Dispatch `FANOUT-S10D`, ruleset `0.7.0+claude.20261005202045.7170ed20`, candidate `72a9f81c5`, 2026-10-06.
> Status: DRAFT, pending PO answers Q1 / Q2 / Q6 (and one new question Q8 surfaced below). Nothing here is applied.
> Independent review: pending. PO acceptance: open.
> Contract: `specs/sprint-alfred-epic/design/fanout-enforcement-design.md` (section 3.3 rule table, 3.4 dispatch guard, modes paragraph, section 6 row "S10 canon", section 9, section 10).
> Language: English (ADR-0011). Anchors are `file:line` as read on 2026-10-06 at the candidate commit. This file uses no Markdown links on purpose (the doc-contract link check scans tracked Markdown, see part D).

## 0. How to apply this draft

Pick one marked alternative per PO question. Every alternative is tagged, so applying an answer is a search for its tag.

| Tag | PO question | Alternative |
|---|---|---|
| `[Q1-YES]` / `[Q1-NO]` | Q1 (design section 9.1): may a Stop-time governor block the turn end? | Yes: ladder `off`/`shadow`/`advisory`/`enforce`. No: ladder ceiling is `advisory`, `enforce` is unavailable. |
| `[Q2-KEEP-5]` / `[Q2-RAISE-6]` | Q2 (design section 9.2): ceiling of concurrent goldfish | Keep ceiling 5 (target 4). Or target 4 / ceiling 6. |
| `[Q6-A]` / `[Q6-B]` | Q6 (design section 9.6): who may pause fan-out | A: an Elephant-recorded, attributed pause (max 4 h) is acceptable. B: only the PO's configuration switch pauses. |
| `[Q8-IN]` / `[Q8-OUT]` | Q8 (NEW, this draft): is the dispatch-time safety refusal authorized by this ADR? | In: this ADR also authorizes it. Out: a separate decision (Decision 3 of ADR-0080 stays "not authorized here"). |

Shipped defaults the answers must be compatible with (read, `plugins/pipeline-core/lib/fanout-governor.mjs:96-109`, `DEFAULT_FANOUT_CONFIG`): `mode: "shadow"` (:97), `target: 4` (:98), `maxTarget: 6` (:99), `maxLoadUnitsConstrained: 4` (:100), `maxLoadUnitsOther: 6` (:101), `wslTestSlots: 2` (:102), `tierCaps: { critic: 1, deep: 2 }` (:103), `staleQueueHours: 48` (:105), `maxBlocksPerSession: 12` (:106), `maxPauseMinutes: HARD_MAX_PAUSE_MINUTES` (:107, value not read here), `pauseAuthorities: ["po", "elephant"]` (:108).

Consequence for the PO's answers, stated once so it is not discovered late:

- The shipped `maxTarget: 6` already has the `[Q2-RAISE-6]` shape. Under `[Q2-KEEP-5]` the ceiling must become 5, either by configuration (`maxTarget: 5`) or by a change of the code default plus its test (slice S3, outside S10).
- The shipped `pauseAuthorities: ["po", "elephant"]` already has the `[Q6-A]` shape. Under `[Q6-B]` it must become `["po"]` the same way.
- The shipped `mode: "shadow"` is correct under both Q1 answers. Under `[Q1-NO]` the governor must additionally clamp a configured `enforce` to `advisory`; whether it does today was not read (`FANOUT_MODES` and the mode handling past line 161 were only partly read), so treat it as a to-confirm item for the S3 owner.

## A. Draft ADR (number placeholder `ADR-XXXX`, status `proposed`)

Numbering follows ADR-0069 Decision 2: the number is allocated in the act of acceptance, and this file plus its index row are one commit (`docs/adr/0080-parallel-dispatch-slicing-enforcement.md:7-9`: "Numbered in the act of acceptance per ADR-0069 Decision 2 — this file and its index row in `docs/adr/README.md` are one commit."). Structure below mirrors the ADR template (`templates/adr.md:33-73`: title, status/basis line, Context, Decision, Consequences, Alternatives considered, Follow-up) and the header shape of ADR-0080 (`docs/adr/0080-parallel-dispatch-slicing-enforcement.md:1-24`: title, `Governs:`, as-of line, Status, Basis). The ADR is never rewritten but superseded (`templates/adr.md:19-22`); an amendment therefore lives in a new ADR, and ADR-0080 receives at most a status-line cross-reference (the status/typo exception of `templates/adr.md:21-22`). ADR-0080 itself already carries dated addenda (`docs/adr/0080-parallel-dispatch-slicing-enforcement.md:644`, `:906`, `:941`), so a dated addendum on ADR-0080 would also be convention-conformant; this draft recommends the new ADR because the amendment changes an accepted decision and needs its own acceptance act.

---

```markdown
# ADR-XXXX: The fan-out governor may block an idle turn end; ADR-0080 Decision 5 is amended for that one event

**Governs:** plugins/pipeline-core/lib/fanout-governor.mjs, plugins/pipeline-core/lib/slice-queue.mjs, plugins/pipeline-core/lib/fanout-ledger.mjs, plugins/pipeline-core/scripts/slice-queue.mjs, plugins/pipeline-core/hooks/stop-fanout.mjs, plugins/pipeline-core/hooks/antigravity-stop-hook.mjs, plugins/pipeline-core/hooks/guard-dispatch.mjs, plugins/pipeline-core/lib/dispatch-policy.mjs, plugins/pipeline-core/hooks/hooks.json

> Agent-Pipeline · Sprint Alfred · as of 2026-10-06 (proposed; the "Governs" list follows design section 6 and names files that are planned slices, not all of them exist yet)

**Status:** proposed. Amends ADR-0080 Decision 5 for the turn-end (Stop) event only. [Q1-NO: "Status: proposed. Reaffirms ADR-0080 Decision 5 for the turn-end event and sets the mode ceiling to `advisory`."]
**Basis:** PO requirement of 2026-10-05 (every Elephant works in many small slices and many parallel dispatches by default, and keeps free slots filled without being reminded); design `specs/sprint-alfred-epic/design/fanout-enforcement-design.md` (sections 0, 1.3, 3.3, 3.4, 9); ADR-0080 (`docs/adr/0080-parallel-dispatch-slicing-enforcement.md`).

## Context

The failure the PO reports is an omission: the Elephant makes no tool call and ends its turn while startable work and free slots exist. A `PreToolUse` hook cannot see an omission; the only event that fires at that moment is the runner's turn-end event (design section 1.3). ADR-0080 chose a non-blocking, dispatch-time nudge and recorded that this repository holds no evidence that a non-blocking message changes an Elephant's default (`docs/adr/0080-parallel-dispatch-slicing-enforcement.md:499-505`). That nudge also cannot fire on an omission, because it fires only when the Elephant already dispatches (design section 1.2).

ADR-0080 Decision 5 as accepted (verbatim, `docs/adr/0080-parallel-dispatch-slicing-enforcement.md:394-400`):

> ### Decision 5 — What "enforced" means operationally: staged, and increment 1 is not a block
>
> **Increment 1 (this proposal, matching the PO's stated preference).** A
> *delivered default*, not a block: the hook fires at the decision point, states
> the slicing default and the PSP conditions in the model-reaching channel of
> Decision 1, and appends one record to a ledger. The Elephant remains free to
> proceed sequentially with no justification. Nothing is refused.

and its rejection of a hard block (verbatim, `docs/adr/0080-parallel-dispatch-slicing-enforcement.md:418-426`):

> **Rejected: a hard block on proceeding without slicing.** Three independent
> reasons, any one sufficient. (i) The guard cannot prove the batch was
> slice-able — it sees footprint and counts, never the dependency structure PSP-2
> needs, unless every briefing is already written. Blocking on a count alone
> refuses legitimately-sequential work, which is precisely the failure mode the
> item names as "at least as bad as the current gap." (ii) Under **EL-16**
> (delegate-first: every execution-phase implementation is a briefed Goldfish
> dispatch), a block on dispatch is a block on all execution work — the blast
> radius of a false positive is the whole session. (iii) The 2026-08-07 item

(the sentence continues at `:426-435` with the five recorded collision incidents). The later status addendum restates the posture (verbatim, `docs/adr/0080-parallel-dispatch-slicing-enforcement.md:947-949`): "ADR-0080 remains advisory and does not require parallel execution."

ADR-0080 also treats the Stop-hook route only as a retrospective report (verbatim, `docs/adr/0080-parallel-dispatch-slicing-enforcement.md:609-613`): "**A `Stop`-hook retrospective report** — summarize slicing behaviour at session end instead of nudging during. **Rejected as the primary mechanism** (it cannot change the session it observes) but noted as a cheap, additive consumer of the same ledger if the reporter script proves useful." The governor is a different thing: it acts at turn end on the queue the Elephant itself declared, before the session ends.

Each ground of the rejection is answered by the governor, not ignored (design section 2):

- Ground (i): the governor does not judge slice-ability. It acts only on a queue the Elephant itself declared, with write scopes and dependencies, validated mechanically. "Ready" means the Elephant's own declaration plus mechanical checks.
- Ground (ii): the governor never blocks a dispatch or any tool call. It blocks only the act of ending the turn while declared work is startable, and sequential work is expressed by declaring a dependency, which costs one command line.
- Ground (iii): disjointness is checked at queue validation and again at dispatch time (Decision 4 below), which is the safety direction ADR-0080 Decision 3 recorded as the one legitimate direction for a hard block (`docs/adr/0080-parallel-dispatch-slicing-enforcement.md:237-240`: "refusing a parallel round whose slices collide, which is the one direction in which a hard block is legitimate, because it blocks *unsafe parallelism* and never forces parallelism onto sequential work").

## Decision

### Decision 1 — Scope of the amendment

ADR-0080 Decision 5 is amended for exactly one event: the runner's turn end (`Stop`). Nothing else in ADR-0080 changes. Decisions 1 to 4, the Parallel-Safety Predicate PSP-0..PSP-3, the slicing-decision ledger, the advisory increment 1 and the guard-slicing hook stay as accepted. The rejection of a hard block on a dispatch and on "proceeding without slicing" stays in force: no tool call is ever blocked by the governor. ADR-0080 Increment 2 (the `Slicing:` disclosure line) is neither authorized nor withdrawn here; the `Slice:` and `Write scope:` briefing lines of Decision 4 are a different artifact (queue binding), not that disclosure line.

### Decision 2 — The fan-out governor and its allow-rules

A runner-neutral governor (`evaluateFanoutStop`, a pure function with injected I/O) reads a tracked slice queue and a derived slot ledger at turn end. It returns `block` only when, after all of the following rules have failed to match, ready slices exist and free slots exist. Each rule that matches returns `allow` silently with a reason code (design section 3.3):

1. `FANOUT-FAILOPEN`: unparseable input, any exception, or an unwritable state directory.
2. `FANOUT-NOT-ORCHESTRATOR`: the hook input belongs to a subagent.
3. `FANOUT-OFF`: governance scope does not require enforcement, or the mode is `off`.
4. `FANOUT-NO-QUEUE`: queue absent, schema-invalid, or stale beyond `staleQueueHours` (one advisory line, never a block).
5. `FANOUT-PAUSED`: an unexpired pause exists (see Decision 6).
6. `FANOUT-CUTOFF`: the declared deadline or the session budget cut-off has passed.
7. `FANOUT-NO-READY`: no ready slice. Slices waiting on a dependency, on the PO (`hold-po`), on an external party, deferred, cancelled, or capped by attempts are not ready. This is the "waiting only on the PO" escape.
8. `FANOUT-FULL`: no free slot at the target or at a host-load cap.
9. `FANOUT-DEFIED`: anti-loop. The third consecutive block with no new launch, a stop-hook re-invocation with no launch since the last block, or the per-session block cap (default 12) was reached. The governor then allows, logs the defiance, and surfaces it at the next session start and in the retro.

Only when none matches does it return `FANOUT-BLOCK`, with a short reason that names the ready slices, the free slots and the one-line declaration commands (design section 3.3). The block is bounded by construction.

### Decision 3 — Declare instead of defy

The Elephant may always disagree with a ready slice. Disagreement is a one-line durable edit of the queue: `defer <id> --reason`, `hold <id>` for work that waits only on the PO, or `depend <id> <dep>` for a named dependency. Each removes the slice from the ready set for a stated reason, is auditable at close and critic review, and is never refused. Silently ending the turn while ready slices and free slots exist is the one choice that is not free. The honest limit is recorded: a false `hold` or `defer` made only to idle is attributable (reason, count per session in the telemetry), not preventable.

### Decision 4 — Modes: `off` < `shadow` < `advisory` < `enforce` (one key, `fanout.mode`)

| Mode | Effect at turn end | Effect at dispatch time (Decision 5) |
|---|---|---|
| `off` | silent | silent |
| `shadow` (shipped default) | computes and logs what it would do; emits nothing | computes and logs; refuses nothing |
| `advisory` | emits the reason as a non-blocking message to the model, like `stop-suggest`; never blocks | emits findings; refuses nothing |
| `enforce` | blocks the turn end with the reason, bounded by Decision 2 rule 9 | refuses per Decision 5 |

Moving up the ladder is configuration, not code. Shadow produces the would-have-blocked counts that are the acceptance data for `advisory` and `enforce`. Moving a project or a runner from `advisory` to `enforce` is a PO decision recorded in the decision register after the measurement. `enforce` may be enabled for a runner only after that runner's probe verdict (design section 6, slice S0: does a Stop block reach the model, is the re-invocation flag honoured, does Stop fire when a background task is alive or a notification wakes the session) is recorded.

`[Q1-YES]` This ADR makes `enforce` available.
`[Q1-NO]` If Q1 is answered no, the ceiling is `advisory`. The ladder is `off` / `shadow` / `advisory`; a configured `enforce` is treated as `advisory`; the governor never blocks anything at any turn end; Decision 2 still defines what it would have blocked and therefore what it logs and advises. In that case ADR-0080 Decision 5 is reaffirmed for the turn-end event, this ADR records the governor as an advisory and measuring layer, and Decisions 3, 5 and 6 are unchanged except that every use of "block" below reads "advise".

### Decision 5 — Dispatch-time safety check (the Decision 3 direction)

`[Q8-IN]` At dispatch time the existing dispatch guard (`guard-dispatch`, which already passes every `Task`, `Agent` and `Workflow` call) compares the briefing's declared write scope (`Slice:` and `Write scope:` lines in field 6, or `none` for a read-only dispatch) with every live slice's scope and the queue entry, under the same mode ladder. In `enforce` it refuses a dispatch whose declared scope overlaps a live slice, names an unknown, non-ready or dependency-blocked slice, or exceeds the queue entry's scope, and, only in `enforce`, a dispatch with undeclared scope while another dispatch is live. Read-only dispatches are never refused for overlap. This authorizes what ADR-0080 Decision 3 recorded as the one legitimate hard-block direction and explicitly marked "not authorized here" (`docs/adr/0080-parallel-dispatch-slicing-enforcement.md:240-243`: "**Explicitly not increment 1**, and not authorized here"). It blocks unsafe parallelism only and never forces parallelism onto sequential work.
`[Q8-OUT]` This ADR does not authorize the dispatch-time refusal. The guard computes and logs overlap findings in `shadow` and `advisory`; refusal needs its own decision. Q1 does not depend on Q8.

### Decision 6 — Pause authority

`[Q6-A]` A pause may be recorded by the PO or by the Elephant, attributed (`by: po` or `by: elephant`), with a hard maximum of 4 hours per pause (design section 3.3 rule 5). An Elephant self-pause is visible in the retro: attributable, not provable. The PO's untouchable switch remains `fanout.mode: off` in `pipeline.user.yaml`.
`[Q6-B]` Only the PO may pause fan-out, through the configuration switch (`fanout.mode: off`, or `pauseAuthorities` restricted to `po`). The Elephant has no pause command; its only durable escapes are the declarations of Decision 3.

### Decision 7 — Concurrency numbers have one home

The target and the ceiling live in EL-11 and are mirrored by the governor configuration (`target`, `maxTarget`), never restated elsewhere in canon. Target: 4. `[Q2-KEEP-5]` Ceiling: 5. `[Q2-RAISE-6]` Ceiling: 6. Host-load caps (4 load units on native Windows and WSL, 6 elsewhere in the shipped defaults, `plugins/pipeline-core/lib/fanout-governor.mjs:100-101`) may lower the effective target and never raise it. The shared-index rules of EL-22 (worktree isolation mandatory from three or more goldfish committing to one tree; no concurrent Elephant-side git write with a self-committing background dispatch; a single integrator for shared non-code files) are unchanged and are enforced through the queue's `commitMode` field (design section 3.7).

## Consequences

**Positive:** the omission becomes visible to a runner event for the first time; every escape is a durable, auditable declaration; safety (disjoint scopes, monolith rule, one committer, protected-package bundling) is checked before parallelism is pushed; the staged ladder yields the acceptance data this repository does not yet have.

**Negative:** a Stop block re-reads the full cached context of the session on every re-invocation, so a block must convert directly into dispatches (the reason text is kept short for that purpose, design section 3.3); the Elephant carries a new duty (keeping the queue); the first blocking enablement needs an attended PO wiring ceremony for the hook registration (design section 6, slice S8).

**Risk:** (1) Stop-block semantics are proven only indirectly and the re-invocation flag is unused in the repository, so enablement is gated on the probe (Decision 4). (2) Declarations can be faked to idle; mitigated by audit, not prevented. (3) A queue that is never written leaves the governor silent; the queue has its own, weaker pressure (an advisory line while the implementation phase is active, a re-grounding summary after compaction, design section 3.10). (4) Under `[Q2-KEEP-5]` or `[Q6-B]` the shipped code defaults differ from the decision and must be configured or changed.

## Alternatives considered

- **Stronger prose** (more role text): rejected, already failed repeatedly and ADR-0080 records the same.
- **Non-blocking nudge only** (ADR-0080 increment 1): kept as the `advisory` rung; it cannot fire on an omission and has no evidence of effect.
- **`PreToolUse` block on any tool call while slots are free:** rejected, it would block unrelated work (the EL-16 ground) and still cannot see a turn that makes no call.
- **`SubagentStop` as the steering lever:** rejected for steering (it governs the subagent, not the Elephant); kept as a free finish signal for the ledger where a runner wires it.
- **External scheduler spawning headless agents:** rejected, it leaves the Elephant's dispatch path (no template conformance, no dispatch record chain, no host-commit binding).
- **Workflow tool as pool executor:** deferred, dynamically built prompts cannot be statically checked (design section 3.8).
- **Hard count ("always keep N busy"):** rejected, it ignores load and dependency structure; the target is a ceiling and readiness and load decide.

## Matrix: runner x platform x repository

(From design section 8. "pending S0 probe" marks what the repository does not evidence. No runner was executed for this draft, design section 10.)

| Runner / repo | native Windows | WSL | macOS |
|---|---|---|---|
| Claude, own repo | Stop governor via `stop-fanout.mjs` after the S8 PO wiring ceremony; mode per config, shipped default `shadow`; 4 load units; case-fold scope compare; Stop re-invocation and background-wake semantics pending S0 probe | same governor; private state under the git common dir; a checkout on a mounted Windows drive can break private-state modes, then the governor fails open (rule 1); 2 WSL test slots | same governor; case-fold scope compare; not exercised on macOS |
| Claude, consumer repo | same as own, but governed only where governance scope requires enforcement (rule 3); default `shadow`; the consumer's own protected baseline feeds the `protected` flag | same as left, same fail-open on a mounted-drive checkout | same as left |
| Codex, own repo | no Stop event wired today; the amendment means observation, finish events from the already wired `SubagentStop`, and the dispatch-time check on `spawn_agent`; blockable turn end pending S0 probe, ceiling `advisory` until then | same; WSL caps as above | same; not exercised |
| Codex, consumer repo | as Codex own, gated by governance scope | as left | as left |
| Antigravity, own repo | Stop is wired but forwards only stderr today; whether it can block is pending S0 probe; fallback is a per-invocation slot line (advisory); dispatch-time check reads the subagent array | same; WSL caps as above | same; not exercised |
| Antigravity, consumer repo | as Antigravity own, gated by governance scope | as left | as left |

Under `[Q1-NO]` every cell reads "advisory ceiling" regardless of the runner row.

## Follow-up

- Record the PO answers to Q1, Q2, Q6 and Q8 in the decision register, then pick the marked alternatives (section 0 of the draft).
- Allocate the number at acceptance (ADR-0069), add the index row in the same commit, update the ADR-0080 status line with a pointer, and apply the canon edits of parts B and C in the same commit sequence so no link points at a file that does not exist yet.
- Trigger: slice S0 probe verdicts recorded, then a shadow period (design Q3 suggests 3 sessions or 1 week) with would-have-blocked counts, then a PO decision on `advisory` and `enforce` per runner.
- Independent Critic review of this ADR before the PO gate (it changes an accepted ADR).
```

---

Proposed ADR index row (format read at `docs/adr/README.md:13-14` header and the ADR-0080 row at `:89`; status `proposed` rows are not in the index until acceptance, so the row is added in the acceptance commit with status `accepted` and the acceptance date):

```
| [XXXX](XXXX-fanout-governor-turn-end.md) | The fan-out governor may block an idle turn end, with a declare-instead-of-defy escape and an off/shadow/advisory/enforce ladder; amends ADR-0080 Decision 5 for the turn-end event only | accepted | YYYY-MM-DD |
```

Proposed ADR-0080 status-line pointer (status-level change only, `templates/adr.md:21-22`): append to the Status paragraph at `docs/adr/0080-parallel-dispatch-slicing-enforcement.md:11-15` the sentence "Decision 5 amended for the turn-end event by ADR-XXXX."

## B. Proposed text for `roles/elephant.md` EL-11 and EL-22

All "before" blocks are verbatim from `roles/elephant.md` as read. Headings stay unchanged (see part D: heading anchors are link-checked).

### B.1 EL-11, `roles/elephant.md:157-161`

Before:

```
### EL-11 (MUST) — Parallelism and WIP limits

- **Rule:** Max 3–5 concurrent goldfish; max 1 open human-gate item per project (new dispatches in that project wait for the verdict).
- **Why:** the PO's attention is the pipeline's bottleneck; more parallelism creates review queues, stale diffs and worktree corpses, not throughput.
- **Check:** Dispatch count; stale-worktree check in the close ritual.
```

After (pick one ceiling; everything else is common):

```
### EL-11 (MUST) — Parallelism and WIP limits

- **Rule:** Concurrency has a target and a ceiling, not a free choice. Keep the number of live goldfish at the target (4) whenever ready, disjoint slices exist (EL-22); never exceed the ceiling: [Q2-KEEP-5] 5 / [Q2-RAISE-6] 6. Host-load caps (default 4 load units on native Windows and WSL) may lower the effective target, never raise it. Max 1 open human-gate item per project (new dispatches in that project wait for the verdict).
- **Why:** the PO's attention is the pipeline's bottleneck; more parallelism creates review queues, stale diffs and worktree corpses, not throughput. The target exists because the opposite failure, idle slots while startable slices wait, costs wall-clock the PO has repeatedly had to reclaim by hand; the ceiling exists because beyond it review queues and host instability cost more than the throughput gained.
- **Check:** Dispatch count against target and ceiling; the fan-out governor's per-session telemetry (slot-idle minutes with ready slices, blocks, defied, declared defers) in the handover session block (EL-21); stale-worktree check in the close ritual.
```

Notes: the second clause of the Rule (max 1 open human-gate item) is deliberately untouched; `hold-po` slices are how work waiting on that gate is kept out of the ready set (ADR-XXXX Decision 2 rule 7). The 3-lower-bound of the old "3–5" disappears on purpose: a queue with fewer ready slices than the target is legal, and the governor then simply has nothing to name.

### B.2 EL-22, `roles/elephant.md:182-190`

Before (the three bullets that change, verbatim):

Rule, `roles/elephant.md:184`:
```
- **Rule:** Dependency-driven scheduling — at every dispatch point, partition pending work by dependency; ALL mutually independent work runs in the SAME turn (parallel dispatches or bundled fan-out). Sequential execution requires a NAMED dependency: a data dependency, overlapping file sets without isolation, or a gate. Preconditions for parallel WRITERS: disjoint file sets (evidence: 4 parallel goldfish in the shared tree, zero collisions) or worktree isolation. The concurrency guideline stays 3–5 concurrent subagents (EL-11). Legitimately serial: readiness → implementation per package, the ONE bundled wave-end critic, close.
```

Why, `roles/elephant.md:185`:
```
- **Why:** Pairs with the EL-05 one-turn-recon addendum: fewer reports to ingest (one-turn recon) plus less wall-clock (parallel-first) together mean fewer turns × smaller context — the rule must not be read as "more small dispatches, as long as they're parallel."
```

Check, `roles/elephant.md:186`:
```
- **Check:** The dispatch ledger (EL-21) shows independent work bundled or parallelized in the same turn; a sequential dispatch trail without a named dependency is a lifecycle-violation finding at close/critic review.
```

Revision, `roles/elephant.md:187`:
```
- **Revision:** up to 5 parallel goldfish is the ceiling WHEN file ownership is strictly disjoint (community sweet spot 3–5, agent-teams practice; this session's own Wave A ran 5 parallel goldfish on disjoint file sets, zero collisions); worktree isolation is the fallback when disjoint ownership cannot be achieved. Parallelizing dependent or same-file work is an official anti-pattern, never a scheduling choice — such work stays in the serial list above.
```

After:

Rule (only the concurrency sentence changes; common to both Q2 answers because the number now lives only in EL-11):
```
- **Rule:** Dependency-driven scheduling — at every dispatch point, partition pending work by dependency; ALL mutually independent work runs in the SAME turn (parallel dispatches or bundled fan-out). Sequential execution requires a NAMED dependency: a data dependency, overlapping file sets without isolation, or a gate. Preconditions for parallel WRITERS: disjoint file sets (evidence: 4 parallel goldfish in the shared tree, zero collisions) or worktree isolation. The concurrency target and ceiling are those of EL-11. Legitimately serial: readiness → implementation per package, the ONE bundled wave-end critic, close.
- **Queue duty:** For a feature with an active plan, record the slicing of pending work yourself as the slice queue `specs/<feature>/slice-queue.json`, edited only through the `slice-queue.mjs` command shipped under the plugin root: one entry per slice with declared write scope, dependencies, tier, commit mode and load class. Slicing stays your design-phase judgment and is never delegated (EL-16); the queue only writes it down where a machine can check disjointness and keep free slots filled. Shared surfaces (the state file, the backlog ledger, the ADR index, handover files) appear in no slice's write scope; you write them alone, after the slices land. Under the amended ADR-0080 Decision 5 (ADR-XXXX) a fan-out governor reads the queue at the end of your turn.
- **Declare instead of defy:** When the governor names ready slices and free slots at the end of your turn, either dispatch them in ONE message or record why not as a one-line durable declaration: `defer <id> --reason "<one line>"`, `hold <id>` (work that waits only on the PO), or `depend <id> <dep>` (a named dependency). A declaration is never refused and is auditable; ending the turn silently while ready slices and free slots exist is the one choice that is not free. [Q6-A] You may also record a bounded pause (hard maximum 4 hours, attributed `by: elephant`). [Q6-B] Only the PO's configuration switch pauses fan-out; you have no pause command.
- **Why:** Pairs with the EL-05 one-turn-recon addendum: fewer reports to ingest (one-turn recon) plus less wall-clock (parallel-first) together mean fewer turns × smaller context — the rule must not be read as "more small dispatches, as long as they're parallel." Slice size follows the EL-25a package budget, not a quota: the governor keeps free slots filled with slices the work already has, it never asks for more slices than the work contains.
- **Check:** The dispatch ledger (EL-21) shows independent work bundled or parallelized in the same turn; a sequential dispatch trail without a named dependency (a declared `depend`, `defer` or `hold`) is a lifecycle-violation finding at close/critic review. A turn end with ready slices, free slots and no declaration is [Q1-YES] blocked by the governor in `enforce` mode and in any case [Q1-NO] surfaced by the governor as an advisory message and in any case a lifecycle-violation finding at close/critic review; `defer`/`hold` declarations without a named reason, or in numbers out of proportion to the queue, are an audit finding too.
```

(`[Q1-YES]` and `[Q1-NO]` in the Check bullet are alternatives, not a sequence: keep exactly one of the two phrases and drop the tag.)

Revision (the ceiling is no longer restated here; the evidence parenthetical is historical and untouched):
```
- **Revision:** the EL-11 ceiling holds WHEN file ownership is strictly disjoint (community sweet spot 3–5, agent-teams practice; this session's own Wave A ran 5 parallel goldfish on disjoint file sets, zero collisions); worktree isolation is the fallback when disjoint ownership cannot be achieved. Parallelizing dependent or same-file work is an official anti-pattern, never a scheduling choice — such work stays in the serial list above.
```

Unchanged on purpose: the two shared-index Revisions (`roles/elephant.md:188-189`) and the shared-non-code-files bullet (`:190`). They are the machine-checked `commitMode` rules of the queue (design section 3.7), not rules to loosen.

Tension surfaced for the PO (not decided here): the PO's 2026-10-05 requirement asks for "many small slices"; the existing Why line (`roles/elephant.md:185`) says the rule "must not be read as 'more small dispatches, as long as they're parallel.'" The proposed Why reconciles them by tying slice size to EL-25a (`roles/elephant.md:213`: split a package of more than about 50 tool uses, more than about 8 to 9 files, or more than one complex topic) rather than to a quota. If the PO wants a stronger "small by default" rule, that is a separate wording decision.

### B.3 Third place the number lives (found while reading)

`harness/checklists/goldfish-dispatch.md:12` restates the limit (verbatim): "- [ ] Parallel limit 3–5 (up to 5 when file ownership is strictly disjoint, EL-22) goldfish respected; worktree isolation when overlap is unavoidable; never parallelize dependent/same-file work; WIP rule: max 1 open human-gate item per project (condition A11); worktree isolation MANDATORY from 3+ parallel goldfish committing to the same tree — disjoint file ownership does not protect the shared git index (EL-22)". The design names only EL-11 for Q2; this checklist line and the two number mentions in EL-22 (`roles/elephant.md:184`, `:187`) are the other homes. Proposed replacement of the first clause: "- [ ] Concurrency within the EL-11 target and ceiling ([Q2-KEEP-5] ceiling 5 / [Q2-RAISE-6] ceiling 6) respected; ready slices dispatched or declared (EL-22); worktree isolation when overlap is unavoidable; ..." with the rest of the line unchanged.

## C. Proposed text for `docs/operating-model.md`

The dispatch section has two relevant places. The file is bilingual; only the English part above the DE-reference marker is authoritative (the German mirror of the Dispatch step sits at `docs/operating-model.md:803`, see part D). The proposed English text avoids the three patterns the consumer-document check rejects (a literal source-checkout `node plugins/pipeline-core/...` command, the phrase "this repository/checkout/worktree", the local-marketplace plugin selector), because `docs/operating-model.md` is on that check's list (`harness/scripts/check-doc-contracts.mjs:80-114`, patterns at `:124`, `:130`, `:131`).

### C.1 Dispatch briefing fields, `docs/operating-model.md:109-110`

Before (verbatim):

```
failure), and **Dispatch metadata** (ruleset SHA, model/effort and
justification, worktree, profile, tool budget). The concrete
```

After:

```
failure), and **Dispatch metadata** (ruleset SHA, model/effort and
justification, worktree, profile, tool budget and, where a slice queue
exists, the slice id and the declared write scope or `none` for a read-only
dispatch). The concrete
```

Sequencing: this line describes template field 6, which changes with slice S7 (`templates/prompts/goldfish-task.md`, design section 6). Apply C.1 in the same commit sequence as the template edit, not before.

### C.2 Step 5 "Dispatch", `docs/operating-model.md:238-240`

Before (verbatim):

```
5. **Dispatch.** Give a Goldfish one outcome, exact context paths, DoD checks,
   prohibitions, stop conditions and route metadata. Independent tasks may run
   in parallel when their files and state do not conflict.
```

After (the paragraph at `:242-248`, "The Elephant SHALL treat an absent early progress message as neutral", stays as it is):

```
5. **Dispatch.** Give a Goldfish one outcome, exact context paths, DoD checks,
   prohibitions, stop conditions and route metadata. Independent tasks run in
   parallel when their files and state do not conflict, and free slots are kept
   filled: the Elephant records the slicing of pending work in a slice queue
   (`specs/<feature>/slice-queue.json`, edited through the `slice-queue.mjs`
   command shipped under the plugin root), within a concurrency target and
   ceiling (EL-11). At the end of a turn a fan-out governor compares ready
   slices with live dispatches and names the next slices to dispatch when slots
   are free. Disagreement is declared, not silent: deferring a slice, holding it
   for the PO or recording a dependency is a one-line durable queue edit, while
   ending the turn silently with ready slices and free slots is not free. The
   governor runs in a mode ladder (`off`, `shadow`, `advisory`, `enforce`;
   default `shadow`). [Q1-YES] Only in `enforce` does it block, and only the end
   of a turn, never a dispatch or any other tool call (ADR-XXXX, amending
   ADR-0080 Decision 5 for that one event). [Q1-NO] It never blocks; its
   ceiling is `advisory` (ADR-XXXX). [Q8-IN] At dispatch time the dispatch guard
   checks the declared write scope against live slices under the same ladder
   and, in `enforce`, refuses a dispatch whose scope overlaps a live slice.
```

(`[Q1-YES]` / `[Q1-NO]` and `[Q8-IN]` are alternatives to be resolved and their tags removed; under `[Q8-OUT]` drop the last sentence.)

Sequencing: the link-checked references and the named command must exist when this lands: ADR-XXXX is added in the same commit, and `slice-queue.mjs` (slice S4) must be shipped first (see part D, reference-path check, unread internals).

## D. Doc-contract checks and generated blocks the canon edit will touch

Read means the file or lines were read in this dispatch; "named only" means the verify step name was read in `harness/scripts/verify.mjs` but the check's internals were not. Verify step names and lines are from `harness/scripts/verify.mjs`. On this native Windows host never run the full Verify: run each check below as a targeted single file in WSL or a disposable clone.

| # | Check or generated block | File and lines read | What the canon edit does to it | Status of reading |
|---|---|---|---|---|
| D1 | Generated role-prohibitions block in the pipeline-start skill | `harness/scripts/generate-elephant-role-prohibitions.mjs`: derives from `roles/elephant.md` into `plugins/pipeline-core/skills/pipeline-start/SKILL.md` between `START_MARKER` (:94) and `END_MARKER` (:95); `INCLUDED_EL_IDS` (:98) is EL-01, 02, 03, 04, 16, 18, 19, 34, 35; `EXCLUDED_EL_IDS` maps EL-11 (:113) and EL-22 (:117) to `DISPATCH_PIPELINE_DUTY` | As read, EL-11 and EL-22 are excluded ids, so editing their text should not change the generated block bytes. The proposal adds no new EL id (a new id would have to be classified in `INCLUDED_EL_IDS` or `EXCLUDED_EL_IDS`). | Read for the lines cited; the check/`--check` mode and the test internals were not read. TODO (not reached): confirm at apply time that the generator reports no drift. |
| D2 | `generate-elephant-role-prohibitions-tests` | verify step, `harness/scripts/verify.mjs:869` (`harness/scripts/generate-elephant-role-prohibitions.test.mjs`) | Pins the SKILL block against the generator output; red if D1 drifts. | Named only. |
| D3 | `doc-contract-check` and `doc-contract-tests` | verify steps `harness/scripts/verify.mjs:506` (tests) and `:508` (check); `harness/scripts/check-doc-contracts.mjs:3-9` (checks tracked Markdown links and anchors plus handover authority) | Heading text of EL-11 and EL-22 must stay unchanged so heading anchors keep resolving; any new Markdown link (for example to ADR-XXXX) must resolve in the same commit; this draft file itself is scanned once tracked, which is why it carries no Markdown links. `STATEFUL_DESIGN_SURFACES` includes `roles/elephant.md` and `STATEFUL_DESIGN_OPERATIVE_HEADINGS` includes the EL-07 heading (`check-doc-contracts.mjs:31-35`): the edit must not touch the EL-07 section. | Read for the lines cited; the rest of the 140+ line file was not read. |
| D4 | Consumer-document rules inside the doc-contract check | `harness/scripts/check-doc-contracts.mjs:80-114` (`CONSUMER_OPERATION_DOCUMENTS`, includes `docs/operating-model.md` at :111 and `docs/parallel-work.md` at :104), `:124` (`SOURCE_CHECKOUT_COMMAND`), `:130` (`SOURCE_CHECKOUT_PERSPECTIVE`), `:131` (`LOCAL_MARKETPLACE_CONSUMER_SELECTOR`) | Part C text uses `<plugin-root>`-style wording and avoids all three patterns. | Read for the lines cited. How the patterns are applied per document was not read. |
| D5 | `docs/parallel-work.md` | named at `check-doc-contracts.mjs:104` only | May restate the concurrency limit or the "parallel when disjoint" rule (not checked). | TODO (not reached): grep it for the number and the dispatch rule before applying. |
| D6 | Vendored canon: `generate-vendored-canon-tests` and the generator | `harness/scripts/verify.mjs:769`; `harness/scripts/generate-vendored-canon.mjs:27` (`roles/*.md` auto-discovered, vendored under `plugins/pipeline-core/`), `:134` (`docs/operating-model.md` vendored), `:73-76` (completeness assertion: every tracked file under the vendored subtrees needs a manifest entry), `:46-51` and `:155-175` (ADRs cited by vendored files are vendored through the explicit `UNIVERSAL_ADRS` list) | `plugins/pipeline-core/roles/elephant.md` (confirmed by the EL-11/EL-22 file search) and the vendored operating model must be regenerated byte-for-byte after B and C: `node harness/scripts/generate-vendored-canon.mjs`, verify with `--check` (:81). Because EL-22 and the operating model will cite ADR-XXXX, the reachability rule suggests adding it to `UNIVERSAL_ADRS`. | Read for the lines cited. Whether ADR-0080 itself is in `UNIVERSAL_ADRS` was not read. TODO (not reached): confirm the list entry rule for ADR-XXXX. |
| D7 | `section-citation-check` and `section-citation-tests` | `harness/scripts/verify.mjs:511-512` | Part C renumbers no section and cites no section number, so no effect expected. | Named only; internals not read. |
| D8 | `reference-path-check` and `reference-path-tests` | `harness/scripts/verify.mjs:754-755` | Parts B and C name `specs/<feature>/slice-queue.json` and the `slice-queue.mjs` command; whether a named path must exist is unknown. Safe sequencing: land the canon edit after slice S4 ships the script. | Named only; internals not read. TODO (not reached). |
| D9 | `check-vendored-template-sync-tests` | `harness/scripts/verify.mjs:790` | Not triggered by S10 as drafted (no template edited here); it IS triggered by slice S7 (`templates/prompts/goldfish-task.md` field 6), which also drives C.1. | Named only. |
| D10 | Enforcement document generator | `harness/scripts/check-doc-contracts.mjs:18` (imports `MANIFEST_PATHS`, `checkEnforcementDocument` from `harness/scripts/generate-enforcement-doc.mjs`), `:74` (`docs/enforcement.md`) | Derived from manifests, not from role prose; not touched by S10. Slice S8 (hook registration) may require regenerating it. | Read for the lines cited only. |
| D11 | ADR index | `templates/adr.md:16-18` (index row MUST be in the same commit), `docs/adr/README.md:13-14` (table header), `:89` (ADR-0080 row) | New row (part A) plus the ADR-0080 status pointer. | Index-consistency check name not found in this pass. TODO (not reached): identify any index check before applying. |
| D12 | Handover checklist line | `harness/checklists/goldfish-dispatch.md:12` | Number restated; edit per B.3. No check name read for this file. | Read for the line cited. |
| D13 | Bilingual operating model | `docs/operating-model.md:803` (German mirror of the Dispatch step, found by search) | C.2 changes the English step; its German reference translation below the marker must be updated by the applying dispatch so the human reference does not drift. No German text is drafted here (ADR-0011, DoD of this dispatch). | Line located by search only; not read. |
| D14 | Decision register | `docs/state.md` (not read, out of scope) | The PO answers (Q1, Q2, Q6, Q8) belong in the register, which wins on conflict. Written by the Elephant only. | Not read by design. |

Files that carry the concurrency number or the EL ids and so are the complete edit surface found by the repository search for `EL-11` / `EL-22` (excluding the state archive): `roles/elephant.md`, `plugins/pipeline-core/roles/elephant.md` (vendored copy), `harness/checklists/goldfish-dispatch.md`, `harness/scripts/generate-elephant-role-prohibitions.mjs`, `docs/adr/0073-handover-rotation-extraction-archive-hard-size-gate.md` (historical ADR, not edited). The search covered `harness`, `plugins`, `templates`, `policies`, `guardrails`, `docs`, `roles` and `CLAUDE.md`; text that states the number without the EL ids (for example `docs/parallel-work.md`) was not searched, hence D5.

## E. Findings and open items for the PO

1. **Q8 (new).** Design section 3.4 treats the dispatch-time overlap refusal as covered by ADR-0080 Decision 3. The ADR text says it is "the one direction in which a hard block is legitimate" and in the same passage "not authorized here" (`docs/adr/0080-parallel-dispatch-slicing-enforcement.md:237-243`). Slice S7's `enforce` refusals therefore need an authorization that Q1 as asked does not give. This draft offers `[Q8-IN]` and `[Q8-OUT]`.
2. **Number in three places.** Q2 asks only about EL-11 but the limit is also written in EL-22 (`roles/elephant.md:184`, `:187`) and in `harness/checklists/goldfish-dispatch.md:12`. The draft collapses the number to one home (EL-11) plus the checklist.
3. **Shipped defaults vs answers.** `maxTarget: 6` fits `[Q2-RAISE-6]`; `pauseAuthorities` containing `elephant` fits `[Q6-A]` (section 0). The opposite answers need a config or a default change in slice S3.
4. **"Many small slices" vs EL-22 Why.** See the tension note after B.2.
5. **No design/canon contradiction found** that would stop this draft: EL-11 (`roles/elephant.md:159`), EL-22 (`:182-190`), ADR-0080 Decision 5 (`:394-435`) and the cited ADR lines say what the design claims, with the Q8 and number-location gaps above as omissions, not contradictions.
6. **Status.** Draft only. Independent review: pending. PO acceptance: open (Q1, Q2, Q6, Q8). No canon file was edited. Items marked `TODO (not reached)` in part D were not read within the dispatch budget.
