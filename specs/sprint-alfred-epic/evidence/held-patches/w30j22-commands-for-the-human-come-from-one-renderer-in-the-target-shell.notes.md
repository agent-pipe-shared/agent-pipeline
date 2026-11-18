# w30j22 — commands for the human come from one renderer that knows the target shell's path style (C30J-J22)

Delta on the integrated 30i tree (the clone base9): it does NOT apply to the real checkout until that tree is applied first. Order: integrated 30i tree, then this patch.
Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text). The PRD and the Spec are unchanged.
The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only.

## Recon (read-only; file:line are in the clone of the integrated 30i tree)

Every site below already goes through the ONE shared quoting and bounding definition, `lib/copy-safe-command.mjs` (`boundedCopySafeCommand`, `renderHumanCopySafeCommand`, `renderPoTerminalCommand`); none hand-quotes a word. What none of them does is shape the PATH STYLE for a shell:
every path the Pipeline builds (`fileURLToPath`, `path.join`) has a drive letter and backslashes on a Windows host, and the POSIX block printed them as built (single-quoted fragments, some ending in a backslash and a quote).
Measured with a probe: that block is bash-valid only through its quoting; a layer that drops or re-wraps a backslash (chat, markdown, a "!" prefix) tears the path. I did not reproduce the consumer's tear inside the rendered text itself, only that fragility.

| Site | Shared renderer? | How it learns the target shell | Handled here |
|---|---|---|---|
| `scripts/po-human-approval.mjs:2312` `renderAuthorizeCriticalCommand`: push, deploy, publication, release-preflight, reconcile, gate-change, maintenance-red, verify-replacement, Critic acknowledgement, spec addendum | yes (`boundedCopySafeCommand`) | none: posix, PowerShell and cmd blocks | YES, site 1: POSIX block in posix path style. Its path flags (`--repo-root`, `--directory`) pass through `resolve()` in the receiver (`po-human-approval.mjs:2484-2485`, `:3158-3159`); `--plan` and `--spec` are repository-relative and not reshaped |
| `scripts/push-prepare.mjs:1040` human authorize-critical step | yes (`renderHumanCopySafeCommand`, no `platform`) | none: both blocks are printed (the terminal differs by runner) | YES, site 2: POSIX block fixed; PowerShell and cmd blocks byte-identical |
| `scripts/push-prepare.mjs:975/983/1053/1058` agent approve-push and agent push | yes | none (both blocks) | NO, and must not: `approve-push` compares `--proof-request/--proof-authority/--proof` byte-for-byte with the mirror paths it expects (`pipeline-state.mjs:4935-4937`, `localMirrorScratchArtifacts`); a forward-slash form would miss that equality and fall to the external-proof route. The first version of this patch reshaped them; the recon of the receiver showed the hazard and it was reverted, with a pin test |
| `scripts/pipeline-state.mjs:10395` `recordCommand` argv with the mirror paths (case b), and the `acknowledgeCommand` siblings | machine pair `{executable, argv}`, not rendered | the agent builds its own line | NO: same byte-equality as above; the form must stay as built |
| `scripts/po-human-approval.mjs:2340` `poHumanApprovalSetupCommand` | yes | none | NO: a third builder (brief: at most two sites); `--directory` is resolved by the receiver, so a follow-up could adopt it |
| `scripts/pipeline-state.mjs:3816, 4369, 4403, 4618, 4692` direct `boundedCopySafeCommand` | yes | none | NO (outside the write list): follow-up |
| `scripts/pipeline-state.mjs:6499, 10245, 10315, 10388, 10451` through `authorizeCriticalActionCommand` | yes | none | fixed through site 1 |
| `scripts/pipeline-state.mjs:12652` design approval; `scripts/guard-human-override.mjs:509` | yes (`renderPoTerminalCommand`) | host platform and `WSL_DISTRO_NAME` | unchanged: shell known from existing facts; a win32 host gets a PowerShell block only |
| `lib/signed-proof-wait.mjs:129-140` `signingLine` | picks `copyCommand.powershell` when `process.platform` is win32, else `posix` | host platform only | NO (outside the write list): a Git Bash terminal on a Windows host is shown the PowerShell block; the host platform cannot tell the terminal, so this needs a real fact (runner or an explicit setting) |
| `hooks/guard-gate-strength.mjs:733-740` `ceremonyCommand` (case c) | yes, but takes `.command`, the SINGLE-LINE form, with `placeholder(JSON.stringify(path))` | none | NO (a guard surface, outside the write list): this is the single-line string of the gate-change ceremony; the fix is to print `copyCommand` blocks like the push and design steps |
| `scripts/push-init.mjs:236, 585` git push line | yes, takes `.command` (single line) | none | NO (outside the write list): follow-up, same single-line shape |
| `scripts/push-prepare.mjs:206, 224, 1011, 1020` remedy strings (`JSON.stringify` of a path) | no, hand-built | none | NO: bash double quotes accept doubled backslashes, PowerShell tolerates them, no digest involved |
| `scripts/close-coordinator.mjs`, `scripts/finish-feature.mjs` | zero uses of the shared renderer (name search only) | not determined | not examined line by line: follow-up |
| `scripts/onboarding-init.mjs`, `scripts/model-role-bootstrap.mjs`, `scripts/installed-plugin-attestation-host.mjs`, `lib/human-terminal-action-instance.mjs`, the Codex and Antigravity pre-tool guards | importers of the shared renderer | not examined | not examined |

