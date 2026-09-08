# ADR platform Governs coverage — 2026-09-08

`NVA-B-ADR-GOVERNS-PLATFORM-2` added exact-path Governs headers only. The
machine check parses the actual reconciliation parser, confirms that every
declared path is tracked and unique, rejects wildcard use, and compares each
ADR with `HEAD` after removing only its Governs header.

## ADR-0050

- `harness/scripts/verify.mjs` imports and invokes `runVerifyJournal`, and
  registers the resume and journal suites.
- `plugins/pipeline-core/scripts/verify-journal.mjs` creates the private
  common-directory run, writes receipts and progress, and calls resume
  planning.
- `plugins/pipeline-core/lib/verify-resume.mjs` validates candidate-bound
  receipts and computes reuse/rerun plans.
- Their direct journal and resume tests prove the closed receipt and resume
  contract.

No broad Verify-registration glob was added: unrelated suites do not own the
candidate-bound journal decision.

## ADR-0052

- `.claude-plugin/marketplace.json` is the published marketplace identity.
- `setup.mjs` keeps the generic `agent-pipeline` marketplace binding in
  `compileSettingsJson`.
- `human-guard-override.mjs` validates the external local marketplace shape;
  its direct test covers symlink/junction and bounded content-copy handling.
- The two local-plugin development documents define the operator setup and
  readback contract.

Supply-chain and release-readiness documents are cited context, not owning
implementation or local-development instructions, so they are omitted.

## ADR-0053

- `setup.mjs` implements `resolveCompiledRuntimeTargets` and uses it for the
  compiler's calibration/manifest targets.
- `setup.test.mjs` covers neutral, legacy, legacy-calibration-only, pristine,
  and mixed authority states.
- `project-authority.mjs` supplies `resolveProjectAuthorityPaths` and the
  authority-tier constants used by the generator.

The many direct legacy-path readers are deliberately omitted: ADR-0053 marks
their repository-wide migration and stale-mirror removal as deferred work,
not a responsibility of this generator decision.

Terminal evidence: `node scratch/NVA-B-ADR-GOVERNS-PLATFORM-2/check.mjs`
through `capture-evidence`, exit 0, at
`scratch/NVA-B-ADR-GOVERNS-PLATFORM-2/governs-parser-and-body-check.txt`.
