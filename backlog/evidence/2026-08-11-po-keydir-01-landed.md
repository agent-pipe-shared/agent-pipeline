# Evidence: PO-KEYDIR-01 landed

**Items closed:**
- `backlog/items/2026-08-10-po-key-directory-default-should-be-repo-scoped-not-machine-wide.md`
- `backlog/items/2026-08-11-shared-external-po-signing-directory-lets-an-unrelated-project-overwrite-a-proof.md`

**Closure commit:** `256033ebdc80ae5055e3fdfe96a8492d18a34c04` (cherry-picked from PO-KEYDIR-01's worktree commit `8a04490d15d318b62ff7b62be0f5d5dee95c2a97`)

## PO decisions

2026-08-11 ("leg mir Entscheidungen mit Optionen vor"):
- poKeyDirectory scope: "Jetzt umsetzen" — implement now, overriding the
  general signing hold-back for this specific, already-decided item.
- Signing-directory collision: "Proof-Dateinamen an Repo/Kandidat binden" —
  bind request/proof filenames to a repository fingerprint.

## Change

`plugins/pipeline-core/scripts/po-human-approval.mjs`:

**(A) Repo-scoped key-directory default.** New precedence for resolving the
approval directory when `--directory` is not supplied: explicit `--directory`
(unchanged) > a new repo-scoped remembered value, stored at
`<git-common-dir>/agent-pipeline/po-key-directory.json` (mirrors the existing
`human-guard-overrides` repo-local-private-state convention) > the existing
machine-plane `poKeyDirectory` (kept as a working fallback, now third not
first) > the existing `PIPELINE_PO_APPROVAL_DIRECTORY` environment variable
(unchanged, still last). `setup --directory X` now persists `X` into the
repo-scoped store instead of the machine plane; the machine-plane's own
`poKeyDirectory` field is never deleted, cleared, or stopped from being read.

**(B) Repository-fingerprint-bound artifact filenames.** `request`/`proof`/
`signature`/`intent`/`signer` filenames now carry a short segment derived
from `derivePoGateRepositoryFingerprint` (reused from `po-gate-authority.mjs`,
not a new fingerprint scheme) in addition to the existing `featureId`-based
suffix. `privateKey`/`publicKey`/`authority` (`po-private.pem`/
`po-public.pem`/`trust-policy.json`) paths are unchanged and unsuffixed —
deliberately shared per human identity across all of one PO's approvals from
one directory.

## Verification

```
$ node --test plugins/pipeline-core/scripts/po-human-approval.test.mjs
ℹ tests 48
ℹ pass 48
ℹ fail 0
```

Run directly against the integrated commit `256033eb` on
`feat/sprint-nova-codex-v046` (not only inside the dispatch's isolated
worktree). 48 tests total: all pre-existing tests still pass unchanged, plus
5 new `PO-KEYDIR-01(A)` tests (repo-scope precedence, multi-repo isolation,
no silent overwrite of a different remembered value) and 1 new
`PO-KEYDIR-01(B)` test (disjoint filenames for two repositories sharing one
external directory, shared key/authority files unaffected).

## Dispatch note

The first PO-KEYDIR-01 run truncated mid-edit (tool budget exceeded, its
dispatch-record `log`/`report` left empty, one uncommitted and unverified
change); resumed via a purely procedural message per the goldfish-task
template's truncation-recovery guidance rather than treated as failed or
restarted from scratch. Full dispatch log:
`evidence/dispatch-record-PO-KEYDIR-01.json` (local, gitignored).
