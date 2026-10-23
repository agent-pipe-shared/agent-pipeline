# K108 operator runbook (sitting order; rehearsed on main e46b4b0cb in scratch/clones/k108)

Run every line from the repository root, one command per tool call / terminal line. `PRO` = protected, the human commits it; `UN` = unprotected, an agent session may commit it after its protected partner. Message files are in `specs/sprint-alfred-epic/evidence/sitting/commit-messages/` (subject, blank line, body, blank line, trailers `AI-Assisted: true` / `Dispatch: stage-0 (elephant)`; replace the Dispatch trailer only if the sitting uses another admitted binding). `H` = `specs/sprint-alfred-epic/evidence/held-patches`.
Expected result of every step: `git apply --check` silent exit 0, `git apply` silent exit 0, commit succeeds through the real pre-commit and commit-msg hooks. The clone commit that rehearsed the step is given in brackets.

## 01 PRO C15 [clone d1a885baf]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k79-c15-verify-caseids-and-k1r.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k79-c15-verify-caseids-and-k1r.patch
git add -- harness/scripts/verify.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/01-c15.txt -- harness/scripts/verify.mjs
```

## 02 PRO C27a [clone 3babf028b]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k82-c16-verify-suites-cumulative.patch
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k82-verify-case-completion-augmentation-rc05.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k82-c16-verify-suites-cumulative.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k82-verify-case-completion-augmentation-rc05.patch
git add -- harness/verify-suites.json harness/config/verify-case-completion-augmentations.v1.json
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/02-c27a.txt -- harness/verify-suites.json harness/config/verify-case-completion-augmentations.v1.json
```

## 03 PRO C27b [clone 619d8d05f]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k79-c16b-inventory-surface-run-parallel.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k79-c16b-inventory-surface-run-parallel.patch
node scripts/rebaseline-inventory.mjs
# expected: sourceBaseline -> the commit of step 02
git add -- docs/product-capability-inventory.json
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/03-c27b-inventory.txt -- docs/product-capability-inventory.json
```

## 04 PRO C17 [clone 151faab0f]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k55-guard-lifecycle-ready-test-posix-command-paths.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k55-guard-lifecycle-ready-test-posix-command-paths.patch
git add -- plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/04-c17.txt -- plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
```

## 05 PRO C18 [clone 726f0ebb2]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k64-onboarding-continuity-staging-banner.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k64-onboarding-continuity-staging-banner.patch
git add -- plugins/pipeline-core/lib/onboarding-continuity.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/05-c18.txt -- plugins/pipeline-core/lib/onboarding-continuity.mjs
```

## 06 PRO C26 [clone b6c1eb8bc]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k80-closed-release-member-step-protected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k80-closed-release-member-step-protected.patch
git add -- plugins/pipeline-core/lib/onboarding-continuity.mjs plugins/pipeline-core/lib/session-authority-orphan-member-step.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/06-c26a.txt -- plugins/pipeline-core/lib/onboarding-continuity.mjs plugins/pipeline-core/lib/session-authority-orphan-member-step.mjs
```

## 07 UN C26 [clone 0ce1ef7a3]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k80-closed-release-member-step-unprotected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k80-closed-release-member-step-unprotected.patch
git add -- plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/07-c26b.txt -- plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs
```

## 08 PRO C19 s1 [clone 24be8857a]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/d75-cancel-class/s4-protected-libs.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/d75-cancel-class/s4-protected-libs.patch
git add -- plugins/pipeline-core/lib/native-goldfish-host-state.mjs plugins/pipeline-core/lib/slice-queue.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/08-c19s1.txt -- plugins/pipeline-core/lib/native-goldfish-host-state.mjs plugins/pipeline-core/lib/slice-queue.mjs
```

