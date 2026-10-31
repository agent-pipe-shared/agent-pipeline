# Held patch notes: W7-N33B early detection of uncovered Critic records (D212 D)

Patch: `w7-n33b-early-detection-of-uncovered-critic-records.patch`, cut against the stacked candidate (HEAD plus the held patches
`w7-ac175a-dispatch-drift-and-audit-index-at-close` and `w7-n33a-close-accepts-attested-records-and-course-receipts`). Apply it
after both. Backlog item: `backlog/items/2026-10-30-close-gate-rejects-critic-evidence-for-attested-records.md` (early detection).
Criterion binding: placeholder item and AC-160 only because the briefing generator needs an item with a criterion.

## What changed

| File | Change |
|---|---|
| `scripts/dispatch-record-write.mjs` | New exports `listUncoveredCriticRecords`, `criticCoverageAdvisory`, `CRITIC_ADDENDUM_COMMAND`, `CRITIC_COVERAGE_ADVISORY_SCHEMA`. `runAttestedRequest` now returns `{ ...receipt, criticCoverageAdvisory }` when the record it just wrote has no covering Critic evidence. The record is written first; the advisory never refuses or throws. |
| `scripts/critic-dispatch-preflight.mjs` | New export `preflightCriticDispatchWithCoverage` (library result plus the advisory); the CLI prints that. `preflightCriticDispatch` is untouched. |
| `scripts/push-init.mjs` | `drivePushInit` is now a thin wrapper over the unchanged sequence (renamed `drivePushInitCore`, not exported) that adds one additive `criticCoverageAdvisory` field. New injection seam `inspectCriticCoverage`. |
| tests | see "Pins". |

## Decision: one evaluation, three callers

None of the three reimplements the coverage rule. `listUncoveredCriticRecords` chooses WHICH Critic-required v3/v4 records to ask
about (`walkDispatchRecords` + `criticDisposition === "required"`, optionally limited to a commit range) and then asks
`evaluateRepositoryCriticSkipCoverage({ root, taskIds })` - the evaluation the feature close runs - and reads its `requiredTaskIds`
(emitted only when scoped, so the scope is the set of candidate owners, `sliceId ?? taskId`, exactly as the close scopes it). A record is
listed only if that evaluation says it is uncovered; an addendum that exists but does not bind (wrong receipt, commit outside the reviewed
range) therefore still lists the record. The `coverageOptions` injection seam of N33a is passed through unchanged.

The advisory object is built once (`criticCoverageAdvisory`) and used verbatim by all three callers, so the text is identical across the
Claude, Codex and Antigravity runners (plain JSON, no runner field):

```
{ schema: "pipeline.critic-coverage-advisory.v1", code: "CRITIC-COVERAGE-PENDING", severity: "advisory", totalCount,
  records: [{ taskId, recordPath, recordSha256, candidateCommit, appliedRow }], command, nextStep, line }
```

`line` is one line that names each record and the next step; `command` is `CRITIC_ADDENDUM_COMMAND`, spelled as N33a spells it (byte-equal to
the `CLOSE-CRITIC-EVIDENCE-MISSING` text in `close-coordinator.mjs`, pinned; the close-feature skill names the same words, wrapped across a line break):
`node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root <repo-root> --critic-addendum <request.json>`. An evaluation that cannot
run is reported as code `CRITIC-COVERAGE-UNAVAILABLE` (never thrown, never a refusal). The list is capped at 25 records (`totalCount` keeps the
true number). `recordSha256` is the digest the addendum request needs.

The sequence the text names is the one that works: first a passed, consumed Critic receipt must cover the record (its own task id, or a
Critic course whose reviewed range contains its commit; the Critic dispatch when none does), then the addendum command. The pin
"the named command accepts what the advisory names" runs that command exactly as named against the listed record and shows the record then
disappears from the listing; the opposite case (an addendum whose receipt does not hold the commit) keeps it listed. No dead end.

## Decision: where each notice lives, and why the Critic preflight is split

- `dispatch-record-write --attested-request`: the result of the write carries the advisory (every attested record is Critic-required by
  construction, so it fires unless coverage exists, which at write time it cannot). Scope of the question: this one task id.
- Critic preflight: the ready result lists the Critic-required records whose candidate commit lies in the reviewed range
  `(base, candidate]` (`git rev-list base..candidate`; whole history up to the candidate when the base is an empty-tree id). That is exactly
  the range N33a reads a course receipt over, i.e. the records this review will cover once it passes. Not computed for a current-artifact
  review (no range).
  **The field is added by `preflightCriticDispatchWithCoverage` (what the CLI prints), not by `preflightCriticDispatch`.** The session
  finalizer binds the library result by digest at admit (`sha256(canonicalJson(preflight))`, session-critic-finalizer.mjs) and recomputes it
  at finalize, refusing on a difference. A listing that changes while a review runs (an attested record or an addendum written in between)
  inside the library result would have turned this advisory into a new refusal at finalize. Kept out of the library result by design; the
  pin asserts the library result has no such field and that the wrapper result equals it apart from the advisory.
