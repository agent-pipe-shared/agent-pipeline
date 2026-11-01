# w51 — the guard admits the ceremony readers, the read-only fitness probe, set-feature, and the Windows root spelling (candidate 17, slice 5)

PO 2026-11-01: "as PO I only want to type the signing myself" and "a user repo must be able to run all pipeline commands that analyse".
A consumer on native Windows (Claude, Git Bash) could not run the ceremony steps, the fitness probe a failing `submit-plan` needs, or a corrected-PRD
`set-feature` inside a feature in lifecycle `draft`: each was refused as `opaque-script-execution` (`GUARD-DEVPLAN-SHELL`).

## Measured, not assumed

- `plan`, `prepare-for-signature`, `prepare-authorization`, `authorize-by-signature` and `verify-audit` were ALREADY in the catalogue. The measured
  refusal of `authorize-by-signature` in the correct shape came from the root spelling: the catalogue compares `--repo`/`--root` with the
  guard's root by strict equality, the guard root on Windows is the backslash spelling of the drive path, the agent typed the forward-slash spelling.
  The same read-only `verify-audit` with the backslash spelling passed in the same session, the forward-slash spelling was refused (nothing written).
- Not in the catalogue: `emit-signature-digest`, `render-copy-safe`, `architecture-fitness.mjs --mode/--diff`, `pipeline-state.mjs set-feature`.

## Change

- `lib/guard/sanctioned-args-scripts.mjs`: `render-copy-safe` and `emit-signature-digest` as closed shapes (pinned flag order, `--repo` = root, 64-hex digests,
  optional exact `--author-source-root`); `set-feature` as its closed flag set (`--id`, `--plan-path`, optional `--spec-path`, each once, repository-relative
  paths without dot segments); `canonicalRootSpelling` (win32 only) rewrites an argument that names exactly the root, or exactly
  `<root>/plugins/pipeline-core`, in another separator / drive-letter case / MSYS spelling to the canonical spelling BEFORE the matchers run, so every matcher keeps its
  strict comparison.
- `lib/guard/command-catalogue.mjs`: `architecture-fitness.mjs` with `--mode <evaluation mode>` and `--diff <1..64 repository-relative paths>`; `--checkpoint`, `--qualify`, `--commit` stay out.
  The guard keeps its own copy of the mode list (it runs on every tool call and must not import the evaluator); a test pins it to the script's export.
- Tests (guard-lifecycle-ready suite): four new tests with positive and negative shapes, mutation-checked (normaliser off, set-feature branch off, emit-signature-digest branch off, mode validator off: all red).

## Not changed

- The signing (`sign-intent`, the Ed25519 proof) and the arming stay the person's; `authorize-by-signature` keeps its external-proof boundary; `discard-feature`, `refreeze-plan`, `sweep-requests`, `publish-consumption-action`, `repair-audit` are not admitted.
- Script-side canonical-root checks (`resolve(root) !== root` etc. in a dozen scripts) are NOT covered; the human-override CLI itself normalises.
- `resume-hint capture` in a draft feature is NOT covered yet.

## Not proven

- Nothing was run on native Windows, Codex or Antigravity. The normaliser is unit-tested with `platform: "win32"` on Linux; the Codex and AGY adapters import the same catalogue (read, not executed).
- The full guard-lifecycle-ready suite passes in the clone (424 pass, 3 skipped); the neighbouring suites guard-devplan, codex-pretool-guard and antigravity-pretool-guard also pass in the clone (each file reports one wrapping test).
