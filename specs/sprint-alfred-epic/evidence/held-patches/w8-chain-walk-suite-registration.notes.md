# Held patch w8-chain-walk-suite-registration (Elephant-built)

Registers the chain-walk pin `plugins/pipeline-core/lib/pins/critic-course-consumer-chain-walk.test.mjs` in `harness/verify-suites.json`
(protected path, so it travels as a patch the PO applies). Without the entry Verify never runs the walk, and `check-suite-registration.mjs`
lists it as unregistered. Apply order: after `w8-chain-walk-critic-course-consumer-paths` (the file must exist).

Measured in a clone stacked with the chain-walk patch: `check-suite-registration.mjs` lists the walk file before the entry (`c0` log) and no
longer after it (`c1` log). The check still exits 1 for other, older unregistered suites (`stale-approval-repair-names-rebind-approval`,
`windows-private-dacl-detail-codes-and-root-only-rule`, `published-tag-push`, `authority-trace-preload`, `check-critic-bound-verify`,
`checkpoint-commit`, the gitleaks reproduction gate tests, `publish-evidence-run`, `security-scan-large-inventory`, and the scheduled-slice
close pin); they are not part of this patch and are named here so they are not mistaken for a defect of it.

The walk takes about 160 s serial (eight repositories, three of them four-round); that cost lands in Verify once the entry exists.
