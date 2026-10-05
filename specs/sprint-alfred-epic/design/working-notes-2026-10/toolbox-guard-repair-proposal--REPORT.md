# Scratch source candidate: Windows Bash recovery and observation links

1. **Goal.** Review an inert source patch for the confirmed mixed Bash dialect in lifecycle recovery and source-relative R5 links. This does not identify the live Toolbox trigger without its exact command/argv and denial.
2. **Context files.** Baselines and postimages here map to `hooks/guard-lifecycle-ready.mjs`, its test, `hooks/guard-command-grammar.mjs`, `skills/capture-observation/SKILL.md`, and `skills/capture-observation/scripts/observation-intake.test.mjs`. The new packaged policy/form images derive from `docs/observation-intake.md` and `.github/ISSUE_TEMPLATE/observation.yml`. `candidate.patch` is the unified review delta.
3. **DoD checks.** `git apply --check scratch/toolbox-guard-repair-proposal/candidate.patch` passed; `node --check` passed on both guard postimages and both test postimages. Source baseline/postimage and patch SHA-256 values are recorded below. New tests have **not** been executed: this scratch copy is intentionally outside the plugin module tree, so its relative imports cannot exercise the candidate; applying the patch to production was outside this task's authority. No RED/GREEN or live Toolbox claim is made.
4. **Forbidden.** No production, installed plugin cache, lifecycle state, override, hook setting, key, Git commit, or publication was written by this candidate. The patch preserves exact observed Node executable/argv matching and the existing sanctioned script/root validators; it does not admit arbitrary Node commands.
5. **Stop conditions.** Apply/review only after the owner confirms the source patch and runs the source suites in an authorized lane. Compare the exact live Toolbox command/argv and typed denial before claiming incident coverage. If packaging excludes plugin `docs/` or `templates/`, add their exact assets to the packaging manifest before changing skill links.
6. **Dispatch metadata.** Baseline HEAD `70e49364f7821e955c4f4458350f42f537180542`; Epic rigor 2, high-risk DESIGN; V3 `implement_deep`, Sol 6/medium route per briefing, without native model attestation. Scope is scratch-only.

## Patch behavior

The Bash-only recovery matchers, startup receipt recognition, and final sanctioned fallback now parse with the same fixed POSIX platform as the outer Bash grammar. The tokenizer preserves ordinary backslashes inside Bash double quotes, so quoted Windows paths retain separators. The regression covers a win32 host, `$PWD`, a full non-ready inspection and observed planner action, and command/argv neighbors; a second assertion pins quoted backslashes. Existing physical root and script validators remain the authority.

The capture skill points to plugin-local `docs/observation-intake.md` and `templates/observation.yml`. The copied policy has only three relative source links rewritten to public repository URLs; the Issue Form remains byte-identical. The new test checks source synchronization and copies those assets to an isolated installed-package fixture before resolving both links. Public issue confirmation, private vulnerability routing, and readback rules remain unchanged.

## Frozen SHA-256

| Image | SHA-256 |
| --- | --- |
| `candidate.patch` | `8924520c9c2cabee66dbc1ba7403b9a5840af6e03cb354718f44034f0c44f159` |
| guard baseline / postimage | `fda3c45908ca487fbf116d7d1a30f493269d1d9add84b96bfcedd285f9abe4f3` / `d28f9d10c67b41a254ba317e1fdcf9e328b766e54246a4f16e84f0ce515b2976` |
| guard test baseline / postimage | `8f13f72f05e6e8c56b12106f97e251c9bb1aee5e4b2cbe39811113571a9833e0` / `f9fc20aa243b8a0248b29bb7a761c0b41e3525e74cae195d4103a9030587d591` |
| grammar baseline / postimage | `8602a79813cd393cb372d4dca82c859ce2966a5c98fd58cc613ee87b22a71945` / `b483fbebd1a625204769b06e7084add42722fd4ec8560dfbd383b33d8b970887` |
| skill baseline / postimage | `61ffc607131f78e2ad13857ef572b73b30e32a95f8e6e70f341dc6d03cb47f39` / `cdc36c7802cc11dad8a07552a2b4da76f520c3722218495e5db130443ec7cc49` |
| intake test baseline / postimage | `df29d16495c44b4e1ba42633b2049ed6c64c8cc467c6d47cd09739a254100a23` / `0790047b9fba2d5cb1a44c5964700c838bbe49e90000c8e802fbb00cf4e43166` |
| packaged policy / form | `02aa13471acef20b551e9a0e57af1ec46a31273c64d18111a222387d3098e5c1` / `64c9d6b2a5d2e1a87707a92d57afbf5d0da0078a87d9cceb002adc79eae4df49` |
