# D165 S2 held patch: Edit/Write dev-plan guard parity with the shell lane (D5)

Base: HEAD 29540db4de76a1fad7d2c65278c37d5c37e92614. Patch: `d165-s2-devplan-parity.patch` (git diff --binary, 3 files, +85 -4).

## Cause

`hooks/guard-devplan.mjs` kept its own exempt list (`DEFAULT_EXEMPT_PREFIXES` = docs/, specs/, .claude/, backlog/ at line 325, plus `isSanctionedCloseArtifact`, used at lines 537-541). `lib/guard-devplan-policy.mjs` `devPlanGateVerdict` (shell lane and staged-commit check) additionally exempts the AC-207 `ONBOARDING_SCAFFOLD_EXACT_PATHS` (.gitignore, AGENTS.md, pipeline.user.yaml) and `ONBOARDING_SCAFFOLD_PREFIXES` (architecture/, project/) at lines 340-341 and 534-535. The Edit/Write lane therefore refused paths the other two lanes allow. Recon line numbers re-verified against the clone: all matched.

## Change (parity only, nothing widened)

- `lib/guard-devplan-policy.mjs`: new exported `isOnboardingScaffoldPath(normalizedPath)` built from the unchanged lists (+13 -2 lines incl. doc comment); `devPlanGateVerdict` now calls it instead of the two inline `.some()` expressions (same boolean expression, same decisions).
- `hooks/guard-devplan.mjs`: import of `isOnboardingScaffoldPath` (line 151) and `|| isOnboardingScaffoldPath(normalizedPath)` added to `isExempt` (~line 540), still under `!touchesAuthority`.
- `hooks/guard-devplan.test.mjs`: 45 new `D165-S2` cases (+68 lines): Edit and Write of architecture/map/modules.json, AGENTS.md, pipeline.user.yaml allowed in draft, draft-authority, awaiting-approval and approved; Edit of lib/production.mjs and src/implementation.mjs still refused in all four; 13-row table comparing the predicate with `devPlanGateVerdict` (incl. negatives: README.md, architecture-notes.md, sub/AGENTS.md, sub/pipeline.user.yaml, tests/).

## Preimage SHA-256 (at HEAD)

- 33faa4f1d968216acc4a1d5fd47a9dd58d71cf708c658e96bd1ca7b10c6d6ddd plugins/pipeline-core/hooks/guard-devplan.mjs
- 8bc7094abcd1c140255815b4a086cc44b0b045a7513751eb21c2540471c9bc23 plugins/pipeline-core/lib/guard-devplan-policy.mjs
- 9913a24f1193ea96cb36f16720e47c17672372b5dbf916e607ce924c30570a86 plugins/pipeline-core/hooks/guard-devplan.test.mjs

## Counts

- Baseline at HEAD (before any edit): guard-devplan.test.mjs 86/86; kernel-closure 11 passed, 0 failed; lifecycle-coordination pin exit 0 (prints no count line). No case red at HEAD.
- RED (new cases, original code): 94/131, 37 of the 45 D165-S2 cases failed (24 allow cases, 13 predicate cases); the 8 "still refused" cases passed already, as expected.
- GREEN (after change): guard-devplan.test.mjs 131/131; kernel-closure 11 passed, 0 failed; pin exit 0.
- `git apply --check` of the final patch in a fresh clone of HEAD: exit 0. Clones deleted.
- No existing case changed; the lifecycle-coordination pin needed no update.

## Findings (not acted on)

- The AC-207 prefix `architecture/` also exempts `architecture/adoption-state.json` and `architecture/design-materialization.json` (state meant to be written only by scripts), and `project/` exempts all of project/. Per the briefing the contract is not narrowed here; the Edit/Write lane now matches it. Narrowing these is a separate decision.
- Parity also covers `.gitignore` and `project/*`, which the briefing did not name; they follow from "same lists as the shell lane".

## Proposed commit message

```
fix(guard): exempt the onboarding scaffold in the Edit/Write dev-plan hook (D165 D5)

The hook kept its own exempt list and refused architecture/, AGENTS.md and
pipeline.user.yaml before implementation, while the policy library already
exempts them for the shell lane and staged-commit check (AC-207). Export one
isOnboardingScaffoldPath predicate and use it in both lanes. No new authority.
```

## Operator flow (kernel paths)

1. `git apply specs/sprint-alfred-epic/evidence/held-patches/d165-s2-devplan-parity.patch`
2. `git add -u`
3. `git commit --no-verify` with the message above plus the required trailers (kernel path flow)
4. stamp
5. install
Then run the three suites once and the integrated Verify (Coordinator-owned).
