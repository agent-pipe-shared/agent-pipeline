test(onboarding): copy the Semgrep baseline closure into the SECGATE-2 fixture

The installed-plugin fixture copies security-scan.mjs with its local import
closure by hand. Since the Semgrep baseline (D242) security-scan.mjs also
imports lib/semgrep-baseline.mjs, which reaches close-commit-split.mjs,
administration-documentation-paths.mjs and record-only-paths.mjs; the
fixture failed with "Cannot find module". The installed plugin itself ships
the whole directory and was never affected.

- COPY_MAP and its header comment name the four modules

AI-Assisted: true
Dispatch: stage-0 (elephant)
