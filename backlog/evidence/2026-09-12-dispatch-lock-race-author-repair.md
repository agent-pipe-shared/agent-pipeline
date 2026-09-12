# Dispatch-budget lock race attended Author repair — 2026-09-12

- Route: attended Author repair; ADR-0058 marks `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` permanently non-liftable, so a GMW cannot authorize this edit.
- Human confirmation: the terminal operator entered the exact token `APPLY-DISPATCH-LOCK-RACE-FIX` before mutation.
- Candidate preimage commit: `b7ec4210b4b918d7c16fc18954c55710775bdb16`.
- Candidate preimage tree: `aba32e7d821955a3aa049c363ab6c02d01acce77`.
- Reviewed patch SHA-256: `c7fd706e59f34b5974b82569528ce3ca52b3e0c8ce56d99e9287d3d363bd249e`.
- Guard preimage SHA-256: `eba6a60804338c139e947d44b7e1108b20618d53005d655e12da24054018b77c`.
- Guard postimage SHA-256: `8271bbb5d0ff35fa6534a16c966fa2c8712012579301d5976ea87fbc00cb3a3c`.
- Test preimage SHA-256: `702c224e14caf8bed7eba2f425ba9d724d1bcefb69ffda75b478396a3c516343`.
- Test postimage SHA-256: `23238c5b1a2577f7940d9c89a67fdf2b593bc5b661e42b87d23eb946cfc3ced5`.
- Trigger: release-mode Full Verify run `verify-1789246046858-5cae3fd75e1ed19c` observed one of sixteen concurrent authenticated calls fail with `counter-lock-malformed`.
- Repair: the exact two-link hard-link publication interval and an absent path during release are classified as retryable contention; all other unsafe or malformed persisted states remain closed.
- Verification before commit: the 49-case dispatch-budget guard suite ran five times; Verify case-completion, documentation contracts and `git diff --check` passed.
- Scope exclusion: no push, tag, publication or release was authorized.

The Author route currently has no cryptographically signed event equivalent to
the GMW request/grant/revoke chain. This note records the attended action
honestly. The owned, dated remediation is
[`pipeline.author-repair-route-has-no-signed-event-chain`](../items/2026-09-12-author-repair-route-has-no-signed-event-chain.md),
assigned to the Pipeline in Nightwing and due 2026-09-30.
