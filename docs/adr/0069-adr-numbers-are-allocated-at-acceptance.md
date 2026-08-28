# ADR-0069: ADR numbers are allocated at acceptance into the trunk, never at drafting time — and carry no sprint prefix

> Agent-Pipeline · Sprint Nova · as of 2026-08-27

**Status:** accepted (2026-08-27, PO instruction during the `sprint_phoenix` merge close-out, after
the merge produced six duplicate ADR numbers: *"brauchen vllt künftig adr nummern einen sprint
prefix? auch das müsste dann eine generelle regel werden"* — do ADR numbers need a sprint prefix
in future, and this should become a general rule).

**Sibling of** [ADR-0068](0068-backlog-ledger-merge-semantics.md) — same root cause, a different
shared namespace: two parallel lines allocating from one sequential counter with no merge story.

**Governs:** docs/adr/**, harness/scripts/check-adr-consistency.mjs, harness/scripts/verify.mjs

## Context

`sprint_phoenix` and the Nova line each drafted ADRs against the same `docs/adr/` counter. Both
allocated 0061 through 0066. The merge produced six duplicate numbers, and Git reported no conflict
for any of them: the filenames differ (`0063-fork-disposition-approval-proof.md` vs.
`0063-repository-directory-contract.md`), so from Git's point of view these are twelve unrelated
files, not six collisions.

The damage is not the duplicate filename. It is that a bare reference — `ADR-0063`, the form used
throughout the canon, in `CLAUDE.md`, in role contracts, in commit messages, in vendored plugin
copies — became **ambiguous**, silently, in documents nobody edited. A reference that used to name
one decision now names two.

## Decision

### D1 — No sprint prefix

Sprint-prefixed numbers (`ADR-NOVA-12`, `ADR-PHX-07`) were considered and are rejected.

- ADRs outlive sprints by design. A decision still governing in two years would carry the name of a
  sprint that no longer means anything to the person reading it.
- Every existing reference uses the flat form. A prefix creates a permanent mixed system: old ADRs
  flat, new ones prefixed, and every reader has to know which era a number belongs to.
- It does not solve the problem, it relocates it. Two lines would then have to agree on prefixes
  instead of on numbers, and two lines that could not coordinate a counter will not coordinate a
  prefix registry either.

The flat, chronological `NNNN` form stays.

### D2 — A number is allocated at acceptance, not at drafting

A new ADR is written as `docs/adr/draft-<slug>.md` and carries no number while it is being drafted
or reviewed. It receives its number in the act of being accepted into the trunk — the same moment
its `Status:` becomes `accepted`. While it is a draft it is referenced by slug; those references
are rewritten to the assigned number as part of acceptance, in the same commit that renames the
file.

This makes collision structurally impossible rather than merely unlikely: only one line allocates,
and it allocates at the point where it can see every number already taken. A parallel sprint can
draft as many ADRs as it likes without ever touching the counter.

*This ADR was itself drafted under D2 — written unnumbered, numbered only on acceptance.*

### D3 — Duplicate numbers are a hard failure, and the check must actually run

`harness/scripts/check-adr-consistency.mjs` fails on any duplicate ADR number in `docs/adr/`, and
on any duplicate in a vendored copy of the tree.

**The check already existed and already worked — it simply was never wired into the gate.**
Verified 2026-08-27: run by hand it emits `DUPLICATE-NUMBER` and reports all six collisions
correctly, but `harness/scripts/verify.mjs` registers neither it nor its own
`check-adr-consistency.test.mjs`. Sibling checkers are registered in both forms —
`doc-contract-check` (`verify.mjs:414`) and `backlog-state-check` (`:441`) each run against the
real repository alongside their unit tests. So the merge did not defeat a check; it walked past one
that was switched off, and nothing reported that it was off.

Registering it in `verify.mjs` is therefore part of this decision, not a follow-up to it. A rule
whose enforcement is unreachable is documentation, and six ambiguous numbers are what
documentation-instead-of-enforcement costs.

### D4 — Resolving a collision that already exists: reference load decides, not date

Where two ADRs already share a number, **the side with more LIVING references keeps it**; the other
is renumbered to the next free number. Date is the tiebreaker only when the counts are equal.

An earlier draft of this rule used the accepted date, on the reasoning that the older document has
had longer to accumulate references. Checking that against the actual data showed it decides badly:
for 0063, the earlier-dated `fork-disposition-approval-proof` would keep the number while
`repository-directory-contract` — the one `CLAUDE.md`, `harness/session-bootstrap.md`, both
dispatch templates and `check-directory-contract.mjs` (30 mentions in that file alone) actually
refer to — would move. The date is an accident of drafting; the reference load is the real measure
of what a renumbering costs, and minimizing edits minimizes the chance of getting one wrong.

"Living" is doing real work in that sentence. See D5.

### D5 — Historical artifacts are not rewritten; the moved ADR carries a forwarding address

Renumbering is a rename **plus** the rewrite of every living reference — bare-number form and
filename form — across canon (`docs/`, `roles/`, `guardrails/`, `policies/`, `templates/`,
`CLAUDE.md`), code and tests, the ADR index, the governance registry, and any vendored copy of the
ADR tree, in ONE commit, so no intermediate state exists where a reference points at nothing.

It stops there. Measured on the 2026-08-27 correction: of the 97 files referencing number 0063,
about 60 are `specs/sprint-phoenix-epic/evidence/acceptance-evidence-map-*.md` — point-in-time
records of a completed acceptance — plus archived handover history under `docs/state-archive/` and
the append-only `backlog/transitions.ndjson`. Editing those would falsify what they attest, and for
the ledger it is not even possible.

So the renumbered ADR gains a line directly under its title:

> Previously numbered ADR-00NN (until YYYY-MM-DD).

That line is what keeps every frozen historical mention resolvable. Without it, not rewriting the
archives would leave dangling references; with it, the archives stay honest AND readable. It is a
required part of a renumbering, not a courtesy.

**A Markdown link TARGET is navigation, not attestation, and is repaired even in a frozen
artifact — the prose is not.** A frozen record attests what it says; a link path is how a reader
reaches the document it already names. Repointing `](../../docs/adr/0064-x.md)` at the renamed file
falsifies nothing, because it resolves to the same document; leaving it dead makes the frozen
record unusable and fails `check-doc-contracts.mjs`, which has no forwarding-aware exemption. The
number written in the prose stays exactly as it was, and the forwarding line explains it. So:
repair dead link paths anywhere, including closed backlog items; never touch a frozen artifact's
sentences.

**Living vs. frozen for backlog items is decided by the item's own status**, not by the directory:
an OPEN item referencing an ADR is a living reference and is rewritten; a CLOSED or REJECTED item
is a historical record and is left alone, resolvable through the forwarding line. Without this
distinction the enumeration above reads as excluding `backlog/items/` wholesale, which would strand
live work items pointing at a number that has moved.

**A rename needs BOTH paths in the commit pathspec.** Learned the expensive way on 2026-08-27: two
renumbering commits (`a3b945ef`, `69606200`) each added the new file but never committed the
deletion of the old one, because `git mv` stages a delete plus an add while the commit discipline
requires `git commit -- <exact paths>` — and naming only the NEW path satisfies that discipline
while silently dropping the delete half. HEAD then carried both names at once: a collision turned
into a duplicate, which is strictly worse than what the renumbering set out to fix.

Nothing reports this. The working tree looks correct, the new file is present, and
`check-adr-consistency.mjs` stops complaining about that number because it reads the working tree,
not HEAD. It was caught only by `git status` showing staged deletions that should already have been
committed. So: name both paths, and verify with `git show --name-status <sha>` that the commit
contains a delete for the old path, not only an add for the new one.

### D6 — Same document under two numbers is a removal, not a renumbering

Where two files under different numbers turn out to be the SAME document, the stale copy is
removed. Renumbering it would preserve a document that should not exist.

Checked for in this correction and NOT the case: the two files named
`handover-rotation-extraction-archive-hard-size-gate.md` under 0064 and 0066 are genuinely
different ADRs — Phoenix's 2026-08-18 re-derivation and Nova's 2026-08-17 original, which the
former explicitly cites. They share a slug, not content, and each collides with a different file
under its own number.

## Consequences

- Parallel sprints draft ADRs freely; the counter is touched once, by whoever accepts.
- Acceptance costs one extra step — assign the number, rename, rewrite slug references — and that
  cost sits with the person who has the full picture.
- Draft ADRs are visibly drafts in the filename, which also makes an abandoned draft obvious.
- Accepted cost: a draft's slug appears in review discussion and commit messages, and those
  historical mentions are not rewritten. They stay resolvable via the acceptance commit.
- Accepted cost: after a D4 renumbering, a bare historical `ADR-00NN` in a frozen artifact resolves
  via the forwarding line rather than directly. This is deliberate — the alternative is editing
  records of what was true at the time.
- The existing six collisions are resolved under D4/D5 as a one-time correction; D2 and D3 prevent
  recurrence.
