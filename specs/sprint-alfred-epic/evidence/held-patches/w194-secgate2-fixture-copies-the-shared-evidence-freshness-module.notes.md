# w194: the SECGATE-2 installed-plugin fixture copies the shared evidence freshness module

Found only on the whole 19c chain, by the serial D4a sweep: `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` case SECGATE-2 failed with `Cannot find module .../evidence-freshness-codes.mjs imported from .../security-completeness-gate.mjs`. The case copies a closed list of plugin files into a temporary installed-plugin tree (`COPY_MAP`). Since w171 the security completeness gate imports `lib/evidence-freshness-codes.mjs` (the shared freshness verdict), so the copy list has to carry that module. The module has no local imports of its own.

Change: one `COPY_MAP` entry after the security-completeness-gate entry, with a QG-04 restatement comment. The test is not weakened: it still asserts the same installed-plugin behaviour; only its fixture closure grew by the module the gate now needs.

Verified in the chain clone: `--name SECGATE-2` 1/1; the whole file exit 0. The patch applies to the repository HEAD (`git apply --check`) and to the chain.

Not proven: a Full Verify.
