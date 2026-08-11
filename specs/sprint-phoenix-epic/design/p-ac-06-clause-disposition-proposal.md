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

## PO decided, 2026-08-11: strike both clauses — landing is blocked on a fifth, newly-found gate

The PO picked "strike both" directly (option "legacy"-1 and "orphaned"-3
above), via a direct mobile question with this proposal in hand. The
amendment text was drafted and staged, then **reverted before committing** —
not because the decision changed, but because staging it exposed a real
structural blocker this proposal's step 2 above didn't anticipate.

**The drafted amendment (preserved here verbatim, so it doesn't need
re-deriving):**

> **Amendment for legacy/orphaned (PO, 2026-08-11).** The "legacy" and
> "orphaned" trigger words originally in this criterion's list above are
> struck, each for a proved reason, not an unfinished check. "Legacy" is
> provably unreachable: an artifact path is structurally confined to
> `specs/${id}/` by the validator's own `packageRelative` check, and a
> package under validation always has the `lifecycle.json` manifest that
> excludes it from `inventoryFeaturePackages`'s legacy classification — no
> input reaching this criterion's validator can ever be legacy
> (`design/p-ac-06-clause-disposition-proposal.md`, "legacy — investigation
> result"). "Orphaned" has no structural predicate the current manifest
> design can enforce: which files a manifest lists is a curatorial decision
> made when it was last edited, not a property the file itself carries
> (concrete counterexample in the same document, "orphaned — investigation
> result": `specs/sprint-nova-epic/lifecycle.json` lists `evidence/nova-b/*`
> as tracked artifacts while `evidence/nova-a/*` files of identical shape
> aren't listed at all, same package, no separating rule). The five
> remaining trigger words are unaffected and already pinned
> (`audit-bundle-core-tests`). A real "orphaned" check would need a
> baseline/grandfather mechanism the manifest schema does not have today —
> named as future scope in the same document, not attempted here.

Insert this as a new paragraph directly after the P-AC-06 bullet in
`acceptance.md` (matching the existing "Amendment for GMW (PO, 2026-08-08)"
precedent already in that file, under criterion H-AC-01), with the trigger
list itself edited to drop "legacy," and "orphaned," from the enumerated
words.

**Why it's not landed yet.** `specs/sprint-phoenix-epic/lifecycle.json`
tracks `acceptance.md` as an artifact with a recorded `sha256`
(`mutability: "mutable"`, so editing the *content* is expected by the
manifest's own model). But `validateFeaturePackage`'s digest-binding check
(`feature-package-topology.mjs:116`) verifies that digest **unconditionally**,
regardless of `mutability` — editing the file without re-syncing the
manifest's recorded digest turns `check-artifact-topology.mjs` (a
registered, currently-green Verify suite) red. Confirmed directly: staging
the amendment and running that suite reproduced the failure; reverting and
re-running confirmed clean (`findingCount: 0`) again.

The sanctioned fix is `pipeline-state.mjs feature-package-reconcile` — built
for exactly this (P-AC-08, this session's earlier "PHX-WP-GATE" work).
It requires `deps.featurePackageReconcileApproval`, a PO-bound proof check
in the same shape `continuity-authority-revision-apply` uses for
`deps.authorityRevisionApproval` — i.e. the same signature class as the
GMW window, which stays postponed tonight (PO answer 1). Worse: per this
session's own recorded P-AC-08 finding (independent Critic FAIL, F3), **no
shipped CLI entry point actually supplies that dependency** — the command
is structurally uninvokable as shipped, test-file-only. **Hand-editing the
recorded digest is explicitly refused as a bypass** (`P-AC-08`'s own case
`RGf` tests exactly this and rejects it) — not attempted here, on the same
principle this session held all night for `pipeline-state.mjs`'s TP-5
gate.

**Net: the decision is made and durable (this document); landing it needs
either (a) the GMW-class signature once `feature-package-reconcile` has a
real CLI-invokable approval path — which is itself P-AC-08's own remaining
gap, not yet fixed — or (b) an explicit, PO-authorized one-time exception
to the manual-digest-edit rule.** Neither was attempted tonight. Whoever
picks this up next has the exact amendment text above ready to paste; the
only remaining work is the digest-reconciliation route, not re-deriving the
content decision.
