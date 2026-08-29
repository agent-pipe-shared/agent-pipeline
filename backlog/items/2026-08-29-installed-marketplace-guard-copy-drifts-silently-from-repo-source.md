---
schema: pipeline.backlog-item.v1
id: pipeline.installed-marketplace-guard-copy-drifts-silently-from-repo-source
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_commit: d76db9a26692ebcfe81dd1791bebfef0709dcae0
closure_repository: "self"
closure_evidence: docs/claude-local-plugin-development.md
created: 2026-08-29
sprint: nova
tracking: "PO decision 2026-08-29: candidate 3 (accept as inherent), documented permanently."
source: "Found live by the Elephant on 2026-08-29 while landing GG-22 shared-index-deadlock work-arounds during the 0.6.0 candidate build: the installed marketplace copy of guard-git.mjs still printed the pre-fix GG-22 remediation text hours after the matching repo-source fix (commit 01c02971) had already landed."
done_when: contains docs/claude-local-plugin-development.md Mid-session drift between the checkout and the installed copy is accepted
---

# The installed marketplace guard copy drifts silently from the repo source

## What happened

Commit `01c02971` (earlier on 2026-08-29) corrected the GG-22 remediation
text in this repository's own `plugins/pipeline-core/hooks/guard-git.mjs`.
Later the same session, a live GG-22 denial from the actually-enforcing
hook — the one installed at
`~/agent-pipeline-local-marketplace/plugins/pipeline-core/hooks/guard-git.mjs`
per `docs/claude-local-plugin-development.md` — still printed the OLD,
pre-fix wording ("reconcile then commit the ledger before anything else"),
the exact instruction sequence
`2026-08-29-gg-22s-own-remediation-order-creates-unclearable-ledger-debt.md`
documents as producing unclearable ledger debt. The fix had landed in the
repository; it was not protecting anyone, because nothing had copied and
version-bumped it into the marketplace root the session's own hooks were
actually loaded from.

## Why this is a defect, not just "not stamped yet"

The local-marketplace-copy model (ADR-0052) is deliberate: a session
develops against the repo checkout and validates against a separately
rooted, copied marketplace tree, refreshed by `cp -a` (or `robocopy` on
Windows) plus a manifest version bump
(`docs/claude-local-plugin-development.md`). That refresh is manual and
occasion-triggered — normally at a candidate stamp — so drift between the
two copies during active development is expected and not itself a bug.

What makes this instance a defect is that the drifted file was a **guard**,
and the drift was **silent**: nothing told the session enforcing via the
installed copy that its guard-git.mjs was stale relative to the repo it was
protecting. A stale guard doesn't fail loud — it fails by enforcing the
WRONG rule with full confidence, which is worse than not enforcing at all.
The GG-22 case cost real session time (documented in the sibling item
above) precisely because the printed remediation was trusted as current.

## Direction (not decided — this is the open question)

At least three shapes were visible when this was found; none was picked or
built this session:

1. **A pre-flight staleness check**: something like `pipeline-start`'s own
   bootstrap comparing installed-vs-repo content hashes for the hook files
   actually enforcing the session, surfacing drift before it can be
   silently trusted.
2. **A documented discipline**: require a `cp -a` + version bump any time a
   guard/hook file changes, not only at a full candidate stamp — heavier
   process cost, no new code.
3. **Accept it as inherent**: the local-marketplace-copy model already
   accepts a manual-refresh boundary by design (ADR-0052); treat mid-session
   guard drift as a known, accepted property, and only guarantee freshness
   at the stamp boundary — which is arguably what already happened here
   (the candidate had not yet been stamped when this was hit).

## Acceptance criteria

Left open pending a PO decision on which of the directions above (or a
different one) is wanted, and whether it is Nova A (0.6.0 candidate) or
Nova B scope. No commit under this item should implement a specific
remedy before that decision is recorded here.

## PO decision and closure, 2026-08-29

**Decision:** candidate 3 — accept as inherent to the local-marketplace-copy
model (ADR-0052), documented permanently rather than built as a checker.
**Rationale (PO):** "darum machen wir regelmäßig während Dev eine lokale
neue Kopie, da muss man dann einen guten Haltepunkt wählen und das braucht
auch immer den Stempel" — the practice is already to refresh the local copy
repeatedly during active development, choosing a good checkpoint each time,
and every refresh already requires the version-bump step (the "stamp");
staleness between refreshes is accepted as a property of that cadence, not
a gap needing detection tooling.
**How applied:** a new subsection, "Mid-session drift between the checkout
and the installed copy is accepted", added to
`docs/claude-local-plugin-development.md` immediately after the existing
"Refresh the local build after a change" section — states the acceptance
explicitly, names the checkpoint-choice practice, and reiterates that a
refresh is always the copy PLUS the version bump together (standing
lesson: candidate-stamp-needs-manifest-version-bump-too), never the copy
alone. `done_when` repointed to that new section's own heading text.

## Related

- `2026-08-29-gg-22s-own-remediation-order-creates-unclearable-ledger-debt.md`
  — the concrete incident this drift made worse; that item's own fix landed
  in repo source only, same exposure.
- `docs/claude-local-plugin-development.md` — the documented (manual)
  refresh process this finding sits on top of.
- `docs/adr/0052-marketplace-identity-restoration-and-local-dev-separation.md`
  — the local-marketplace-copy model this finding's Direction 3 references.
