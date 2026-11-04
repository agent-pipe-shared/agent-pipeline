# w199 — the remote identity case expects the typed local-only subject (candidate 19c, QG-04)

Found by the first Full Verify of the whole 19c chain; the suite is red in the main tree as well, so it predates the chain.

- `security-scan.mjs` `observeCandidate` returns, for a repository with zero remotes and no `--remote` name, a typed local-only subject: status `clean`, `destination: "local-only"`, `repositorySha256: null`. The push gate refuses that evidence. `security-remote-identity.test.mjs` case SRI001 still asserted "not clean" after `git remote remove`.
- The pin now asserts the typed subject (`clean`, `local-only`, no repository identity). The production logic is unchanged; the refusal of local-only evidence at the push gate is pinned elsewhere.
- Evidence on a work clone of the rehearsed chain: the suite 2/2.
