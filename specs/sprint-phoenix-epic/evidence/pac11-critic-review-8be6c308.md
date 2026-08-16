# Critic review — P-AC-11, candidate `8be6c308`

**Verdict: FAIL.** One blocker, two major, two minor, and a trajectory check that
resolves *inconsistent*.

- **Range:** `0d3d9bcc7d8be92e27b6f22a2929f14884752ca9..8be6c308ffd5330efce855b3686019f58c9965db`
  (3 commits: `9352331d` model, `442036b3` design doc, `8be6c308` enforcement)
- **Spec:** `specs/sprint-phoenix-epic/acceptance.md` (P-AC-11, lines 409-412)
- **Stage:** T2. No enumerated T1 surface touched; `.claude/pipeline.json` declares no
  `riskZones`. The Critic recorded that both changed `.mjs` modules carry authorization
  semantics for external writes, so the classification sits close to the boundary.
- **Preflight:** `packet-ready`, governance wiring complete, no dispatch defect.

## Findings

### F1 — `ownedSections` and `changes[].field` are validated against different value domains (major)

`validOwnedSections` requires `TARGET_REF = /^[a-z][a-z0-9-]{2,63}$/u`
(`organization-policy.mjs:65`, pattern at `:19`), but the compared value
`desired.changes[].field` is validated by `ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u`
(`external-reference-adapter.mjs:20`, pattern at `:6`). The gate at
`external-reference-adapter.mjs:74` is a raw `includes` with no normalization.

Consequence: once a document class declares `ownedSections`, any legal field name
containing an uppercase letter, `.`, `_`, `:`, a leading digit, or fewer than 3 /
more than 64 characters is **unrepresentable in policy** and permanently rejected with
`policy-owned-sections` — indistinguishable from a genuine denial. `lifecycleState`,
`customfield_10001`, `body.storage`, `id` are all in that set, i.e. exactly the field
conventions of the issue-tracker and knowledge-base `systemClass` values the adapter
supports. Fail-closed in direction, so not a security hole; it makes P-AC-11's "owned
fields/sections" dimension unusable in practice.

Commit `8be6c308`'s stated basis is the false premise that the two are "directly
comparable". The new tests do not catch it: every field name used (`summary`, `status`,
`title`) lies inside the intersection of the two domains.

### F2 — the recorded reason for leaving `lifecycleEvents` unenforced is contradicted by the code (major)

`8be6c308` records that `lifecycleEvents` and `retention` "use disjoint vocabularies
for different concepts". True for `retention` (independently verified). **False for
`lifecycleEvents`:** four of six values are verbatim identical in both vocabularies.

- `organization-policy.mjs:26` — `LIFECYCLE_EVENTS = [proposed, active, completed, superseded, abandoned, retained]`
- `feature-package-topology.mjs:16` — `FEATURE_STATES` = `PLAN_LIFECYCLE_STATUSES` +
  `[verifying, completed, superseded, abandoned, retained]`
- shared verbatim: `completed`, `superseded`, `abandoned`, `retained`
- carrier available before the first external contact: `binding.identity` at
  `external-reference-adapter.mjs:79`, validated against `FEATURE_STATES` at `:26`;
  first `inspect` at `:80`

Self-contradicted inside the same diff: `organization-policy.mjs:23-26` states the field
"reuses the epic's OWN canonical lifecycle-state vocabulary verbatim (acceptance.md
V-AC-08)" — the opposite of "disjoint vocabularies for different concepts".

Charged under `guardrails/global.md` GL-08 (an unverified cause must not be presented as
established fact) as much as under P-AC-11: the justification would carry forward as a
settled investigation result.

### F3 — policy checklist item 8 NOT MET: four deferred gaps carry no owner and no expiry (blocker)

`lifecycleEvents`, `previewRequired`, `retention` and `conflictPolicy` ship declarable
and inert. The deferral is recorded only in `8be6c308`'s commit body and in a source
comment (`organization-policy.mjs:36-41`); neither names an owner or a date, and a
repo-wide search finds no backlog item, docs entry or register entry.