## 09 UN C19 s2 [clone 3a9e768b0]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/d75-cancel-class/unprotected-s4-tests-and-s5-scripts-rebased.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/d75-cancel-class/unprotected-s4-tests-and-s5-scripts-rebased.patch
git add -- plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs plugins/pipeline-core/lib/slice-queue.test.mjs plugins/pipeline-core/scripts/dispatch-briefing.mjs plugins/pipeline-core/scripts/dispatch-briefing.test.mjs plugins/pipeline-core/scripts/session-authority-repair.mjs plugins/pipeline-core/scripts/session-authority-repair.test.mjs plugins/pipeline-core/scripts/slice-queue.mjs plugins/pipeline-core/scripts/slice-queue.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/09-c19s2.txt -- plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs plugins/pipeline-core/lib/slice-queue.test.mjs plugins/pipeline-core/scripts/dispatch-briefing.mjs plugins/pipeline-core/scripts/dispatch-briefing.test.mjs plugins/pipeline-core/scripts/session-authority-repair.mjs plugins/pipeline-core/scripts/session-authority-repair.test.mjs plugins/pipeline-core/scripts/slice-queue.mjs plugins/pipeline-core/scripts/slice-queue.test.mjs
```

## 10 PRO C19 s3 [clone afd6eadef]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/d75-cancel-class/s5-protected-guard-dispatch.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/d75-cancel-class/s5-protected-guard-dispatch.patch
git add -- plugins/pipeline-core/hooks/guard-dispatch.mjs plugins/pipeline-core/hooks/guard-dispatch.test.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/10-c19s3.txt -- plugins/pipeline-core/hooks/guard-dispatch.mjs plugins/pipeline-core/hooks/guard-dispatch.test.mjs
```

## 11 PRO C20 [clone ad4064ffc]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k67-discard-feature-finish-orphan-release.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k67-discard-feature-finish-orphan-release.patch
git add -- plugins/pipeline-core/scripts/pipeline-state.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/11-c20.txt -- plugins/pipeline-core/scripts/pipeline-state.mjs
```

## 12 PRO C21 [clone a644441c8]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k73-guard-apply-patch-fixtures.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k73-guard-apply-patch-fixtures.patch
git add -- plugins/pipeline-core/hooks/guard-apply-patch.test.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/12-c21.txt -- plugins/pipeline-core/hooks/guard-apply-patch.test.mjs
```

## 13 PRO C22 [clone adef559e4]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k76-antigravity-pretool-guard-fixtures-cumulative.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k76-antigravity-pretool-guard-fixtures-cumulative.patch
git add -- plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/13-c22.txt -- plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs
```

## 14 PRO C24 [clone a1432edb2]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k76-evaluate-shared-onboarding-observation.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k76-evaluate-shared-onboarding-observation.patch
git add -- plugins/pipeline-core/lib/guard/evaluate.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/14-c24.txt -- plugins/pipeline-core/lib/guard/evaluate.mjs
```

## 15 PRO C23 [clone c4640c0ef]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k75-classifier-protected-test-paths.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k75-classifier-protected-test-paths.patch
git add -- plugins/pipeline-core/lib/protected-test-paths.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/15-c23a.txt -- plugins/pipeline-core/lib/protected-test-paths.mjs
```

## 16 UN C23 [clone 94a559b4c]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k75-classifier-unprotected-pins.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k75-classifier-unprotected-pins.patch
git add -- plugins/pipeline-core/lib/pins/git-stash-list-classified-as-working-tree-write.test.mjs plugins/pipeline-core/lib/pins/hgo-patch-preflight-before-signature.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/16-c23b.txt -- plugins/pipeline-core/lib/pins/git-stash-list-classified-as-working-tree-write.test.mjs plugins/pipeline-core/lib/pins/hgo-patch-preflight-before-signature.test.mjs
```

## 17 PRO C25 [clone a28546501]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k81-adapter-purity-protected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k81-adapter-purity-protected.patch
git add -- plugins/pipeline-core/lib/critic-review-lineage-core.mjs plugins/pipeline-core/lib/critic-review-lineage.mjs plugins/pipeline-core/lib/guard-maintenance-window.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/17-c25a.txt -- plugins/pipeline-core/lib/critic-review-lineage-core.mjs plugins/pipeline-core/lib/critic-review-lineage.mjs plugins/pipeline-core/lib/guard-maintenance-window.mjs
```

## 18 UN C25 [clone ecea6e946]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k81-adapter-purity-unprotected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k81-adapter-purity-unprotected.patch
git add -- docs/guard-maintenance-window-threat-model.md plugins/pipeline-core/lib/interruption-source-adapter.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/18-c25b.txt -- docs/guard-maintenance-window-threat-model.md plugins/pipeline-core/lib/interruption-source-adapter.mjs
```

