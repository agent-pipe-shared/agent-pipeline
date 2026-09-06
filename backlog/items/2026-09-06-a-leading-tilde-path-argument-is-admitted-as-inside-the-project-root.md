---
schema: pipeline.backlog-item.v1
id: pipeline.read-scope-tilde-expansion-mismatch
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
tracking: "Nova B — while triaging NVA-B-READCONTAIN-1's closure, the Elephant independently checked whether the restored read-scope containment accounts for shell tilde expansion. It does not: the guard's parser never expands a leading `~` in a path-taking argument, so it evaluates the LITERAL string `~/.ssh/id_rsa` as a (nonexistent) path under the project root, while the actual shell expands `~` to the real home directory before the command ever runs. Confirmed live via evaluateLifecycleReadyGuard() directly (never via an executed Bash cat of a real credential path)."
done_when: manual
source: "Elephant, 2026-09-06, triaging NVA-B-READCONTAIN-1's closure (not a Critic finding; NVA-B-READCONTAIN-1 itself is closed and unaffected by this item)."
---

# A leading-`~` path argument is admitted as inside the project root

## The gap

Neither `guard-lifecycle-ready.mjs`'s single-command/cat-pipeline/git-pipeline
containment (`isApprovedSingleCommandReadArg`, `isApprovedCatPipelineReadPath`,
both ultimately calling `rawReadCandidatePath()` + `isRealpathedWithinBoundary()`)
nor `guard-command-grammar.mjs`'s `approvedReadPath()` (backing the `rg`-to-`rg`/
`rg`-to-`head` bounded pipeline, `isBoundedReadOnlyPipeline`) ever expands a
leading `~` before building the containment candidate. Both build the
candidate by string concatenation/`path.resolve()` against `root`, so
`~/.ssh/id_rsa` becomes the literal, nonexistent path `<root>/~/.ssh/id_rsa`.

For the realpath-fixed lane, `isRealpathedWithinBoundary`'s ancestor-walk (walk
up via `dirname()` until an existing ancestor is found, then realpath and
check containment) finds no directory literally named `~` under `root`, walks
all the way up to `root` itself, and returns "inside" — every literal,
nonexistent path under `root` trivially resolves to `root` this way. This is
the correct, intended behavior for an ordinary nonexistent-file read (the
`cat` will just fail at runtime) but is actively wrong here, because the shell
does not treat `~/.ssh/id_rsa` as a literal nonexistent path under `root` at
all — it rewrites the argument to an absolute path (the real home directory)
**before** the command's argv is ever assembled, entirely outside anything
this guard's parser sees or can walk.

For the still-fully-lexical `rg`-pipe lane (`approvedReadPath`,
`guard-command-grammar.mjs`), the same mismatch applies even more directly:
`resolve(root, "~/.ssh")` also collapses to a literal, never-realpathed
`<root>/~/.ssh` string, and `pathInside()` admits it on lexical grounds alone
— no ancestor-walk even needed.

## Confirmed live (guard verdicts only, no executed read of a real credential)

Direct calls to `evaluateLifecycleReadyGuard()` (not a real Bash execution)
against this repository's actual `guard-lifecycle-ready.mjs`, 2026-09-06:

- `cat ~/.ssh/id_rsa` → **admitted** (`exitCode: 0`), single-command lane.
- `rg x ~/.ssh | head -n 5` → **admitted** (`exitCode: 0`), `rg`-pipe lane.
- `cat ~root/x` (the `~user` form) → **admitted** (`exitCode: 0`).
- `cat $HOME/.ssh/id_rsa` → **refused** (`GUARD-PARSE-UNSUPPORTED`) — the
  closed-grammar parser already rejects `$`-based expansion outright, so
  environment-variable expansion is NOT part of this gap; scope is the
  leading-`~` forms only (`~/...` and `~user/...`).

## Why this is not a NVA-B-READCONTAIN-1 regression

The original, pre-`c8c7f449` lexical-only design (`resolve()` + `pathInside()`,
no realpath at all) admits `~/.ssh/id_rsa` on the identical lexical grounds —
this predates NVA-B-READCONTAIN-1 entirely and was never covered by any test
before or after the restoration. NVA-B-READCONTAIN-1's closure stands; this is
a separate, newly-discovered gap the restoration inherited verbatim, not
something it introduced or made worse. Do not reopen NVA-B-READCONTAIN-1's
findings registry or dispatch record for this.

## Fix shape (design question for the dispatch, not settled here)

