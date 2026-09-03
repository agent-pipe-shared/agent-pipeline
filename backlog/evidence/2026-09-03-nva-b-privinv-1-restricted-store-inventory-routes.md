# Restricted-store inventory vs. the Spec: what is true now, and the routes to fixing it

Dispatch: `NVA-B-PRIVINV-1`. This document decides nothing and changes no
contract. It measures the current tree against the claim in
`specs/sprint-phoenix-epic/design/privacy-review.md` §3 rule 11, and lays out
routes to reconciling contract and tree, each with its cost, its risk, its
approver, and the gate it passes through. No route below was invoked, drafted,
executed, or recommended over the others while producing this document — no
`feature-package-reconcile` or `feature-package-rebind-mutable` command was
run, and no Spec or design text was edited. The choice among routes, if one is
made, is the Product Owner's.

## 1. Does the premise still hold? (re-measured against current tree, not inherited)

**Yes — unchanged since the finding was filed against candidate `4defe09`.**

Method:

1. `git rev-parse HEAD` at the start of this dispatch: `f8c8932b380eb5c5c094f7d22a6cd01a85339215`.
2. `git merge-base --is-ancestor 4defe09ece85721747f039036356ef80aed1b084 HEAD`
   exits 0 — the filed-against candidate is an ancestor of the current tree;
   this is a forward continuation of the same state, not a divergent branch.
3. `git diff 4defe09...HEAD --stat -- specs/sprint-phoenix-epic/spec.md
   specs/sprint-phoenix-epic/design/privacy-review.md` — empty output. Neither
   bound document has changed a single byte since the finding was filed.
4. `git cat-file -e HEAD:<path>` for all three named files — all three still
   exist at HEAD (no error from any of the three checks):
   - `plugins/pipeline-core/lib/human-decision-attribution.mjs`
   - `plugins/pipeline-core/lib/human-decision-attribution.test.mjs`
   - `governance/schemas/human-decision-attribution.schema.json`
5. `rg -n "human-decision-attribution" specs/sprint-phoenix-epic/spec.md` —
   zero hits, confirmed directly against the current file (not inherited from
   the Critic's report). Read `spec.md:390-438` (§§7.3-7.4) in full: the
   inventory lists `human-governance-decision.schema.json`,
   `human-governance-ledger.mjs`, `human-governance-decision.mjs`, and
   related files — none of them is `human-decision-attribution.*`.
6. Checked for a **new** restricted-store file that the item does not name:
   `git diff 4defe09...HEAD --stat --diff-filter=A` scoped separately to
   `plugins/pipeline-core`, `governance/schemas`, and `docs` (three files
   named in rule 11 include "documentation files"; the first pass had missed
   this class and was widened before concluding). Six files were added since
   the candidate: `guard-push-release-tag-ancestry.test.mjs`,
   `rebase-authority.mjs`, `rebase-authority.test.mjs` under `plugins/`, and
   three ADRs (`0077`, `0078`, `0079`) plus four `docs/state-archive/` entries
   under `docs/`. `grep -l "restricted-machine-local\|restricted storage\|
   restricted-store"` against all of them returns no match, and
   `rebase-authority.mjs`'s own header (read in full) self-describes as a
   side-effect-free rebase-authority resolver, not a store. No further
   restricted-store file has appeared.

Conclusion: the premise is unchanged. This is a confirmation, not a
rediscovery — evidence gathered independently against current bytes, not
carried forward from the 2026-08-31 report.

## 2. The three files, named, with the self-identification quoted verbatim

**`plugins/pipeline-core/lib/human-decision-attribution.mjs`** (lines 3-9):

> "Closed-shape validation for the restricted machine-local attribution record
> (GMW/HGO design D-1, increment 2). This is the record H-AC-11 describes as
> the "separately protected machine-local decision record": it is never
> admitted portably (governance schema/store enforce `storageProfile:
> "restricted-machine-local"` only, see governance-event.mjs and
> governance-event-store.mjs)..."

**`governance/schemas/human-decision-attribution.schema.json`** (`description`,
line 5): "The restricted machine-local attribution record (GMW/HGO design D-1,
increment 2). Never admitted portably -- the governance schema and store
additionally require storageProfile 'restricted-machine-local' for this
payload."

**`plugins/pipeline-core/lib/human-decision-attribution.test.mjs`** (line 3):
"Unit tests for the restricted attribution record validator (GMW/HGO D-1)."

None of the three is named in `spec.md` §§7.3-7.4 (`spec.md:390-438`), the
inventory rule 11 points at. Confirmed by direct `rg` against the current
file (§1.5 above), not inherited.

## 3. The baseline already in force (not a fourth route — the reference point the three routes are costed against)

