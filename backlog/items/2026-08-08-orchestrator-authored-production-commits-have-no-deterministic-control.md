---
schema: pipeline.backlog-item.v1
id: pipeline.orchestrator-authored-production-commits-have-no-deterministic-control
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Critic delta re-review v2, 2026-08-08 (backlog/evidence/2026-08-08-critic-delta-v2-verdict.md, Findings A and B). The pattern recurred nine minutes after the commit that acknowledged it."
---

# Two lifecycle rules are enforced only by a reviewer reading history afterwards

## The observation

The Critic's delta re-review of the GF-056 remediation found a fresh instance of the
very finding the delta was remediating. `c8e5edf` is a production change to
`plugins/pipeline-core/scripts/po-human-approval.mjs` — what the approval record
contains, so security-relevant — committed by the orchestrator after the SETUP-1
dispatch ended without committing its own diff. `11ae7e7`, which owns exactly this
pattern from the previous batch, landed **nine minutes earlier in the same delta**.

That timing is the whole point of this item. The correction applied last time was a
written acknowledgement plus an intention. It survived nine minutes.

A second, smaller instance in the same delta: `6decf59` uses the commit type
`design`, which `guardrails/git.md:16` (GIT-01) does not admit. Nothing deterministic
caught that either — `commit-message-policy-tests` unit-tests the policy module, it
does not check commit subjects in a range.

## Why they belong in one item

Both are prose rules whose only enforcement is a Critic reading history after the
fact. That works — it caught both — but it works *late*: after the commit exists, at
which point the hard rule against rewriting history means the finding can only ever
be recorded, never fixed. An enforcement that can only produce records is an audit
trail, not a control.

The two differ in difficulty, and the difference matters:

- **The commit type is decidable from the message alone.** A subject line either
  starts with an admitted type or it does not.
- **The authorship rule is not decidable from the commit.** "Was this diff authored
  by a dispatch?" is not a property of the diff. The trailer is a claim, and GIT-03
  deliberately makes it optional, so its absence proves nothing.

## Direction, not a design

1. **Do the decidable one first and separately.** A commit-message type check, run
   where commit messages actually pass — the same place the existing message policy
   already lives. Small, deterministic, no judgement.
2. **For authorship, do not reach for a trailer requirement.** Making `Dispatch:`
   mandatory converts an honest optional signal into a field that gets filled in to
   pass a check. The failure mode this repository already observed — a dispatch
   reporting a record it never wrote
   (`2026-08-08-a-dispatch-reported-creating-a-record-it-never-created.md`) — is
   exactly what happens when a claim becomes a gate.
3. **Ask instead what makes the orchestrator commit production diffs at all.** In
   both observed cases the reason was the same: a dispatch produced a correct diff
   and then ended without committing it — once because a guard structurally prevented
   it, once because the run ended first. The orchestrator was completing work that
   was already done. So the control that would actually bite is upstream: a dispatch
   that cannot commit should not be the normal case, and a dispatch that ends with an
   uncommitted diff should be a visible, typed outcome rather than something the
   orchestrator quietly finishes.
4. **Whatever is built must not block the OM §3.3 stage-0 fast path**, which
   legitimately allows the orchestrator small fixes. The distinguishing property is
   not who typed it but whether the change is trivial — and that is a judgement, which
   is precisely why direction 3 attacks the cause rather than the symptom.

## What is explicitly not the fix

Rewriting history to add trailers. Excluded by hard rule, and it would make the
record less true rather than more.

## Related

- `backlog/evidence/2026-08-08-critic-delta-v2-verdict.md` — the findings as written.
- `backlog/evidence/2026-08-08-critic-gf056-verdict.md` — the prior instance, and the
  acknowledgement that did not hold.
- `2026-08-08-long-dispatches-truncate-before-emitting-their-report.md` — the upstream
  cause named in direction 3.
