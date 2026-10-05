# Critic record — HOOKREFRESH S1 / S1b / S5

- Review object (enumerated): `eb2478e24` (S1), `58e3f2b7d` (S1b), `c974ed27c` (S5 + S5b wiring + S5c phrase)
- Spec: `specs/sprint-alfred-epic/design/bootstrap-hook-refresh-design.md`
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime prompt); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: handed back at the 80 % checkpoint (call 20 of 24; 8 calls spent on guard refusals of read-only commands)
- Notes persistence: unavailable (no admitted write shape). This file is the Elephant's record of the returned report.
- **Verdict: withheld — partial review**

## Findings

### F1 — major: the S1 test writes fixture hooks wherever the machine's hooks path points, and never cleans up

`hook-refresh-detection.test.mjs` creates repositories with a bare `git init` (`:49-52`), does not pin `core.hooksPath`
locally or scrub `GIT_DIR` / `GIT_COMMON_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE`, resolves hook paths with
`git rev-parse --git-path hooks/<name>` (`:55-57`, honours `core.hooksPath`) and overwrites them (`:77-83`, `:218`,
`:230`, `:359`); no `rmSync` anywhere (`:25`). With a global/system `core.hooksPath` (a configuration the installers
explicitly support, `pre-commit-hook-install.mjs:60`, `pre-push-hook-install.mjs:21`) a run replaces the machine-wide
`pre-push` / `pre-commit` / `commit-msg` hooks with exit-0 shims, silently disabling the push-gate backstop; with an
ambient `GIT_DIR` it overwrites the enclosing repository's hooks and markers. The sibling test in the same review
object does it right (`clone-hook-readiness.rollback.test.mjs:20,27-29` scrub, `:32` local pin, `:36` containment
assert). Spec-ref: design §4 (pre-push is the git-level backstop; no clobbering of human work), §5 row S1; category 8.

### F2 — minor: plugin-tree digest computed once per installer, not once per preflight

The helper accepts an injectable `inspectSource` (`lib/hook-currentness.mjs:18-20`, `:26`) but no production caller
supplies it; the three `planInstall` signatures have no seam (`pre-commit-hook-install.mjs:865/885`,
`commit-msg-hook-install.mjs:391/407`, `pre-push-hook-install.mjs:638/658`) and `check-clone-provisioning.mjs:64`
passes only `rootDir`. S2's own "digest computed once" test cannot be met without reopening S1's files, breaking the
disjoint-slice plan (§5). Timing hint (hypothesis): live-root case 360 ms before, 1425 ms after. Spec-ref: §3.2 step 1,
§5 header and row S2.

### F3 — minor: the returned-refusal gap in S5 is documented only in the commit message; title overclaims

Only a throw from the commit-msg install is caught (`clone-hook-readiness.mjs:113-122`); a returned refusal ends as
`readback-failed` with pre-commit left installed. The body says "Known gap (disclosed)" without owner/due date/backlog
reference; the title "never leaves a half-applied state" contradicts this and the new ROLLBACK-FAILED path. Spec-ref:
`guardrails/quality-gates.md:87` (QG-06); category 9.

## Deliberately not flagged (summary)

S1 helper shared by all three installers; `refresh` only from `ready-to-upgrade` with `updateRequired`; foreign /
declined / modified / unresolved never project to `refresh`; mixed current+stale stays `ready` with `refreshAvailable`;
S5 rollback via the installer's own `applyRemoval` (refuses modified hooks, CHRB002), typed errors, cause preserved,
nothing pre-existing removed (CHRB006–008); scope (pre-push installer touch covered by §3.2.1); S1b allowlist addition
is not a weakening; authorship records match diffs, `Commit-Act: orchestrator` disclosed; no new dependencies; English.

## Trajectory — not verifiable (every matched claim consistent)

S1 red 21/40 → green 40/40; clone-provisioning 5/0 both; commit-msg 20/2 → 19/3 (GHS-SOURCE-DRIFT) → quiet identical;
S5 rollback red 4/8, green 7/8 (CHRB008), green2 6/8 (`refresh` under parallel edits), quiet 8/8; existing CHR 1/1.
Caveat: the pre-push failures are not all timing cases — `after-pre-push.log` fails with `GHS-SOURCE-DRIFT`; none of the
three pre-push runs is green. Missing: commit/tree identity in logs; artifact for "consumer-safe-paths 9/9"; the
pre-commit logs were not reached.

## Not reached

Registration of the two new test files (`harness/scripts/verify.mjs`, `check-verify-suite-registration.mjs`);
`pipeline-start-preflight.mjs` beyond line 1549; `plugins/pipeline-core/schemas/`; `applyRemoval` bodies
(`pre-commit-hook-install.mjs:984ff`, `commit-msg-hook-install.mjs:492ff`); the two pre-commit logs; ADR-0063 against
the scratch evidence locations.

## Briefing violations

None. Environment mismatches: CR-06-D persistence and the briefed CSPRNG/`mkdir` protocol are outside the admitted
grammar (`backlog/items/2026-10-06-critic-scratch-name-randomness-has-no-admitted-command.md`).
