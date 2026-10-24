# G23 quoted pipeline read slice

Targeted delivery: green. Nothing committed (the briefing explicitly forbids clone commits).
Base: dbaa242bbff4403980a58f8394a0bfada3b00b12. Main tracked files unchanged.

Root cause: quotes were parsed correctly; `*.test.mjs` failed the single-extension filename-filter rule, causing the actual guard to blame the pipe. The bounded filename-filter grammar now permits an optional literal `test.` marker before its existing 1..16-character extension. No general dotted glob, executable flag, shell operator or read-policy exception was introduced. The exact documented rg-to-rg shape now clears the actual enforced guard in relative and absolute fixture form.

Changed files:
- plugins/pipeline-core/hooks/guard-command-grammar.mjs: admit the test-module suffix using the same bounded filter predicate for single reads and pipelines.
- plugins/pipeline-core/lib/guard/g23-quoted-pipeline-reads.test.mjs: five completion-enrolled regression cases exercise the real parser and enforced guard, quoted regex data, original reproduction, malicious flags/composition, credential controls, symlink escape, and missing-target diagnostics.

Evidence (all commands ran through capture-evidence.mjs at the host boundary):
- Original audited RED: `node --test plugins/pipeline-core/lib/guard/g23-quoted-pipeline-reads.test.mjs`; exit 1; g23-quoted-audited-original-red.json. Only the original reproduction fails; the actual guard emits GUARD-OPERATOR-UNAPPROVED while all four negative/control cases pass.
- Final GREEN: `node --test plugins/pipeline-core/lib/guard/g23-quoted-pipeline-reads.test.mjs plugins/pipeline-core/lib/guard/g23-read-help.test.mjs plugins/pipeline-core/lib/guard/read-option-operands.test.mjs plugins/pipeline-core/hooks/guard-command-grammar.test.mjs plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs harness/scripts/check-consumer-safe-paths.test.mjs`; exit 0, 42 tests passed, zero failed/skipped; g23-quoted-final-green.json.
- Resource observation: `node plugins/pipeline-core/scripts/report-resource-headroom.mjs --input scratch/resource-observations.json`; exit 0; g23-resource-headroom.txt. Limits/measurements unknown, compliance not certified; declared identifiers refer to base, not an invented candidate commit.

Retained earlier artifacts: g23-quoted-original-red.json had a new-fixture error (it assumed an ordinary verified external directory was refused; the existing passive policy permits it). This was corrected with a synthetic id_rsa-named inert file before the audited RED. g23-quoted-green.json is the intermediate focused GREEN. Neither supersedes the final captures.

Deliberately unchanged: original acceptance examiners (including *.tar.gz refusal); shell tokenizer; read/credential policy; catalogue/constants; registry/domain writer; Source hooks. External ordinary directories retain their original verified policy. Unsupported globs such as *.test.tar.gz and *.test..mjs remain refused.

Deviations: clone was initially created under scratch/g23-quoted-pipeline-reads-clone, then moved to the exact briefed scratch/clones/g23-quoted-pipeline-reads before final qualification. No clone commit, invented author identity, native receipt or dispatch record. One refused diagnostic used shell wildcard file operands; its typed read-only verify-audit recovery returned valid; subsequent reads use bounded explicit paths.

Open: quick check unavailable (no configured route); composed integration/registration and Verify pending Coordinator; independent review pending batch; PO acceptance open. Export owned.patch contains both files, including the new untracked test. All changes remain uncommitted in this owned clone.
