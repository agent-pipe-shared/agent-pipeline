# C28 held patch: a declined acceptance in the close returns the feature to a correction round

Slice `C28-DECLINED-ACCEPTANCE-ROUTE`. Closest criterion: AC-108 (the one-shot close). PRD and Spec unchanged. Built in the clone of the
candidate 28 integration state, saved as `c28-declined-acceptance.patch`. Nothing was committed in the real checkout.

## What

1. **Consent.** The acceptance question now states one fixed yes form. `--human-acceptance` records an acceptance only for exactly that form,
   normalised for case, surrounding space and closing `.`/`!`. Any other answer is the typed stop `ONESHOT-ACCEPTANCE-NOT-YES`
   (stage `acceptance`), which writes nothing and names both ways on. No keyword search. `--human-decline "<literal answer>"` is the new
   decline input, exclusive with `--human-acceptance`; the stop text of `ONESHOT-ACCEPTANCE-REQUIRED` names both flags.
   *Where the form's words come from:* the project's human-facing language as Continuity already records it
   (`continuity.runtime.humanFacingLanguage`): `en` is `yes, I accept`, `de` is `ja, ich akzeptiere`, every other language (and a project
   without a Continuity binding) falls back to the English form. Only the form of the project's language is a yes; the English form is not
   a yes in a German project.
2. **Decline record.** `specs/<feature>/evidence/human-decline-<candidate12>-<answer8>.md`, with the literal answer, the candidate commit,
   the open checks and the time. It carries its own markers, so `readAcceptanceRecord` (which reads `acceptance.md` and
   `evidence/human-acceptance.md`, and only the acceptance markers) can never return it. It is committed through the close's own
   writer-commit capability (the `commit` object of the result, same mechanism as the close commit), and none of the close's leftover
   rollback names it, so the rollback never deletes it.
3. **Retire the bound Result.** New State transition pair `continuity-result-retire-plan` / `continuity-result-retire-apply`, modelled on the
   rebind pair: plan digest, expected revision, expected pre- and post-state digests, `--activate`, zero mutation on any mismatch, replay
   returns `replayed`. Eligibility is the rebind's (implementing lifecycle, authority closure, no dispatch, blocker, recovery, decision
   transaction, close transition) plus: the queue head is not already at `close`, and the bound Result is the canonical `result.md` that ends
   exactly with the canonical bootstrap block. It sets `continuity.authority.result` to null, advances the revision, appends
   `{path, sha256, retiredAt, reason: "declined-acceptance", declineRecord: {path, sha256}}` to the new optional
   `continuity.resultRetirements` (validated in `lib/continuity-state.mjs` and `scripts/continuity-state.schema.json`), and removes the canonical
   bootstrap block from `result.md` so the file is again the text the bootstrap accepts (the bootstrap refuses a Result that already holds a
   `pipeline-result` block, which is why a decline used to leave no way to bind a Result again). It also moves the one result entry of the package
   manifest that binds the retired Result back to the digest of the restored text. The existing reconcile cannot do that: its planner only moves a
   Result digest forward (the fence before the bootstrap block must hash to the stale digest) and refuses a "metadata-only digest refresh". The retire
   does exactly the inverse of the forward step, touches nothing else in the manifest and lifts or grants no authority. Without that step the second
   bootstrap refused `PS-RESULT-BOOTSTRAP-PACKAGE condition=manifest-invalid` (measured). Order: State first, then `result.md`, then the manifest; a replay
   of the same apply completes whichever file step is pending and refuses a half-done package it cannot complete.
4. **The one-shot drives it.** On `--human-decline`: record, retire, arm the commit of exactly those paths, and return status
   `declined` whose `next` lists, in order: the commit, the correction dispatch (`prepare-dispatch.mjs goldfish`), the Critic delta round
   (`prepare-dispatch.mjs critic --delta-request`), then the identical close command with `--critic-packet-id <new-packet-id>`. A second close runs the
   Result bootstrap again (`ONESHOT-RESULT-NOT-BOUND`) and asks the acceptance question again for the new HEAD.
5. **`reopen-design` and the inspector.** `reopen-design` with a bound Result is refused before any write with `PLAN-REOPEN-RESULT-BOUND`, naming
   the decline route (in the library `reopenPlanDesign`, so the dry-run preview says the same). The inspector in a draft state that still binds a Result
   names the decline route as a repair instead of `submit-plan`, which would refuse `PLAN-SUBMIT-CONTINUITY-BUSY`.
