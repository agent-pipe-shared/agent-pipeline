# PO input: design advisory workflow for the next local Alfred candidate

Date: 2026-09-19. This is a distilled record of explicit PO instructions, not
a verbatim transcript, a design PASS or an implementation acceptance receipt.

## Required sequence

User input → initial design draft by a fresh dispatch → Advisor improvements →
Elephant disposition and revision → independent readiness comparison of original
user input, PRD and Spec → one final PO package review → implementation.

The Elephant owns the design and records which proposals are adopted or
rejected and why. Do not equate a coherent Spec with faithful coverage of the
original user input. Readiness must receive both, plus the PRD.

## Advisor execution

Reuse the existing advisory coordinator, demand/receipt contracts and consult
agent where possible. Claude uses its native Advisor when available and the
fresh ordinary read-only subagent fallback otherwise. Codex and Antigravity use
that ordinary fresh subagent route directly. A selected-sandbox/App-Server
adapter is not a prerequisite for this newly requested ordinary session route.
Do not silently relax the old native route: name the new route and its actual
assurance. No OS isolation or effective-model attestation without real evidence.

## Enforcement and human interaction

Wire the prerequisites into the common implementation-authority boundary and
all three supported runner entrypoints. A skill paragraph alone is insufficient.
Missing, forged, stale, mismatched or failed required evidence must prevent the
governed implementation transition. Test actual invocation paths and negatives;
do not claim universal host-tool enforcement from a shared helper.

The good case has exactly one PO approval of the final package, using the
project-selected chat or signature mode. No extra Advisor or implementation
approval in the ordinary path. Keep export/host permission boundaries honest;
do not invent an extra Pipeline approval or bypass an actual host denial.

If the Advisor truly cannot produce a usable result (e.g. denied dispatch,
capacity, timeout or invalid output), allow an explicit package-bound PO
exception for the Advisor step only. Record failure and exception, never an
Advisor PASS. Independent readiness and final package approval still apply.
Where possible include the exception in the single final approval ceremony;
it must not authorize implementation before that ceremony. This exception does
not waive the readiness check or authorize publication.

## Candidate scope and non-goals

Integrate with the separately requested Critic-before-Full-Verify repair,
plugin-update drift repair, chat/signature consistency repair, existing Alfred
findings and final local-candidate qualification. Do not install or push.
Preserve existing consumer work and historical evidence. The reported Windows
Claude session was resumed; its lack of architecture-adoption prompt is not yet
a confirmed fresh-session defect. The PO is testing greenfield separately.
