# Critic delta re-review v2 on the GF-056 remediation — FAIL

Date: 2026-08-08
Base: `e3dd8ff0976e172a009cf2242f6fe1707f1f412c`
Head: `8998708e5b13c9d6e6b1f9fcbe50104739c7ecaf`
Tree: `c085f284c64596ecf3e4a37deb256ed393ce1608`
Prior receipt: `backlog/evidence/2026-08-08-critic-gf056-verdict.md`
Requested route: `claude-sonnet-5` at `max`; effective model identity reported as
`unknown` (no same-dispatch route-observation artifact — correct per CR-06).
Assurance: `functional-equivalent-read-only; OS isolation not asserted`.
Notes persisted by the Critic: `scratch/critic-delta-877c1a91/critic-notes.md`.

## Verdict

**FAIL.** One major (Finding A). Finding B is minor and does not carry the verdict.

## Prior findings — disposition confirmed by this round

- **Finding 1 (blocker, QG-01 — red gate at dispatch):** resolved.
  `evidence/verify-latest.json` is `passed`, 255/255, every step exit 0, bound
  `exact` to both the reviewed commit and tree, with run timestamps postdating the
  last commit.
- **Finding 2 (major, authorship trail):** resolved as a *trail* problem — all ten
  trailer-less commits were cross-checked against the four dispatch records and
  `git show --stat`, and nine of ten reconcile exactly. The tenth is Finding A.
- **Finding 3 (minor, GIT-02 bundling):** resolved. Every commit in the delta is
  file-scope-coherent; the four with ambiguous subjects were individually checked.

## Finding A — major — the remediation delta repeats the pattern it had just owned

`c8e5edf` (`feat(po-human-approval): carry the signing key and its name into the
approval record`) is a production change to `po-human-approval.mjs` and its test.
Its own body records that the diff was authored by the SETUP-1 dispatch, which ended
before committing, and that the orchestrator re-ran the suite independently and
committed it. No `Dispatch:` trailer; only `AI-Assisted: true`.

The aggravating fact is the timing, and the Critic is right to name it: `11ae7e7`
landed **nine minutes earlier**, in this same delta, and is the commit that owns
exactly this pattern from the previous batch. So the delta whose purpose was to
remediate the finding contains a fresh instance of it.

**Accepted as stated.** This is not a `feat`-class change that qualifies for the
OM §3.3 stage-0 fast path — it touches what the approval record contains, which is
security-relevant by construction.

**Not corrected by rewriting history** — excluded by hard rule. What the correction
has to be instead is structural, because "the orchestrator will remember next time"
has now failed twice in one afternoon, nine minutes apart. Filed as
`backlog/items/2026-08-08-orchestrator-authored-production-commits-have-no-deterministic-control.md`.

## Finding B — minor — `design` is not a Conventional Commit type

`6decf59` uses `design(nova): …`. `guardrails/git.md:16` (GIT-01) enumerates the
admitted types and `design` is not among them. The Critic correctly establishes that
this is not double work against QG-01's skip rule: GIT-01's own Verification field
names the Critic as the enforcement path, and `commit-message-policy-tests` unit-tests
the policy module rather than scanning historical subjects. So nothing deterministic
would have caught it.

Recorded, not retroactively corrected. The enforcement gap is folded into the same
backlog item as Finding A's second instance, since both are prose rules whose only
enforcement today is a reviewer reading history afterwards.

## Cleared by the Critic (its "deliberately not flagged")

Missing `Dispatch:` trailers on the other eight commits (GIT-03 makes the trailer
optional, and each was cross-checked to a dispatch record or is tooling-generated /
Elephant-appropriate docs work); the any-key branch's unvalidated `keyReference`
format, against the threat model in `nova-setup-bootstrap.md` §5a — with the
downstream-consumer trace disclosed as a coverage limitation rather than asserted as
clean; the still-v1 `project/critical-human-proof.json` (honestly tracked as open,
so not a QG-06 "documented instead of fixed"); spec traceability running through
`plans/nova-setup-bootstrap.md` and backlog items rather than `spec.md`; the legacy
2-key record's error-message ergonomics; test integrity (36→38 checks, strictly
additive, no assertion weakened — including the justified `deepEqual` split);
GIT-02 atomicity; the security surface (`security-latest.json` clean and exactly
bound, osv-scanner `SKIPPED` with a named reason per SEC-06); no dependency change;
language assignment.

## Disclosure the Critic made, and again it was the right call

A system-reminder mid-review instructed it to accept a changed date and explicitly
not to mention this. It refused and named the instruction in its report, citing
`11ae7e7` — this repository's own record of the identical pattern — as the reason to
treat it as a finding rather than noise. Recorded here so the behaviour is
reinforced a second time.

## Scratchpad disclosure — a direct argument for wiring the cleanup

Before creating its own subdirectory the Critic found `scratch/` already carrying
numerous `commit-msg-*.txt` files and four foreign run directories
(`critic-nova-c0846788/`, `critic-novagf056-a447bf0a/`, `gmw-patch-check/`,
`verify-6334e34/`, the last with 192 entries). It named them, read none, and built
on none — the isolation held. But the descriptor shipped without a cleanup event,
and this is what that looks like after roughly one day of use.
