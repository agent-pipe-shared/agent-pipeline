# GitLab read-access observation — imported Desktop evidence

The PO supplied a live Desktop/WSL observation of approved operator-local GitLab
read access on 7 September 2026. Its API requests were GETs; eleven returned HTTP
200. Project lookups by path and numeric identity agreed, and Git/HTTPS HEAD
readback exited 0. The observation records no project mutation or CI start.

The Nova coordinator validated the supplied artifact and exercised the production
GitLab target resolver against its operator-local boundary. It did not repeat the
API or Git requests. The sanitized import is
`scratch/gitlab-imported-read-evidence-20260907.json` and its validation script is
`scratch/validate-gitlab-desktop-evidence-20260907.mjs`.

| Binding | SHA-256 |
|---|---|
| Supplied observation artifact | `1a1f16ffa7803154b10d22b0bd0c732ed02f6e451792d57543d43bee4233a1fe` |
| Forge base URL | `e8259479a7ec5402a80d41327dd7669693ee3d1521901bbae95c900414beef33` |
| Project coordinates | `d0ce7a75fd296fe80a4dac9e97de400619fa4c0e17e65faff53716229156f81c` |

This supports the observed read-access cell under Sprint Nova PRD B4's permitted
operator-local authentication boundary. It does not establish all B4 operations,
B2 lease behavior, remote worker execution, CI success or a new Nova network run.
The earlier rejected credential cannot be conclusively identified from these
observations; its historical failure must not be assigned to a particular token
without evidence.

The current authorization permits reads only. Private project/account coordinates,
token identifiers and fingerprints, credentials and credential-storage paths are
excluded from this tracked record. No new key or broader permission is inferred
from importing this evidence.