## 19 PRO C29 K92 [clone 7ce60c753]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k92-gs1-signature-route-protected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k92-gs1-signature-route-protected.patch
git add -- plugins/pipeline-core/lib/human-guard-override.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/19-k92p.txt -- plugins/pipeline-core/lib/human-guard-override.mjs
```

## 20 UN C29 K92 [clone 174f59ce7]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k92-gs1-signature-route-unprotected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k92-gs1-signature-route-unprotected.patch
git add -- plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs plugins/pipeline-core/lib/pins/signature-ceremony-requires-operator-work-and-breaks.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/20-k92u.txt -- plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs plugins/pipeline-core/lib/pins/signature-ceremony-requires-operator-work-and-breaks.test.mjs
```

## 21 PRO C30 K104 [clone 566c057a9]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k104-fanout-guard-enforce-protected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k104-fanout-guard-enforce-protected.patch
git add -- plugins/pipeline-core/hooks/guard-dispatch-fanout.test.mjs plugins/pipeline-core/hooks/guard-dispatch.mjs plugins/pipeline-core/lib/dispatch-record-liveness.mjs plugins/pipeline-core/scripts/dispatch-record-liveness.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/21-k104p.txt -- plugins/pipeline-core/hooks/guard-dispatch-fanout.test.mjs plugins/pipeline-core/hooks/guard-dispatch.mjs plugins/pipeline-core/lib/dispatch-record-liveness.mjs plugins/pipeline-core/scripts/dispatch-record-liveness.mjs
```

## 22 UN C30 K104 [clone ce462be41]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k104-fanout-guard-enforce-unprotected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k104-fanout-guard-enforce-unprotected.patch
git add -- plugins/pipeline-core/lib/dispatch-scope-overlap.test.mjs plugins/pipeline-core/scripts/dispatch-briefing.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/22-k104u.txt -- plugins/pipeline-core/lib/dispatch-scope-overlap.test.mjs plugins/pipeline-core/scripts/dispatch-briefing.mjs
```

## 23 PRO C31 K95+K106 [clone c826959f6]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k95-d75a-recon-gate-protected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k95-d75a-recon-gate-protected.patch
git add -- plugins/pipeline-core/lib/dispatch-briefing-build.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/23-k95p.txt -- plugins/pipeline-core/lib/dispatch-briefing-build.mjs
```

## 24 UN C31 K95+K106 [clone 0bfb56177]
The held `H/k95-d75a-recon-gate-unprotected.patch` fails `git apply --check` on `scripts/dispatch-briefing.mjs` (K104 moved the running-dispatch reader into the lib); use the rebased diff, built from the 3-way result (see k108-notes.md).
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k95-unprotected-rebased.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k95-unprotected-rebased.diff
git add -- plugins/pipeline-core/scripts/dispatch-briefing.mjs plugins/pipeline-core/scripts/dispatch-briefing.test.mjs plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/24-k95u.txt -- plugins/pipeline-core/scripts/dispatch-briefing.mjs plugins/pipeline-core/scripts/dispatch-briefing.test.mjs plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md
```

## 25 PRO C32 K96 [clone acda887cc]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k96-read-credential-target-protected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k96-read-credential-target-protected.patch
git add -- plugins/pipeline-core/lib/guard/denial-route.mjs plugins/pipeline-core/lib/guard/evaluate.mjs plugins/pipeline-core/lib/guard/grammar-denials.mjs plugins/pipeline-core/lib/guard/shell-grammar.mjs plugins/pipeline-core/lib/passive-read-policy.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/25-k96p.txt -- plugins/pipeline-core/lib/guard/denial-route.mjs plugins/pipeline-core/lib/guard/evaluate.mjs plugins/pipeline-core/lib/guard/grammar-denials.mjs plugins/pipeline-core/lib/guard/shell-grammar.mjs plugins/pipeline-core/lib/passive-read-policy.mjs
```

## 26 PRO C32 K105 [clone 16a3042e0]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k105-claude-native-read-credential-code-protected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k105-claude-native-read-credential-code-protected.patch
git add -- plugins/pipeline-core/lib/guard/read-scope.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/26-k105p.txt -- plugins/pipeline-core/lib/guard/read-scope.mjs
```

