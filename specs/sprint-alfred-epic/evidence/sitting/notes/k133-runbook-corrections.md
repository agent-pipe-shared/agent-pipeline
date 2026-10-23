# K133 runbook corrections (rehearsal 3, fresh clone of main 375055799, steps 01-34 and 36-47; step 35 skipped by PO decision)

Every correction below was replayed in the clone and passed. Diff and message files live next to this file in `scratch/agent-out/` (the Elephant copies them to `specs/sprint-alfred-epic/evidence/sitting/`, then the paths below read `specs/sprint-alfred-epic/evidence/sitting/<name>` and `.../commit-messages/<name>`).
Steps 01-34, 36-46 applied with plain `git apply --check` + `git apply` on the new base: NO re-cut hunk and NO three-way application was needed (the Reader corrections, K111 header, ledger entries, K129/K131 docs and the K132 helper do not touch any target of the bundle). The rebased diffs of steps 24 and 29 still apply plain.

## R1 step 39b (NEW, after 39, before 40): inventory surface of the new pin suite plus rebaseline
- What failed: after step 38 registers `pin-governed-check-child-ignores-inherited-node-test-context-tests` in `harness/verify-suites.json` (and step 39 adds the pin file), `node harness/scripts/check-verify-suite-registration.mjs` exits 2 with `UNCATEGORIZED-VERIFY-SURFACE` for that suite (after 38 alone: MISSING-FILE plus UNCATEGORIZED; after 39: UNCATEGORIZED only). The inventory checker still passes.
- Repair: one inventory surface line (diff `K133-pin-surface.diff`, inserted after the `pin-governance-scope-rejects-readonly-host-git-control-tests` line), `node scripts/rebaseline-inventory.mjs` (sourceBaseline -> the commit of step 39), message `K133-msg-1.txt`. Result: `Verify suite registration is complete: 1093 registered, 0 declared exclusion(s), 0 unregistered.`
- Insert into runbook.md between steps 39 and 40:
```
## 39b PRO K133 inventory surface of the K120 pin suite and rebaseline [after 39]
Run after 39 is committed (the baseline must be the commit that holds registration and pin file).
git apply --check specs/sprint-alfred-epic/evidence/sitting/K133-pin-surface.diff
git apply specs/sprint-alfred-epic/evidence/sitting/K133-pin-surface.diff
node scripts/rebaseline-inventory.mjs
# expected: sourceBaseline -> the commit of step 39
node harness/scripts/check-product-capability-inventory.mjs
node harness/scripts/check-verify-suite-registration.mjs
# expected: PASS, then exit 0 with 1093 registered, 0 unregistered
git add -- docs/product-capability-inventory.json
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/K133-msg-1.txt -- docs/product-capability-inventory.json
```
- Step 40 (K125 inventory diff) applies plain after 39b; its inventory check passes.

## R2 step 45: concrete file paths (the runbook said "Add the files named in the diff header")
Replace the step-45 block after the `git apply` lines with exactly:
```
git add -- plugins/pipeline-core/lib/pins/role-route-preflight-with-self-dispatch-fallback.test.mjs plugins/pipeline-core/scripts/design-approval-route.e2e.test.mjs plugins/pipeline-core/scripts/design-review-receipt.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/45-fallback-receipt-field-pin.txt -- plugins/pipeline-core/lib/pins/role-route-preflight-with-self-dispatch-fallback.test.mjs plugins/pipeline-core/scripts/design-approval-route.e2e.test.mjs plugins/pipeline-core/scripts/design-review-receipt.mjs
```
(the diff header names exactly these three files; the producer script is `scripts/design-review-receipt.mjs`, not `lib/design-review-receipt.mjs` of step 44).

## R3 step 46b (NEW, after 46, before 47): line-bound ratchet final
- What failed: step 34's ratchet values were measured before steps 38-46. At the state after step 46, `node plugins/pipeline-core/scripts/architecture-boundary-check.mjs --root .` reports three `over-line-bound` findings: `native-goldfish-host-state.mjs` 1611 -> 1614 (step 38), `scripts/pipeline-state.mjs` 13845 -> 13850 (step 44), `lib/model-family-host-store.test.mjs` 1163 -> 1167 (already over on the main checkout before the sitting; no sitting diff touches it).
- Repair: `K133-ratchet-final.diff` (3 `maxLines` values, no headroom), message `K133-msg-2.txt`. The accepted value equals the measured count, as in step 34. The `reason` text of the model-family entry still says "now 1163" (stale wording, harmless).
- Insert between steps 46 and 47:
```
## 46b UN ratchet final (measured after step 46; step 47 must stay the last source-affecting step)
git apply --check specs/sprint-alfred-epic/evidence/sitting/K133-ratchet-final.diff
git apply specs/sprint-alfred-epic/evidence/sitting/K133-ratchet-final.diff
git add -- architecture/boundary-policy.json
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/K133-msg-2.txt -- architecture/boundary-policy.json
```
- Not repaired (pre-existing, report only): 21 `unowned-path` findings for `scripts/*.mjs` (same 21 on the main checkout today; K108 saw 18). The checker exits 1 because of them regardless of the ratchet.
- Checker name: the briefing's `harness/scripts/check-architecture-boundaries.mjs` does not exist; the checker is `plugins/pipeline-core/scripts/architecture-boundary-check.mjs --root .`.

