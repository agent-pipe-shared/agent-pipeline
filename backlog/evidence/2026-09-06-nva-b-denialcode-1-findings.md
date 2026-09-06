# Neutral findings registry — NVA-B-DENIALCODE-1

Source: T1 Critic review (opus, max; functional-equivalent-read-only) of
commit `1b639a8a528c0e98f9d9625fbd42bef32d14627f`. Verdict: **FAIL**.

- **F1** (major): the commit's `Dispatch:` trailer resolves to FAIL under
  `dispatch-authorship-verify.mjs` — the bound record's `outcome` is
  non-terminal and it declares no `changedFiles`.
- **F2** (major): a bugfix submitted with no pre-fix RED artifact.
- **F3** (major): a "Verified" claim with no verify-script evidence artifact
  bound to the reviewed commit.
- **F4** (minor): downstream suites of a widely-consumed module were not run.
- **F5** (minor): the new Windows `2>nul` dialect branch has no test.
- **F6** (minor): a new code comment states a premise that does not hold as
  written.

## Disposition

The Critic's own one-line summary is the load-bearing fact and is repeated
here because it decides the remediation: **every major finding is about
evidence binding, not about the code.** The review established that the
change admits nothing new and refuses nothing new. Reverting is not
indicated.

**F1 — closed.** The record was completed to `outcome: "stopped-truncated"`
(a terminal value the verifier's own header describes as "a truthful account
of a run that stopped") with `changedFiles` covering both touched paths.
`dispatch-authorship-verify.mjs --commit 1b639a8a` now returns PASS. The
record states explicitly that it was completed by the orchestrator, that
nothing in its `report` is the dispatch's own account, and that it therefore
vouches for the file set and measured suite results only — never for
authorship. Writing a plausible-sounding dispatch report would have converted
an honest evidence gap into a fabricated one.

**F2 — closed.** RED captured at
`evidence/NVA-B-DENIALCODE-1-red-prefix.txt`: the two new tests run against
the pre-fix module in a detached worktree at `1b639a8a^`, exit 1. The
captured failure shows the `&&`-chained outside-root read producing
`GUARD-PARSE-UNSUPPORTED` where the test expects
`GUARD-READ-SCOPE-OUTSIDE-ROOT`. This also independently confirms the
corrected code in the backlog item and rules out the stale
`GUARD-OPERATOR-UNAPPROVED` reading.

**F3 — open, deliberately deferred to the candidate gate.** A verify run
bound to this commit is not being spent now: further commits are landing in
the same wave, and a gate bound to `1b639a8a` would be voided by the next
one. It is folded into the local-candidate gate run, where the binding is the
point. Until that run is green, no report may describe this work as verified.

**F4 — recorded, partially discharged.** The Critic itself ran the two most
likely downstream suites (`generate-agent-obligations`, `codex-pretool-guard`)
and found both green. The remaining suites are covered by the candidate gate
run under F3.

**F5, F6 — open, dispatched as a follow-up package.** Both are production-code
changes an Elephant does not write (EL-01): a test for the Windows dialect
branch, and a one-line comment correction naming the `operators.length` guard
rather than the `segments.length` one.
