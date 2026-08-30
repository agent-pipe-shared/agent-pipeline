# Nova open-item code map — 2026-08-30

## Scope and status

The PO requested a current-source re-evaluation of every still-open item with
`sprint: nova` before assigning a future Nova window.  This document records
the result against the source tree at commit `f67007e3`.

The PO additionally reported a live greenfield status of **two of three
runners having reached the happy path with substantially less friction than
earlier runs**.  The third run remains in progress; that observation is
recorded here as live operational evidence only.  None of the closures below
depends on it.

## Executed evidence

- `node plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs`:
  5 passed, 1 legacy test skipped.  Claude, Codex, and Antigravity follow
  only returned Driver actions from an empty folder through a real
  `node --check game.js` verification command and to the first implementation
  file.
- `node plugins/pipeline-core/scripts/pipeline-state.test.mjs`: all checks
  passed, including both rejection and success paths for PRD framing.
- `node harness/scripts/manual-check-logic.test.mjs`: 7/7 passed.
- `node plugins/pipeline-core/scripts/push-prepare.test.mjs`: 54/54 passed.
- `node plugins/pipeline-core/lib/copy-safe-command.test.mjs`: 26/26 passed.
- `node plugins/pipeline-core/lib/worktree-count-check.test.mjs`: 33/33
  passed.
- `node plugins/pipeline-core/lib/critic-skip-decision.test.mjs`: 18/18
  passed; `check-critic-skip-coverage.test.mjs`: 9/9 passed.

## Closed by this assessment

### `pipeline.mandatory-verify-gate-has-no-path-for-a-project-with-no-tests-yet`

The old placeholder is no longer silently accepted:
`manual-check-logic.mjs` distinguishes an absent configuration, an honest
manual declaration, and the unreplaced placeholder, with the latter failing.
The Driver-only three-runner E2E starts from an empty static project, surfaces
the one declared `verifyCommand` input rather than executing a placeholder,
persists a real command, writes `game.js`, and runs `node --check game.js`
successfully.  This satisfies the item's declared controlled-greenfield
outcome without inventing a test command.

### `pipeline.prd-framing-precondition-is-prose-not-a-check`

`pipeline-state.mjs` now exposes
`pipeline.prd-framing-precondition-check` and rejects the exact unedited
framing marker with `PRD-FRAMING-NOT-AUTHORED`.  Its current regression test
proves both the refusal and genuinely-authored success case.  The stated
acceptance criteria are met.

### `pipeline.push-approval-record-always-trails-the-signed-commit`

`approve-push` records `pendingAuditWrite: true`; the first operation of the
next `push-prepare` safely folds that sole pending state write, and refuses to
absorb other dirty work.  The 54-test integration suite includes the real
repository red-to-green reproduction and all stated safe-fold cases.  A
separate unit test at the write site is desirable coverage hygiene, but is not
an unmet acceptance criterion of this item.

## Still relevant — assign Nova B

| Item | Current source conclusion |
| --- | --- |
| `pipeline.resolved-backlog-items-can-keep-status-open-indefinitely` | The predicate checker exists, but eight open items remain undeclared and `UNDECLARED` is advisory; stale-open is still possible. |
| `pipeline.po-facing-commands-are-not-uniformly-rendered-break-safe` | The shared renderer is covered, but `human-guard-override.mjs` still has the legacy raw-renderer path and no repository-wide emitter audit proves the item’s “every emitter” criterion. |
| `pipeline.every-gate-binds-the-whole-tree-so-any-later-commit-voids-it` | Gates still bind the whole candidate commit/tree; no per-gate declared input envelope exists. |
| `pipeline.guard-denial-messages-repeat-70-lines-of-boilerplate` | Long commands are shortened, but the requested first-full/repeat-short session behaviour is absent. |
| `pipeline.critic-skip-not-an-explicit-logged-decision` | Skip schema, guidance, and fixture checks exist, but the actual coverage scanner is not a running `verify.mjs` gate and production emission is not mechanically guaranteed. |
| `pipeline.agent-binding-guards-are-not-os-level-sandboxing` | Deliberately accepted residual threat-model scope; a future PO security-boundary decision remains required. |
| `pipeline.shared-verify-evidence-slot-corrupted-by-concurrent-dispatches` | `verify.mjs` still writes the single `evidence/verify-latest.json` artifact; concurrent full verifies can still contend. |
| `pipeline.no-gate-catches-a-named-design-requirement-silently-absent-from-shipped-code` | No requirement-traceability check is wired into Critic or feature close. |
| `pipeline.lifecycle-event-schema-has-no-non-dispatch-correlation-shape` | The validator still requires dispatch-only correlation fields for every lifecycle kind. |
| `pipeline.workflow-tool-dispatches-produce-no-dispatch-record-artifact` | A diagnostic detects a missing record, but no hard Verify registration or automatic Workflow record producer exists. |
| `pipeline.workflow-tool-isolation-worktree-never-created-a-worktree-this-session` | Count-delta hook and 33 tests exist, but live host confirmation after an actual isolated dispatch remains outstanding. |

## Separate Nova A driver gap

The current three-runner Driver E2E ends intentionally at the first
implementation file.  It therefore cannot exercise the later TOFU/push
handover.  `measure-tofu-push-e2e.mjs` currently stops before that handover
because its scripted driver has not yet supplied the new structured
`answersJson` design response.  That is the remaining Nova A item: repair the
existing Driver measurement so it reaches the legitimate human-signature
stop, then keep it registered as a durable happy-path regression.
