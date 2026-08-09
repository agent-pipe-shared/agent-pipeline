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

## Candidate 1d5298c72d4d84244bbb5cfde9a0bd282dd6f2fb — 2026-08-09, range 3387065..1d5298c, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `78b7fb5` entry below with the same one-entry-per-unpushed-range shape, now also
covering `5897862`, `2005bb6`, `1d5298c`: R-AC-12's fixture build (the motivating Phoenix
bootstrap trajectory, encoded as a test rather than a production caller — the criterion asked for
nothing else), its evidence-map delta, and this leg's checkpoint. Same reading as the whole chain:
`docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/class-s-scoping trio stays
ADR-0045. `plugins/pipeline-core/lib/external-command-offer.test.mjs` (the R-AC-12 commit's only
changed path) implicates neither ADR — a test file is not `docs/state.md` and not one of the
generated evidence/design artifacts.

## Candidate 78b7fb58a19531c7bdd8f05d96b6bba4b350f423 — 2026-08-09, range 3387065..78b7fb5, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `cae20a3` entry below with the same one-entry-per-unpushed-range shape, now also
covering `0d01845`, `a657e14`, `be825df`, `d0401a2`, `78b7fb5`: X-AC-14's filed backlog fix
(external-reference-adapter.mjs typed unreachable-response), H-AC-08's legacy-import-observation
carrier, both evidence-map deltas, and this leg's checkpoint recording the PO's grounding-method
correction. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated
evidence-map/closure-plan/class-s-scoping trio stays ADR-0045. The one closed backlog item
(`backlog/items/2026-08-09-external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system.md`)
confirms `backlog/`'s own dedicated class again, same as every prior occurrence in this chain.

## Candidate cae20a35134b05a69f56a913253fe7ae6e7142b0 — 2026-08-09, range 3387065..cae20a3, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `f7062ac` entry below with the same one-entry-per-unpushed-range shape, now also
covering `8244ab3`, `0022d13`, `73501cf`, `cae20a3`: A-AC-05's identity-provenance/assurance
carrier (built, stays partial, no production caller), round-3 Critic PASS remediation on the
A-AC-04 CLI (three minor findings closed), the resulting evidence-map delta closing A-AC-04, and
this leg's checkpoint. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the
generated evidence-map/closure-plan/class-s-scoping trio stays ADR-0045. Nothing in this range
touches `backlog/` or any other governed path.

## Candidate f7062acc3d95069c350f7318e01e11bea1b5d168 — 2026-08-09, range 3387065..f7062ac, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `e9d13c8` entry below with the same one-entry-per-unpushed-range shape, now also
covering `e7688d4`, `836242e`, `6c6514b`, `a67faf9`, `aa36239`, `f3eeb3e`, `f7062ac`: E-AC-14's
failure-injection fixture and its evidence-map delta, round-2 remediation of the A-AC-04 CLI (5
Critic findings closed), PX0-AC-08's bootstrap wiring and its evidence-map delta, round-2's own
residual major finding (N1) plus F3/N2 closed by a follow-up fix, and this leg's H-AC-09
Class-S-to-Class-P reclassification checkpoint. Same reading as the whole chain: `docs/state.md`
stays ADR-0012, the generated evidence-map/closure-plan/class-s-scoping trio stays ADR-0045.
Nothing in this range touches `backlog/` or any other governed path.

## Candidate e9d13c8ffaf34ce178af1d6086af575c2949255e — 2026-08-09, range 3387065..e9d13c8, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `3371a0d` entry below with the same one-entry-per-unpushed-range shape, now also
covering `25f48cd`, `78006b4`, `8c7efa3`, `e9d13c8`: the A-AC-04 measurement correction (a second
real carrier found), the human-authority-grant.mjs build, the backlog item for a second
evidence-citation defect, and this leg's checkpoint recording the Critic FAIL that build received.
Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated evidence-map/
closure-plan/class-s-scoping trio stays ADR-0045. The new backlog item confirms `backlog/`'s own
dedicated class again, same as every prior occurrence in this chain.

## Candidate 3371a0d9327d5430cd876ce2be0d0baad51b5754 — 2026-08-09, range 3387065..3371a0d, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `7eee663` entry below with the same one-entry-per-unpushed-range shape, now also
covering `b78fae1`, `a5b1a69`, `00b275e`, `71abec7`, `3371a0d`: X-AC-11's design-followed build,
its evidence-map delta, the second signed-window PX0 registration, its evidence-map delta, and
this leg's checkpoint. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the
generated evidence-map/closure-plan pair stays ADR-0045. Nothing else in this range touches a
governed path.

## Candidate 7eee663a05daa11cfa5888552d05085c7992b39f — 2026-08-09, range 3387065..7eee663, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `f7d9c0d` entry below with the same one-entry-per-unpushed-range shape, now also
covering `2ca38fc`, `305ca2f`, `7eee663`. Same reading as the whole chain: `docs/state.md` stays
ADR-0012 (one new checkpoint entry recording an independent Critic FAIL and its remediation), the
generated evidence-map/closure-plan pair stays ADR-0045. Two new `backlog/items/*.md` files in
this range confirm the same reading the `c004d16` entry already established: `backlog/` is its
own dedicated class under ADR-0045, not implicated by its `specs/**` glob — the check's own
output above names only the four `specs/sprint-phoenix-epic/` files, not either backlog item.

## Candidate 13bebf6a5d15fb0c425d9599c34e82bbc510c12c — 2026-08-09, range 3387065..13bebf6, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `63de074` entry below with the same one-entry-per-unpushed-range shape, now also
covering `8a98057`, `aa7432d`, `13bebf6`. Same reading as the whole chain: `docs/state.md` stays
ADR-0012, the generated evidence-map/closure-plan pair stays ADR-0045 -- extended this range to a
new file under the same covered root, `specs/sprint-phoenix-epic/design/class-s-scoping.md`,
which the check's own output confirms falls under the same `specs/**` glob as every other
evidence/design artifact in this chain. Nothing else in this range touches a governed path.

## Candidate 09f853a9e585a5db133d441be5c19390acbd3623 — 2026-08-09, range 3387065..09f853a, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `68338ef` entry below with the same one-entry-per-unpushed-range shape, now also
covering `7376c2c`, `7a2caa6`, `09f853a`. Same reading as the whole chain: `docs/state.md` stays
ADR-0012 (one new closing-checkpoint entry), the generated evidence-map/closure-plan pair stays
ADR-0045. The one documentation commit (`docs/agent-decision-journal.md`,
`docs/governance-events.md`, `docs/governance-replay.md`) touches no path any `Governs:` line in
the corpus names, confirmed by this run.

## Candidate 8db7e3cf7d6095743ee72a405ad88d928752958a — 2026-08-09, range 3387065..8db7e3c, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `62f2f7d` entry below with the same one-entry-per-unpushed-range shape, now also
covering `338f9cb`, `9f5e680`, `ccd0b13`, `4eea837`, `8db7e3c`. Same reading as the whole chain:
`docs/state.md` stays ADR-0012 (three new entries: a dispatch note, a header-restoration fix, a
landing checkpoint), the generated evidence-map/closure-plan pair stays ADR-0045. The one
test-authorship commit (`plugins/pipeline-core/lib/agent-decision-journal.test.mjs`,
`governance-export-delivery.test.mjs`) touches no path any `Governs:` line in the corpus names.

## Candidate 28df389471fda30d3a0c18bc3587195fc6b45069 — 2026-08-09, range 3387065..28df389, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `3eef8dd` entry below with the same one-entry-per-unpushed-range shape, now also
covering `bd8d73e`, `a7471a0`, `f9e300c`, `3f09bed`, `c48f327`, `e3967ba`, `28df389`. Same reading
as the whole chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan pair
stays ADR-0045. This range is the first to touch `docs/*.md` PACKAGE documentation
(`agent-decision-journal.md`, `change-control.md`, `governance-events.md`,
`governance-event-export.md`, `organization-policy-packs.md`, `audit-bundles.md`,
`external-traceability.md`) and to EDIT (not create) a `backlog/items/*.md` file -- checked
explicitly rather than assumed identical to prior ranges: no ADR's `Governs:` line names any of
these paths, confirmed by the check's own output above naming only `docs/state.md` and the three
`specs/sprint-phoenix-epic/` files.

## Candidate bc023a0a735264e8daf7cb4e0bcf1417d3b979b7 — 2026-08-09, range 3387065..bc023a0, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `6b1fa48` entry below with the same one-entry-per-unpushed-range shape, now also
covering `2594552`, `e33618d`, `de13e92`, `7253d49`, `bc023a0`. Same reading as the whole chain:
`docs/state.md` stays ADR-0012 (one new checkpoint entry), the generated evidence-map/closure-plan
pair stays ADR-0045 (two delta commits). The two test-authorship commits
(`plugins/pipeline-core/lib/human-governance-ledger.test.mjs`;
`plugins/pipeline-core/lib/governance-export-{adapter,delivery,outbox}.test.mjs`) touch no path
any `Governs:` line in the corpus names, confirmed by this run.

## Candidate 5bae83c2aac599271a07644d335af8f958771c1f — 2026-08-09, range 3387065..5bae83c, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `16114ee` entry below with the same one-entry-per-unpushed-range shape, now also
covering `500d5cc`, `78c6ef1`, `7ce3214`, `5bae83c`. Same reading as the whole chain: `docs/state.md`
stays ADR-0012 (one new checkpoint entry recording the maintenance-window ceremony and its
outcome), the generated evidence-map/closure-plan pair stays ADR-0045 (one delta commit). The two
non-generated content commits in this range —
`plugins/pipeline-core/lib/external-command-offer.test.mjs` (WP-R test-authorship) and
`harness/scripts/pipeline-state.test.mjs` (the P-AC-08 gate registration, additive-only, run
under the signed TP-3+TP-5 window rather than any doc-reconciliation-relevant channel) — touch no
path any `Governs:` line in the corpus names, confirmed by this run.

## Candidate 4e5f3d3d3deb7fbb855ab6a3e24ae3533ea1147f — 2026-08-09, range 3387065..4e5f3d3, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `c004d16` entry below with the same one-entry-per-unpushed-range shape, now also
covering `2a25520`, `e835464`, `055cb8b`, `80074ee`, `4e5f3d3`. Same reading as every entry in this
chain: the only governed paths this added range touches are `docs/state.md` (ADR-0012, two new
checkpoint entries recording work already landed) and the `specs/sprint-phoenix-epic/evidence/`
+ `design/` generated pair (ADR-0045, two delta commits regenerated from the same measurement
script per the established pattern). The two new test-authorship commits
(`plugins/pipeline-core/lib/change-control.test.mjs`, `plugins/pipeline-core/lib/agent-decision-journal.test.mjs`)
touch no path any `Governs:` line in the corpus names, confirmed by this run.

## Candidate d6f7a2e73e1c0fbd55cc9a4df23e53b019141054 — 2026-08-09, range 3387065..d6f7a2e, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `e44fb6e` entry below with the same one-entry-per-unpushed-range shape, now also
covering `d536fcd`, `55ffd18`, `fdb0292`, `3161a8e`, `a99c131`, `0b53f89`, `85dfd2a`, `d6f7a2e`.
Every commit in this added range that touches a governed path is `docs/state.md` (ADR-0012) or a
`specs/sprint-phoenix-epic/evidence/`/`design/` artifact (ADR-0045); the rest —
`plugins/pipeline-core/lib/*.test.mjs` test-authorship commits and one new `backlog/items/*`
file — touch no path any `Governs:` line in the corpus names, confirmed by this run rather than
assumed from the pattern of the prior entry.

ADR-0045: same reading as the prior two entries, extended to one more file class this range
introduces — `backlog/items/2026-08-09-external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system.md`.
That file sits under `backlog/`, which is its own dedicated class per the ADR's own text
("`backlog/`... retain dedicated classes") and is not implicated by ADR-0045's `specs/**` glob at
all — the check's output above confirms this: only `specs/sprint-phoenix-epic/design/closure-plan.md`
and the two `specs/sprint-phoenix-epic/evidence/` files triggered it, not the backlog item.

ADR-0012: same reading as the two prior entries. The two new `docs/state.md` entries in this
range are the same shape as before — pointers at committed package artifacts and a compaction
checkpoint recording what already landed, not a restatement of their content.

## Candidate e44fb6e00722c91c3a90b4c9a4dbc89bcbcbfe20 — 2026-08-09, range 3387065..e44fb6e, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

The entry below (record commit `4309d2c`) already covered `8e7a2f7..382626f`. This entry
supersedes it and additionally covers `55f361c`, `8df045f`, `92b21ed`, `8b696bc`, `e44fb6e` —
one entry for the whole unpushed range rather than one per candidate, because the intervening
commits either touched no governed path at all (`8df045f`, `92b21ed`, both entirely under
`plugins/pipeline-core/`, checked below) or are themselves the docs commits this entry covers
(`8b696bc`, `e44fb6e`).

ADR-0045 was implicated by the same class of change as the prior entry: `evidence/` package
files, this time a new design document (`design/closure-plan.md`) alongside edits to the
already-covered generator and map. `design/` is named explicitly in the ADR's own enumeration,
so this needs no new reading — the file lands inside what the decision already governs.

ADR-0012 was implicated by two further `docs/state.md` entries and still holds with one
canonical handover file. Both entries point at committed package artifacts rather than
restating their content, consistent with the prior entry's reading of A9.

**One thing worth naming rather than assuming past this range, checked rather than asserted.**
`plugins/pipeline-core/scripts/pipeline-state.mjs` and `lib/feature-package-topology.mjs`
changed substantively in this range (`92b21ed`, +290/−6), adding a new writer transaction to the
Pipeline's own runtime. This layer did not flag it. The reason is narrower than "no ADR governs
`plugins/**`" — that claim is false: `docs/adr/0058-guard-maintenance-window.md:14` governs eight
files under `plugins/pipeline-core/hooks/` and `lib/` by exact path. The precise gap is that
neither of the two files this range touched is among ADR-0058's eight, nor named by any other
`Governs:` line in the corpus (confirmed by re-reading all five lines, not by pattern-matching
the directory). A governance-writer change of real substance therefore produced zero signal from
this layer, for want of a `Governs:` line naming it — a distinct observation from the filed
`pipeline.doc-reconciliation-blind-to-adr-corpus-changes` item, which concerns the corpus not
covering edits to itself, not production code going uncovered. Not filed as its own item here;
recorded so a later reader does not have to re-derive it from the commit.

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
