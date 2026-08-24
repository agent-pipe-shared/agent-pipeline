---
schema: pipeline.backlog-item.v1
id: pipeline.happy-path-turn-and-wall-clock-cost-is-not-externally-defensible
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-10
source: "PO, 2026-08-10, after reviewing two live greenfield happy-path tests: 'die pipeline nimmt durch ihre ineffizienz einfach zu viel zeit weg. Das ist so noch nicht extern vertretbar... Claude Code braucht jetzt 2h für das mini spiel mit push etc.'"
---

# A trivial happy-path run (one small HTML minigame, kickoff through push) costs ~2 hours wall-clock — not externally defensible yet

## Description

The PO ran two live greenfield happy-path tests on 2026-08-10 (Claude Code
and Codex) for a deliberately tiny scope: kickoff a small local HTML
minigame, implement it, get it reviewed, and push it. The Claude Code
session alone took roughly 2 hours end to end. Quality was noticeably
higher than in other comparable tests (see the separate EGM-dispatch
feedback from the same conversation) — this item is specifically about
wall-clock/turn cost, not about quality regressing. The PO's own framing:
this level of overhead is not yet externally defensible, and turn/manual-
command-search inefficiency needs to come down significantly before the
pipeline can be tested more broadly.

## Triggering situation

PO statement, 2026-08-10, made deliberately as a distinct, higher-priority
concern from the individual bug reports filed earlier the same session —
those are concrete defects; this item is about the AGGREGATE cost even
after those defects are fixed, and should be treated as its own focus area,
not assumed solved once the individual items close.

## Affected artifact

No single artifact — this is a cross-cutting cost problem. Concrete,
already-quantified contributors identified this same session via forensic
transcript review (see `references/transcript-forensics.md` for the
methodology used):

- **Kickoff CLI parameter discovery.** Before GF-092's fix, ~43% of the
  15-minute kickoff-to-implementation window in the Claude session was
  parameter-discovery detours (guessing `kickoff plan`/`kickoff promote`
  flags undocumented in `kickoff-design.md`), including two ad-hoc research
  subagent dispatches costing 132s/21 tool-uses/~50k tokens and
  188s/36 tool-uses/~83k tokens respectively, purely to reverse-engineer
  correct CLI syntax from source. GF-092 closed the specific documentation
  gap that caused THIS instance, but the pattern — an agent burning a
  subagent dispatch to discover correct invocation syntax instead of finding
  it in the loaded reference — is a general risk wherever a reference is
  incomplete, and nothing currently catches this class of gap before an
  agent hits it live.
- **Host-boundary command-relay cycles.** Before GF-094's fix, the Codex
  session spent ~6 turns purely on command-relay-and-fix cycling for two
  kickoff commands that should have taken one turn each, because the
  human-facing command text was unrendered/unquoted.
- **Multiple Critic re-review rounds.** The Codex session needed 3
  fix-and-re-review Critic rounds for one small feature, most driven by one
  root pattern (Verify defaulting to source-marker checks instead of real
  behavior — filed separately). Each round is a full fresh-context dispatch
  cycle, not a quick fix — this is probably one of the single largest time
  contributors in the 2-hour total, and is not yet quantified precisely.
- **Governance sequencing itself** (kickoff, promotion, PRD, Spec, plan
  submission, human plan approval, phase change, Verify evidence,
  threat-model commit) is deliberately NOT in scope for cost-cutting per the
  PO's own separate statement the same session ("das ist bewusst dafür ist
  die pipeline nicht gedacht") — the toy project's small size doesn't mean
  the governance steps themselves are the problem; the turn-cost problem is
  in HOW EXPENSIVE each step is to execute correctly (rediscovery, retries,
  re-review), not in the number of steps.

## Proposal

No fix designed yet — this needs its own scoped investigation, not a quick
patch, given it's a systemic cost problem rather than one defect. Candidate
starting points for whoever picks this up:
- Quantify precisely where the ~2 hours actually went (a full transcript
  time-accounting pass, similar to the forensic analyses already done this
  session but focused specifically on wall-clock/turn attribution per phase:
  kickoff, plan/design, implementation dispatch, Critic rounds, push).
  Without this, further optimization is guesswork.