## 27 UN C32 K96 [clone 43fcbf94d]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k96-read-credential-target-unprotected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k96-read-credential-target-unprotected.patch
git add -- plugins/pipeline-core/hooks/antigravity-native-read-credential-roots.test.mjs plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs plugins/pipeline-core/lib/pins/read-blocks-and-misleading-denial-texts-across-runners.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/27-k96u.txt -- plugins/pipeline-core/hooks/antigravity-native-read-credential-roots.test.mjs plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs plugins/pipeline-core/lib/pins/read-blocks-and-misleading-denial-texts-across-runners.test.mjs
```

## 28 UN C32 K105 [clone 306030352]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k105-claude-native-read-credential-code-unprotected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k105-claude-native-read-credential-code-unprotected.patch
git add -- plugins/pipeline-core/lib/pins/read-blocks-and-misleading-denial-texts-across-runners.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/28-k105u.txt -- plugins/pipeline-core/lib/pins/read-blocks-and-misleading-denial-texts-across-runners.test.mjs
```

## 29 PRO C33 K97 [clone ef698d6d3]
The held `H/k97-ap11-git-show-pipe-protected.patch` fails plain `git apply --check` on `lib/guard/shell-grammar.mjs` (K96 changed the neighbouring lines); `git apply --3way` of the held patch also works. The rebased diff below is the exact outcome of the clone.
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k97-protected-rebased.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k97-protected-rebased.diff
git add -- plugins/pipeline-core/hooks/guard-command-grammar.mjs plugins/pipeline-core/lib/guard/shell-grammar.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/29-k97p.txt -- plugins/pipeline-core/hooks/guard-command-grammar.mjs plugins/pipeline-core/lib/guard/shell-grammar.mjs
```

## 30 UN C33 K97 [clone db5c5087c]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k97-ap11-git-show-pipe-unprotected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k97-ap11-git-show-pipe-unprotected.patch
git add -- plugins/pipeline-core/lib/pins/advertised-git-to-head-pipeline-is-refused.test.mjs plugins/pipeline-core/lib/pins/claude-windows-guard-refuses-every-in-repo-read.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/30-k97u.txt -- plugins/pipeline-core/lib/pins/advertised-git-to-head-pipeline-is-refused.test.mjs plugins/pipeline-core/lib/pins/claude-windows-guard-refuses-every-in-repo-read.test.mjs
```

## 31 PRO C34 K98 [clone bd5ade657]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k98-refusal-texts-protected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k98-refusal-texts-protected.patch
git add -- plugins/pipeline-core/lib/commit-message-policy-administrative-refusal.test.mjs plugins/pipeline-core/lib/commit-message-policy.mjs plugins/pipeline-core/scripts/onboarding-init-machine-plane-reason.test.mjs plugins/pipeline-core/scripts/onboarding-init.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/31-k98p.txt -- plugins/pipeline-core/lib/commit-message-policy-administrative-refusal.test.mjs plugins/pipeline-core/lib/commit-message-policy.mjs plugins/pipeline-core/scripts/onboarding-init-machine-plane-reason.test.mjs plugins/pipeline-core/scripts/onboarding-init.mjs
```

## 32 PRO C35 K103 [clone fdb3f5c68]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k103-approve-push-chat-catalogue-repair-protected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k103-approve-push-chat-catalogue-repair-protected.patch
git add -- plugins/pipeline-core/scripts/pipeline-state.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/32-k103p.txt -- plugins/pipeline-core/scripts/pipeline-state.mjs
```

## 33 UN C35 K103 [clone 839758530]
```
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k103-approve-push-chat-catalogue-repair-unprotected.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k103-approve-push-chat-catalogue-repair-unprotected.patch
git add -- plugins/pipeline-core/scripts/pipeline-state-approve-push-chat-catalogue-repair.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/33-k103u.txt -- plugins/pipeline-core/scripts/pipeline-state-approve-push-chat-catalogue-repair.test.mjs
```

