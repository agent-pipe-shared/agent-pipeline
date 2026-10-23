# Operator sitting, 2026-10-23 (about 15:00)

This folder holds everything the operator needs for the bundled sitting: the ordered runbook (`runbook.md`), one commit message per step (`commit-messages/`), the diffs (`*.diff`), the rehearsal notes and the per-package notes (`notes/`). Nothing here has been applied to the main checkout.

## Before the first command

1. The main checkout is on `feat/sprint-alfred` with a clean tree; note `git rev-parse HEAD`. Nothing else heavy runs (no agents, no test suites).
2. Do not change the tree between a command that is bound to a HEAD or tree state and the operator's next command (an approve or override step reads `repository.head` and `statusSha256`).
3. The commits are made by the operator as the human operator with `git commit --no-verify -F <message file> -- <paths>` for protected paths, exactly as `runbook.md` prints them. A diff that touches a protected target is applied by the operator's own shell, not by an agent.

## Order

- Steps 01 to 34 and 36 to 47 of `runbook.md`, in order. Step 35 (C28, the Critic preimage re-pin) is NOT part of this sitting: the PO decided it happens right before the stamp, after the Critic batch.
- Extra or corrected steps found by the last rehearsal (`K133-runbook-corrections.md`, merged into `runbook.md` by the Elephant before the sitting) take precedence over the older text.
- Step 47 (Reader-input mirrors) is the last source-affecting step. After it nothing may edit the capability inventory or the governance input; if it does, run `node scripts/sync-reader-inputs.mjs --check` and re-sync.

## By hand, not covered by the Reader

Two lines in `CLAUDE.md` (an agent may not edit it). PO decision of 2026-10-23, row 11:

- Under "Where things live", add: `- **Operating tools:** [`docs/operating-tools.md`](docs/operating-tools.md) and the tracked top-level `scripts/` folder: stamp, parallel and serial test runners, inventory rebaseline, delivery remeasure and the serial count pass. Read the script header before the first run.`
- Under "Hard rules", add: `- **Reusable scripts never stay in `scratch/`.** A helper that will be used again (stamp, runner, rebaseline, remeasure) is committed under `scripts/` with a purpose and usage header and listed in `docs/operating-tools.md`; the PO works on two machines and `scratch/` is untracked.`

## After the sitting (agent work, in this order)

1. Re-run the suite registration, case-completion, inventory, governance, mirror and backlog-state checks and record the counts.
2. Restate the four stale `sites` counts of `check-verify-case-completion.test` (QG-04, PO decision batch 12) and the registration fixture list.
3. Serial count pass: `node scripts/sitting-count-pass.mjs --list specs/sprint-alfred-epic/plans/count-pass-suites.json --out <evidence.md>`, then the delivery remeasure with the reader prompt that carries the batch-10 rulings.
4. Reader course: write the terminal v2 record from the two rounds and the two correction batches; the owner decision uses `by: APS` and accepts the findings listed in `plans/po-decisions-2026-10-23-tiles.md` (batch 12, row 43); the inventory and governance commits of this sitting enter the final correction batch.
5. Only on the PO's call: dev build stamp and install, Full Verify, Critic batch, the C28 re-pin, push.

## Host runs that stay open (not part of this sitting)

Native Windows runs: the credential-target refusal (K96/K105), the shared `git show` lane (K97), WINACL001, the orphan `node.exe`, the Antigravity run (S1 to S6, global registration scope), and the Greenfield acceptance on all three runners.
