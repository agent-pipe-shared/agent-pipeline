---
schema: pipeline.backlog-item.v1
id: pipeline.adr-0047-renumber-left-live-references-behind
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Filed as the deliberate follow-up named by commit 88a7133 (\"fix(adr): give the three ADRs numbered 0047 real numbers, and move two records to the code\"), which resolved the docs/adr/ corpus and docs/adr/README.md but explicitly left three classes of out-of-corpus reference untouched. Commit message: \"Two things this deliberately does not do... Both are filed rather than smuggled in.\""
due: 2026-09-08
---

# ADR-0047's renumber left live references behind, in three shapes that need three different repairs

## Description

`88a7133` renumbered the three ADRs that all claimed `0047`:
`0047-model-free-advisor-preflight-v2.md` keeps `0047`;
`0047-local-supervisor-state-authority.md` became `0061`;
`0047-governance-event-kernel.md` became `0062`. The commit repaired the ADR
corpus itself and `docs/adr/README.md`, but deliberately left three classes of
stale reference elsewhere in the repo, each requiring a different repair path
rather than a uniform find-and-replace.

## Triggering situation

Follow-up work explicitly named (and deliberately not performed) by `88a7133`,
which is itself the resolution of `2026-08-07-adr-0047-numbering-collision.md`
step 2. That earlier item's own Assignment note anticipated splitting
remaining follow-ups into their own items before or instead of closing it;
this is that split.

## Affected artifact

**Class 1 — accepted sprint records, leave as historical record (do not
rewrite).** 13 references to "ADR-0047" that now mean ADR-0061
(local-supervisor state authority), across the closed Nova sprint:
`specs/sprint-nova-epic/spec.md:1067,1565`;
`specs/sprint-nova-epic/plans/nova-b.md:113,135,141`;
`specs/sprint-nova-epic/plans/nova-b-readiness-2026-08-06.md:57,59`;
`specs/sprint-nova-epic/result.md:318,402,605,626,633`. These are the accepted
record of a finished sprint; `nova-b-readiness-2026-08-06.md` is itself a
historical analysis of this exact collision, so rewriting its ADR-0047
mentions would edit a record rather than repair a reference.
`nova-b-readiness-2026-08-06.md:109` is a fourteenth hit that names the
collision itself rather than citing either resulting ADR and needs no
resolution either way.

**Class 2 — hash-bound Spec authority, needs the reviewed rebind path.**
`specs/sprint-phoenix-epic/spec.md:403` names
`docs/adr/0047-governance-event-kernel.md`, a path that no longer exists (the
file is now `docs/adr/0062-governance-event-kernel.md`). This Spec is
hash-bound authority: a dispatch that repointed this line directly broke the
binding and put the session into `partial` readiness until the file was
restored (caught by the readiness guard within one tool call during the
`PHX-ADR-FIX` dispatch that produced `88a7133`). It needs the ordinary
reviewed Spec-rebind path, not a plain edit.

**Class 3 — German reference-table drift, accepted at most a human pass.**
`docs/adr/README.md`'s German table has no row at all for the
governance-event-kernel ADR, and `docs/adr/0040-advisor-consent-and-readonly-bash.md:104`
is now stale against the amended English above it. Per the PO ruling of
2026-08-09, English is the authoritative layer and German is a reader aid
that may be removed entirely later — so this class is accepted drift needing
at most a human German pass, explicitly not a defect blocking anything.

## Proposal

1. Class 1: no repair proposed — record the 14 locations as intentionally
   left as historical record; close this class of the item on that basis
   alone, or leave it open as documentation only.
2. Class 2: route `specs/sprint-phoenix-epic/spec.md:403` through the
   ordinary reviewed Spec-rebind mechanism (whatever the Phoenix sprint's own
   calibration prescribes for a hash-bound Spec correction) to repoint the
   ADR path from `0047-governance-event-kernel.md` to
   `0062-governance-event-kernel.md`.
3. Class 3: schedule a human-driven German pass over `docs/adr/README.md`'s
   German table and `docs/adr/0040-advisor-consent-and-readonly-bash.md:104`,
   or defer indefinitely given the PO's stated intent to possibly remove the
   German reader aid entirely later.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
