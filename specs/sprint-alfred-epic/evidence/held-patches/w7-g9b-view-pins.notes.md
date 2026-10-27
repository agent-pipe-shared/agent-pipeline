# W7 G9b Slice A (view pins): STOPPED, recon contradicts the code, no patch

Candidate 775c543ab4fff0af8d6ec55417b82ca09f67a462. Work done in a scratch `git clone --shared` at the candidate; the repository tree was not edited. No patch is delivered (`w7-g9b-view-pins.patch` does not exist) because neither recon case can be written green without a production edit.

## Finding

Both Slice A cases in `w7-recon-g9b-active-view.notes.md` section 3 are expected green "against the unchanged code". Both are RED, for code reasons the recon did not see:

1. `unreadable registry keeps the older view readable` (AGV-PRUNE-UNCERTAIN). With `config/plugins.json` carrying a non-array `entries`, the second `installView` returns `{"status":"refused","reason":"ATR-TOPOLOGY-UNVERIFIABLE"}`: the refresh host observes the same registry and refuses before the prune runs, so `pruneSkipped` is never produced. Same result (same reason) with the corrupt file placed at the workspace `.agents/plugins.json` instead (second attempt; the same cause twice ends the series). `observeRunnerViewReferences` returning null (`install-agy.mjs:220-241`) is therefore reachable only through a reference state the host itself accepts (not found with the fake CLI fixture); the other null paths (non-array imports) are also refused by the host (existing pin "any other non-array imports value stays unavailable").
2. `a throwing prune never removes a view` with an injected `pruneRunnerViews` that throws. `refreshAntigravityGlobalFromRunnerView` calls the injected prune at `install-agy.mjs:275` with no try/catch, so the error propagates out of the refresh (observed: `Error: prune exploded` thrown from line 275). The `AGV-PRUNE-UNAVAILABLE` catch exists only inside the default `pruneRunnerViewsAfterInstall`, whose body cannot throw (its only throwing callee already catches). The recon's premise (refresh stays `refreshed`) is false for an injected prune.

Recon claim "pin file lacks a byte comparison" re-verified true (lines 559-576 and 578-605 compare names and `removed`, not bytes).

## Evidence (machine-written logs, scratch, untracked)

- Baseline (unchanged clone2) whole file: exit 0, 34 pass, 0 fail.
- Clone with the two new cases: exit 1, 36 tests, 34 pass, 2 fail; failing set = exactly the two new cases (attempt 1 and attempt 2 identical). Logs: `scratch/agent-out/w7v/{base,red,red2}.antigravity-global-refresh-recovers-and-installs-a-runner-view.test.mjs.log`.
- Mutation RED/GREEN proof and patch/apply-check were not run (nothing to deliver).

## Not done / needs a decision

- To make case 2 green the production file `plugins/pipeline-core/install-agy.mjs` would need a try/catch around the injected prune returning `{removed: [], retained: [], skipped: "AGV-PRUNE-UNAVAILABLE"}` (outside this slice's scope, a behaviour change). Alternatively the Spec declares a throwing prune a propagating error and the pin asserts the throw plus that both views still exist (a different, weaker pin).
- Case 1 needs a reference-unreadable state the host accepts; none found. A byte-equality pin of the older view across a normal second refresh (recon gap 6) is writable green as a test-only change and was not written here only because the budget went to the two contradicted cases; propose it as a re-dispatch.
- Slice B (explicit digest-list prune route) stays open: needs a Spec decision.
- Proposed commit message for a re-dispatched, narrowed slice: `test(pipeline): pin older runner view bytes across refresh`.
- Operator flow if a patch is later delivered: apply the diff, `git add -u` with a path limit, `--no-verify` commit, stamp, install. Protected-path classification observed: the pin test file matches none of TP-1..TP-13; no protected path touched.
- An independent Critic review stays a parent-owned batch gate.
