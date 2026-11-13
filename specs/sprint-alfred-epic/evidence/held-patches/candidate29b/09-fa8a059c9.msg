fix(guard): a plain cp of a gate-strength file into scratch is a fixture copy

Codex greenfield run 3 (C5/A02): copying the calibration into a scratch
test fixture (`cp <calibration> scratch/<fixture>/...`) was refused as
GUARD-GATE-STRENGTH-SHELL by the file name alone. Reading the protected
file is allowed and the written path is inside scratch. The bounded
scratch-only shape already admitted `cp -- <source> <scratch target>`;
it now also admits the plain two-operand form when neither operand
starts with `-`. The target must still pass the physical scratch
boundary (no traversal, symlink or hardlink); a copy onto the protected
file and every option form stay refused.

Checkpoint-Intent: candidate 29, Codex run 3 C5
AI-Assisted: true
Dispatch: stage-0 (elephant)
