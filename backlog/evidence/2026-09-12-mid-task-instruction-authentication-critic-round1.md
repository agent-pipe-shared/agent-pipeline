# Mid-task instruction authentication — Critic round 1

Date: 2026-09-12
Assurance: `functional-equivalent-read-only`; OS isolation was not asserted.
Reviewed range: `f6d2222b79c8f3507ab3d1ecd6ef3004d43da5ac..f413cc825f88d140d73a93a9f629a169748b5062`

## Verdict

`FAIL` with three blocker findings.

The Critic accepted the substantive receiver rule, its distinction between
procedural continuation and authority-changing messages, canonical/vendored
parity, reachability through templates and shipped agents, and the focused
candidate-bound test evidence.

## Required corrections

1. Add a current candidate-bound threat-model record for the instruction
   authority boundary and state its approval status honestly.
2. Add the repository's `SPDX-License-Identifier: SUL-1.0` notice to the new
   executable test.
3. Record an explicit rollback and recovery plan for the change.

No native Codex sandbox or App-Server readiness under WSL was used or claimed.
