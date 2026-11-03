# w129 — the security scan has a typed local-only mode for a repository without a remote (candidate 19, D8)

Binds to the closest existing accepted criterion AC-108; the PRD and the Spec are unchanged.

## What it adds

- `security-scan.mjs`: when no remote name is given and the repository has zero remotes, `observeCandidate` observes the candidate as `clean` or `dirty` as usual with `repositorySha256: null` and the new typed field `destination: "local-only"`, so scanners run and evidence is written (exit as for any candidate). Every other candidate that observes a remote decision carries `destination: "remote"`.
  `remote-ambiguous`, `remote-not-configured` (including a given unknown name with zero remotes) and `push-destination-*` stay `unsupported` exactly as before. The zero-remote decision is one extra read-only `git remote` call inside `security-scan.mjs` (`hasZeroRemotes`), because `lib/security-remote-identity.mjs` (also used by guard-push, unchanged) does not expose the distinction.
- `sameCandidate` is now exported and also compares `destination`, so a local-only candidate is never equal to a remote-bound one (a snapshot re-observation in the same mode still matches itself).
- Human output prints `destination: local-only` and one sentence: security evidence for a local-only repository cannot be used for a push; configure a remote and rerun the scan.
- `hooks/guard-push.mjs`: one added typed refusal line for `destination: local-only` (the evidence was produced without a remote; configure a remote and rerun `security-scan.mjs --remote <push remote>` before pushing). The existing identity checks are untouched and still fire.

## Why

A purely local repository (`repository.mode: local`) got `remote-missing` and exit 2, so no security evidence could exist before a remote did. The destination binding (`repositorySha256`) that makes a push consume only evidence made for the same destination is not weakened for any remote-bound candidate.

## Checks

- Test-first: the new cases were run RED against the original code (zero remotes gave `unsupported remote-missing`, no `destination` field, no exported `sameCandidate`, no printed sentence), then GREEN after the change.
- `security-scan.test.mjs` passes in the clone (test-in runner, exit 0). New cases: zero remotes gives a clean local-only candidate; a remote-bound candidate carries `destination: remote` and a digest; two remotes stay `remote-ambiguous`; an unknown given name stays `remote-not-configured`; `sameCandidate` false between local-only and remote-bound; CLI prints the destination and the sentence; guard-push blocks local-only evidence with the typed line.
- The guard-push case lives in `security-scan.test.mjs` (spawning the real hook) because `guard-push.test.mjs` was outside the slice's briefed clone write scope (security-scan.mjs, security-scan.test.mjs, guard-push.mjs). `guard-push.test.mjs` itself was run alone in the clone with the change and is green. A test-file move into `guard-push.test.mjs` is optional later.
- One test harness correction in my own new CLI case: the child run keeps the ambient PATH (an empty PATH hides git, which made the candidate `unavailable`). No existing case was changed, weakened or deleted; no existing case pinned `remote-missing`, so nothing was restated. The pinned `unavailable` candidate shape is unchanged: an unavailable candidate carries no `destination` (nothing was observed).

## Not changed / not proven

- `lib/security-remote-identity.mjs`, the v2 evidence builder and any schema outside the three files are unchanged; the v2 input identity does not use `repositorySha256`/`destination`.
- No closed schema or validator outside the write scope refused the new shape in the paths read (evidence envelope, v2 builder, guard-push binding check).
- The full Verify and other suites that read the evidence shape were not run by this slice.
