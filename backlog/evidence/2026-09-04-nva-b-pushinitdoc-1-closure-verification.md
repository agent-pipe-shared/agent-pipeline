# NVA-B-PUSHINITDOC-1 — independent closure verification, including a T1 Critic round

Closed against `7d56917c37344fb3750877c4e16787b0adb30943`
(`fix(push-init): require explicit --candidate, stop hardcoding HEAD`), the fix
`push-init.mjs`'s own history already carried when this item was picked up
today. Verification here is independent throughout: the reproduction, the T1
review, and the resolution of what the review found.

## Reproduction, re-established live

- `--candidate <sha> --record-ref HEAD` (record commit ahead of candidate):
  exit 0. `backlog/evidence/NVA-B-PUSHINITDOC-1-record-ref-ahead.txt`.
- `push-init`'s own current form (explicit `--candidate`, no `--record-ref`,
  which now defaults per the checker's own documented default): exit 2 with
  `UNRECONCILED-ADR` findings when the range genuinely implicates an ADR.
  `backlog/evidence/NVA-B-PUSHINITDOC-1-own-form.txt`.
- `node --test plugins/pipeline-core/scripts/push-init.test.mjs` — 18/18 pass,
  independently re-run, not accepted from any report.

## T1 Critic round

Required by the item's own text: "this touches the push-driver argv contract
and its guard-admission tests. It owes a T1 Critic round." Run against `7d56917c`
in isolation (the exact commit that landed the fix), functional-equivalent-
read-only lane, `claude-opus-5` at `max`. No prior Critic evidence existed for
this commit anywhere in the repository before this round.

**F1 (major, as scoped to the single reviewed commit) — three of four
documented invocation surfaces were not updated when `--candidate` became
required.** Confirmed by the Critic against `7d56917c` alone via `git grep`
across four doc locations. **Resolved independently, at a different commit,
before this closure:** `3f92cae8` (`fix(guard-testpath): classify git restore
like checkout and re-admit rebase --exec payloads`), landed the same day
(2026-09-01) under a different work package entirely — its own commit message
names this exact drift as its own finding F3 and corrects all remaining
copies. Verified live, not taken on the Critic's disclaimer that this was
"outside my review object": `grep -n "push-init.mjs --root"` across all three
doc locations plus the summary-table line in the root doc all show the current,
required-`--candidate` form. Nothing is stale at HEAD.

The generative cause F1 names — "no suite asserts agreement between the root
and plugin-shipped copies" — is also independently closed, by a third, later
package: `246f44aa` (this session, 2026-09-04), which added a cross-check in
`push-release-flow-docs-contract.test.mjs` asserting every documented
`push-init.mjs` invocation in all three doc locations matches the real
`parseArgs()`/`usage()`. Verified today, 9/9 pass.

**F2 (minor) — the new real-repo regression pins two literal historical SHAs
and defaults `--record-ref` to a mutable `HEAD`.** Confirmed still present in
the current test file. Accepted as residual, not dispatched for a fix: the
Critic's own severity call is minor, the failure mode is a false RED (never a
false GREEN — the case is currently green, re-verified above), and the
practical exposure is narrow given `nova`'s own history-rewrite prohibition
(HEAD on this branch can only move forward from the pinned ancestor, never away
from it). Recorded here rather than silently dropped so a future session does
not need to rediscover it.

## What this closure does not claim

The Critic's own report names two explicit limitations, both accepted rather
than resolved: `guardrails/quality-gates.md` was not read within its budget, so
no clearance above rests on that file; and the dispatch record's `outcome`/
`report.changedFiles` content was checked for presence only, not read, so the
authorship binding for `NVA-B-PUSHINIT-1` is presence-verified, not
content-verified. Neither blocks this closure — both are about the *review's*
completeness, not about a defect in the reviewed code.

One process note from the Critic, recorded rather than dropped: this round's
own dispatch briefing carried a label on the machine-evidence reference
("independent reproduction evidence... confirming the fixed behavior") that the
Critic correctly flagged as an expectation-conclusion the template forbids —
and noted it was also inaccurate, since one of the two referenced artifacts is
itself a failing (exit 2) case. The Critic disclosed it and judged the evidence
on its own content regardless. Fixed in briefing practice going forward: a
machine-evidence reference names what a command produced, never what it proves.
