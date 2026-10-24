# K149-FV-CRITIC-HOST notes (Goldfish, Sonnet 5.5 / xhigh, ruleset 0.7.0+claude.20261023185750.bd9ee06)

Status: STOPPED on the briefing's own stop condition ("the fix needs a pinned Critic file"). Cause ESTABLISHED by measurement. No diff, no commit, no message files (nothing to apply). Clone scratch/clones/k149 is clean (`git status --short` empty; the temporary probe was reverted with `git checkout -- <test file>`). No k149-check clone made.

## Reproduction (base)
`node scripts/run-in.mjs scratch/clones/k149 k149-cch plugins/pipeline-core/scripts/codex-critic-host.test.mjs` -> exit 1, tests 137 pass 135 fail 2 (CCH136, CCH137).
Evidence: scratch/agent-out/K149-evidence/base-cch.txt (machine-written by capture-evidence.mjs, wrapped exit 1).

## Cause (measured)
CCH137 diagnostics already said: reviewPreparedMatch=true, reviewDetailsChanged={}, protectedChanged=["candidate"]. A temporary probe in the test (snapshot of the candidate's whole `.git` directory, path -> sha256, taken right after prepareNativeCritic returned and again immediately before finalizeNativeCritic; plus a diff of the `captureRepositoryFingerprint(repo).detail` keys) showed:
- fingerprint keys that changed: only `administrative` -> `administrative.detail.git` (the `.git`-dir inventory); head, tree, index, visibility, staged, tracked, status, untracked, ignored, worktreeDirectories, artifacts all unchanged. So the working tree and index are NOT touched.
- files that changed under the candidate fixture's `.git/agent-pipeline/` between prepare and finalize:
  - `session-authority/catalogue.json` CHANGED
  - `session-authority/producers/model-family-host.json` CHANGED
  - `model-family-host/authority-lifetimes/<3 files>.json` ADDED
  - `session-authority/members/model-family-host/member-*.json` ADDED (3 files)
- Writer: the product itself. The fixture (`signedPreparedCriticFixture`, test lines ~3030-3050) deliberately gives the candidate copy an initialized session-authority registry (AC-212: "the host's lifetimes reserve their members in the session-authority registry"). The native launch/execute path (`launchHeldCriticFamilyRoute` / `invokeCodexNativeCriticHost`, model-family-host lifetimes) reserves a lifetime and members in that registry, which lives at `<candidate .git>/agent-pipeline/**`. This happens strictly AFTER prepare (when `prepared.bindings.protectedBefore` is fixed) and BEFORE finalize.
- Reader that refuses: `finalizeNativeCritic` (codex-critic-host.mjs ~line 1985-1988) compares `protectedFingerprintMap(...)` with `prepared.bindings.protectedBefore`; `captureRepositoryFingerprint` -> `gitAdministrativeFingerprint` -> `adminDirectoryInventory(gitDir)` hashes EVERY file under the candidate's git dir including the pipeline-owned private state `agent-pipeline/**`.
- Not a clock/mtime/ordering effect (content hashes of real added/changed files), not a stale fixture (the fixture's registry is required by the host), not the CADH001 cause (K147), not an environment effect (deterministic, private HOME/TMPDIR). Probe output: scratch/agent-out/K149-evidence/probe.txt (written by the temporary test probe).

## Why I stopped
Any product fix is in `plugins/pipeline-core/scripts/codex-critic-host.mjs`, which is in the sha256-pinned set (`codex-isolated-critic-protected-preimage.v1.json`, entry at line 22). Functions: `adminDirectoryInventory` (top-level skip of the pipeline-owned state, as it already skips the top-level `index`) or `gitAdministrativeFingerprint` / `captureRepositoryFingerprint`. Briefing: pinned file => stop and report exact file and function; the C28 re-pin is a later separate step.
A test-only restatement was ruled out: the host launch necessarily writes the registry after prepare, and the test's own pre-finalize check (test lines ~3299-3303) compares the same fingerprint, so no restatement at equal strength avoids it; excluding the registry in the fixture would defeat AC-212.

## Recommended fix for the C28 step (design decision, not done here)
In `adminDirectoryInventory(root, "git-dir" | "git-common-dir")` skip only the subtree `agent-pipeline/` at depth 0 (like the existing depth-0 `index` skip), so pipeline-owned private state does not count as an agent mutation of the candidate. Trade-off to state in the decision: the Critic child run could then write into `.git/agent-pipeline` unobserved by this fingerprint. Narrower alternative: skip only `agent-pipeline/session-authority/**` and `agent-pipeline/model-family-host/**` (the registry the host itself writes), keeping the rest of `agent-pipeline/` covered; the registry has its own CAS integrity. RED pin: a case in codex-critic-host.test.mjs (or a small dedicated one) that writes a file under `<candidate>/.git/agent-pipeline/session-authority/` between prepare and finalize and expects finalize to succeed, plus a negative case that writes `.git/hooks/x` (or a non-registry `agent-pipeline` file under the narrow variant) and expects the refusal. After the product change both CCH136 and CCH137 should go green with no test edit; the preimage pin file needs the C28 re-pin.

## Broader checks (run on the unchanged base clone, nothing changed)
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs`: exit 0, scratch/agent-out/K149-evidence/consumer-safe-paths.txt
- `node harness/scripts/check-doc-contracts.mjs`: exit 0, scratch/agent-out/K149-evidence/doc-contracts.txt
Neither certifies a fix (there is none).

## Not changed
- model-family-runtime-host.mjs bare catch, the K147 kernel files, any pinned Critic file, docs/specs, harness/verify-suites.json.
Dispatch record deviation: none written (PO list row 59).

implementation not complete (no fix delivered); verify: pending, independent review: pending, PO acceptance: open
