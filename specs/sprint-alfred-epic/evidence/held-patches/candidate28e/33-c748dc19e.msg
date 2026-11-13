feat(design): register an approved Spec addendum in the feature package (ADR-0095)

The step after the PO's approval: register-feature-package.mjs
--add-spec-addendum <record> adds the addendum as an immutable,
non-authority design entry and its approval record as candidate
evidence. It registers only what a private PO approval already covers.

- lib/feature-package-registration.mjs addSpecAddendum: the record must
  be named by its own digest, its subject digest is recomputed from
  subject and candidate, the approved commit must carry the recorded
  tree and be an ancestor of HEAD, the addendum must hold the approved
  bytes at that commit and in the working tree, and a private approval
  of kind spec-addendum must match subject digest, commit, label, time
  and proof; the amended manifest must pass readSpecAddenda with this
  addendum applied (a record against a re-approved Spec is refused as
  superseded); registered once, a duplicate is refused; temp+rename,
  restored on a topology or envelope refusal; nothing is committed
- scripts/register-feature-package.mjs: the flag, usage and help route
- lib/guard/command-catalogue.mjs: the form is admitted with the same
  path rules as the other evidence forms

Tests: spec-addendum-registration.test.mjs SAR-01..08 (8/8; register
once, no private approval, addendum edited, record changed or forged,
superseded Spec, wrong path, approved commit not an ancestor, help);
catalogue pin 32/32; register readback, rebind-mutable, staging pin,
repair map 69/69.

AI-Assisted: true
Dispatch: stage-0 (elephant)
