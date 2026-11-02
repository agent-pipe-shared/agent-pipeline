# w85 — the briefing build prints the installed Pipeline version and keeps the ruleset-fallback warning for a lesser identity only (candidate 18, C18-9)

Edits `plugins/pipeline-core/scripts/dispatch-briefing.mjs` and its test file only. Criterion binding: AC-108 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.

## What it adds

- `build`, `probe` and the `binding` result carry two new fields beside the ruleset sha they embed:
  - `pipelineVersion`: `rulesetSource.selectedPlugin.version` of the preflight the build already reads (for example `0.7.0+claude.<stamp>.<sha7>`), `null` when the preflight names none. A consumer run now evidences which Pipeline version produced a briefing.
  - `rulesetIdentitySource`: `"loaded"` for the loaded identity, otherwise the source text of the fallback that was taken.
- `DBG-RULESET-FALLBACK` is no longer emitted when the identity is the content hash of the loaded plugin root: that is a deterministic identity of the loaded plugin and, for a Claude local-development install, the only one there is, so the warning fired at every build. The source stays visible in `rulesetIdentitySource` (and in the briefing text's existing "(fallback: ...)" suffix, unchanged).
- The warning is kept for the installed identity of the preflight, which is a recorded identity not proven to be the loaded plugin's own.
- Unchanged: the embedded sha value, the order loaded -> installed -> content hash, `DBG-RULESET-UNAVAILABLE` (no identity can be formed) and `DBG-RULESET-LOCK-HELD`.

## Why `loadedIdentity` is `unavailable` in a local-development install (read from `pipeline-start-preflight.mjs`, not changed)

The preflight forms `loadedIdentity` only from (1) a self-application git checkout whose observation is ready, (2) a verified installed-plugin receipt, or (3) a Codex local-development registry content binding. A Claude plugin installed from a local-development source matches none of them, so both `loadedIdentity` and `installedIdentity` are `{status: "unavailable"}` while `selectedPlugin.version` and `source.class: local-development` are still filled. The source comment says so explicitly (no content hash is invented for a local-development or marketplace copy). Giving that topology a loaded identity is a change of the preflight and outside this slice's scope.

## Tests

New cases (written first, RED against the original code, then GREEN): the loaded identity prints the version and source `loaded`; a content-hash identity prints the version, names its source and emits no warning; an installed identity keeps the warning and names its source; no version prints `null`; no identity at all is still `DBG-RULESET-UNAVAILABLE`; build and probe print both fields.

Restated existing assertion (QG-04): `binding fields equal the facts of their own sources` pinned the exact key list of the binding result; the two new result fields were added to that list. Its intent (the result shape is closed and nothing else leaks) is unchanged. No existing case pinned the content-hash warning positively.

## Checks

- `dispatch-briefing.test.mjs` in the slice clone: 143 tests, 142 pass, 1 fail. The one failure is `public --help and -h work before setup without private reads...`: its I/O trap forbids any path under the working directory or home, which the clone-slice route (clone under the checkout, private TMPDIR) trips; the `--help` path does not touch the changed code. It is red in the clone before and after this patch; a run in the real checkout is the proof.
- `harness/scripts/check-consumer-safe-paths.test.mjs`: 9 of 9 pass.
- The patch applies to the real HEAD (`git apply --check` exit 0); `w85-...check.test.mjs` pins that and the touched-file list.

## Not changed / not proven

- The preflight is unchanged: no loaded identity is produced for a local-development install.
- The briefing text still carries the "(fallback: ...)" suffix; the full Verify and the plugin-managed consumer run were not made.
