# W7-N30-N32-G12-CLOSE-ROUTE-20261030 -- held patch notes

Patch: `w7-n30-n32-g12-close-route-builder-and-signatures.patch`, built in a prepared clone at candidate
`caaa327ee28e334648e488476af54623883a55e3`, applies on the plain candidate (driver apply-check). Targeted delivery only;
integrated Verify, batch Critic and PO acceptance stay with the Coordinator.

## What the patch does

- **N30.** `po-human-approval.mjs` gains `authorizeCriticalActionCommand({kind, ...})` and `AUTHORIZE_CRITICAL_COMMAND_KINDS`.
  `authorizeCriticalPushCommand` is now its `kind: "push"` case through one private renderer: same argv, same copy-safe
  rendering, and its refusal wording still names `authorizeCriticalPushCommand`. `pipeline-state.mjs`
  `resultBootstrapCompletion(dir, state, binding, deps)` now adds, while the reconcile is pending (ordinary and legacy
  repair), `signatureCommand` (the exact `authorize-critical --kind feature-package-reconcile` line, `kind`,
  `subjectSha256`, `subject`, `candidate`, `expiresAt`, `requiresPoApproval`, `executed: false`) and `reconcileCommand` (the
  follow-on `feature-package-reconcile` argv with four named placeholders for the actor and the three files the signing step
  writes). `subjectSha256 = criticalActionSubjectSha256({kind, candidate, subject: {manifest, planSha256, candidate}})`, the
  preimage `verifyCriticalHumanProof` recomputes at reconcile time. Nothing is executed or signed. With no readable HEAD the
  fields are `signatureCommand: null` plus `signatureUnavailable`.
- **N31/N32.** `close-feature/SKILL.md` has the section "Closing a feature with active Continuity: the ordered route"
  (seven steps with their commands, the `pipeline.continuity-close.v0` keys, the three `closeEvidence` rules, the combined
  Verify/Critic receipt as the usual choice). The refusals `CLOSE-CONTINUITY` (close-coordinator) and the
  `--continuity-close-request` refusal (pipeline-state) keep their original wording as a prefix and append the rule and the
  skill section. `close-block/SKILL.md` step 3 points at the route.
- **G12.** `close-feature/SKILL.md` has a "Command signatures" table taken from each script's parser or help.
- Registration (Coordinator answer 2): the new pin is in `harness/verify-suites.json` and in
  `docs/product-capability-inventory.json` (sorted, duplicate-free surface id; `sourceBaseline` untouched).

## G12 part (4): accepted as already satisfied (Coordinator)

The refusal for several `-m` flags names the allowed form: `commitMessageFileRemediation` in
`plugins/pipeline-core/lib/guard/shell-grammar.mjs` (about lines 1516-1527) says `git commit -F <msgfile> -- <paths>`. No
`git add -u` refusal exists in `guard-git.mjs`, `commit-message-policy.mjs` or `git-dangerous-policy.mjs`, so there is
nothing to extend. `guard-git.mjs` and `commit-message-policy.mjs` are unchanged; `guard-git.test.mjs` is protected (TP-1) and
unchanged. The skill now states the allowed commit form too.

## Callers and the tests that pin them

| Changed surface | Callers | Pinned by |
|---|---|---|
| `authorizeCriticalPushCommand` (delegates) | `push-prepare.mjs` (through deps), `lib/human-terminal-action-catalog.mjs` (`build:`), `guard-lifecycle-ready.test.mjs` (~4238) | `po-human-approval.test.mjs` GF-105 cases (unchanged, green), new N30 delegation case, `push-prepare.test.mjs`, `push-init.test.mjs` |
| `authorizeCriticalActionCommand` (new) | `pipeline-state.mjs` `reconcileSigningRoute` | `po-human-approval.test.mjs` N30 cases, result-bootstrap N30 anchor |
| `resultBootstrapCompletion` completion fields | bootstrap plan/apply/replay/recovery receipts and the legacy-repair receipt (five call sites now pass `deps`; the authenticated-recovery check reads only `.state`) | `pipeline-state-result-bootstrap.test.mjs` (N29 anchor, N30 anchor, no-candidate case) |
| Refusal texts | operators; no test or doc matched the old strings | `close-coordinator.test.mjs` new refusal case, new pin |
| Skills | `close-feature`, `close-block` | new pin `lib/pins/close-feature-names-reconcile-order-and-close-evidence.test.mjs` |

Sweep: no consumer of `signatureCommand`, `reconcileCommand` or the completion `state` value exists in skills, templates,
agents, hooks, lib or docs beyond the changed files. `templates/human-terminal-actions/catalog.json` keeps
`feature-package-reconcile-signature` as `legacy-renderer` (out of scope, unaffected; the builder is not registered as a
catalog template). No test file exists for `human-terminal-action-catalog.mjs` itself; its push `build:` reference is
unchanged and the exported name and signature are identical.

Next command after each refusal: the new texts end at the skill section that names the next command; the signing command is
printed by a fresh `continuity-result-bootstrap-plan`/apply and needs a readable HEAD, otherwise `signatureUnavailable` says
so. Codex and Antigravity routes use the same shared renderer and the same completion; the runner never changes the argv.

## Restated cases

None restated or weakened. One correction of my own new pin before its first green: the flag regex stopped at digits
(`--plan-sha256` read as `--plan-sha`); it now allows digits. No existing case was changed.

## Results (clone against the plain-candidate baseline; counts from finished logs)

| Suite | Baseline | Clone |
|---|---|---|
| pipeline-state-result-bootstrap | 19 pass / 0 fail | 21 / 0 (+ N30 anchor, + no-candidate case) |
| po-human-approval | 189 / 0 | 191 / 0 (+ 2 builder cases) |
| close-coordinator | 35 / 0 | 36 / 0 (+ refusal case) |
| push-prepare | 88 / 0 | 88 / 0 |
| push-init | 39 / 0 | 39 / 0 |
| commit-message-policy | 42 / 0 | 42 / 0 |
| new pin (close-feature-names-reconcile-order-and-close-evidence) | n/a | 5 / 0 |
| pipeline-state.test.mjs | exit 0 | exit 0 |
| guard-git.test.mjs | exit 0 | exit 0 |
| guard-lifecycle-ready.test.mjs | exit 0 | exit 0 |

(The three script-style suites report only an exit code. A catalog-module test path passed to the driver does not exist, so
that exit 1 appears identically in the baseline and the clone and is not a result.)

Revert proof: the anchor and refusal cases were written and run RED against the unmodified production code before the first
production edit (logs `red1.*`: pin 5/5 failed, both N30 bootstrap cases failed, the close-coordinator refusal case failed,
po-human-approval could not load without the new export). `driver revert` (production files back to the candidate, new
tests kept) was also run on the final state: both N30 bootstrap cases fail, the close-coordinator refusal case fails, all 5 pin
cases fail, po-human-approval fails to load; the production files were restored byte-equal afterwards (log `revert.*`).
Driver patch: 11 files, apply-check on the plain candidate exit 0. Wrong-digest proof refused and printed-digest proof admitted
through the real `defaultFeaturePackageReconcileApproval` in the anchor. The capability-inventory checker was not run.

## Open items

- The pin is registered in the clone; the Coordinator applies `verify-suites.json` and the inventory with the patch.
