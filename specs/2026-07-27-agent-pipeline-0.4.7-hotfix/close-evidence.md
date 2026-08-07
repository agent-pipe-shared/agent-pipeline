# Close evidence — Agent Pipeline 0.4.7 hotfix

## Stage-1 candidate

- Commit: `afdfcb0a019f96ee4831f23f80e7d50413136ef3`
- Tree: `0aee5c59a0fefb7ae0d33532cc7c306f772bd232`
- Full Verify receipt SHA-256:
  `99198fcf3ae1b4eb3a16c40e7d4a7da4eb280bcacced8d51e89411803b7da1ce`
- Security receipt SHA-256:
  `a020f029815b14bd3b788e9884d56117be0a16fac49d61424fffc36e2209fe8f`
- Full Verify: exit 0.
- Security: CLEAN; Gitleaks 0, Semgrep 0, license findings 0. OSV
  truthfully reported that no package sources were present.

## Close-entry verification

- Continuity State: 95/95.
- Result-to-close CLI: 5/5.
- Pipeline State: 306/306 at the host-authorized boundary.
- Close Coordinator: 32/32 at the host-authorized boundary.
- Product-capability inventory checker: PASS.
- `git diff --check`: PASS.

The Result is bound to Continuity revision 21 and `nextAction: close`. The
Result-to-close transition changes only the Result authority, revision, resume
and queue action, is CAS/digest-bound, and has a zero-write replay.

## Remaining exact-candidate gates

This evidence authorizes semantic feature close only. It does not claim a
final candidate, publication, tag, GitHub Release, Issue mutation, or remote
readback. After tracked close effects receive their final commit, that exact
commit and tree still require fresh Full Verify, Security, independent T1
Critic review, anonymous-public-SSH publication authorization, and isolated
remote readback.
