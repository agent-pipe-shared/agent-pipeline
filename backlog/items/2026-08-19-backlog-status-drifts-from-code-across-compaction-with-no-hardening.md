---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-status-drifts-from-code-across-compaction-with-no-hardening
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "PO, live, 2026-08-19: 'irgendwas stimmt da einfach nicht mit dieser SDLC pipeline und der umsetzung. sobald ein compact dazwischen kommt, wird der status in den items nicht sauber aktualisiert. Es wird etwas umgesetzt und dann aber nicht im backlog kommentiert. Das braucht unbedingt eine haertung weil diese backlog cleaning jobs finden hier pro session 5x statt und kosten viel budget.' Triggered directly by two incidents in the same session: (1) 7 Wave-4 items were closed (commits 0f8bdafc, 8d3fd44f) without closed_at/closure_commit/etc. frontmatter or a ledger reconciliation pass, only caught because a verify run happened to fail; (2) a stale '15/17 Wave-4 closed' claim was carried forward across a mid-session compaction and written into docs/state.md as fact without being re-checked against the actual item files (true figure: 7/17)."
---

# Backlog status drifts from code across compaction, with no structural hardening

## Description

Two distinct, compounding failure modes let a backlog item's recorded state
(`status:`, closure metadata, ledger entries) drift away from both the
actual code and from prose claims made about it, with nothing structural
catching the drift until an unrelated check (verify) happens to trip over
it — or a human notices.

**Mode 1 — mechanical ledger drift.** Closing an item (flipping `status:` to
`closed`) and running `reconcile-backlog-ledger.mjs --activate` to record
the closure metadata + ledger entry are two separate, manually-sequenced
steps. Nothing enforces doing the second after the first. `verify.mjs`
DOES catch the resulting drift (`backlog-state-check`,
`backlog-ledger-reconciliation-tests`) — but only when verify happens to
run, and only after the drift already exists. On 2026-08-19, 7 items were
closed this way and the gap sat undetected until a full verify run.

