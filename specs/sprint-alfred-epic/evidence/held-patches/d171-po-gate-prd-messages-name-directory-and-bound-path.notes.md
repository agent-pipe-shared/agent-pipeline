# D171 held patch: PRD gate refusals name the directory and the bound plan path

Item: backlog/items/2026-10-26-design-course-and-registrar-disagree-on-the-feature-directory.md (D24, Wanted 5).
Patch: d171-po-gate-prd-messages-name-directory-and-bound-path.patch (git diff --binary against HEAD 17e002a67; touches only plugins/pipeline-core/lib/po-gate-authority.mjs and po-gate-authority.test.mjs).

## Cause
`prdAuthority` refused with PO-GATE-PRD-CARDINALITY and PO-GATE-PLAN-PATH-MISMATCH using fixed sentences naming neither the feature directory, the bound `activeFeature.planPath`, nor what was found, so a planPath bound to a folder the PRD no longer lives in was undiscoverable.

## Changed lines (po-gate-authority.mjs, prdAuthority)
- Cardinality refusal (`prds.length !== 1`): same code, same leading sentence, then `Feature directory: <dir>; bound plan path: <planPath>; prd_*.md files found: N (<repo-relative paths, at most 5, then "and K more", or "none">).` For N = 0 it appends: `The bound plan path probably points at a folder the PRD no longer lives in; rebind activeFeature.planPath through the sanctioned revision route, not by moving files.`
- Mismatch refusal: same code and leading sentence, then `Sole PRD found: <path>; bound plan path: <planPath>.`
- Set-changed refusal, PRD_REPAIR, every code, control flow and check order: unchanged.

## Tests (po-gate-authority.test.mjs, one new check "D171 PRD gate refusals ..." with five collected cases, placed after the existing cardinality check)
- RED against unchanged production: D171-1, D171-2, D171-3 failed (D171-4 and D171-5 passed trivially, they guard absolute paths and unchanged leading sentences).
- GREEN after: all five ok; file exit 0, 71 ok lines.
- Baseline (HEAD, before edit): exit 0, 70 ok lines, failing set empty. Patched: exit 0, 71 ok, failing set empty. Sets identical (both empty). The file has no closed case-count pin (checked with rg).
- Other suites run on the patched clone, all exit 0: guard-maintenance-window-kernel-closure, po-gate-profile-publisher (10 ok), design-approval-route, plan-spec-state-v2, guard-maintenance-window. No other file asserts the old message texts (rg for the codes and sentences finds only the two po-gate-authority files). The remaining ~100 test files that merely mention po-gate-authority were not run, since no message text is consumed elsewhere.

## New message texts
- `The active feature directory must contain exactly one prd_*.md file. Feature directory: specs/feature; bound plan path: specs/feature/prd_feature.md; prd_*.md files found: 0 (none). The bound plan path probably points ...`
- `... prd_*.md files found: 2 (specs/feature/prd_child.md, specs/feature/prd_feature.md).`
- `The sole active PRD does not equal activeFeature.planPath. Sole PRD found: specs/feature/prd_feature.md; bound plan path: specs/feature/prd_absent.md.`
Only repository-relative paths; no absolute path, no file content.

## NOT fixed (stay open in the item)
Wanted 2 to 4: Phoenix apply planPath rebind, reopen-design preview, receipt rebind.

## Proposed commit message
fix(po-gate): name the directory and the bound plan path in the PRD gate refusals (D171 D7)

## Operator flow
apply the diff in the repository (git apply the .patch), `git add -u` with a path limit to the two plugin files, commit with --no-verify as the held-patch flow prescribes, then stamp and install.

## Review
po-gate-authority is a custody path: an independent Critic review stays a parent-owned batch gate. Full Verify and PO acceptance also pending.
