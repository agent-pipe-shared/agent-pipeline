# NVA-B-XPORTROOT-1 — requirements (the contract the dispatch was built from)

Scope: `plugins/pipeline-core/scripts/codex-critic-app-server.mjs` and its
registered suite `plugins/pipeline-core/scripts/codex-critic-host.test.mjs`.
Fixed before the dispatch; this file restates the briefing's contract without
its procedure so a reviewer can read requirements only.

- **R1 — Executing-plugin-root anchor.** The adapter resolves its three
  ruleset references — the Critic role contract, the Critic prompt contract,
  and the verdict schema — against the directory that contains its own
  `scripts/`, `roles/` and `templates/` directories (the executing plugin
  root), in BOTH layouts: the source checkout
  (`<repo>/plugins/pipeline-core/`) and an installed plugin copy
  (`<marketplace>/plugins/pipeline-core/`), where nothing exists two levels
  above the plugin root.
- **R2 — Plugin-relative paths.** The references are `roles/critic.md`,
  `templates/prompts/critic-review.md` and `scripts/critic-verdict.schema.json`
  relative to that anchor. No repository-root probe, no fallback chain, no
  environment-variable override; the files are never read from the candidate
  repository under review.
- **R3 — Refusals preserved.** The pre-launch checks stay as they are: each
  reference is `lstat`ed before the child starts, a symbolic link or a
  non-regular file is refused.
- **R4 — Regression check with a real installed layout.** One new check in
  the registered suite builds the installed layout under a temporary root
  (the whole plugin tree copied to `<tmp>/marketplace/plugins/pipeline-core`,
  with no `roles/`, `templates/`, or `plugins/pipeline-core/scripts/critic-verdict.schema.json`
  at `<tmp>/marketplace` or `<tmp>`), imports the copied adapter, and invokes
  it with the same stubs as the existing green case. The check is red against
  the pre-fix module and green after; both runs are captured by
  `capture-evidence.mjs`.
- **R5 — Existing cases unchanged.** Every existing check in
  `codex-critic-host.test.mjs` and `codex-critic-isolation.test.mjs` keeps
  passing; no existing check is edited, weakened or removed.
- **R6 — Diff surface.** Only the two files in scope change. No change to the
  child, the selected host, the sandbox preflight, any hook, any guard,
  `hooks.json`, `verify.mjs`, the vendored copies under
  `plugins/pipeline-core/roles|templates`, or the repository-root canon files.
  The only rename admitted is the anchor constant's own name.
- **R7 — Sanitization.** The committed check and the captures contain no
  host-specific absolute path (`/home/<name>`, `C:\Users\<name>`, this
  checkout's root); paths are built from `mkdtemp`/`import.meta.url`.
- **R8 — Authorship evidence.** The commit carries `AI-Assisted: true` and
  `Dispatch: NVA-B-XPORTROOT-1 (goldfish)`; `evidence/dispatch-record-NVA-B-XPORTROOT-1.json`
  exists with `agentType`, `model`, `effort`, `rulesetSha`, `commits`,
  `report.changedFiles`. `criticSkip` is absent.

Guardrails in force: `guardrails/git.md` (GIT-03), `guardrails/quality-gates.md`,
`guardrails/security.md`; `templates/prompts/agent-obligations.md` (shell
grammar, protected paths).
