# W9 round 4: Full Verify fixes for the D216-A read halves (fixture lists, kernel list, reference-path allowlist)

Built by the Elephant (PO exception: small items in a scratch clone, held as a patch). Built against 586d6a0ff; the held patches that were committed since touch only evidence files, so the patch applies unchanged on the current HEAD.

## Why
Candidate 14's Full Verify (fv7) had 10 red suites. The D216-A split moved the read-only half of several modules into `*-read.mjs` files and made the originals re-export them. Everything that had to know about those files was not told:

- copy-graph fixtures (`check-verify-suite-registration.test.mjs`, `windows-assurance-verify-registration.test.mjs`, `scoped-verify-registration.test.mjs`, the SECGATE-2 case in `project-onboarding-v3.test.mjs`) copy a fixed module list into a temp root; `project-authority.mjs` now imports `project-authority-read.mjs`, so the copy failed with "Cannot find module";
- `signed-quality-package-scratch.test.mjs` walked only `from "./x"` imports; the package validation now lives in `review-admission-read.mjs`, which reaches a host-process supervisor and schema files through `new URL(..., import.meta.url)` and `join(pluginRoot, 'config'|'schemas')`;
- the kernel list `NEVER_LIFTABLE_KERNEL_PATHS` and its threat-model document did not list the nine read halves although each is first-party code reached from an already-kernel module (the closure rule);
- `check-consumer-safe-paths.mjs` allowlist entries named `po-gate-authority.mjs` for text that now lives in `po-gate-authority-read.mjs`;
- `check-reference-paths.mjs`: three gitleaks fingerprints in `.gitleaksignore` name tracked `.mjs.txt` evidence copies and the detector read the `.mjs` prefix as a script path (C14-GITLEAKS-FP);
- `architecture-entry-readiness.mjs`: a doc comment spelled an import line that a copy-graph walker took for a real import.

## What changed
Eleven files: the fixture module lists, the walker in the signed-package test (new-URL assets, `config`, `schemas`, `scripts/*.json`), the kernel list and threat-model table (nine entries), two allowlists, one comment. No behaviour change in production code.

## Evidence
- Full Verify `fv8` on a clone at 586d6a0ff plus this patch: every one of the ten reds is gone except the onboarding declaration mismatch, which is a different cause (24 case ids declared but not registered; own patch `w9-onboarding-suite-registers-every-declared-case`). The remaining red `check-commit-type-range` in that clone was an artifact of the clone's non-conventional preparation commit message, not a defect.
- The SECGATE-2 case failure ("Cannot find module .../project-authority-read.mjs") reproduces without this patch in a fresh clone at the current HEAD and is the only failing case of the onboarding suite there.
- Per-suite logs of the fixes are kept under `scratch/agent-out/w13fix/` (`c1`..`c11`).

## Not verified
Full Verify on the assembled candidate (fv9), batch Critic, native Windows runs, PO acceptance. The kernel-list change is a protected-file edit: the PO applies it under the sanctioned route.
