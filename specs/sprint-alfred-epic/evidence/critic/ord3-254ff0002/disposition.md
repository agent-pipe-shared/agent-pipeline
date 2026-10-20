# Disposition: ordinal-3 correction review of f62b5143a..254ff0002

Review object: the 10 enumerated commits `f62b5143a..254ff0002` (head tree `3355cfbe0`), Critic on
`claude-opus-5-5` at max, functional-equivalent-read-only lane, route pre-check passed. Verdict:
FAIL on F1, F2 and F3 (major); F4 is minor. The report is `critic-notes.md` beside this file. The
review is advisory, like the two before it: no finalizer receipt exists for this batch
(`backlog/items/2026-10-20-a-running-batch-has-no-admissible-critic-route.md`).

The batch has one review left (ordinal 4). It is spent on the delta that follows the PO's
ceremonies (PO decision of 2026-10-20: ceremonies first, then the last review, then the
candidate), so the protected changes are reviewed too.

| ID | Severity | Disposition |
| --- | --- | --- |
| F1 | major | Accepted. The ledger move does not reach production until ceremony C13 lands: `hooks/guard-git.mjs` and its test are protected (PB-GUARD-HOOKS, PB-CONTRACT-TESTS), and the helper is their only planned caller. The Critic could not see this, because the ceremony list is coordinator-only input. Fixed now: `4ecc69146` corrects the helper header (not yet in effect, why, until when) and creates a new ledger file owner-only, pinned in `project-authority.test`. The fail-open read side stays: it is the hook's own behaviour today (`guard-git.mjs` `readLedgerEntries`), and the move changes where the ledger is, not what counts as consumed. The `0o700` directory mode applies only when the helper creates the directory; the header says so. The C13 clone proof was rerun on the corrected helper (`scratch/clone-proof-c13-proof-3.json`). `commit-pipeline-owned.mjs` keeps saying that the log dirties the tree, which stays true until C13; its comment is in the post-ceremony doc list. Closed only when C13 is committed. |
| F2 | major | Accepted; no retroactive fix, because history is not rewritten. Of the 10 commits, `756b32621`, `ad638524a`, `ff0d7f552` and `74a77e0e8` exceed stage-0, and `0ce02d25f`, `8b52ed2d2`, `73b552c02` and `ff1e33de9` are backlog-only and should have carried `Dispatch: administrative (elephant)`, which the installed guard admits. Forward fix: backlog and ledger commits use the administrative binding from now on. Elephant-built code commits still have only `stage-0 (elephant)`: the installed plugin's commit guard predates the `D<n> (elephant-exception)` form, and no PO decision yet records an exception for this work. That is Q14, now widened to this range and to the corrections below, and the plugin reinstall that enables the form. Each code commit's body says that it does not claim the stage-0 criteria. Commit messages from here on cite no prior finding IDs, so the next Critic can read the disclosure. |
| F3 | major | Accepted, fixed in `b5b1ff6f8`. PUSHSIG-S4c failed because the renderer splits a long POSIX copy command into `CMD=` chunks at a fixed column, and the fixture path is part of that command: under the Critic worktree `scratch/critic-ord3` the refspec was split (seen with `scratch/run-detail.mjs`). The test now joins the chunks before it matches. `push-prepare.test` is 73/73 in the main checkout and 73/73 from the deep worktree path at `4ecc69146`. Full Verify was not run and is not claimed: it needs a clean tree, and `.agents/plugins.json` carries the PO's AGY install edit (Q7). |
| F4 | minor | Accepted, fixed in `9a15050e3`. `commit-pipeline-owned.mjs` requires exactly one of `--agent` or `--human`. A call naming neither, both or a flag twice is refused with `CPO-ARGS`, so a dropped flag gives a refusal, not an unmarked commit. The remedy and both copies of the push-release flow name the flags. |

Prior findings: F-D delivered. F-C's remaining gap was F4. F-A and F-B are F2 and F1 above. F-E is ceremony C14.

## Correction commits after this review

Measured with `git show --numstat`.

| Commit | Paths | Lines | Kind |
| --- | --- | --- | --- |
| 9a15050e3 | 5 | 51 | code, test, docs (F4); exceeds stage-0 |
| b5b1ff6f8 | 1 | 4 | test only (F3); a test change is outside stage-0 |
| 4ecc69146 | 2 | 22 | code, test (F1); exceeds stage-0 |

All three are Elephant-built under Q14 and carry `Dispatch: stage-0 (elephant)` with the body
note above.
