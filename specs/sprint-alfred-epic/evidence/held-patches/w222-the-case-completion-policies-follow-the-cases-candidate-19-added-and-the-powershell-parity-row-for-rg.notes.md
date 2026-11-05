# w222 — case-completion policies follow the cases candidate 19 added; PowerShell parity row for rg

First Full Verify of the 19e chain (1176 steps, 7 red). Triage of the reds this patch covers:

- `native-goldfish-host-state-tests`, `session-authority-repair-tests`, `guard-dispatch-tests`: every case passed, the red was `VERIFY-CASE-COMPLETION-DECLARATION`. The policy (`harness/config/verify-case-completion-augmentations.v1.json`) now lists the five missing D177 cases (registry-lock-vanished, rollback-own-later-deadline, source-digest-read-once, two trace-progress cases), `SAS20` and `GD83`. GD83 and the two trace cases predate this chain (19c/19d).
- `verify-case-completion-registry-tests` VCR01: pin of `session-authority-repair-tests` top-level assertions 288 -> 295 (SAS20).
- `powershell-bash-guard-parity-tests`: red in the unchanged base clone too. E7 (9b0935da5) admits a single read-only rg in the PowerShell tool on purpose; the row for the plain-singleton shape now expects exit 0 (`psExitCode`), every other shape stays refused (QG-04: test restated, logic untouched).
- `codex-pretool-guard-tests` case 8 was red only under Full Verify load (green alone); case 24 is w221.
- `security-scan`: the Full Verify clone has two remotes, so the scan refuses `remote-ambiguous`; run with `--remote upstream` on the same clone it exits 0. Environment of the clone, no source change.
