# Goldfish result: Toolbox hard-crash candidate

Task: `toolbox_crash_candidate`; profile: standard; scope: inert scratch only.
Baseline HEAD and tree and source SHA-256 values are recorded in
`INTEGRATION.md`. All five listed production source hashes are postimage hashes
too because no production file was modified.

1. **DoD:** `SOURCE.patch` and five source/test postimages are reviewable;
   `git apply --check` passed. The Windows native observer is implemented as a
   scratch postimage and requires a Windows-host test. The v3 worktree callsites
   and both CAS conflict sites are present in scratch source postimages.
   Legacy signed plan/apply **state machine is a scratch candidate** with
   read-only source observation, closed intent, proof verifier wiring and
   retained fault/replay fixture tests. Physical custody adapter, CLI and
   guard admission remain unimplemented, so no real apply is available.
   Existing v1/v2 bytes are preserved
   in the proposal; no production write. Full regression: **not verifiable**.
2. **Evidence:** `node --test scratch/toolbox-crash-repair-proposal/candidate.test.mjs`
   was attempted before `candidate.mjs` existed as a RED reproduction. The
   PreToolUse guard refused execution with `GUARD-DEVPLAN-SHELL` because the
   active feature is in draft. There is no test exit code, RED result, or PASS.
   The test remains in the package. `node --check` returned exit 0 for each
   scratch postimage and both test files. `git apply --check` returned exit 0
   for `SOURCE.patch`. `sha256sum` returned exit 0; postimage hashes are below.
3. **Changed files:** `SOURCE.patch` is the unified patch. The
   `*.postimage.mjs` files are complete file outputs for the existing lifecycle,
   lifecycle tests, and continuity modules, plus two new owner modules and the
   legacy recovery state machine and test.
   `candidate.test.mjs` is the retained native owner/CAS fixture matrix;
   `candidate.mjs` is the early pure diagnostic prototype. `INTEGRATION.md`
   binds the source baseline and legacy transaction design.
4. **Deliberately not changed:** all governed source, lifecycle State, private
   descriptors/manifests/bindings/receipts, signing material, guard rules and
   resource paths. No commit, installation, or override was attempted.
5. **Deviations:** the draft guard prevented the requested actual RED run.
   Native Windows behavior is supported only by Microsoft property definitions
   and mock injection, not by execution on a Windows host. The legacy apply
   state machine has no real authenticated physical custody adapter or CLI
   route and cannot retire controls until those prerequisites are implemented.
6. **Open items:** after plan authority, implement and test the fixed native
   observer and v3 integration from the patch; settle Linux host identity and Mac behavior;
   implement signed legacy transaction's physical custody adapter and exact guard/CLI route;
   obtain independent security and crash-boundary review before activation.

Postimage SHA-256: `worktree-lifecycle.postimage.mjs`
`e2537084f9eab8161761398c58f27c61f3357178bfd9efa4fe086b0e0326c701`;
`worktree-lifecycle.test.postimage.mjs`
`d59d6ce2a1d180f9820bd1fefc85e2a0d3cee5d0fbaa6f08fb91f59f1a84fda9`;
`onboarding-continuity.postimage.mjs`
`2fad9684f33a6714c4080f659768d44661d8f8552637bcde936db6bc391e6fd4`;
`owner-native-v2.postimage.mjs`
`7d2d28aff03b4fce51c8097df4cff6b851353d4e1fd7288f98e03f1188c5194f`;
`session-owner-classifier-v2.postimage.mjs`
`de9dc5a3dde07ec6932f70c7b2f96dc50d3d36936c10857ba0344ef2b3ca6de4`;
`legacy-null-owner-recovery.postimage.mjs`
`5b8ef4ccc490bb7a0c2bd1c4df9d9a078aebe2b276ecf6413b2959815f6ce23d`;
`legacy-null-owner-recovery.test.postimage.mjs`
`f296aee5d49beeb6f8a73308f47c3a5ee02cda29d6db39415bd117f85052586c`;
`SOURCE.patch` `d660f1b8488b21abc15259e89d55cd114faf1824d06a1ae10578f418ca2ce050`.
