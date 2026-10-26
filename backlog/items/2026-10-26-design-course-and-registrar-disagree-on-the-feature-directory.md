---
schema: pipeline.backlog-item.v1
id: pipeline.design-course-and-registrar-disagree-on-the-feature-directory
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P0
release: 0.7.0
sprint: alfred
source: "PO relay of the Toolbox consumer handover (Windows, 2026-10-26, findings D7, D15, D16, D17, D24): the design course wrote the PRD and Spec to a date-prefixed folder the feature package registrar rejects; the correction cost three signatures, one passphrase ceremony, one discard-feature and one new review round"
done_when: manual
---

# The design course and the feature package registrar disagree on the spec folder; the correction is disproportionately expensive

## Evidence (consumer, build 0.7.0+claude.20261026152532.b8a2ec6)

- The design course stored PRD and Spec under `specs/<date>_<slug>/` (here `specs/2026-10-25_modell-update-okt26/`).
  `register-feature-package.mjs` produced `FPR-VALIDATION-FAILED` / `CAC-REGISTRATION-INVALID` with
  `FTP-ARTIFACT-0/1: path must be canonical within specs/<featureId>/`. The registrar sets the manifest to
  `specs/<featureId>/lifecycle.json` (`feature-package-registration.mjs:193`); the topology validator requires every
  registered path inside `specs/<featureId>/` (`feature-package-topology.mjs:188-190`). A feature id with date and
  underscore is invalid (`SAFE_ID = ^[a-z0-9]+(?:-[a-z0-9]+)*$`). The plugin itself created `specs/<featureId>/evidence/`
  next to the date folder.
- D16: a copy or link under `specs/<featureId>/` does not help; the registrar reads `planPath`/`specPath` from the SIGNED
  plan (`feature-package-registration.mjs:227`), and symlinks are classified as `other` (`inspect()` `:70`).
- D15: the design review receipts bind `report.path`, `sources.prd.path`, `sources.spec.path`; moving the folder makes
  them invalid for `present-plan`, so a new readiness-review round is needed.
- D17: the plan path is bound twice (`activeFeature.planPath` and `continuity.authority.{prd,spec}`). After `reopen-design`
  and the move the state read `CONTINUITY-AUTHORITY-DRIFT` / `PLAN-LIFECYCLE-DIGEST-DRIFT`. `set-feature` is forbidden
  under active continuity (`pipeline-state.mjs:10935`). The only route is the Phoenix revision
  (`continuity-authority-revision-plan/-apply`, wrapper `phoenix-authority-revision.mjs`): proposal, `prepare`,
  `approve` (PO passphrase), `plan`, `apply`; then a new review round, `submit-plan`, `present-plan`, a second
  signature, `approve-plan`, `set-phase`. `reopen-design` has no dry run and silently voided the existing plan signature.
- D24: after a clean revision (3, drift `current`) `activeFeature.planPath` still pointed at the old folder; `submit-plan`
  failed with `PO-GATE-PRD-CARDINALITY` (`lib/po-gate-authority.mjs:874-887`: "exactly one prd_*.md" in the directory of
  `activeFeature.planPath`). The message names neither path nor cause. The whole Phoenix ceremony was without effect for
  that purpose. The only exit: `discard-feature --by <name> --reason <text>` typed by the PO, then
  `set-feature --plan-path <new path>`, plan, signature, approve (one more plan signature).

Total cost to change one folder name: 3 signatures, 1 passphrase ceremony, 1 `discard-feature`, 1 review round.

## Wanted

1. The design course creates `specs/<featureId>/` from the start (one directory rule shared with the registrar), or the
   registrar accepts the signed path and binds it without the folder rule.
2. The Phoenix apply sets `activeFeature.planPath` in the same transaction, or `po-gate-authority` derives the feature
   directory from `continuity.authority.prd.path`.
3. `reopen-design` prints beforehand what it voids (signature, receipts, reviews) and what the way back costs.
4. A path rebind with byte-identical content needs no new review round (receipts bound to hash, not path, or a
   sanctioned path rebind with a recorded reason).
5. `PO-GATE-PRD-CARDINALITY` names the directory and the bound path.

## Regression

Design course output registers without a move; a signed plan whose folder is revised by Phoenix apply submits without
`discard-feature`; byte-identical rebind keeps its receipts.

## Notes

Kernel paths (`feature-package-*`, `po-gate-authority`, Phoenix wrapper): held patches applied by the PO as operator.
The consumer asked for a one-signature migration command as a feature; recorded in the Toolbox friction item (D22).