- Treat "an agent had to burn a subagent dispatch or multiple retries to
  discover correct CLI syntax" as its own named defect class going forward
  (not just fixed reactively per-instance as GF-092/094 did) — possibly a
  standing check: before shipping a candidate, confirm every CLI surface an
  agent is expected to invoke during the happy path is fully and correctly
  documented in the reference an agent would actually load at that point.
- Investigate whether the Critic-round count (3 rounds for one small
  feature) can be brought down by raising the bar on what a Goldfash submits
  as "done" the first time (see the separate verify-authorship backlog item)
  rather than relying on Critic rounds to catch it after the fact each time
  — catching something on round 1 of 1 is far cheaper than catching it on
  round 1 of 3.
- Consider whether some of the fixed sequential steps (kickoff → promote →
  submit-plan → approve-plan → set-phase) could be safely collapsed for a
  profile that has already been fully decided, without weakening the actual
  gates, purely to remove round-trip count.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted — do the time-accounting pass first, before any
  optimization work.
- **Rationale:** PO, 2026-08-11: "A" of this item's own Proposal. Quantify
  precisely where the ~2h went via a full transcript time-accounting pass
  (kickoff, plan/design, implementation dispatch, Critic rounds, push),
  before picking any of candidates B (name "CLI-syntax rediscovery" as its
  own defect class), C (reduce Critic-round count by raising the bar on a
  Goldfish's first submission) or D (collapse fixed sequential steps for an
  already-decided profile).
- **Assignment (if accepted):** Unassigned — a research/forensics-tier
  dispatch once picked up; not started this session.
- **Date:** 2026-08-11

### Release-sweep disposition (2026-08-18)

- **Decision:** confirmed — queued for dispatch. The 2026-08-11 decision
  stands unchanged in scope: a dedicated research/forensics-tier dispatch
  performs the full transcript time-accounting pass (kickoff, plan/design,
  implementation dispatch, Critic rounds, push) before any of candidates
  B/C/D from the item's own Proposal are picked up.
- **Rationale:** this is a real investigative workload (a full transcript
  time-accounting pass), not a same-session doc fix, and not tied to any
  named still-open future sprint — queued for dispatch rather than left
  indefinitely unassigned.
- **Assignment:** next available research/forensics-tier dispatch; scope is
  the time-accounting pass specified in the 2026-08-11 Triage entry above.
- **Date:** 2026-08-18

## Progress/Findings, 2026-08-18 (dispatch NVA-W1-5, goldfish-deep)

