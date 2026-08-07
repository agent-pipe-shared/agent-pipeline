# Critic review: PHX-2 additive ledger design (commit `ad49c48`)

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max.
**Reviewed object:** `specs/sprint-phoenix-epic/design/phx-2-additive-ledger-authority.md`, commit `ad49c48`.
**Verdict: FAIL — material rework needed before implementation.**

## Findings

1. **MAJOR — `repositoryFingerprint` derivation uses the wrong root, breaking worktree-invariance for the exact threat §1 names.**
   §2/§3 propose sourcing `primaryRoot` from `guard-push.mjs`'s `projectDir` (`fallbackProjectDir()`, worktree-local `git rev-parse --show-toplevel`) and `pipeline-state.mjs`'s CLI-derived `dir` — not from `discoverRepository(...).primaryRoot` (`worktree-lifecycle.mjs:231`, `dirname(commonDir)`), which every real call site of `derivePoGateRepositoryFingerprint` in the codebase (13 occurrences) actually uses. The design's inline comment claiming `guard-push.mjs` already has "existing git-common-dir resolution" is false (zero matches). Consequence: two worktrees of the same repository land in different fingerprint buckets — exactly the "fresh `git worktree add`" scenario §1 point 1 claims to defend against, and this repo's own convention of running Verify in a detached worktree makes this a live, not hypothetical, path.

2. **MAJOR — the write mechanism never creates its parent directory; first use everywhere throws `ENOENT`, and recovery is blocked by an existing, unrelated guard.**
   §3's `writeFileSync(path, json, { flag: "wx", ... })` has no `mkdirSync` step. §5 itself states "on day one... zero existing repositories have a populated external ledger" — guaranteeing the ledger directory doesn't exist on first `approve-push` anywhere. The failure hits AFTER the existing local write (`pipeline-state.mjs:5204-5215`) already durably persisted `criticalProofConsumption` for that `proofSha256`; a retry with the same proof then hits the pre-existing `CRITICAL-PROOF-REPLAY` guard (`:5196-5199`) and is refused — requiring an entirely new human Ed25519 signing ceremony to recover from what would be a one-line fix. §4's failure-mode taxonomy has no entry for this.

3. **MAJOR — the integration point is structurally unreachable in `chat` mode, contradicting the design's own "alongside the signature/chat gate" framing.**
   `criticalProofWaiverFor` returns `waived: true` for `chat` mode; `guard-push.mjs`'s entire `authorizeRecordedPush` branch (the only place the new check is nested inside) is gated on `!pushWaiver.waived` (`:1646`) and is skipped whole for chat mode (confirmed independently by `guard-push.test.mjs:595-616`). The write side is symmetrically skipped (`verified.proof !== null` is false for chat). Net effect: any project running `gates.push_approval: "chat"` gets zero enforcement benefit from this feature regardless of the new flag — undisclosed as such in the design.

4. **MINOR** — §3 justifies skipping encrypted-record machinery on secrecy grounds, not integrity/tamper-resistance grounds, though the real limitation (ordinary filesystem access suffices to delete the marker) is adequately disclosed elsewhere in §1/§6.

5. **MINOR** — the `wx`-flag atomicity claim is stated unconditionally without a non-local-filesystem (e.g. NFS-mounted `$HOME`) caveat.

**Trajectory check: inconsistent** — otherwise unusually high citation precision (~12 exact `file:line` cites checked, all correct), but 3 concrete claims (git-common-dir resolution existing, "alongside signature/chat," "entire net-new surface") do not hold under direct verification.

**Briefing violations:** none.

## Disposition

None of the findings require abandoning the additive-layer approach; the Critic explicitly frames each as "a focused, well-scoped revision." Next step: a rework dispatch addressing all 3 MAJOR + 2 MINOR findings, followed by a delta Critic re-review (bounded to the corrected sections plus the affected invariants — same TASK_ID / finding IDs referenced, not a fresh full review) before any implementation dispatch proceeds.
