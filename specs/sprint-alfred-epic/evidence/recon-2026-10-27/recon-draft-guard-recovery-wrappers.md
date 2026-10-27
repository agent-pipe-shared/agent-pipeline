# Recon: pipeline.draft-guard-blocks-the-sanctioned-recovery-wrappers (P1, stage 25)

Source: read-only Explore agent, 2026-10-27. Model output; cited lines re-verifiable. Backlog: backlog/items/2026-10-26-draft-guard-blocks-the-sanctioned-recovery-wrappers.md. Snapshot snapshot.json:7856-7890 (open[]: agent, native-host, verify-wsl, critic, po-acceptance). Backlog text partly stale.

## Cause
- Phoenix: lib/guard/command-catalogue.mjs:367-471 (`sanctionedLifecycleScriptArgs`) has no branch for scripts/phoenix-authority-revision.mjs; no PHOENIX constant in lib/guard/constants.mjs. lib/guard/devplan-shell-lane.mjs:120-128 classifies `node .../phoenix-authority-revision.mjs plan|apply ...` as opaqueScriptExecutionCandidate -> lane "opaque-script-execution" + forceLifecycleGate -> GUARD-DEVPLAN-SHELL in draft/approved.
- Usage gap: scripts/phoenix-authority-revision.mjs:11-12 parse() takes `plan|apply --repo-root --directory --proposal-file [--request-file --request-sha256 --lock-token]`; `plan` has no `--out`; `--lock-token` appears only in the throw message.

## Already delivered
- materialize-architecture ALREADY admitted: lib/guard/sanctioned-args-scripts.mjs:410 (D64, 2c637751f), pinned by lib/pins/devplan-lane-admits-the-producer-materialize-step.test.mjs (6a84c5a20). Backlog D3 remainder is stale.
- architecture-adoption propose|status|check|prepare, architecture-measure, architecture-fitness: D165-S1 (command-catalogue.mjs:313-370), tests hooks/guard-lifecycle-ready.test.mjs:12599-12698, applied 1bcce7add.
- `reopen-design` without --by stays refused (sanctioned-args-scripts.mjs:424, EL-36).
- No commit touches phoenix in lib/guard.

## Minimal slice: Phoenix `plan` only (read-only argv); `apply` stays refused (external-directory proof, mutates continuity authority = PO ceremony)
1. lib/guard/constants.mjs: add PHOENIX_AUTHORITY_REVISION_SCRIPT (fileURLToPath(new URL("../../scripts/phoenix-authority-revision.mjs", import.meta.url)), near ARCHITECTURE_ADOPTION_SCRIPT ~:197).
2. lib/guard/command-catalogue.mjs: import constant (:14); dispatch in sanctionedLifecycleScriptArgs (~:368) to `sanctionedPhoenixRevisionArgs(args, root)`: admit only `plan --repo-root <root> --directory <abs external dir> --proposal-file <repo-relative, no dot segment, under scratch/ or evidence/> [--out <scratch/... physical; reuse ADOPTION_OUT + adoptionPhysicalOut>]`, each flag once (matchFlagSpec). Refuse apply, --request-file/--request-sha256/--lock-token, unknown flags.
3. scripts/phoenix-authority-revision.mjs: add `--out` for `plan` (UTF-8 no BOM) and a printed usage line with `--lock-token <8-128 chars>`. Outside lib/guard: confirm it is not a kernel path before putting it in Goldfish scope.
- Test: extend hooks/guard-lifecycle-ready.test.mjs after :12698 ("D166-PH" block mirroring D165-S1 helpers; file ~12.7k lines) OR new small pin lib/pins/devplan-lane-admits-the-phoenix-plan.test.mjs (recommended by the recon; new file) patterned on the materialize pin, using devPlanShellRefusalHit with injected deps.
- RED cases (draft and approved): (1) plan --repo-root R --directory D --proposal-file scratch/p.json admitted; (2) same with --out scratch/plan.json admitted; (3) refused: apply; plan + --lock-token/--request-file/--request-sha256; foreign root; proposal outside scratch/evidence, absolute or `..`; --out docs/x; --out with `..`; repeated flag; extra positional; missing --directory; unknown flag; (4) other node script (phoenix-authority-approval.mjs) keeps refusal; (5) materialize-architecture stays admitted. Refusal cases are green before the change; only admitted cases RED.

## Estimate
22-30 calls; fits 35 if lib/guard edits are a held patch, not committed.

## Risks
- lib/guard/* is a kernel path: held patch with preimage SHA-256s, operator `git apply`, `git add -u`, `--no-verify` commit, stamp, install (D165-S1 flow). Re-run guard-split-contract.test.mjs and kernel-closure.test.mjs.
- `plan` must be confirmed read-only (pipeline-state `continuity-authority-revision-plan` not read by the recon; Goldfish must verify it writes nothing besides --out). Keep --out to physical scratch/ only.
- phoenix script runs `approve verify` first with an external --directory: admitting an absolute external --directory widens the lane; restrict to absolute, no dot segment, no NUL (or sibling under same user home): open design question for the PO.
- Other owners (native-host, verify-wsl, critic, po-acceptance) pending regardless.

## Runner-neutrality
Shared guard code, no runner branches. antigravity-pretool-guard.test.mjs also mentions opaque-script-execution: add or confirm one Antigravity pin that the same plan command passes. Use fileURLToPath/new URL pattern, no Claude-only paths.

## Recommendation
Held patch YES (lib/guard); script change may go direct if not kernel. Correct backlog text (materialize-architecture delivered) and reduce Wanted to: phoenix plan admission, --out, --lock-token documentation, plan-only regression.
