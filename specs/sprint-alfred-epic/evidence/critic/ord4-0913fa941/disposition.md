# Disposition: ordinal-4 correction review of 254ff0002..0913fa941

Review object: the 29 enumerated commits `254ff0002..0913fa941` (head tree `0d42f1f76`), Critic on
`claude-opus-5-5` at max, functional-equivalent-read-only lane, route pre-check passed. Verdict:
PASS, with three minor findings (F-A, F-B, F-C). The report is `critic-notes.md` beside this file.
The review is advisory, like the three before it: no finalizer receipt exists for this batch, and
D62 puts that missing route into the next candidate (AC-142).

This was the batch's last review (D35, D59). PASS stops the batch; the minor findings are fixed
without a further review of this batch, and their fixes are reviewed with the batch that carries
the D61 work.

The PASS does not clear two checks, and the Critic says so: the bound targeted diagnostic is red
(`check-doc-contracts.test.mjs`, 3 of 76; routed by D60 to the evidence exemption) and Full Verify
was not run (D57 orders it after the PO's local test). The PO installed the candidate `0913fa941`
and has reported no local-test result for it yet.

| ID | Severity | Disposition |
| --- | --- | --- |
| F-A | minor | Accepted. The C2 pin `plugins/pipeline-core/lib/pins/resume-hint-inspect-is-admitted-in-every-lifecycle-state.test.mjs` is registered in neither `harness/verify-suites.json` nor `verify.mjs`, so no boundary runs it. Registration changes the protected `verify-suites.json` (TP-13), so it joins the bundled signed sitting of D61. |
| F-B | minor | Accepted. `guardrails/git.md` lines 125 and 126 (and the vendored copy, same blob) still name a missing ledger directory as a blocking condition, which the ledger helper now repairs by creating the directory. The two lines are corrected to name a real append failure only, and the vendored copy is regenerated. |
| F-C | minor | Accepted. `session-authority-repair.mjs take-over` writes its record and returns `refused` (`SAR-TAKE-OVER-INCOMPLETE`, exit 2) after it may already have cancelled some slices, so a refusal can carry changed state. The fix gives a partial run its own status that names what was cancelled and what was refused, writes no record when nothing was cancelled, and adds a test for the refused branch. |

Not verifiable for the Critic: whether the three doc-contract failures predate the range. The
clone proof `scratch/dc-head-proof.json` of 2026-10-20 measured them at the head before this
review; it is coordinator input and was not handed to the Critic.