Full transcript time-accounting pass performed against the raw session
transcript of the **Claude Code** happy-path test named in this item's own
Description (the "~2 hours end to end" run) — the only one of the two
2026-08-10 runs whose exact wall-clock figure was ever quoted. Source file:
`/home/skar667/.claude/projects/-home-skar667-src-Rune-Test1-Claude-054-44/c4750d7f-1f6a-4596-b970-3e382310c891.jsonl`
(911 lines; not part of this repo, located via the Elephant session
04ecdb04-1d90-4060-aea0-bfc47005b631 that filed this item, which had already
run one partial forensic subagent pass covering only the kickoff window —
see that transcript's line 9483, "Forensic Transcript Analysis — Claude
Pipeline-Start Kickoff Run", the source of this item's own "Affected
artifact" bullet 1). This pass covers the phases that subagent did not:
plan/design onward through push. **The corresponding Codex session was not
re-analyzed in this pass** (out of scope/budget here) — its "3 Critic
rounds" figure already in this item's Description stands as previously
reported, unverified against its own transcript by this dispatch.

**Session bounds:** first transcript line 1 timestamp `2026-08-10T05:30:08Z`;
last substantive content, the `away_summary` at transcript line 910,
`2026-08-10T07:08:01Z`. Total wall-clock: **1h 37m 53s (5,873s)** — close to,
but measurably under, the PO's own "roughly 2 hours" recollection. The run
ended with the push **abandoned, not completed**: transcript line 890 shows
the PO, asked to choose between a full Continuity-close ceremony or
downgrading `gates.push_approval` to `chat`, instead asking for a lighter
override ("können wir das nicht anders mit override freigabe von mir
machen?"); the Elephant's own next substantive message (line 907, "Verstanden,
wir brechen den Push hier ab") confirms the push was abandoned at that point
(the PO's own explicit abort instruction between these two points was not
independently located within the transcript segments read for this pass) —
the Elephant then wrote out a 13-point German problem list for a future fix
session (line 907) rather than finishing the push.

### Phase-by-phase breakdown (evidence: transcript line numbers + timestamps)

| Phase | Window (transcript timestamps) | Duration | Share of pipeline-attributable time |
|---|---|---|---|
| **Kickoff** (session start → `kickoff apply` succeeds) | line 1 (`05:30:08`) → line 151 (`05:36:16`, `kickoff apply --activate` succeeds) | 368s (6m08s) | 7.9% |
| **Plan/design** (design-package write + `kickoff promote plan/apply` + `set-phase implementation` + Goldfish-briefing research) | line 151 (`05:36:16`) → line 256 (`05:52:40`, Goldfish dispatch launched) | 984s (16m24s) | 21.1% |
| **Implementation dispatch** (async Goldfish run + post-impl verification + commit split) | line 256 (`05:52:40`) → line 548 (`06:22:22`, second/final commit) | 1782s (29m42s) | 38.3% |
| **Critic rounds** (dispatch-preflight admission + one Critic dispatch, PASS) | line 548 (`06:22:22`) → line 621 (`06:31:41`, Critic PASS notification) | 559s (9m19s) | 12.0% |
| *(excluded from the above: PO response latency — game playtest + feedback, not agent/pipeline time)* | line 621 (`06:31:41`) → line 655 (`06:48:56`) | 1035s (17m15s) | n/a |
| **Push** (SSH/remote/branch/threat-model setup through the abandoned approval chain) | line 655 (`06:48:56`) → line 907 (`07:04:57`, push abandoned, problem-list written instead) | 961s (16m01s) | 20.6% |
| *(excluded: final wrap-up prose)* | line 907 (`07:04:57`) → line 910 (`07:08:01`) | 184s (3m04s) | n/a |

Sum of all seven rows = 5,873s, matching total session wall-clock exactly
(cross-check, not an estimate). Of the 5,873s total, **4,654s (77m34s, 79.3%
of the session) is the five named pipeline-mechanics phases**; 1,035s
(17.6%) is PO response latency (excluded from any "pipeline cost" framing
per this item's own Proposal); 184s (3.1%) is the final wrap-up message.

### Per-phase evidence detail

- **Kickoff (368s).** Two guard rejections plus one 132,059ms/21-tool-use
  background research subagent (already quantified in this item's own
  "Affected artifact" bullet 1; independently re-confirmed here against the
  same transcript: line 91 `05:32:41` first flawed `kickoff plan` attempt
  missing `--language` and carrying invalid `--intent`/`--profile`; line 140
  `05:36:08` corrected attempt succeeds; line 151 `05:36:16` `kickoff apply
  --activate` succeeds).
- **Plan/design (984s).** Dominated by two costs already partly named in
  this item: (a) the 188,375ms/36-tool-use `Explore` subagent dispatched at
  line 167 (`05:37:15`) to reverse-engineer `kickoff promote`'s undocumented
  `--id`/`--plan-path` constraints, and (b) a **third**, previously
  unquantified research subagent (`Find Goldfish dispatch briefing
  requirements`, line 242, `05:47:02` → line 255, `05:52:38` = **5m36s**,
  dispatched to determine the 6-field briefing format, the ruleset-SHA
  mechanism, and whether a Goldfish-specific preflight script exists) — the
  same "burn a subagent to discover correct invocation syntax" pattern named
  in this item's own Proposal (candidate B), now confirmed to recur a third
  time in the same session, this time for the Goldfish-dispatch step itself,
  not just the CLI. Between these two research detours, the agent also wrote
  the full design package (PRD/spec/design-input.md, in German) and ran
  `kickoff promote plan`/`apply` (line 200 `05:44:00`, line 209 `05:44:05`).
- **Implementation dispatch (1782s = 29m42s).** The Goldfish dispatch itself
  (`pipeline-core:goldfish-deep`, async/background, launched line 255-256
  `05:52:40`) ran for **1,233,629ms (20m34s)** of actual subagent execution
  (task-notification duration_ms, confirmed present at transcript lines
  281/283) — by far the single largest contiguous block in the whole
  session, but this is background/parallelizable time, not agent-turn
  friction: the Elephant was not blocked on it in the sense of burning its
  own tool calls. After the Goldfish result landed (files confirmed present
  at line 287, `06:13:24`), the remaining ~9m of this phase went to: an
  automated Playwright browser playtest (86,631ms ≈ 1m27s, duration_ms at
  lines 425/427) plus manual `node --check`/DOM verification, then git
  staging/commit. **A concrete, previously-unnamed cost inside this phase:**
  the agent made ONE bundled commit first (line 485, `06:19:55`), then
  discovered mid-flow that bundling pipeline scaffolding with feature code
  would force the heavier T1 Critic-review tier, and had to undo the commit,
  unstage, and re-split into two separate commits (lines 511-548, ending
  `06:22:22`) — a rework cycle costing roughly 2-3 minutes that a
  "commit pipeline scaffolding and feature code separately" note in the
  onboarding/dispatch guidance would avoid outright (this item's own
  Proposal candidate B's "named defect class" framing applies here too, not
  just to CLI-syntax rediscovery).
- **Critic rounds (559s = 9m19s).** **Only one Critic round occurred in this
  session, and it PASSED with no findings** (transcript line 621, dispatch
  `/pipeline-core:critic-review`, verdict `PASS`, `duration_ms: 430176`
  ≈7m10s, `tool_uses: 43`). The 3-Critic-round figure in this item's own
  "Affected artifact" bullet 3 is specific to the **Codex** session, not
  this Claude one — conflating the two would overstate this session's
  Critic-round cost. Before the single successful dispatch, `critic-dispatch-
  preflight.mjs`'s evidence-JSON/binding requirement rejected two earlier
  attempts (transcript lines 569-612, matching this item's already-known
  GF-094-adjacent friction and the PO's own bug-list item 9) — a ~1m32s
  admission-struggle cost, small compared to the review itself.
- **Push (961s = 16m01s, ended in total failure — not completed).** This is
  the single most consequential finding of this pass: **16 minutes of
  session time went into the push chain and it never succeeded.** SSH-key
  discovery, remote/branch setup, and threat-model-doc creation+commit took
  the first ~5m19s (lines 655-726, `06:48:56` → `06:54:15`) without
  incident. The remaining ~10m42s (lines 726-907, `06:54:15` → `07:04:57`)
  was pure approval-chain friction, matching this item's own quoted PO bug
  list items 10-13 verbatim against the transcript: a stale/wrong
  `poKeyDirectory` in machine-scoped config (line 691 area), a feature-id
  format incompatibility between the kickoff-generated id
  (`2026-08-10_amon-sul`, matching `SAFE_FEATURE_ID`) and
  `authorize-critical --feature-id`'s stricter regex (forcing an invented
  alias, `amon-sul`, just to sign), `approve-push` then failing with
  `CRITICAL-PROOF-AUTHORITY` (line 855 area, `06:59:41`) because the signed
  alias no longer matched `state.activeFeature.id`, and the only two
  remedies offered — a full Continuity close-gate ceremony, or downgrading
  `gates.push_approval` from `signature` to `chat` — both of which the PO
  explicitly balked at (line 890, `07:02:21`: "können wir das nicht anders
  mit override freigabe von mir machen?", i.e. asking for a lighter-weight
  override that the pipeline did not offer). The session ended by
  **abandoning the push** and writing a fix-request list instead (line 907).
  **This means the ~2-hour session bought zero working push** — every phase
  before it (kickoff through Critic) delivered a working, reviewed,
  committed feature, but the last 16 minutes were pure loss from an external
  perspective: nothing shipped.

### What this confirms/corrects relative to this item's own Proposal and prior claims

- **Confirms** candidate B's premise (CLI-syntax/mechanism rediscovery as a
  recurring, named-worthy defect class): it recurred a **third** time in
  this same session (Goldfish-dispatch-briefing research, 5m36s,
  previously unquantified), not just the two instances already named.
- **Corrects** an implicit conflation risk in this item's own "Affected
  artifact" section: the "3 Critic rounds" figure is Codex-only: this
  Claude session had exactly one Critic round, which passed cleanly.
  Candidate C ("raise the bar on a Goldfish's first submission" to cut
  Critic-round count) has **no supporting cost to cut** in this specific
  session — its Critic cost (9m19s including preflight friction) is
  already close to minimal for a single clean round.
- **Surfaces a cost class this item's Proposal did not previously name**:
  the push-approval chain itself, when it hits a real defect (the
  feature-id format mismatch, independently already filed and partly
  addressed per recent backlog history —
  `backlog/items/2026-08-10-agent-never-asks-po-for-key-directory-invents-one-instead.md`
  and related items), can consume as much wall-clock as the entire
  kickoff+plan/design phases combined (961s vs. 1352s) and, unlike every
  other phase in this session, deliver **no completed outcome at all**.
  Candidate D (collapsing fixed sequential steps) would not have prevented
  this specific loss — the steps ran once each as designed; the cost was
  from genuine failures inside those steps, not from redundant round-trips.
- **Surfaces a second, previously-unnamed rework cost**: the T1-tier-
  triggering commit-bundling mistake (bundling pipeline scaffolding with
  feature code, forcing an undo-and-resplit) inside the implementation-
  dispatch phase, worth roughly 2-3 minutes here but structurally avoidable
  with an explicit "commit scaffolding and feature code separately" note
  surfaced to the dispatching agent before the first commit, not after.

### Recommendation for the next session (not designed here — out of this dispatch's scope)

Given the quantified breakdown above, the two largest concrete
opportunities are (a) the push-approval chain's feature-id-format
mismatch and its "no lightweight override" gap (16m01s, zero completed
outcome), and (b) the recurring rediscovery-subagent pattern, now confirmed
three separate times in one session (kickoff-plan flags, kickoff-promote
constraints, Goldfish-dispatch briefing mechanics) at a combined cost of
132s + 188s + 336s ≈ 656s (~11m) of subagent research alone. Candidates B
and D from this item's own Proposal are the closest existing framing for
these two findings respectively; a new, not-yet-filed defect class for the
push-approval feature-id/override gap may also be warranted, but designing
either fix is explicitly out of scope for this investigation dispatch.

### Fix designs, 2026-08-19

**(a) is already fixed — confirmed, not redesigned.** Before designing a
new fix, checked whether the root cause still exists: `git log -S` on
`PROMOTION_FEATURE_ID_DOWNSTREAM` (`plugins/pipeline-core/lib/
onboarding-continuity.mjs:156`) shows the fix landed same-day as the
incident, commit `8ae0de01` (2026-08-10T09:07:43+02:00, ~3 minutes after
the transcript's push-abandonment moment at 07:04:57Z), dispatch `GF-099`.
`promotionInput()` (`onboarding-continuity.mjs:4043-4050`) now rejects a
feature id at `kickoff promote` time — the one point it is still
choosable — if it would later fail `po-human-approval.mjs`'s stricter
`^[a-z][a-z0-9-]{0,63}$` shape (uppercase, `_`, `.`, `:`, or >64 chars),
with a message naming the constraint and the exact reason
("...it will later be rejected at push-approval otherwise"). Separately,
kickoff's own current default feature-id generator already produces a
compliant id unprompted (`n${goalSha256.slice(0,16)}` — lowercase, starts
with a letter, hex digits only), so the specific `2026-08-10_amon-sul`
failure mode (date-prefixed, underscore-containing) cannot recur from the
default path either. Regression coverage: `onboarding-continuity.test.mjs`
"promotion refuses a feature id that would later fail push-approval's
stricter shape" (6 rejection shapes + the kickoff- prefix distinction +
a no-regression positive case), confirmed passing live just now
(`node plugins/pipeline-core/lib/onboarding-continuity.test.mjs`,
210/210). **No further design or implementation needed for (a);** the
"no lightweight override" framing in this item's own Recommendation
line no longer applies — there is nothing left to override once the bad
id can never be chosen. Whoever picks up implementation should verify
this is still true (re-run the same test file) rather than re-designing.

**(b) needs a real fix — two-part design, ready for direct
implementation, no further PO input needed:**

1. **Add a "don't rediscover — here's where the answer already is"
   pointer table to the happy-path guidance an agent actually has loaded
   at the moment it first needs each mechanism.** Confirmed the gap is
   real: `rg -n "goldfish-task.md" harness/session-bootstrap.md
   plugins/pipeline-core/skills/pipeline-start/SKILL.md` returns zero
   hits — the canonical Goldfish-dispatch template
   (`templates/prompts/goldfish-task.md`) is referenced only from
   `docs/operating-model.md` §2 (the normative core, not the bootstrap
   happy path an agent is actually following turn-to-turn). This is the
   same shape of gap GF-092/GF-094 already fixed for `kickoff plan`/
   `kickoff promote` flags in `kickoff-design.md` — apply the identical
   pattern to the third confirmed instance: add one short line to
   `plugins/pipeline-core/skills/pipeline-start/SKILL.md`'s "Kickoff
   intake and the durable design package" section (or the "Gate
   authority and autonomous continuation" section, wherever the first
   Goldfish-dispatch instruction already lives), naming
   `templates/prompts/goldfish-task.md` directly as the dispatch-briefing
   source, and `workflow-dispatch.md` for the Workflow-tool variant
   (already loaded lazily per the skill's own "Typed lazy loading"
   section — just needs the SKILL.md prose to say "use these paths",
   not leave the agent to find them). No new mechanism, no design
   latitude — a doc pointer, mirroring an already-proven fix pattern.
   Estimated cost: well under the 5m36s it cost the observed session to
   discover this from source.
2. **(Secondary, larger, NOT designed in full here — flag as a
   possible follow-up, not a requirement of this fix.)** Proposal
   candidate B's second half ("a standing check that every CLI surface
   an agent is expected to invoke during the happy path is fully and
   correctly documented") would need its own scoped design pass — e.g.
   a lint comparing each script's declared argv flags against whether a
   loaded reference doc names them — genuinely larger scope (new
   verify-adjacent tooling, false-positive risk across every CLI in the
   repo) and not needed to close the 3 confirmed instances found so far.
   Recommend NOT bundling this into the same dispatch as fix 1 above;
   treat as a separate, lower-priority item if a fourth rediscovery
   instance recurs after fix 1 lands.

**Recommendation:** dispatch fix (b)-1 alone (mechanical, bounded, one
doc edit) to a `goldfish-mechanic`/`goldfish-implementor` tier; do not
redesign or re-dispatch (a) — it is closed in substance already, only
this item's own status needs to catch up once someone confirms the
above.

## Triage addendum, 2026-08-24

- **Decision:** closed-in-substance, both remaining pieces confirmed done.
- **Rationale:** (a) already closed in substance — no further action. (b)-1
  turns out to be **already fixed too**: before applying it, checked the
  current file rather than assuming the 2026-08-19 design was still
  unimplemented (this repo's own re-verify-before-acting discipline) —
  `plugins/pipeline-core/skills/pipeline-start/SKILL.md:287-289` already
  names `templates/prompts/goldfish-task.md` directly, landed same-day as
  the design in commit `23b92d6f` ("docs(pipeline-start): point Goldfish
  dispatch to its briefing template", 2026-08-19). No edit needed or made
  this session. (b)-2 remains explicitly deferred — its own lower-priority
  item, only if a fourth rediscovery instance recurs.
- **Assignment:** (a) and (b)-1 both closed in substance, no outstanding
  action. (b)-2 unassigned, conditional.
- **Date:** 2026-08-24

## Closure, 2026-08-24

Formally closed. Every concrete piece named in this item's Description and
Proposal now has either a confirmed landed fix ((a) commit `8ae0de01`
verified live via `git log -S`; (b)-1 commit `23b92d6f`, confirmed
pre-existing on re-check rather than assumed) or an explicit, still-valid
defer ((b)-2, deliberately not designed, conditional on a fourth
rediscovery instance recurring — its own text already frames it as "a
possible follow-up, not a requirement of this fix"). No outstanding
required work remains against this item's own acceptance framing.