The signing subject, every digest and every signature preimage are computed from structured data (`subjectSha256`, the request), never from the rendered string, so the stop condition for a digest did not apply. The one place where the printed string matters is the byte-equality of the `approve-push` proof flags, which this patch leaves exactly as built.

## What it adds

- `lib/human-command-render.mjs`: `renderHumanCommand({executable, argv, shell: "bash"|"powershell", pathStyle: "posix"|"native"})` returns the bounded, line-break-safe block for ONE shell (default style: posix for bash, native for PowerShell).
  Windows-style ABSOLUTE paths (drive letter or UNC, also after `--flag=`) show forward slashes, valid in bash, PowerShell and node; every other value (hashes, flags, relative paths, `DOMAIN\user`, values with spaces) is untouched.
  `renderHumanStep` (both blocks, heading kept) and `boundedCopySafeCommandForBash` are the two adapters: argv, `command`, the PowerShell and cmd blocks stay byte-identical; with no path to reshape (every Linux or macOS call) the result is the shared rendering unchanged.
- `scripts/po-human-approval.mjs` (`renderAuthorizeCriticalCommand` only) and `scripts/push-prepare.mjs` (the one human authorize step) use the adapters. Nothing else in those files changed.

## Checks (test first)

- `lib/human-command-render.test.mjs` (new, 11 cases) was written first: RED was the absent module (an import failure, exit 1, not a per-case red); the defect itself was observed by a probe of the shared renderer. Then GREEN 11 of 11. It includes a real-bash round trip (each Windows-style path reaches the program as one exact forward-slash word), the byte-identity of the Linux case against the shared renderer, argv/command/PowerShell untouched, the unreshaped relative and `DOMAIN\user` values, the unchanged setup builder, and a pin that `approve-push` and push stay on the shared renderer.
- Two fixture corrections, both tied to the criterion: the digest case strips the `CMD=` fragment join before looking for the 64-character digest (the bounded rendering splits long values across fragments by design); the relative-path case was first changed to fit an over-broad heuristic and is restored to its original expectation (relative values stay as given) after the receiver recon.
- Existing suites after the change: `scripts/push-prepare.test.mjs` 100 of 100, `scripts/po-human-approval.test.mjs` 233 of 233.
- Journey coverage of a real `push-prepare` run on a Windows-style fixture: not covered (the existing Linux suites pass unchanged; the adoption there is pinned by source text).
- The new test file is not run by Verify until it is registered in `harness/verify-suites.json` (a protected path, so the Coordinator does it).
- Not run: Full Verify, the Critic (suspended).

## Not changed / not proven

- No stored status, record shape, digest, key bytes, gate, approval or signature behaviour changed; no refusal text touched.
- Not proven on a real Windows host with Git Bash: only the rendered text and a Linux bash round trip.
- Follow-ups (each needs a file outside this write list or an unexamined site): `guard-gate-strength.mjs` and `push-init.mjs` single-line `.command`; the direct `boundedCopySafeCommand` calls in `pipeline-state.mjs`; `signed-proof-wait.mjs` terminal choice; the setup builder; the agent-side `recordCommand` paths, which need a byte-exact form rather than a reshaped one (for example a relative path the receiver resolves); `close-coordinator` and `finish-feature` texts; the sites listed as not examined.
- A scratch probe file remains in the clone's untracked `scratch/` and is not part of the patch.
