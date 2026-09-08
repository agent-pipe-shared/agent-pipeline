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

## Resolution — 2026-09-08

Before repair, the separate executable reproduction supplied valid section
selection and acknowledgement in disposable fixtures. `--dry-run`, `--check-size`
and an unknown option each returned zero while changing the fixture handover
and creating an archive. This stronger observation is preserved in
`scratch/handover-cli-ignored-mode-reproduction-20260908.json` and its adjacent
capture; it does not describe a rotation of the actual repository handover.

The bounded follow-up implements the published read-only modes in
`handover-rotate.mjs`. `--check-size` now requires `--root`, accepts the
published `--file` alias as well as `--handover-path`, and reports the shared
`utf8-byte-upper-bound` measurement against calibrated `handover.maxBytes` or
the actual 30,000-byte default. It exits nonzero over that cap without creating
an extraction marker, archive, or governance entry. `--dry-run` also requires
`--root`, validates the same current section-scoped extraction acknowledgement
as a real rotation, and prints only a bounded archive-plan summary without
writing. Unknown, incomplete, conflicting, and incompatible CLI options now
refuse before a writer can be selected; read-only file resolution rejects an
escaping handover symlink.

The retained red reproduction is
`scratch/NVA-B-HANDOVER-CLI-MODES-1/handover-rotate-red.txt`. The prior focused
green capture is retained as
`scratch/NVA-B-HANDOVER-CLI-MODES-1/handover-rotate-green-pre-byte-accuracy.txt`.
The follow-up byte-accuracy regression proves that size mode uses the raw file
byte count, including valid multibyte text plus a non-UTF-8 byte, rather than
decoding and re-encoding content:
`scratch/NVA-B-HANDOVER-CLI-MODES-1/handover-rotate-byte-accuracy-red.txt` and
`scratch/NVA-B-HANDOVER-CLI-MODES-1/handover-rotate-byte-accuracy-green.txt`.
The existing measurement, handover-guard, documentation-contract, and
consumer-safe-path captures remain alongside them. These captures demonstrate
the repaired command contract only; they do not assert candidate readiness or
authorize a real handover rotation or extraction acknowledgement.
The parent diff proof at `scratch/handover-cli-test-preservation-20260908.json`
also confirms that no pre-existing test assertion was removed or changed.
