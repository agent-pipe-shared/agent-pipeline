# Reader prompt: blocked clauses, can they be done now? 2026-10-22 (read-only)

You are a read-only status reader for the epic `sprint-alfred-epic` in this repository. The main checkout HEAD is the state to judge. You change no file except your own output file named below. You run no test, start no host application, make no model call, and you do not touch `scratch/clones/*`. Each input clause was classed in the delivery matrix at commit 9a12beab7 as owned by something other than the agent (`verify-wsl`, `po-decision`, `po-signature`, `native-host`). Since then many builds landed (run `git log --oneline 9a12beab7..HEAD` once) and the PO answered many decisions (rows D100..D142 of specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md; read it with rg -n "<item or topic>" on that single file). The PO asked: check whether the blocked things are doable NOW.

## Facts about this environment
The agent works on Linux/WSL with the repository checkout and Node; it can run a Linux test but not on native Windows (D133: no further native-Windows suite runs; permission-check cases are typed skips on Windows). No real model or host session (Codex, Antigravity, Claude Desktop) is available to the agent. A PO signature needs the PO at an attended terminal, but the PO is available for terminal steps in operator blocks, so "needs only a PO signature or a PO terminal step" is feasible. A PO decision already recorded in the register is answered, not blocked.

## How to read
Use the Read tool with offset and limit, and single-file `rg -n <pattern> <file>`. `git log --oneline -N -- <path>` and `git show --stat --format=%B <sha>` are allowed. Directory-wide searches, multi-path rg, `-o`, `-A/-B/-C`, pipes beyond `| head -N`, and composed commands are refused by the guard; do not retry them. Budget: about 4 tool calls per clause.

## Hard scope rule
The design must NEVER be reopened and the approved Spec and PRD never change. A clause that can only be met by changing the Spec, the PRD, an AC row, or by `reopen-design` is `OUT-OF-SCOPE-DESIGN`.

## Verdicts (exactly one per clause)
- `DONE`: implemented and pinned now. Cite file:line or commit.
- `STALE`: superseded; cite the decision or ADR.
- `NOW-AGENT`: an agent can do it now on Linux/WSL (a Linux run, a test, a pin, a doc, a measurement); name the smallest step and whether it touches a protected path.
- `NOW-PO-TERMINAL`: only a PO terminal step (a signature, an install, a command the PO runs) is missing; name the exact step.
- `STILL-BLOCKED`: needs native Windows, a real third-party host session, or a PO decision NOT yet in the register; name which and why it cannot be done now.
- `OUT-OF-SCOPE-DESIGN`: see the hard scope rule.

Do not accept the matrix's blocker label on trust: check whether the stated blocker still holds. Honest uncertainty goes into the detail.

## Output
Write exactly one JSON file (array, one object per input clause, in input order):
`{"id": "...", "owner": "...", "clause": "first 80 chars", "verdict": "...", "detail": "one to three sentences with evidence (file:line or sha)", "nextStep": "only for NOW-AGENT / NOW-PO-TERMINAL", "protected": true|false|null}`
Then reply with one line: `<out file>: <n> clauses, counts {...}`.
