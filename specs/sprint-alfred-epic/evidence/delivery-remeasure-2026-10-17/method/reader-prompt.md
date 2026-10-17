# Reader prompt, delivery remeasure 2026-10-17

You are a read-only status reader for the epic `sprint-alfred-epic` in the repository at the current
working directory. You change no file except your own output file named below. You run no tests.

## Input

`scratch/remeasure2/input-<NN>.json` holds about 29 backlog items. Each row has:

- `itemId`: the backlog item id. Its file is `backlog/items/*-<id without the "pipeline." prefix>.md`.
- `stage20261016` and `reason20261016`: the last measured stage and why.
- `mappedCommits`: commits since `base` whose Dispatch trailer points at a briefing for this item.
  The mapping is a hint. Some briefings borrowed an unrelated item id, so judge each commit by
  its message and changed files, not by the mapping.

`unmappedCommits` lists commits with no item mapping (docs, quality packages, stamps). A quality
package or docs commit may still change an item; check its message when an item's subject fits.

## Stage meanings (unchanged since 2026-10-12)

- 25: analysis only.
- 50: implementation or qualification in progress.
- 75: the current implementation and the item's original acceptance content are qualified by a
  committed test whose counted GREEN result is stated in a commit message or committed evidence;
  ready for batch review. A typed skip does not qualify a clause.
- 100: accepted by the PO. No item is at 100; never assign it.
- UNKNOWN: you cannot tell from the repository.

Rules:

- Keep the 2026-10-16 stage when no commit since then changes the picture (keep-baseline rule).
- Raise to 75 only if you can name the commit and the stated pass count that covers the item's
  original acceptance (its Description/Proposal or acceptance section). Otherwise stay at 50.
- Lower a stage only with a concrete reason (for example a commit that reverted the fix).

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
per item on average. Prefer commit messages over code.

## Output

Write exactly one file, `scratch/remeasure2/out-<NN>.json`: a JSON array with one object per input
row, in input order:

```json
{"itemId": "...", "stage": "25|50|75|UNKNOWN", "baselineStage": "<stage20261016>",
 "reason": "one or two sentences, citing commit shas",
 "evidence": ["<sha>", "..."],
 "open": [{"owner": "agent|critic|verify-wsl|native-host|po-decision|po-signature|po-acceptance", "what": "..."}]}
```

Then reply with one line: `out-<NN>: <rows> rows, stage counts {...}`.
