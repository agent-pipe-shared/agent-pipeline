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

**Write-order rule, and why it is arithmetic rather than convention.** The
record names the candidate commit it covers, and **it can never live inside that
commit** — writing it changes the tree, which changes the hash. So the record is
written and committed **last**, and the check is run with `--candidate` set to
the commit the record names: the tip of the substantive work, not the record
commit itself. The push range therefore carries one extra commit that touches
only this file and no governed path.

That asymmetry is now explicit in the tool rather than implied by this
paragraph. ADR bodies and their `Governs:` lines are read from the **candidate
commit** — an ADR's declaration of what it governs exists independently of any
record, so there is no self-reference. The record is read from **`--record-ref`
(default `HEAD`)**, a ref that by construction is not the candidate. Neither is
ever read from the working tree: an uncommitted record satisfies nothing, and a
`Governs:` line deleted only in the working tree narrows nothing. Before
2026-08-09 both were read from disk, which meant a record that existed in no
commit could pass — the failure this file exists to prevent, in the tool that
enforces it.

A `--record-ref` that does not resolve, that carries no record, or that does not
have the candidate as an ancestor is its own typed finding. The reason is named,
never collapsed into an unreconciled decision record.

**Known limitation (v1), stated deliberately.** A record whose section names
candidate commit X is invisible to a run against candidate commit Y even when
X is an ancestor of Y and nothing governed changed in between. That is
deliberate — it is the property that makes a stale record fail — and
widening it to accept a proven-clean ancestor span is the obvious v2, not
something to do here without review.

## Entries

## Candidate 382626f42708d10fd17e0607f010d6342e4ac57c — 2026-08-09, range 3387065..382626f, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Both re-read against the candidate rather than carried forward from the entry below, and this
range is the first since the layer was built where the two readings are not identical to it.

ADR-0045 was implicated by two **new** files, not by an edit to an existing one:
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map-20260809.md` and its generator
`acceptance-evidence-map.mjs`. The decision names `evidence/` as a package directory in its own
enumeration and constrains its contents no further, so both files land inside what the ADR
already governs and neither is an extension of it. Recorded explicitly because the tempting
reading is the opposite one: a `.mjs` inside a spec package looks like a new artifact class, and
it is not — the ADR draws its line at the directory, not at file type.

The divergence found on this layer's first real run is unchanged and stays filed as
`pipeline.adr-0045-topology-divergence-from-package-and-skill`: the ADR's root enumeration says
`prd.md` where disk says `prd_phoenix-epic.md`, and it does not cover four artifacts the package
already carries. This range adds two more files to that uncovered set. That does **not** widen
the divergence — the four uncovered artifacts sit at the package **root**, which the ADR
enumerates exhaustively, while these two sit inside `evidence/`, which it does not. The
distinction is worth keeping in the record so a later reader does not fold two different gaps
into one number.

ADR-0012 was implicated by `docs/state.md` and still holds with one canonical handover file. The
one thing worth checking rather than assuming: this range's handover entry deliberately **points
at** the committed evidence map instead of restating its numbers, and ADR-0012's own recorded
risk is that secondary sources creep back in. Checked, and it is the opposite case — A9's
refinement prescribes exactly this shape ("generated from, or references"), and the map is a
package evidence artifact rather than a second handover. A restatement of its 157 rows in this
file would have been the drift the decision forbids. — 2026-08-09, range 8dcb1cc..36a7fb1, the substantive tip of the push candidate; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Both readings unchanged from the entry below, and both re-read rather than carried forward:
the handover decision still holds with one canonical file, and the topology decision was
read against the package it governs and deliberately left alone.

What changed since that entry is the disposition around ADR-0045, not the reading. The PO
settled on 2026-08-09 that harness-level checks created outside the Epic's file inventory
are an acknowledged, repeated practice rather than a one-night exception, so no decision
record moves here. The gap that produced the practice is filed as
`pipeline.epic-file-contract-has-no-drift-check`; the divergence between that ADR and the
package it governs remains filed as
`pipeline.adr-0045-topology-divergence-from-package-and-skill`; and this layer's blindness
to changes inside `docs/adr/` itself remains filed as
`pipeline.doc-reconciliation-blind-to-adr-corpus-changes`.

## Candidate 51eafc7b8c4853ee2663db0dfc1274268ca383f7 — 2026-08-09, range 8dcb1cc..51eafc7, the substantive tip of the push candidate; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

First entry written under the corrected semantics: the two decision records were read out
of the candidate commit and this record out of `--record-ref`, so neither answer came from
the working tree. Every earlier entry below was produced by the version that read both from
disk, which is the defect repaired in `2d413d9` — those entries were true, but the check
that accepted them could not have known.

Both readings are unchanged from the entry below. ADR-0012's decision still holds: one
canonical handover file, still the only one. ADR-0045 was read against the package it
governs and left alone deliberately; the divergence that reading found is filed as
`pipeline.adr-0045-topology-divergence-from-package-and-skill`, and a second gap found
since — that no `Governs:` line covers `docs/adr/` itself, so the corpus is invisible to
this layer — is filed as `pipeline.doc-reconciliation-blind-to-adr-corpus-changes`.

## Candidate 2e0ea8c8e689edaef82e7a10b2eaa09401be9fa5 — 2026-08-09, range 8dcb1cc..2e0ea8c, the substantive tip of the push candidate; supersedes the 9b27991 and 3a85891 entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Same two ADRs, same findings, same reasoning as the entries below — the candidate
moved because each further change to the handover file is itself governed by
ADR-0012. That is not bookkeeping noise, it is the write-order rule being real.

**And it does not terminate on its own.** The implicated set is computed over the
whole range, so a governed path that changed anywhere in it keeps implicating its
ADR no matter what the tip touches; an entry for the record commit would need
another entry, without end. What bounds it is the rule at the top of this file:
the check is run against the tip of the **substantive** work, and the commit that
adds this entry sits deliberately outside the reconciled range. Anyone extending
this file should reconcile to their own substantive tip, not to the commit they
are about to make.

The entry below is kept rather than replaced. It covers a candidate that was
genuinely reconciled, and deleting superseded entries would make this file's own
history unreadable in exactly the way the decision list at the top of the
handover became unreadable earlier today.

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
