---
schema: pipeline.backlog-item.v1
id: pipeline.agents-read-the-source-because-nothing-describes-the-interface
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-09
sprint: nightwing
source: "Full command-level analysis of the PO's Codex greenfield happy path against the 0.5.4 candidate (rollout 019fe56c + 019fe56f, 2026-08-09), read from the Codex rollout logs rather than the chat transcript."
due: 2026-08-20
done_when: manual
---

# A third of the run is the agent reading the Pipeline's own source, because nothing describes its interface

## What the run actually spent itself on

114 commands across the two sessions. Roughly **40 of them are the agent reading
Pipeline source** — not the project, the Pipeline — to work out how to call the
next step. That is not one agent being cautious; every read has a cause that is
findable in this repository:

| Where | What it read, and why |
|---|---|
| 27–35 | Listed `scripts/`, then opened `v3-bootstrap-authority.mjs`, `advisor-capability-preflight.mjs` and `repository-freshness.mjs` before running each. The bootstrap step list does not name them, so the agent discovered the steps itself. |
| 39–40, 46–47 | `KICKOFF-PROMOTION-INPUT: promotion feature id is invalid`. The message names neither the accepted form nor a suggestion, so the agent grepped the message text out of `onboarding-continuity.mjs` and read the validator. |
| 50–51, 53 | `submit-plan`, `approve-plan` and `set-phase` are not named in the bootstrap skill and have no usage output, so the agent read `pipeline-state.mjs` to find the flags. |
| 37, 103, 106 | `RH-SCHEMA` (see the separate item). Read twice: once to build the card, once in the retrospective to explain it. |

## The five loops, each with its work-around

1. **`rg --files … | sort` refused** (`GUARD-OPERATOR-UNAPPROVED`, step 11). The
   grammar admits `rg | rg` and `rg | head` and not `| sort`. Re-issued twice
   without the pipe. Cheap, but the admitted set looks arbitrary from outside.
2. **`kickoff plan` immediately after the restart refused** (step 7,
   `GUARD-LIFECYCLE-NOT-READY`). The recovery was `inspect --intent session`,
   while the skill's step 0 prints `--intent bootstrap`. The agent had to infer
   that the intent changes after a restart.
3. **`repository-freshness.mjs "<root>"` → `usage:`** (step 35), one step after
   reading that file. A positional path is not accepted; `--repo` is.
4. **`KICKOFF-PROMOTION-INPUT`** (step 45). The agent passed
   `--id kickoff-91143231d29f2a9b` — the id the kickoff itself generated and the
   one standing in State. Four commands and two source reads to learn that a
   promoted feature needs a fresh slug.
5. **`git add … pipeline.user.yaml` refused** (step 79,
   `GUARD-GATE-STRENGTH-SHELL`). **The work-around is the expensive one:** the
   agent dropped the Pipeline artifacts from the publication scope and pushed
   only the game. The remote branch therefore does not contain `.claude/`,
   `.codex/`, `docs/`, `project/` or `pipeline.user.yaml` — the greenfield test
   is not reproducible from its own remote. This is
   `2026-08-08-a-guard-string-match-makes-a-file-uncommittable-by-any-agent.md`,
   now with a consumer-visible consequence rather than a hypothetical one.

Two further stops needed the PO and are not Pipeline defects but are missing from
onboarding: Git had no author identity (step 84), and two SSH keys with no agent
running meant the first push failed (89–99).

## Run telemetry, for the Claude and no-Pipeline comparisons

Measured from the rollout logs, main agent only unless stated.

| Metric | Codex, 0.5.4 greenfield |
|---|---|
| Wall time | ~33 min (07:29:00Z → 08:02:10Z), across one forced restart |
| PO turns | 17 |
| Commands executed | 171 (18 before the restart, 153 after) |
| Guard refusals | 4 |
| Output tokens | 51,070 (reasoning 21,152) |
| Total tokens | 7,339,219 — input 7,288,149, of which **97.0 % cached** |
| Auto-reviewer (Codex's own approval agent) | +2,013,972 tokens, 5,084 output |

Two things to carry into the comparison. Input dominates and is almost entirely
cache hits, so **output tokens are the honest cost axis**, not totals. And the
Codex auto-reviewer adds **27 %** on top of the agent's own consumption — a
runner property, not a Pipeline one, so a Claude run is not comparable on totals
without saying so.

### The no-Pipeline control run

Same brief, Claude Opus 5, no Pipeline at all (2026-08-09, transcript
`e5004187`). Measured with the same axes:

| Axis | Codex + Pipeline | Claude, no Pipeline |
|---|---|---|
| Wall time | ~33 min (one forced restart) | 10 min 11 s |
| PO turns | 17 | **3** |
| Tool calls / commands | 171 | **13** (Bash 6, Write 4, Edit 2, AskUserQuestion 1) |
| Output tokens | 51,070 | 34,719 (the CLI's own summary reports 21.6k; the difference is which assistant messages each counts, so quote one or the other, never both as the same number) |
| Cost | not priced by the runner | $1.62 |
| Delivered | 12 files, 656 lines: game + tests + PRD/Spec/design-input, committed and pushed | 4 files, 1,030 lines: game only, **no test, no git repository** |

**The honest reading, and it is the PO's own expectation confirmed.** At this size
the Pipeline costs roughly 13× the tool calls and 6× the PO turns for a smaller
game. Almost none of that difference is the product: it is installing and
bootstrapping a Pipeline that did not exist yet, one forced restart, a plan gate,
a promotion, a push ceremony, and the retrospective. The control run wrote more
game because it did nothing else.

What the control run does not have is also worth stating plainly, because a cost
comparison that omits it is not a comparison: no test, no version control, no
recorded requirement, and nothing that survives the session. A mini greenfield is
not what this machinery is for, and this pair of runs is the measurement that
says so rather than the assumption.

**The number to watch across future runs is PO turns, not tokens.** 17 versus 3
is the axis a human actually feels, and the analysis above says where most of the
17 went: refusals that did not name the accepted form.

`scratch/rollout-telemetry.mjs` (Codex rollout JSONL) and
`scratch/claude-telemetry.mjs` (Claude transcript JSONL) produced these numbers.

## Direction

The four causes above are one cause: **the Pipeline's command surface is
discoverable only by reading its source.** Three cheap moves, in order of return:

1. Every typed refusal that rejects an *argument* names the accepted form. The
   promotion id and `RH-SCHEMA` are the two measured instances; the pattern is
   the one already fixed for the grammar refusal in `53aa19a`.
2. `--help` on the operator-facing scripts, and admitted in the non-ready lane —
   today it is refused there, which is where it is most needed.
3. The bootstrap step list names the commands a normal session actually runs
   (`submit-plan`, `approve-plan`, `set-phase`, and the checks at 27–35), so the
   agent stops rediscovering them.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Nightwing.
- **Rationale:** matches Sprint Nightwing's confirmed scope exactly —
  "Product experience: onboarding, configuration, documentation and
  low-friction adoption" (`docs/adr/0043-post-go-live-sprint-model.md`'s
  2026-08-17 amendment) — and live Nightwing issue `#61` ("Make fresh Codex
  onboarding internally consistent and restart-safe") covers closely
  adjacent ground. This is a substantial discoverability/UX investigation
  with three concrete candidate moves, not a quick fix; it does not block
  Nova A or Phoenix's own remaining work.
- **Assignment (if accepted):** next available Nightwing slot; the three
  ranked "cheap moves" in this item's own Direction section are the
  design's starting point.
- **Date:** 2026-08-17
