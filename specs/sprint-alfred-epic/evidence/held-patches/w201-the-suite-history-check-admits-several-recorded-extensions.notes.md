# w201 — the suite history check admits several recorded extensions (candidate 19c)

PO decision 2026-11-04 (evening): "lift the single-entry cap of the K143 history exception and record a second entry for 7281e012c". Found by the first Full Verify of the whole chain (`verify-suite-append-history-check`, `VSA-PRIOR-ENTRY-CHANGED`; red in the main tree too).

What the walk of the registry history showed (`scratch/agent-out/vsa-walk.mjs` run on the main tree and on the chain):

- Main tree: seven commits are refused by the relaxed append policy. Four are already recorded (b7 integration and its restoration, the duplicate repair pair), `91f728f85` is the one K143 entry, and two are not: `7281e012c` (lists G23C004 in the case-completion policy of the g23 read-help row) and `4ec6622a2` (w160: the analysis-run admission row gets its first case-completion policy).
- Chain: w175 and w176 rewrote the descriptive text (`invariantPinned`, `nonOverlapNote`) of three existing rows. That is a defect of those patches, not something to record: their `harness/verify-suites.json` sections are removed from `w175-*.patch`, `w175-*.rebased.patch`, `w176-*.patch` and `w176-*.rebased.patch`. The three rows keep their old descriptive text.

What this patch changes:

1. `harness/scripts/check-verify-suite-append.mjs`: `rewrites` in `harness/verify-suite-history-recovery.json` admits 1 to 8 entries (distinct commits, oldest first), each still bound to its OWN commit, parent and both registry digests; the b7 restoration is proven against the state before the oldest entry. Nothing is derived from a pattern.
2. **Beyond the literal PO decision, stated openly:** the witness `evaluateCaseListExtension` also admits a row that gains its FIRST case-completion policy and is otherwise byte-identical (gate coverage only grows, the same direction as extending a case list). Without it `4ec6622a2` (w160) cannot be recorded. It is still admitted only through an entry bound to one commit and its bytes; an empty policy, an additional change or no change is refused. If the PO does not want this reading, drop the `addsFirstCasePolicy` branch and the third entry; the check then stays red at `4ec6622a2`.
3. `harness/verify-suite-history-recovery.json`: two entries appended (`7281e012c`, `4ec6622a2`) with their parents and digests from `scratch/agent-out/rewrite-entry-facts.mjs` / `vsa-walk.mjs`.
4. `harness/scripts/check-verify-suite-append.test.mjs`: four new cases (first policy admitted and its three refusals; several entries in a full history traversal and the two cases with one entry missing; the limit of eight, the duplicate commit and a signed-looking entry void the list); the suite is 21/21.

Evidence: the suite 21/21 on the work clone; the history check on the rehearsal clone of the whole script is recorded in the plan.