- `2026-08-08-a-dispatch-reported-creating-a-record-it-never-created.md` — why a claim
  must not be turned into a gate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Same bundled decision as
  `2026-08-07-mp22-orchestrator-self-implementation-has-no-enforcement.md`
  for the authorship-control question (direction 2/3 here): decline a
  technical enforcement gate, attack the cause instead. Direction 1 (a
  decidable commit-message-type check, independent of the authorship
  question) is NOT covered by this decision — not asked, not answered,
  stays open.
- **Rationale:** PO, 2026-08-11: "D" on the grouped enforcement-mechanism
  cluster. This item's own direction 3 ("ask instead what makes the
  orchestrator commit production diffs at all... a dispatch that ends with
  an uncommitted diff should be a visible, typed outcome") is exactly the
  accepted direction, independently arrived at by this item before the PO's
  decision. Direction 4 (must not block the OM §3.3 stage-0 fast path)
  stands as a constraint on whatever the eventual re-dispatch-path design
  produces.
- **Assignment (if accepted):** Unassigned, same design pass as the mp22
  item. Direction 1 (commit-type check, `guardrails/git.md` GIT-01) is a
  separate, small, decidable fix that could proceed independently but has
  not been asked about or approved — flag for a future explicit decision,
  do not bundle into the enforcement-mechanism design.
- **Date:** 2026-08-11

### Update, 2026-08-18 — release-bar triage: direction 1 decided

- **Decision:** deferred — remaining scope owned by Sprint Alfred.

