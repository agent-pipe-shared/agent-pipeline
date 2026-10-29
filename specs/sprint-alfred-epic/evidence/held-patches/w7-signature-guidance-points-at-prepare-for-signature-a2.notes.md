# Held patch notes: slice A2, signature-mode denial guidance prints the one-command flow (CHECKPOINT)

Status: CHECKPOINT, continued by the Elephant on 2026-10-29. The production edits for all five sites are in the patch and the patch applies at the candidate
(`git apply --check` in an unchanged clone: exit 0). The Goldfish did not complete any test run within its budget; the Elephant then measured on fresh clones:
this patch alone turns `guard-human-override.test.mjs`, `copy-safe-command.test.mjs` and the ADR-0059 Decision 4 check in `codex-pretool-guard.test.mjs` red
(old-text pins), and the old-text pins are updated by the companion test-only patch `w7-signature-guidance-points-at-prepare-for-signature-a2-c2.patch`
(apply A2, then A2-c2, in ONE commit; evidence in its notes). With both applied the five new pin cases are green, and with the five production files reverted they are RED
(one per site). The "NOT done" list below is the Goldfish's original list; items 1 to 6 are answered by the c2 notes, items 7 (unused constant) stays open.

Base: candidate 1a62d60083d82e3d3c738e942faf3fc20903649a. Patch: `w7-signature-guidance-points-at-prepare-for-signature-a2.patch`
(7 files, 77 insertions, 93 deletions).

## Site inventory (rg for emit-signature-digest and external-proof, non-test files, at the candidate)

| Site | Lines (candidate) | Printed in signature mode before |
|---|---|---|
| hooks/guard-testpath.mjs | 337-343, 356-365 | prepare-authorization, emit-signature-digest, authorize-by-signature with `<external-proof.json>` |
| hooks/codex-pretool-guard.mjs | 607-630 | prepare-authorization, emit-signature-digest, sign-intent with `<intent-sha256-from-emit-signature-digest>`, authorize-by-signature with `<proof-path-from-sign-intent>` (no `<external-proof.json>`) |
| hooks/antigravity-pretool-guard.mjs | 978-999 | same shape as the Codex site |
| scripts/guard-human-override.mjs (render-copy-safe) | 382-391 | prepare-authorization, emit-signature-digest, authorize-by-signature with `<external-proof.json>` |
| scripts/repair-map.mjs | 132-165 | signature rows: plan, prepare-authorization, emit-signature-digest, authorize-by-signature with `<external-proof.json>` |

Recon lines re-verified (guard-testpath 337-365, human-override about 385-391, repair-map 135-165). Correction to the recon: the
`plan` output itself does not print the sequence; the sequence is in the `render-copy-safe` subcommand (about 365-392).
Not changed on purpose: line 52 usage text, the `emit-signature-digest` subcommand itself, the Guard Maintenance Window text.

## Changes (all in the patch)

- guard-testpath, codex, antigravity: signature continuation is now one sentence plus
  `guard-human-override.mjs prepare-for-signature --repo <root> --request-sha256 <sha>` rendered through the neighbouring helper.
  The sentence says the person receives exactly one sign-intent command and the agent imports the proof with
  authorize-by-signature by the full path that command writes. Chat-mode text untouched.
- guard-human-override.mjs render-copy-safe: signature steps are `[plan, prepare-for-signature]`; chat unchanged.
- repair-map.mjs: signature rows are plan, prepare-for-signature, authorize-by-signature (plan-sha and proof described in prose, no
  placeholder token); chat rows unchanged.
- Tests updated: `repair-map.test.mjs` AC-7 assertion replaced by the equivalent assertion on the new sequence (length 3, second
  argv `prepare-for-signature`, third `authorize-by-signature`, no `<external-proof.json>`); justification: PO decision 2026-10-27.
- New cases in the pin file (5): render-copy-safe behavioural case; one source-level case per hook site (three); one for repair-map.

## NOT done (remaining, exact)

1. RED run of the new cases against the unchanged baseline: not run. Order deviation: production edits were made before the
   new pin cases were written. Required: copy the new pin file into the unchanged clone2 and run it; expected RED for the 5 new cases.
2. GREEN run and whole-file baseline versus patched failing-name comparison for the pin file: not run.
3. Revert-one-site RED proof: not run.
4. The background run of repair-map, copy-safe-command, guard-human-override, antigravity, guard-lifecycle-ready and codex tests in
   the patched clone had not reported when the budget checkpoint hit; logs go to `scratch/agent-out/w7dp/green.*.log`.
5. Existing pins of the old text, expected to fail and still to be updated with justification: `guard-human-override.test.mjs` (14
   matching lines), `copy-safe-command.test.mjs` (2), `codex-pretool-guard.test.mjs` (4), `antigravity-pretool-guard.test.mjs` (1),
   `guard-lifecycle-ready.test.mjs` (1). Not edited yet. Other files also mentioning the old text and outside the allowed set:
   `guard-gate-strength.test.mjs`, `human-governance-ledger.test.mjs`, `project-onboarding-v3.test.mjs`,
   `governance-authority-resolver.test.mjs`; their pins must be checked, and a needed edit outside the allowed list is a scope stop.
6. VCR01 pin numbers in `harness/scripts/check-verify-case-completion.test.mjs`: not measured.
7. `generate-architecture-overview.mjs --check`: not run. Unused imports (`PO_HUMAN_APPROVAL_SCRIPT`) may remain in the codex and
   antigravity hooks; check lint.
8. Known baseline reds in `codex-pretool-guard.test.mjs`, case 7 and case 17, are expected in both trees and untouched.

## Proposed commit message

fix(hgo): print the one-command signature flow in the denial guidance instead of the former four-step sequence (slice A2)

## Operator flow

Apply the diff, `git add -u` with a path limit to the listed files, commit with `--no-verify`, stamp, install.
Protected-path classification observed: the hook files and scripts are plugin source paths (author-repair class); the repository
tree was not edited by this dispatch. An independent Critic review stays a parent-owned batch gate.
