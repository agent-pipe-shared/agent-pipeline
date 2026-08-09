# Failure cases F1–F6 (lazy)

Typed failures remain fail-closed: unavailable, stale, malformed, drifted,
blocked, decision-pending, host/OS limitation and permission denial each expose
an actionable next route. A project-policy denial uses a narrower recovery
action or one universal PO emergency plan; override admission is never operation
success. Re-run the identical operation and its normal effect/readback contract.

F6 observation governance is mandatory only in the Public source checkout.
First run `observation-governance-bootstrap.mjs`; a Consumer result of
`not-applicable` is successful and must never trigger a search, copy, or repair
of `harness/scripts/check-observation-governance.mjs`. In a source checkout,
that checker runs before confirmation. A failing result permits read-only
diagnosis only; repair the governed artifact through its reviewed recovery path
and restart bootstrap. Never treat a skipped governance check, human override
admission, or recovery-plan creation as operation success.

## F6 — observation/document governance drift

In the Agent-Pipeline Public source checkout, a non-zero
`node harness/scripts/check-observation-governance.mjs` result is case **F6**.
It blocks writing, dispatch, confirmation, automatic observation/backlog
promotion and deletion. Report the exact finding, perform read-only diagnosis,
correct the governed artifact through the reviewed recovery path, rerun the
checker, and restart the bootstrap. Do not weaken the checker, bypass it with a
Human-override capability, or infer that a moved lazy reference preserved a
required core contract without checker coverage.

## F7 — external-operator host-terminal command rendering

Triggered when a guard's recovery route returns
`status: "external-operator-required"` with
`code: "HGO-EXTERNAL-REPOSITORY-OBSERVATION"` (`codex-pretool-guard.mjs`'s
`hostBoundary` branch). The sandboxed workspace cannot attest the host
repository preimage, so the guard hands back `nextAction.kind:
"external-operator"`, `executionBoundary: "attended-host-terminal"`,
`invocation: "user-copy-only"` and an `action.command` field carrying the
raw shell command a human must run at that boundary — never something this
session executes itself. That `command` is a single argv string and can be
long: it commonly embeds a version-dependent absolute path (a plugin cache
directory keyed by marketplace name and version/timestamp/commit-oid).

Rendering that string as ordinary chat/terminal prose — a single line left to
wrap wherever the display column happens to fall — is the exact failure this
case documents. A live Codex greenfield test hit it directly: the long path
wrapped mid-token in the rendering pipeline, splitting the copy-pasted command
into two separate shell invocations. The first failed with `MODULE_NOT_FOUND`
on the truncated path fragment; the second executed as an unrelated stray
command built from the remainder. The agent then improvised a manual
multi-step recovery, which the PO rejected outright as not the happy path.

**Rendering rule:** split the command into its logical argv tokens (or one
short, logically-atomic flag+value pair, e.g. `--root '<path>'`) and render
exactly one per physical line. Every line except the last ends with a single
explicit continuation character for the target shell — a trailing backslash
(`\`) for a POSIX shell (Bash/zsh), a trailing backtick (`` ` ``) for
PowerShell, a trailing caret (`^`) for `cmd.exe`. Never split in the middle of
a single token, and never split in the middle of an absolute path. A command
left to wrap at an arbitrary display column, with no explicit continuation
character inserted at a token boundary, is precisely the failure this case
exists to prevent.

**Worked example.** Given a returned `action.command` such as:

```
node /home/<user>/.codex/plugins/cache/<marketplace>/pipeline-core/0.5.4+codex.<timestamp>.<oid>/scripts/project-onboarding-v3.mjs inspect --root /home/<user>/src/<project>
```

WRONG — a single unbroken line that a display is free to wrap anywhere,
including mid-path:

```
node /home/<user>/.codex/plugins/cache/<marketplace>/pipeline-core/0.5.4+codex.<timestamp>.<oid>/scripts/project-onboarding-v3.mjs inspect --root /home/<user>/src/<project>
```

RIGHT — explicit token-boundary continuation, one argv element per line, no
token or path ever split:

```
node \
  /home/<user>/.codex/plugins/cache/<marketplace>/pipeline-core/0.5.4+codex.<timestamp>.<oid>/scripts/project-onboarding-v3.mjs \
  inspect \
  --root /home/<user>/src/<project>
```
