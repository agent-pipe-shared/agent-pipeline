# K130-BACKLOG-LEDGER-REGISTRATION notes

Ruleset 0.7.0+claude.20261022204428.79cda46. Clone: scratch/clones/k130 (base main, `git pull --ff-only`: already up to date).

## Cause
Three item files reconstructed on 2026-10-23 had no transition-ledger entry, so
`check-backlog-state.mjs` reported `FAIL ... has no transition-ledger entry` for each:
capture-evidence-does-not-normalize-windows-npm-launch,
domain-scanner-findings-need-reproduction-before-remedy,
implementation-without-dispatch-escapes-review-coverage.

## Change
Sanctioned writer, no hand edit of the hash chain:
`node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` (plan: "Would record 3 transition(s) across 3 item(s)"),
then `--activate` ("Recorded 3 transition(s)"). Plan afterwards: "nothing to reconcile".
- Appended ledger sequences 2359, 2360, 2361: from null to open, actor backlog-reconciliation, kind item-file-reconciliation,
  chain intact (checker validates previousHash/entryHash).
- Regenerated backlog/index.json and backlog/STATUS.md (writer output; 39 insertions, 3 deletions over the 3 files).
- No item file text touched. No protected path involved (backlog/** is not in protected-baseline.json; commit accepted by the hook), so no diff export.
- Clone commit 8dfa92b33 `fix(backlog): register the three reconstructed items in the transition ledger`,
  trailers `AI-Assisted: true` / `Dispatch: K130-BACKLOG-LEDGER-REGISTRATION (goldfish)`.

## Deviation from the briefing (evidence commit)
Briefing said evidence.commit = the commit that added each item file. The writer instead cites the
reconciliation baseline (HEAD) for all three: 808ed2efacbd797081ea933a2491a6136ff9e2ed, after verifying with `git cat-file -e`
that this commit's tree contains each file (resolveItemFileCommit; prior reconciliation entries, e.g. 2358, follow the same pattern).
The adding commits are: capture-evidence fa2ee78b64659b0e447e02cf40f7b11856e90486, domain-scanner af4124290859232e65718b26f10ed68ea05409fc,
implementation-without-dispatch 808ed2efacbd797081ea933a2491a6136ff9e2ed. The writer has no per-item commit option; only items 1 and 2
differ. Chose the sanctioned writer over hand-editing entries (smallest correct, hash-chain safe). All three OIDs are full, lowercase, reachable.

## Counted results
Before (`node scratch/clones/k130/plugins/pipeline-core/scripts/check-backlog-state.mjs`): exit 2; 21 DRIFT lines (event 403, events 645-664, one
closure_commit/403 item line) + 3 FAIL lines (the three "has no transition-ledger entry").
After (same command, before and after the clone commit): exit 0 (no FAIL; last line "Backlog state, transition ledger, closure evidence, and
generated projections are valid."); the same 21 known-accepted DRIFT lines remain, unchanged text.
Test: `node --test scratch/clones/k130/plugins/pipeline-core/scripts/check-backlog-state.test.mjs`: CBS01-CBS17, 17 passed, 0 failed (1 file test, pass 1, fail 0).

## --registration-commit mode
`check-backlog-state.mjs --registration-commit` is the first leg of GIT-09 for a commit that ADDS new open item files (staged `A` under backlog/items,
plus only specs/*/ plan-type files) with the committed ledger and projections unchanged. Run on this change (ledger/projections modified, no staged A) it
returns exit 2 with the generic "open-registration precheck requires exact new open items, unchanged committed baseline, and stable genuine Git index";
on a clean tree it fails the same way ("empty stage"). It is not applicable to this change: this commit is the second leg (full strict checker, which passes).
Nothing to handle. If it were applied to a future item-add commit, the baseline projection must stay byte-equal to the committed one, so the ledger
registration belongs in the following commit, as here.

## Risks
- Ledger is append-only: the three entries are permanent once committed/pushed. Entry dates are 2026-10-23.
- Operator integrates the clone commit onto main; the evidence OID 808ed2efa is on main already. If main moves with further ledger entries first,
  the sequence/previousHash must be regenerated (re-run the writer on the new main).
- Dispatch-trailer verification expects `evidence/dispatch-record-K130-BACKLOG-LEDGER-REGISTRATION.json` (Elephant-owned); not created here.
- Ratchet line effect against architecture/boundary-policy.json: none (no code touched; report only).

## Proposed commit message
Already used in clone commit 8dfa92b33 (subject above; body explains the three items, the writer and sequences 2359-2361; trailers
`AI-Assisted: true` and `Dispatch: K130-BACKLOG-LEDGER-REGISTRATION (goldfish)`).

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts (none) and PO acceptance pending.