- **Decision:** decided, queued for dispatch. Direction 1 (a decidable
  commit-message-type check for a delivery/review range, independent of
  the authorship-control question above) was flagged in the 2026-08-11
  triage as "not covered by this decision... stays open" and never
  actually decided. Confirmed against current source before deciding:
  `plugins/pipeline-core/lib/commit-message-policy.mjs` implements GIT-03
  (correlation-trailer privacy + `AI-Assisted:` marker) as a per-commit
  PreToolUse check; it does not check the GIT-01 type vocabulary
  (`guardrails/git.md:16`) at all, and nothing in the repository checks
  commit subjects across a range (`guard-git.mjs` is a PreToolUse hook on
  one command, not a range walker). The gap this item's Description
  reported (`6decf59`'s `design` type going uncaught) is therefore still
  real, unchanged since 2026-08-08.
- **Rationale:** the check is genuinely decidable (a subject line either
  starts with an admitted GIT-01 type or it does not) and small, but
  wiring it into a guard/hook or a range-checking script is guardrail-tier
  work (touches `plugins/pipeline-core/hooks/guard-git.mjs` and/or
  `harness/scripts/verify.mjs`) and needs a regression suite to be trusted
  — not a change this read-only triage pass can make itself.
- **Assignment (if accepted):** a small `goldfish-implementor`/`goldfish-
  mechanic` dispatch: extend `commit-message-policy.mjs` (or a thin
  sibling module) with a pure `commitTypeFindings(subject)` check against
  the GIT-01 vocabulary, wired wherever commit messages already pass
  today, plus a range-mode entry point Critic/Verify can call against an
  enumerated commit set. Sprint Alfred — same "mechanical governance"
  scope as the authorship-control question this item's own primary
  decision already assigned there.
- **Date:** 2026-08-18

### Implementation, 2026-08-18 (wave 1, dispatch NVA-W1-9)

Direction 1 (the decidable GIT-01 type-vocabulary check) implemented as a pure
function, per the 2026-08-18 triage's assignment. The authorship-control
question (direction 2/3) is untouched by this dispatch — out of its scope.

- **`plugins/pipeline-core/lib/commit-message-policy.mjs`** — added
  `GIT01_COMMIT_TYPES` (line 211, the `guardrails/git.md:16` vocabulary
  verbatim), `commitTypeFindings(subject)` (line 228, pure: does the trimmed
  subject start with an admitted type, optional `(scope)`, optional
  breaking-change `!`, then `: `?) and `commitTypeFindingsForRange(commits)`
  (line 254, the range-mode entry point — takes an already-enumerated
  `{sha, subject}[]`, maps `commitTypeFindings` over it, stays pure by
  leaving range enumeration, i.e. walking `git log`, to whatever wires it in).
  Findings use the same `{code, detail}` shape as the existing GIT-03 checks
  in this module (`GIT-01-UNKNOWN-TYPE`, `GIT-01-EMPTY-SUBJECT`).
- **`plugins/pipeline-core/lib/commit-message-policy.test.mjs`** — added 11
  regression checks, CMT1–CMT11 (lines 135–201): CMT1 reproduces the exact
  `6decf59`/`design` regression this item exists for; CMT2 covers every
  admitted GIT-01 type bare and scoped; CMT3–CMT9 cover the breaking-change
  `!`, the unknown-type detail message, no-partial-credit on a type-looking
  prefix without a colon, a glued-on subject with no space after the colon,
  empty/whitespace/`undefined` subjects, case-sensitivity, and
  leading/trailing whitespace; CMT10–CMT11 cover the range entry point
  (order preserved, only offending commits flagged, and non-array/empty
  input handled without throwing). Full run: `node --test
  plugins/pipeline-core/lib/commit-message-policy.test.mjs` — 27/27 checks
  passed (16 pre-existing GIT-03 checks unchanged + 11 new), `node --test`
  summary `pass 1 / fail 0`.
- **Already exercised by `verify.mjs` with zero edits to it**: the new tests
  were appended to the already-registered `commit-message-policy-tests`
  suite entry (`harness/scripts/verify.mjs:342`, pre-existing, untouched)
  rather than a new sibling test file, so `node harness/scripts/verify.mjs`
  runs them today without any suite-enumeration change.

**Wiring into a live enforcement path — attempted, blocked, not done.** Two
attempts, both reported honestly rather than routed around:

- **`guard-git.mjs` (the PreToolUse commit-time check).** A minimal import-line
  edit went through with no technical guard refusal, so the block here is a
  discovered scope/correctness conflict rather than a fired guard: the only
  message text already available at that point comes from
  `commitMessageFindings`'s internal extraction (the `-m`/`-F`/heredoc
  parsing), which is not exposed to the caller. Merging the type check into
  `commitMessageFindings` itself would add `GIT-01-*` findings to messages
  used by five of the existing, locked GIT-03 regression cases (CMP5, CMP8,
  CMP12, CMP12b, CMP12c — their fixtures use subjects that do not start with
  an admitted type), breaking those assertions — modifying them to dodge a
  new, unrelated check is exactly the "weaken the tests that gate the
  implementation" move this dispatch is barred from making. The alternative,
  a second, independent message-parsing block inside `guard-git.mjs`, would
  duplicate untested argv/heredoc parsing outside the reviewed extraction
  path and needs its own `guard-git.test.mjs` regression coverage — real
  guardrail-tier work, not something to improvise inside this dispatch's DoD.
  The probing import edit was reverted; `guard-git.mjs` is unchanged in this
  commit.
