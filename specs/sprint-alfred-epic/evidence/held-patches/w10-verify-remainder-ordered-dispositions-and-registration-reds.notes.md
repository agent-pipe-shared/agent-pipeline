# Verify remainder: ordered onboarding dispositions and the reds left by the D223 and D216-A landings (held patch notes)

Patch: `w10-verify-remainder-ordered-dispositions-and-registration-reds.patch` (9 source files, no derived files; apply-check on `bf9b6f4e0` exit 0, also on top of the D227 held patch). Built only in scratch clones.

## What it fixes (each was a red or a rejected completion stream on the candidate 15 state)
1. `project-onboarding-v3-tests` was rejected by Verify with `VERIFY-CASE-COMPLETION-DISPOSITION`: the shards finish in arrival order, but the completion parser requires the DISPOSED records in the declared (sorted) case order. The parent now collects every shard's dispositions and records them in declared order after all shards ended (`project-onboarding-v3.test.mjs`, `runShards`). `check-verify-case-completion.mjs` binds that exact shape (four conditions, one `recorder.dispose(` call) and its pin test carries three mutations (fabricated pass at collection, fabricated pass at replay, arrival-order disposal).
2. `critic-dispatch-preflight-tests`: the augmentation row registered 86 case ids, the suite emits 89 (D216-A added three). Row extended by CDPF087 to CDPF089.
3. `guard-maintenance-window-kernel-closure-tests`: `lib/feature-package-registration.mjs` (D223) is imported by `session-critic-finalizer.mjs` and by `commit-msg-hook-install.mjs` (a sixth dynamic edge) but was not a never-liftable kernel path. Added to `NEVER_LIFTABLE_KERNEL_PATHS`, to the threat-model prose (GMWKC03) and to the dynamic-edge table of the closure test.
4. `codex-isolated-critic-protected-preimage-tests`: the pins of `harness/review-protocol.md`, `skills/critic-review/SKILL.md` and `templates/prompts/critic-review.md` were stale after `49eeb9ef6`. Re-pinned to the current bytes.
5. `pin-hgo-stale-capability-shadows-current-authorization-tests` (flake): the digest-order search tried 16 plans; measured 7 failing runs in 30 on the unmodified suite. Bound raised to 1024 (the loop stops at the first digest that sorts as requested); measured 0 failing runs in 40, then 12.

## Evidence
- Full Verify of the FINAL applied state (rehearsal clone `w17v`: HEAD `bf9b6f4e0` + this patch + the refreshed derived files, exactly what the apply script produces): 1144 steps, 0 red, exit 0. Earlier, the clone with fixes 1 to 4 (`w15c`) had 1143 green and one red = the flake of fix 5, which passes alone; fix 5 was proved by repeated runs (0 red in 52).
- Rehearsal clone on the current HEAD: patch applied, commit, `refresh-derived-files.mjs` (four derived files), then: kernel closure 11/11, preimage 5/5, case-completion checker valid (388 entries), checker pins 32/32, onboarding stream parsed by Verify's own parser against the literal policy: 240 of 240 pass.

## Apply
`bash scratch/po-apply-0.7-candidate14b.sh` (one source commit, one derived-files commit). Independent of the D227 patch; either order works.

## Not verified
Batch Critic, native Windows, PO acceptance.

## Observation (not fixed here)
`lib/signed-quality-package.mjs` reaches 239 modules in its import closure through `review-admission-read.mjs` (D216-A); the case was worked around in a test on HEAD, the cause remains. A leaf module carved out of `review-admission-read.mjs` fixed it in an earlier clone (`signed-quality-package-read.mjs`) but is not part of this patch.
