# Held patch: node sandbox probe reports whether a stable node exists (Wanted 3)

Slice W7-NODE-STABLE-PROBE-C1-20261027, candidate 400c6213db04d4abf1c93335b59d68a9a2e7d086. Patch: `w7-node-stable-probe.patch`
(`git diff --binary` of a shared clone against the candidate; 2 files, 117 insertions, 2 deletions). Nothing committed.

## Cause (re-verified against the clone)
`observeNodeSandboxProbe` in `plugins/pipeline-core/lib/node-sandbox-probe.mjs` judged only `process.execPath`. A version-manager
match returned `version-manager-path` / `NODE-SANDBOX-UNREACHABLE` with a prose remedy, so "preflight runs under fnm" and "no stable
node anywhere" were indistinguishable. The recon's cited lines (probe lines 11, 21-35; pin test lines 200-218) matched the code.

## Changed lines
- `plugins/pipeline-core/lib/node-sandbox-probe.mjs`: import `existsSync`; new `NODE_NO_STABLE_REMEDY` (no sudo, no version, no fixed
  install command: detect package manager, propose official source, user runs it, re-run preflight); `POSIX_STABLE_CANDIDATES`
  (/usr/bin/node, /usr/local/bin/node, /opt/homebrew/bin/node); additive options `platform`, `env`, `exists`, `stableCandidates`;
  new private `findStableNode` (win32: `<ProgramFiles>\nodejs\node.exe` from injected env; shell:false, 3 s `--version`, never throws).
  The version-manager branch now returns a separate `stableNode: {found, path}` / `{found:false}`; `status` stays
  `version-manager-path`, `ready` stays false. `stable-path` and `unknown` outputs are unchanged. No envelope top-level key added.
- `plugins/pipeline-core/lib/pins/agy-driver-dispatch-and-design-routes-incomplete.test.mjs`: six cases (a)-(f) appended after the
  existing probe case; no existing case touched.

## Evidence (logs under scratch/agent-out/w7f/, untracked)
- RED (unchanged probe, new cases): 20 tests, 15 pass, 5 fail: cases (a),(b),(c),(d),(f). Case (e) passes on the original code
  (it pins the unchanged stable-path behaviour: one spawn, no stableNode) and is a regression guard, not RED.
- GREEN (patched clone): `ℹ tests 20 / pass 20 / fail 0`.
- Baseline (clone2 at candidate, whole file): `tests 14 / pass 14 / fail 0`. Failing-name sets: baseline empty, patched empty; no
  pre-existing failure. Command: `node plugins/pipeline-core/lib/pins/agy-driver-dispatch-and-design-routes-incomplete.test.mjs`, exit 0 each.
- Apply check: `git apply --check` of the patch in clone2 at the candidate, exit 0.

## NOT done
- Item 3 (follow-up, separate and larger): node-stable/semgrep/osv-scanner/gitleaks findings in `toolchain-preflight.mjs`, removing
  the hard-coded `installCommandFor` / `sudo apt-get` guidance; touches the large toolchain-preflight test and the preflight payload budget.
- Wanted 1, 2, 4 and native-host (WSL/Windows) checks, Full Verify, batch Critic and PO acceptance.
- The start-preflight payload budget/envelope pin was not run (only the single pin file was in scope); `stableNode` adds one small field to `nodeSandbox`.

## Proposed commit message
`feat(preflight): the node sandbox probe reports whether a stable node exists beside a version-manager node (Wanted 3)`

## Operator flow
Apply the diff in the repository (`git apply` of the patch), `git add -u` limited to the two paths, commit with `--no-verify`,
then stamp and install.

## Protected-path classification observed
Neither file matches a TP-1..TP-13 test-path pattern in `templates/prompts/agent-obligations.md` §2; `node-sandbox-probe.mjs` is
plugin source outside the briefed write scope, so the change travels as a held patch (never edited in the repository).

## Review
An independent Critic review stays a parent-owned batch gate.