## 34 UN ratchet [clone 0934961fe]
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/ratchet-delta.diff
git apply specs/sprint-alfred-epic/evidence/sitting/ratchet-delta.diff
git add -- architecture/boundary-policy.json
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/34-ratchet.txt -- architecture/boundary-policy.json
```

## 35 DEFERRED (NOT in this sitting; PO decision: right before the stamp, after the Critic batch) C28 [clone e18789b6f]
DO NOT RUN THIS STEP AT THE SITTING. It is kept here for the moment right before the stamp. Re-measure first: if any of the six Critic-contract files changed since this rehearsal, regenerate (`node scratch/k108-repin.mjs` rewrites the six digests from the working tree). The held `H/k82-critic-preimage-repin.patch` carries the same six digests and is still valid on main today.
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/critic-preimage-repin.diff
git apply specs/sprint-alfred-epic/evidence/sitting/critic-preimage-repin.diff
git add -- plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/35-c28.txt -- plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json
```

## 36 PRO K118 registration of the seven test files [clone 9b00beff7]
Needs steps 01-35 applied (the seven files exist only with the bundle; step 02 created the declarative entries). Run before 37. The registry/test hunks are unprotected but belong to the same commit.
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k118-suite-registration-protected.diff
git apply --check specs/sprint-alfred-epic/evidence/sitting/k118-suite-registration-unprotected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k118-suite-registration-protected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k118-suite-registration-unprotected.diff
node harness/scripts/check-verify-suite-registration.mjs
# expected here: exit 2 with 7 UNCATEGORIZED-VERIFY-SURFACE lines (fixed by step 37); the 7 UNREGISTERED lines are gone
git add -- harness/verify-suites.json harness/config/verify-case-completion.v1.json harness/scripts/check-verify-case-completion.test.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/36-register-decision-round-tests.txt -- harness/verify-suites.json harness/config/verify-case-completion.v1.json harness/scripts/check-verify-case-completion.test.mjs
```

## 37 PRO K118 inventory surfaces and rebaseline [clone cf977e3b8]
Run AFTER 36 is committed (the baseline must be the commit that holds the registrations). The diff carries the 7 surface lines only; the sourceBaseline value is re-measured by the script, never applied from a diff.
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k118-suite-registration-inventory-protected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k118-suite-registration-inventory-protected.diff
node scripts/rebaseline-inventory.mjs
# expected: sourceBaseline -> the commit of step 36
node harness/scripts/check-product-capability-inventory.mjs
node harness/scripts/check-verify-suite-registration.mjs
# expected: PASS, then exit 0 with 1092 registered, 0 unregistered
git add -- docs/product-capability-inventory.json
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/37-register-decision-round-inventory.txt -- docs/product-capability-inventory.json
```

## 38 PRO K120 governed delivery check ignores an inherited NODE_TEST_CONTEXT [clone k120]
One line in plugins/pipeline-core/lib/native-goldfish-host-state.mjs plus the suite registration of the new pin. Verified to apply (plain and 3-way) on the state after step 37. Run after 37 (verify-suites.json is touched by 36 as well).
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k120-nghs-node-test-context-protected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k120-nghs-node-test-context-protected.diff
git add -- plugins/pipeline-core/lib/native-goldfish-host-state.mjs harness/verify-suites.json
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/38-nghs-node-test-context-protected.txt -- plugins/pipeline-core/lib/native-goldfish-host-state.mjs harness/verify-suites.json
```

## 39 UN K120 pin
The pin is green only with step 38 applied.
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k120-nghs-pin-unprotected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k120-nghs-pin-unprotected.diff
git add -- plugins/pipeline-core/lib/pins/governed-check-child-ignores-inherited-node-test-context.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/39-nghs-node-test-context-pin.txt -- plugins/pipeline-core/lib/pins/governed-check-child-ignores-inherited-node-test-context.test.mjs
```

