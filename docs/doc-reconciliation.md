# Doc reconciliation record

This file is the input `harness/scripts/check-doc-reconciliation.mjs` reads to
decide whether every ADR implicated by a checked commit range has been looked
at. It carries no narrative; it is a machine-parsed ledger.

**Format.** A section heading is `## Candidate <40-hex-sha>`, optionally
followed by more text on the same line (a date, a one-line description). Its
body runs until the next `## ` heading or end of file. Inside that body, a
reconciliation line for ADR-NNNN is one of exactly two shapes:

- `- ADR-NNNN: checked, no change needed.`
- `- ADR-NNNN: amended in <commit>.`

A `- ADR-NNNN: ...` line that matches neither shape is reported as
MALFORMED-RECORD-ENTRY and does not satisfy the ADR it names.

**Write-order rule.** The record names the candidate commit it covers.
Committing the record moves `HEAD`, so the record is written and committed
**last**, and the check is then run with `--candidate` set to the commit the
record names — the tip of the substantive work, not the record commit itself.
The push range therefore carries one extra commit that touches only this file
and no governed path.

**Known limitation (v1), stated deliberately.** A record whose section names
candidate commit X is invisible to a run against candidate commit Y even when
X is an ancestor of Y and nothing governed changed in between. That is
deliberate — it is the property that makes a stale record fail — and
widening it to accept a proven-clean ancestor span is the obvious v2, not
something to do here without review.

## Entries

## Candidate 3a8589152e778fc1ec164c6a5ba981139c431a90 — 2026-08-09, range 8dcb1cc..3a85891 (the unpushed sprint_phoenix range); ADR-0045 checked and a divergence filed as pipeline.adr-0045-topology-divergence-from-package-and-skill

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Notes for a reader, outside the two machine-parsed lines above. ADR-0012 governs
`docs/state.md`, which this range rewrites heavily; its decision — one canonical
versioned handover file, memory mirror-only, the open-items block referenced
rather than hand-maintained — is unaffected, and the file is still the only
handover. Its recorded risk, *secondary sources creep back in*, did materialise
in this range, but **inside** `state.md` rather than between files: a decision
list at the top kept reading as authoritative after it stopped being true, and
was corrected in `a69c288`. That is the ADR's risk being right, not the ADR being
wrong.

ADR-0045 governs `specs/**` and was implicated by three changed files. Reading it
against the package it governs surfaced a real divergence — four root artifacts
its enumeration does not name, and a PRD filename that disagrees between the
record, the disk and the shipped bootstrap skill. **No change to the ADR is made
here**, because both halves are governance questions rather than edits; they are
filed as `pipeline.adr-0045-topology-divergence-from-package-and-skill`,
committed in `3a85891`.

That is the honest reading of `checked, no change needed` in this case: the
decision record was read against its subject and left alone deliberately. The
format offers exactly two line shapes, and neither says "checked, and a
divergence was filed". A third shape is worth adding, and adding it belongs in
the same review as the ancestor-span widening noted above rather than in the
commit that first needed it.
