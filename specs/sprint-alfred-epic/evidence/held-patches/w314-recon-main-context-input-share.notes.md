# w314 — recon note for lane L18 of candidate 31 (which pipeline outputs dominate the Elephant's context, and the smallest compaction builds)

Order: apply AFTER the base clone of candidate 31 (`scratch/agent-out/c31/base`): the patch is the delta `35560870d72821ef9db6ce1dbbe9f296da0d1ca0..HEAD` of the clone slice C31-R4 and was checked against that base. It adds one new file, `specs/sprint-alfred-epic/plans/recon-l18-main-context-input-share-2026-11-18.md`; no code, test registry or document changes. The criterion binding AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- One recon note (87 lines): per finding PROVEN / INFERRED / NOT MEASURED with file and line, the measured printed sizes of the read-only outputs, what already has a compact form, the five largest refusal texts with bytes, the smallest builds with failing-first proof and the facts that must stay, a ranked proposal and the PO decisions with defaults.
- Findings in one line each:
  - The start preflight is already compact (file plus short line, candidate 28c); the plan premise "large script JSON kept in context" is only partly the cause.
  - The grammar refusal listing is already trimmed from the second refusal of the same code (3.6 to 3.9 KB first, 0.5 to 0.9 KB repeat), but the trim key is the code, so a different code prints the whole listing again (seen live), and on Antigravity the key is empty (the payload carries `antigravity_conversation_id`, no `session_id`; probe: three calls, three full listings). Smallest build B1.
  - Pretty printing costs 17 to 21 percent of the bytes of `inspect`, `feature-package-inspect` and the onboarding inspect; `finish-feature`, `prepare-dispatch`, `dispatch-briefing` and 26 `pipeline-state` sites print with indent 2.
  - No existing tool attributes tool-result bytes per script, so the 64.5 percent cannot be split; build M0 (extend `usage-ledger.mjs --timeline`, derived, nothing stored) rides lane L17.

## Checks

- `node --test specs/sprint-alfred-epic/evidence/held-patches/w314-recon-main-context-input-share.check.test.mjs` asserts that the patch exists, is non-empty and touches only the note. It was written first and was red (exit 1, patch missing) before the note existed.
- The patch was saved with `save-patch.mjs` against the base clone: `apply --check on scratch/agent-out/c31/base: exit 0`. An `apply --check` against the real repository is expected to fail until the base clone is applied; the check test does not run it.
- Measurements were taken by throw-away node scripts under `scratch/agent-out/c31/r4-measure/` (untracked, not delivered: the write list admits only the three files and the note). They ran only read-only commands: `pipeline-state.mjs inspect` and `feature-package-inspect`, `project-onboarding-v3.mjs inspect`, two `--help` outputs, and the pure refusal builders. Their method is stated in the note.

## Not changed / not proven

- Analysis only: no production code, no product test, no mutating producer run. No Critic round (suspended by the PO for candidates of this repository) and no Full Verify ran: this change is verified by the plain file test only.
- Not measured (named in the note): the preflight's printed line, the bytes of `finish-feature --one-shot`, `critic-dispatch-preflight`, `prepare-dispatch critic`, `session-critic-finalizer`, `close-coordinator drive` and `register-feature-package` (mutating or need a live feature), any token count, the Antigravity hook chain end to end, post-compaction behaviour on Antigravity, and the run transcripts behind the plan's 64.5 percent, 228 turns and 97 refusals (taken from the plan, not re-derived).
- The note builds nothing and changes no gate, signature, approval, record shape or digest byte; every build it proposes is staged, test first, and each carries a PO decision with a default.