`governance/examples/policies/checklist.md:37-39` item 8 makes any NOT MET item blocking
by its own definition; `guardrails/quality-gates.md` QG-06 says a known gap with no due
date is a finding, not a mitigation. The Critic noted honestly that the checklist file
describes itself as generic fixture content, but ticked it as in force because
`.claude/pipeline.yaml:117-119` resolves it as this project's `policies_path`.

### F4 — the new gate trusts `entry.ownedSections`'s runtime type (minor)

`planExternalReferenceWrite` deliberately does not trust the caller-supplied policy
(`:64` coerces a non-array `documentClasses` to `[]`). The new `:74` calls `.includes()`
with no shape check: `ownedSections: "summary"` degrades ownership into a substring test
(`field: "sum"` admitted), and `ownedSections: null` throws a raw `TypeError` out of an
API whose every other failure is a typed rejection. Reachable only via a hand-built
policy — which is what the adapter's own tests use.

### F5 — `docs/organization-policy-packs.md` no longer describes the resolution failure modes (minor)

That document enumerates the merge algebra exhaustively (`:60-73`). This candidate adds a
third hard-fail path (`retention` must match exactly, including declared-versus-undeclared,
failing `OPP-RESOLVE-CONFLICT` at `organization-policy.mjs:196`) and two undescribed merge
rules (set intersection, ranked max). Doc untouched.

## Trajectory check — inconsistent

Consistent: the evidence artifact binds the exact candidate commit/tree (independently
re-resolved), and the recorded counts are arithmetically consistent with the diff.

Inconsistent, and all three are the Elephant's process errors, not the dispatches':

1. **The artifact is not the required evidence artifact.** It was model-authored with a
   custom schema (`pipeline.elephant-verification-observation.v0`) listing four
   `node --test` runs. QG-03: the verify script itself MUST write the artifact; a
   submission without a script-written one is unverified regardless of what the report
   claims. Expected: `evidence/verify-latest.json`, `pipeline.verify-evidence.v0`.
2. **The project's declared gate was not run.** `.claude/pipeline.json` names exactly one
   entry point, `node harness/scripts/verify.mjs`; it is absent from the recorded runs, so
   the gate state at this candidate is unknown — neither green nor red.
3. **One recorded run is red at the candidate** (`external-reference-adapter.test.mjs`,
   exit 1). The pre-existing-and-unrelated attribution was asserted in prose, not carried
   as a second machine artifact, so per GL-08 it stands as a hypothesis.

## Briefing violations observed

1. **Implementor rationale carried inside the evidence artifact.** An
   `openQuestionsForTheReviewer` block pre-empted a conclusion ("a deliberate design call,
   not an accident") and pointed at a commit message for reasoning. The Skill invocation
   itself was clean (paths/refs/metadata only), so the dispatch was not contaminated — but
   the artifact is the wrong carrier for a justification.
2. **Diff range bundles unrelated work.** `442036b3` (the journal-producer scoping doc) is
   not covered by the supplied spec path's criterion. Reviewed in full anyway; clean.
3. **Evidence-path convention.** The artifact sat under `scratch/` rather than the
   calibration's canonical `evidence/` location.

## Confirmed correct, deliberately not flagged

The Critic independently verified and endorsed: `retention`'s disjoint-vocabulary claim
(zero overlap — correct call); `previewRequired`'s no-enforcement-point claim (`preview()`
unconditional at `:83`); `conflictPolicy`'s no-enforcement-point claim (`:82` blocks
unconditionally); backward compatibility of all five additive keys end to end; the
non-record safety of the rewritten `entryKeys`/`freezeDocumentEntry`; the merge-direction
safety of `intersectOptional`/`orOptional`/`strictestOptional` across all combinations; the
declared-empty-versus-undeclared `ownedSections` asymmetry as a coherent fail-closed
reading; test integrity under QG-04 (both test files purely additive, nothing weakened,
skipped or retitled); no new dependency (SEC-04); no secrets or new logging; ADR-0011
language; and commit shape including trailers.
