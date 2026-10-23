# K140-READER-COURSE-SCOPE notes

Dispatch K140, Sonnet 5.5, ruleset 0.7.0+claude.20261022204428.79cda46. Base: `scratch/clones/k133` (HEAD `12149c72c`, sitting commits present).
Work clone `scratch/clones/k140` (carries the edits, uncommitted); throwaway `scratch/clones/k140-check` (diffs applied for real). Main checkout untouched except `scratch/agent-out/K140-*` and `scratch/k140-apply.mjs`.

## Cause
`verifyTerminalReaderCourse` builds `expectedPaths` from the current course's rounds only, then refuses any path ever added in
`phase-one/`, `phase-two/`, `disposition/` outside it (`unlisted fourth or renamed committed round`) and requires the ls-tree to equal it.
The older course of `sprint-alfred-epic` lives in the same directories (K137 blocker 1).

## Change (smallest reading, nothing read from the protocol, protocol text NOT changed)
`harness/scripts/doc-reader-terminal-binding.mjs`: exported `HISTORICAL_READER_COURSE` = {featureId `sprint-alfred-epic`, four rounds with the
sha256 of each phase-one/phase-two report}. For a v2 record of that feature only, before the history rule: each of the eight reports must exist
at the candidate with the listed digest (`blobRef`) and have exactly one committed change (`log --full-history --no-renames`), then its path is
added to `expectedPaths`. The history and ls-tree lines (also the line the existing "fifth round" mirror anchors on) are byte-identical.
Round ids are the file stems (`round-20260923a` ...; the current ones are `round-20261023a/b`): the checker takes the report path from the round id, as K137 noted.
Unchanged by construction: v1 records, other features, the 2-3 round bound, the third-round escalation rule (`afterRound: 2`, prelaunch source), dispositions
(an older-round disposition file would still be refused), owner/batch/final rules. Deleting or changing a historical report fails (missing blob / digest mismatch / immutable history).

## Pin (`bounded-reader-terminal-binding.test.mjs`, extended, no new file, no existing line changed; +5 cases and a v2 fixture)
Oracle = the real committed report bytes (fixtures copy them from `specs/sprint-alfred-epic/...`), so a wrong digest in the list cannot pass.
(a) 4 historical + 2 rounds pass (12 reports in the tree); 3 rounds with escalation pass; escalation missing / `afterRound: 1` still fail.
(b) extra `round-20261023d` fails with the existing text, also after deletion; an unlisted older-looking id `round-20260928a` fails.
(c) historical bytes changed -> `historical-course report digest mismatch`; deleted -> `... is missing or not a regular blob`; overwritten+restored ->
`historical-course report immutable history`; same files under another feature id -> existing unlisted text.
(d) fourth round of the current course: committed evidence (also deleted) -> existing text; fourth record entry -> `bounded 2+1 course`.
A current round re-using a historical id was considered and dropped: it is already refused by the unchanged per-round checks (commit ancestry), so a dedicated rule would be dead code.

## Counted results (pin alone: `node --test scratch/clones/k140[-check]/plugins/pipeline-core/lib/pins/bounded-reader-terminal-binding.test.mjs`)
- BEFORE (old pin, old checker, k140-check): 16 tests, 16 pass, 0 fail.
- RED (new pin, old checker, `--test-name-pattern="^v2:"`): 5 run, 0 pass, 5 fail; first failure `BINDING terminal Reader: unlisted fourth or renamed committed round`
  (the exact K137 text), the digest case fails with that text instead of `digest mismatch`. Cases (b)/(d) assert a passing control first, so they go RED with it.
- AFTER (k140, and again in k140-check with the two diffs applied for real): 21 tests, 21 pass, 0 fail.
- Neighbours, k140: `harness/scripts/doc-reader-terminal-binding.test.mjs` 9/9; `harness/scripts/doc-reader-course-budget.test.mjs` 24/24;
  `harness/scripts/check-consumer-safe-paths.test.mjs` 9/9; `node harness/scripts/check-doc-contracts.mjs` exit 0 (2577 files, 1977 links).
- `architecture-boundary-check.mjs --root <clone>`: 21 violations before (k133) and after (k140), all pre-existing `unowned-path scripts/*.mjs`; no over-line-bound, no new finding.

## Diffs (`git apply --check` clean against k133 state, then applied for real in k140-check; also clean against the main checkout)
- `K140-checker-protected.diff`: `harness/scripts/doc-reader-terminal-binding.mjs` (+27 lines). MEASURED: this path is in neither `protected-baseline.json` nor the kernel
  list (`guard-maintenance-window.mjs`), and the Edit tool wrote it without a guard stop; the file name is kept as briefed. It can be committed as an ordinary file.
- `K140-checker-unprotected.diff`: the pin (+~85 lines).
- No ratchet diff (no line bound exceeded). Messages: `K140-msg-protected.txt`, `K140-msg-unprotected.txt` (trailers `AI-Assisted: true`, `Dispatch: stage-0 (elephant)`).
  Suggest one atomic commit order: checker first, then pin (the pin is red without the checker).

## Risks / open items for the Elephant
- `harness/reader-review-protocol.md` ("Reject extra committed round evidence ...") now has an undocumented exception for the older course. Adding a sentence changes the
  protocol bytes = a Reader input (readerProtocolSha256, plugin mirror `plugins/pipeline-core/reader-inputs/`), so I did NOT touch it; decide whether the final batch carries it
  (it would need the policyTransition) or whether the exception stays documented only in the checker comment and the PO decision row.
- The checker now changes after the K137 reviewed commits only if committed after them; it is not a Reader input/doc, so it does not move the docset digest.
- Real-repo end-to-end with the K137 record was not re-run (record not committed; forbidden to run the finalizer). Digest correctness is shown by the pin using the real bytes.
- Clone `scratch/clones/k140` still carries the two edits uncommitted.

Implementation complete in clone; independent Critic read, operator commit and PO acceptance pending.
