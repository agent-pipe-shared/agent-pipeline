---
schema: pipeline.backlog-item.v1
id: pipeline.signed-quality-package-route-is-not-agent-operable-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Live pilot of the signed quality package route (hotfix 10 package, intent f15f4f96), native Windows, 2026-10-04, feat/sprint-alfred, lifecycle implementing."
sprint: alfred
done_when: manual
---

# The signed quality package route is not agent-operable on native Windows

## Description

The first real use of the signed quality package route (the pilot with the
hotfix 10 guard change) exposed several defects that together made the route
unusable for an agent after the single PO signature, and forced a human
operator import.

1. **Misleading disclosure.** `po-human-approval.mjs sign-intent --request`
   for a quality package printed "no recorded request resolves ...
   HGO-RECORD-DIGEST-MISMATCH ... signs a guard-lift/guard-override (HGO/GMW)
   authorization". That text describes a different request type and misleads
   the PO about what is being signed.
2. **Backslash-rejecting guard lane.** The guard's dedicated materializer lane
   (`signedQualityPackageCommandAdmission`) rejects any command containing a
   backslash, so it can never admit a native-Windows path. The command then
   falls through to `GUARD-GATE-STRENGTH-SHELL` because it names
   `critical-human-proof.json`.
3. **Path spelling and permission bits.** `committedTrustPolicy` compared the
   output of `git rev-parse --show-toplevel` (`D:/...`) with the resolved root
   (`D:\...`) as strings, which failed on every native-Windows run with
   `QUALITY-PACKAGE-COMMITTED-POLICY-INVALID` /
   `QUALITY-PACKAGE-COMMIT-PROOF-INVALID`. The receipt check also applied a
   POSIX permission-bit test where the platform has none. Both are fixed by
   operator hotfix 11 (ported into source), which compares paths by physical
   identity and applies the mode-bit check only where the platform has it.
   The hotfix has no regression tests yet. The same verification code lacks a
   `nlink` check in `verifyQualityPackageCommitAuthorization`.
4. **Four operator steps.** After the signature the route is apply, then
   stage, then authorize, as separate steps with a strict ordering that the
   operator has to know; no single command performs them.
5. **Pre-commit backstop does not recognise a verified package.** The
   pre-commit backstop does not accept a signed package integration, so the
   commit of the package could only be imported by a human with
   `--no-verify` (commit 9067508a0).

## Triggering situation

Pilot of the signed quality package route with the hotfix 10 package on native
Windows, 2026-10-04.

## Affected artifact

`plugins/pipeline-core/lib/signed-quality-package.mjs`;
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
(`signedQualityPackageCommandAdmission`, gate-strength shell lane);
`plugins/pipeline-core/scripts/po-human-approval.mjs` (disclosure);
the pre-commit hook backstop.

## Proposal

- One agent-runnable command per package after the single PO signature that
  performs apply, stage and authorize in the right order and reports one typed
  result.
- The guard lane and the pre-commit backstop recognise a verified package
  (platform-neutral path handling, no backslash rejection), so no human
  `--no-verify` import is needed.
- A correct disclosure for the quality package request type.
- Regression tests for physical-identity path comparison and platform-gated
  mode bits, plus the missing `nlink` check; fixtures on win32 and POSIX.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
