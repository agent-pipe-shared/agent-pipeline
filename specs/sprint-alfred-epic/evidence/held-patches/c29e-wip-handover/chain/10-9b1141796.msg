fix(provenance): the Dispatch: stage-0 (elephant) trailer is a stage-0 self-declaration

check-dispatch-provenance.mjs accepted only "Dispatch: <id>
(goldfish|critic)" and applied the stage-0 caps only to a commit with no
Dispatch: line and the phrase "stage-0 fast path". The trailer ADR-0101
and agent-obligations.md §6 prescribe, "Dispatch: stage-0 (elephant)",
was therefore reported as malformed-trailer, and the new 3/60/25 caps
never reached a compliant commit. The exact trailer now counts as the
stage-0 self-declaration, like the phrase: within the caps it is a
recognized exemption, over them it is stage0-claim-caps-exceeded. Any
other unknown Dispatch: value stays malformed-trailer.

Test: a commit with the trailer, 20 production lines and a 30-line test
clears; a following commit with 26 production lines is flagged.

AI-Assisted: true
Dispatch: stage-0 (elephant)
