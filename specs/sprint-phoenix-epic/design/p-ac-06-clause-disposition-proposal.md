# P-AC-06: disposition proposal for the "legacy" and "orphaned" clauses

Status: proposal, awaiting PO decision — not authorized to edit `acceptance.md`

Date: 2026-08-11

Source: this session's Class B survey (`docs/state.md`, "PO said keep going"
and the two sections following it). This document is the detailed writeup
the PO asked for after approving a framing that later investigation proved
wrong on both counts; nothing here is authorized to land in `acceptance.md`
without an explicit PO act, per the acceptance text's status as a frozen,
authority-bound artifact for this feature's active revision (governed by
ADR-0045).

## The clause, verbatim

> **P-AC-06:** WHEN a bundle is built, THE SYSTEM SHALL inventory artifacts
> through a valid `pipeline.feature-package.v1` manifest and the #22 topology
> validator, bind exact source digests, policy versions, independently
> retained event-chain checkpoints, candidate/release identity, and
> verification results, and fail on legacy, missing, orphaned, misplaced,
> stale, truncated, or illegally mutable required artifacts.

Seven trigger words describe conditions a required artifact can fail on.
Before proposing anything for the two open ones, this document checks all
seven — a proposal addressing two of seven risked being wrong about scope,
not just content.

## Five of seven are already pinned, not two of two

`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs`'s own
recorded evidence for P-AC-06 (line 1189) states this, and re-reading
`plugins/pipeline-core/lib/feature-package-topology.mjs` confirms it against
the live source:

| Trigger word | Check | Where |
| --- | --- | --- |
| missing | referenced file doesn't exist on disk | `regularFile()`, `feature-package-topology.mjs:45` |
| misplaced | artifact path isn't canonical within `specs/{id}/` | `feature-package-topology.mjs:108` |
| stale / truncated | current file bytes don't hash to the manifest's recorded `sha256` | `feature-package-topology.mjs:116` |
| illegally mutable | a `candidate-evidence`/`supply-chain`/`threat-model` artifact isn't declared `immutable`, or a non-authority class is marked `authority: true` | `feature-package-topology.mjs:117-121`, tested in `audit-bundle.test.mjs:73` ("rejects a candidate-evidence artifact declared mutable") |

All four rows are exercised by `audit-bundle-core-tests`, which is a
registered, green Verify suite. **Only `legacy` and `orphaned` remain open.**
The scope of this proposal is exactly those two, confirmed rather than
assumed.

## "legacy" — investigation result

The PO's approved framing was "extend `validateFeaturePackage`" to reject an
artifact whose path points into a package classified `legacy` by
`inventoryFeaturePackages` (a directory under `specs/` with no
`lifecycle.json`). Investigating that framing against the real code proves
it cannot fire:

- `packageRelative(id, artifact.path)` (`feature-package-topology.mjs:34-37`)
  requires every artifact path to start with `specs/${id}/` — the validation
  loop already rejects (`FTP-ARTIFACT-N: path must be canonical within
  specs/${id}/`) any path that points outside the package being validated.
  An artifact can structurally never reference a directory other than its
  own package's.
- A package reaches `validateFeaturePackage` only by having a readable
  `lifecycle.json` at `manifestPath` — the very thing `inventoryFeaturePackages`
  classifies as *not* legacy. `planAuditBundle` (`audit-bundle.mjs:42`) takes
  `manifestPath` as a caller-supplied argument, not a package id resolved
  through inventory; if the directory were legacy (no `lifecycle.json`),
  there is no manifest to pass in the first place, and the existing
  `FTP-MANIFEST: referenced file is missing` finding already fires — before
  any dedicated legacy check could add anything.

**The approved check cannot observe a legacy input under either entry path.**
This isn't a narrower scope to re-attempt; it's a proof that the clause, as
approved-framed, describes a state the validator's own type of input makes
unreachable.

### Options

1. **Strike "legacy" from P-AC-06's trigger list, documented as
   structurally satisfied by construction, not implemented by a check.**
   Rationale: a legacy directory can never produce a `manifestPath` for
   `validateFeaturePackage` to accept, so "a required artifact from a legacy
   package" is not a reachable state to guard against — the invariant holds
   for the same reason a type system makes some conditions unreachable.
   Cheapest, most honest, zero new code. **Recommended** unless the PO wants
   the second option below.
