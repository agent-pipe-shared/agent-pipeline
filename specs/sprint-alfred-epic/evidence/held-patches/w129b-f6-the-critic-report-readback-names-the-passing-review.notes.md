# w129b — F6: the critic report readback names the passing review

Found by the Codex greenfield run (P1): after three review rounds (FAIL, FAIL, PASS) the close quality readback row `critic-report-file` pointed at the first report, an old FAIL, so a green row sat over a failed historical report.

Cause (read in the source): `criticRow` in `lib/close-quality-readback.mjs` returned the first packet in listing order that holds a `report.md` and never looked at the verdict.

Change: the row now reads each packet's `receipt.json` through the existing injected `readBytes` reader and uses its `reviewPass` flag. A passing round wins (the last passing one in listing order; the receipts carry no timestamp, so listing order is the only order available and the notes say so); when every readable round failed, the row is `missing` with a remedy saying no passing review exists for the final candidate; when a receipt cannot be read the legacy answer is kept, because the readback never claims what it cannot read. The row shape and the five row ids are unchanged. The readback stays a readback, not a gate.

Test: one new case in `close-quality-readback.test.mjs` (FAIL, FAIL, PASS names the third; PASS, FAIL, FAIL keeps the first; all FAIL is missing with the remedy; no readable receipt keeps the legacy answer). The suite is 9/9. The new case was written with the change; RED against the old code was not run separately.

Not proven: no real close ran with the new row; which of several passing rounds is "the" final one rests on listing order. A candidate-bound selection (the receipt's candidate commit against the closing candidate) is not done here.