The PO already exercised a decision on 2026-08-31: "Disclosed and accepted
unremediated for the 0.6.0 release" (`scratch/strip-privacyinv.md`, "PO
decision" section; identically in
`specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md`
under "PO disposition"). Two measured properties of that baseline matter for
what follows:

- It is **scoped to "for the 0.6.0 release"** — its own text ties it to one
  release, not a standing acceptance.
- The backlog item carrying it is still `status: open`
  (`scratch/strip-privacyinv.md` frontmatter). A time-scoped deferral that
  the ledger still marks open is not a resolution; it is the status quo the
  three routes below are measured against, not a fourth route to it.

## 4. What decides feasibility: the two bound documents are not in the same lifecycle class

`specs/sprint-phoenix-epic/lifecycle.json` binds a sha256 digest for both
documents, but with materially different mutability:

| Artifact | `class` | `authority` | `mutability` |
|---|---|---|---|
| `specs/sprint-phoenix-epic/spec.md` | `spec` | `true` | `immutable` |
| `specs/sprint-phoenix-epic/design/privacy-review.md` | `design` | `false` | `mutable` |

This is not incidental. `plugins/pipeline-core/lib/feature-package-topology.mjs`
implements two distinct rebind paths, and the comment at its
`autoRebindMutableArtifact` function states the design intent directly:
mutable-class entries get a "lightweight, non-PO-gated resync"
(`PHX-WP-MUTABLE-ARTIFACT-AUTOREBIND`); "`immutable`/`append-only` entries are
never touched by this helper... requiring the PO-signed
`feature-package-reconcile` ceremony... for any digest rebind -- that
separation is the entire point, so this check is the one hardcoded class test
and is never made configurable" (`feature-package-topology.mjs:64-72`).

Concretely, in `plugins/pipeline-core/scripts/pipeline-state.mjs`:

- `feature-package-reconcile` is in `ALWAYS_REQUIRED_KINDS`
  (`pipeline-state.mjs:3776`) — a PO-bound, attributed, signed ceremony is
  required every time, unconditionally, for an `immutable`-class artifact like
  `spec.md`.
- `feature-package-rebind-mutable` (`pipeline-state.mjs:7072-7114`) is, by its
  own header comment, "a deliberate, standalone, operator/Elephant-INITIATED
  command... with no preview digest to defeat and no approval gate to bypass"
  (`pipeline-state.mjs:7054-7063`) — for a `mutable`-class artifact like
  `privacy-review.md`, an Elephant can invoke it directly; no PO signature is
  structurally required for the digest bookkeeping.

This asymmetry is the fact that decides which of the three routes below is
mechanically cheap and which is mechanically gated — but see §6: mechanically
cheap is not the same claim as "does not need a human decision."

**An adjacent measured fact, not folded into the table above because it does
not change the gate:** `lifecycle.json`'s own `"state"` field reads `"draft"`
at the top level, even though the backlog item, the Critic review, and
`docs/state.md` (the Phoenix-line checkpoints are archived; Nova is now the
authoritative line) all describe Phoenix as a closed/historical epic. This
does **not** change Route A's gate — `FTP-ARTIFACT-2`/the reconcile
requirement fires on the artifact's own `mutability: "immutable"` field, which
is independent of the package's `state` field, per
`feature-package-topology.mjs`'s validation logic. It is flagged here as an
open item for the dispatcher because the PO's stated deferral rationale
("retroactively rewriting a closed epic's digest-bound authority record")
characterizes the epic as closed while the manifest's own `state` field does
not say so — a discrepancy in the record, not a claim that Route A is
therefore cheaper than described.

## 5. Three routes

### Route A — amend Spec §§7.3-7.4 to list the three files

Add three rows (or extend the existing `human-decision`-family group) to
`spec.md`'s §7.4 table naming `human-decision-attribution.mjs`,
`human-decision-attribution.test.mjs`, and
`governance/schemas/human-decision-attribution.schema.json`, matching the
pattern already used for the neighboring `human-governance-decision.*` and
`human-governance-ledger.*` rows (`spec.md:413-417`).

- **Cost:** editing bound Spec text (a text change to an `authority: true,
  mutability: "immutable"` artifact), then a mandatory PO-signed
  `feature-package-reconcile` ceremony (plan → prepare-authorization →
  external signature → authorize-by-signature, the same structural shape as
  the guard-human-override ceremonies) to rebind `spec.md`'s digest — this
  step is `ALWAYS_REQUIRED_KINDS`, no profile lowers it.
- **Risk:** retroactively rewriting the text of a Spec that the design's own
  privacy gate (`privacy-review.md` §5) treated as fixed at review time.
  Phoenix is now the historical line (Nova is authoritative per
  `docs/state.md`), so this edits dead-branch history rather than
  live-in-flight Spec text — lower practical downstream risk than editing a
  Spec still being built against, but still a retroactive change to what a
  passed privacy review was bound to.
