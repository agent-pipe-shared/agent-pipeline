# Recon: remaining cause coverage, pipeline.elephant-main-context-spent-on-wake-ups-and-inline-reads

Candidate 03a8aa27c. Read-only recon, no patch. Sources: backlog item `backlog/items/2026-10-05-elephant-main-context-spent-on-wake-ups-and-inline-reads.md`,
`specs/sprint-alfred-epic/evidence/ac168-enforcement-2026-10-25/README.md`, commit 0b80f4f09, `roles/elephant.md` section "Main-context economy" (line 124-132).

## Causes the item lists
Item description names five structural causes (plus the 26 / 22 / 5.4 / 10 % measured shares): wake-up loops, delegation costlier than inline work,
refused Explore/Plan dispatch, guard false positives (refusals), hand-written briefings. `CAUSES` in
`plugins/pipeline-core/scripts/elephant-context-measure.mjs:24` mirrors exactly these five keys. Acceptance: (a) a repeatable measurement tool (C1) - exists;
(b) one enforcement-layer measure per cause, each with a before/after measurement.

## (1) Cause -> enforcement -> test

| Cause key | Guidance-layer measure | Hook/code enforcement today | Test |
|---|---|---|---|
| wakeUpLoops | `roles/elephant.md:128` (+ plugin copy) | PARTIAL: `stop-fanout.mjs` fingerprint marker (`advisoryMarker` line 83, suppress at about line 209-215) drops only an UNCHANGED fanout advisory at consecutive Stops. Goal and task-notification wake-ups and stop-suggest are not touched by this change (stop-suggest has its own older dedupe, hooks.json hook 6). | `hooks/stop-fanout.test.mjs:151-175` (unchanged second Stop silent, changed advice re-emits, unsafe marker fails open); pin `lib/pins/elephant-main-context-spent-on-wake-ups-and-inline-reads.test.mjs` wakeUpLoops case (synthetic transcript only) |
| guardRefusals | `roles/elephant.md:131` | PARTIAL: `lib/guard/shell-grammar.mjs:894` `isSafeExactGrepArgs` now admits one bounded `-m/--max-count` (1..500); refusals still carry typed retry actions only for some shapes (agent-obligations 1b) | `lib/guard/grep-max-count-read.test.mjs` (+36 lines); pin guardRefusals case (synthetic) |
| exploreOrPlanRefused | `roles/elephant.md:130` | NONE as a measure. `guard-dispatch.mjs:209-215` only admits built-in Explore for transport direct; no change to the refusal text or a one-retry limiter | `hooks/guard-dispatch.test.mjs:231-265` pins advisor binding of Explore only, not the retry behaviour; pin exploreOrPlanRefused case (synthetic) |
| delegationCost | `roles/elephant.md:129` | NONE (guidance only; role text states "a hook-level refusal for any cause is a separate guard change") | pin delegationCost case + costlierThanInline test (synthetic) |
| handWrittenBriefings | `roles/elephant.md:132` | PARTIAL, adjacent not causal: `guard-dispatch.mjs:44,176` WARNING for unresolved Workflow prompts and a template-use repair message (line 1063); the six-heading template-shape check lives only in the measurement tool, not in a refusal | pin handWrittenBriefings case (synthetic); `guard-dispatch.test.mjs` covers the warning path |
| inline reads (22 % share) | no own cause key; folded into guardRefusals only via grep admission | the C1 tool has no inline-read cause | none |

All five pin cases and the key-parity test use synthetic transcripts, so each proves the measurement tool classifies its cause, not that a hook reduced it.
README of the evidence package confirms: synthetic advice 2 to 1, refusal 1 to 0; full guard-dispatch suite still RED with carrier-policy expectation conflicts (pre-existing, not erased).

## (2) Uncovered causes

- wakeUpLoops, goal and task-notification wake-ups: **live-measurement-only** (whether a host injects them and how the model replies cannot be forced by a hook; they arrive as user turns). The stop-hook share of the wake-ups other than fanout (stop-suggest, other Stop hooks) is **code-fixable-here** only if a second Stop emitter is shown to re-fire identical text; not verified in this recon.
- exploreOrPlanRefused: **code-fixable-here** (a guard-side retry limiter or a refusal text that names the single admitted alternative) - needs a change to protected/guard-dispatch surface, check TP list before slicing.
- guardRefusals false positives beyond bounded grep: **live-measurement-only** to find which spellings real sessions get refused on; each individually found spelling is code-fixable-here.
- delegationCost: **live-measurement-only** (judgement about what a dispatch replaces; no hook sees "actions replaced").
- handWrittenBriefings: **code-fixable-here** (shape check of Agent prompt against the six goldfish headings or critic headings, as a WARNING, mirroring the existing Workflow warning at guard-dispatch.mjs:176).
- inline reads: **live-measurement-only** (no cause key; bounded grep is the only mitigation).
- The 10 % admin target and the before/after token measurement: **live-measurement-only** (C1 reports `liveHostTargetQualified:false`, `sourceClassification:unverified-input`).

## (3) Minimal slices for code-fixable causes

A. handWrittenBriefings warning
- Files: `plugins/pipeline-core/hooks/guard-dispatch.mjs`, `hooks/guard-dispatch.test.mjs`.
- RED cases: (i) Agent call, subagent_type goldfish-implementor, prompt lacking the six headings, emits a WARNING (not a refusal) naming goldfish-task.md; (ii) the filled template emits none; (iii) Critic prompt without the review headings warns; (iv) non-pipeline agent types unaffected.
- Subject: `feat(guard): warn when a Goldfish or Critic dispatch prompt is not template-shaped`.
- Caveat: guard-dispatch suite is already RED on carrier-policy; baseline failing-name set must be compared.

B. exploreOrPlanRefused retry limiter
- Files: `guard-dispatch.mjs` (or a new small lib), its test.
- RED cases: first Explore refusal carries the single admitted next route; an identical retry in the same session is refused with a pointer to the backlog finding rather than the full text.
- Subject: `fix(guard): name the admitted route on a refused Explore or Plan dispatch and stop unchanged retries`.
- Needs session-keyed state; decision needed whether a stateful guard is wanted, so this one is lower confidence.

C. (optional) second Stop emitter dedupe - only after a probe shows stop-suggest or another emitter repeats identical text; files `hooks/stop-suggest.mjs` and its test.

## (4) What the row needs to be called technically delivered

Technically delivered (stage 75 per the matrix rule) = one hook-level measure with a non-synthetic test per code-fixable cause (slices A and B, plus C if the probe confirms), the pin file extended so each cause names its enforcement site, and the existing guard-dispatch RED set unchanged or reduced.
Explicitly OPEN and kept as an agent entry: sanctioned candidate-bound live before/after token measurement against the 10 % target on a real Elephant session (HOST-SESSION-NEEDED per the 2026-10-22 blocker analysis), plus native tests, Critic, Verify and PO acceptance.

## (5) Confidence

High (about 85 %) on the table rows for wakeUpLoops and guardRefusals (read commit diff and tests). Medium (about 60 %) on exploreOrPlanRefused, handWrittenBriefings and delegationCost "no enforcement" claims, based on targeted searches of guard-dispatch only, not a full read. Low on whether other Stop hooks repeat text. No test execution was done; no patch produced, no clone created (recon only, no production edit).
