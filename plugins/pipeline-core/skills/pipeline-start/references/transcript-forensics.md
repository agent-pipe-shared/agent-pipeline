# Transcript forensics — mining a runner's own session transcript for happy-path defects

This is a METHOD reference for the **Elephant** preparing a forensic-analysis
dispatch (typically a `general-purpose` subagent) after a live greenfield
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
