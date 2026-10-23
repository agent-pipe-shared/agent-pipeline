# K127-S4-SOURCE-CHECKOUT-EXEMPTION notes (Goldfish, clone k127, base main a56cca4d8 + K112 patches; ruleset 0.7.0+claude.20261022204428.79cda46)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.

## Design (PO decision 2026-10-23, batch 12, row 42)
S4 stays R1 for consumers (PCI-ALIAS-REFUSED). `lib/project-calibration-identity.mjs` (kernel) gets `isAgentPipelineSourceCheckout()`:
- `git rev-parse --show-toplevel` (GIT_* env stripped, shell:false, 5 s) must realpath-equal the selected root;
- `git ls-files --stage -z -- .claude/pipeline.json .claude-plugin/marketplace.json` must list BOTH as stage 0, mode 100644/100755 (no symlink, no untracked, no unmerged);
- working-tree bytes (lstat regular, no symlink, <= 64 KiB) parse to JSON: `.claude/pipeline.json` project === "agent-pipeline"; marketplace name === owner.name === "agent-pipeline", exactly one plugin `pipeline-core` with source `./plugins/pipeline-core` (same facts as skills/reader-review; no code helper existed, the skill is prose).
- any error -> false (fail closed). Only when the STORED name is exactly "agent-pipeline" and the check passes, `aliasOutcome()` returns resolved (kind configured-alias, project agent-pipeline) plus additive `identityMode: "source-checkout"`; consumer-verify passes the object through. Else `aliasRefused` as in K112.
- Not changed: PCI-NAME-MISMATCH (root-derived metadata), PCI-ROOT-MISMATCH, a root really named agent-pipeline (resolves root-derived, no identityMode).

## Security read: why a consumer cannot self-assert it
No calibration field, env var or flag selects it (the stored string is only a precondition). It needs two TRACKED regular files with fixed closed content in the Git index of the exact toplevel; the directory name is never read. A repo copying one file, untracked/unstaged copies, a non-git directory, a symlinked file, a marketplace with other name/owner/extra plugin/other source, or any other alias stays refused (pin S4x). Residual risk (stated, not closed): a consumer that deliberately forges and `git add`s BOTH files (a complete fake marketplace identity) gets exactly the relaxation of the alias check for the name "agent-pipeline" - nothing else (rootSha256, metadata checks, drift and Git/PO custody are untouched); the reader-review skill carries the same trust. A stronger root anchor (e.g. a tracked plugins/pipeline-core/.claude-plugin plugin manifest) was not added: smallest reading.

## Measured (each alone; `node --test <file>` direct; clone k127 with both patches applied)
- RED (pin with the 12 new S4x cases on the K112 code): first run 43 tests 35 pass / 8 fail, but for the WRONG reason (fixture used the real, drifting tiers -> PCI-CALIBRATION-DRIFT); after making both tiers byte-equal in the fixture: 40 pass / 3 fail. The 2 intended REDs: "real identity files resolve typed source-checkout" (unavailable vs resolved) and "reaches consumer verify" (VEP-PROJECT-IDENTITY: PCI-ALIAS-REFUSED); the 3rd was my non-git fixture still using the drifting tier (fixed before GREEN). The other 9 S4x cases are refusal guards that pass on K112 and must keep passing.
- GREEN: project-calibration pin 43/43 (31 K112 + 12 new S4x), exit 0. Same 43/43 on k127-check (k108 state + patches).
- plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs 39/39; lib/pins/parallel-work-in-one-checkout-is-unsafe.test.mjs 19/19.
- `node harness/scripts/check-verify-case-completion.mjs`: valid (357 entries, 343 suites).
- `node harness/scripts/check-verify-suite-registration.mjs`: in k127 (main base) 3 UNREGISTERED (clone-hook-readiness.refresh, commit-pipeline-owned, gitleaks-scratch-clones-exclusion test files), exit 2 = EXPECTED DELTA, not mine: the bundle registers them; on k127-check (k108 state + patches) "1092 registered, 0 unregistered". The K127 pin file is already registered: no registration diff needed (none exported).
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs` 9/9.
- Boundary-policy ratchet: not measured (no boundary check run); +76 lines in a kernel module vs K112's +12 net; a new `node:child_process` import in a kernel module (project-authority.mjs already uses spawnSync).

## Real-thing proof (scratch/K127-proof.mjs, real files copied to a dir named machine-two-name, git init + add)
- As committed: `VEP-PROJECT-IDENTITY: PCI-CALIBRATION-DRIFT` - NOT the alias refusal.
- With `.claude/pipeline.json` byte-equal to `project/pipeline.json`: `resolved project=agent-pipeline identityMode=source-checkout`. Same on k108 state.

## FINDING for PO (open, outside this exemption)
This repository's two calibration tiers already differ: `project/pipeline.json` has `"pipelineUpdateChannel": "alpha"` that `.claude/pipeline.json` lacks (identical on main and k108). `readProjectCalibrationIdentity` refuses ANY such pair with PCI-CALIBRATION-DRIFT before the alias question, so consumer-verify/`--commit` in this repo stays refused until the tiers are byte-equal. Repair (PO/operator, `.claude/pipeline.json` is gate-strength): sync the two files. I did not touch either file (smallest reading; the drift refusal is a separate, released rule S6).

## Deliverables (main checkout, scratch/agent-out/)
- K127-s4-protected.diff: lib/project-calibration-identity.mjs, lib/consumer-verify.mjs, scripts/consumer-verify-check.mjs (REPLACES K112 protected hold patch).
- K127-s4-unprotected.diff: pin, parallel-work pin, verify-evidence-producer.mjs + .test.mjs (REPLACES K112 unprotected hold patch). Both combined relative to main; `git apply --check` AND apply clean (no three-way) on a clone of k108 (scratch/clones/k127-check, which carries the applied edits).
- K127-msg-protected.txt, K127-msg-unprotected.txt (trailers AI-Assisted: true / Dispatch: stage-0 (elephant)). No registration diff.
- Clone k127 still carries all edits uncommitted (the pin is green only with the protected diff).
- Helpers (untracked): scratch/K127-apply.mjs, scratch/K127-proof.mjs.
