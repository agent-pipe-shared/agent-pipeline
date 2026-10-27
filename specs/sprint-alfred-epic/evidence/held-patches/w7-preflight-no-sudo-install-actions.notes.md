# Notes: preflight slice 2, capability contract instead of hard-coded install commands

Candidate dfe2f31eca0a, stacked on the held patch `w7-preflight-scanner-findings-c2.patch` (applied and committed as "stack base" in the clones only).
The patch is `git diff --binary` against that stack base, produced from Node. Slice files: `plugins/pipeline-core/scripts/toolchain-preflight.mjs`
and `plugins/pipeline-core/scripts/toolchain-preflight.test.mjs`. Nothing under plugins/ was edited in the repository.

## Cause
The recon claim was re-verified in the clone: `installCommandFor` (sudo apt-get, go install @latest, brew install, winget install) and a GUIDANCE
text pinning "Node.js 24 or newer" / "OSV-Scanner 2.x" contradicted backlog Wanted 4 and the D164 addendum. The only consumer of `installCommandFor`
output is `actionableResult` in the same file; `pipeline-start-preflight.mjs` does not consume it (its `installCommand` is the unrelated pre-push hook).

## Changed lines (toolchain-preflight.mjs)
- GUIDANCE: "Node.js 24 or newer" -> "a Node.js release that meets the pipeline minimum" (3 platforms); "OSV-Scanner 2.x" -> "a supported OSV-Scanner major release". Why: no pinned version in text.
- `installCommandFor` removed; added `PROBES`, `SOURCE_HINTS`, `attendedContract(platform, tool)`: returns
  "Capability contract for TOOL: probe: P; source: S. Run the install yourself, then re-read the preflight; the preflight installs nothing and emits no command." (+ npm note for scanners).
- `actionableResult`: `installCommand` is now always `null` (the schema field stays, `additionalProperties:false` so no new field was possible without touching the schema file, out of slice); the contract is appended to `guidance` for binary_missing / incompatible_version / incompatible_capability.
- Status values are untouched. `INSTALLER_NAMES` discovery still runs but no longer shapes any text.

## Tests (toolchain-preflight.test.mjs)
New: TCP050 W7-2a (no sudo, 3 platforms x missing/incompatible), TCP051 W7-2b (no digits.digits, @latest, apt-get/go install/brew/winget/pipx install), TCP052 W7-2c (tool, probe, source, run-yourself, re-read), TCP053 W7-2d (status values unchanged).
RED against unchanged clone: TCP050, TCP051, TCP052 failed (2d passed by design, statuses unchanged). GREEN after: 53/53 pass.
Updated existing cases with justification (they pinned the old command text, which this slice deliberately removes):
- "a missing configured prerequisite names the blocked claim and a copyable command..." : `installCommand` "pipx install semgrep" -> null, and guidance must carry `probe: semgrep --version`. The no-install and claim assertions are kept.
- "missing installer prerequisites are embedded in copyable Ubuntu chains...": sudo chains -> null plus probe/source in guidance; the npm-only branch is unchanged and still passes.

## Counts
Patched clone: toolchain-preflight.test.mjs 53 pass 0 fail; pipeline-start-preflight.test.mjs 98 pass 0 fail; lib/pins/signing-toolchain-readiness.test.mjs 14 pass 0 fail.
Baseline clone2 (stack base unchanged): 49 / 98 / 14 pass, 0 fail. Failing-name sets: both empty; identical. Logs under scratch/agent-out/w7qt/*.log.
Apply check in clone2: requested in the same call as this note; result is reported in the dispatch return (budget cap prevented a later re-read).

## NOT done
- Driver `cleanup` (clones in scratch/agent-out/w7qt left in place, untracked) because the tool budget ended.
- WSL/Windows install and re-read behaviour is native-host-only and stays unverified here.
- No schema change (a typed `attendedAction` field would need toolchain-preflight.schema.json); no Critic review (parent-owned batch gate); no Verify.

## Proposed commit message
refactor(preflight): replace hard-coded install commands with a capability contract and a no-sudo attended action

## Operator flow
Apply the diff, `git add -u` with a path limit to the two slice files, commit with `--no-verify`, stamp, install.
Protected-path classification observed: neither slice file matched a guard-testpath TP pattern in the clone; both are plugin kernel paths, hence held-patch custody.
Independent Critic review stays a parent-owned batch gate.
