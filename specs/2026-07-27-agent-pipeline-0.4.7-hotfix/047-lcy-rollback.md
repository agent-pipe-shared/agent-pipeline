# 047-LCY rollback plan

This agent-facing plan is governed by AC-047-27.

- Before apply, any refusal is zero mutation; do not attempt a manual State edit.
- After successful continuity adoption but before close, use the sanctioned bounded recovery or ordinary close path. Do not edit `.claude/pipeline-state.json` manually.
- After commits, rollback is an ordinary revert commit followed by a fresh plan and readback-gate run. Tags and releases are never rewritten.

The owner is the 0.4.7 release PO. Review this plan before the 0.4.7 release; it expires at that review point. This document makes no completion or release claim.
