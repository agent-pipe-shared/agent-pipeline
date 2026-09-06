# Why `guard-dispatch-budget.mjs` never fires — measured 2026-09-06

## What was measured

A temporary `PreToolUse` hook on the `Bash|Read` matcher in the user-level
`~/.claude/settings.json` appended one compact JSON line per payload
(`scratch/payloadcapture-hook.mjs`, sink `scratch/payloadcapture-sink.mjs`,
log `~/.claude/payload-capture-PAYLOADCAP-9Q2M.jsonl`). Two goldfish
dispatches (`NVA-B-DOCDRIFT-1`, `NVA-B-CASPREFLIGHT-1`) ran concurrently
while the orchestrating session also issued its own calls.

## Finding 1 — the discriminator the guard reads does not exist

Every captured payload, from a dispatched subagent as much as from the
orchestrator, carries the PARENT session's transcript:

    transcript_path: /home/<user>/.claude/projects/<project>/<session-id>.jsonl
    session_id:      <the orchestrating session's id>

No payload carried a `.../subagents/agent-<id>.jsonl` path. The only line in
the log with such a path is the synthetic fixture the diagnosis script fed in
on purpose. `guard-dispatch-budget.mjs` discriminates a subagent by matching
`transcript_path` against that subagent-transcript shape, so its counter never
attributes a call to a dispatch — which is exactly the observed behaviour
(a dispatch ran 34 tool calls with the counter unmoved).

## Finding 2 — the real discriminator is the key set

A subagent's payload carries two keys that an orchestrator payload does not:

    agent_id, agent_type

Orchestrator call, keys:
`cwd, effort, hook_event_name, permission_mode, prompt_id, scratchpad_dir,
session_id, tool_input, tool_name, tool_use_id, transcript_path`

Subagent call, keys: the same **plus** `agent_id` and `agent_type`.

`agent_type` additionally names which agent definition is running, so a budget
could be tiered per agent type rather than fixed.

## Finding 3 — the hook that measured this was itself dead for the same class of reason

The first installed version of the capture hook wrote nothing for hours while
appearing correctly registered in `/hooks`. Cause, measured by running the
exact string out of `settings.json` through `bash -c`
(`scratch/payloadcapture-diagnose.mjs`): the inline `node -e "<program>"`
carried the log path in double quotes inside a double-quoted program, the
shell stripped the inner pair, and node died on a SyntaxError. A `PreToolUse`
hook exiting non-zero-but-not-2 reports only to the user, so the failure was
invisible from inside the session. The sink is now a file
(`scratch/payloadcapture-sink.mjs`), which has no quoting surface.

Two carry-over rules, both cheap:

- Test the string that is actually installed, read back from where it is
  installed — not a re-typed reconstruction of it. The earlier self-test
  (`scratch/hooktest.mjs`) passed because it escaped the path differently than
  the installer did.
- A hook whose only failure signal is a user-visible non-zero exit needs its
  own liveness readback; "registered" is not "running".

## Also observed

A user-level `settings.json` hook change took effect without a session
restart: the log started filling on the next tool call after `install`. The
documented restart requirement applies to the plugin's own `hooks.json`, not
to this file.

## Consequence for the pending work

Decision-queue item 3 is answered, so the shared TP-4 `hooks.json` ceremony is
no longer blocked on it. `guard-dispatch-budget.mjs` needs its discriminator
changed from the transcript-path shape to the presence of `agent_id`, with a
test that pins both payload shapes; that is a guard change and belongs in its
own dispatch, not in the ceremony.