2. **Redefine "legacy artifact" as a superseded-but-still-listed artifact
   within one package** — e.g., an artifact whose class already has a newer
   authoritative entry (a second `spec`/`prd` added without retiring the
   first) or one that survives from a manifest revision the package's own
   `supersedes` chain has moved past. This is a coherent, different concept
   from the directory-level "legacy" the PO approved — real design work
   (needs a definition of "prior revision": manifest edit history? an
   explicit revision counter that doesn't exist in the schema today?) sized
   as its own scoped task, not a quick fix.
3. **Do nothing, leave the clause open indefinitely.** Not recommended — the
   evidence map would keep citing a check that provably cannot exist as
   specified, which is the same kind of stale/misleading record this
   session already found and corrected twice for other criteria.

## "orphaned" — investigation result

The PO's approved framing was "flag any physical file under `specs/{id}/`
not referenced by any artifact entry and not the manifest itself." Built as
`PHX-WP-PAC06-ORPHAN` (`fad0aa95`), it passed its own fixture but broke
`check-artifact-topology.mjs` — a registered Verify suite — against this
repository's real packages: 107 findings on `sprint-nova-epic`, 57 on
`sprint-phoenix-epic`, every one a legitimate file (critic reviews, dispatch
records, phase-plan docs) that has always lived under `specs/{id}/` without
being listed as a manifest artifact. Reverted (`cc43a182`).

Re-examining why, with the sharpest counterexample pair available:
`specs/sprint-nova-epic/lifecycle.json` lists `evidence/nova-b/*` files as
tracked artifacts while `evidence/nova-a/*` files of identical shape, same
package, same directory depth, aren't listed at all. `RECOVERY.md` (listed,
class `design`) vs. `phase-plan_gate-integrity.md` (unlisted) — both
top-level `.md` files in the same package. **No predicate over path, name,
extension, or directory depth separates the tracked set from the untracked
one in either case** — which file gets listed is a decision made by whoever
last edited the manifest, not a property the file itself carries. Nova also
uses `implementation/`/`plans/` directories Phoenix doesn't have, so any
directory-shaped rule would need to be per-package — itself a sign this
isn't a repository-wide structural property.

### Options

1. **Narrow "orphaned" to the four authority-required classes only** (prd,
   spec, acceptance, result) — the only classes with a genuinely
   deterministic membership rule. Already fully enforced by the existing
   `FTP-REQUIRED`/`FTP-AUTHORITY` checks (at least one of each required
   kind; exactly one authoritative). Costs nothing, but adds nothing beyond
   what's already there either — same redundancy problem as "legacy"
   option 1. Listed for completeness, not recommended on its own.
2. **Build a baseline/grandfather mechanism.** Record a snapshot of
   currently-known files per package (a new manifest field, e.g.
   `knownFiles: [{path, sha256}]`, written whenever the manifest is edited
   through the sanctioned reconcile-transaction path) and flag only files
   that appear *after* that baseline and remain unlisted. This gives
   "orphaned" real, non-vacuous teeth — a file added later that nobody
   accounted for in the manifest — without breaking the legitimate existing
   backlog of untracked historical files, since they'd all be captured in
   each package's initial baseline. Real scope: schema change, a
   baseline-write path wired into the existing manifest-edit flow, an
   initial-baseline migration for Nova and Phoenix's current file sets, and
   a decision about who's authorized to update the baseline (presumably the
   same authority gate that already governs artifact edits). Sized as its
   own tracked backlog item / follow-up slice, not a session-internal fix.
3. **Strike "orphaned" from P-AC-06, documented as unimplementable as a
   structural rule given the current manifest design** (tracking is
   curatorial, not a file property) — same honesty rationale as "legacy"
   option 1, but for a different underlying reason (missing history/baseline
   machinery, not an unreachable-input proof). **Recommended for now**,
   with option 2 kept as the named real fix if the PO decides the
   auditability guarantee ("nothing enters a bundle undetected") is worth
   building deliberately.

## Recommended disposition

Strike both clauses from P-AC-06's enumerated trigger list (options
"legacy"-1 and "orphaned"-3 above), each with a one-line rationale in the
acceptance text itself so a future reader doesn't have to reconstruct this
investigation. If the PO wants either concept implemented for real instead
of struck, "legacy"-2 and "orphaned"-2 are the named, scoped starting points
— both are genuine multi-step design-then-build work, not something to
attempt narrowly.

## What happens after the PO decides

1. The PO picks a disposition per clause (strike / build the named
   alternative / something else).
2. If striking: amend `acceptance.md`'s P-AC-06 bullet and the evidence
   map's line-1189 pointer text in one commit; this is an authority-set
   change and needs its own doc-reconciliation entry citing **ADR-0045**
   (governs `specs/**`), not just ADR-0012.
3. If building: file a scoped backlog item per chosen option (2) above and
   sequence it as its own dispatch — not attempted inside this proposal.
4. Either way, P-AC-06's evidence-map verdict stays `partial` until whichever
   path is chosen is actually landed and independently Critic-reviewed —
   consistent with this session's standing rule that nothing moves to
   `implemented` without a Critic PASS on the current candidate.
