---
schema: pipeline.backlog-item.v1
id: pipeline.attended-po-acknowledge-gate-defaults-to-an-unsatisfiable-runner
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: alfred
source: "Measured live 2026-08-28 in the Alfred clone: two attended PO acknowledge ceremonies, the first failing its postimage readback and rolling back, the second succeeding with an explicit --runner flag."
---

# The attended PO acknowledge gate defaults to a runner that cannot satisfy its own postimage readback

## Observation

`pipeline-state.mjs po-authority-acknowledge-apply` is a deliberately attended
gate: `requireAttendedChatGateConfirmation` refuses unless
`process.stdin.isTTY === true`, so a human must run it in their own terminal.
An agent's own tool call is refused with `CHAT-GATE-NOT-ATTENDED`, by design.

The same command resolves its runner as
(`resolvePoRebindRunner`, `plugins/pipeline-core/scripts/pipeline-state.mjs`):

```
explicitRunner ?? (env.CLAUDECODE === "1" ? "claude"
  : (env.ANTIGRAVITY_AGENT === "1" || env.AI_AGENT === "antigravity") ? "antigravity"
  : "codex")
```

Those two rules contradict each other. The attended terminal the gate demands
is, by construction, not a Claude Code process, so `CLAUDECODE` is unset and
the runner defaults to `codex`. The postimage readback then runs the V4
inspection for all three intents under that runner and requires
`status === "ready"` from each. On a host with no Codex effective-runtime
readback, `inspect --runner codex` returns `runtime-attestation-required` with
diagnostic `restart_required` ("the current Codex projection has no native
effective-runtime readback"), so the `v4Intents` predicate can never hold and
the transaction always rolls back.

## Measurement (2026-08-28, this repository)

- Attempt 1, plan `2775affd…`, run by the PO in an attended WSL shell with no
  `--runner`: `Error: PO authority rebind postimage readback failed; rollback
  verified.` Working tree clean afterwards; no mutation survived.
- Diagnosis by elimination, all read-only: the five postimage predicates are
  `prdDigest`, `stateFile`, `stateValue`, `poAuthority`, `v4Intents`.
  `validatePoGateProfileForRepository` returned all five profile fields
  byte-identical to the plan's predicted postimage
  (`sourceSha256`, `runtimeSha256`, `receiptSha256`, `repositoryFingerprint`,
  `humanFacing`), excluding the `poAuthority` profile half.
  `project-onboarding-v3.mjs inspect` returned `ready` for
  bootstrap/session/dispatch under `--runner claude` and
  `runtime-attestation-required` under `--runner codex`.
- Attempt 2, fresh plan `980f6bd2…`, identical command plus `--runner claude`:
  `{"status":"applied","code":"PO-ACK-APPLIED","continuityRevision":1}`.

The rollback is correct and complete — this is a usability and diagnosability
defect, not a data-integrity one.

## Cost

Two live PO ceremony entries were spent to learn one missing flag. The plan's
own `applyAction.argv` — the exact command a PO is meant to copy — omits
`--runner`, so following the tool's own instruction reproduces the failure.
Compounding it: the failure message names no predicate. The evidence object
`pipeline.po-authority-postimage-readback.v1` is built with every predicate's
expected/observed value and then handed to `deps.observeRebindPostimageEvidence`,
which is undefined on the CLI path, so nothing is printed and nothing is
persisted. A PO sees one sentence with no cause and no route.

The plan digest is also consumed by the failure: the rollback rewrites State
and PRD, changing the `mtimeMs`/inode recorded in the plan preimage, so the
plan must be regenerated before a retry — correct behaviour, but it means a
diagnosable-in-one-line problem costs a full re-plan plus a second passphrase
entry.

## Proposal directions

Not decided here; each is small and independently viable.

1. **Emit `--runner` in the plan's `applyAction.argv`.** The plan is generated
   inside the agent session, where the runner IS known, and the apply already
   accepts the flag. This alone closes the reported failure.
2. **Resolve the runner from the plan rather than the apply-time environment.**
   The environment at apply time is guaranteed to be the wrong one for an
   attended gate; the planning environment is the right one. Recording the
   runner in the plan payload makes the two rules stop contradicting.
3. **Print the failing predicate.** Default `observeRebindPostimageEvidence` to
   a stderr writer naming which predicate failed with its expected/observed
   pair. Related to, but narrower than,
   [[2026-08-27-a-read-only-command-is-refused-for-naming-a-protected-path]]:
   both are cases where a refusal carries no route.

## Related

- [[2026-08-28-a-design-phase-prd-and-spec-are-frozen-by-their-own-continuity-binding]]
  — the same ceremony chain; this item is the step immediately after it.