## 39b PRO K133 inventory surface of the K120 pin suite and rebaseline [after 39]
Run after 39 is committed (the baseline must be the commit that holds the registration and the pin file).
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k133-pin-surface.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k133-pin-surface.diff
node scripts/rebaseline-inventory.mjs
# expected: sourceBaseline -> the commit of step 39
node harness/scripts/check-product-capability-inventory.mjs
node harness/scripts/check-verify-suite-registration.mjs
# expected: PASS, then exit 0 with 1093 registered, 0 unregistered
git add -- docs/product-capability-inventory.json
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/39b-k120-pin-surface-inventory-protected.txt -- docs/product-capability-inventory.json
```

## 40 PRO K125 architecture capability in the inventory [after 39]
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k125-inventory-architecture-capability-protected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k125-inventory-architecture-capability-protected.diff
node harness/scripts/check-product-capability-inventory.mjs
git add -- docs/product-capability-inventory.json
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/40-architecture-capability-inventory-protected.txt -- docs/product-capability-inventory.json
```

## 41 UN K125 governance reclassification and its test assertion
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k125-governance-reclass-unprotected.diff
git apply --check specs/sprint-alfred-epic/evidence/sitting/k125-governance-test-assertion-unprotected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k125-governance-reclass-unprotected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k125-governance-test-assertion-unprotected.diff
node harness/scripts/check-observation-governance.mjs
git add -- governance/observation-doc-governance.json harness/scripts/check-observation-governance.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/41-governance-usage-overview-migration-maintained.txt -- governance/observation-doc-governance.json harness/scripts/check-observation-governance.test.mjs
```

## 42 PRO K127 S4 follows R1 with a typed source-checkout exemption (replaces the K112 hold patches)
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k127-s4-protected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k127-s4-protected.diff
git add -- plugins/pipeline-core/lib/project-calibration-identity.mjs plugins/pipeline-core/lib/consumer-verify.mjs plugins/pipeline-core/scripts/consumer-verify-check.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/42-s4-source-checkout-exemption-protected.txt -- plugins/pipeline-core/lib/project-calibration-identity.mjs plugins/pipeline-core/lib/consumer-verify.mjs plugins/pipeline-core/scripts/consumer-verify-check.mjs
```

## 43 UN K127 pin and evidence producer
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k127-s4-unprotected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k127-s4-unprotected.diff
git add -- plugins/pipeline-core/lib/pins/project-calibration-retains-new-project-placeholder.test.mjs plugins/pipeline-core/lib/pins/parallel-work-in-one-checkout-is-unsafe.test.mjs plugins/pipeline-core/scripts/verify-evidence-producer.mjs plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/43-s4-source-checkout-exemption-pin.txt -- plugins/pipeline-core/lib/pins/project-calibration-retains-new-project-placeholder.test.mjs plugins/pipeline-core/lib/pins/parallel-work-in-one-checkout-is-unsafe.test.mjs plugins/pipeline-core/scripts/verify-evidence-producer.mjs plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs
```

## 44 PRO K128 fallback record on the review receipt
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k128-fallback-protected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k128-fallback-protected.diff
git add -- plugins/pipeline-core/lib/design-review-receipt.mjs plugins/pipeline-core/lib/design-approval-binding.mjs plugins/pipeline-core/lib/design-consistency-check.mjs plugins/pipeline-core/scripts/pipeline-state.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/44-fallback-receipt-field-protected.txt -- plugins/pipeline-core/lib/design-review-receipt.mjs plugins/pipeline-core/lib/design-approval-binding.mjs plugins/pipeline-core/lib/design-consistency-check.mjs plugins/pipeline-core/scripts/pipeline-state.mjs
```

## 45 UN K128 producer flag, pin cases and route-1 assertions

```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k128-fallback-unprotected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k128-fallback-unprotected.diff
git add -- plugins/pipeline-core/lib/pins/role-route-preflight-with-self-dispatch-fallback.test.mjs plugins/pipeline-core/scripts/design-approval-route.e2e.test.mjs plugins/pipeline-core/scripts/design-review-receipt.mjs
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/45-fallback-receipt-field-pin.txt -- plugins/pipeline-core/lib/pins/role-route-preflight-with-self-dispatch-fallback.test.mjs plugins/pipeline-core/scripts/design-approval-route.e2e.test.mjs plugins/pipeline-core/scripts/design-review-receipt.mjs
```

