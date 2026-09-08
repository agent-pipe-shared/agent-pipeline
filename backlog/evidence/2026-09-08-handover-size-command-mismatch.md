# Published handover size command does not match its CLI

During the canonical handover update at source commit
`9f07a1e89dbf7f3dc8c49a199dd5968e31e7d68b`, the command published in
`plugins/pipeline-core/skills/close-block/SKILL.md` step 6c was invoked:

`node plugins/pipeline-core/scripts/handover-rotate.mjs --check-size --file docs/state.md`

It exited 1 with `--root <repository-root> is required`, before mutation.
The repeatable command capture is
`scratch/handover-size-command-mismatch-20260908.txt` (wrapped exit 1).
Inspection of `handover-rotate.mjs`'s `parseArgs` and CLI branch additionally
confirms that `--check-size`, `--file`, and the same paragraph's `--dry-run`
are not implemented. The supported override is `--handover-path`; the CLI
branches are status, extraction acknowledgement, and rotation. Adding a root
alone therefore would not make the documented size/dry-run command valid.
No rotation or acknowledgement was attempted.

The existing `measureHandoverBytes` library function does measure the file
against the 30,000-byte cap when passed a numeric byte count. Its successful
local readback measured 26,991 bytes before this follow-up was appended.
This is a size observation, not an exact token count or a rotation receipt.

The command/interface mismatch is a source-backed follow-up. No new CLI,
test, skill behavior, or approval mechanism was implemented in this checkpoint.
Resolve the published workflow against the existing measurement and rotation
contracts in a bounded follow-up; do not treat the failing command as a usable
close gate. The initial malformed phase-check invocation and a Buffer passed
to the numeric measurement helper were separate caller errors, corrected
locally; they are not additional product defects.
