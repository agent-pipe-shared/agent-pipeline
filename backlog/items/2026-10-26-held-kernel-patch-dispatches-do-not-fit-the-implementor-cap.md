---
schema: pipeline.backlog-item.v1
id: pipeline.held-kernel-patch-dispatches-do-not-fit-the-implementor-cap
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-26
source: "WSL PC session 2026-10-26: eleven goldfish-implementor dispatches building held kernel patches; follow-up of the closed item 2026-09-06-briefed-tool-budgets-are-estimated-too-low-and-nothing-enforces-them"
sprint: sprint-alfred-epic
done_when: manual
---

# Held-kernel-patch dispatches do not fit the implementor cap

## Description

A held-kernel-patch task needs many tool calls before any real work:

- copy the kernel file and its suites into an owned scratch tree;
- write the cases test-first and show them RED against the originals;
- implement the change;
- run the copied suites whole, then GREEN;
- build a `git apply`-able patch;
- run `git apply --check` against the candidate;
- hash the preimages;
- write the notes.

The implementor tier's cap is 35 (maxTurns 50 minus the margin), with the 80 % checkpoint at about call 28. On 2026-10-26, nine of eleven such dispatches stopped at that checkpoint. The work in each was sound; only the budget ran out. Each item needed two to three continuation rounds:

| Item | Rounds to a committed patch |
|---|---|
| Windows locks | 2 Goldfish rounds plus Coordinator packaging |
| Critic owner recovery | 2 Goldfish rounds plus Coordinator packaging |
| Route effort | 3 |
| Pre-ready Git | 3, plus one Coordinator GREEN run |
| HGO sweep | 3 |
| Identity | 3 so far; split again into C2 and C3 |

Three costs recur:

- **Orientation.** Each round re-reads files to reach the state the previous round already had.
- **Grammar refusals.** About 3–4 calls per dispatch were lost to closed-grammar refusals (`rg -A/-B`, `--glob`, `head -c`, `;`).
- **Long suites.** Suites of more than 120 s force a background run plus a wait.

Two things helped. A precise continuation card ("do not re-read; start at the next step"), plus one scratch `.mjs` driver for the whole closing work, finished the last round in about 24 calls. The pure packaging tail (diff, apply-check, hashes) is mechanical: the Coordinator did it twice with a small script and re-ran the suites itself.

## Proposal

1. Let the briefing generator recognise the held-kernel-patch shape and either size the base budget for it or split the work by default:
   - slice A: scratch tree, RED cases and implementation;
   - slice B: GREEN runs, patch, apply-check, notes.
2. Ship a tracked packaging helper under `scripts/`: preimage from the candidate commit, postimage from the work tree, `git diff --no-index --no-prefix`, `git apply --check`, preimage hashes. Then no dispatch spends calls rebuilding it. The ad-hoc version lives in `scratch/wave3/pack-held-patch.mjs`.
3. Put the admitted read idioms (plain `rg -n`, the Read tool, no `-A/-B/--glob`) into the generated briefing's budget section, because refusals cost budget.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