- **Approver / gate:** Product Owner, by construction — `spec.md` is
  `authority: true`; the reconcile ceremony always requires a PO-bound
  signature (`pipeline-state.mjs` `ALWAYS_REQUIRED_KINDS`).

### Route B — relocate the restricted-store surface into already-inventoried files

Rule 11 names the destination categories directly: "event-envelope,
capture-policy, human-decision, event-store, `governance-event` CLI, and
documentation files already listed." The "human-decision" category's
already-inventoried file is `plugins/pipeline-core/lib/human-governance-decision.mjs`
(`spec.md:424`, "create closed decision taxonomy and lifecycle-link
validation"), with `governance/schemas/human-governance-decision.schema.json`
(`spec.md:413`) as the matching schema destination. Folding the attribution
validator and its schema into those two files is the concrete version of this
route.

- **Cost — higher than "move a file," measured, not assumed:**
  - The kernel keys on the exact schema string `"pipeline.human-decision-attribution.v1"`
    at two enforcement points inside `governance-event.mjs`
    (`governance-event.mjs:171` — the allowed-schema list for the `human`
    family; `governance-event.mjs:180` — `payloadSchema ===
    "pipeline.human-decision-attribution.v1"` gates the
    `restricted-machine-local` storage-profile check). Folding the file does
    not by itself require changing this string — the schema identity and the
    file location are independent — but the merge has to preserve it exactly,
    or the kernel's discrimination rule silently stops firing.
  - `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs:26` imports
    `ATTRIBUTION_TIME_BUCKET_MS` and `validateHumanDecisionAttribution` by
    path from `./human-decision-attribution.mjs` and re-uses the schema
    string at two more call sites (`:786`, `:802`) — a real consumer, not
    just the test file.
  - `plugins/pipeline-core/lib/guard-maintenance-window.mjs:262` lists
    `plugins/pipeline-core/lib/human-decision-attribution.mjs` **by exact
    literal path** inside what its own surrounding comment
    (`guard-maintenance-window.mjs:248-251`) describes as a trusted
    kernel-path allowlist populated from "every entry... imported, directly
    or transitively," from four trust-anchored files. Moving the file means
    updating a security-relevant trust allowlist, not just an import
    statement.
  - Net: this is a coordinated, multi-file change across at least four files
    (the destination `.mjs`/`.schema.json` pair, `guard-authority-ledger-intake.mjs`,
    `guard-maintenance-window.mjs`'s allowlist) plus their test suites — real
    engineering work, closer to a scoped refactor with a trust-boundary
    surface than a file move.
  - This task did **not** verify whether any already-persisted on-disk
    restricted-machine-local record encodes the file path anywhere (as
    opposed to only the schema string); if one does, that would add a data
    migration to this route's cost. Not confirmed either way — flagged as
    unverified, not asserted.
  - No `spec.md` or `privacy-review.md` digest is touched by this route on
    its own — code files are not lifecycle-bound artifacts
    (`lifecycle.json`'s `artifacts` array holds only `prd`/`spec`/`acceptance`/
    `design`/`result` classes, no code). No reconcile or rebind ceremony is
    structurally required for this route by itself.
- **Risk:** ordinary refactor risk (behavior regression across four-plus
  coordinated files) plus the trust-allowlist surface named above — an error
  there is a security-relevant miss, not just a broken import.
- **Approver / gate:** implementable at Elephant/dispatched-Goldfish level
  with no lifecycle digest ceremony required, but this is privacy-relevant
  restricted-store code — the repo's standing self-application rule
  (`CLAUDE.md`, "Self-application"; ADR-0014) still routes it through an
  independent Critic review before PO acceptance of the changed shape, the
  same contract this exact surface already received once
  (`privacy-sweep-critic-review-4defe09e.md`).

### Route C — narrow rule 11's own claim in `privacy-review.md` to what the design can actually guarantee

Edit §3 rule 11's text (and/or its closing sentence, "No separate
restricted-store implementation file is authorized by this design") to state
what is actually enforced — e.g., that restricted-store discrimination is
enforced by kernel schema/profile checks (`governance-event.mjs:171,180`)
rather than by file-location enumeration — instead of a location claim the
tree has now falsified twice.

- **Cost — lifecycle bookkeeping is the cheapest of the three:**
  `privacy-review.md` is `mutability: "mutable"`, so its digest resync runs
  through the same non-PO-gated `feature-package-rebind-mutable` path
  described in §4 — an Elephant-invokable command, no external signature
  required for the digest step itself.
- **Risk — highest of the three, despite the lowest mechanical cost:** this is
  the route that weakens the contract at exactly the place it was breached,
  rather than fixing the inventory or the code to match the contract's
  original claim. It also touches the same document F2 lives in
  (`privacy-sweep-critic-review-4defe09e.md` — the §5 sign-off is bound to a
  superseded candidate `643c7d06...`, not `4defe09` or later); §5 already
  states "a fresh bounded re-review before the design can reach the Product
  Owner gate" is required, so any edit to this document naturally reopens
  that requirement, and F2's remediation could ride on the same reopening.
  Routes A and B leave `privacy-review.md` — and F2 — untouched.
- **Approver / gate:** the digest mechanics are mechanical (§6), but the
  *decision* to narrow what a blocking privacy contract promises is squarely
  a Product Owner decision on the merits, most naturally paired with the
  fresh Critic privacy re-review §5 already demands (independent of whether
  that re-review is cheap to obtain).

## 6. Mechanical vs. human decision — kept distinct per route, not blurred

- **Route A:** mechanically PO-gated (the reconcile ceremony is
  `ALWAYS_REQUIRED_KINDS`) *and* substantively a PO decision (retroactively
  rewriting Spec text). Both axes point the same way.
- **Route B:** mechanically ungated at the lifecycle-digest layer (no bound
  document changes, so no reconcile/rebind ceremony fires) — but *not*
  therefore free of human decision: it is privacy-relevant restricted-store
  code, so the standing self-application rule still requires an independent
  Critic review before PO acceptance. The absence of a lifecycle gate must
  not be read as the absence of a human decision here.
- **Route C:** mechanically the cheapest (Elephant-invokable, non-PO-gated
  digest resync) — but the content decision itself, softening a blocking
  privacy contract's own guarantee, is unambiguously a Product Owner decision
  on the merits. Cheap bookkeeping does not make the underlying decision
  cheap or automatic; this is the row most at risk of being misread as
  "mechanical" if reduced to which CLI command fires the digest rebind, so it
  is stated explicitly.

## 7. Mitigating context, carried forward rather than dropped

Both facts below were independently verified by the reviewing Critic, not
inherited by that Critic from the backlog item or from this document:

- The implementation itself is privacy-conservative: closed nine-key shape,
  no correlator fields, day-bucketed time, `restricted-machine-local` profile
  enforced in-kernel at `governance-event.mjs:180`.
- The build was an authorized, tracked increment —
  `backlog/items/2026-08-18-h-ac-11-restricted-profile-intake-record-is-design-increment-2.md`
  is `status: closed`, sourced to a PO amendment of 2026-08-17. This is
  contract drift, not rogue implementation.

This is a finding about the contract's truth, not an allegation about the
code or its authors.

## 8. What the recurrence implies about inventory-by-enumeration as a control

Rule 11 exists because the first correction re-review FAILed partly on "five
new restricted-store files exceeded the Spec inventory"
(`privacy-review.md:171`). This is the same defect recurring a second time,
against the same rule written specifically to close it. Three things follow
from that, from evidence already gathered above, not as a recommendation:

- **Both occurrences were authorized, tracked work**, not rogue
  implementation (§7). The control is not catching unauthorized changes; it
  is failing to keep its own inventory current against legitimate, approved
  increments. Its failure mode is "makes a false claim about conforming
  work," not "misses an actual violation."
- **Nothing enforces rule 11 mechanically.** No guard, hook, or test compares
  the restricted-store files on disk against the Spec §§7.3-7.4 table; both
  occurrences were caught only because a commissioned Critic happened to
  `rg` for the module name across the Spec documents. Detection is
  incidental to a commissioned review, not continuous, and detection latency
  has been one full release cycle, twice.
- **Its truth decays with every authorized increment**, and the artifact
  that must be re-edited to keep it true (`spec.md`) sits behind the
  heaviest gate measured in this document (§4: `ALWAYS_REQUIRED_KINDS`,
  PO-signed). The control's maintenance cost is highest exactly where its
  accuracy matters most, which is a structural reason to expect exactly this
  kind of drift to recur under an enumeration-based rule, regardless of which
  route is chosen this time.
- By contrast, the property the Critic actually verified as real and durable
  — kernel enforcement of `storageProfile: "restricted-machine-local"` keyed
  on the payload schema string (`governance-event.mjs:180`) — is a
  predicate the kernel checks on every event, not a table a human has to
  remember to update. It does not decay the way an enumerated file list does.
  This is stated as an observation about the control class the recurrence
  exposes, not as a proposal to adopt it in place of rule 11.

## 9. Method note

This document was produced without editing any file under `specs/`,
`plugins/`, or `governance/`, and without invoking `feature-package-reconcile`,
`feature-package-rebind-mutable`, or any other lifecycle-mutating command.
Every claim above cites the exact command or exact file/line read to produce
it.
