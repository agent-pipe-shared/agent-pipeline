# Gap readers, 2026-10-22 (rounds 3 to 6)

Read-only status readers over the clauses of the delivery matrix (snapshot at 9a12beab7) that were not yet done. Each reader judged its clauses against the CURRENT repository state (HEAD at the time of the round), never ran a test, made no model call and changed no file except its own output. Verdicts are the readers' own and were not independently re-verified; the readers disclose per clause where a verdict rests on commit messages or item text instead of a re-read pin.

- Round 5 (clauses owned by the agent, 67): {"DONE":51,"OPEN-BUILDABLE":5,"STALE":4,"BLOCKED":7}. Prompt: reader-prompt-5.md. Inputs input5-N.json, outputs out5-N.json.
- Round 6 (clauses owned by verify-wsl, po-decision, po-signature, native-host, 152): {"STILL-BLOCKED":83,"DONE":16,"STALE":28,"NOW-PO-TERMINAL":6,"NOW-AGENT":19}. Prompt: reader-prompt-6.md. Inputs input6-N.json, outputs out6-N.json.
- Rounds 3 and 4 (earlier re-checks and the C7 pipeline-state bundle): out3-a, out3-b, out3-c, out4-c7.

Hard scope rule given to every reader: the design is never reopened and the approved Spec and PRD never change; a clause that needs that is OUT-OF-SCOPE-DESIGN.

Use: the actionable verdicts (OPEN-BUILDABLE, NOW-AGENT, NOW-PO-TERMINAL) drove the builds K46 to K49 and the Linux single runs recorded in linux-single-verifys-2026-10-22.md. STILL-BLOCKED clauses need native Windows (D133), a real host session or the stamped and installed candidate.
