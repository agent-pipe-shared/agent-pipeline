# w7-pf70-stop-reads-the-last-handback-of-the-child (Elephant, PO exception 2026-10-30)

Report 05 / PF-70 root cause, confirmed from a live subagent transcript (N22 dispatch, 579 lines): the SubagentHandback
was at line 419, a user tool result at 420, and one more assistant record at 423. The stop-failure diagnostic followed
with NGHR-FINAL-JSON. `readSubagentHandbackMessage` looked only at the LAST assistant record, found no handback there,
fell back to the prose `last_assistant_message` and failed the JSON contract. Every handback message in that
transcript parses strictly.

PO decision 2026-10-30 ("the last handback counts"): the latest SubagentHandback of the whole child transcript is the
contract; later prose is ignored. The host commit still checks candidate, changed paths and working tree against that
contract (NGHF08), so a handback that no longer matches the tree is still refused.

Change: `native-goldfish-host-finalizer.mjs` scans every assistant record and keeps the last handback message.
Pin PF-61 case "an earlier handback followed by a later assistant record is refused" becomes its own committed case
(ix-b); "only the LAST handback counts" (a later non-contract handback is refused) stays.

Tests: NGHF18b (handback, tool result, later prose: authored-commit-recorded, no diagnostic), NGHF18c (checkpoint
handback then success handback then prose: committed). RED before the fix reproduced NGHR-FINAL-JSON exactly.
Evidence (clone at cf630cbdd): finalizer test 31/31; PF-61 pin 18/18. Revert of the production file: the finalizer
test fails, restored byte-equal. Patch 3 files +46/-10, apply-check 0, stacks with the ready-gate patch.
Open: Full Verify, Critic, native Windows, a live dispatch that writes after its handback, PO acceptance.
