# Held patch: distinct private-DACL detail codes and a root-only rule (Toolbox D50, slice W7-WIN-PRIVATE-DACL-ROOT-ONLY-C1-20261027)

Patch: `w7-win-private-dacl-root-only.patch` (git diff --binary against candidate fa6cb7f99ea071b789c38d16aaef0c74e996ef04). Apply check in a second clone at the candidate: exit 0.

PO decision 2026-10-27: "root-only like S7a". Recon: `scratch/wave3/analysis-toolbox-d50-win-auth-dacl.md` (its cited lines were re-verified in the clone: the only WIN-AUTH-DACL throws are in windows-owned-authority-native.ps1 line 150, four cases).

## Cause
The native check required, for every privateOnly path, a protected DACL and only CurrentSid ACEs. A directory created by plain mkdir (or another build) below `.git\agent-pipeline` inherits ACEs and an unprotected DACL, so Verify failed with an undifferentiated WIN-AUTH-DACL.

## Changed lines
- `windows-owned-authority-native.ps1`: new `HardenedRoot(p)` (line 144; finds the `.git\agent-pipeline` segment pair, returns the root only for a path strictly below it). Line 150 (Verify): WIN-AUTH-DACL split into WIN-AUTH-DACL-EMPTY, -UNPROTECTED, -ACE (non-common or callback ACE), -FOREIGN (foreign SID). Below a root that opens cleanly through the strict private rule (`Open(root,true,false,true)`), the protected-flag check is skipped and foreign ACEs pass only if `IsInherited`. Owner stays strict everywhere; the root itself is never "below" and stays strict.
- `windows-owned-authority-backend.mjs`: HELPER_SHA256 now e53c759fe421781ca45802cf5d96c4a0c2709c8d0490c58972a14b8f68171679 (computed from Node); `fail()` maps the four detail codes to reason `WIN-AUTH-DACL` plus `error.detail`, so existing consumers (for example the os-temp-root pin comparing error.reason) still match.
- `windows-authority-readiness.mjs`: exported `windowsAuthorityDetail()`; causes carry a closed `detail` key, reason stays the family.
- `windows-authority-readiness.test.mjs`: cases WAR015..WAR018 added. No existing case changed.
- NEW `lib/pins/windows-private-dacl-detail-codes-and-root-only-rule.test.mjs` (6 source-shape pins). It NEEDS REGISTRATION in the Verify suite list (harness/verify-suites.json is protected, TP-13: parent or operator step).

## RED then GREEN
- RED (unchanged clone): readiness file failed WAR015 and WAR018 (WAR016/WAR017 pass at baseline by design as guard pins); new pin file failed P1 (x2), P2, P3 (x2), P4 passed.
- GREEN (patched clone): readiness file exit 0, tests 18, pass 18, fail 0; new pin file exit 0, tests 6, pass 6, fail 0.
- Baseline (clone2, unchanged): readiness file exit 0, tests 14, pass 14, fail 0. Failing-name sets: baseline empty, patched empty; only the four new cases differ.
- One justified test fix: the pin's own line finder first matched a DllImport line (test defect); it now selects the line containing `new RawSecurityDescriptor`. Assertions were not weakened.

## NOT done / limits
- The ps1 is not runnable on Linux/WSL: the decision table is pinned by source shape and by the injected readiness probe, not by behaviour. No real Windows ACL was measured; native Windows qualification stays a PO step.
- Root detection assumes the literal `.git\agent-pipeline` (a gitCommonDir elsewhere stays strict). Inherited deny ACEs below the root are tolerated.
- scripts/verify-journal.mjs untouched. Independent Critic review remains a parent-owned batch gate.

## Proposed commit message
fix(windows): distinct private-DACL detail codes and a root-only rule below a hardened agent-pipeline root (Toolbox D50)

## Operator flow
Apply the diff (`git apply`), `git add -u` with a path limit plus the new pin file, `--no-verify` commit, stamp, install.

## Protected-path classification observed
None of the five patched files matches TP-1..TP-13. They are editable but travel as a held patch because plugins/ is not edited by this dispatch.
