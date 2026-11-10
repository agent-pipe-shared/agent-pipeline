# C28 held patch: the usage ledger prints a run timeline for all three runners

Slice `C28-FORENSICS-TIMELINE`. Closest criterion: AC-108. PRD and Spec unchanged. Built in the clone of the candidate 28 integration state,
saved as `c28-forensics-timeline.patch`. Nothing was committed in the real checkout.

## What

1. **`usage-ledger.mjs --timeline <file> [--json]`.** Exclusive with `--row` and `--metering` (typed usage error `--timeline is exclusive ...`); takes no
   transcripts root. It reads ONE session file, detects the format from the content (Claude project JSONL, Codex rollout JSONL, Antigravity
   transcript) and prints, in English and path-free: every human turn (time, length in characters), each turn's duration (human message to the last
   response before the next human message), the human wait after it, per response the token usage with the actor, refusals per code, and a `TOTAL`
   line: run time gross, human wait, run time net (gross minus wait), refusals, human turns. `--json` prints the same data as
   `pipeline.usage-timeline.v1` (`null` where the text prints `n/a`). Unreadable input is `timeline-input-unreadable`, an unrecognised file is
   `timeline-format-unknown`; neither names a path.
2. **Formats.** Claude: human turn = a `user` row that is not meta, not sidechain and holds no `tool_result`; usage per `message.id` (the last record of an id
   wins, as the table does); a refusal = an error `tool_result` whose text carries a code. Codex: human turn = `event_msg` `user_message`; usage =
   `token_count` `last_token_usage`; a turn ends at its last assistant message, `token_count` or `task_complete`; a refusal = a tool output that says
   blocked, denied or refused and carries a code. Antigravity: `turn.completed` usage only; human turns, wait, net time and refusals print `n/a`.
   A code is upper-case words joined by hyphens, each starting with a letter, so `UTF-8` or `SHA-256` never count.
3. **Actor.** The table and row modes' derivation (`subagents/` in the path means `subagent:<file basename>`, otherwise `main`) is now one helper over
   path segments; the timeline reads the file path with both separators, so a Windows path with a drive letter works.
4. **Doc.** `transcript-forensics.md` named a `general-purpose` subagent, which the dispatch guard refuses (`DISPATCH-WRITE-CARRIER-REQUIRED`); it now
   names the `Explore` agent type with an explicit model or the Elephant running `--timeline`, and has a short section on the new mode.

## Proof

Test-first: six cases were written and run red (6 failed, 6 passed) before the first production edit, then green (12 of 12). They sit in the registered
`usage-ledger.test.mjs`: Claude text (dedup, meta row ignored, a code in a non-error result not counted, turn arithmetic 90 s gross / 60 s wait / 30 s net,
no message text, no path), `--json`, subagent actor, Codex, Antigravity with `n/a`, exclusivity and the typed errors. Fixtures are small fakes. The existing
table, `--row`, `--latest`, `--session` and `--metering` cases pass unchanged. `c28-forensics-timeline.check.test.mjs` pins that the patch is
non-empty and stays under `plugins/pipeline-core/`.

One written correction after implementation: the Codex fixture's expected first-turn duration was 5.0 s, an arithmetic slip against the briefed rule (a turn
ends at the last response, and `task_complete` is Codex's own turn-end record at 9 s); it is 8.0 s. The assertion was not weakened.

## Not changed

- Table, `--row`, `--latest`, `--session`, `--metering` output; the Critic preimage files; protected tests; PRD and Spec.
- No subagent files are folded into the parent: a subagent file is its own run, read by its own `--timeline` call.

## Not proven

- Antigravity: the fields (`turn.started`, `turn.completed`, `usage.cached_tokens`, `timestamp`) follow the shape `runner-transcript-recovery.mjs` measures; no real
  `transcript.jsonl` was opened, so whether that file carries timestamps on those records is not established (they print `n/a` if absent).
- Codex refusals rest on the output text saying blocked, denied or refused plus a code; a denial worded otherwise is not counted. The first matching code in a result is
  the one counted, so an upper-case hyphenated word earlier in a denial text would be taken for it.
- Native Windows: path handling splits both separators and nothing spawns a shell; not run on Windows here.