- **`verify.mjs` (a range-check step Verify itself would run).** A concrete
  edit attempt — adding a new suite entry — was refused by
  `guard-testpath.mjs` with **rule ID `TP-3`** ("verify.mjs is the single
  verify-gate script … no ad-hoc edits outside a briefed test-change task"),
  offering only the external-signature human-override ceremony. Not
  attempted, per this dispatch's explicit instruction not to override a
  guard refusal. `git status` after the block confirmed `verify.mjs` was not
  modified.

**Net status:** the pure `commitTypeFindings`/`commitTypeFindingsForRange`
functions and their regression suite are done and already run by `verify.mjs`
unedited. Making the check actually bite — at commit time via `guard-git.mjs`
or as an active range-walk step in `verify.mjs` — remains open, exactly as
the 2026-08-18 triage rationale anticipated ("wiring it into a guard/hook or
a range-checking script is guardrail-tier work … and needs a regression
suite to be trusted"). A follow-up item/dispatch is needed for that
enforcement wiring, scoped to include the `guard-git.test.mjs` coverage the
`guard-git.mjs` route would need.

### Direction 1 design, 2026-08-19

**Root cause of the earlier "breaks 5 locked fixtures" finding: those fixtures
assert on `commitMessageFindings()`'s `findings` array via a `codes()` helper
that reads only `.findings` — never a full-object `deepEqual` (confirmed:
zero hits for `deepEqual(run(` / `deepEqual(result,` in
`commit-message-policy.test.mjs`).** The earlier investigation's plan A
(merge GIT-01 into the SAME `findings` array `commitMessageFindings`
returns) genuinely would have broken CMP5/CMP8/CMP12/12b/12c, because
`codes()` returns every code in that array and those five fixtures' commit
subjects (`"x"`, etc.) don't start with an admitted GIT-01 type. But that
is not the only way to reuse the extraction logic — decision below avoids
it entirely.

**Decision: (a) revised — add an additive `message` field to
`commitMessageFindings`'s return value; keep GIT-01 as a fully separate,
independent check/block in `guard-git.mjs`, never merged into the GIT-03
`findings` array.** This reuses the already-tested argv/heredoc/`-F`
extraction (avoiding option (b)'s "duplicate untested parsing" cost) while
leaving every existing fixture's assertions untouched, because none of them
inspect a `message` field that doesn't exist yet.

**Part A — commit-time enforcement in `guard-git.mjs` (NOT TP-3-protected;
dispatchable directly, no ceremony needed):**

1. `plugins/pipeline-core/lib/commit-message-policy.mjs`,
   `commitMessageFindings()` (line 155): add one line to the return
   statement (line 207) — `message: parts.length > 0 ? parts.join("\n") : null`.
   Purely additive; `inspected`, `sources`, `findings` are byte-identical to
   today for every existing caller and every existing fixture.
2. `plugins/pipeline-core/hooks/guard-git.mjs`: import `commitTypeFindings`
   alongside the existing `commitMessageFindings`/`markerPolicyMode` import
   (line 262). Immediately after the existing GIT-03 block closes (after
   line 1031, `}`), add a new, independent block:
   ```js
   if (inspection.message !== null) {
     const subjectLine = inspection.message.split("\n")[0];
     const typeCheck = commitTypeFindings(subjectLine);
     if (typeCheck.findings.length > 0) {
       emit(2, [
         `BLOCKED (git-guard GIT-01, plugin pipeline-core): ${typeCheck.findings.map((f) => f.detail).join(" and ")}.`,
         `Codes: ${typeCheck.findings.map((f) => f.code).join(", ")}.`,
         "guardrails/git.md GIT-01: the subject line must start with an admitted Conventional Commit type.",
         "Rewrite the message with an admitted type prefix (feat/fix/docs/refactor/test/chore/build/ci/perf/style).",
       ]);
     }
   }
   ```
   `emit()` calls `process.exit()` (confirmed, line 933-936), so this block
   only runs at all when the GIT-03 block above did not already exit — no
   double-emit risk, no reordering needed elsewhere in the file.
   `inspection.message === null` correctly skips the check for an editor
   commit (CMP7's "not looked at, never clean" case) and needs no new
   special-casing.
3. New regression coverage in `guard-git.test.mjs` (additive cases, do not
   touch the existing GIT03-* cases): a `feat: x`-shaped commit passes; the
   exact `6decf59`/`design: ...` regression shape is blocked with GIT-01;
   a commit that is BOTH GIT-03- and GIT-01-violating still blocks on GIT-03
   first (unchanged behavior — GIT-01 never runs because GIT-03 already
   exited); the global-options/env-wrapper/`-F`-file cases (mirroring
   CMP12/12b/12c) still reach the type check through the same extraction
   path; an editor commit (`git commit`, no message) is not blocked by
   GIT-01.

**Part B — range-mode check for `verify.mjs` (IS TP-3-protected; needs its
own signed HGO ceremony, separate from and after Part A):**

Mirror the `backlog-state-check` / checker-vs-tests split pattern
correctly this time — register the CHECKER script as the verify suite
entry, not only its test file (this is the exact class of gap the final
Nova-A T1 Critic review just flagged as its F1 finding against a sibling
item; do not repeat it here).

1. New script `plugins/pipeline-core/scripts/check-commit-type-range.mjs`:
   exports a pure-ish `auditCommitTypeRange({ root, base, head, gitOperations })`
   (injectable git adapter for its own tests, same pattern as
   `check-product-capability-inventory.mjs`'s `_testGitOperations`) that
   walks `git log --format=%H%x00%s base..head`, builds the `{sha,
   subject}[]` array `commitTypeFindingsForRange` already expects, and
   returns `{ok, findings}`. Direct invocation (`process.argv[1] ===`
   this file) exits 2 on any finding, matching
   `check-state-numeric-claims.mjs`'s live-mode entry point shape.
2. **Default range source (open sub-question, small — confirm during
   implementation, does not block starting):** parse the short SHA embedded
   in `plugins/pipeline-core/.claude-plugin/plugin.json`'s `version` field
   (e.g. `f047f63` from `0.6.0+claude.20260819081848.f047f63`, the same
   anchor this session has used by hand for every Critic-dispatch diff
   range this sprint) as the default `base`, resolved to a full SHA via
   `git rev-parse`; `head` defaults to `HEAD`. If the field is absent or
   unparsable, the checker must report `{ok: true, findings: [], skipped:
   "no resolvable base"}` rather than crash or block — a missing anchor is
   "not looked at", not "clean", consistent with CMP7's own honesty rule.
3. New `check-commit-type-range.test.mjs`, fixture-driven against the
   injected `gitOperations`, no real `git log` walk in tests.
4. Register `check-commit-type-range.mjs` itself (not just its test file)
   as a `harness/scripts/verify.mjs` suite entry — this is the step that
   needs the fresh signed TP-3 HGO ceremony.

**Sequencing:** Part A can be dispatched to a `goldfish-implementor` today,
no PO/ceremony gate. Part B needs its own follow-up dispatch (build script
+ tests) followed by a separate TP-3 ceremony to register it — do not
bundle the two; Part A alone already closes this item's most valuable
piece (the type check actually *blocking* a bad commit, not just being
theoretically available).

### Note, 2026-08-19 — NOT resolved by the 2026-08-19 TP-3 consolidation ceremony

Stays **open**. The 2026-08-19 signed TP-3 ceremony (commit `92bb2a08`)
registered 107 *existing, already-written* test files into `verify.mjs`'s
`TEST_SUITES` array; it did not write new enforcement logic. This item's
remaining gap is different in kind — an active range-walk step (or a
`guard-git.mjs` wiring) that does not exist as code yet — so it was
correctly out of scope for that ceremony and is unaffected by it. Do not
infer closure from the ceremony's suite count.

### Progress, 2026-08-19 (NVA-W5-GITGUARD-1) — untested checkpoint, NOT on trunk yet

A dispatch (goldfish-deep, worktree-isolated) wrote a full implementation of
both this item's Part A (GIT-01 wiring: `guard-git.mjs` now calls the
already-existing `commitTypeFindings()` against the commit subject and
blocks with code GIT-01 on an inadmissible type) AND the separate GG-22
backlog-ledger-debt guard (blocks a commit that would leave an earlier
backlog status-flip unreconciled, fail-open on any git/parse error) — but
exhausted its full 50-tool budget writing the implementation and never
reached tests, verify, or its own commit/report. The Elephant found the
diff uncommitted in the worktree, confirmed it was the only change, and
committed it as-is (`1a25b866`, worktree `wf_3e6df4de-8d6-1`, message
explicitly labelled "untested checkpoint") so the work is not lost — **this
commit is NOT on trunk and NOT verified; no test file exists yet for either
GIT-01 wiring or GG-22.** A follow-up dispatch must self-heal onto
`1a25b866` (not trunk), add tests for both blocks, run
`guard-git.test.mjs`/whatever suite covers this hook, and only then land it
on trunk.