## 46 PRO calibration tier sync (.claude/pipeline.json)
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/claude-calibration-channel-sync.diff
git apply specs/sprint-alfred-epic/evidence/sitting/claude-calibration-channel-sync.diff
git add -- .claude/pipeline.json
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/46-claude-calibration-channel-sync.txt -- .claude/pipeline.json
```

## 46b UN K133 ratchet final (measured after step 46; step 47 stays the last source-affecting step)
The checker is `node plugins/pipeline-core/scripts/architecture-boundary-check.mjs --root .`; 21 pre-existing `unowned-path` findings for `scripts/*.mjs` keep it at exit 1 and are not part of this step.
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k133-ratchet-final.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k133-ratchet-final.diff
node plugins/pipeline-core/scripts/architecture-boundary-check.mjs --root .
# expected: 0 over-line-bound findings
git add -- architecture/boundary-policy.json
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/46b-ratchet-final.txt -- architecture/boundary-policy.json
```

## 47 PRO Reader-input mirrors and pins (LAST source-affecting step)
Any later edit of the inventory or the governance input makes the mirrors stale. The mirrors carry the live `sourceBaseline`, so they are GENERATED here, never applied from a diff. Do not commit if the `--check` line exits non-zero. (`k132-mirrors-protected.diff` is no longer used by the sitting.)
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k133-k132-allowlist-protected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k133-k132-allowlist-protected.diff
node scripts/sync-reader-inputs.mjs
node scripts/sync-reader-inputs.mjs --check
# expected: synced 5 drift items, then PASS: Reader-input mirrors, manifest and pins are consistent with their sources
git add -- plugins/pipeline-core/reader-inputs plugins/pipeline-core/lib/doc-reader-documentation-snapshot.mjs harness/scripts/check-consumer-safe-paths.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/47-reader-input-mirrors-protected.txt -- plugins/pipeline-core/reader-inputs plugins/pipeline-core/lib/doc-reader-documentation-snapshot.mjs harness/scripts/check-consumer-safe-paths.mjs
```

## 48a UN K139 pin cases, skill sentence and ratchet (after step 47; cut against the post-sitting state)
The five new cases are red until step 48b lands; commit 48a directly before 48b. The skill sentence and the preflight suite extension are unprotected; the ratchet raises the line bound of the preflight script and its suite.
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k139-mp04-unprotected.diff
git apply --check specs/sprint-alfred-epic/evidence/sitting/k139-ratchet.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k139-mp04-unprotected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k139-ratchet.diff
git add -- plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs plugins/pipeline-core/skills/pipeline-start/SKILL.md architecture/boundary-policy.json
git commit -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/48a-mp04-readback-pin.txt -- plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs plugins/pipeline-core/skills/pipeline-start/SKILL.md architecture/boundary-policy.json
```

## 48b PRO K139 subagent-model readback in the preflight (kernel path)
```
git apply --check specs/sprint-alfred-epic/evidence/sitting/k139-mp04-protected.diff
git apply specs/sprint-alfred-epic/evidence/sitting/k139-mp04-protected.diff
git add -- plugins/pipeline-core/scripts/pipeline-start-preflight.mjs
git commit --no-verify -F specs/sprint-alfred-epic/evidence/sitting/commit-messages/48b-mp04-readback-protected.txt -- plugins/pipeline-core/scripts/pipeline-start-preflight.mjs
node plugins/pipeline-core/scripts/architecture-boundary-check.mjs --root .
# expected: 0 over-line-bound findings, unowned-path findings unchanged (exit 1 stays)
node scripts/sync-reader-inputs.mjs --check
# expected: PASS (if it reports drift, the preflight change reached a Reader-input source: stop and report)
```
Measured on the post-sitting state: preflight suite 87 pass before, 92 pass / 0 fail after; doc contracts valid; consumer-safe-paths 9/9; inventory check green. Notes: `notes/k139-mp04-readback.md`.
