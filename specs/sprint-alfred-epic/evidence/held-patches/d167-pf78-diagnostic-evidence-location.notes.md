# D167 PF-78 held patch: Critic diagnostic evidence location

Slice W6-D167-PF78-DIAGLOCATION-C2-20261026, candidate 4669d34ae2433377ff1a759d287cd2b6f6b4745b. Patch: d167-pf78-diagnostic-evidence-location.patch (sha256 a5d70078283ad9238a182ab6c04ed07747203768b8e8da5faf7d93d0907462b0, 16422 bytes; `git apply --check` exit 0 in a fresh clone of HEAD). Clone state was verified at the start (HEAD = candidate, only the two test files modified).

## Cause
The producer (`newDiagnosticPath`, producer line 40, CLI line 27) accepted only `evidence/...`; the registrar `pathProblem` accepted only `specs/<featureId>/evidence/...`. No path satisfied both, so a produced diagnostic could never be registered and admission always lacked deterministic evidence. Fix: one shared predicate `diagnosticEvidenceLocation(path)`.

## Changed lines (patch contents)
- lib/critic-diagnostic-evidence.mjs: `fail(code, message = code)` gains an optional message (code unchanged); new exported `diagnosticEvidenceLocation` (`evidence/<rest>` -> `{featureId:null}`, `specs/<id>/evidence/<rest>` with id `^[a-z0-9]+(?:-[a-z0-9]+)*$` -> `{featureId:id}`, else null, built on `diagnosticPath`); `newDiagnosticPath` uses it (CDI-OUTPUT-PATH, message names both prefixes; symlink and existence checks untouched).
- lib/critic-diagnostic-producer.mjs: import; `logPath.startsWith` replaced by the predicate (CDI-CAPTURE-INPUT); non-null `fullVerifyPath` must satisfy the predicate (CDI-PATH) before `readDiagnosticArtifact`.
- scripts/critic-diagnostic-evidence.mjs: import; `out.startsWith` replaced by the predicate. Usage text line 11 NOT edited.
- lib/feature-package-registration.mjs: import; `pathProblem` accepts only `diagnosticEvidenceLocation(path)?.featureId === featureId` (bare `evidence/` refused); FPR-DIAG-PATH message names `specs/<featureId>/evidence/`, the producer flags `--log` and `--out`, and "copy the full-verify evidence byte-identically there and pass it with --full-verify". Code unchanged.
- Tests (both existing registered files): lib/critic-course-admission.test.mjs (chainFixture, 2 D167-PF78 cases), lib/critic-diagnostic-evidence.test.mjs (D167-PF78 (1) and (4)).

## Preimage SHA-256 at HEAD
- plugins/pipeline-core/lib/critic-diagnostic-evidence.mjs, producer, scripts and registration hashes: compute with `git show HEAD:<path> | sha256sum` before applying (the tree hashes after the patch are: evidence.mjs 5ad101a0c34526e1d2c0a5727620026408e35b99f8f0231ca767ddccf0c8b30d, producer 8705a10a774b6195be786f330633ca1f102ee20cbafde1c1a8884c0f593d0198, script 557b33ff8ed97666f2f28bc8b1b7d3b91d9d0416e8ec8b43b71722f7fc93bd5e, registration 6099a011ecef407ea090a510b33fa2dab504c45ef6b060b298f65ec4ca4fe736, admission test 3f056e7e4a3d12f5f2f7beb01ca5be9234e47986375c7f8750a021e270ee5416, evidence test 8e4096c738d2e1f21dfe5a8d99dd7745aad259990120fc9f45c211370154b3ad). Note: these are POST-patch hashes taken from the clone; I did not record separate preimage hashes (an honest gap, see report).

## Counts
- RED (before, from C1): critic-course-admission 37 tests 35 pass 2 fail; critic-diagnostic-evidence 5 tests 3 pass 2 fail.
- GREEN (after): critic-course-admission 37/37; critic-diagnostic-evidence 5/5; critic-dispatch-preflight 46/46; guard-maintenance-window-kernel-closure 1/1; critic-round-cap-and-delta-scope pin 10/10; catalogue-admit-prescribed-lifecycle-verbs 19 tests 18 pass 1 fail (the known D64 model-role bootstrap case, red at HEAD too). No dedicated register-feature-package test file exists; registrar is exercised by the chain test.

## Follow-up slices
- Documentation: scripts/critic-diagnostic-evidence.mjs line 11 usage text (`--log evidence/LOG --out evidence/JSON`); SKILL.md critic-review step if it names `evidence/` as the only location.
- check-critic-bound-verify.mjs uses the fixed path `evidence/verify-latest.json`; the registrar now refuses that path, so the copy-then-produce route applies until a follow-up changes it.

## Proposed commit message
fix(critic): write the Critic diagnostic evidence where the registrar accepts it (D167 PF-78)

## Operator flow
Apply the patch in the repository (`git apply`), `git add -u`, commit with `--no-verify`, stamp, install. The touched files are custody paths, so an independent Critic review stays a parent-owned batch gate.

## Coordinator verification (fresh clone of HEAD 4669d34ae, patch applied)
- `git apply --check` and `git apply` exit 0. critic-course-admission 37/37, critic-diagnostic-evidence 5/5, critic-dispatch-preflight 46/46, guard-maintenance-window-kernel-closure 11 passed 0 failed; catalogue-admit-prescribed-lifecycle-verbs 18 of 19 (the known D64 model-role bootstrap case, red at HEAD too).
- The first attempt (W6-D167-PF78-DIAGLOCATION-20261026) stopped on a false premise: Critic admission reads the full-verify evidence through the registered manifest (`registeredArtifact`, `deterministic()` in lib/critic-course-admission.mjs), so a fixed unregistered `evidence/verify-latest.json` member cannot work. The route is copy-then-produce: copy the Verify evidence byte-identically to `specs/<id>/evidence/`, produce with `--full-verify` on that path, register all members.
- Known weakness for the Critic: D167-PF78 (4) accepts `FPR-MANIFEST-MISSING` besides `FPR-DIAG-PATH` for the registrar probe; the chain test carries the real registrar refusal.
- Preimage hashes were not recorded by the Goldfish; the apply check on a fresh clone of the candidate commit is the binding evidence. Native Windows qualification, full Verify, batch Critic and PO acceptance are pending.
