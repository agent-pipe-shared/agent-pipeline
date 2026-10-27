# Held patch notes: D41 evidence route printed by producer and registrar help (Slice G5)

Candidate: fe1d74284d8c5e4c5012249f53a6c1421f2c4259. Patch: `w7-d41-evidence-route-help.patch` (git diff --binary vs candidate, 3 files, 62 insertions).

## Cause
The evidence route (produce, commit, register, commit manifest, rerun preflight) existed only in the `CCA-DETERMINISTIC-UNAVAILABLE` refusal text. `critic-diagnostic-evidence.mjs --help` fell into the pairwise flag parser ("Missing argument value"); `register-feature-package.mjs --help` returned `FPR-ARGS`. Recon cited lines were re-verified against the clone and matched (producer usage at line 11, registrar argv checks lines 57-63, catalogue line 205-212).

## Changed lines
- `plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs`: exported `CRITIC_DIAGNOSTIC_EVIDENCE_HELP`; direct invocation with exactly `["--help"]` prints it and exits 0 (+12 lines, before the existing try block).
- `plugins/pipeline-core/scripts/register-feature-package.mjs`: exported `REGISTER_FEATURE_PACKAGE_HELP`; `runRegisterFeaturePackage` returns 0 after printing it when argv is exactly `["--help"]` (+13 lines). All other argv handling unchanged.
- `plugins/pipeline-core/lib/critic-diagnostic-evidence.test.mjs`: +37 lines, three new cases appended; no existing case touched.

## Tests
RED (clone, unchanged scripts, whole file): 2 fail, the two `D41 <script> --help prints the five-step evidence route and exits 0` cases (exit 2 vs 0 for the registrar). The third new case (`D41 malformed argv keeps its refusal codes and exit status`) pins existing behaviour and passes before and after by design.
GREEN (clone, patched, whole file): `ℹ tests 8 / pass 8 / fail 0`, exit 0.
Baseline (clone2, unchanged candidate, whole file): `ℹ tests 5 / pass 5 / fail 0`, exit 0.
Failing-name sets: baseline empty, patched empty; no pre-existing failure. Logs: scratch/agent-out/w7ee/{red,green,base}.critic-diagnostic-evidence.test.mjs.log (scratch, untracked).
Apply check in clone2 at the candidate: `git apply --check` exit 0.

## NOT done
- G4 (SKILL.md "Evidence route" paragraph): needs the protected digest pin; out of scope.
- `critic-dispatch-preflight.mjs --help` not inspected or changed.
- Catalogue admission (needs a stop-and-name): `plugins/pipeline-core/lib/guard/command-catalogue.mjs` `sanctionedRegisterFeaturePackageArgs` (line 205) requires `--root <root>` first via `exactRoot`, so a bare `register-feature-package.mjs --help` is not an admitted agent argv shape. Exact change: add `if (args.length === 1 && args[0] === "--help") return true;` before the `exactRoot` check (assuming the caller reaches this function for one-arg forms; verify the caller's arity gate). Not a slice file; the help works for operators and via Node regardless. The producer script is not catalogued here (not checked further).
- Independent Critic review remains a parent-owned batch gate; Full Verify and PO acceptance pending.

## Proposed commit message
`feat(critic): print the diagnostic evidence route from the producer and registrar help`

## Operator flow
Apply the diff (`git apply`), `git add -u -- plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs plugins/pipeline-core/scripts/register-feature-package.mjs plugins/pipeline-core/lib/critic-diagnostic-evidence.test.mjs`, commit with `--no-verify`, then stamp and install per the held-patch ceremony.

## Protected-path classification observed
None of the three patched files matches TP-1..TP-13 (`agent-obligations.md` section 2); no guard refusal was met editing them in the clone. The command catalogue is a guard surface and is not touched.
