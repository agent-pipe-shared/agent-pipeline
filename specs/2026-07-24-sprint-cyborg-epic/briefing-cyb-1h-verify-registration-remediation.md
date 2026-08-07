# Briefing — CYB-1h / F3: canonical Verify registration remediation

> One fresh `goldfish-mechanic` task. This briefing is the complete durable
> implementation context; return one commit plus concise test evidence.

## Goal

Close the F3 wiring gap recorded in `docs/state.md`: the five existing
Cyborg policy-stack suites must be executed by the repository's one canonical
Verify command. This implements the explicit registration decision in
`briefing-cyb-1h-drift-detection-suite.md`: use ordinary fixed
`TEST_SUITES` entries, not Sentinel's closed, SHA-pinned
`scoped-verify-registration.mjs` allowlist.

## Allowed files

- `harness/scripts/verify.mjs` — add exactly five fixed entries to
  `TEST_SUITES`, following the existing `{ name, file }` form:
  `security-policy-resolver.test.mjs`, `control-catalog-schema.test.mjs`,
  `control-evaluation-receipt.test.mjs`, `control-waiver-lifecycle.test.mjs`,
  and `control-catalog-drift.test.mjs` (all under
  `plugins/pipeline-core/lib/`).
- `project/guard-config.json` — temporary TP-3 lift only if needed to make
  the permitted `verify.mjs` edit; restore it byte-identically before commit.

## Definition of done

1. The five suite entries are present once each; no dynamic registry,
   filesystem discovery, or Sentinel registration change is introduced.
2. The five suites pass when invoked directly, and `verify.mjs` emits each
   new entry when run against a clean candidate.
3. `node --check harness/scripts/verify.mjs` and `git diff --check` pass.
4. The final diff contains only the five `verify.mjs` entries. The guard
   configuration is byte-identical to its preimage.
5. One one-line commit with `AI-Assisted: true` and a `Dispatch:` trailer;
   do not push and do not stage `project/`.

## Prohibitions and stop condition

- Do not alter the five suites, their production modules, the scoped
  registration module, CI workflow, catalog policy, state, or documentation.
- If the requested temporary lift cannot be restored byte-identically, stop
  without a commit and report the exact blocker.
