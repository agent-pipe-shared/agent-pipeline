# Morning runbook 2026-10-05 — intermediate candidate 1

STATUS (after host crash): residue `session-4a4b3cc55b3eaefdac609226` moved by the PO to
`scratch/incident-residue-2026-10-05/`; readiness `ready`. Package #3 request built on 6c732455e, intent
`043998acdc6c54ddd3be7cb5894c6e212860f2f4bac3910c9a69a9550d532cd3`, post digests verified against the Critic-reviewed
bytes. Step 3 is now one script: `scratch/qp3/commit-package.ps1` (HEAD check → apply → add → authorize-commit →
`git commit --no-verify -F scratch/qp3/commit-msg.txt`). PO decision (chat, 2026-10-05): the full Verify runs AFTER the
install on the new code; pre-install only targeted suites; test-only failures go into the candidate report.

Order (PO steps marked **PO**; everything else is the Elephant):

1. Elephant: final builder run for package #3 on the then-current HEAD
   `node scratch/qp3/build-package.mjs` → `scratch/qp3/qp3-package-request.json` (intent sha printed);
   verify post digests guard 35c16300…, test 1a5f3a72… (Critic PASS 2026-10-05 ~21:15Z on exactly these).
2. **PO** (PowerShell): sign package #3
   `& 'C:\Program Files\nodejs\node.exe' '<clone>\agent-pipeline-local-marketplace\plugins\pipeline-core\scripts\po-human-approval.mjs' sign-intent --repo-root '<clone>\agent-pipeline-share' --request scratch/qp3/qp3-package-request.json`
3. **PO** (PowerShell): apply + stage + authorize + commit block (same shape as the W0-4 package, paths
   `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` and `.test.mjs`, proof `scratch/qp3/qp3-package-proof.json`,
   trailer `Dispatch: quality-package-<intent> (integration)`, `--no-verify` because the pre-commit backstop does
   not yet recognise package integrations).
4. Elephant: verify commit binding (parent = baseCommit, sha256 of both files = post digests); targeted guard
   tests (QP3-*, QW04-*, SIGNED-AGENT) on the committed tree; session-cleanup status.
5. Elephant (goldfish dispatch): stamp commit `chore(pipeline): stamp local intermediate candidate 1` setting the
   version in `plugins/pipeline-core/.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `plugin.json` to
   `0.7.0+<runner>.<UTC YYYYMMDDHHMMSS>.<short HEAD before stamp>`.
6. **PO** install (PowerShell, from `<clone>\agent-pipeline-share`):
   - `robocopy <clone>\agent-pipeline-share\plugins\pipeline-core <clone>\agent-pipeline-local-marketplace\plugins\pipeline-core /MIR`
     (exit code < 8 = success)
   - `claude plugin update pipeline-core@agent-pipeline-local --scope user`
   - hook snapshots: `node <clone>\agent-pipeline-local-marketplace\plugins\pipeline-core\scripts\commit-msg-hook-install.mjs --install`
     and `... pre-commit-hook-install.mjs --install`
   - restart Claude Code in this repository; `/pipeline-core:pipeline-start`
   - if preflight reports `plugin-attestation-required`: run the printed
     `installed-plugin-attestation-host.mjs write-local-from-registry --provider claude --version <v> --source-plugin-root "<repo>\plugins\pipeline-core" --installed-plugin-root <cache root>` and rerun pipeline-start.
7. Elephant after restart: readback (preflight version == stamp, hooks current, session ready), short smoke
   checks, candidate report `docs/0.7-intermediate-candidate-1.md` (contents, known win32 failures, residual risks).

Known open items to state in the candidate report: Windows private-state DACL assurance (v3: 125/216 cases fail
identically at HEAD), guard suite 59 win32 failures (symlink/LOCAL<profile-dir>/paths), verify-journal 3,
signed-quality-package 22, session-cleanup-binding 4, session-cleanup-recovery 3, runner-design-readiness-
bootstrap 1; remaining hotfix regression tests (HF1/3, 2/4, 5, 8); design amendment pending (restructure,
Advisor/review merge, feature proportionality, zero-authority archive tier).
