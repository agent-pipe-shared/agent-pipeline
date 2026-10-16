# Audit 2026-10-14: findings mapped to in-scope items

Source: read-only release and architecture audit of `feat/sprint-alfred` (0.7.0), 2026-10-14. The full report is in the PO's hands.

PO direction (2026-10-14):
- Every critical finding, blocker and performance bottleneck is bound to an EXISTING item of the 174-item delivery scope, or to an epic AC.
- None becomes a new out-of-scope item.
- Only findings that fit no item are listed as out of scope, at the end.

How items are referenced:
- Item bodies are deliberately not edited, because editing an original body would raise body-drift findings in the backlog checker.
- This register is the binding.
- Every dispatch for a listed item names its row here as additional context.

"AC-1xx/2xx" are the per-item rows of `specs/sprint-alfred-epic/spec.md` §23. "AC-1..37" are the epic criteria in `specs/sprint-alfred-epic/acceptance.md`.

## Performance bottlenecks

| ID | Finding (evidence) | Bound to |
|---|---|---|
| P1 | `guard-lifecycle-ready.mjs` (PreToolUse, `--runner claude`) takes more than 300 s for `git commit -F … -- <path>` and for `node --test <file>`. `git status` takes 1.9 s. Measured on native Windows, 2026-10-14, against stamp `0.7.0+claude.20261013211724.02bc070`. Inspector stack: `devPlanShellRefusalHit` (`lib/guard/devplan-shell-lane.mjs:61`) → `observedOnboardingCommandMatch` (`lib/guard/command-catalogue.mjs:372`) → full `inspectProjectOnboardingV3` → `assurePrivateDirectory` → `assessWindowsPrivatePath` → one PowerShell DACL child per private path (`lib/windows-private-state.mjs` `invoke`, 7 s timeout each). The hook has no `timeout` in `hooks/hooks.json`. Fix direction: a cheap side-effect-free precondition before the inspection, with identical admit/refuse outcomes. This is hotfix ALF-C-HK-01. | **AC-128** `claude-windows-guard-refuses-every-in-repo-read` (primary). Also AC-270 `windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures` (same DACL machinery), and epic AC-32 (native-Windows happy path with zero hotfixes) and AC-37 |
| P2 | The UserPromptSubmit `claude-intake-prompt-capture.mjs` takes 5.5 s in isolation and times out at its 10 s budget on every prompt (PO observation). | **AC-128** (as P1). Epic AC-37 |
| P3 | Dispatched Goldfish preflight (`pipeline-start-preflight.mjs`) takes more than 120 s per run on this host (P2-11, P2-12, P2-13 reports). | **AC-128**. Epic AC-37 |
| P4 | `SDC-LOCK-HELD` at dispatch admission while 3–4 subagents run hooks. Repeated identical retries are needed, even after the 10 s bounded retry of `02bc07085`. | **AC-224** `parallel-work-in-one-checkout-is-unsafe` (primary). Also AC-161 `dispatch-budget-lock-refuses-every-subagent-call-on-windows` and epic AC-37 (parallel dispatch, bounded backoff, R7-11) |
| P5 | The approved-course test fixture takes about 200 s on Windows (about 70 s in the approval observation alone), while `executeGovernedItemDeliveryChecks` gives each check 60 s. A host item check that builds it times out. | **AC-224**. Epic AC-25 (host re-runs the declared checks) |

## Blockers and critical defects

