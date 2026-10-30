# Held patch notes: W7-N33A close accepts attested records and course receipts (D212 A+B, with C and D)

Patch: `w7-n33a-close-accepts-attested-records-and-course-receipts.patch`, cut against the stacked candidate
(HEAD plus the held patch `w7-ac175a-dispatch-drift-and-audit-index-at-close`). Apply it after that patch.
Backlog item: `backlog/items/2026-10-30-close-gate-rejects-critic-evidence-for-attested-records.md`.
Criterion binding: placeholder item and AC-160 only because the briefing generator needs an item with a criterion.

## What changed

| File | Change |
|---|---|
| `lib/critic-disposition-addendum.mjs` | A: `validateCriticDispositionAddendum` admits a v4 record whose `outcomeClassification.kind` is `orchestrator-attested` with exactly one commit equal to `addendum.candidateCommit` (and, as for every kind, `record.candidateCommit`). The throw text is unchanged. |
| `scripts/check-critic-skip-coverage.mjs` | B: `boundCriticReviewFinding` keeps the pass/candidate/receipt-digest checks, then routes by task id. Equal task id: the unchanged record-binding route (private snapshot or reviewed-blob reference). Different task id: new `courseReceiptFinding`. New additive export `criticAddendumBindingFinding` (C). The return shape of `evaluateRepositoryCriticSkipCoverage` is untouched. |
| `scripts/dispatch-record-write.mjs` | C: new CLI mode `--critic-addendum <repo-relative-json>` and exported `runCriticAddendumRequest`; `writeCriticDispositionAddendumObject` gains an optional `dependencies.verifyBinding` hook (default absent: the object route behaves as before). |
| `scripts/close-coordinator.mjs` | D: the `CLOSE-CRITIC-EVIDENCE-MISSING` text. |
| `skills/close-feature/SKILL.md` | D: a paragraph naming the refusal, the request file and the command. |
| tests | see "Pins" below. |

## Decision: how the reviewed range is read (B)

The range is `bound.critic.reviewRange = { base, commit, diffSha256 }` of the consumed receipt that
`readBoundConsumedCriticReceipt` returns. That reader has already proved `reviewRange` equals the consumed packet's `diff`
and that `reviewRange.commit` is the review candidate; the receipt validator (`validateSessionCriticReceipt`) requires
`candidate.base === reviewRange.base` and a 40-hex `base`, so a real receipt always names a base. The range is the half-open
set (base, commit]. A record is covered when its commit:

1. is an ancestor of, or equal to, `addendum.reviewCandidateCommit` (this check already ran for every route), and
2. is NOT an ancestor of, or equal to, `reviewRange.base` (a commit equal to the base is outside the range).

`courseReceiptFinding` additionally requires `reviewRange.commit === addendum.reviewCandidateCommit` and a 40-hex base; a receipt
without a range refuses ("names no reviewed range"). Only git's exit 1 from `merge-base --is-ancestor` means "not an ancestor";
any other git failure (for example a base that is a tree id, which the finalizer allows when a review has no base commit)
throws and the existing outer catch refuses with "unavailable or invalid". A tree-id base therefore never satisfies a record
(fail closed). Equality of task ids stays sufficient and is checked first, byte-for-byte as before.

Binding on the course route: ancestry, `reviewPass`, `candidate.commit`, and `criticReceiptSha256`. A range review never lists
per-record evidence, so the reviewed-blob reference and the private-snapshot identity checks of the task-bound route cannot
apply. If the packet carries a private snapshot it must still have the exact key shape, and its `assurance` must be absent
(legacy form), null or `orchestrator-attested` ("keeps checking the assurance snapshot").

Limit to know: a delta round's receipt covers only (previous round candidate, new candidate]. A record whose commit predates the
base of the receipt named in its addendum is refused. The addendum must name a passed receipt whose own range holds the commit
(the first full review of a course covers the whole feature range).

## Decision: the sanctioned addendum route (C)

Before this patch no command wrote an addendum: only the exported function `writeCriticDispositionAddendumObject` existed
(no production caller), so the refusal could not name one. The new mode is the third mutually exclusive mode of
`dispatch-record-write.mjs`:

`node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root <repo-root> --critic-addendum <request.json>`

The request file (under `scratch/`, `evidence/` or `specs/`, same path discipline as `--attested-request`) is the
`pipeline.critic-disposition-addendum.v1` object. Because the publication is exclusive and an addendum can never be replaced,
the command proves the binding BEFORE it writes: it runs the same evidence-digest and receipt checks as the coverage
evaluation (`criticAddendumBindingFinding`) and refuses with code `addendum-unbound`, writing nothing. The object route
keeps its documented behaviour (no receipt check at write).

The refusal text now names this command, states "no round cap since D190/D199; a further correction-diff Critic round is always
allowed", offers the Critic dispatch only for a record no receipt covers, and appends up to three coverage findings about the
uncovered ids so an addendum that exists but does not bind says why. The old "at most three" and "never another Critic" wording is gone.

