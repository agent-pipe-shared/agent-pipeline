# Delta Critic re-review: WP2-WP3-partA-rework-1 (F1/F2/F4/F5)

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max. Effective model identity: unknown (no direct same-dispatch route evidence observed).
**Reviewed object:** enumerated commits `d63b858`, `e5db7df`, `7aa84f0`. **Range correction (Critic's own disclosure):** the dispatch's suggested `77a7d79..7aa84f0` spans 11 commits (WP5/PHX-2 rework landed in between); the Critic applied its own fallback rule (`d63b858^` = `b911d50`) and reviewed `git diff b911d50..7aa84f0`, independently re-confirmed via path-restricted `git log 77a7d79..HEAD -- <4 touched files>` = exactly these three commits.
**Verdict: PASS** — no blocker; 4 non-blocking findings (1 major, 3 minor).

## Findings

### F-A (major) — Part A's attestation is inert in the real installed topology; design doc not amended, code cites a §A.7 exclusion that does not exist

The F2 fix gates the whole attestation behind a real `.git` two levels above `pluginRoot`. Design §A.5 case 2 names "non-git flat-copy install" as folding into case 1 (`plugin-refresh-required`); after this diff that case instead falls through to `ready` with attestation never attempted. Verified empirically against this machine's real installed layout (`~/.claude/plugins/cache/{agent-pipeline,agent-pipeline-local}/pipeline-core/<version>/` — no `.git` two levels up). §A.1's stated guarantee (rejecting a forked/altered marketplace clone) is now delivered only inside a self-application/dev checkout — nowhere in the topology the plugin actually ships to. The new code comment ("explicitly out of scope; see the design doc's Part A") is not supported by §A.7's actual exclusion list. QG-06: a known risk "mitigated" by a comment with no owner/expiry, whose citation is inaccurate.
Evidence: `pipeline-start-preflight.mjs:257`, `:251-253`; design doc `:367-373` (§A.5), `:438-459` (§A.7), `:88-99` (§A.1).
Critic's own note: the fix direction itself is a defensible narrowing versus the pre-fix permanently-broken state (not a regression) — what's missing is that the contract still describes the opposite behaviour.

### F-B (minor) — the new gate-deciding line is not GS-8-class protected

Design §A.3 item 3 added GS-8 specifically so the gate-deciding constant can't be silently weakened. The F2 fix moved an equally gate-deciding decision (whether attestation runs at all) into `pipeline-start-preflight.mjs:257`, which GS-8 does not cover — the exact hole GS-8 was added to close is reopened one level up. Kept minor: file stays under Verify/Critic/PO gate.

### F-C (minor) — new unstubbed test fixture assumes `os.tmpdir()` is already its own realpath

`buildSelfApplicationGitFixture()` never canonicalizes its `mkdtempSync` root; the real observer fails closed on `realpathSync(path) !== path`. Portability risk on macOS/Windows tmp-path layouts (same class as two existing backlog items on native-Windows Verify brittleness), not a present red — passed 32/32 on Linux here.

### F-D (minor) — helper JSDoc overstates layout-equivalence to `resolveSourceLayout()`

The comment claims the new `.git`-presence check is "the exact layout `resolveSourceLayout()` requires"; that function checks three different, unrelated conditions and no `.git` at all. Currently latent (the two happen to coincide for the current cache layout) but misleads a future reader (QG-05).

## Per-finding resolution status (F1/F2/F4/F5)

- **F1 (blocker) — resolved.** 14,782 bytes vs 15,000 budget; measured payload 14,836; suite green; substance of both design-required SKILL.md edits retained.
- **F2 (blocker) — resolved as to the blocker.** Attestation no longer permanently fails; V4 onboarding no longer permanently suppressed — verified against the real installed layout. Carries F-A/F-B/F-D as residuals of *how* it was resolved.
- **F4 (major) — resolved.** Three new cases genuinely reach the real per-runner default-observer line with no stub, against real git fixtures. Carries F-C as a portability residual.
- **F5 (minor) — resolved.** `observe:` DI override short-circuits before any subprocess/tree-hash; hermetic again.

## Independent assessment of the F3/F6 "structurally blocked" claim — holds, verified against guard sources

- **F3:** `verify.mjs` has no config-driven registration (hardcoded `TEST_SUITES` array) — edit is unavoidable. TP-3 refuses Edit/Write. Both override routes are closed: guard-testpath's HGO branch only admits when `gates.push_approval === "chat"` (this repo is `signature`); GMW requires a genuine detached Ed25519 proof `installGuardMaintenanceWindow` cannot proceed without. Claim holds.
- **F6 — holds, with a correction to the dispatch record.** The dispatch record names `.claude/guard-config.json` (GS-7) as F6's target, but **both** `project/guard-config.json` (GS-4) and `.claude/guard-config.json` (GS-7) exist in this repo, and it is `project/guard-config.json` that actually carries the live `protectedTestPaths` TP-1..TP-10 list the new TP-11 entry needs to join. Neither GS-4 nor GS-7 is in GMW's liftable set (`isLiftableRuleId` admits only `GS-6`/`TP-*`) — the blocked disposition is correct either way, but **the PO should apply the F6 fix to `project/guard-config.json`, not `.claude/guard-config.json`.**
- Neither F3 nor F6 is a QG-06 evasion (both are guard-refused, not deferred by choice, and both dispositions carry exact content for direct PO application). The review's QG-06 finding is F-A, a different thing — a gap closed by a comment, not by a guard.

## Deliberately not flagged

Spec fidelity (F1/F4/F5 measured directly), scope (exactly 4 files, one concern per commit), authorship (all 3 commits carry `Dispatch: WP2-WP3-partA-rework-1 (goldfish)` + `AI-Assisted: true`, dispatcher `goldfish-deep` per dispatch record — no lifecycle violation), model tier (claude-sonnet-5, correct default for implement-tier, no rationale owed), test integrity (no pre-existing test weakened; both touched files absent from `protectedTestPaths`), F4's real-subprocess coupling to `codex` (deterministic, bounded, necessary to prove the branch), F4(b)'s negative-assertion logic (traced — status difference can only come from `attestationFailed`), edge cases around the new gate (fail-closed on `existsSync`/realpath in every direction), security surface/dependencies (no secrets, no new registry dependency — every new import is a Node builtin), language (ADR-0011, all new prose English), one pre-existing SKILL.md tension outside the review range (not touched by this diff).

## Trajectory check

**Consistent.** Independently re-ran both changed suites (`pipeline-start-preflight.test.mjs` 32/32 including all 5 new named cases; `bootstrap-payload-measure.test.mjs` silent/exit 0) against the evidence artifact's claims — exact match. Candidate/tree pair in the evidence artifact matches the enumerated head commit; the artifact's own Elephant-run disclosure (not a `verify.mjs` substitute) is the correct QG-03/QG-05 shape. Confirmed independently that the four touched files are byte-identical between `7aa84f0` and the working tree it was evaluated at (`cedd58a`).

## Briefing violations

One, non-blocking: the dispatch referenced the prior full Critic review's path (fenced by the dispatch itself as reference-only, not to be read as new input) — not opened, worked exclusively from the neutral findings registry. One dispatch inaccuracy (not a contamination): the stated base `77a7d79` over-includes 8 unrelated commits; the dispatch's own fallback rule was applied. No implementor justification prose, no claims-to-verify list, no expectation-conclusion framing reached the Critic.
