> **Persisted 2026-09-06** from the read-only positioning session's scratch
> output `scratch/kanalprobe-result-2026-09-06.md`, verbatim apart from this header and
> the cross-reference paths noted below. Design input for the 0.6.2
> documentation block (D.1–D.6 in the handover file), not canon: nothing in
> it is a decision until an ADR, a guardrail, or `docs/state.md` says so.
> Status tags inside it (LIVE / CLI / CONTRACT / BUILT-NOT-WIRED / ROADMAP)
> are load-bearing and must not be rounded up.

# Kanalprobe KANALPROBE-7X4K — result (2026-09-06)

Question: does `hookSpecificOutput.additionalContext` from a **PreToolUse** hook reach the MODEL
(not just the human terminal)?

## Result: row 1 — channel confirmed, live and mechanically.

The probe hook (`scratch/kanalprobe-hook.mjs install`, matcher `"Read"` at install time) was
installed in `~/.claude/settings.json`, Claude Code restarted, and in the fresh session the
first `Read` tool call produced, verbatim, in the tool-result channel:

```
PreToolUse:Read hook additional context: KANALPROBE-7X4K: if you can read this marker, additionalContext reaches the model.
```

Why this is not guessing although the model had seen the marker string in the script:

- The prefix `PreToolUse:Read hook additional context:` is not in the script; it is produced by
  the runtime's renderer (`\`${e.hookName} hook additional context: …\``, `hookName =
  \`PreToolUse:${t.name}\``), and it was predicted from the binary before it appeared.
- The on/off pattern matches the matcher exactly: ~15 Bash calls in the same session → no
  marker; first Read call → marker. Matcher was `"Read"`.
- The hook fired **on a failing tool call** (`pipeline.json` did not exist) — PreToolUse runs
  before execution.

## Static corroboration (Claude Code 2.1.263, `~/.local/share/claude/versions/2.1.263`)

1. Schema: PreToolUse variant of `hookSpecificOutput` includes `additionalContext:s().optional()`.
2. Normaliser keeps it (`f=m3(e,"additionalContext",…)`; cap 8000 chars).
3. Mapping: `case"PreToolUse": D.additionalContext=…` → `_Sn(…)` → `additionalContexts`.
4. Emission: `yield{type:"additionalContext", message:{message:fn({type:"hook_additional_context",
   content:…, hookName:\`PreToolUse:${t.name}\`, hookEvent:"PreToolUse"})}}`.
5. Consumption: `case"additionalContext": if(!Ji(o.agentContext)) ke.push(vn.message)` with
   `Ji = e?.agentType==="subagent" && e.delegatedObservation===true` → dropped ONLY for
   delegated-observation subagents; `ke` is the function's return value.
6. Renderer: `hook_additional_context:(e)=>[Te({content:\`${e.hookName} hook additional
   context: ${e.content.join("\n")}\`, isMeta:!0})]` — **no event filter** (contrast
   `hook_success`, which returns `[]` unless SessionStart/UserPromptSubmit/UserPromptExpansion).

Live corroboration of the renderer in the same session: `SessionStart hook additional context:
…` and `Stop hook additional context: …` both reached the model unprompted.

## Limits relevant to the build (guard-slicing increment 1)

- Dropped for subagents with `delegatedObservation` — main loop unfiltered.
- `additionalContext` capped at 8000 chars.
- Probe design flaws fixed/noted: matcher must be `"Read|Bash"` (auto-mode sessions read via
  `cat`, a pure `Read` matcher yields a false "marker nowhere"; corrected in the script the same
  day); `--continue` carries the marker into the new session's context and would invalidate the
  evidence — a fresh session is required.

Cleanup: `node scratch/kanalprobe-hook.mjs remove` was run 2026-09-06; the running session
keeps the hook until restart.