## Callers of every changed export, and the test that pins each

| Changed | Caller | Pinned by |
|---|---|---|
| `validateCriticDispositionAddendum` | `resolvedCriticAddendumFinding` (coverage, review admission, single-record readback); `writeCriticDispositionAddendumObject` | `N33A the addendum validator admits...`, `N33A an authored-commit record with two commits still refuses...`, `DRW32` |
| `boundCriticReviewFinding` (via `resolvedCriticAddendumFinding`) | `evaluateRepositoryCriticSkipCoverage` (close coordinator `assertCourseCriticEvidence`, scoped by `taskIds`); `evaluateReviewAdmission`; `verifyCriticDispositionAddendumForRecord` (`dispatch-authorship-verify.mjs`, the push gate's authorship check, no edit needed) | `N33A ... task-id-matching receipt`, `N33B two attested records ...` (also reads back through `verifyCriticDispositionAddendumForRecord`), `N33B ... does not contain ...`, `N33B a failed, unconsumed ...`, existing `Critic addendum rejects record drift ...` (wrong task id still refuses) |
| `criticAddendumBindingFinding` (new) | `runCriticAddendumRequest` | `DRW34` |
| `parseArgs`, `runCriticAddendumRequest`, CLI main | operators, the close refusal text | `DRW33`, `DRW34`, `DRW35` |
| `CLOSE-CRITIC-EVIDENCE-MISSING` text | `assertCourseCriticEvidence` | pin `(h)`, `(i)`, `(i) ... before the reviewed range`, restated `AC3` |

The next command after the refusal accepts what it names: the request file, the command and the plan-again step are all in the
text and the skill; there is no circle (the Critic dispatch is only the fallback when no receipt covers the record, and after
it the same command writes the addendum). The push gate and the close gate read one function (`resolvedCriticAddendumFinding`).

## Pins

New cases (RED before the production edit, GREEN after, RED again with the four production files reverted; logs
`red1.*`, `green1.*`, `c1.*`, `revert.*` in the clone directory):

- `check-critic-skip-coverage.test.mjs`: 6 cases `N33A`/`N33B` (real git repository; the receipt reader is injected because the
  coverage evaluation exposes `readBoundCriticReceipt`).
- `dispatch-record-write.test.mjs`: `DRW32`-`DRW35`; the internal count pin moves 31 to 35 (no `verify-case-completion` count is
  registered for this suite, so `harness/scripts/check-verify-case-completion.test.mjs` needed no edit).
- `close-coordinator-refuses-a-required-critic-without-evidence.test.mjs`: `(h)` text, `(i)` plan past the gate with TWO attested
  records covered by ONE real consumed packet (generic batch, admit, finalize; the packet's task id is the first delivery's, so
  the second record is covered by range only), and the negative twin (second record's commit before the range: the close names
  only that record, State and coordinator unchanged).
- `critic-round-cap-and-delta-scope-are-not-enforced.test.mjs`: the `AC3 coordinator next-action text` case is RESTATED, not
  deleted: same intent (the refusal offers the Critic dispatch only with the delta-only follow-up rule), the assertions on the
  dropped cap wording became `doesNotMatch`, plus the new rule and command. Justification: D212 D replaces the stale wording
  that D190/D199 had already made false.

## Deliberately not changed

- `scripts/critic-dispatch-preflight.mjs` still says "one full review and at most three correction-DIFF reviews" and refuses
  `CDP-COURSE-BUDGET`, and `guardrails/quality-gates.md`, `roles/elephant.md`, `agents/critic.md`, the Critic and Goldfish
  templates, `lib/review-economy.mjs`, `lib/dispatch-policy.mjs` and `docs/usage.md` carry the same cap. They are outside the
  write scope and pinned by other cases (`AC1`/`AC2`/`AC3 guardrail` in the round-cap pin). See open items.
- `lib/guard-maintenance-window.mjs` lists `critic-disposition-addendum.mjs` as a path; no digest to move.
- The "carry no matching Critic evidence" prefix of the refusal is kept so existing readers of the text keep matching.
- A record carrying both `criticRequired` and `criticEvidence` stays "conflicting" (`lib/critic-skip-decision.mjs`); records stay immutable.

## Open items

1. `CDP-COURSE-BUDGET` in the Critic preflight and the cap wording listed above contradict "a further correction-diff Critic round
   is always allowed" (D190/D199). Until a slice with that file in scope changes them, the refusal's promise holds for the close
   gate but the preflight may still refuse a further round. Needs its own slice.
2. Early detection (N33 D) is not part of this patch; it should call `evaluateRepositoryCriticSkipCoverage` /
   `criticAddendumBindingFinding` (both additive exports, return shape unchanged).
3. Held-patch apply needs the bundle's usual inventory rebaseline and reader-input sync (`critic-disposition-addendum.mjs`,
   `dispatch-record-write.mjs` and `SKILL.md` are inventoried); not run here.
4. Batch Critic, full Verify, the consumer's real close and PO acceptance stay pending.