6. **Docs.** The close-feature skill and the happy-path reference describe the fixed form, the decline and the correction round.

Catalogue projects (owner route): both new entries are on the owner route allowlist exactly like the Result bootstrap, in the five places that list it
(`continuity-owner-route.mjs`, `onboarding-continuity.mjs` twice, `session-requester-bridge.mjs`, `session-authority-registry.mjs`, and the State writer's companion
sets), and the apply declares the State file, `result.md` and the package manifest as its companion effects. The chain test with a catalogue walks it.

*The Close lifecycle the one-shot opens on the owner route (`ensureOwnerLifecycle`, phase `checkpointed`):* today nothing in the dispatch preparation or the
guards reads the close lifecycle directory (searched), so it does not block the correction dispatch. The second close finds that one open lifecycle again
(`onlyOpenLifecycle`) and `ensureOwnerLifecycle` leaves a `checkpointed` lifecycle as it is, so the second close reuses it; the catalogue chain test walks this.

## Proof

Test-first: the cases below were written and run red against the original code before the first production edit (RED counts in the report).
They sit in registered suites; no new test file needs registration. Pinned cases whose answer is now the fixed yes form were restated in place with a
comment (QG-04).

| Suite | Cases |
|---|---|
| `scripts/finish-feature.test.mjs` | fixed form in the question and the stop; non-yes answers (German bug report, "yes", "yes, but ...", "no", ...) stop and write nothing; normalisation; German form and English fallback; flag exclusivity; the decline (record, retire, order of calls, no Verify, correction steps); no-Continuity decline; the commit leaves a clean tree |
| `scripts/close-path-e2e.test.mjs` | the whole chain with real Git and the real State writer: question, non-yes stops and records nothing, `reopen-design` refused with a bound Result, decline, stale apply refused with zero mutation, replay, decline commit, correction commit, second close binds the Result again, asks again, closes on a yes. Once without and once with a session-authority catalogue |
| `lib/continuity-state.test.mjs` | the retirement history validates and an invalid one is refused |
| `scripts/pipeline-state-inspect.test.mjs` | a draft state that binds a Result names the decline route, not `submit-plan` |

## Measured so far (clone, one suite at a time)

RED before the first production edit: `finish-feature.test.mjs` 55 tests / 7 fail; `close-path-e2e.test.mjs` 7 tests / 2 fail (both new chain cases).
GREEN after: `finish-feature.test.mjs` 55/55; `close-path-e2e.test.mjs` 7/7 (both chain cases, plain and catalogue); `lib/continuity-state.test.mjs` 116/116;
`pipeline-state-inspect.test.mjs` 28/28 (new case included); `lib/plan-spec-state-v2.test.mjs` 27/27; `pipeline-state-discard-feature.test.mjs` 13/13;
`commit-pipeline-owned.test.mjs` 7/7; `lib/guard-maintenance-window-kernel-closure.test.mjs` 1/1; `pipeline-state-reopen-design.test.mjs` 3/3; the check test 2/2. All exit 0.
No test pins the closed list of owner-route entries (searched). Not run: the full Verify (the Coordinator's), native Windows, and any live Critic round.
The saved patch stacks on the candidate 28 integration state: its `happy-path.md` hunk sits next to a paragraph another candidate 28 patch adds, so it does not apply to the current HEAD alone.

## Not changed

- `pipeline-state.test.mjs` under `harness/scripts` and the verify list files (protected); the Critic preimage files; PRD and Spec.
- No new lib file (so the kernel-closure list is unchanged): the decline record helpers live in the existing `lib/close-acceptance-record.mjs`; the State writer
  does not import it and checks the decline record's path, regular-file status and markers itself.
- The decline needs no signature and adds no gate or review round.

## Not proven

- The Critic delta round in the chain tests: a real Critic cannot run in a test. The second close reuses the fixture's own Critic round (its stop hook ran earlier in the
  same walk) and the correction is an evidence-only commit, which the Critic-bound Verify carries. A correction that changes product code needs a real delta round, as the
  `declined` result says.
- A correction that edits `result.md` itself, or a bound Result that carries more than the canonical bootstrap block: the retire then refuses with
  `PS-RESULT-RETIRE-RESULT-BYTES` and nothing is changed.
- A live dispatch while the owner-route Close lifecycle is open (read from the code, not run).
- Native Windows: no new spawn uses a shell string; the commit and State steps use `process.execPath` and argv arrays. Not run on Windows here.
