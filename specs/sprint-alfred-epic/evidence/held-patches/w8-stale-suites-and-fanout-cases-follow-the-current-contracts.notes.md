# W8 round 2: stale suites and fanout hook cases follow the current contracts

Held patch, applied after `w8-case-completion-policies-follow-the-declared-cases` (it extends the same augmentation file).
Source: the second Full Verify triage of the stacked package (63 red steps in the first run, each red measured alone under a
Verify-like environment: private HOME and TMPDIR under the real home, the identity and `init.defaultBranch` the Verify gives).

## What changed

- `harness/config/verify-case-completion-augmentations.v1.json`: rows for the long-running suites (`onboarding-continuity`,
  `native-goldfish-host-state`, `native-goldfish-host-finalizer`, `model-family-host-store`, `codex-advisor-execution`,
  `design-workflow-package-v2`) so the effective policy equals the cases each suite declares. `harness/scripts/verify.mjs` is
  untouched (QG-02); every row binds its base policy by `previousPolicySha256` or is unbound where no base exists.
- `plugins/pipeline-core/hooks/guard-dispatch-fanout.test.mjs` and the shared fixture
  `lib/test-generated-goldfish-briefing-fixture.mjs` (new optional `check` and `newFiles` parameters): the hook-level fanout
  cases and the K93 batch cases used `general-purpose` carriers and hand-filled templates, which D185 refuses
  (`DISPATCH-WRITE-CARRIER-REQUIRED`, `DBG-GENERATED-BRIEFING-REQUIRED`). They now dispatch a Goldfish carrier with a briefing from
  the real generator. Findings pinned by the measurement: a generator path must be a file path (no trailing slash); a batch has no
  item reservation adapter, so an item-governed repository refuses it as a class (`SQ-NATIVE-ITEM-ADMISSION-REQUIRED`) and the K93
  cases dispatch into an enrolled, not item-governed repository with briefings rendered in an approved-course one. One K93 case
  lost its "batch member without a write scope" half: a generated briefing always carries a scope.
- `setup.test.mjs`: D184 (Deep default effort `high`; legacy migration presets keep `xhigh`).
- `hooks/guard-apply-patch.test.mjs`: G15/D210 merged first-round ask and the authored design package.
- `hooks/guard-testpath-override.test.mjs`, `harness/scripts/wire-dispatch-budget-hook.mjs`: guard wording and the shipped
  `hooks.json` timeout (330).
- `scripts/check-backlog-state.test.mjs`: the two accepted ledger events (D222).
- `lib/pins/semgrep-console-coverage-note-has-no-test.test.mjs`: the CLI smoke accepts every verdict the scanner can print.
- SPDX headers on four modules, `done_when` on four backlog items, and the Sentinel authority links in `docs/state.md`.

## Not in this patch (open, named)

- `pin-claude-windows-greenfield-lifecycle-not-walkable-tests`: 13 V-10 cases are red under D185 and need a design decision for the
  Workflow transport (the static extractor reads 4000 characters; a generated briefing is about 10k).
- `gate-strength-guard-tests` GST33: the D216-A read/write splits (eleven modules) are decided and not built.
- `codex-isolated-critic-protected-preimage-tests`: the PO re-pin of the five Critic files (D221).
- D214-C Critic-bound Verify evidence seeding, and the scanner binaries (semgrep, gitleaks, osv-scanner) missing on the verify host.
