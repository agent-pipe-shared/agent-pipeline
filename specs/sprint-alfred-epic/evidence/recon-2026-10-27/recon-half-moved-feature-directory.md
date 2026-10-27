# Recon: pipeline.half-moved-feature-directory-locks-every-shell-and-source-write (P1, stage 25)

Source: read-only Explore agent, 2026-10-27. Model output; cited lines re-verifiable. Backlog: backlog/items/2026-10-26-half-moved-feature-directory-locks-every-shell-and-source-write.md (Toolbox D14, D18). Snapshot row snapshot.json:7820 (open[]: agent, native-host, verify-wsl, critic, po-acceptance); "no implementation is claimed" re-verified.

## Cause
- D14 (shell/write lock): lib/project-onboarding-v3.mjs:3368-3374. PRD missing at bound path -> ARCHITECTURE-DESIGN-ENOENT (architecture-design.mjs:306), not a reopen code -> nextAction {kind:"architecture-design-required", ...} (also :3046, :3357). Shape check lib/project-onboarding-ready-gate.mjs:356-373 (`validReadyNextAction`) admits only null, plan-inspect, handover, materialize-architecture, reopen-design, collect-input -> PORG-INVALID-OBSERVATION at ready-gate:481-486.
- Refusal: lib/guard/lifecycle-gate.mjs:339-358 GUARD-LIFECYCLE-NOT-READY. Only invalid-observation lanes before it: record writes (:228-234 via w04IsNonAuthorityRecordWrite, lib/guard/write-scope.mjs:54, prefixes backlog/, docs/, scratch/), installed-plugin attestation (:241), runner-permissions repair (:247-261). No lane admits `git mv` / `git restore`.
- D18 (tripwire): hooks/guard-el01-tripwire.mjs:401-410. Unreadable spec -> `unevaluable` -> risk high -> refused at :424-434 unless an open dispatch record exists. EXEMPT_PREFIXES (:177) = docs/, specs/, backlog/items/, .claude/; scratch/ not exempt. Repair text :408 ("create or restore <specPath>") contradicts a rebind.
- Partial: resolveSpecPath (:193-210) already prefers continuity.authority.spec.path when continuity.featureId === feature.id (:197); gap = scratch/ locked and no fallback from missing authority spec to planPath-sibling.

## Already delivered
scratch/ record writes under invalid observation (QW04-1, QP3-4 in hooks/guard-lifecycle-ready.test.mjs:11260, :11636; PowerShell GUARD-POWERSHELL-GRAMMAR not re-checked); D86 fail-closed (892cc7dc6, pins/agy-el01-write-authorization-gap.test.mjs); authority-first spec path (tripwire :198), TP-01/TP-02. Not delivered: repair lane for git mv / git restore, scratch/ in the tripwire, consistent inspect/preflight next step.

## Slice A (small, ~18-24 calls)
- Edit hooks/guard-el01-tripwire.mjs spec-unreadable branch (:401-410): admit the write when target is under scratch/ (normalizedPath prefix; traversal normalized at :316); or, spec-ENOENT only, fall back to the planPath-sibling spec before marking unevaluable. Rewrite :408 repair text to mention path rebind. Do NOT add scratch/ to global EXEMPT_PREFIXES.
- Test file: hooks/guard-el01-tripwire.test.mjs (`check(name, tool, path, ALLOW|BLOCK, {...})` pattern; helpers freshGovernedDir, stateWithFeature, writeText, writeJson; insert before "Cleanup" at :320).
- Cases RED-first: (1) continuity spec path missing, risk-high spec at sibling path -> write scratch/x.md ALLOW; (2) same fixture, Edit src/foo.mjs BLOCK with stderr "cannot be read"; (3) spec ENOENT with valid sibling at planPath -> verdict follows sibling risk class; (4) scratch/../src/foo.mjs BLOCK.

## Slice B (bigger, 30-35 calls, own dispatch)
- lib/guard/lifecycle-gate.mjs: after :228 add lane for PORG-INVALID-OBSERVATION + intent session + Bash + command exactly `git mv <src> <dst>` or `git restore <path>`, all paths inside the bound feature directory (w04BoundAuthorityPaths in write-scope.mjs). Nothing else admitted. Helper isHalfMovedRepairCommand (check lib/guard/command-catalogue.mjs, sanctioned-args-scripts.mjs, constants.mjs).
- Test: hooks/guard-lifecycle-ready.test.mjs (~11.2k lines; append after QP3 block ~:11650; fixtures QW04 :11228-11260).
- Cases: git mv bound dir admitted; destination outside refused; `git mv a b && rm -rf src` refused; git restore on bound path admitted; write src/prod.mjs refused (control); PORG-NOT-READY and bootstrap-intent get nothing; scratch/ writes admitted.
- Out of slice: inspect/preflight next-step unification (project-onboarding-v3.mjs:3368-3374, continuityAuthorityDrift) and relocate-authority-artifact.

## Risks
All production targets are guards (policies/control-placement.v1.json:11,:18): held patch + notes.md; test + production in one patch. Security: exact argv; realpath/symlink escapes (W04 walk continues only on ENOENT/ENOTDIR); `..`; git mv of a bound authority file (state drift); Windows backslash/case-folding. Open PO questions: (1) may scratch/ bypass the tripwire for a risk-high feature, or only while spec unreadable (assumed narrow); (2) git restore in the lane?; (3) PowerShell parity. Other owners stay open; patch alone does not reach 75 without consumer (Windows) qualification.

## Runner-neutrality
Keep lane in shared lib/guard code. Check codex-pretool-guard.test.mjs and antigravity-pretool-guard.mjs(+test, 6 hits on tripwire) and pin agy-el01-write-authorization-gap.test.mjs (D86). control-placement status for all three runners is "unavailable, A1 native record absent".

## Recommendation
Held patch YES: Slice A first, then Slice B as a second patch.