- push-init: `criticCoverageAdvisory` on the result of every non-checkpoint, non-usage-error outcome (ready, refused, error). It is not a
  step, not a check, not a blocker (`checks`, `steps`, `recovery.blockers` and the exit status are those of the unchanged sequence). Records
  asked about: `--base`..HEAD when a base is given, else the local commits not yet on `refs/remotes/<remote>/<branch>`, else (no tracking
  ref or no HEAD) every record. Silent (field absent) when nothing is uncovered.

## Callers of every changed or new export, and the test that pins each

| Changed / new | Caller | Pinned by |
|---|---|---|
| `runAttestedRequest` result (additive key) | dispatch-record-write CLI main (prints JSON); `critic-packet-preflight.test.mjs` (reads `receipt.target`, unaffected) | `DRW36`, `DRW37` |
| `listUncoveredCriticRecords` | `runAttestedRequest`; `preflightCriticDispatchWithCoverage`; `inspectPushCriticCoverage` (push-init) | `DRW37`-`DRW39`, `CDPF072`-`CDPF074`, push-init `N33 D` cases |
| `criticCoverageAdvisory` | the same three | same |
| `CRITIC_ADDENDUM_COMMAND` | `criticCoverageAdvisory`; equality pinned against `close-coordinator.mjs` source and the literal in all three test files | `DRW36`, `CDPF072`, push-init `N33 D` (injected) |
| `preflightCriticDispatchWithCoverage` | critic-dispatch-preflight CLI main only | `CDPF072`, `CDPF073`, `CDPF074` (spawns the CLI) |
| `drivePushInit` (wrapper) | `push-init.mjs` `main` (CLI); `architecture-push-currency.test.mjs`, `push-init.test.mjs` | all existing push-init cases unchanged and green; the four `N33 D` cases |

Consumers of the changed outputs that need no edit:

- `session-critic-finalizer.mjs`, `observe-critic-preflight.mjs`, `critic-preflight-observer.mjs`, `register-feature-package.mjs`,
  `push-prepare.mjs`, `verify-evidence-producer.mjs`: call the library `preflightCriticDispatch`, which is unchanged.
- `clean-candidate-run.mjs`, `push-release-flow-docs-contract.test.mjs`: import only `push-init`'s `parseArgs`/`usage`, unchanged.
- `guard-lifecycle-ready` / `sanctioned-args-scripts.mjs`: admit push-init and the preflight by argv; the argv surface is unchanged.
- `docs/push-release-flow.md`, `push-approval.md` reference: describe the outcomes (`signature-required`, `chat-ready`, ...), which are unchanged;
  an extra advisory field on the same JSON cannot break a reader that selects fields by name.

## Pins

New cases (RED before the production edit, GREEN after, RED again with the three production files reverted; logs `red1.*`, `c1.*`,
`revert.*` in the clone directory):

- `dispatch-record-write.test.mjs`: `DRW36`-`DRW39` (internal count pin 35 to 39).
- `critic-dispatch-preflight.test.mjs`: `CDPF072`-`CDPF074` (real git repository; the CLI case spawns the script).
- `push-init.test.mjs`: four `drivePushInit (N33 D)` cases (injected inspection; real default inspection in a remote-less git repository with
  re-entrancy; `--base` range; usage error and printed exit status).

No existing case was weakened, skipped or deleted.

## Deliberately not changed

- `harness/scripts/check-verify-case-completion.test.mjs`: the `critic-dispatch-preflight-tests` row is already red at the candidate
  (pinned 246, measured 296 before this patch; `VCR01` is one of the briefed pre-existing reds, together with the other drifted rows). The three
  new preflight cases move the measured value by the delta recorded under "Counts"; restating one row by that delta would still leave `VCR01`
  red and would collide with every other held patch that restates the same table, so the restatement is left to the bundle's usual
  rebaseline pass, which measures the final tree. No registered count exists for the other two suites.
- The `CDP-COURSE-BUDGET` text in `critic-dispatch-preflight.mjs` (N33c owns it).
- `lib/guard/constants.mjs` carries a comment that push-init "spawns/imports only check-doc-reconciliation.mjs, push-gate-satisfiability.mjs
  and push-prepare.mjs". push-init now also imports `dispatch-record-write.mjs` for its two read-only functions; it still never calls a writer.
  The comment is outside the write scope and does not gate anything.
