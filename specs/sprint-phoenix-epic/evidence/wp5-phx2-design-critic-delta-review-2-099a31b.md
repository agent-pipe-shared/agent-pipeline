# Critic delta re-review 2: PHX-2 rework 2 (base `8a54751`, head `099a31b`)

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max.
**Reviewed object:** delta `8a54751..099a31b` on `specs/sprint-phoenix-epic/design/phx-2-additive-ledger-authority.md`, prior finding IDs F-A/F-B/F-C/F-D.
**Verdict: FAIL — one new MAJOR (write-side ordering contradiction), 3 MINOR.**

## Findings

1. **MAJOR — the new write-side `catch` documents an ordering the document's
   own placement instruction forbids.** The delta asserts three times (in
   the snippet comment and in §4's new write-side entry) that
   `discoverRepository(dir)` throws are caught BEFORE the local
   `writeState(dir, next, base)` write, so "local state is untouched by this
   specific failure." But §2's own unchanged placement instruction says the
   new write-side block goes "immediately after the existing local write...
   and only if that local write succeeded" — i.e. AFTER, not before. Repo
   truth confirms: the only insertion point matching §2's prose is strictly
   after `pipeline-state.mjs:5213`'s local write. At the placement §2
   mandates, `criticalProofConsumption` already contains this `proofSha256`
   when the refusal fires — so a retry hits `CRITICAL-PROOF-REPLAY`
   (`:5196-5199`), and §4's sole recovery path is scoped explicitly to "the
   filesystem-condition sub-case", leaving this case with no recovery
   guidance on a false premise. The disposition itself (refuse, `return 2`)
   is correct — this is a state-consequence/recovery-story defect, not a
   bypass.

2. **MINOR — the new §4 read-side entry assigns a return code to a function
   that never produces it.** §3 defines §4's read-side list as
   `checkExternalPushLedgerConsumption`'s code taxonomy, but the new bullet
   notates a disposition for a path where that function is never called
   (§2's read-side snippet produces a plain `failures.push(free text)`
   instead). The bullet's own closing sentences do relocate the disposition
   correctly, so the ambiguity is disclosed in place — kept minor.

3. **MINOR — the new timeout paragraph asserts a `5000`ms convention for
   `pipeline-state.mjs` that doesn't exist there.** `pipeline-state.mjs` has
   ≥7 git spawns; 5 pass no timeout, and the 2 that do use `5_000`/`30_000`
   conditionally — "this file's own established `5000`ms" is false for the
   file the section governs (though accurate for `guard-push.mjs`, which the
   paragraph also cites).

4. **MINOR — the commit's provenance claim and its cited dispatch record
   disagree.** Commit `099a31b` cites the scratchpad `dispatch-record.json`
   as corroboration; that record's `dispatcher` field says `"elephant"`
   while the commit trailer says `Dispatch: WP5-phx2-design-rework-2
   (goldfish)`. Explicitly NOT an EL-01/EL-16 lifecycle violation — the diff
   is a design spec under `specs/`, which `roles/elephant.md` names as
   permitted direct Elephant output regardless of which lane authored it.
   Repo precedent for how to record this honestly exists
   (`specs/sprint-nova-epic/evidence/nova-b/runner-thread-17/dispatch-record.json`:
   `"outcome": "reverted-then-completed-by-orchestrator"` with an explicit
   note).

## Deliberately not flagged (genuinely resolved)

F-A read side — genuinely resolved, every premise independently re-verified
(no ambient try/catch confirmed, hooks.json exit semantics confirmed,
`discoverRepository` never returns falsy so no silent-skip path). F-A
write-side exit code (`return 2`) — the file's universal failure code (176
uses, zero `return 1`), no collision. F-B, F-C, F-D — genuinely and
thoroughly resolved, F-D's full 9-site call inventory independently
re-derived and matched exactly. F1-F5 remain intact; scope clean (exactly
one file changed). The local history split (`git reset --soft` recovery)
verified content-preserving and not a guardrail violation (never pushed).

## Trajectory check

Inconsistent — very high citation precision (~25 spot-checks, all exact,
including two multi-hop traces), but the one structural claim the F-A
write-side fix turns on (ordering relative to `writeState`) was asserted
three times without checking the placement the same document specifies two
paragraphs earlier — the same failure signature as round 1's F-A defect.

## Briefing violations observed (Elephant-side, disclosed)

Contaminated dispatch (recorded, not acted on — Critic independently
re-verified everything): the prior-review evidence file supplied as
"neutral" also carried its own prior verdict/disposition prose; the dispatch
prompt included a named hunt-hypothesis list; an authorship-evidence note
included how-to-judge framing. None of the four findings above depended on
this contamination — all were independently derived and verified. Lesson
for future delta-review dispatches: reference the prior finding registry as
a literal list of IDs/gaps only, strip verdict/disposition/trajectory
sections before pointing the Critic at it, and drop named hunt hypotheses
from Phase A in favor of the standard numbered hunt categories only.

## Disposition

Remedy is narrow: pick ONE placement for the write-side
`discoverRepository(dir)` call and make §2's prose/snippet comment and §4's
write-side entry agree — since §2's own unchanged instruction places the new
block after the local write succeeds, correct all three assertions to say
AFTER, and extend the recovery paragraph to cover this case (fold it into
the same "fresh signing ceremony" framing as the filesystem-condition
sub-case, rather than the false "state untouched" framing). Plus: re-notate
§4's read-side entry to match the actual `failures.push` shape; correct the
`pipeline-state.mjs` timeout-convention claim; reconcile the dispatch record.
Next: a third, narrowly-scoped rework, then a third bounded delta re-review
— Critic round 4 of 4 allowed for this package (the last one under
`critic-review.md`'s Phase-2.6 cap). If round 4 also fails, this needs a PO
course gate rather than a fifth autonomous iteration.
