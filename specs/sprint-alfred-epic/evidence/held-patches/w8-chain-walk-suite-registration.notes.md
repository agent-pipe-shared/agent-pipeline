# Held patch w8-chain-walk-suite-registration (Elephant-built)

Registers the chain-walk pin `plugins/pipeline-core/lib/pins/critic-course-consumer-chain-walk.test.mjs` in two registries (both protected
or inventory-bound, so the change travels as a patch the PO applies):

1. `harness/verify-suites.json`: without the entry Verify never runs the walk, and `check-suite-registration.mjs` lists it as unregistered.
2. `docs/product-capability-inventory.json`: every discovered Verify surface must belong to a capability. The first version of this patch
   carried only the first registry, and the Full Verify of the stack found two NEW red steps because of it
   (`product-capability-inventory-tests`, `pin-capability-inventory-checker-is-red-at-head-tests`: "discovered surface is absent from every
   capability: verify-phase:harness/scripts/verify.mjs:pin-critic-course-consumer-chain-walk-tests"). The entry now sits in the sorted array next
   to its sibling critic pins. The mirror under `plugins/pipeline-core/reader-inputs/` and the source baseline are produced by the apply
   script's rebaseline and sync steps, not by this patch.

Apply order: after `w8-chain-walk-critic-course-consumer-paths` (the file must exist). The inventory pin reports the three
"needs protected patch ALF-C-AC121-REG" cases red until the apply script's rebaseline has run; the proof is the rehearsal of the whole script.

`check-suite-registration.mjs` still exits 1 for other, older unregistered suites (`stale-approval-repair-names-rebind-approval`,
`windows-private-dacl-detail-codes-and-root-only-rule`, `published-tag-push`, `authority-trace-preload`, `check-critic-bound-verify`,
`checkpoint-commit`, the gitleaks reproduction gate tests, `publish-evidence-run`, `security-scan-large-inventory`, and the scheduled-slice
close pin); they are not part of this patch.

The walk takes about 160 s serial (eight repositories, three of them four-round); that cost lands in Verify once the entry exists.