| ID | Finding (evidence) | Bound to |
|---|---|---|
| B1 | Fanout hotfix `02bc07085`: `orderAndCoverAdmittedSlice` pushes a BATCH-CRITIC slice without a v2 `delivery`, which `validateSliceQueue` rejects (`lib/slice-queue.mjs:558-569`). Every guard/hook/security/architecture-path dispatch is refused with `SDC-AUTHORITY-UNAVAILABLE` / `item-course-prepared-queue-invalid`. A source fix (ALF-C-H2-01) is uncommitted and checked offline; its tests are open. | **AC-224** |
| B2 | `prepareGovernedItemQueue` tolerates a disjointly advanced candidate, but `prepareNativeGoldfishHostState` still requires HEAD == binding candidate (`NGHS-CANDIDATE-MISMATCH`, `NGHS-ITEM-BASE-MISMATCH`). `itemCheckSnapshot` requires the exact candidate too. | **AC-114** `approval-verification-demands-head-equals-candidate`. Also AC-224 |
| B3 | Vendored canon drift: `harness/scripts/generate-vendored-canon.mjs --check` exits 2. `plugins/pipeline-core/guardrails/git.md` (differs at line 47) and `plugins/pipeline-core/roles/critic.md` (differs at line 199) are stale against root. Root/plugin schema copies `pipeline.adoption-proposal.v1.json`, `pipeline.adoption-state.v1.json` and `pipeline.module-inventory.v1.json` differ (Spec §18: schema mirrors join the 0.7 candidate checks). | Epic **AC-12** (rules-as-code / doc-consistency suites). Spec §18 candidate checks |
| B3a | Follow-up, 2026-10-14. The drift runs in BOTH directions.<br>• `roles/critic.md`: the root is newer. Regenerated and committed as `744e09fbd`.<br>• `guardrails/git.md`: the PLUGIN copy is newer. The signed Main commit `d02409a8a` added the "Administrative Elephant commits" section, its registration-commit flow and a GIT-10 line to `plugins/pipeline-core/guardrails/git.md` only. `check-backlog-state.mjs --registration-commit` implements that flow. A plain generator run would delete a live rule, so the fix is to port that text into the root `guardrails/git.md`, then regenerate.<br>• `harness/scripts/generate-vendored-canon.test.mjs` AC-2 is red at HEAD: `plugins/pipeline-core/docs/adr/draft-item-owned-egm-retained-quality-gates.{md,json}` are tracked but unmanifested.<br>• `guardrails/` matches the critical-path pattern `guard*`, so the root fix is dispatchable only after the fanout fix (B1) is installed. | Epic **AC-12**. Spec §18 candidate checks |
| B4 | Self-lockout: the denial texts in `lib/guard/denial-route.mjs:68,72,77,82,95,106` tell the agent to re-run the `project-onboarding-v3` session inspection. The same state refuses it as `opaque-script-execution` (`lib/guard/devplan-shell-lane.mjs:111-119`). | **AC-115** `approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes`. Epic AC-26 |
| B5 | Self-lockout: the denial recommends `design-advisory-admission.mjs inspect` (pinned by `hooks/guard-devplan.test.mjs:68`), but no admission exists in `sanctioned-args-scripts.mjs`, `devplan-shell-lane.mjs`, `shell-grammar.mjs` or `guard-devplan-policy.mjs`. | **AC-148** `denial-names-a-diagnosis-it-refuses`. Epic AC-26 |
| B6 | `reopen-design --by …` is offered (`guard-devplan-policy.mjs:271,276,512,514`; `denial-route.mjs:269`) for non-content-drift causes and in states where it is reportedly unavailable (toil T87, T7/R7-5). Not yet verified against the per-state admission. | **AC-123** `catalogue-admit-prescribed-lifecycle-verbs`. Epic AC-26 |
| B7 | Push classifier: the stdin/heredoc receiver list is still enumerated (`lib/git-cmd.mjs:831-959`). busybox applets and PowerShell here-strings `@"…"@` are not modelled (header 1283-1287). Unlisted stdin runners remain data. | **AC-268** `vim-es-and-busybox-heredoc-runners-are-data-to-the-push-classifier`. Also AC-199 and AC-235 |
| B8 | A hooksPath redirection through the environment (`GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n=core.hooksPath`, `GIT_DIR`) has no match in `hooks/git-dangerous-policy.mjs`. This is unverified in other files. | **AC-235** `push-classifier-deny-list-does-not-converge`. Epic AC-28 |
| B9 | The pre-push backstop is opt-in, not installed on a fresh clone. For `refs/heads/main` it does not mirror the critical-proof chain, the fixed publication executor or the push ledger (`scripts/pre-push-hook-install.mjs:261-270`). Whether `UNBACKED_GATE` (`scripts/check-clone-provisioning.mjs:98-119`) blocks or only reports is unverified. | **AC-116** `auto-install-pre-push-hook-with-the-plugin`. Also AC-172 `feature-branch-push-admitted-without-signature-approval` and epic AC-28 |
| B10 | No batch-Critic or Full-Verify PASS exists, and 0 items are accepted (`docs/state.md` l.19-21, 92-99). The 59 pin/Alfred suites are unregistered in Verify (TP-13, PO signature pending). | Epic **AC-14** (Critic) and **AC-13** (closure). Release preflight, Spec §17 |

## Stale item statuses (code ahead of status; reconcile at closure)

| Finding | Item |
|---|---|
| `agent-obligations.md:35-40` now recommends `git add` then `git commit -F`. The item still describes the old text. | AC-106 `agent-obligations-recommends-a-commit-spelling-guard-push-refuses` |
| GITCLS-F (`env -S`, editor bang) is implemented (`lib/git-cmd.mjs:1304-1313`), but the item is open and unassigned. | AC-180 `git-push-classifier-misses-env-s-and-editor-bang` |
| The Q12 fail-closed marker rule (`lib/git-cmd.mjs:1215-1263`) supersedes shape checks #5/#6. Status not recorded. | AC-236, AC-237, AC-238 (backtick, backslash quotes, nested quotes) |
| The completion report (`docs/sprint-alfred-completion-report.md`, 25 items "100 % closed") and `WORK-STATUS.md` (176 open) count different scopes. | Epic **AC-13** (ledger reconciled) |

## Not bound (no fitting item; non-critical; no new item filed)

- **S3 split of `pipeline-state.mjs`:** not implemented. The file is a 13,793-line monolith with no `lib/state/`. This is a refactor, not a 0.7.0 blocker. The plan documents named by the PO (`docs/working-notes-2026-10/*`) do not exist in any local ref.
- **ADR housekeeping:**
  - There are 18 `docs/adr/draft-*.md` files.
  - Four of them still carry `{{NNNN}}`: b1-worker-pool, critic-report-durable-write-location, read-scope-containment-boundary and repair-availability.
  - `draft-design-advisory-admission-storage` is superseded in direction by ADR-0085.
  - Number or close them after 0.7.0, unless the PO pulls them in.
- **Stale comment in `hooks/guard-lifecycle-ready.mjs:33-37`:** it says `isMachinePlaneWritePath()` is "below", but it lives in `lib/guard/write-scope.mjs`. This is cosmetic; fold it into any AC-128 change.
- **Remote-side push enforcement:**
  - A backlog item exists, but it has no AC row in the spec, so it is outside the 174.
  - Local enforcement stays bound to epic AC-28.
  - Pulling the item into 0.7.0 scope is a PO decision.
