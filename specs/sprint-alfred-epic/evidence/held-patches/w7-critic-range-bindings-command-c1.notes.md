# Held patch notes: w7-critic-range-bindings-command-c1 (slice C1)

Base: candidate 22e43947463e22cfd019af274343ca30f9ab8eee, no stacking. Patch: `w7-critic-range-bindings-command-c1.patch` (git diff --binary, new files via intent-to-add).

## Cause
No script derived the correction-input bindings of a Critic range (recon CRITIC-RANGE-BINDINGS-RECON-2026-10-28). Slice C1 adds the library, a thin CLI and eight cases.

## Changed files (patch)
- `plugins/pipeline-core/lib/critic-correction-input-bindings.mjs` (new): `deriveCriticCorrectionInputBindings({repoRoot, base, head})`, schema `pipeline.critic-correction-input-bindings.v1`, typed `CriticCorrectionInputBindingsError` (CCI-CALIBRATION, CCI-MIXED, CCI-RANGE, CCI-UNEXPECTED). Classification: project-state record = calibration `handover` path read at HEAD plus `pipeline-handover*.md` in the same directory; retained prior result = `evidence/critic/...` or `specs/<segment>/evidence/critic/...` (layout of session-critic-finalizer.mjs exportOutDir); else source. Per-commit `diff-tree -r -z -M --raw --no-textconv --no-ext-diff`, `cat-file blob` hashed in memory only. A rename/copy whose two paths fall into different classes is CCI-MIXED. A same-class rename is recorded as `renamed-from`/`renamed-to` versions with explicit absence.
- `plugins/pipeline-core/scripts/critic-correction-input-bindings.mjs` (new): `derive --root --base --head --out`; out must be `scratch/...`, written once (flag wx), no symlink crossing; extra code CCI-OUT and CCI-USAGE; success prints one JSON line (schema, digestSha256, counts, path), refusal prints {schema, code, detail} and exits 2.
- `plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs`: import line plus cases `CCI (1)` to `CCI (8)` appended before `registerTestCaseCompletion`. No existing case changed.

## Tests
- RED (unchanged clone, cases added first): log `scratch/agent-out/w7cs/logs/red.log`, whole file failed at import with ERR_MODULE_NOT_FOUND for the library (all eight new cases cannot run). Recorded as RED by module absence.
- A fixture defect in CCI (3) (mode change was lost because the commit helper re-adds the working tree) was fixed with `fs.chmodSync`; first GREEN run had 55 pass / 1 fail (CCI (3)); this is a fixture correction, assertions unchanged.
- GREEN (clone, whole file): 56 pass, 0 fail (`green2.log`). Baseline (clone2, unchanged): 48 pass, 0 fail (`base.log`). Failing-name sets: both empty; the only difference is the 8 new passing cases.
- Patch apply check in clone2 at the candidate: run via driver `check` (printed `apply-check exit` line in the dispatch report).

## NOT done / not verified
- Pin in `harness/scripts/check-verify-case-completion.test.mjs` line 171 (`critic-dispatch-preflight-tests`, top-level-assertions, 169): the count of `assert(` sites in the test file rises with this patch; I did not measure or update it (file outside the three allowed patch files). Operator must run that test and update only that number; I did not run it.
- Not run: `check-product-capability-inventory.test.mjs`, `generate-architecture-overview.mjs --check` (budget). They may demand entries for the two new files; unverified.
- The second recon rule (a class 1/2 path co-occurring with a source path "of the same file") is implemented only as the rename/copy cross-class refusal.
- Suite discovery: the file is registered as suite `critic-dispatch-preflight-tests` (pin list above), so Verify runs it; harness/verify-suites.json not touched.
- Protected-path classification: no protected path touched or hit.
- Independent Critic review stays a parent-owned batch gate.

## Proposed commit message
feat(critic): derive the correction-input bindings of a Critic range, with a project-state record role

## Operator flow
Apply the diff (`git apply`), `git add -u` with a path limit plus the two new files, `--no-verify` commit, stamp, install.
