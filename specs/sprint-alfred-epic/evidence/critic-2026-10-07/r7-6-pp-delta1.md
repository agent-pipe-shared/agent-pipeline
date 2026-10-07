# Critic record — R7-6 key directory (push-prepare / toolchain-preflight part), delta 1

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: 292eeabfc, 826d00a0a, ac3ec248a, 6ae79760d, 5fa3610ca (base b6e529fd0).
- Verdict: **withheld — partial review** (checkpoint; `guardrails/security.md`, `project/pipeline.json` not read). Three minor findings. Trajectory: not verifiable (no toolchain-preflight evidence after 292eeabfc, no pre-fix RED artifacts, no HEAD binding in evidence files, no stripped record for 5fa3610ca).
- FS-1 minor: 5fa3610ca dropped the absolute-path anchor of the `PIPELINE_STATE_SCRIPT_PATH` assertion (`push-prepare.test.mjs:765`) instead of making it separator-neutral (QG-04 weakening).
- FS-2 minor: a relative key directory from the environment is "unset" in `toolchain-preflight.mjs:402-417` (repair `set-po-key-directory`, which cannot clear it because the environment outranks the plane) but a usage error in `parseHumanArgs` (`po-human-approval.mjs:840-843`) — resolvers not aligned (row AC; test-list 4).
- FS-3 minor: F5's invalid-legacy-store branch (`repo-scope-invalid`, `po-key-directory-store-valid`, `toolchain-preflight.mjs:412`) is run by no test (QG-07).
- Registry: F4 resolved for these two entry points; F8 not resolved (out of range); others out of range.
- Disposition: R7-6-T15 (test-only) restores the absolute check separator-neutrally, pins FS-2 and FS-3 and test-list 12's second clause (delta 1 F-2); then R7-6-F8 fixes FS-2 (and anything T15 turns RED); delta 2 after R7-6-P and F8, with budget ≥30 and evidence carrying HEAD.