- The checkpoint lane of `drivePushInit` returns before the advisory is computed (the wrapper skips `checkpoint: true`); that early return is
  correct by construction but has no case of its own. A usage error is pinned.
- Records written through `--request` (authored-commit, host-observed) are not named at write: the briefed scope is the attested route, the one
  that cannot carry evidence at write time. They are still named by the preflight and push-init listings.

## Counts

Baseline (`base1.*`, plain clone at the candidate) against the clone with the patch (`c1.*`, push-init re-run as `c2.*` after one test title was renamed):

| Suite | Baseline | With patch |
|---|---|---|
| `dispatch-record-write.test.mjs` | 35/35 | 39/39 |
| `critic-dispatch-preflight.test.mjs` | 71/71 | 74/74 |
| `push-init.test.mjs` (`--test`) | 39/39 | 43/43 |
| `check-critic-skip-coverage.test.mjs` | 56/56 | 56/56 |
| `close-coordinator.test.mjs` | 38/38 | 38/38 |
| `lib/pins/close-coordinator-refuses-a-required-critic-without-evidence.test.mjs` | 17/17 | 17/17 |
| `harness/scripts/check-verify-case-completion.test.mjs` | red: `VCR01` only | red: `VCR01` only |

The failing-name set of the last suite is `{VCR01}` in both runs. Its mismatch list is identical except for one number: the measured
`critic-dispatch-preflight-tests` top-level-assertions value goes 296 (candidate) to 314 (+18) with the three new preflight cases; the
pinned value is 246 in both, i.e. the row was 50 behind before this patch (see "Deliberately not changed"). The bundle's rebaseline
should restate that row to the final measured value (314 for this stack when applied alone). The other mismatched rows that the
assertion output prints (36, 329, 115, 154, 132) are the same in both runs.

Neighbouring consumers, run once with the patch (`c3.*`, all green): `lib/architecture-push-currency.test.mjs` (9; drives `drivePushInit` and
the preflight together), `critic-packet-preflight.test.mjs` (18; reads the attested receipt), `push-release-flow-docs-contract.test.mjs` (11),
`clean-candidate-run.test.mjs` (6), `observe-critic-preflight.test.mjs` (3).

Revert proof (`revert.*` logs): with `dispatch-record-write.mjs`, `critic-dispatch-preflight.mjs` and `push-init.mjs` restored to the
candidate, exactly the new cases fail (`DRW36`-`DRW39`, `CDPF072`-`CDPF074`, the four `drivePushInit (N33 D)` cases) and every other case
passes; the files were then restored byte-equal. The same eleven failed RED before the production edit (`red1.*`).

Not verifiable here: `hooks/guard-lifecycle-ready.test.mjs` and `hooks/guard-gate-strength.test.mjs` (both reference push-init and the preflight by
command string, both protected) were started as `c4` and had not finished when the tool budget ran out. What was checked statically instead:
they only exercise admission of the command strings and (lifecycle) import `buildPushInitArgv` from push-init, whose argv surface is unchanged.
The `c1` and `c3` runs import the changed modules through the same graph without a cycle. A coordinator with budget should run both once.

Driver patch: 35790 bytes, six files, `git apply --check` on the candidate clone exits 0.

## Open items

1. `guard-maintenance-window.mjs` lists `push-init.mjs`, `critic-dispatch-preflight.mjs` and `dispatch-record-write.mjs` as protected
   paths; held-patch apply needs the bundle's usual inventory rebaseline and reader-input sync. Not run here.
2. Batch Critic, full Verify, the consumer's real close and PO acceptance stay pending.

## Coordinator sweep after the return (2026-10-31)

- The two guard suites the Goldfish could not finish, run in the edited clone: `guard-lifecycle-ready` 420 pass,
  0 fail (log `c4`); `guard-gate-strength` 40 pass, 1 fail, GST33 (logs `c4`, `c5`).
- GST33 fails identically on the plain candidate (`base4`, `base5`). It is pre-existing since a31acd0df and is
  recorded as item 5 in `backlog/items/2026-10-30-pre-existing-reds-hide-new-cases.md`. The preflight's write-API
  import closure is the same 362 modules with and without this patch: `dispatch-record-write.mjs` was already in it,
  via `native-goldfish-host-finalizer.mjs`.
- Further callers of the unchanged library `preflightCriticDispatch`, run in the edited clone (log `c6`):
  `session-critic-finalizer` 91/0, `critic-course-admission` 82/0, the round-cap pin 10/0.
