# w30j27 — the two old red cases are fixed: the carry line-ending case and the maintenance-window decline case (candidate 30j, slice C30J-J27)

Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.
PO tile 2026-11-18: fix both cases that were red on the base clone before the 30j wave. Both turned out to be TEST defects; no production file changed.

Order of application: this patch is a delta on the integrated 30j tree (the clone int30j). It does NOT apply to the real checkout until that tree is applied first; `apply --check` against that tree passes (exit 0). An `apply --check` against the real HEAD alone is expected to fail and is not an error.

## What it changes (two test files, no production code)

### (a) `plugins/pipeline-core/lib/critic-evidence-carry.test.mjs`, case "the exact repositoryMode promotion of both calibration twins is carried; any other calibration change ends the carry"

- Cause (measured, not guessed): the near miss "the bytes are rewritten (line ending changes)" writes a CRLF-free copy of the promoted calibration over a CRLF-based reviewed commit. The fixture repository inherited the machine's user-level `core.autocrlf=input`, so `git add` normalized the CRLF bytes to LF in the stored blobs. The reviewed blob and the candidate blob therefore held the same line endings, the change really was the exact `repositoryMode` promotion, and the carry correctly answered `CEC-CARRIED` (the assertion saw `carried: true`, `changedPaths: ["project/pipeline.json"]`, `offendingPaths: []`). The production rule reads stored blobs and compares them byte for byte against `promoteRepositoryModeBytes`; it was right.
- Fix: the fixture repository helper `repo()` now sets `core.autocrlf=false` and `core.safecrlf=false` locally, so the repository stores exactly the bytes the case writes. The assertion is unchanged and not weakened: a line-ending rewrite still has to end the carry with `CEC-CONTENT-CHANGED`. All other near misses and the main promotion case run in the same hermetic repository and stay green.

### (b) `plugins/pipeline-core/scripts/signing-ceremony.test.mjs`, case "maintenance-window ceremony aborts before install when the human declines the passphrase entry ..."

- Cause (measured): the case pinned `signingSpawns.length === 1` on a decline. Since slice C30I-S6 (30i wave, recorded in the candidate 30 queue: "up to three passphrase attempts sign the same already confirmed intent") `runSigningOpenssl` in `po-human-approval.mjs` retries the same signing spawn up to `PASSPHRASE_ATTEMPTS = 3` times for a protected key, then fails with one line `openssl failed with exit code N after 3 passphrase attempts; nothing was signed or recorded: run the same command again to retype the passphrase`. The pin restated the behaviour before that deliberate change, so this is a stale pin (QG-04), not a regression; the decision count asked "3 instead of 1" is exactly that attempt bound, and the existing S6 case in `po-human-approval.test.mjs` already pins `signCalls === 3` with one confirmation.
- Restatement (QG-04, reason above; the criterion the case serves is unchanged: a declined passphrase stops the ceremony before install and leaves no window): the error pattern now requires the full S6 line; the spawn count is exactly 3, each non-zero; there is still no typed confirmation (`prompts.length === 0`); a new assertion shows all three attempts carry identical arguments (same intent, nothing re-confirmed or rewritten between attempts); a new assertion shows no `proof-*` file is left in the external directory. The window-absent readback is kept as it was. The header comment of the file names the retry.
- The happy path is untouched and still pins exactly one signing spawn and no prompt: the single human decision (the passphrase entry) is unchanged; only the retry of a refused entry within one run is new.

## Test first

Both cases were run alone first and were RED against the unchanged code: carry 17 of 18 pass (the line-ending assertion, `actual: true, expected: false`); signing-ceremony 4 of 5 pass (`signingSpawns.length` actual 3, expected 1). After the changes the same files are GREEN: `critic-evidence-carry.test.mjs` 18 of 18, `signing-ceremony.test.mjs` 5 of 5 (none skipped, so OpenSSL ran).

## Deliberately not changed

- No production file (`critic-evidence-carry.mjs`, `signing-ceremony.mjs`, `po-human-approval.mjs`): no stored status, record shape, digest or key byte, no gate, signature, approval, Critic evidence or audit bundle semantics. The retry bound stays a private constant of `po-human-approval.mjs` (exporting it would touch a file outside the write list); the test states the number 3 and ties it to the printed `3 passphrase attempts` line.
- No decision was taken on how many decision points a decline SHOULD have: the product decision already exists (C30I-S6), so no stop was needed.
- Other test files that write CRLF fixtures into a temporary git repository may be affected by a user-level `core.autocrlf` the same way; none was searched for or touched here (outside the write list). A fixture that depends on stored line endings should set `core.autocrlf=false` locally as this case now does.

## Not proven

- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only. Verify, an independent Critic review and PO acceptance remain open.
- The hermetic fix was proven on a machine whose user config has `core.autocrlf=input`; it was not run with `core.autocrlf=true` or on Windows. A local `false` overrides any user-level value, so it should hold, but that is reasoning, not a run.
- Tests run (each alone, in the clone, private TMPDIR): `lib/critic-evidence-carry.test.mjs` 18 of 18 pass; `scripts/signing-ceremony.test.mjs` 5 of 5 pass; the held-patch check file 2 of 2 pass. No other suite was run.
