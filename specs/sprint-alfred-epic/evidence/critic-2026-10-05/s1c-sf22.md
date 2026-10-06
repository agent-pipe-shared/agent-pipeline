# Critic record — HOOKREFRESH-S1c and FANOUT SF22 pin

- Review object (enumerated): `c1da25960` (HOOKREFRESH-S1c), `2a51a0356` (FANOUT-SF22t/SF22u)
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime prompt); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: interim hand-back at the 80 % checkpoint (20 of 24); notes persistence unavailable (this file is the Elephant's record)
- **Verdict: withheld — partial review**

## Findings

### F-A — major: QG-04 — the implementing dispatch wrote its own regression test (`c1da25960`)

HOOKREFRESH-S1c wrote the production change and the 17-case `hook-currentness.digest-once.test.mjs` in one dispatch and
commit; the body discloses it, but disclosure plus a backlog item does not satisfy QG-04 (`guardrails/quality-gates.md:71-72`).
The Critic read all 17 cases and found no tolerant or self-weakening assertion (red 4/17 → green 17/17).

### F-B — major: nothing registers the new suite (`c1da25960`)

At `c1da25960` no file other than the test refers to it; the sibling suites are staged in
`specs/sprint-alfred-epic/design/s2-package-1/test-registrations.patch`. Spec-ref: QG-07 (`:96`), QG-08 (`:100`).
Elephant note (not part of the Critic's report): the registration was staged after this commit in `7f717ad5d`
(REGPATCH7), outside the review object.

### F-C — minor: SF22's win32 bound is an upper bound, so "must drop to 0" lives only in comments (`2a51a0356`)

SF22 asserts `ledgerSide.length <= 4` (`stop-fanout.test.mjs:523-524`, bound at `:431`), green anywhere from 0 to 4;
the comment says it "PINS those spawns exactly" (`:359`). After the tracked fix lands, the test would still admit up to
4 spawns until someone lowers the bound by hand. Spec-ref: design §8 (`fanout-enforcement-design.md:408`), §3.6.

## Deliberately not flagged (summary)

"Once per `checkCloneProvisioning` call" is the S1-side half of "once per preflight" (preflight is S2's file); default
path unchanged without the parameter (`hook-currentness.mjs:55`, `check-clone-provisioning.mjs:67`); memoised faults
fail safe (`:62-63`); laziness and no cross-call reuse tested; scope matches the registry; existing tests unaltered;
SF22 keeps the git and outside-ledger assertions and adds stricter ones, bite at bound 3 evidenced; no new I/O, spawn or
dependency; English; records match committed files; trailers clean; consumer-safe paths allowlisted for tests.

## Trajectory — consistent (one side claim not verifiable)

S1c: red 4/17 (exit 1) → green 17/17; hook-refresh-detection 41/41 and check-clone-provisioning 5/5 before and after,
in order before the commit. Not verifiable: "consumer-safe-paths 9/9" in the S1c message (no S1c log). SF22: bite exit
1 (SF22 only, "at most 3 … observed 4"), green 23/23, csp 9/9, logs before the commit; off-win32 branch not observed
(disclosed).

## Not reached

`guardrails/global.md`, `guardrails/security.md`, `CLAUDE.md` at the commit, `project/pipeline.json`,
`check-suite-registration.mjs`, `quality-gates.md:88` and the QG-08 body, ignore status of the SF22u record,
`pipeline-start-preflight.mjs`, installer CLI argument handling, off-win32 spawn behaviour of `private-boundary.mjs` /
`windows-private-state.mjs`.

## Briefing violations

None. Disclosure: a `git grep` returned one line of an earlier Critic record; not used.
