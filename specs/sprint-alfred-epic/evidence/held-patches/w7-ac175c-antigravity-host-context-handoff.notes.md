# Held patch notes: AC-175 follow-up C, the Antigravity host context reaches the CLI export through a conversation-bound handoff

Slice W7-AC175C-ANTIGRAVITY-HOST-CONTEXT-HANDOFF-20261031 (item `pipeline.forensics-and-audit-evidence-not-reconstructable`, AC-175, follow-up to AC-175 part B). Built only in the prepared clones; the patch is a cumulative diff against the stacked commit that carries the AC-175b patch (`cand.txt`) and was apply-checked on the plain clone. Nothing was committed by the dispatch.

## The gap this closes

AC-175b made `exportRunnerTranscript` able to export the CURRENT Antigravity conversation, but only from the in-process option `antigravityArtifactHost` (the shape `antigravityArtifactHostContext` builds from the pretool envelope). The CLI argv cannot carry it and no environment variable does, so the CLI answered `antigravity-host-context-unavailable` and no in-process caller existed: the export was unreachable in practice.

## The design (and why this one)

The only component that holds the envelope is the pretool hook, and the only way a later process can receive anything from it that the agent does not control is a file the hook writes. So:

1. When the hook is about to ADMIT a shell call (the final `allow()` of `runAntigravityPreToolGuard`, after every nested guard and the lifecycle guard have passed, and not the human-override-consumed `allow()`), it recognises exactly one command with the guard's own resolver (`resolveSanctionedScriptInvocation` + `sanctionedTranscriptRecoveryArgs`, no regex of its own): `node <runner-transcript-recovery.mjs> export --root <project root> --runner antigravity --exclude-session C --session-id C`, where `C` is the conversation id of THIS envelope. It also requires the layout predicate `antigravityArtifactLayoutIsValid(host, projectRoot)`.
2. It writes the host context it already computed (`conversationId`, `artifactDirectoryPath`, `transcriptPath`, `workspacePaths`) to `<git common dir>/agent-pipeline/antigravity-host-handoff/<C>.json`, mode 0600, through a `wx` temporary file and an atomic rename. The record binds: schema, conversation id, project root, the sha256 of the exact admitted argv (`JSON.stringify(args)` of the resolver's argv, never of the command text), `issuedAt`, `expiresAt = issuedAt + 5 minutes`.
3. The CLI (`main` -> `exportFromCommandLine`, runner `antigravity` only) clears stale handoffs, then consumes the handoff of the requested session: lstat (regular file, single link, owned by this user, no group/other bits, size bound), open with `O_NOFOLLOW` and compare to lstat, parse, check every binding (schema, exact key set, lifetime exactly the TTL, not issued in the future, conversation id equals the file name and the host, root, argv digest), then claim by atomic rename so exactly one reader wins, re-read and compare the claimed bytes, unlink. The consumed host context goes to `exportRunnerTranscript` as `antigravityArtifactHost`; every existing screen (brain layout, physical single-link transcript, credential roots, workspace match, own-session identity) then applies UNCHANGED.

Why a file and not another channel: the hook cannot set the environment of a command that the host (not the hook) launches; the admitted argv is closed (`sanctionedTranscriptRecoveryArgs`) and a context-carrying flag would be an agent-controlled input; the git common dir is not a working location of the agent and is where the other per-repository private state already lives. Why digest the argv and not the command text: the CLI sees tokens, the hook sees text; quoting differences would break a text digest while the resolver's tokens are exactly what `process.argv` carries.

## Requirements, and the test that pins each

| Requirement | Where it holds | Pin |
|---|---|---|
| Context never from an agent-supplied path, flag, environment variable | `parseArgs` is unchanged (closed flag set); the handoff location is derived from `--root` and `--session-id` only and the content is verified against both; `main`'s second parameter forwards only the two machine-plane lookups | recovery suite `AC-175C: nothing an agent supplies selects the host context` |
| Valid handoff: CLI export on Antigravity succeeds and equals the library route | `exportFromCommandLine` | recovery suite `AC-175C: a CLI export on Antigravity succeeds with the handoff the hook wrote ...` |
| Missing / expired: typed `antigravity-host-context-unavailable`, expired one removed | `consumeAntigravityHostHandoff` | `AC-175C: a missing or expired handoff ...` |
| Foreign conversation / other argv / other root: typed `-invalid` | same | `AC-175C: a handoff of another conversation or another command ...` |
| Replayed: typed `-unavailable` (consumed by first use) | rename claim + unlink | `AC-175C: a replayed handoff ...` |
| Malformed, over-permissive, linked: typed `-invalid`, not left behind | lstat/open/parse screens | `AC-175C: a malformed, over-permissive or linked handoff ...` |
| Hook writes only for the admitted export of its own conversation | `handOffAntigravityHostContext` | hook suite `... hands the host context of its own conversation ...` and `... writes no handoff for another conversation, another runner, another form or a denied call` |
| Claude and Codex exports byte-identical | `exportFromCommandLine` returns `exportRunnerTranscript(args)` untouched for any runner but `antigravity`; no new branch | `AC-175C: a Claude or Codex export is unchanged ...` (CLI output compared byte-for-byte with the library result, handoff untouched) |
| No handoff left after consumption or expiry; a stale-clearing routine on a mandatory path with a test | the hook sweeps on EVERY shell call it admits (`sweepAntigravityHostHandoffs`), the CLI sweeps before it consumes; the consume path removes expired/malformed/consumed files | hook suite `... clears stale handoffs on every shell call it admits`, recovery suite `AC-175C: the stale-handoff sweep ...` |
| New argv form admitted with a pin | NONE added: the argv is unchanged (`export` already admits runner `antigravity`), so `lib/guard/sanctioned-args-scripts.mjs` is not edited | recovery suite CLI cases use the unchanged argv |

Typed reasons: only the two that already existed (`antigravity-host-context-unavailable`, `antigravity-host-context-invalid`). No new reason string, so no consumer of reasons changes.

## Callers and consumers swept

| Consumer | Effect | Pin / reason |
|---|---|---|
| `main()` / CLI `export` in `scripts/runner-transcript-recovery.mjs` | antigravity runner now consumes the handoff; other runners unchanged; `main(argv, seams = {})` gained an optional seam for two lookups (direct invocation passes none) | recovery suite, 32 cases |
| `hooks/antigravity-pretool-guard.mjs` (final `allow()` only) | calls `handOffAntigravityHostContext` after all guards pass; any failure is a diagnostic, never a denial | hook suite new cases; the existing 68 cases unchanged |
| `lib/current-session-artifact-export.mjs` | additive exports (`antigravityHostHandoffDirectory`, `writeAntigravityHostHandoff`, `consumeAntigravityHostHandoff`, `sweepAntigravityHostHandoffs`, `ANTIGRAVITY_HOST_HANDOFF_*`); `isCurrentSessionArtifactExport` and `antigravityArtifactHostContext` untouched | artifact-export suite 7/7 and cross-runner suite 4/4, identical to baseline |
| `lib/guard/evaluate.mjs` | consumes `isCurrentSessionArtifactExport` / `crossRepositoryDenialReason` only | unaffected, same two suites |
| `lib/guard/sanctioned-args-scripts.mjs`, `command-catalogue.mjs`, `constants.mjs` | the hook now IMPORTS `resolveSanctionedScriptInvocation`, `sanctionedTranscriptRecoveryArgs` and `TRANSCRIPT_RECOVERY_SCRIPT`; none is edited | the argv is unchanged |
| `hooks/guard-lifecycle-ready.mjs` and its test | admits the export argv as before; the handoff is written after its verdict | unaffected |
| `hooks/codex-session-start-hint.mjs` | names `list` and `read` for Codex only | unaffected |
| scanners of `<git common dir>/agent-pipeline` (`guard-lifecycle-ready.test.mjs`, `rebind-approval.test.mjs`, `native-goldfish-host-state.test.mjs`) | the new directory exists only after an admitted antigravity export | unaffected in their fixtures |
| skills, templates, agents, docs | no text names the handoff, the export reasons or `exportRunnerTranscript` | text sweep (`rg` over `plugins/pipeline-core`, `docs`, `templates`, `harness`) lists only the five files of this patch |
| `harness/scripts/check-verify-case-completion.test.mjs` | not edited: VCR01 is red with the identical mismatch list (six count pairs) in the baseline clone and the edited clone, so my cases move no pin | compare `c1v` / `base1v` logs |

## Adapted existing assertions

None. No existing case was weakened, skipped or deleted. One new case written in the RED step was corrected afterwards, with this justification tied to the criterion: the "Claude or Codex export is unchanged" case first asserted a Claude `requested-session-unavailable` for an absent Claude store; the fixture had no Claude store and the host environment leaked its own Claude session id, so the case now builds a Claude session and compares the CLI output byte-for-byte with the library result under a pinned session id. That makes the unchanged-behavior assertion stronger, not weaker.

## Residual risk (named, not solved)

- **Cross-conversation within the lifetime.** The handoff is bound to the conversation id, the exact argv, the root and a five-minute lifetime, and the hook writes only when the command names its own conversation. A second Antigravity conversation on the same machine and repository that runs the byte-identical command naming the FIRST conversation's id inside that window could consume the first one's handoff (the hook of the second conversation admits the command as it did before this patch). No input reaches the CLI that could tell the two callers apart; closing it needs the hook to refuse an antigravity export whose ids differ from its own conversation, which is a behaviour change to the guard decision and was not in this slice.
- **Writer inside the git common dir.** Anyone who can create files under the git common dir can forge a handoff; the same trust as the hook metadata itself. The existing screens still bound what a forged handoff could expose to a transcript under a valid brain layout outside every credential root.
- **Expiry versus confirmation latency.** The lifetime is five minutes because the hook runs at PreToolUse and a command awaiting the person's confirmation must still find its handoff. Whether Antigravity confirms before or after PreToolUse is not verifiable here.

## Assumptions not verified against a live store

- That the live Antigravity envelope carries `conversationId`, `artifactDirectoryPath`, `transcriptPath` and `workspacePaths` for `run_command` exactly as `antigravityArtifactHostContext` reads them (the same assumption AC-175b and G13 rest on).
- That the repository root of a native run has a `.git` directory or a worktree `.git` file with `commondir` (both resolved from the filesystem; anything else is a typed unavailable, never a guess).

## Revert proof

The driver reverts the three production files (hook, script, kernel module) to the candidate and runs both suites; the production files were then restored and proven byte-equal. Result with the production change reverted: recovery suite 25 pass / 7 fail (all seven `AC-175C` cases that use the handoff fail with `handoff.antigravityHostHandoffDirectory is not a function`); hook suite 68 pass / 3 fail (the three new `AC-175C` hook cases). The eighth recovery case, `nothing an agent supplies selects the host context`, PASSES on the reverted code by design: it is a negative control (no flag, variable or option carries a context), which holds on both trees. The existing cases are unaffected because the suites reach the new surfaces only through namespace imports, so a missing function fails the case that calls it, not the file at link time.

## Final-state evidence (clone, after the last edit)

Recovery suite 32/32 (baseline 24/24, +8 `AC-175C`), hook suite 71/71 (baseline 68/68, +3), artifact-export suite 7/7, cross-runner suite 4/4 (both identical to baseline), `guard-lifecycle-ready.test.mjs` 423 tests, 0 failed in the edited clone (admits the unchanged export argv). `check-verify-case-completion.test.mjs`: VCR01 red with the identical six count pairs in the baseline and the edited clone (pre-existing; no pin moved by this patch).

## Still pending (parent-owned)

Full Verify, batch Critic, the native Antigravity run (the handoff needs a live envelope and a live CLI call) and PO acceptance.
