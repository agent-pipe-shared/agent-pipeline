fix(antigravity): the close's cost row over the session transcript is a read, not a brain write

A second Antigravity greenfield report: usage-ledger.mjs --row --antigravity-transcript <brain transcript> was refused as AGY-NATIVE-BRAIN-WRITE, because the guard refuses any shell command that names the host-owned brain directory unless it is a plain read or the exact timeline read. The command only prints a token row (no file is written), so the refusal left telemetry/costs.md empty and the run without a cost figure.

nativeBrainWriteRefusal() now also admits exactly `node <...>/scripts/usage-ledger.mjs --row [label] --antigravity-transcript <file> [--model <name>]` with no shell operator, the same shape as the existing timeline allowance. Another script, a redirect or chained command, any other flag (--out), a second path, and the flags in another order stay refused; the timeline pin is unchanged. A case pins the admitted and the refused forms.

AI-Assisted: true
Dispatch: stage-0 (elephant)
