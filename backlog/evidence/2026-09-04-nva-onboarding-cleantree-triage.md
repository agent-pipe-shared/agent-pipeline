# Triage: onboarding test / security-scan clean-tree hypothesis — rejected

Per `backlog/README.md`'s Triage rules, a reject moves `status:` to `closed`
with rationale recorded in the item's own Triage section; there is no
`status: rejected` value in the ledger's enum.

## Why this closes rather than stays open

The item's own investigation (filed complete 2026-09-01, commit `08d4eb85`,
not re-investigated here) already reached and stated a refutation: "the
specific hypothesis in this item's briefing — that a test depends on the
ambient outer working tree being clean via a `security-scan.mjs` subprocess
call — is refuted by direct live measurement." The item's own "Recommendation
for triage" section asks explicitly for this disposition: "The next triaging
Elephant should read this as a candidate for reject... moving `status:` to
`closed`."

No code change accompanies this closure because none is warranted — a refuted
hypothesis has nothing to fix.

## What stays genuinely open, and is not closed by this

The item's own "What remains genuinely unestablished" section is preserved
verbatim in the item body: D-2's original observation (one actual
`security-scan.mjs` subprocess exit-2 failure, seen once during unrelated
prior work) was never reproduced and its root cause is not identified. This
closure resolves only the ambient-working-tree hypothesis this item was filed
to test — not every possible explanation for that one observation. No new
item is filed for the unreproduced original observation; there is not enough
signal (one unreproduced event) to file one, and the item's own text already
carries the caveat for a future session that encounters the same symptom.