`isRealpathedWithinBoundary()` is correct for the string it is given — the
fix is not there. The fix is a fail-closed rejection of any path token whose
value (after `commandPath()`'s flag check) starts with `~`, applied before it
ever reaches a containment check, in BOTH lanes:

- the realpath-fixed lane (`rawReadCandidatePath()` and/or its callers,
  `guard-lifecycle-ready.mjs`), and
- the fully-lexical lane (`approvedReadPath()`, `guard-command-grammar.mjs`).

`guard-lifecycle-ready.mjs` imports FROM `guard-command-grammar.mjs`, never
the reverse — a shared rejection helper needs a shared home (most naturally
in `guard-command-grammar.mjs`, exported and imported by the other file), or
the same one-line check duplicated deliberately in both places with a comment
explaining why it is not factored — the dispatch should decide which, stating
the import-direction constraint explicitly in its briefing.

## Acceptance criteria

- A path-taking argument starting with `~` is refused (not silently
  admitted, not silently treated as "outside root" either — refused with an
  accurate, existing denial code) in: the single-command lane, the cat-pipeline
  lane, the git-pipeline lane (all three via whatever shared point the fix
  chooses), and the `rg`-to-`rg`/`rg`-to-`head` bounded pipeline lane.
- Regression tests cover at least `~/...` and `~user/...` for each of the
  four lanes above, without ever constructing a real credential-path fixture
  — a synthetic marker path under a temp/fixture home is sufficient.
- Full existing regression suite for both touched files stays green.
- This item and its evidence are cross-referenced from the ADR that
  NVA-B-READCONTAIN-1/-2 owe (`backlog/items/2026-09-01-read-containment-was-removed-a-day-after-it-was-added-with-no-recorded-decision.md`,
  EL-04) as a known-closed (or known-open, if deferred past that ADR) gap.

## Resolution

Fixed by NVA-B-TILDEFIX-1 (dispatch, `claude-sonnet-5`, xhigh), commit
`afc6af70a5e3c474e23409e2388ce2e354e3416c`. `rawReadCandidatePath()`
(`guard-lifecycle-ready.mjs`) now returns a deterministic, syntactically
absolute sentinel (`sep` + the literal value) for a leading `~`, covering the
single-command, cat-pipeline, and git-pipeline lanes in one place (the latter
two reuse it); `approvedReadPath()` (`guard-command-grammar.mjs`) carries an
independent one-line twin, covering the `rg`-to-`rg`/`rg`-to-`head` bounded
pipeline lane. Reproduce-first RED
(`backlog/evidence/2026-09-06-nva-b-tildefix-1-red.txt`, 4 new tests failing
against pre-fix code) then GREEN after the fix
(`backlog/evidence/2026-09-06-nva-b-tildefix-1-green.txt`, 234/234, 229 prior
+ 5 new, 0 regressions) — both `~/...` and `~user/...` forms, all four lanes,
synthetic marker paths only, no real credential path ever constructed or
read. The first three acceptance criteria above are satisfied.

The fourth acceptance criterion — cross-referencing this item from the ADR
`backlog/items/2026-09-01-read-containment-was-removed-a-day-after-it-was-added-with-no-recorded-decision.md`
(EL-04) owes — is **not done by this dispatch**: that file was an explicit
no-go path in NVA-B-TILDEFIX-1's briefing (tracked separately, out of that
dispatch's scope), so this item stays `open` rather than closed.

**T1 Critic review (opus, max): PASS**, 4 minor findings, no correction round
needed. F1 (two lane tests pin `exitCode` only, not the specific denial
code) and F3 (`commandPath()`, a sibling helper, still carries the untreated
`resolve(root, value)` construction at named call sites, unproven
exploitability) are tracked as their own item:
`2026-09-06-commandpath-and-two-lane-tests-still-carry-the-untreated-tilde-construction.md`.
F2 (the `rg`-pipe lane denies via `GUARD-OPERATOR-UNAPPROVED`, a less
accurate code) is class-level covered by the existing
`2026-09-06-suppressed-and-chained-outside-root-reads-land-on-the-wrong-denial-code.md`.
**Owner and date for this AC-4 follow-up (closing the QG-06 gap the Critic
named):** the Elephant of the session that authors the read-containment ADR
(owed by `backlog/items/2026-09-01-read-containment-was-removed-a-day-after-it-was-added-with-no-recorded-decision.md`,
EL-04), due immediately after `NVA-B-READCONTAIN-2` lands — that ADR must
cross-reference this item and its evidence, plus name the
`GUARD-PARSE-UNSUPPORTED`-vs-live-enforcement caveat filed separately as
`2026-09-06-the-installed-plugin-copy-enforcing-this-session-predates-todays-guard-fixes.md`
(the Critic's live reachability probe found this fix, though correct in
source, was NOT yet enforced by this session's own installed plugin copy).