**Mode 2 — semantic drift across compaction.** A session's own prose
summary of backlog progress (e.g. "15/17 Wave-4 items closed") can survive
a context compaction as a trusted fact and get written into `docs/state.md`
without anyone re-deriving it from the actual item files. `docs/state.md`
itself instructs re-verifying inherited "still open" claims (a rule already
added after prior incidents — see the CLAUDE.md hard-rules list, "Re-verify
an inherited 'still open'/'still needed' claim before dispatching work on
it"), but this is a text instruction, not a technical guard, and it was
missed again this session (the true Wave-4 figure was 7/17, not 15/17).

The PO's stated cost: this class of problem forces a full ad hoc
backlog-cleaning/re-verification pass roughly 5 times per session, each one
expensive (a 14-agent, 98-item Workflow verification pass was run this same
session purely to re-establish ground truth).

## Proposal (two independently shippable pieces, not necessarily one design)

1. **Automate Mode 1 away entirely.** A git hook (or a `check-doc-contracts`
   -style guard extension) that runs on any commit touching
   `backlog/items/*.md`: if the diff includes a `status:` flip to `closed`
   (or any status change), require the SAME commit to also update
   `backlog/transitions.ndjson`/`backlog/STATUS.md`/`backlog/index.json`
   consistently (i.e. `reconcile-backlog-ledger.mjs` was actually run before
   the commit) — fail closed otherwise. Removes the "forgot the second
   step" failure mode structurally rather than relying on verify to catch
   it after the fact.

2. **Add a numeric-claim linter for `docs/state.md`.** A small script that
   scans `docs/state.md` for "`N/M` closed"-shaped claims near backlog
   references and cross-checks `N` against a live count derived from
   `backlog/index.json`/the actual item files, flagging any mismatch. Could
   run as its own verify suite, or as a pre-compact/pre-candidate-stamp
   check. This targets Mode 2 specifically — the exact shape of claim that
   drifted twice in the same session (this incident, and CLAUDE.md's own
   documented "three separate stale-claim incidents in one 2026-08-18
   session block" footnote).

Needs a design pass before implementation (exact hook mechanics for #1;
false-positive rate and claim-pattern matching for #2) — not a same-session
ad hoc patch, given both touch commit-time or gate-relevant tooling.

## Triage

- **Decision:** PO chose both pieces (2026-08-19). Dispatched to `goldfish-deep`
  (`NVA-W5-BLDRIFT-1`, worktree-isolated).
- **Date:** 2026-08-19

### Piece 2 landed, piece 1 not attempted (dispatch budget)

`NVA-W5-BLDRIFT-1` delivered piece 2 in full: `plugins/pipeline-core/scripts/check-state-numeric-claims.mjs`
scans `docs/state.md` for current-state "N/M closed"-shaped backlog claims
and cross-checks them against `backlog/index.json`'s live counts, correctly
distinguishing a live claim from a historical/archived one (6/6 fixture
tests). Commit `a2fb5ea3` (cherry-picked to trunk), registered as its own
verify suite (`state-numeric-claims-tests`) via a signed TP-3 HGO ceremony,
commit `b3b07fc5`. The dispatch's own live sanity run against the real repo
immediately caught a genuine stale claim in `docs/state.md`, confirming the
tool works as intended.

Piece 1 (a commit-time guard extending the already-wired `guard-git.mjs`
to require a ledger-consistent commit whenever `backlog/items/*.md`'s
`status:` changes) was explicitly optional in the dispatch briefing — not
attempted; the dispatch's tool budget was spent on piece 2's investigation
and the (correctly reported) TP-3 block on registering it. **Item stays
`open` for piece 1** — needs its own follow-up `goldfish-deep` dispatch,
scoped to extend `guard-git.mjs` (never `hooks.json`, which is TP-4-protected
and has no in-session route).

### Correction, 2026-08-19: piece 2's "registered as its own verify suite" claim was wrong in substance

The final Slice-A7 T1 Critic gate review (dispatch against candidate
`84734af0`, base `83f564df`) found, as its top finding (F1, major): the
`state-numeric-claims-tests` suite registered in `harness/scripts/verify.mjs`
(commit `b3b07fc5`) points at `check-state-numeric-claims.test.mjs` — the
linter's own fixture-test file, which only ever exercises a synthetic temp
root — never at the actual checker (`check-state-numeric-claims.mjs`)
against the real repository root. The pattern this should have mirrored is
already present one line above in `verify.mjs`: `backlog-state-check`
registers the *checker* (`check-backlog-state.mjs`), with its unit tests
registered separately. So the live gate this piece exists to provide never
actually runs against `docs/state.md`; only its unit tests run. A stale
"N/M closed" claim would still pass a full Verify today.

No information was lost — `check-state-numeric-claims.mjs`'s live-mode
entry point (`process.exit(2)` on findings) is implemented and works when
invoked directly; it is simply not wired into `verify.mjs`'s registered
suite list. **Item stays `open`; this correction adds a second, now
higher-priority piece 2b:** register `check-state-numeric-claims.mjs`
itself (not just its tests) as a verify suite, mirroring the
`backlog-state-check` pattern. `verify.mjs` is TP-3-protected, so this
needs its own fresh signed HGO ceremony (a PO `sign-intent` action outside
the session) before it can land — not attempted this session block; the PO
was asked how to sequence this against the pending local candidate stamp
and did not respond in-session, so the Elephant proceeded with the lowest-
risk default (stamp a local test candidate now, documenting this gap
rather than silently treating piece 2 as complete) per the session's
standing auto-mode guidance rather than blocking indefinitely.

### Piece 1 design, 2026-08-19

**Mechanism:** a new stateless union rule in
`plugins/pipeline-core/hooks/guard-git.mjs`, id **`GG-22`** (next available;
`GG-01`..`GG-21` are all taken), triggered on `git commit` invocations. This
rule inspects repository STATE (staged diff + recent history) rather than
matching the command string, so it shells out to `git` via `spawnSync`
exactly like the existing GG-03 push-verification code (`guard-git.mjs`
line ~742, `spawnSync("git", [...], {cwd: root, encoding: "utf8", shell:
false, timeout: 5000})`) — do not try to express this as a regex against
the raw command text.

**Debt detection (cheap, bounded, stateless — recomputed fresh every
invocation, never scans all ~295 item files):**

1. `lastReconcile = git log -1 --format=%H -- backlog/transitions.ndjson`
   — the most recent commit that touched the ledger file (empty string if
   the file has never been touched; see bootstrap case below).
2. `itemsTouchedSinceReconcile = git diff --name-only <lastReconcile>..HEAD
   -- backlog/items/` — bounded to commits since the last reconciliation,
   not the whole item corpus.
3. For each such path, `git diff <lastReconcile>..HEAD -- <path>` and check
   whether the hunk contains a changed `status:` frontmatter line (a
   `-status: ...` line paired with a differently-valued `+status: ...`
   line). Reuse or mirror the frontmatter `status:` parsing
   `check-backlog-state.mjs`/`reconcile-backlog-ledger.mjs` already use —
   do not write a second, independently-drifting parser.
4. `debtPaths` = the subset of `itemsTouchedSinceReconcile` whose status
   actually changed (a Triage-only edit does NOT count as debt).
5. `debt = debtPaths.length > 0`.

**Allow-rule for the currently proposed commit, when `debt` is true:**

- `stagedPaths = git diff --cached --name-only`.
- Allowed set = every `backlog/items/*.md` path (any item, not just the
  ones in `debtPaths` — batched multi-item closures across several commits
  before one shared reconciliation commit are an established, legitimate
  pattern already used repeatedly this session, e.g. commits
  `77aef463`→`f1635598`→`dab33d9f`) UNION `{backlog/transitions.ndjson,
  backlog/STATUS.md, backlog/index.json}`.
- **Block (`GG-22`)** unless every path in `stagedPaths` is inside that
  allowed set. This admits the existing 3-commit closure pattern (status
  flip → closure metadata → ledger reconciliation) and batched closures
  unchanged, while blocking exactly the observed failure: the session
  moves on to an unrelated file (guard code, docs, anything outside
  `backlog/`) while a status change from an earlier commit sits
  unreconciled.
- When `debt` is false (HEAD is already ledger-consistent, or no item has
  been touched since the last reconciliation), no restriction — ordinary
  commits proceed exactly as today.

**Block message shape:**
```
BLOCKED (git-guard GG-22, plugin pipeline-core): an earlier commit changed
backlog/items/<path>'s status without a matching ledger reconciliation
since <lastReconcile-sha-or-"repository start">.
Run: node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs --activate
Then commit the resulting backlog/STATUS.md / backlog/index.json /
backlog/transitions.ndjson changes before any other commit.
```
Mirror the file's existing `emit(code, lines)`/`blockNormal(rule)` helpers.
**This is a plain deny, not an override-eligible rule** — unlike
GG-01..GG-10/GG-21, there is no legitimate reason an agent would need to
bypass it with `OVERRIDE GG-22`, since the fix is always cheap and
mechanical (one command, then a commit). Do not wire it into the
override-arming machinery.

**Explicitly out of scope for v1 (deliberate narrowing, not an oversight):**
- New item CREATION (a file appearing in `backlog/items/` that didn't
  exist at `lastReconcile`) is not treated as debt — only STATUS CHANGES
  to existing items, matching this item's own Mode-1 description (closures
  going unreconciled), not creation-count drift.
- The rule only looks at `HEAD`'s own history on the current branch — a
  worktree-isolated dispatch on a different branch has its own independent
  debt trail; this matches how every other GG rule in this file already
  scopes to the current checkout.
- The bootstrap case (`backlog/transitions.ndjson` never touched in this
  repository's history, so `lastReconcile` is empty) must be handled by an
  explicit, TESTED decision — either treat the whole history as the
  lookback window, or no-op the rule entirely until the ledger file exists
  once — not left as an unhandled `git diff ''..HEAD` edge case.

**Test cases** (`plugins/pipeline-core/hooks/guard-git.test.mjs`, new
fixtures alongside the existing `GG-01`..`GG-21` coverage):
1. HEAD ledger-consistent (no debt) → an unrelated commit (only
   `docs/state.md` staged) is admitted, unchanged from today.
2. HEAD has an un-reconciled status flip (debt) → a commit staging only an
   unrelated file (no `backlog/` paths at all) is BLOCKED with `GG-22`.
3. Same debt state → a commit staging only `backlog/items/<same-item>.md`
   (closure-metadata-style edit, no further status change) is ADMITTED
   (commit #2 of the 3-commit pattern).
4. Same debt state → a commit staging `backlog/transitions.ndjson` +
   `backlog/STATUS.md` + `backlog/index.json` together is ADMITTED and
   clears the debt (commit #3).
5. Same debt state → a commit staging a SECOND, DIFFERENT item's status
   flip is ADMITTED (batched multi-item closure pattern).
6. Same debt state → a commit staging `backlog/items/<same-item>.md` AND
   an unrelated file (e.g. `plugins/pipeline-core/hooks/guard-git.mjs`)
   together is BLOCKED (the unrelated file is outside the allowed set).
7. A Triage-only edit to an item (no `status:` line change) followed
   immediately by an unrelated commit is ADMITTED — Triage-only edits
   never create debt.
8. The empty-`lastReconcile` bootstrap case behaves sanely per whichever
   explicit decision is made above — this must be its own asserted test,
   not left implicit.

**Fail-open discipline:** like every other check in this file (line ~300,
`process.exit(0); // fail-open: guard is a safety net, not a prison`), any
`spawnSync` error, timeout, or unexpected git output while computing
`debt` must fail OPEN (allow the commit), not block — this is a hardening
rule, not a hard security boundary, and must never itself become a source
of an unrecoverable stuck repository.

Not itself designed here: whether `guardrails/git.md` needs a new
individual bullet for `GG-22` — the file documents the GG union mostly by
range/mechanism rather than one bullet per rule id, so this is an
implementer judgment call, not a requirement.

### Piece 2b landed, 2026-08-19

`check-state-numeric-claims.mjs` (the live checker itself, not just its
`.test.mjs` fixture) is now registered as its own `verify.mjs` suite entry
(`state-numeric-claims-check`), mirroring the `backlog-state-check`
pattern this correction asked for. Landed via a signed TP-3 HGO ceremony,
commit `1083229b`. Piece 2 (both 2 and 2b) is now fully closed. Piece 1
(`GG-22`, fully designed above) is dispatched separately this same
session (Wave 5). Item stays `open` until piece 1 lands.
