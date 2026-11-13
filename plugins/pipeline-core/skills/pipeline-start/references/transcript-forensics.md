# Transcript forensics — mining a runner's own session transcript for happy-path defects

This is a METHOD reference for the **Elephant** preparing a forensic-analysis
dispatch (a read-only `Explore` agent with an explicit model, or the Elephant itself
running `usage-ledger.mjs --timeline`; a `general-purpose` subagent is refused by the
dispatch guard with `DISPATCH-WRITE-CARRIER-REQUIRED`) after a live greenfield
test session. It is not a runtime component — nothing here executes
automatically, and it is not a Goldfish/Critic-facing document. Load it when
about to write such a dispatch, not as part of ordinary bootstrap.

The technique: point a fresh-context subagent at the raw transcript file(s)
of a just-finished live test session (Claude Code or Codex, or both) and
have it independently confirm or correct every claim in the PO's and the
runner's own self-reports against exact evidence. A summary reconstructed
from memory is not evidence; a quoted line from the transcript is.

## What to grep for, by transcript format

### Claude Code JSONL

- `tool_use` entries — the full record of what the runner actually invoked,
  in order, including arguments; do not trust a prose recap of "what I did".
- `isSidechain: true` — marks a subagent dispatch (Task tool). Use this to
  reconstruct which turns belong to a dispatched Goldfish/Critic vs. the
  Elephant's own top-level turns; a flat read of the file interleaves both.
- `name: "Agent"` / `name: "Task"` tool-use entries — the dispatch call
  itself; its `input` carries the briefing text actually sent, which may
  differ from what the Elephant's own narration claims it sent.
- Tool-result entries (`tool_result` / `is_error`) paired to each `tool_use`
  by `tool_use_id` — a denied command shows up here with the guard's exact
  refusal text, not just "it failed".

### Codex rollout JSONL

- `exec_command` entries — the equivalent of `tool_use` for Codex: the exact
  shell invocation, its `cwd`, and its exit status.
- `response_item` payloads of type `function_call` and `custom_tool_call` — the
  two call forms. A code-mode `exec` is one `custom_tool_call` that can run
  several tools; count nested tools separately from top-level calls.
- `sandbox_permissions` — the sandbox mode/approval policy in force for a
  given command; compare across the session to catch an unexplained
  escalation (e.g. read-only -> workspace-write) that was never surfaced to
  the human.
- `session_meta` — carries the thread/session id. A Codex session that
  restarts (e.g. after a compaction or a host-boundary handoff) writes a
  **new** rollout file; use `session_meta`'s parent/thread linkage to stitch
  the pre-restart and post-restart files back into one timeline before
  drawing any conclusion about what happened "across the restart" — reading
  only the final file silently drops everything before it.
- A dispatched child has its own thread id. Naming the parent as the current
  session in a prior-session selection is refused with
  `MODEL-ROLE-SESSION-IDENTITY-CONFLICT`, by design: the host's identity wins
  over a claim. Let the coordinator capture the source and hand the child the
  captured file.

## Standard categories to check every time

State each as a concrete question against the actual transcript, not as a
general impression:

1. **Dispatch discipline.** Did every implementation step run under a
   dispatched Goldfish (not the Elephant editing files directly)? Was a
   Critic review actually dispatched and did it return a result before the
   block was treated as done — or was "the Critic will review this" the last
   thing said about it?
2. **Docs vs. machine state.** Does a generated/durable doc the runner wrote
   or read (e.g. `docs/state.md`, a manifest, a stamped version file) match
   what the transcript shows the machine actually did (files present,
   commits made, verify results)? A doc claiming a step happened is not
   itself evidence that it happened.
3. **Guard false positives.** Did any guard refuse a command that was
   read-only or purely informational and should have been admitted? Quote
   the exact refusal text and the exact command that triggered it.
4. **Human-terminal command safety.** Where the transcript rendered a raw
   shell command for a human to copy-paste (an external-operator boundary),
   was it split at token boundaries with explicit continuation characters,
   or left to wrap at an arbitrary display column? A wrapped long path is a
   silent corruption of the command, not a cosmetic issue.
5. **Restart / context-loss behavior.** When the session restarted or was
   compacted, was material context (goal, constraints, open questions)
   actually preserved, and was a resume-hint captured before the restart and
   consumed after it — or did the post-restart session start from a blank
   slate while the transcript shows it claiming continuity?
6. **Escalation / approval / friction count.** Roughly how many times did
   the runner have to ask for a human decision, retry a denied command, or
   hit an approval gate? A high count in a segment that should have been
   routine implementation is itself a finding, independent of whether any
   single instance was individually correct.

## Counting rules

- Count a refusal only from a call paired with its result. An error code in a
  document the session merely loaded is not a refusal, so plain string
  matching over the file overcounts.
- Sum tokens from per-response usage records only, never together with the
  cumulative turn or thread counters or a second record form of the same
  response. Cached input is not a price and not a count of words read.
- A session span is not working time: it contains idle and parallel periods.
- A missing raw transcript means "not established", never zero.
- A `chat-gate-ceremonies/*.terminal-observed.json` record is one entry
  lifecycle reaching its terminal phase (`reserved`, `running`,
  `terminal-observed`). It is not a chat approval, so never count these files
  as approvals by the human.

## The run timeline: `usage-ledger.mjs --timeline`

`node plugins/pipeline-core/scripts/usage-ledger.mjs --timeline <transcript-file> [--json]` reads ONE session
file (Claude project JSONL, Codex rollout, Antigravity transcript; the format is detected from the content) and
prints, path-free: every human turn (time, length in characters, never the text), each turn's duration from the
human message to the last response before the next one, the human wait between turns, run time gross / human wait /
net, per-response token usage with its actor (`main` or `subagent:<name>`), and refusals per code (a coded denial
in a tool result; Claude: an error result, Codex: an output that says blocked, denied or refused). `--json` prints
the same figures as `pipeline.usage-timeline.v1` (`null` where the text says `n/a`). A field the format does not
carry is `n/a`, never a guess. The Antigravity brain transcript (`.system_generated/logs/transcript.jsonl` of the
conversation) carries the human input (`USER_INPUT`), each model step with exact timestamps and input, cache-read and
output tokens (`PLANNER_RESPONSE`) and each tool result (`GENERIC`), so all figures are measured; only the older
`turn.started`/`turn.completed` form has no human message or tool result, and there turns, wait, net time and refusals
are `n/a`. Run it per file: a subagent file is its own run, and a restarted Codex session
needs each rollout file read in turn. It is exclusive with `--row` and `--metering`.

## Report shape — one section per claim, independently traceable

Structure the forensic-analysis report as one section per claim under
investigation (a claim from the PO's report, from the runner's own
self-report, or a category above worth checking regardless of whether
anyone claimed anything about it). Each section states exactly one of:

- **Confirmed** — the transcript directly supports the claim.
- **Partially confirmed** — the transcript supports part of the claim but
  contradicts or is silent on another part; state which part is which.
- **Not found in transcript** — the claim has no supporting evidence in the
  material actually available, whether or not it might still be true.

Every verdict carries its evidence inline: an exact quoted error string, an
exact command as invoked, an approximate timestamp or line/entry number in
the source file. A verdict with no quoted evidence is not a finding — it is
the same unverified claim restated with a label on it, and the next reader
has no way to re-locate what was checked.

## Not automatic, not a gate

This reference does not run itself and does not gate anything. It exists so
the next Elephant preparing a forensic-analysis dispatch starts from a
checklist instead of reconstructing the technique from a blank page, as
happened the first two times this was done in the same session.
