# G30 active runner views — inert clone report

Base: `f54f323dd27aeb123a778db5b46b909cbd19d795`. Clone: `scratch/clones/g30-active-runner-views`. No commit or native host receipt; `candidate.patch` is the cumulative two-file tracked diff. Main and installed runtime were not changed.

## 1. DoD result

- Targeted delivery: **green for automatic install cleanup**. A successful update retains older immutable views when session liveness cannot be tied to a loaded view. `runnerView.pruneSkipped` reports `AGV-PRUNE-LIVENESS-UNOBSERVABLE`. Repeated update converges on the current digest and retains the old view. Existing direct custody-prune tests still cover digest-valid removal, keep-path and keep-digest retention, and foreign/tampered refusal.
- The existing Source-owned session descriptor observer reports owner liveness, but provides no session-to-loaded-view binding and no complete Antigravity session inventory. Automatic cleanup therefore cannot prove any older view inactive. Positive inactivity of an individual loaded view is **not verifiable** with current sources. The exported low-level `pruneAgyRunnerViews` primitive remains callable directly and retains its original custody checks; production install no longer calls it. Independent review should assess whether that low-level API must also be restricted.
- Quick check: unavailable (no configured route). Parent integrated Verify, Critic, resource headroom and PO acceptance: pending; no compliance or native qualification claim.

## 2. Machine evidence

- RED: `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/g30-runner-red.json --label g30-runner-red -- node --test plugins/pipeline-core/lib/pins/antigravity-global-refresh-recovers-and-installs-a-runner-view.test.mjs`; exit 1, 33/34 passed. New regression failed because old view was removed. Artifact: `scratch/g30-runner-red.json`.
- GREEN: same command with `--out scratch/g30-runner-green.json --label g30-runner-green`; exit 0, 34/34 passed. Artifact: `scratch/g30-runner-green.json`.
- Installer adjacent suite: `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/g30-install-green.json --label g30-install-green -- node --test plugins/pipeline-core/install-agy.test.mjs`; exit 0, 25 passed, 1 skipped. Artifact: `scratch/g30-install-green.json`.
- `git diff --check`; exit 0. All test commands used the host-authorized WSL boundary and synthetic fixture roots inside the inert clone; no real installed cache or global registry was touched.

## 3. Changed files

- `plugins/pipeline-core/install-agy.mjs`: stop automatic deletion when loaded-view liveness is unobservable and expose an explicit skip reason.
- `plugins/pipeline-core/lib/pins/antigravity-global-refresh-recovers-and-installs-a-runner-view.test.mjs`: add RED/GREEN continuity and repeated-update regression; revise the existing automatic-delete expectation because it contradicted the active-view safety contract. Its original expectation remains in base commit and RED evidence; the other custody examiners were preserved.

## 4. Deliberately not changed

`agy-central-snapshot.mjs` direct custody primitive, session descriptors/ownership modules, calibration, audit/capture, real Antigravity installation and main checkout.

## 5. Deviation

Automatic storage bounding is deferred because the required complete Source-owned view-liveness observation does not exist. This is fail-closed retention rather than an inactivity assertion or new registry.

## 6. Open items

Verify: parent integrated run pending. Independent review: pending, including the low-level prune API limitation and examiner adjustment. Manual/browser check: not applicable to the inert synthetic patch. PO acceptance: open. Resource criterion/measurement: parent-owned, unknown here. Committed: nothing committed; the clone has exactly the two tracked modified files. No dispatch record or receipt was fabricated because the briefing explicitly marked native host integration unsupported for this route.

## Coordinator review before main application

The old automatic-deletion examiner treated absence from registry/import/managed
references as proof of inactivity. The reported active-session failure and the
source trace disprove that precondition: these references do not enumerate loaded
session views. Its updated expectation preserves unknown views; direct custody,
foreign-path and tamper controls remain. This is a documented QG-04 correction,
not evidence that a complete liveness inventory or bounded automatic storage was
implemented. Current PRD/Spec are unchanged. Storage reclamation and the exported
low-level primitive remain explicit review limitations; no inactivity is fabricated.
