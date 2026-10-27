# W7 recon G9b: active Antigravity runner view across a background refresh (notes only, no patch)

Candidate 63cb00879657384479847ba35be11c6d2c39c3c9. Read-only recon: no clone was built, no production or test file changed, no RED case was run (nothing was written to run). Row: pipeline.greenfield.g9b, open entry "Qualify actual active hook cwd during background update and direct-prune limitations; preserve view-path availability."

## 1. Current behaviour (file and line)

- Global option 2 builds a content-addressed, immutable runner view `view-<sha256>` and installs that, not the shared source: `plugins/pipeline-core/install-agy.mjs:265-277` (`refreshAntigravityGlobalFromRunnerView`); publish is `publishAgyRunnerView` in `plugins/pipeline-core/lib/agy-central-snapshot.mjs:585-620`. A present view is converged on, never overwritten (a foreign tree at the digest path is `AGV-VIEW-FOREIGN`, line 595-597). A new source version gets a new directory, so an older view path is never rewritten by an update.
- After a successful install the prune step retains everything: `install-agy.mjs:250-257` always returns `{removed: [], retained: [], skipped: "AGV-PRUNE-LIVENESS-UNOBSERVABLE"}` (or `AGV-PRUNE-UNCERTAIN` when the registry, import or managed-copy reference files are unreadable, or `AGV-PRUNE-UNAVAILABLE` on a throw). This is commit 7dddb672c; the reference observer (`install-agy.mjs:220-241`) is still called but its result is not used for removal.
- The low-level prune `pruneAgyRunnerViews` (`agy-central-snapshot.mjs:643-666`) still exists and removes a `view-<sha>` only if it is a real directory, its content digests to its name, and it is not in keepPaths or keepDigests. It has NO production caller (install-agy only; the only callers are the tests at `plugins/pipeline-core/lib/pins/antigravity-global-refresh-recovers-and-installs-a-runner-view.test.mjs:610-613`). So the "direct-prune limit": views accumulate without bound, and the only prune route is a function nobody can invoke operationally.
- The managed copy is not immutable: the topology host retires it when its content differs from the source and reinstalls (`plugins/pipeline-core/lib/antigravity-topology-refresh-host.mjs:157, 163, 183-184, 203-206`): CLI `plugin validate`, `plugin uninstall`, `plugin validate`, `plugin install`, then hook commands that pointed into the removed managed location are rewritten to the new source root (lines 49-56, 79-80, 214). Between uninstall and install the managed path is absent, and afterwards it holds new bytes. This is the only place the update touches a path an old session may have loaded.
- Hook working directory: no code under the refresh host, `install-agy.mjs` or `agy-central-snapshot.mjs` sets or reads a hook cwd (rg for `cwd` in the topology host found nothing; `install-agy.mjs` uses `process.cwd()` only for the workspace root and the Git-toplevel source resolution at lines 308-335, 533, 580, 633). Hook commands are written as absolute `node "<root>/hooks/..."` strings (test fixture, `antigravity-topology-refresh-host.test.mjs:35`). What cwd Antigravity gives a running hook is host behaviour, not visible in this repository.
- Existing pins: continuity and bounded-storage cases in the pin file above (lines 559-614); test file `antigravity-topology-refresh-host.test.mjs` pins the managed-copy retire/rebind, not view retention.

## 2. Remaining gap

1. Actual hook cwd of a running session during a background update: **native-host-only** (the code never sets it; observing it needs a live Antigravity session).
2. Whether a live session that loaded the managed copy path (not a view) survives uninstall/reinstall of that path: **native-host-only** (the CLI owns the delete and copy; the code can only assert the order of calls, already pinned).
3. Active-session liveness per view (which `view-<sha>` a running session loaded): **native-host-only** (the Source-owned observer reports owner status but cannot bind it to a loaded view, per the comment at `install-agy.mjs:243-249`); until it exists no automatic removal is safe.
4. An operator route to prune explicitly proven inactive views (digests supplied by the caller), with the existing foreign/edited/link refusals: **code-fixable-here** (pure filesystem, deterministic on Linux/WSL).
5. Retention under unreadable references (`AGV-PRUNE-UNCERTAIN`) and under an injected throwing prune (`AGV-PRUNE-UNAVAILABLE`) is not pinned for "older view root still readable and its hook file bytes unchanged": **code-fixable-here** (test-only, no production change).
6. Pin that the first view's files stay byte-identical after a second, different-source refresh, and that hook wiring rewrites never target a retained older view: **code-fixable-here** (test-only; partly covered by pin line 559-568, which checks the skip code but this was not verified to compare bytes).

## 3. Minimal slices (code-fixable items)

Slice A (items 5 and 6, test-only; fits the briefed write scope in the refresh-host test file or the existing pin file, which would need adding to scope):
- Files: `plugins/pipeline-core/lib/pins/antigravity-global-refresh-recovers-and-installs-a-runner-view.test.mjs` (existing registered file, preferred; the refresh-host test file has no runner-view fixture, so adding there means rebuilding that fixture).
- RED-first cases (they pass at once against current code, so they are pins, not RED; state that in the report):
  - `unreadable registry keeps the older view readable`: corrupt `config/plugins.json` (non-array `entries`), run two installs; assert `pruneSkipped === "AGV-PRUNE-UNCERTAIN"` and the first view's `hooks` file bytes equal the originals.
  - `a throwing prune never removes a view`: inject `pruneRunnerViews` that throws; assert refresh result is still `refreshed` and both view roots exist.
- Commit subject: `test(pipeline): pin older runner view bytes across refresh with unreadable references`.

Slice B (item 4, small production change; needs a file outside this briefing's scope: `plugins/pipeline-core/install-agy.mjs` or a new sanctioned script, plus registration of any new CLI verb in the guard grammar, so it is not slice-sized without a Spec decision):
- RED cases: (1) `prune with an explicit digest list removes only those proven digests` (two views, name one, assert the other and any `view-tmp-*` stay); (2) `prune refuses a digest named by the registry, import source or managed copy` (assert retained); (3) `prune with an empty list changes nothing`.
- Commit subject: `feat(pipeline): add an explicit prune route for proven inactive runner views`.
- Open design point (judgment call, not decided here): who attests "proven inactive". That is the same unobservable liveness question as gap 3, so Slice B only moves the decision to the operator.

## 4. What "technically delivered" needs

Automatic retention is already delivered and pinned (7dddb672c, ee26907e9). To call g9b technically delivered at 75 on this row: Slice A pins (cheap, test-only) plus a recorded decision that gaps 1-3 are host-qualification items tracked outside the code row (native Antigravity host evidence), and Slice B optional or deferred with the stated reason. Without that decision the row's own text ("qualify actual active hook cwd") cannot be closed from Linux/WSL.

## 5. Confidence

- Retention behaviour and prune dead-end: high (read directly, line references above).
- Hook cwd claim (not set in repo): medium-high (negative search limited to the files named; I did not search every Antigravity hook script).
- That slice A cases pass immediately and that the pin file lacks byte comparison: medium (I did not open pin lines 559-614 fully).
