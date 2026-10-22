# Reader prompt: agent-owned open clauses, re-check at current HEAD, 2026-10-22 (read-only)

You are a read-only status reader for the epic `sprint-alfred-epic` in this repository. The main checkout HEAD is the state to judge. You change no file except your own output file named below. You run no test, start no host application, make no model call, and you do not touch `scratch/clones/*`. The delivery matrix that produced your input is from commit 9a12beab7; MANY builds landed since (run `git log --oneline 9a12beab7..HEAD` once to see them: K1 to K45 clone imports, the operator sitting commits, the post-sitting delta, K40 to K42). Judge each clause against the CURRENT state, not the matrix text.

## How to read
Use the Read tool with offset and limit, and single-file `rg -n <pattern> <file>`. `git log --oneline -N -- <path>` and `git show --stat --format=%B <sha>` are allowed. Directory-wide searches, multi-path rg, `-o`, `-A/-B/-C`, pipes beyond `| head -N`, and composed commands are refused by the guard; do not retry them. Budget: about 5 tool calls per clause.

## Hard scope rule
The design must NEVER be reopened and the approved Spec and PRD never change. A clause that can only be met by changing the Spec, the PRD, an AC row, or by `reopen-design` is `OUT-OF-SCOPE-DESIGN`, whatever else it needs.

## Verdicts (exactly one per clause)
- `DONE`: implemented AND pinned by a test or check in the repository now. Cite file:line or commit.
- `STALE`: the clause no longer applies (a PO decision D1..D142 in specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md or ADR-0085 supersedes it). Cite the decision.
- `OPEN-BUILDABLE`: not done, and an agent can build it on Linux with no real model call and no signature; say whether it needs a protected path (pipeline-state.mjs, lib/guard/*, guard-*.mjs, verify-suites.json, product-capability-inventory.json, kernel list) or not.
- `BLOCKED`: needs a real host session, Windows, a PO decision or a PO signature; name which.
- `OUT-OF-SCOPE-DESIGN`: see the hard scope rule.

Do not accept an inherited claim on trust: re-read the item's own current text (`backlog/items/<id without the pipeline. prefix>.md`) and check code or git history. Honest uncertainty goes into the detail.

## Output
Write exactly one JSON file (array, one object per input clause, in input order):
`{"id": "...", "clause": "first 80 chars", "verdict": "...", "detail": "one to three sentences with evidence (file:line or sha)", "smallestBuild": "only for OPEN-BUILDABLE", "protected": true|false|null}`
Then reply with one line: `<out file>: <n> clauses, counts {...}`.
