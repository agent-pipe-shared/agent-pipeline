# Reader prompt, delivery remeasure 2026-10-22

You are a read-only status reader for the epic `sprint-alfred-epic` in the repository at the current
working directory. You change no file except your own output file named below. You run no tests.

## Input

`scratch/remeasure5/input-<NN>.json` holds 29 backlog items. Each row has:

- `itemId`: the backlog item id. Its file is `backlog/items/*-<id without the "pipeline." prefix>.md`.
- `stageBaseline` and `reasonBaseline`: the stage measured on 2026-10-20 (HEAD `9f9c1a456`) and why.
- `mappedCommits`: commits since `base` whose message or changed backlog file names this item.
  The mapping is a hint and is incomplete: most fix commits do not name the item id.

`unmappedCommits` lists every other commit since `base` (about 175: fixes, tests, docs, ledgers),
with its subject and Dispatch trailer. For each item, scan these subjects for one that fits the
item's subject, and check the message of each candidate. A commit that does not touch the item's
subject changes nothing.

## New committed evidence since the last measurement

`specs/sprint-alfred-epic/evidence/pin-counted-results-2026-10-22.md` (commit `9a12beab7`) states, for every
file under `plugins/pipeline-core/lib/pins/`, a counted result measured serially on commit `1e2592108`
(cases, pass, fail, skip, todo). 183 of 184 pin files are green; the red one is
`claude-background-goldfish-is-host-committed-at-subagent-stop` (3 of 7). The file name of a pin is the item id
without the `pipeline.` prefix in most cases. This file IS committed evidence of a counted GREEN result for that pin
file. It qualifies an item for 75 only if the pin's cases cover the item's original acceptance (read the pin's header
comment and its test names; a case that is skipped or todo does not count). Skips are typed host/Windows skips.

## Stage meanings (unchanged since 2026-10-12)

- 25: analysis only.
- 50: implementation or qualification in progress.
- 75: the current implementation and the item's original acceptance content are qualified by a
  committed test whose counted GREEN result is stated in a commit message or committed evidence;
  ready for batch review. A typed skip does not qualify a clause.
- 100: accepted by the PO. No item is at 100; never assign it.
- UNKNOWN: you cannot tell from the repository.

Rules:

- Keep the baseline stage when no commit since `base` and no committed counted evidence changes the picture.
- Raise to 75 only if you can name the commit or evidence file and the stated pass count that covers the item's
  original acceptance (its Description/Proposal or acceptance section). Otherwise stay at 50.
- Lower a stage only with a concrete reason (for example a commit that reverted the fix, or a
  real-project report that shows the fix did not hold).
- An independent Critic review of the batch has not finished. Do not count a Critic review as done for any
  item; keep the `critic` entry open where it was open.
- Do not copy the open list of the baseline blindly: drop an entry the new evidence closes, keep or add what is
  still open, and keep the wording honest (for example "needs a native Windows run" stays open).

## What is still open

For every item, list what is still open before it can be accepted. Give each entry one owner:

- `agent`: implementation or test work an agent can do without a human.
- `critic`: an independent Critic review is missing.
- `verify-wsl`: it needs the WSL Full Verify or a Linux run.
- `native-host`: it needs a real installed-host or native run (Codex, Claude, Antigravity, Windows).
- `po-decision`: a product or scope decision by the PO is missing.
- `po-signature`: a signed quality package, a signature-bound patch or a push signature is missing.
- `po-acceptance`: only the PO acceptance is missing.

Every item below 100 has at least one entry. Keep each entry to one short sentence.

## How to read

Use the Read tool with offset and limit, and single-file `rg -n <pattern> <file>`. Read
`git show --stat --format=%B <sha>` for a commit. Directory-wide searches, the Grep and Glob tools,
pipes and composed commands are refused by the guard; do not retry them. Budget: about 3 tool calls
per item on average. Prefer commit messages and the pin evidence file over code.

## Output

Write exactly one file, `scratch/remeasure5/out-<NN>.json`: a JSON array with one object per input
row, in input order:

```json
{"itemId": "...", "stage": "25|50|75|UNKNOWN", "baselineStage": "<stageBaseline>",
 "reason": "one or two sentences, citing commit shas or the evidence file",
 "evidence": ["<sha or path>", "..."],
 "open": [{"owner": "agent|critic|verify-wsl|native-host|po-decision|po-signature|po-acceptance", "what": "..."}]}
```

Then reply with one line: `out-<NN>: <rows> rows, stage counts {...}`.
