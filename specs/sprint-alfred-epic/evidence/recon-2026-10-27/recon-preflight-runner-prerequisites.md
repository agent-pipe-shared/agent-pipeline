# Recon: pipeline.preflight-establishes-runner-prerequisites (P1, stage 25)

Source: read-only Explore agent, 2026-10-27, 28 calls. Model output; cited lines re-verifiable. Snapshot row says "no implementation is claimed".

## Cause
- plugins/pipeline-core/lib/node-sandbox-probe.mjs:21-35 `observeNodeSandboxProbe` judges only `process.execPath`; version-manager match (pattern line 11) returns `version-manager-path` / NODE-SANDBOX-UNREACHABLE / prose remedy (line 29), ready:false. It never looks for /usr/bin/node, /usr/local/bin/node, Program Files\nodejs, so "preflight under fnm" and "no stable node" look the same (Wanted 3).
- pipeline-start-preflight.mjs:2361 (`nodeSandbox: observeNodeSandboxProbe()`, no args), :2315.
- toolchain-preflight.mjs:331 `ENVIRONMENT_FINDING_IDS`, :487-496 `DEFAULT_FINDING_PROBES` have no node-stable or scanner findings; start preflight (observeEnvironmentReadiness :2246-2255) reports nothing on semgrep/osv-scanner/gitleaks (Wanted 1, 2 partly).
- toolchain-preflight.mjs:80-83 GUIDANCE and :87-123 `installCommandFor` hard-code install commands incl. `sudo apt-get`: conflicts with PO direction (no hard-coded install commands, no sudo) (Wanted 4 partly).

## Already delivered
- Typed per-tool readback `runToolchainPreflight` (toolchain-preflight.mjs:240; statuses ready/binary_missing/incompatible_version/incompatible_capability/untrusted_path/input_missing; edfe18b06, 35d876a11); scanner probes in scripts/security-readiness/*.
- Missing scanner no longer silently clean: e244c7b3d (`required-capability-missing`, security-scan.mjs:746). Backlog bullet lines 29-31 partly stale; manifest chapter text lib/project-onboarding-v3.mjs ~1241 not re-verified.
- Preflight carries `environmentReadiness` with typed `attended-prerequisite` repairs (toolchain-preflight.mjs:356).
- Node sandbox probe landed 25947149e (AC-108), pinned only by lib/pins/agy-driver-dispatch-and-design-routes-incomplete.test.mjs:200-218.

## Minimal slice (one Goldfish dispatch, node stable-candidate probe only; 14-18 calls)
1. Edit lib/node-sandbox-probe.mjs only, additive: optional seams `platform`, `exists`/`stat`, `stableCandidates` (posix: /usr/bin/node, /usr/local/bin/node, /opt/homebrew/bin/node; win32: %ProgramFiles%\nodejs\node.exe via env injection). When execPath is a version manager, run `--version` on each existing candidate (shell:false, 3 s timeout). Keep `status: "version-manager-path"` (existing assertion at test line 205) and add a separate `stableNode: {found, path}` field (recommended contract). Not-found: ready:false, code NODE-SANDBOX-UNREACHABLE, remedy attended, no sudo, no pinned version ("detect your package manager, propose the official source, the user runs it, re-run this preflight"). `stable-path` and `unknown` unchanged; `unknown` never ready.
2. Extend the single test file agy-driver-dispatch-and-design-routes-incomplete.test.mjs after line 218.
3. Follow-up (separate, larger): add node-stable, semgrep, osv-scanner, gitleaks findings to toolchain-preflight, drop hard-coded installCommandFor/sudo; touches the large toolchain-preflight test and the preflight payload budget.

RED-first cases: (a) fnm execPath + candidate /usr/bin/node exists and runs -> stableNode.found true; (b) no candidate -> found false, ready false, code present, remedy has no `sudo` and no fixed version; (c) win32 with injected ProgramFiles + \nodejs\node.exe found; (d) candidate exists but --version fails/times out -> not found, never ready; (e) stable execPath -> no candidate scan (spawn once); (f) probe never throws when `exists` throws.

## Risks / protected paths
- lib/node-sandbox-probe.mjs plausibly protected/kernel (item says kernel/protected paths likely involved); list not confirmed -> held patch likely.
- Preflight envelope key set and payload budget are pinned: extend the existing `nodeSandbox` object only; do not add top-level keys; avoid touching toolchain-preflight.mjs / pipeline-start-preflight.mjs in this slice.
- Wanted 2 "deliberately off" gate confirmation is a collect-input design question, out of slice.
- Item completion also needs native-host (WSL/Windows), Verify, Critic, PO acceptance.

## Runner-neutrality
No runner branches; platform differences only through injected `platform` and env seams; read-only (bounded --version spawns, shell:false, no installs, no sudo).

## Recommendation
Held patch YES (only Wanted 3). Row moves 25 -> 50 only if the follow-up also lands; slice alone leaves it at 25 or a partial 50 per the PO rule "75 = technically delivered".
