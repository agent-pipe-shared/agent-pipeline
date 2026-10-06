# Which source sets the Claude dispatch tool cap and the 80 % checkpoint (BUDGETCAP-d)

Read-only diagnosis. Anchors are `path:line` in the tree at ruleset 0.7.0+claude.20261005202045.7170ed20.
"Measured" = read in code or executed (`scratch/BUDGETCAP-d/calc.mjs`, exit 0, log `scratch/BUDGETCAP-d/calc.log`, ignored dir, regenerable). "Inferred" = reasoning, labelled.

## (a) Source of the base cap: a combination, the smaller value wins (measured)

Two inputs, combined with `min`:

1. The briefing text. `bindDispatchBudget` parses exactly one line `- **Tool budget ...: ≤N tool uses` (`plugins/pipeline-core/lib/dispatch-budget-binding.mjs:17-19`, `:83-100`) into `baseCalls`. Missing, ambiguous or non-numeric line = rejected (`:85-94`). `guard-dispatch.mjs:431` runs this before launch and stores it as a pending binding under the Dispatch tool-use id.
2. The agent definition. `maxTurns` is read live from the frontmatter of the installed plugin's `agents/<name>.md` (`dispatch-budget-binding.mjs:45-65`; used by the hook at `hooks/guard-dispatch-budget.mjs:378-385`). The hook rejects a binding whose `maxTurns` differs (`guard-dispatch-budget.mjs:1177`, `:1200`).

Formula: `workingCap = min(baseCalls, maxTurns - (CLOSING_ALLOWANCE 5 + SAFETY_MARGIN 10))`
(`lib/dispatch-budget-core.mjs:16-17`, `:49-52`, `:55-60`; hook `guard-dispatch-budget.mjs:848-849`, header comment `:76-90`). On conflict the agent definition wins whenever it is the smaller: a briefing cannot raise the cap above `maxTurns - 15`. A briefing can only lower it. The briefing value is bound into the per-agent counter on first call (`:1203-1207`) and later calls read the counter (`:1187-1189`). Only an orchestrator-written grant can raise it, capped at `maxTurns - 6` (`dispatch-budget-core.mjs:118-124`; read at `guard-dispatch-budget.mjs:859`).
Constants: the shipped per-role default briefing numbers (critic 24, deep 45, implementor 40, mechanic 40) are in `lib/dispatch-policy.mjs:53-58`, emitted by `:92-99`; they are only the text the briefing carries, not a cap on their own. The silent clamp is not reported to the agent (`tierLimited` is computed at `dispatch-budget-binding.mjs:109`; the hook's notice text does not name it).

Shipped `maxTurns`: goldfish-deep 80 (`agents/goldfish-deep.md:6`), goldfish-implementor 50 (`agents/goldfish-implementor.md:6`), critic 40 (`agents/critic.md:6`). So the implementor tier clamps at 35, deep at 65, critic at 25.

## (b) Checkpoint threshold and closing allowance (measured)

- Threshold = `floor((4*workingCap + 4) / 5)` = ceil(0.8 x workingCap), integer arithmetic, rounds UP (`dispatch-budget-core.mjs:133-137`). It is computed from the effective `workingCap`, not from the briefed number.
- Order: the counter is incremented first (`nextCount = currentCount + 1`, `dispatch-budget-core.mjs:90`), then compared to the cap (`:91`). The counter persists before the verdict (`guard-dispatch-budget.mjs:867-869`). The notice is decided on that same counted call (`:873-876`): it is ALLOWED (exit 0) with `additionalContext` (`:485-498`). So "call number N" includes the call that carries the notice.
- Notice fires when `nextCount === threshold`, or `nextCount > threshold` and within the last 3 working calls (`dispatch-budget-core.mjs:106`, `:145-152`). Only for budget-bearing roles (`guard-dispatch-budget.mjs:872-875`).
- Closing allowance = 5 further counted calls after `workingCap`, closing acts only (`dispatch-budget-core.mjs:94`); denied attempts also count (`:73-78`, hook header `:91-96`).

## (c) Computed checkpoint call numbers (measured, `scratch/BUDGETCAP-d/calc.log`)

| Dispatch | maxTurns | briefed | workingCap | threshold | notice at counted call |
|---|---|---|---|---|---|
| goldfish-deep | 80 | 45 | 45 | 36 | 36, 43, 44, 45 |
| goldfish-implementor | 50 | 45 | 35 | 28 | 28, 33, 34, 35 |
| goldfish-implementor | 50 | 40 (shipped default) | 35 | 28 | 28, 33, 34, 35 |

Consequence: an implementor briefed "≤45" gets its first notice at call 28 and its last working call at 35; call 36+ is closing-acts-only. A briefing that says "checkpoint at about 36" is wrong for the implementor (inferred match to the 2026-10-05 observation: that dispatch stopping at 35 is exactly the implementor working cap; the item does not name the agent type, so this is inferred, not measured).

## (d) Does `templates/prompts/goldfish-task.md` say which source wins? Partly, and misleadingly (measured, read)

- Line 440 says the briefed number is the "base cap" and that `maxTurns` is "a second, harder limit"; it shows the example "base 40 + 5 = 45 ... fits under `maxTurns: 50` ... with 5 in reserve" and "a base cap of 45 has 30 in reserve" for deep. Quote: "if a dispatch's `agentType` carries yet another `maxTurns` value, rescale the base cap so base + 5 stays safely under it".
- Absent: any statement that the hook silently clamps the base to `maxTurns - 15`, that a 40/45 base on the implementor is therefore reduced to 35, or that the reserve is 10 on top of the closing 5. The "5 in reserve" arithmetic is wrong against the hook (real reserve is 15, so base 40 is already over by 5). A grep for `SAFETY`, `clamp`, `min(`, `effective cap`, `tierLimited` in the template returns no match.
- Line 436 defines the checkpoint as "about 80 % of the base tool budget"; the hook uses 80 % of the effective (clamped) cap.

## (e) Proposed template wording (text only, NOT applied)

> **Which cap is enforced.** The Claude hook enforces `min(your stated base cap, maxTurns - 15)` for the dispatched `agentType` (5 closing + 10 safety are reserved out of `maxTurns`); it never raises a stated cap and clamps a higher one silently. State a base cap at or below `maxTurns - 15` (implementor/mechanic 50 → at most 35; deep 80 → at most 65; critic 40 → at most 25) so the briefing and the hook agree. The 80 % checkpoint is `ceil(0.8 x` that effective cap`)` counted tool calls, and the call that reaches it carries the notice (e.g. 28 of 35 on the implementor, 36 of 45 on deep). Treat the effective cap, not the stated number, as the base cap everywhere in this briefing.

## Not verified
Windows-only run of the calculation; Codex/Antigravity have no adapter, so this answers the Claude hook only. No hook-level run of the full pipeline was done (only the pure policy core was executed).