## R4 step 47: the static mirrors diff is wrong on any run but its own chain (REPLACE the block)
- What failed: `git apply k132-mirrors-protected.diff` applied cleanly, then `node scripts/sync-reader-inputs.mjs --check` exited 1 with DRIFT (4): inventory mirror differs from source, manifest differs, `inputHashes` pin, manifest hash pin. Cause: the mirrored `docs/product-capability-inventory.json` contains `sourceBaseline`, a commit SHA that `rebaseline-inventory.mjs` measures live in steps 03/37 (and now 39b); the SHAs of the sitting's commits can never equal the SHAs the diff was cut on. The runbook line has no stop on that check, so the commit would have been made with a stale mirror.
- Repair: only the hand-written part of the diff (two `ALLOWLIST` lines in `harness/scripts/check-consumer-safe-paths.mjs`, `K133-k132-allowlist-protected.diff`, the first file of the K132 diff) is applied as a diff; the mirrors, manifest and the two pins are produced by the sync script itself, then checked. Replace the whole step-47 block with:
```
## 47 PRO Reader-input mirrors and pins (LAST source-affecting step)
Any later edit of the inventory or the governance input makes the mirrors stale. The mirrors carry the live sourceBaseline, so they are GENERATED here, never applied from a diff. Do not commit if the --check line exits non-zero.
git apply --check specs/sprint-alfred-epic/evidence/sitting/K133-k132-allowlist-protected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/K133-k132-allowlist-protected.diff
node scripts/sync-reader-inputs.mjs
node scripts/sync-reader-inputs.mjs --check
git add -- plugins/pipeline-core/reader-inputs plugins/pipeline-core/lib/doc-reader-documentation-snapshot.mjs harness/scripts/check-consumer-safe-paths.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/47-reader-input-mirrors-protected.txt -- plugins/pipeline-core/reader-inputs plugins/pipeline-core/lib/doc-reader-documentation-snapshot.mjs harness/scripts/check-consumer-safe-paths.mjs
```
Expected: `synced 5 drift item(s)` (inventory mirror, governance mirror, manifest, two pins), then `PASS: Reader-input mirrors, manifest and pins are consistent with their sources`, commit touches 5 files. `k132-mirrors-protected.diff` is no longer used by the sitting. If the sitting inserts any commit that edits the inventory or the governance input after 47, rerun the sync block.

## R5 pre-commit hook on protected paths (--no-verify is not printed in the runbook)
- The sitting README says the operator commits protected paths with `git commit --no-verify -F ... -- <paths>` "exactly as runbook.md prints them", but no runbook line carries `--no-verify`. The main checkout's generated pre-commit hook, run as a probe against each step's staged state, REFUSED 12 steps: 01 and 02 (TP-3, TP-13), 11, 32, 44 (PB-SANCTIONED-WRITER, `pipeline-state.mjs`), 14, 25, 26, 29 (PB-GUARD-HOOKS, `lib/guard/*`), 36, 38 (TP-13, `verify-suites.json`), 46 (GS-11, `.claude/pipeline.json`). The other 36 of the 48 commits passed the probe; the commit-msg hook passed for all 48 message files. The probe result depends on the state of the main checkout, so the set on the real sitting may differ.
- Repair: write `git commit --no-verify -F <msg> -- <paths>` on every PRO step (at least 01, 02, 11, 14, 25, 26, 29, 32, 36, 38, 44, 46) and keep plain `git commit` for UN steps. The commit-msg hook is skipped by `--no-verify`; its probe passed for all messages.

## R6 step 35 and ordering
Step 35 stays skipped (PO decision). If the C28 re-pin is applied later, it must run after step 47 only if none of the six Critic-contract files changed since; re-measure first (`k108-repin.mjs` idea).
