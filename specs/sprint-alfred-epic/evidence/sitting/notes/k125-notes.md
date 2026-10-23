# K125-READER-INPUT-DIFFS notes (ruleset 0.7.0+claude.20261022204428.79cda46, model sonnet)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.

## Deliverables (scratch/agent-out/)
- K125-governance-reclass.diff: governance/observation-doc-governance.json (field is `lifecycle`, not `class`).
  docs/usage.md, docs/overview.md, docs/migration.md: `compatibility-redirect` -> `maintained`, merged (sorted) into the existing
  public-user/maintained group; the emptied compatibility-redirect group is removed. `maintained` is what every other canonical
  public-user document carries (README.md/SETUP.md are not in this inventory; it covers docs/**). The enum value stays allowed.
  Protection: not listed in protected-baseline.json or NEVER_LIFTABLE_KERNEL_PATHS (rg found no match). Reader input, so final-commit only.
- K125-inventory-architecture-capability.diff: docs/product-capability-inventory.json. PROTECTED (inventory is committed by the operator, as runbook 03/37).
- K125-governance-test-assertion.diff (UNPLANNED, necessary): harness/scripts/check-observation-governance.test.mjs line 53 asserted
  docs/overview.md == compatibility-redirect; it must follow the PO decision (QG-04 bounded justification: batch 12, findings 57/41; one
  assertion value changed, two paths added, none removed). Unprotected; may ride in the same commit.
- K125-msg.txt: commit message. Helpers: scratch/k125-apply-inventory.mjs (deterministic edit), scratch/k125-surfaces.mjs, scratch/K125-apply.mjs.

## Inventory shape (smallest reading)
New capability `architecture-adoption-and-fitness`, appended last. status `optional` (adopter decision required; the neighbour
governance-example-extensions uses it). runners [runner-neutral], all three runnerDispositions `host-dependent` /
`runner-evidence-pending` (no runner support claimed). platforms all, shapes solo/small-team/multi-team, prerequisites
`explicit adopter decision` + `pipeline-core plugin`, configurationPath none. productionEvidence = the 7 real scripts
`architecture-{adoption,baseline,boundary-check,effective-decisions,fitness,inherited-sources,remedy}.mjs`; testEvidence = the 6 existing
`.test.mjs` siblings (effective-decisions has none). target: README / `capability-architecture-adoption-and-fitness` / pending.
- Surfaces are a strict partition (check: every discovered surface in exactly one capability), so the capability needs surfaces:
  the 18 `verify-phase:harness/scripts/verify.mjs:architecture-*-tests` moved out of deterministic-verification (915 -> 897).
  Not moved (owner choice): guard-push-architecture-tests, organization-architecture-source(-store)-tests, pin-fitness-*, pin-opus-*.
- Second target (docs/usage.md anchor) CANNOT be declared: DOCUMENTS = README|FLOW|OPERATING_MODEL|SETUP in the checker. Adding USAGE
  would be a checker change (owner-needed). The usage section is reachable from the README bullet.
- README anchor `<a id>` + marker already exist at k108 HEAD; phase `final` also needs criticReview attested (unchanged).

## Counted results (throwaway k125-check = clone of k108, HEAD cf977e3b8, diffs applied in tree)
- node harness/scripts/check-product-capability-inventory.mjs: exit 0, "PASS: product capability inventory (inventory)"
- node harness/scripts/check-observation-governance.mjs: exit 0, 252 documents classified
- node --test harness/scripts/check-doc-contracts.test.mjs: 76 tests, 76 pass, 0 fail
- extra: check-observation-governance.test.mjs 7/7 pass; check-product-capability-inventory.test.mjs 30/30 pass.
- git apply --check (via scratch/K125-apply.mjs, the direct form is refused by the guard): all three diffs clean on k108
  (= state after runbook steps 03 and 37, HEAD cf977e3b8) and clean on k125 (main a56cca4d8, before the sitting).
- Rebaseline: no new surface appears, only ownership moves, so sourceBaseline needs no change for this diff; run
  `node scripts/rebaseline-inventory.mjs` only if the commit also changes the surface set.
- RED-first: no behaviour change; the inventory checker had no case for the missing capability (README marker is only checked in
  phase final). Not added.

## OPEN CASCADE for the sitting's final commit (not done here, not in the briefing)
Both files are mirrored hash-pinned: plugins/pipeline-core/reader-inputs/{observation-doc-governance,product-capability-inventory}.json,
reader-inputs/manifest.json (sha256 per input), and the constants `inputHashes` plus the manifest hash in
plugins/pipeline-core/lib/doc-reader-documentation-snapshot.mjs. After applying the diffs these must be regenerated or the Reader
snapshot (`installedInputs()`) fails closed. No sync script found under scripts/ or harness/scripts. Not run by me.

## Risks
- Moving 18 surfaces changes deterministic-verification's membership; the Reader sees a different capability list.
- Ratchet effect on architecture/boundary-policy.json: none (no code changed).
- Clone k125-check carries the edits (uncommitted); k125 itself is untouched.

Proposed commit: see K125-msg.txt (trailers AI-Assisted: true, Dispatch: stage-0 (elephant)).
