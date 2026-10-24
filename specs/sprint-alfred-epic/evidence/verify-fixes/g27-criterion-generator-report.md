# G27 parser-context parity handoff

**Targeted delivery: green.** The inert clone `scratch/clones/g27-criterion-generator` remains uncommitted at base `537d5c85d4f5ca4a460b61e461c7fc4fadc23f6e`. Apply only the cumulative five-file patch `scratch/agent-out/g27-criterion-generator/criterion-generator-cumulative-parity.patch`; earlier phase patches, reports and captures remain in place. No main/current PRD/Spec, accepted parser source, G32 product source or other clone was edited.

The original renderer's supported `AC-1` table stays intact. `design-authoring.mjs` now asks the exported `scanAcceptedCriterionRows()` for normative criterion context. For the legacy unsupported `- AC-01:` placeholder, it normalizes that exact line in memory to the parser's supported bullet shape, then uses the same scan. This preserves nested/titled/translated acceptance headings and excluded Notes, comments, fences and quotes without a second heading vocabulary. `onboarding-continuity.mjs` still invokes the helper before offering acknowledgement. A new OBC308 actual-planner control was appended after OBC307, preserving earlier examiner IDs. The G32 installed-plugin fixture dependency remains in the cumulative patch.

Machine-written evidence, all under the clone's `scratch/`:

- RED: `node --test plugins/pipeline-core/lib/design-authoring.test.mjs`, exit 1, `g27-parity-red-heading.json`; the prior helper missed parser-normative `Acceptance requirements — project`.
- GREEN: same command, exit 0, `g27-parity-green-heading.json`; actual parser/rendered bytes cover titled/nested/German acceptance headings, legacy/current placeholders, malformed IDs/header, excluded Notes and authored positive.
- GREEN: `node --test --test-name-pattern=titled.nested.acceptance.requirements plugins/pipeline-core/lib/onboarding-continuity.test.mjs`, exit 0, `g27-parity-green-nested-planner.json`; actual acknowledgement refuses titled nested placeholder (OBC308).
- GREEN: `node --test --test-name-pattern=greenfield.walk.F9 plugins/pipeline-core/lib/onboarding-continuity.test.mjs`, exit 0, `g27-parity-green-f9-planner.json`; generated draft refusal retained.
- GREEN: `node --test --test-name-pattern=quoting.the.criterion.example.only.in.Notes plugins/pipeline-core/lib/onboarding-continuity.test.mjs`, exit 0, `g27-parity-green-quote-planner.json`; authored Notes quote accepted.
- GREEN: `node --test harness/scripts/check-consumer-safe-paths.test.mjs`, exit 0, `g27-parity-green-consumer-paths.json`. `git diff --check`, exit 0.

Earlier correction's IPC-bound SECGATE-2 shard PASS is at `g27-correction-security-shard.json`; it was not rerun because this phase did not change the fixture. Earlier implement-tier empty-stdout stop, original Deep and correction costs (approximately 30 calls each), and the candidly disclosed overwritten intermediate count-failure capture remain part of the history. This phase used approximately 15 tool calls; no authenticated native budget claim.

**Closing status:** committed: nothing committed. Verified green: checks above and prior SECGATE-2 shard evidence. Remains undone: parent patch application, integrated Verify, batch Critic, any intermediate stamp, project resource measurement and PO acceptance; quick route is unconfigured. All five owned tracked clone files remain modified and uncommitted. Recovery pointer: apply the cumulative patch against the integrated candidate and run parent gates. Spec mapping remains original AC-264 three-runner happy path and G25/G27 pre-submission criterion format; no new AC or design reopening.
