# w100 — every critical signing kind mirrors its proof where the agent can read it (C18-11)

Apply order: this patch is a delta on top of w83 (it edits the same files). Apply w83 first, then this patch; it does not apply to a tree without w83.
Criterion binding: AC-262 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What

- `po-human-approval.mjs`: `criticalPushScratchArtifactPaths` becomes a thin wrapper of the new `criticalScratchArtifactPaths(repository, gitCommonDir, kind)`;
  `mirrorCriticalPushArtifacts` becomes `mirrorCriticalArtifacts(..., kind, ...)`. `authorize-critical` of every kind (deploy, publication, release-preflight,
  feature-package-reconcile, residual acceptance, push) now copies request, proof, authority and signer to `scratch/critical-<kind>-<name>-<fingerprint>.json`
  through the same code path, with the same scratch-directory and unlinked-regular-file checks. The push names are byte-identical. The mirror is a copy; the PO key directory stays the authority
  (`externalPaths` is unchanged). The kind must be a plain lowercase name.
- `formatHumanApprovalCliResult`: for a non-push critical authorization, the output carries `proofPath`, `requestPath`, `authorityPath` and `scratchMirror` (the four mirror paths), on a TTY (compact shape)
  and on a non-TTY (the full result plus the same keys). Paths only, never key material.
- `pipeline-state.mjs` (`reconcileSigningRoute` text only): the `--proof-request`, `--proof-authority` and `--proof` placeholders name the `scratchMirror` path to pass, with the key-directory path as the alternative.

## Tests

- `po-human-approval.test.mjs`: four new cases (deploy, publication, release-preflight, feature-package-reconcile): the mirror exists, names match, bytes equal the source, the external paths are unchanged. Written first and red (`result.paths` named the key directory), then green. 206 of 206.
- `po-human-approval.signing-handoff.test.mjs`: new case for the TTY and non-TTY path keys (6 of 6).
- Restated, not weakened (QG-04): N31r. The TTY non-push assertion now also expects `scratchMirror`; the non-TTY assertion used to equal the bare result and now equals the result plus the path keys. Its intent (the follow-on command can read request, proof, authority) is kept. The push assertions are untouched.
- `push-prepare.test.mjs` 90 of 90 (push mirror regression); `check-consumer-safe-paths.test.mjs` 9 of 9.

## Not changed / not proven

- What is signed, key handling, proof and request formats, refusal codes and every other function of `pipeline-state.mjs` are unchanged. `sign-intent --request` mirroring is unchanged.
- No pin of the reconcile route wording was added to a pipeline-state test (that test file is outside this slice's scope).
- The mirror file of one kind is overwritten by the next signing of the same kind in the same repository (as for push).
- Full Verify was not run.
