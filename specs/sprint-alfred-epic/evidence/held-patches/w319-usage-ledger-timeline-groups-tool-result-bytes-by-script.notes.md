# w319 — `usage-ledger --timeline` lists the bytes of every tool result grouped by script and by refusal code (candidate 31, item M0 of the main-context recon, C31-B9)

Chained patch: it is the delta on the base clone of candidate 31 (after the held patch of C31-B5, `w315`, which edits the same two files) and does NOT apply to the real checkout until that base clone is applied first (`apply --check` against the integration clone: exit 0; against the real repository: exit 1, expected). Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt); the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only.

## What it adds

`usage-ledger.mjs --timeline <file> [--json]` keeps every existing line byte-identical and appends, after the `TOTAL:` line, a table (no new flag):

```
Tool results (UTF-8 bytes of the result text):
By script or tool:
- script:<name> | count <n> | bytes <total> | largest <max> | share <p> %
- tool:<name> | ...
By refusal code (a refused result is also counted above):
- <CODE> | count <n> | bytes <total> | largest <max> | share <p> %
```

- **What is counted.** The UTF-8 byte length of the result TEXT as the transcript decodes it: not tokens, not the JSONL record, not the characters (the fixture has one two-byte character to tell them apart). A result whose content is a list of text blocks is summed block by block (no separator byte); a non-text block counts 0. Share = bytes / all tool-result bytes of the file, one decimal.
- **Grouping by script.** The group is `script:<name>` when the call's command contains `node <...>/scripts/<name>.mjs` (either path separator, optional quotes, node flags such as `--test`), else `tool:<tool name>`. Only a name from `[A-Za-z0-9._:-]{1,80}` is ever printed (`tool:other` otherwise); a result with no matching call prints as `tool:unknown`. Never a path, an argument or result text.
- **Refusal rows.** The code and its detection are the existing ones (`timelineRefusal` and the per-runner rules), so the code rows equal the existing `Refusals:` section (asserted). Overlap is stated in the heading: every result counts under its script or tool (those shares sum to 100 %); the code rows are a second breakdown over the same denominator.
- **Linking a result to its call.** Claude: `tool_use` blocks (`id`, `name`, `input.command`, every raw assistant record scanned because a streamed message repeats them) to `tool_result.tool_use_id`. Codex: `function_call` (JSON `arguments`, `cmd` or `command`, string or argv list), `custom_tool_call` (raw `input`, except `apply_patch`) and `local_shell_call` (`action.command`) to the output by `call_id`.
- **Antigravity brain transcript.** A `GENERIC` step carries `content` and `error` but nothing in the repository (code, tests, forensics reference) shows how it names the call it answers, and no real transcript was read. So its results are counted under one honest group `tool:not-recorded` (code rows still work) and the table says: "this transcript layout does not record which tool produced a result, so results are not grouped by script." The older `turn.started`/`turn.completed` form carries no tool result and prints `Tool results: n/a (this format records no tool result)`, not zeros. A file of an observed layout with no tool result prints no table.
- **Sidechain.** A Claude tool result is counted wherever it sits, including a subagent file whose records are marked sidechain (the human-turn rules do not apply to a result). The existing refusal logic is untouched and still skips those records, so inside a subagent file a refused result appears under its script or tool but not in the code rows; this keeps the code rows equal to the existing Refusals section.
- **`--json`.** One new top-level key `toolResults` (`{count, bytes, groups: [{name, count, bytes, largest}], refusalCodes: [...]}` or `null` for the older Antigravity form), derived at read time, nothing stored. `totals`, `refusals` and all other keys are unchanged; the schema string stays `pipeline.usage-timeline.v1` (additive key).

## Tests (test first)

Six new cases in `usage-ledger.test.mjs` (RED against the base: 6 failed, 21 passed; the six all failed for the missing table or key): Claude, Codex and Antigravity fixtures with results of known size from two scripts, a tool-name result (50 bytes with one two-byte character) and one refusal, exact bytes, counts and shares, the table after `TOTAL:`, the code row equal to the `Refusals:` line, no marker text, no path; a Claude file without tool results (no table, `toolResults` zeros); a failure-class case (streamed duplicate `tool_use`, text-block list, orphan result id, Windows path, a tool name outside the closed set, a sidechain result); the older Antigravity form (unavailable line, `null`) and a brain transcript without results (no table). GREEN: `usage-ledger.test.mjs` 27 of 27 (baseline before: 21 of 21). No existing case was changed, so no pin needed restating (QG-04): every existing timeline assertion is a regex over lines that stay as they were.

## Deliberately not changed / open items

- B4 (file plus short line for `inspect` and `finish-feature --one-shot`) is not built; this patch only produces the measurement that decides it.
- Documents that describe `--timeline` (`skills/pipeline-start/references/transcript-forensics.md`) are outside the write list and do not yet name the table.
- No input-token share is computed (the table is bytes of results, the recon's M0 scope); turning bytes into a share of the 64.5 percent is the reader's step.

## Not proven

- No real transcript of any runner was read: the Claude and Codex shapes come from the existing readers and tests, the Antigravity `GENERIC` step from the existing fixture. Whether a real Codex shell call carries its command under `cmd`, `command` or inside `input` (and a real Antigravity step names its tool in some field) is NOT MEASURED; a call whose command is not found lands under its tool name, never under a wrong script.
- No Full Verify and no Critic round ran; the DoD sentence "the patch applies to the real HEAD" was not run (the patch is chained, see above).
