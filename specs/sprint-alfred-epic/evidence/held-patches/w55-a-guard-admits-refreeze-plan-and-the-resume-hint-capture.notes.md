# w55 — the guard admits refreeze-plan and the pre-restart resume-hint capture (candidate 17, slice 9)

Applies after w51 (same three files). Apply order: w48, w49-a, w49-b, w50, w51, w52, w53, w54, w55.

Two commands the pipeline itself tells an agent to run were refused as `opaque-script-execution` while a feature sat in `draft`:

1. `guard-human-override.mjs refreeze-plan` — printed by several guard messages as the step after a drifted plan ("forces refreeze-plan plus a brand-new PO signature"). It only
   re-derives a signable plan for an existing request. The PO signature and the arming stay the person's own.
2. `resume-hint.mjs capture --root <root> --card-file <root>/project/.resume-hint-input.json --consume-card` — the one argv shape the bootstrap skill (pipeline-start, step 7) names
   for capturing material input BEFORE a restart, in a session that is not ready. Only `inspect` was admitted.

## Change

- `lib/guard/sanctioned-args-scripts.mjs`: `refreeze-plan` takes exactly the shape of `prepare-for-signature` (pinned flag order, `--repo` equal to the root, 64-hex request digest,
  optional exact `--author-source-root`, exact length).
- `lib/guard/command-catalogue.mjs`: `resume-hint.mjs capture` is admitted as the single fixed shape (`--root` equal to the root, `--card-file` equal to
  `<root>/project/.resume-hint-input.json`, `--consume-card`, six arguments). No other card path, no card without `--consume-card`, no `--help`, no other verb.
- Tests: the earlier 17 test no longer lists `refreeze-plan` as refused; one new test pins the positive and negative shapes of both commands. Mutation-checked (capture admission
  removed turns the new test red; the original restored from backup).

## Not changed / not proven

- A ready session's `capture --card-file <any json>` form is not admitted by this guard change (a ready session has the ordinary route); only the pre-restart shape is.
- `capture` in a state where the CLI itself refuses is unchanged; this slice only lets the command reach the CLI.
- Nothing was run on a real Codex or Antigravity session; their guards share this catalogue, and their suites pass.
- Suites: guard-lifecycle-ready (428), guard-devplan, codex-pretool-guard, antigravity-pretool-guard pass under `scripts/run-parallel.mjs` on the committed clone.
