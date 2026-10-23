# K144-FV-GUARD-DISPATCH notes (base 714dea68e; ruleset 0.7.0+claude.20261023185750.bd9ee06)

Deliverables (scratch/agent-out/): K144-protected.diff (3 files), K144-unprotected.diff (2 files, also committed in
the clone as 12632b793 + 6bdb68a0f), K144-ratchet.diff (architecture/boundary-policy.json, codex test 1407 -> 1413),
K144-msg-protected.txt, K144-msg-unprotected.txt. All three diffs: `git apply --check` ok and applied in the throwaway
clone scratch/clones/k144-check. Counts below: alone, private HOME and TMPDIR, base then fixed (check clone).

## Per step
1. antigravity-native-dispatch-pretool-tests (0/8 -> 8/8): REAL PRODUCT DEFECT, option (a). Cause: hooks/guard-dispatch.mjs
   (D84 block, ~line 735) evaluates the model rule with runner "claude" for every Task/Agent call; the Antigravity adapter
   (antigravity-pretool-guard.mjs normalizeAntigravityToolInput, ~line 268) relabels native invoke_subagent as "Task" and
   keeps the Subagents array, which has no tool-layer model (model rides in the prompt text). So EVERY native Antigravity
   dispatch was refused with DISPATCH-MODEL-MISSING, unrepairable. 3534b0ab8 had said Antigravity "not covered", the
   adapter relabel made it covered. antigravity-pretool-guard.test.mjs had been given `model: "sonnet"` args to get past
   it (hid the defect; still green, now unnecessary, its AGY_TOOL_LAYER_MODEL comment is stale). Fix (protected, net 0 lines):
   runner = Subagents array ? "antigravity" : "claude" (evaluateDispatchModel already gives such runners no opinion).
   RED pin GDM04 in guard-dispatch-model.test.mjs (3/3 -> 4/4; RED on unchanged hook with DISPATCH-MODEL-MISSING).
   Greenfield on Antigravity is unblocked only after the operator applies the protected diff and re-stamps.
2. guard-dispatch-native-worker-tests (3/4 -> 4/4): NOT the model rule. GD15m runs in repoRoot; the repo State has an
   approved feature, so the guard demands its slice-queue.json (untracked, gitignored: specs/*/slice-queue.json) and refuses
   SQ-DELIVERY-COURSE-ABSENT before the briefing check. Green only in the checkout owning that file; red in every clone.
   Test-only fix (protected glob): own governed fixture without active feature, same assertion.
3. agy-session-dispatch-tests (6/7 -> 7/7): stale fixture. The delivering finalize ran outside f.runtime.run;
   withSourceOwnedAgyHostObservedPublication needs an active source-owned requester (AGY-HOST-STORE-REQUESTER-UNAVAILABLE),
   surfaced as recovery-required / AGY-FAMILY-FINALIZE-PRIVATE-STORE. Fixed by wrapping the call.
4. codex-pretool-guard-tests (28/37 red -> 16/37 red; the classification's "13" undercounted): PARTLY FIXED, not closed.
   Fixed: (a) fixture used profile "feature"; epic/feature drafts bind unapproved (finalPackageProfile, 1bd1d7bf6) so the
   product never stops for design/ack: stale fixture, now "mini" with an authored PRD/spec + intake-spec-marker route (as the
   Antigravity fixture); (b) test 3 SessionStart descriptor now ships ` --runner codex`: restated (QG-04, equal strength).
   Still red (16): tests 8,10,11,22-25,27-32,35,37 all use fixture() = tmp dir with only `.claude/`; the adapter now exits 0
   with EMPTY stdout (no deny) because that root is not governance-enrolled (observeGovernanceScope; same for the probe
   scratch/k144-codexprobe.mjs). Likely the fixture needs enrollment (recordConsentGiven as in guard-dispatch-model.test.mjs);
   NOT verified, and test 30 ("ungoverned repository") needs the opposite. Test 16: denial now prints `Step: plan` and says the
   plan JSON gives the mode-specific steps, test expects `Step: prepare-authorization`/`Step: authorize`: stale text, not
   restated. These need the next dispatch (codex fixture governance + ceremony text), ~12 net lines more.

## Other checks (check clone, after)
guard-dispatch-model 4/4, antigravity-native-dispatch-pretool 8/8, guard-dispatch-native-worker 4/4,
dispatch-model-enforcement 9/9, antigravity-pretool-guard exit 0 (was 0 at base), agy-session-dispatch 7/7,
check-doc-contracts valid, architecture-boundary-check: only the 23 known `unowned-path` scripts/*.mjs findings (briefing said
22; present at base too), no line-bound finding with K144-ratchet.diff. check-consumer-safe-paths.test.mjs not run (budget).

## Risks / open
- Tool budget exceeded (about 2x) because of 6-minute suites and diagnosis; no work lost.
- Protected diff touches guard-dispatch.mjs (kernel path): operator commit, then re-stamp for the Antigravity fix to ship.
- GDM04 and the codex "mini" change are covered by one full run each only in the check clone; codex 16 remaining listed above.
- Debug probes only under scratch/k144-*; scratch/clones/k144-check was patched with debug lines during diagnosis, then re-cloned clean.

Implementation complete in clone for steps 1-3, step 4 partial; independent Critic read, operator commit of the protected parts and PO acceptance pending.
