# Open PO questions — collected list (2026-10-07 night onward)

Non-blocking: work continues on everything that does not depend on an answer. Answers are recorded in
[`po-decisions-2026-10-07.md`](po-decisions-2026-10-07.md) with the PO's words.

## Answered in the night round

Q1–Q10 → decisions AI–AR.

## Open (collected while the PO is away)

Recorded options from [`triage-6-po-options-2026-10-07.md`](triage-6-po-options-2026-10-07.md) that refine an answer
given in the night round. Each answer stands; these are the next-level technical choices it leaves open.

| # | Refines | Question | Options on record | Elephant recommendation |
|---|---|---|---|---|
| N1 | AL (Codex Critic lane admitted with fallback) | How the native lane's evidence reaches the Critic receipt | A: mirror the native lane record. B: carry only a digest of it in the Critic receipt | to be filled after reading the option text |
| N2 | AL (T1 fallback) | Which code drives the fallback decision | A: carry the granular code through. B: read `selection.preflight.terminalCode` | to be filled after reading the option text |
| N3 | AK (uninstall removes own artifacts, refuses on a foreign hook) | B2 behaviour as worded in the item | "fail safe with a clear message" vs "re-pointed"; plus the item's `--archive` options | to be filled after reading the option text |
| N4 | AM (agy snapshot central per user) | The item author labels topology B as recommended; the PO chose A | confirm A knowing the item's argument for B | to be filled after reading the item |
| N5 | AQ (write lease) | Where the lease is detected | verifier detection vs a pre-commit hook, shared stale-lease rule | to be filled with the design note |
