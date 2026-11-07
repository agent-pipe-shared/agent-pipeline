# w256: ADR proposals are bound into the design package mechanically (candidate 20, G20-23 remainder)

Base: `eed1a325d` (the candidate-20 chain, slice clone `scratch/agent-out/s-adrbind`). Built by Goldfish C20-G2023-ADR-BINDING.
Criterion: AC-108 is the closest accepted criterion; PRD and Spec are unchanged. Held for candidate 20; the Elephant applies the patch to the chain
clone. New plugin files and guard files are plugin source: they follow the protected-source route. The patch does not apply to the real repository
(the chain is not applied there), that is expected.

## What

- **New sanctioned script `scripts/bind-adr-proposals.mjs`**: `--root <root> --feature <id> --carrier <design.md> --selection <po-selection.json>
  --draft <slug> [--draft <slug>...]`. From the `create-adr` drafts and the PO's selection file it writes, BEFORE the design review: one
  `prospective-chat-selection-<slug>.json` per draft and `prospective-architecture.json` (the manifest) next to the carrier, and the
  `pipeline-design-decision-bindings` v2 block inside the carrier (an existing block is replaced in place, its `architectureDecisions` and
  `modelPolicy` are kept). Every pre-bound digest is computed by the consumer's own functions. It prints the sorted `companions` list the
  design review receipt must carry and the files to commit. Numbers are consecutive from the next free number; ids are `NNNN-<slug>`.
  Re-running after `create-adr --refresh` replaces its own files; a file at one of its paths that is not its own is refused.
- **The PO's words are never authored here.** `--selection` names a JSON file `{attributedTo, selections:[{topic,text,adr?}]}` that the PO's
  reply was saved into. The script validates it (non-empty, no `REPLACE:` text, `adr` names a bound draft), copies `selections` verbatim and
  binds the file itself as the origin. Absent or malformed: refusal with the exact path, the exact shape and the next command. An entry with
  `adr` applies to that draft only, an entry without applies to all.
- **All-or-nothing.** The whole result runs through `inspectProspectiveArchitectureManifest` (the real consumer check) on exactly the bytes
  about to be written; only then are the files written (temp + rename, previous bytes restored on a failed write). A refusal leaves no file.
- **Shared derivation.** `lib/architecture-prospective-materialization.mjs` now exports `deriveAcceptedRecords` and `derivePredecessorSidecar`;
  the inspector and the generator both call them, so the formulas cannot drift (they were duplicated by hand in test 7.11 and the fixture).
- **(a) Superseding a predecessor that already has a sidecar.** The predecessor row may carry `sidecarPreimageSha256` inside the SIGNED
  manifest. The postimage is the existing sidecar with only `status: superseded` (own title/date/scope kept). `add()` accepts an existing
  target whose digest equals the signed preimage (`present:false`, target carries `preimageSha256`); any other bytes stay `TARGET-DRIFT`.
  `prepareApprovedArchitectureMaterialization` passes `preimageSha256` through and `publishArchitectureDesignTargets` replaces such a
  target only when `sha256(existing) === preimageSha256` (same lock, authority recheck, rollback restores the preimage). A predecessor without
  a sidecar keeps the old rebuild-from-Markdown path byte for byte. No signed payload format changes: the manifest is already a signed companion.
- **(b) `REPLACE:` placeholders.** The inspector refuses a draft with a line starting `REPLACE:` (`DDB-PROSPECTIVE-PLACEHOLDER-REMAINS`), so
  `present-plan` refuses it before the package can be signed; the binding script refuses it earlier with the repair (`create-adr --refresh`).
- **(c)** `architecture-baseline.mjs` `isMain` and the stale comment in `architecture-effective-decisions.mjs` (see the diff), and the test's
  own schema path, now use `fileURLToPath`.
- **Guard admission**: `BIND_ADR_PROPOSALS_SCRIPT` (constants) and `sanctionedBindAdrProposalsArgs` (closed argv, `--root` bound to the root,
  repeated `--draft`), pinned in `catalogue-admit-prescribed-lifecycle-verbs.test.mjs`. The `--companion` cap of the design-review-receipt
  admission was 8; one superseding ADR already needs 8 (design, traceability and 6 binding files), two ADRs need 12, so it is 32 (the signed
  SourceSet bound is 64).
- **Skill**: `skills/architecture-decision/SKILL.md` names the step as the route.

## Tests

- `scripts/architecture-baseline.test.mjs`: cases 7.12 (create-adr -> bind -> design review -> submit-plan -> present-plan -> approve-plan with
  a fixture signature -> materialize-architecture; accepted record, superseded Markdown-only predecessor, signed drafts unchanged, effective
  authority readable, `--validate` clean), 7.13 (the same with an accepted predecessor sidecar: the signed-preimage lane), 7.14 (refusals:
  missing selection, `REPLACE:`, malformed selection; nothing written, repair named). 7.11 is restated in place (QG-04): it first asserts the
  new placeholder refusal on the untouched template, then fills the Markdown and refreshes the digest; every later assertion is unchanged.
  RED run before any production edit: all three failed with `Cannot find module .../bind-adr-proposals.mjs` (exit 1).
- The fixture `lib/architecture-prospective-materialization.fixture.mjs` gets one optional `bindProposals` callback (default unchanged).
- The cases live in the baseline suite, not in the APM suite: APM case ids are registered in `harness/config/verify-case-completion*.json`,
  which is outside this patch's scope. If the Elephant prefers an APM case, the id must be added there by the Elephant.

GREEN in the slice clone (each alone, final state): `scripts/architecture-baseline.test.mjs` 35/35 (incl. 7.11 to 7.14),
`lib/architecture-prospective-materialization.test.mjs` 18/18 (APM001 to APM018 unchanged), `lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs`
27/27 (new case `C20 w256 bind-adr-proposals`: 2 admitted shapes, 20 refused near-misses, catalogue and real guard), and the shape check
`w256-c20-adr-binding.check.test.mjs` 3/3.

## Deliberately not changed

- No new PO ceremony or signature kind; the PO signs the design package once. No agent write grants `accepted` or `superseded`.
- `lib/path-spelling.mjs` and the separator-sweep sites. `harness/verify-suites.json`, the inventory and the case-completion policy files.
- The chat selection is the PO's words saved by the agent into the `--selection` file: the script cannot prove that file reflects what the PO
  said (no component can); the signed package shows the exact text to the PO before approval.

## Design choices and residual risk to review

- The `--companion` bound of the design-review-receipt admission was widened from 8 to 32 (a guard admission bound, not only a new admission).
  No pin on the old bound was found, but every pin that exercises that admission was not run.
- The predecessor preimage is bound by `sidecarPreimageSha256` inside the signed manifest, not by listing the old sidecar as a companion (a
  companion would collide with the output path). So `candidateProvenance` does not check that preimage against the candidate commit; the
  publish-time `sha256(existing) === preimageSha256` check under the state lock is what guards it. The row shape stays additive.
- `pipeline-state.mjs`: message text only (the `present-plan` refusal gains a repair sentence for the placeholder code), no logic.
- Test-first order: the fixture hook `bindProposals` (test scaffolding) was added before the RED run; no consumer or script edit preceded it.

## Not proven

`lib/architecture-prospective-companion.test.mjs` (shares the fixture and the inspector) and the other receipt-admission pins were not run;
live greenfield retest, Full Verify, Critic review, PO acceptance; Windows behaviour of the new script; the inventory rebaseline for the new
script (the Elephant's step).
