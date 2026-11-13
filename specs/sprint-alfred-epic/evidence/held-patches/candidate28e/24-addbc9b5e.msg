fix(package): carry the approved PRD and Spec at their approved path

Glossover consumer finding G7 (2026-11-13, hard blocker): the feature id
changed after the design (G1), so the approved PRD and Spec stayed in the
earlier dated folder under specs/. After the PO's approval the package
step of materialize-architecture and register-feature-package refused
FPR-VALIDATION-FAILED / "FTP-ARTIFACT-0/1: path must be canonical within
specs/<id>/"; no lifecycle.json, so every dispatch refused
CAC-REGISTRATION-INVALID. There was no sanctioned way out. PO decision
2026-11-13: the package accepts the approved path, plus a check before
the signature.

- lib/feature-package-topology.mjs: `featurePackageArtifactPath`, the
  one path rule: inside specs/<id>/ as before; for the prd and spec
  classes only, also a canonical path in another specs/ folder that is
  no feature package (holds no lifecycle.json). Used by the validator,
  the mutable auto-rebind and the reconcile plan; the refusal text
  names the exception for a PRD or Spec. The draft bootstrap keeps the
  strict rule.
- pipeline-state.mjs beforeSignatureEntryGate: new check
  `package-paths`; a planPath or specPath the package could not carry
  is refused with DAB-PACKAGE-PATH, naming the path and the repair
  (git mv into specs/<id>/, commit, submit-plan and present-plan again);
  no request is written.

Tests: feature-package-topology (an approved PRD and Spec in the earlier
folder validate; acceptance or evidence there, a path outside specs/,
an absolute, backslash or dot-dot path, and another feature's package
are refused with the named texts); design-approval-route e2e rebind 4
now runs the real register-feature-package after the approval of a
moved folder: the PRD and Spec are carried at the approved paths, every
other artifact under specs/e2e/, the accepted contract resolves; DABX014:
present-plan exits 2 with DAB-PACKAGE-PATH when the approved folder is
another feature's package, no request; 20/20. Without the fix rebind 4
fails with exactly the Glossover refusal (FPR-VALIDATION-FAILED,
FTP-ARTIFACT-0/1) and DABX014 gets a signing step.

AI-Assisted: true
Dispatch: stage-0 (elephant)
