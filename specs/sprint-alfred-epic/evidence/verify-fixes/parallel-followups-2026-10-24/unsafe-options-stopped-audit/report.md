# CURRENT-UNSAFE-OPTIONS-QUALIFICATION — stopped

Targeted delivery: blocked. Nothing committed. This is a closing-allowance handover; original attempt and refusal costs retained, no budget grant or reset.

## Result and evidence

The official importer ran successfully at require_escalated from clone cwd: `node scripts/apply-diff.mjs` followed by the five exact absolute fixture paths from briefing field 2, in order. All five imports exited 0 as one sequential importer call. Candidate base: `6095f8e33940d4b3e34a0ea676abf506849c1fa2`; imported fixture Source is uncommitted and is not owned authored work.

`python3 scratch/agent-out/current-unsafe-options-qualification/bind.py` (absolute clone script path used from Main cwd) exited 0; machine-written `source-binding.json` reports all 27/27 paths matching declared bytes and SHA256. Its recorded manifest base is retained verbatim and distinct from the actual clone base. Binding was not captured through capture-evidence.mjs, so it is a source observation, not completed acceptance-check evidence.

Patch SHA256 values in original order: `a07e27991c9d83cd69eb35dfbad3d1872f4d68989ae0d742cf8911e25d51ee58`, `b01853eec332b928d27dd6acf320e86a6f790c87bb507de2420c616e0a3c044c`, `8781517c06c5a3457ede2f180007bf6c8db88c46846649d811a608fdd69ce215`, `dfe8d8d5d44f2ca84b0070fec6f050195ccd39fabaf23352e77d964643c4cf73`, `296574e872178687b115c31523d8276afc852c7a967dafc7477dd60ff826524f`. Four supplied hashes matched; the first was measured, not supplied as a contractual hash.

## Execution safety stop

The original pin defines `guard = (command) => isReadOnlyDiagnosticCommand(command, repoRoot)`. Its separate hermetic object is passed to direct passive-policy fixture calls, not to this guard closure. Shell guard read checks call passive-read policy with rootDir and recursive options, without machinePlaneRead/repoKeyDirectory injection. `isAllowedPassiveReadTarget` defaults these to `readMachinePlane` and `resolveRepoScopedDirectory`; lines 348 and 357 call them. `readMachinePlane` lines 138–149 checks and reads the real home-derived `.agent-pipeline/machine.json` when present. These are actual private runtime discovery/read effects, distinct from the synthetic credential fixtures. No private runtime file was opened by this task's own audit; only Source was read.

The pre-execution audit therefore did not establish the mandatory safety condition. No unsafe-options pin, delegated suite or consumer-path check was executed. Actual current pass/fail/skip counts and exits are unknown; historical 73 pass/1 Windows skip is not current evidence. Full selected callgraph audit remains incomplete. No assertion, examiner, production, registry or metadata changes were made to resolve this conflict.

## Preserved refusals

Two identical broad scratch-discovery attempts were refused with guard-lifecycle-ready ETIMEDOUT. Exact supplied host verify-audit recovery exited 0, status valid (entries 1997), between them. Subsequent exact scoped snapshot reads succeeded. A raw Git apply attempt was refused GUARD-TESTPATH-SHELL-FAULT (unbound patch targets); supplied recovery exited 0, valid (entries 2001). A wildcard rg read was refused GUARD-READ-COMMAND-UNSUPPORTED. An interpreter-based Source read was refused GUARD-TESTPATH-SHELL / opaque-interpreter-code, with override planning SDC-LOCK-HELD; standalone cat read subsequently succeeded. Refusal evidence is in tool results, not fabricated capture files.

## Open duties and scope

Retain stage 50; no qualification or stage change proposed. Project resource headroom unknown; no supplied measurement and no resource-report capture. No quick route configured. Native Windows spelling pending; independent security Critic with mutation/execution probes pending; preparatory/final integrated Verify/Security pending; PO acceptance open. No native/model attestation.

Only owned new scratch outputs: `bind.py`, `source-binding.json`, `report.md`, under the new clone's scratch/agent-out/current-unsafe-options-qualification/. Imported 27-path fixtures deliberately unchanged. Main and its staged package untouched. No owned Source diff or inert Source patch exists.

Committed: nothing committed.
Verified green: no acceptance suite; source binding 27/27, command above, exit 0, source-binding.json.
Remains undone: safe complete callback audit, unchanged original pin, consumer paths, capture-evidence artifacts, resource report, all parent-owned acceptance duties.
Recovery pointer: preserve same owner/outcome and imported fixture state; resolve how the unchanged pin may run within the original prohibition on actual private runtime/account reads, without weakening tests or production. Do not infer permission or a new budget from this report.

CONTINUATION CARD -- done: exact five fixtures imported, all27 postimages bound, private-runtime callback conflict identified; remaining: original acceptance qualification and captures; next step: resolve the bounded execution-safety conflict before running any original pin.
