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

**F2 — closed, and the finding rested on a false premise supplied by the
orchestrator.** This must be recorded plainly, because the error was mine and
it propagated into a Critic round.

The dispatch DID capture RED, in situ, before its fix:
`backlog/evidence/2026-09-06-nva-b-denialcode-1-red.txt` (exit 1), written
11:32, showing **both** new tests failing against the pre-fix module. It also
captured the matching GREEN. The orchestrator did not find these files —
they were written under `backlog/evidence/` rather than the `evidence/`
directory the briefing named — and then stated "No RED (pre-fix) evidence
artifact exists for this task id" to the Critic as a bare fact. It was not a
fact. F2 was raised on it, correctly given what the Critic was told.

Two consequences worth keeping:
- A "bare fact" asserted from an absence is only as good as the search behind
  it. An absence claim handed to a Critic should name where it looked.
- The orchestrator then re-derived RED independently
  (`evidence/NVA-B-DENIALCODE-1-red-prefix.txt`, a detached worktree at
  `1b639a8a^`, exit 1). The two artifacts agree, which is the one useful
  by-product: the reproduction is now confirmed twice, from two directions.
  The dispatch's own capture is the stronger of the two — in situ, both
  tests, no reconstruction.

Both artifacts confirm the corrected code in the backlog item and rule out
the stale `GUARD-OPERATOR-UNAPPROVED` reading.

**F3 — open, deliberately deferred to the candidate gate.** A verify run
bound to this commit is not being spent now: further commits are landing in
the same wave, and a gate bound to `1b639a8a` would be voided by the next
one. It is folded into the local-candidate gate run, where the binding is the
point. Until that run is green, no report may describe this work as verified.

**F4 — recorded, partially discharged.** The Critic itself ran the two most
likely downstream suites (`generate-agent-obligations`, `codex-pretool-guard`)
and found both green. The remaining suites are covered by the candidate gate
run under F3.

**F5 — closed by determination, no test manufactured.** The follow-up dispatch
traced the reachability question rather than guessing it. `windows === true`
and `isAdmittedRedirect === true` are individually reachable (e.g.
`certutil.exe -hashfile … SHA256 2>nul`), but the function's overall return
value cannot become `true` under the `windows-direct` dialect for any
currently-recognized executable on this host. Writing a test would have
required manufacturing an unreachable state, which the briefing named as the
wrong outcome. **Disclosed rather than buried:** on a native win32 Node
process — not WSL or git-bash — `path.basename` would split a
drive-letter-prefixed executable and the branch would become reachable in
effect. The determination is therefore scoped to the POSIX-basename host this
repository's tests and CI actually run on, and the win32 case is an open
design question, not a closed one.

**F6 — CLOSED AS A CRITIC FALSE POSITIVE.** The finding claimed
`isOutsideRootSingleCommandRead()` returns false on `parsed.operators.length
!== 0` *before* `segments.length` is consulted, making the new comment's
stated reason inoperative. That is backwards. Verified directly in the source
(`guard-lifecycle-ready.mjs:2979-2980`): the guard is one left-to-right
short-circuiting `||` chain in which `parsed.segments.length !== 1` is the
third operand and `parsed.operators.length !== 0` the fourth. For a
`|`-joined pipeline the third operand is already true and short-circuits, so
the comment names the operative reason correctly.

The dispatch stopped rather than "correcting" a correct comment, which is the
behaviour its stop condition asked for and the right one: a Critic finding is
evidence to check, not an instruction to comply with. No code change was made
for either finding, and none was warranted.
