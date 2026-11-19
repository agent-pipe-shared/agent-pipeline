#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * usage-ledger.mjs — token-usage aggregation from local Claude Code project transcripts.
 * Extended to also emit a close-block cost row (see the --row mode below).
 *
 * Reads the JSONL session transcripts Claude Code writes under
 * `<user-home>/.claude/projects/<project-dir>/` — both the top-level session files
 * (`<sessionId>.jsonl`) and the per-subagent transcripts under
 * `<sessionId>/subagents/agent-*.jsonl` — and aggregates token usage per
 * (project directory, session, model).
 *
 * Two-machine rule (GL-03): the transcripts root is NEVER hardcoded — it is the
 * mandatory first CLI argument. Nothing under `.claude/projects` is machine-portable,
 * so this script must never assume a path.
 *
 * Read-only: this script only opens transcript files for reading; it never writes,
 * modifies or deletes anything under the transcripts root. Besides the transcript files it
 * reads: the optional `--prices` file (Claude path; default: `model-prices.json` next
 * to this script, resolved from the script's own location — never the process cwd —
 * so the default works regardless of the invoking directory), and, for the
 * Antigravity/Codex rows only, the list-price table `../config/model-list-prices.json`
 * and (Antigravity without `--model`) `pipeline.user.yaml` in the working directory.
 *
 * Two output modes:
 *   - Default (no `--row`): full markdown table to stdout, one row per
 *     (project, session, model) — token counts only. CLI/flag behavior and stdout
 *     structure are unchanged since the initial implementation, but the message.id
 *     dedup fix (see schema notes) changes the resulting token VALUES in BOTH
 *     output modes on purpose — the old root-only "byte-identical" regression
 *     contract is deliberately SUPERSEDED for numbers (per-record summing was the
 *     bug); only the CLI/flag/format contract still holds byte-for-byte.
 *   - `--row [label]`: ONE MP-20-compatible fragment (token counts + an ESTIMATED
 *     $ figure per model, from `--prices`) instead of the full table — meant to be
 *     pasted into the close-block ritual's `telemetry/costs.md` row (token half
 *     "collected", $ half always marked "estimated" — real session-$ is not
 *     machine-readable). Path-free and English-language. Also carries a turn-count
 *     / tool-call-count breakdown per (model, actor) — see "Activity accounting"
 *     below. Same discipline as the token half: no transcript content, no
 *     absolute path, nothing written to disk — counts only, printed to stdout.
 *
 *   - `--row [label] --antigravity-transcript <file> [--model <name>]` (exclusive, takes no root): a token row for ONE Antigravity brain
 *     transcript (input, output and cache-read tokens summed over its model steps). The transcript records no model, so the model is
 *     `--model`, else the project's configured implement route (`pipeline.user.yaml`, read from the working directory); with neither
 *     the row says "model not recorded; pass --model <name>" and prints no dollar figure.
 *   - `--row [label] --codex-rollout <file>` (same shape, no `--model`): the last complete cumulative token total of ONE Codex rollout
 *     under the model named in its `turn_context`.
 *     For both, the dollar half is an ESTIMATE from the labelled list-price table `../config/model-list-prices.json` (third-party
 *     list prices, never printed as exact: "approx" and the table's asOf date are always shown); a model without a listed price
 *     leaves the dollar half unavailable with the reason "no list price for <model>".
 *
 *   - `--timeline <transcript-file> [--json]` (exclusive with `--row` and `--metering`; takes no root): the run
 *     timeline of ONE session file in any of the three runner formats (Claude project JSONL, Codex rollout JSONL,
 *     Antigravity transcript, detected from the content): human turns, per-turn duration, human wait, net run time,
 *     per-response usage with actor, refusals per code. `--json` prints the same data as
 *     `pipeline.usage-timeline.v1`. Counts, times and codes only; never message text or a path; `n/a` where the
 *     format carries no such field. After the TOTAL line it prints the bytes of every tool result (UTF-8 bytes of the
 *     result text) grouped by the script its call ran (else the tool name) and by refusal code, with count, total, largest
 *     and share of all tool-result bytes (`toolResults` in `--json`); the Antigravity brain transcript does not name the
 *     tool of a result, so it prints one `tool:not-recorded` group; the older Antigravity form prints `n/a`.
 *
 * Session scoping: `--session <uuid>` restricts aggregation to one session (incl.
 * its subagent transcripts, via the shared `sessionId` field — see schema notes
 * below); `--latest [projectDirName]` resolves the most recently modified top-level
 * session file in the given (or sole) project directory and uses ITS session id,
 * printing which file it chose to stderr (self-evidence) before continuing.
 *
 * Schema notes (learned by inspecting real transcripts, not assumed):
 *   - Each JSONL line is one record; not every record carries usage (only
 *     `type === "assistant"` records do). Other record types (user, attachment,
 *     queue-operation, last-prompt, ...) are skipped.
 *   - **PROVEN duplication fact (confirmed by two independent probes against real
 *     transcripts): the harness writes one JSONL record per content-block/
 *     stream-update, and REPEATS the identical `message.usage` object across all
 *     of a message's records — e.g. 169 assistant-usage records / 80 unique
 *     `message.id` in the first probe (44 ids repeated, max 5x); a second probe on
 *     a larger transcript found 193/93 (50 duplicated ids, up to 4x) with EVERY
 *     duplicate set byte-identical (never cumulative/growing).** Naive per-record
 *     summing therefore double- (up to 5x-) counts tokens. Fix: dedupe per
 *     (transcript file, `message.id`) — the LAST record seen for an id is kept,
 *     all earlier ones for the same id in the same file are dropped (duplicates
 *     being identical, "last wins" is equivalent to "first wins" here, but "last"
 *     is the declared, deterministic rule). Records that lack `message.id` (none
 *     observed in real transcripts so far, but the field is not guaranteed by
 *     defensive reading) cannot be deduped and fall back to per-record
 *     counting, each occurrence counted individually — surfaced as a stderr
 *     diagnostic so an unexpected id-less record is never silently invisible.
 *   - Assistant records carry `message.model` (e.g. "claude-sonnet-5",
 *     "claude-fable-5", "claude-haiku-4-5-20251001", "claude-opus-4-8") and
 *     `message.usage` with `input_tokens` / `output_tokens` /
 *     `cache_creation_input_tokens` / `cache_read_input_tokens`.
 *   - `message.usage.cache_creation` MAY carry a TTL breakdown
 *     (`ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`) — present on
 *     observed records; this breakdown may be absent on other
 *     records/harness versions, so it is read defensively: when present it drives
 *     the per-TTL price split, when absent the whole `cache_creation_input_tokens`
 *     amount is treated as 5m-rate (a DECLARED assumption, surfaced in the `--row`
 *     output's peculiarities note — never silently guessed).
 *   - `message.model === "<synthetic>"` marks harness-internal synthetic messages
 *     (e.g. an auth-failure stub) with zero real usage — excluded from the ledger.
 *   - The top-level `sessionId` field is present on BOTH main-session records and
 *     subagent-transcript records and always equals the parent session's UUID —
 *     this is what lets subagent token spend roll up into its parent session
 *     without extra bookkeeping, and what `--session`/`--latest` filter on.
 *     A directory-derived fallback covers the rare record that lacks the field.
 *   - Malformed/unparseable lines are skipped, counted, and reported as a
 *     diagnostic — never treated as a hard error (transcripts are append-only
 *     logs from a live product, not a controlled fixture).
 *
 * Activity accounting (turn count / tool-call count, NVA-W4-02B):
 *   - "actor" distinguishes the top-level session transcript ("main") from a
 *     subagent transcript ("subagent:<basename>", basename taken only from the
 *     file name — e.g. `agent-<uuid>` — never a path). Derived purely from a
 *     file's location relative to the transcripts root (any path segment named
 *     "subagents" marks it a subagent transcript), independent of record
 *     content.
 *   - "turn" = one distinct assistant message. Same identity the token half
 *     already relies on (`message.id`, deduped — see the PROVEN duplication
 *     fact above): every record sharing one `message.id` is one turn, counted
 *     once, regardless of how many stream-update records repeat it. A record
 *     with no `message.id` cannot be deduped and is counted as its own turn
 *     (declared fallback, same convention as the token half).
 *   - "tool call" = one distinct `tool_use` content block, identified by its
 *     own `id` field (e.g. `toolu_...`), which the API never reuses — so
 *     counting is done by scanning `message.content` on EVERY raw assistant
 *     record (not only the deduped-last one) and keeping a set of block ids
 *     per (project, session, model, actor). This is deliberately independent
 *     of whether a duplicate stream-update record repeats the full content
 *     array or only a delta — either way, a genuine tool-use block's id is
 *     seen at least once and never double-counted. A `tool_use` block missing
 *     an `id` (none observed so far, defensive only) cannot be deduped and is
 *     counted individually, surfaced via a diagnostic in `--row` output.
 */
import { closeSync, createReadStream, fstatSync, lstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { USAGE_ATTRIBUTION_LIMITS, UsageIngestionError, summarizeUsageAttribution } from "../lib/runner-usage-v1.mjs";
import { readProjectRouting } from "../lib/runner-profiles-v3.mjs";

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Composite map-key separator: project dir names and Windows paths can never
// contain a colon (reserved char), and session UUIDs / model ids are
// alnum+dash — "::" cannot collide with any real value here.
const KEY_SEP = "::";

// Default price file lives next to this script (repo-relative by construction,
// independent of the invoking cwd).
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PRICES_PATH = path.join(SCRIPT_DIR, "model-prices.json");
// The labelled list-price table of the Antigravity and Codex rows (C31-B11); the Claude path above never reads it.
const LIST_PRICES_PATH = path.join(SCRIPT_DIR, "..", "config", "model-list-prices.json");

function usage(msg) {
  if (msg) console.error(msg);
  console.error(
    "Usage: node plugins/pipeline-core/scripts/usage-ledger.mjs <transcripts-root> [--session <uuid>] [--latest [projectDirName]] [--row [label]] [--prices <path>] | --metering <sanitized-bundle.json...> | --timeline <transcript-file> [--json] | --row [label] --antigravity-transcript <transcript-file> [--model <name>] | --row [label] --codex-rollout <transcript-file>",
  );
  console.error('Example (full table):  node plugins/pipeline-core/scripts/usage-ledger.mjs "$HOME/.claude/projects"');
  console.error(
    'Example (close row):   node plugins/pipeline-core/scripts/usage-ledger.mjs "$HOME/.claude/projects" --latest --row "S1/B2"',
  );
  process.exit(1);
}

// --- 0. Parse CLI arguments: root stays the mandatory first positional (GL-03);
//        everything else is an optional flag. ---
const argv = process.argv.slice(2);

// C32 (Codex greenfield report): a lone --help prints the usage on stdout and exits zero (usage() above is the error path and exits 1).
if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
  process.stdout.write([
    "Usage: usage-ledger.mjs <transcripts-root> [--session <uuid>] [--latest [projectDirName]] [--row [label]] [--prices <path>]",
    "       usage-ledger.mjs --metering <sanitized-bundle.json...>",
    "       usage-ledger.mjs --timeline <transcript-file> [--json]",
    "       usage-ledger.mjs --row [label] --antigravity-transcript <transcript-file> [--model <name>]",
    "       usage-ledger.mjs --row [label] --codex-rollout <transcript-file>",
    "Reads session transcripts and prints a usage table, a close-block cost row or a run timeline; it writes nothing.",
    "",
  ].join("\n"));
  process.exit(0);
}

function readMeteringBundle(file) {
  let descriptor;
  try {
    if (!lstatSync(file).isFile()) throw new Error("not-regular-file");
    descriptor = openSync(file, "r");
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size > USAGE_ATTRIBUTION_LIMITS.maxBundleBytes) throw new Error("oversized-or-nonregular");
    const bytes = Buffer.alloc(before.size);
    if (readSync(descriptor, bytes, 0, bytes.length, 0) !== bytes.length) throw new Error("short-read");
    const after = fstatSync(descriptor);
    if (after.size !== before.size) throw new Error("file-changed-during-read");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

// --- Timeline mode (`--timeline <file> [--json]`): one session's run timeline, read from ONE transcript file. ---
// Formats are detected from the file content: Claude project JSONL, Codex rollout JSONL, the Antigravity brain transcript
// (USER_INPUT / PLANNER_RESPONSE / GENERIC steps) and the older Antigravity form (`turn.started` / `turn.completed` records). Output is path-free and never carries a human message's text or a tool
// result's text; only lengths, times, token counts and refusal codes. A field the format does not carry prints as `n/a`.
const TIMELINE_SCHEMA = "pipeline.usage-timeline.v1";
const TIMELINE_MAX_BYTES = 512 * 1024 * 1024;
// A refusal code: upper-case words joined by hyphens, each starting with a letter (so UTF-8 or SHA-256 never match).
const REFUSAL_CODE_RE = /\b[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+\b/;

const isTimelineObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const timelineMs = (timestamp) => {
  const ms = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
  return Number.isFinite(ms) ? ms : null;
};
const timelineNumber = (value) => (Number.isFinite(value) ? value : null);
const timelineChars = (text) => [...text].length;

// "main" for a top-level session file, "subagent:<basename>" for anything under a `subagents/` directory — the same
// derivation `actorOf` uses for the table/row modes. Both separators are split, so a Windows path works anywhere.
function actorFromSegments(segments) {
  if (!segments.includes("subagents")) return "main";
  return `subagent:${segments[segments.length - 1].replace(/\.jsonl$/u, "")}`;
}

function timelineResultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return isTimelineObject(content) && typeof content.content === "string" ? content.content : "";
  return content.map((block) => (typeof block === "string" ? block : isTimelineObject(block) && typeof block.text === "string" ? block.text : "")).join("\n");
}

// The guard's own denial ("BLOCKED (<hook>): <CODE>", the same on every runner) and a script's typed refusal
// ({"status": "refused" | "blocked", ..., "code": "<CODE>"}) name the code exactly. Only without either form does a Claude
// error result fall back to its first code; a Codex output without either form is not counted, because its text also carries
// success and warning codes (measured on a real rollout: GHCR-COMMITTED, DBG-BUDGET-UNENFORCED were counted as refusals).
const HOOK_DENIAL_RE = /BLOCKED \([^)\n]*\):\s*([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+)/;
const TYPED_REFUSAL_RE = /\\?"status\\?"\s*:\s*\\?"(?:refused|blocked)\\?"[\s\S]{0,400}?\\?"code\\?"\s*:\s*\\?"([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+)\\?"/;
function timelineRefusal(text, requireMarker) {
  const exact = HOOK_DENIAL_RE.exec(text) ?? TYPED_REFUSAL_RE.exec(text);
  if (exact) return exact[1];
  if (requireMarker) return null;
  const match = REFUSAL_CODE_RE.exec(text);
  return match ? match[0] : null;
}

// C31-B9 (M0): the size of a tool result is the UTF-8 byte length of its TEXT as the transcript decodes it (not tokens, not the JSONL
// record; a non-text block such as an image counts 0). A text-block list is summed block by block, so no separator byte is invented.
const timelineBytes = (text) => Buffer.byteLength(text, "utf8");
function timelineResultBytes(content) {
  if (typeof content === "string") return timelineBytes(content);
  if (!Array.isArray(content)) return timelineBytes(timelineResultText(content));
  return content.reduce((sum, block) => sum + (typeof block === "string" ? timelineBytes(block) : isTimelineObject(block) && typeof block.text === "string" ? timelineBytes(block.text) : 0), 0);
}

// A result is grouped by the repository script its call ran (`node <...>/scripts/<name>.mjs`, either path separator, optional quotes
// and node flags), else by the tool name. Only a name from the closed character class is ever printed; anything else prints `other`.
const TOOL_NAME_RE = /^[A-Za-z0-9._:-]{1,80}$/u;
const SCRIPT_RUN_RE = /\bnode\s+(?:-{1,2}[A-Za-z][\w-]*(?:=\S+)?\s+)*["']?(?:[^\s"']*[\\/])?scripts[\\/]([A-Za-z0-9._-]+)\.mjs\b/u;
function timelineToolGroup(name, command) {
  const script = typeof command === "string" ? SCRIPT_RUN_RE.exec(command) : null;
  if (script) return `script:${script[1]}`;
  return `tool:${typeof name === "string" && TOOL_NAME_RE.test(name) ? name : "other"}`;
}

const flattenCommand = (value) => (typeof value === "string" ? value : Array.isArray(value) ? value.filter((part) => typeof part === "string").join(" ") : null);
// The command text of a Codex call: `function_call` carries JSON `arguments` (`cmd` or `command`, a string or an argv list),
// `local_shell_call` an `action.command` argv, a `custom_tool_call` its raw `input` (an `apply_patch` input is a patch, never a command).
function codexCallCommand(payload) {
  if (payload.type === "local_shell_call") return flattenCommand(payload.action?.command);
  if (payload.type === "custom_tool_call") return payload.name === "apply_patch" || typeof payload.input !== "string" ? null : payload.input;
  if (typeof payload.arguments !== "string") return null;
  try {
    const parsed = JSON.parse(payload.arguments);
    return isTimelineObject(parsed) ? flattenCommand(parsed.cmd ?? parsed.command) : null;
  } catch {
    return null;
  }
}
const CODEX_CALL_TYPES = ["function_call", "custom_tool_call", "local_shell_call"];

function summarizeToolResults(events) {
  const groups = new Map();
  const codes = new Map();
  let count = 0;
  let bytes = 0;
  const add = (map, name, size) => {
    const entry = map.get(name) ?? { count: 0, bytes: 0, largest: 0 };
    entry.count++;
    entry.bytes += size;
    entry.largest = Math.max(entry.largest, size);
    map.set(name, entry);
  };
  for (const event of events) {
    if (event.kind === "tool-result") { add(groups, event.group, event.bytes); count++; bytes += event.bytes; }
    else if (event.kind === "refusal" && Number.isSafeInteger(event.bytes)) add(codes, event.code, event.bytes);
  }
  const rows = (map) => [...map].map(([name, entry]) => ({ name, ...entry })).sort((a, b) => b.bytes - a.bytes || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { count, bytes, groups: rows(groups), refusalCodes: rows(codes) };
}

function detectTimelineFormat(records) {
  for (const record of records.slice(0, 200)) {
    if (!isTimelineObject(record)) continue;
    if (["session_meta", "response_item", "event_msg", "turn_context"].includes(record.type)) return "codex";
    if (record.type === "turn.started" || record.type === "turn.completed") return "antigravity";
    // Candidate 29 (AGY run 3, R3): the brain transcript (.system_generated/logs/transcript.jsonl) records numbered steps.
    if (["USER_INPUT", "PLANNER_RESPONSE", "GENERIC"].includes(record.type) && Number.isInteger(record.step_index) && typeof record.created_at === "string") return "antigravity-steps";
    if ((record.type === "user" || record.type === "assistant") && isTimelineObject(record.message)) return "claude";
  }
  return null;
}

// C29 (Codex run 3, C9): a proof-wait.mjs result in a tool output carries the time it waited on a human signature, labelled po-wait.
// That time sits inside an agent turn, so without this it would count as active run time. Only the closed schema line counts.
function timelineProofWaitMs(text) {
  if (typeof text !== "string" || !text.includes("pipeline.signed-proof-wait.v1")) return null;
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let value; try { value = JSON.parse(trimmed); } catch { continue; }
    if (isTimelineObject(value) && value.schema === "pipeline.signed-proof-wait.v1" && value.waitClass === "po-wait" && Number.isSafeInteger(value.waitedSeconds) && value.waitedSeconds >= 0) return value.waitedSeconds * 1000;
  }
  return null;
}

// Normalised events: {kind:"human", ms, chars} | {kind:"response", ms, listed, model, usage} | {kind:"refusal", code, bytes} | {kind:"po-wait", ms} (ms = the duration waited)
// | {kind:"tool-result", group, bytes} (every tool result, with the group of the call that made it; a refusal is one of them).
// `listed` = the response is printed in the per-response usage list; a time-only response just ends a turn.
function claudeTimelineEvents(records) {
  const events = [];
  const byId = new Map();
  const calls = new Map(); // tool_use id -> group; every raw assistant record is scanned (a streamed message repeats its blocks)
  for (const record of records) {
    if (!isTimelineObject(record) || !isTimelineObject(record.message)) continue;
    const ms = timelineMs(record.timestamp);
    const message = record.message;
    if (record.type === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) if (isTimelineObject(block) && block.type === "tool_use" && typeof block.id === "string") calls.set(block.id, timelineToolGroup(block.name, isTimelineObject(block.input) ? block.input.command : null));
    }
    // A tool result counts wherever it sits (a subagent file marks its records as sidechain); the human-turn rules below do not apply to it.
    if (record.type === "user" && message.role === "user" && Array.isArray(message.content)) {
      for (const block of message.content) if (isTimelineObject(block) && block.type === "tool_result") events.push({ kind: "tool-result", group: calls.get(block.tool_use_id) ?? "tool:unknown", bytes: timelineResultBytes(block.content) });
    }
    if (record.type === "assistant") {
      if (message.model === "<synthetic>") continue;
      const usage = isTimelineObject(message.usage)
        ? { input: timelineNumber(message.usage.input_tokens), output: timelineNumber(message.usage.output_tokens), cacheWrite: timelineNumber(message.usage.cache_creation_input_tokens), cacheRead: timelineNumber(message.usage.cache_read_input_tokens) }
        : null;
      const response = { kind: "response", ms, listed: true, model: typeof message.model === "string" ? message.model : null, usage };
      const id = typeof message.id === "string" && message.id ? message.id : null;
      const prior = id ? byId.get(id) : null;
      if (prior) Object.assign(prior, response); // the same message streamed again: one response, last record wins
      else {
        if (id) byId.set(id, response);
        events.push(response);
      }
    } else if (record.type === "user" && record.isSidechain !== true && record.isMeta !== true && message.role === "user"
      // A compact summary, a task notification or another system-sourced prompt is a user row but no human turn (measured on a real run).
      && record.isCompactSummary !== true && record.promptSource !== "system"
      && (!isTimelineObject(record.origin) || record.origin.kind === undefined || record.origin.kind === "human")) {
      const content = message.content;
      if (typeof content === "string") {
        if (content.trim() !== "") events.push({ kind: "human", ms, chars: timelineChars(content) });
      } else if (Array.isArray(content) && content.length > 0) {
        const results = content.filter((block) => isTimelineObject(block) && block.type === "tool_result");
        if (results.length === 0) {
          const chars = content.reduce((sum, block) => sum + (isTimelineObject(block) && block.type === "text" && typeof block.text === "string" ? timelineChars(block.text) : 0), 0);
          events.push({ kind: "human", ms, chars });
        }
        for (const block of results) {
          const waitedMs = timelineProofWaitMs(timelineResultText(block.content));
          if (waitedMs !== null) events.push({ kind: "po-wait", ms: waitedMs });
          if (block.is_error !== true) continue;
          const code = timelineRefusal(timelineResultText(block.content), false);
          if (code) events.push({ kind: "refusal", code, bytes: timelineResultBytes(block.content) });
        }
      }
    }
  }
  return events;
}

// A Codex rollout of 2026-11 records the human's input as a `response_item` user message whose content carries the provenance
// `user` (harness and tool inserts carry another provenance) and has no `user_message` event; an older rollout has the event.
// The provenance form wins when the file has it, so one input is never counted twice.
function codexHumanChars(payload) {
  if (payload.type !== "message" || payload.role !== "user" || !Array.isArray(payload.content)) return null;
  const meta = payload.internal_chat_message_metadata_passthrough?.content_item_metadata;
  if (!Array.isArray(meta) || !meta.some((entry) => entry?.provenance?.type === "user")) return null;
  return payload.content.reduce((sum, block) => sum + (isTimelineObject(block) && typeof block.text === "string" ? timelineChars(block.text) : 0), 0);
}

function codexTimelineEvents(records) {
  const events = [];
  const calls = new Map(); // call_id -> group of the call that the output answers
  let previousCumulativeTotal = null;
  const provenanceForm = records.some((record) => isTimelineObject(record) && record.type === "response_item" && isTimelineObject(record.payload) && codexHumanChars(record.payload) !== null);
  for (const record of records) {
    if (!isTimelineObject(record) || !isTimelineObject(record.payload)) continue;
    const payload = record.payload;
    const ms = timelineMs(record.timestamp ?? payload.timestamp);
    if (record.type === "response_item" && provenanceForm) {
      const chars = codexHumanChars(payload);
      if (chars !== null) { events.push({ kind: "human", ms, chars }); continue; }
    }
    if (record.type === "event_msg") {
      if (payload.type === "user_message" && !provenanceForm) events.push({ kind: "human", ms, chars: typeof payload.message === "string" ? timelineChars(payload.message) : null });
      else if (payload.type === "task_complete") events.push({ kind: "response", ms, listed: false, model: null, usage: null });
      else if (payload.type === "token_count" && isTimelineObject(payload.info) && isTimelineObject(payload.info.last_token_usage)) {
        // C32 (Codex greenfield report): a rollout can repeat one token_count event (same cumulative total, same last response) for the one
        // response it records; a genuine next response always grows the cumulative total, so an unchanged total is a repeat and counts once.
        const total = isTimelineObject(payload.info.total_token_usage) ? JSON.stringify(payload.info.total_token_usage) : null;
        if (total !== null && total === previousCumulativeTotal) continue;
        if (total !== null) previousCumulativeTotal = total;
        const last = payload.info.last_token_usage;
        events.push({ kind: "response", ms, listed: true, model: null, usage: { input: timelineNumber(last.input_tokens), output: timelineNumber(last.output_tokens), cacheWrite: null, cacheRead: timelineNumber(last.cached_input_tokens) } });
      }
    } else if (record.type === "response_item") {
      if (payload.type === "message" && payload.role === "assistant") events.push({ kind: "response", ms, listed: false, model: null, usage: null });
      else if (CODEX_CALL_TYPES.includes(payload.type)) {
        if (typeof payload.call_id === "string") calls.set(payload.call_id, timelineToolGroup(payload.name ?? (payload.type === "local_shell_call" ? "shell" : undefined), codexCallCommand(payload)));
      } else if (payload.type === "function_call_output" || payload.type === "custom_tool_call_output") {
        const waitedMs = timelineProofWaitMs(timelineResultText(payload.output));
        if (waitedMs !== null) events.push({ kind: "po-wait", ms: waitedMs });
        const bytes = timelineResultBytes(payload.output);
        events.push({ kind: "tool-result", group: calls.get(payload.call_id) ?? "tool:unknown", bytes });
        const code = timelineRefusal(timelineResultText(payload.output), true);
        if (code) events.push({ kind: "refusal", code, bytes });
      }
    }
  }
  return events;
}

// The Antigravity transcript records no human message and no tool result, so turns, waits and refusals stay `n/a`.
function antigravityTimelineEvents(records) {
  const events = [];
  for (const record of records) {
    if (!isTimelineObject(record) || record.type !== "turn.completed") continue;
    const usage = isTimelineObject(record.usage)
      ? { input: timelineNumber(record.usage.input_tokens), output: timelineNumber(record.usage.output_tokens), cacheWrite: null, cacheRead: timelineNumber(record.usage.cached_tokens) }
      : null;
    events.push({ kind: "response", ms: timelineMs(record.timestamp), listed: true, model: null, usage });
  }
  return events;
}

// Candidate 29 (AGY run 3, R3), measured on a real run: the brain transcript records the human's input as USER_INPUT (source
// USER_EXPLICIT), each model step as PLANNER_RESPONSE with input_tokens, cache_read_tokens and output_tokens, and each tool result
// as GENERIC (`content`, and `error` when it failed). Every record carries `created_at`. One refusal code per tool result at most.
function antigravityStepTimelineEvents(records) {
  const events = [];
  for (const record of records) {
    if (!isTimelineObject(record)) continue;
    const ms = timelineMs(record.created_at);
    if (record.type === "USER_INPUT" && record.source === "USER_EXPLICIT") {
      events.push({ kind: "human", ms, chars: typeof record.content === "string" ? timelineChars(record.content) : null });
    } else if (record.type === "PLANNER_RESPONSE") {
      const usage = { input: timelineNumber(record.input_tokens), output: timelineNumber(record.output_tokens), cacheWrite: null, cacheRead: timelineNumber(record.cache_read_tokens) };
      events.push({ kind: "response", ms, listed: true, model: null, usage });
    } else if (record.type === "GENERIC") {
      const text = [record.error, record.content].filter((value) => typeof value === "string").join("\n");
      const waitedMs = text === "" ? null : timelineProofWaitMs(text);
      if (waitedMs !== null) events.push({ kind: "po-wait", ms: waitedMs });
      const code = text === "" ? null : timelineRefusal(text, true);
      // The transcript does not say which tool a GENERIC step answers (not measured), so its result cannot be grouped by script.
      const bytes = [record.error, record.content].reduce((sum, value) => sum + (typeof value === "string" ? timelineBytes(value) : 0), 0);
      if (typeof record.error === "string" || typeof record.content === "string") events.push({ kind: "tool-result", group: "tool:not-recorded", bytes });
      if (code) events.push({ kind: "refusal", code, bytes });
    }
  }
  return events;
}

function buildTimeline(format, records, actor, malformed) {
  const runner = format === "antigravity-steps" ? "antigravity" : format;
  const events = format === "claude" ? claudeTimelineEvents(records) : format === "codex" ? codexTimelineEvents(records)
    : format === "antigravity-steps" ? antigravityStepTimelineEvents(records) : antigravityTimelineEvents(records);
  const observed = format !== "antigravity"; // human messages and tool results are recorded (not in the older turn.* form)
  const stamps = records.map((record) => (isTimelineObject(record) ? timelineMs(record.timestamp ?? record.payload?.timestamp ?? record.created_at) : null)).filter((ms) => ms !== null);
  const grossMs = stamps.length > 0 ? Math.max(...stamps) - Math.min(...stamps) : null;
  const humanIndexes = events.flatMap((event, index) => (event.kind === "human" ? [index] : []));
  let waitKnown = true;
  let waitTotal = 0;
  const humanTurns = humanIndexes.map((from, ordinal) => {
    const human = events[from];
    const next = events[humanIndexes[ordinal + 1]];
    const answers = events.slice(from + 1, humanIndexes[ordinal + 1] ?? events.length).filter((event) => event.kind === "response" && event.ms !== null);
    const answerMs = answers.length > 0 ? Math.max(...answers.map((event) => event.ms)) : null;
    const durationMs = human.ms !== null && answerMs !== null && answerMs >= human.ms ? answerMs - human.ms : null;
    let waitAfterMs = null;
    if (next) {
      if (answerMs !== null && next.ms !== null && next.ms >= answerMs) {
        waitAfterMs = next.ms - answerMs;
        waitTotal += waitAfterMs;
      } else if (answerMs === null && next.ms !== null && human.ms !== null && next.ms >= human.ms) {
        waitAfterMs = 0; // the human wrote again before any answer (a queued or interrupting message): nobody waited on the human
      } else waitKnown = false;
    }
    return { ordinal: ordinal + 1, at: human.ms === null ? null : new Date(human.ms).toISOString(), chars: human.chars, durationMs, humanWaitAfterMs: waitAfterMs, last: !next };
  });
  // C29 (C9): a wait on a human signature inside an agent turn is PO wait too; it is added to the human wait and shown on its own.
  const signatureWaitMs = events.filter((event) => event.kind === "po-wait").reduce((sum, event) => sum + event.ms, 0);
  const humanWaitMs = observed && waitKnown ? waitTotal + signatureWaitMs : null;
  const refusals = {};
  for (const event of events) if (event.kind === "refusal") refusals[event.code] = (refusals[event.code] ?? 0) + 1;
  const refusalCount = Object.values(refusals).reduce((sum, count) => sum + count, 0);
  const responses = events.filter((event) => event.kind === "response" && event.listed).map((event) => ({
    at: event.ms === null ? null : new Date(event.ms).toISOString(), actor, model: event.model,
    usage: event.usage && { inputTokens: event.usage.input, outputTokens: event.usage.output, cacheWriteTokens: event.usage.cacheWrite, cacheReadTokens: event.usage.cacheRead },
  }));
  return {
    schema: TIMELINE_SCHEMA, runner, malformedLines: malformed,
    humanTurns: observed ? humanTurns : null, responses, refusals: observed ? refusals : null,
    toolResults: observed ? summarizeToolResults(events) : null,
    totals: {
      grossMs, humanWaitMs, signatureWaitMs: observed ? signatureWaitMs : null,
      netMs: grossMs !== null && humanWaitMs !== null ? grossMs - humanWaitMs : null,
      refusals: observed ? refusalCount : null, humanTurns: observed ? humanTurns.length : null,
    },
  };
}

function renderTimeline(timeline) {
  const na = (value) => (value === null || value === undefined ? "n/a" : String(value));
  const secs = (ms) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);
  const lines = [`# Run timeline (${timeline.runner})`, "", "Human turns:"];
  if (timeline.humanTurns === null) lines.push("- n/a (this format records no human message)");
  else if (timeline.humanTurns.length === 0) lines.push("- none");
  else {
    for (const turn of timeline.humanTurns) {
      lines.push(`- turn ${turn.ordinal} | ${na(turn.at)} | ${na(turn.chars)} chars | duration ${secs(turn.durationMs)} | human wait after ${turn.last ? "none" : secs(turn.humanWaitAfterMs)}`);
    }
  }
  lines.push("", "Responses:");
  if (timeline.responses.length === 0) lines.push("- none");
  for (const response of timeline.responses) {
    const usage = response.usage ?? {};
    lines.push(`- ${na(response.at)} | ${response.actor} | ${na(response.model)} | input ${na(usage.inputTokens)} | output ${na(usage.outputTokens)} | cache-write ${na(usage.cacheWriteTokens)} | cache-read ${na(usage.cacheReadTokens)}`);
  }
  lines.push("", "Refusals:");
  if (timeline.refusals === null) lines.push("- n/a (this format records no tool result)");
  else if (Object.keys(timeline.refusals).length === 0) lines.push("- none");
  else for (const [code, count] of Object.entries(timeline.refusals).sort()) lines.push(`- ${code}: ${count}`);
  if (timeline.malformedLines > 0) lines.push("", `Malformed lines skipped: ${timeline.malformedLines}`);
  const totals = timeline.totals;
  lines.push("", `TOTAL: run time gross ${secs(totals.grossMs)} | human wait ${secs(totals.humanWaitMs)}${totals.signatureWaitMs ? ` (of it signature wait ${secs(totals.signatureWaitMs)})` : ""} | run time net ${secs(totals.netMs)} | refusals ${na(totals.refusals)} | human turns ${na(totals.humanTurns)}`);
  // C31-B9 (M0): after the existing lines, so those stay as they were.
  const tool = timeline.toolResults;
  if (tool === null) lines.push("", "Tool results: n/a (this format records no tool result)");
  else if (tool.count > 0) {
    const row = (entry) => `- ${entry.name} | count ${entry.count} | bytes ${entry.bytes} | largest ${entry.largest} | share ${tool.bytes === 0 ? "0.0" : ((entry.bytes * 100) / tool.bytes).toFixed(1)} %`;
    lines.push("", "Tool results (UTF-8 bytes of the result text):", "By script or tool:", ...tool.groups.map(row));
    if (tool.refusalCodes.length > 0) lines.push("By refusal code (a refused result is also counted above):", ...tool.refusalCodes.map(row));
    if (timeline.runner === "antigravity") lines.push("Note: this transcript layout does not record which tool produced a result, so results are not grouped by script.");
  }
  return lines.join("\n");
}

// One transcript file read as JSONL records (a regular file, bounded size); an unreadable file prints `failMessage` (never the path) and exits 1.
function readTranscriptRecords(file, failMessage) {
  let text;
  try {
    const info = lstatSync(file);
    if (!info.isFile() || info.size > TIMELINE_MAX_BYTES) throw new Error("not-readable");
    text = readFileSync(file, "utf8");
  } catch {
    console.error(failMessage);
    process.exit(1);
  }
  const records = [];
  let malformed = 0;
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      malformed++;
    }
  }
  return { records, malformed };
}

// C31-B5 (AC-112, lane L17): `--row [label] --antigravity-transcript <file>` and `--row [label] --codex-rollout <file>` print a
// token row for ONE transcript of those runners. Counts only: no path, no transcript text. C31-B11 (PO decision 2026-11-19): the dollar
// half is an ESTIMATE from the labelled list-price table (LIST_PRICES_PATH), always printed as "approx" with the table's asOf date and
// never as exact; with no usable model or no listed price it stays unavailable and says why. A file without a usable token record prints
// the same sentence as an empty `--row` and exits 0 (a missing row never fails a close).
//   antigravity  the step reader sums input, output and cache-read tokens per model step; the transcript names no model, so the model is
//                the `--model` argument, else the project's configured implement route; cache-read tokens are counted IN ADDITION to
//                input (whether input already includes them is not measured, so this is an upper bound).
//   codex        the last complete cumulative `total_token_usage` of the rollout (the repository's own rule, runner-transcript-recovery
//                `codexUsage`), the model from `turn_context`; Codex defines `input_tokens` to include `cached_input_tokens`, so the
//                uncached part is input minus cached.
const TRANSCRIPT_ROW_FLAGS = ["--antigravity-transcript", "--codex-rollout"];
const ROW_MODEL_RE = /^[A-Za-z0-9._-]{1,80}$/u;
const isRowCounter = (value) => Number.isSafeInteger(value) && value >= 0;

function readListPrices() {
  try {
    const data = JSON.parse(readFileSync(LIST_PRICES_PATH, "utf8"));
    return data !== null && typeof data === "object" && typeof data.asOf === "string" && data.models !== null && typeof data.models === "object" ? data : null;
  } catch {
    return null;
  }
}

// The longest listed name that is a prefix of the model (after the tier/effort suffix is dropped), cut at a "-" boundary so that
// "gemini-3.8-flashy" never prices as "gemini-3.8-flash".
const MODEL_TIER_SUFFIX_RE = /(?:-tiered)?-(?:minimal|low|medium|high|xhigh|max)$/u;
function listPriceFor(table, model) {
  if (table === null) return { reason: "list-price table unreadable: plugins/pipeline-core/config/model-list-prices.json" };
  let name = model.toLowerCase();
  while (MODEL_TIER_SUFFIX_RE.test(name)) name = name.replace(MODEL_TIER_SUFFIX_RE, "");
  const listed = Object.keys(table.models).filter((key) => name === key || name.startsWith(`${key}-`)).sort((a, b) => b.length - a.length)[0];
  if (listed === undefined) return { reason: `no list price for ${model}` };
  const rates = table.models[listed];
  const valid = rates !== null && typeof rates === "object" && [rates.input, rates.output].every((value) => Number.isFinite(value) && value >= 0)
    && (rates.cachedInput === null || (Number.isFinite(rates.cachedInput) && rates.cachedInput >= 0));
  return valid ? { rates } : { reason: `list price for ${model} is malformed in plugins/pipeline-core/config/model-list-prices.json` };
}

// The dollar half of one row: an estimate from the list price, or "$ unavailable (<reason>)". `cachedInsideInput` says whether the
// cached counter is part of the input counter (Codex) or counted in addition to it (Antigravity, upper bound).
function listPriceHalf(model, counts, cachedInsideInput) {
  const table = readListPrices();
  const found = listPriceFor(table, model);
  if (!found.rates) return { priced: false, cell: `$ unavailable (${found.reason})` };
  const { rates } = found;
  const cacheRate = rates.cachedInput ?? rates.input;
  const usd = estimateUsd(
    { input: cachedInsideInput ? Math.max(0, counts.input - counts.cached) : counts.input, output: counts.output, cacheCreate5m: 0, cacheCreateUndetermined: 0, cacheCreate1h: 0, cacheRead: counts.cached },
    { input: rates.input, output: rates.output, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: cacheRate },
  );
  const rule = `${rates.cachedInput === null ? `the input price, ${rates.input} USD per 1M (no cached price listed, upper bound)` : `${rates.cachedInput} USD per 1M (listed cached-input price)`}${cachedInsideInput ? "" : ", counted in addition to input"}`;
  return { priced: true, asOf: table.asOf, cell: `approx $${fmtUsd(usd)} (estimate from list price, ${table.asOf}; cached tokens at ${rule})`, total: `TOTAL approx $${fmtUsd(usd)} (estimate from list price, ${table.asOf})` };
}

const ESTIMATE_NOTE = (asOf) => `the dollar half is an ESTIMATE from third-party list prices (table asOf ${asOf}, not verified against the vendor page, vendor pages win), not a billed amount`;

// The model of an Antigravity row: `--model`, else the project's configured implement route for Antigravity (read from
// `pipeline.user.yaml` in the working directory through the one route reader); null when neither names a model.
function antigravityRowModel(modelArg) {
  if (modelArg) return { model: modelArg, source: "argument" };
  try {
    const read = readProjectRouting(process.cwd());
    const value = read.source === "project" ? read.routing.duties?.implement?.antigravity?.selector?.value : undefined;
    if (typeof value === "string" && ROW_MODEL_RE.test(value)) return { model: value, source: "configured route" };
  } catch {
    // an unreadable routing file is the same as none: the row then says to pass --model
  }
  return null;
}

function antigravityRowLines(records, modelArg) {
  const steps = detectTimelineFormat(records) === "antigravity-steps"
    ? antigravityStepTimelineEvents(records).filter((event) => event.kind === "response" && event.usage && [event.usage.input, event.usage.output, event.usage.cacheRead].some((value) => value !== null))
    : [];
  if (steps.length === 0) return null;
  const sum = (key) => steps.reduce((total, event) => total + (event.usage[key] ?? 0), 0);
  const counts = { input: sum("input"), output: sum("output"), cached: sum("cacheRead") };
  const head = (key) => `- ${key}: ${fmtDe(counts.input)} in / ${fmtDe(counts.output)} out / n/a cache-write / ${fmtDe(counts.cached)} cache-read -> `;
  const resolved = antigravityRowModel(modelArg);
  if (resolved === null) {
    return [
      `${head("antigravity-unrecorded")}$ unavailable (model not recorded; pass --model <name>)`,
      "TOTAL: n/a (no model recorded in this transcript, no dollar estimate)",
      "",
      `Notes: token row from an Antigravity transcript, ${fmtDe(steps.length)} model step(s) summed; the transcript records no model and no implement route is configured for this project, so no price applies and no dollar figure is computed (pass --model <name>); cache-write is not recorded.`,
    ];
  }
  const half = listPriceHalf(resolved.model, counts, false);
  return [
    `${head(`${resolved.model} (model source: ${resolved.source})`)}${half.cell}`,
    half.priced ? half.total : "TOTAL: n/a (no model with known price)",
    "",
    half.priced
      ? `Notes: token row from an Antigravity transcript, ${fmtDe(steps.length)} model step(s) summed; ${ESTIMATE_NOTE(half.asOf)}; the transcript records no model, so the model comes from the ${resolved.source}; whether input already includes cached tokens is not measured, so they are counted in addition (upper bound); cache-write is not recorded.`
      : `Notes: token row from an Antigravity transcript, ${fmtDe(steps.length)} model step(s) summed; no list price applies to the model, so no dollar figure is computed; cache-write is not recorded.`,
  ];
}

function codexRowLines(records) {
  if (detectTimelineFormat(records) !== "codex") return null;
  let total = null;
  const models = new Set();
  for (const record of records) {
    if (!isTimelineObject(record) || !isTimelineObject(record.payload)) continue;
    if (record.type === "turn_context" && typeof record.payload.model === "string" && ROW_MODEL_RE.test(record.payload.model)) models.add(record.payload.model);
    const usageData = record.type === "event_msg" && record.payload.type === "token_count" ? record.payload.info?.total_token_usage : null;
    if (isTimelineObject(usageData) && ["input_tokens", "cached_input_tokens", "output_tokens"].every((key) => isRowCounter(usageData[key]))) total = usageData; // an invalid record never replaces a valid one
  }
  if (total === null) return null;
  const names = [...models].sort();
  const counts = { input: total.input_tokens, output: total.output_tokens, cached: total.cached_input_tokens };
  const label = names.length > 0 ? `${names.join(", ")} (model source: observed)` : "codex-unrecorded";
  const half = names.length === 1 ? listPriceHalf(names[0], counts, true)
    : { priced: false, cell: `$ unavailable (${names.length === 0 ? "model not recorded in this rollout" : "several models in one rollout, no per-model split"})` };
  return [
    `- ${label}: ${fmtDe(counts.input)} in / ${fmtDe(counts.output)} out / n/a cache-write / ${fmtDe(counts.cached)} cache-read -> ${half.cell}`,
    half.priced ? half.total : "TOTAL: n/a (no model with known price)",
    "",
    half.priced
      ? `Notes: token row from a Codex rollout, the last cumulative total of the session; ${ESTIMATE_NOTE(half.asOf)}; Codex counts cached tokens inside the input tokens, so only input minus cached is priced at the input price; output tokens include reasoning tokens as recorded; cache-write is not recorded.`
      : "Notes: token row from a Codex rollout, the last cumulative total of the session; no usable list price applies, so no dollar figure is computed; cache-write is not recorded.",
  ];
}

function runTranscriptRow(args, flag) {
  const agy = flag === "--antigravity-transcript";
  const form = `node plugins/pipeline-core/scripts/usage-ledger.mjs --row "<label>" ${flag} <transcript-file>${agy ? " [--model <name>]" : ""}`;
  const refuse = (why) => usage(`${flag} is exclusive: ${why} Runnable form: ${form}`);
  let file;
  let modelArg;
  let rowSeen = false;
  let label = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--row") {
      rowSeen = true;
      if (args[i + 1] && !args[i + 1].startsWith("--")) label = args[++i];
    } else if (args[i] === flag) {
      if (file !== undefined) refuse("name the transcript once.");
      file = args[++i];
      if (!file || file.startsWith("--")) refuse("a <transcript-file> value is required.");
    } else if (args[i] === "--model") {
      if (!agy) refuse("--model names the model of an Antigravity row and is accepted only with --antigravity-transcript (a Codex rollout records its own model).");
      if (modelArg !== undefined) refuse("name --model once.");
      modelArg = args[++i];
      if (!modelArg || modelArg.startsWith("-") || !ROW_MODEL_RE.test(modelArg)) refuse("--model needs a model name of letters, digits, dot, dash or underscore (at most 80 characters).");
    } else refuse(`it accepts only --row [label] and ${flag} <file>${agy ? " [--model <name>]" : ""} (no transcripts root, no other flag).`);
  }
  if (!rowSeen) refuse("--row is required.");
  const { records } = readTranscriptRecords(file, `usage-ledger ${flag}: ${flag.slice(2)}-unreadable. Pass an existing regular transcript file: ${form}`);
  const rowLines = agy ? antigravityRowLines(records, modelArg) : codexRowLines(records);
  const fragment = label ? [`Session/Block: ${label}`] : [];
  if (rowLines === null) fragment.push("Tokens per `/usage` (collected, script): no records found for the selected session/filter.");
  else fragment.push("Tokens per `/usage` (collected, script):", ...rowLines);
  console.log(fragment.join("\n"));
  process.exit(0);
}

function runTimeline(args) {
  if (args.includes("--row") || args.includes("--metering")) usage("--timeline is exclusive with --row and --metering.");
  let file;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--timeline") {
      file = args[i + 1];
      if (!file || file.startsWith("--")) usage("--timeline requires a <file> value.");
      i++;
    } else if (args[i] === "--json") json = true;
    else usage("--timeline is exclusive: it accepts only one <file> and --json.");
  }
  const { records, malformed } = readTranscriptRecords(file, "usage-ledger --timeline: timeline-input-unreadable");
  const runner = detectTimelineFormat(records);
  if (!runner) {
    console.error("usage-ledger --timeline: timeline-format-unknown");
    process.exit(1);
  }
  const timeline = buildTimeline(runner, records, actorFromSegments(file.split(/[\\/]/u)), malformed);
  console.log(json ? JSON.stringify(timeline) : renderTimeline(timeline));
  process.exit(0);
}

const transcriptRowFlag = argv.find((arg) => TRANSCRIPT_ROW_FLAGS.includes(arg));
if (transcriptRowFlag) runTranscriptRow(argv, transcriptRowFlag);
if (argv.includes("--timeline")) runTimeline(argv);

// Metering is intentionally an exclusive, selected-file mode. It never opens
// a transcript root, price table, provider endpoint, or directory tree.
if (argv[0] === "--metering") {
  const bundleFiles = argv.slice(1);
  if (bundleFiles.length === 0 || bundleFiles.length > USAGE_ATTRIBUTION_LIMITS.maxBundles || bundleFiles.some((entry) => entry.startsWith("--"))) usage("--metering requires a bounded list of sanitized bundle files and accepts no other flags.");
  try {
    const bundles = bundleFiles.map(readMeteringBundle);
    console.log(JSON.stringify(summarizeUsageAttribution(bundles)));
    process.exit(0);
  } catch (error) {
    const code = error instanceof UsageIngestionError ? error.code : "usage-attribution-input-invalid";
    console.error(`usage-ledger --metering: ${code}`);
    process.exit(1);
  }
}
const root = argv[0];
if (!root) usage("Missing required argument: transcripts root directory.");

let rootStat;
try {
  rootStat = statSync(root);
} catch {
  usage(`Transcripts root not found or unreadable: ${root}`);
}
if (!rootStat.isDirectory()) usage(`Transcripts root is not a directory: ${root}`);

let sessionFilter = null; // set directly by --session, or resolved via --latest below
let latestRequested = false;
let latestProjectDirName;
let rowMode = false;
let rowLabel = "";
let pricesPathArg;

for (let i = 1; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--session") {
    const value = argv[++i];
    if (!value) usage("--session requires a <uuid> value.");
    sessionFilter = value;
  } else if (arg === "--latest") {
    latestRequested = true;
    if (argv[i + 1] && !argv[i + 1].startsWith("--")) latestProjectDirName = argv[++i];
  } else if (arg === "--row") {
    rowMode = true;
    if (argv[i + 1] && !argv[i + 1].startsWith("--")) rowLabel = argv[++i];
  } else if (arg === "--prices") {
    const value = argv[++i];
    if (!value) usage("--prices requires a <path> value.");
    pricesPathArg = value;
  } else {
    usage(`Unknown argument: ${arg}`);
  }
}

if (sessionFilter && latestRequested) usage("--session and --latest are mutually exclusive.");

// --- 0b. Resolve --latest to a concrete session id (self-evidence to stderr). ---
function listProjectDirs(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function resolveLatestSession(transcriptsRoot, projectDirName) {
  let targetDirName = projectDirName;
  if (!targetDirName) {
    const projectDirs = listProjectDirs(transcriptsRoot);
    if (projectDirs.length === 0) usage(`--latest: no project directories found under root: ${transcriptsRoot}`);
    if (projectDirs.length > 1) {
      usage(
        `--latest: multiple project directories under root; specify one explicitly (--latest <projectDirName>). Candidates: ${projectDirs.join(", ")}`,
      );
    }
    targetDirName = projectDirs[0];
  }
  const targetDir = path.join(transcriptsRoot, targetDirName);
  let dirStat;
  try {
    dirStat = statSync(targetDir);
  } catch {
    usage(`--latest: project directory not found: ${targetDir}`);
    return;
  }
  if (!dirStat.isDirectory()) usage(`--latest: not a directory: ${targetDir}`);

  let entries;
  try {
    entries = readdirSync(targetDir, { withFileTypes: true });
  } catch {
    usage(`--latest: project directory unreadable: ${targetDir}`);
    return;
  }
  const sessionFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".jsonl") && SESSION_ID_RE.test(path.basename(e.name, ".jsonl")))
    .map((e) => {
      const full = path.join(targetDir, e.name);
      const stat = statSync(full);
      return {
        sessionId: path.basename(e.name, ".jsonl"),
        file: full,
        mtimeMs: stat.mtimeMs,
        mtimeIso: stat.mtime.toISOString(),
      };
    });
  if (sessionFiles.length === 0) usage(`--latest: no session files found in project directory: ${targetDir}`);
  sessionFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const chosen = sessionFiles[0];
  console.error(
    `--latest: project "${targetDirName}" -> selected session ${chosen.sessionId} (file: ${chosen.file}, last modified ${chosen.mtimeIso}; ${sessionFiles.length} session file(s) considered).`,
  );
  return chosen.sessionId;
}

if (latestRequested) sessionFilter = resolveLatestSession(root, latestProjectDirName);

// --- 1. Collect all .jsonl files under root (manual recursive walk; no Node-version
//        dependent readdir(recursive) quirks). Read-only: only stat + readdir calls.
//        Depth-unlimited by construction (the stack loop pushes every directory it
//        finds, however deep) — this already covers arbitrary nesting under
//        `<sessionId>/subagents/**`, including `subagents/workflows/wf_*/**`
//        workflow-subagent trees (verified against a live wf_* tree): no separate
//        "subagents" or "workflows" special-casing is
//        needed or present. ---
function collectJsonlFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue; // unreadable directory (permissions/race) — skip, not fatal
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        out.push(full);
      }
    }
  }
  return out;
}

// --- 2. Derive (project, sessionId) for a transcript file, independent of the
//        record content — used only as a fallback when a record lacks sessionId. ---
function deriveFromPath(filePath) {
  const rel = path.relative(root, filePath);
  const segments = rel.split(path.sep);
  const project = segments[0] || "(unknown-project)";
  // Main session file: <project>/<sessionId>.jsonl
  // Subagent transcript: <project>/<sessionId>/subagents/agent-*.jsonl
  let sessionId = path.basename(filePath, ".jsonl");
  if (!SESSION_ID_RE.test(sessionId)) {
    const sessionSeg = segments.find((s) => SESSION_ID_RE.test(s));
    sessionId = sessionSeg || sessionId;
  }
  return { project, sessionId };
}

// Derives the "actor" label for a transcript file: "main" for the top-level
// session file, "subagent:<basename>" for anything under a `subagents/`
// directory (basename only, e.g. `agent-<uuid>` — never a path). See the
// "Activity accounting" doc block above.
function actorOf(filePath) {
  return actorFromSegments(path.relative(root, filePath).split(path.sep));
}

function emptyAgg() {
  return {
    messages: 0,
    input: 0,
    output: 0,
    cacheCreate: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheCreateUndetermined: 0, // cache-write tokens whose TTL couldn't be read
    cacheRead: 0,
    firstTs: null,
  };
}

const files = collectJsonlFiles(root);
const rows = new Map(); // key: `${project}${KEY_SEP}${sessionId}${KEY_SEP}${model}` -> agg
// key: `${project}${KEY_SEP}${sessionId}${KEY_SEP}${model}${KEY_SEP}${actor}` -> turn/tool-call agg
// (see "Activity accounting" doc block above). Scoped identically to `rows`
// (only records passing the active --session/--latest selection are added).
const activity = new Map();
let malformedLines = 0;
let assistantRecords = 0; // raw assistant-usage records seen, BEFORE message.id dedup
let unreadableFiles = 0;
let duplicateRecordsSkipped = 0; // records dropped because their message.id was already seen in this file
let idlessRecords = 0; // assistant-usage records with no message.id — dedup impossible, counted individually
let filesConsumedForSelection = 0; // only meaningful when sessionFilter is set (--session/--latest)

// Accumulates one (already deduped, or declared-fallback id-less) usage record
// into the per-(project,session,model) aggregate. Shared by both the id-based
// dedup path and the id-less per-record fallback path.
function accumulate(project, sessionId, model, usageData, timestamp) {
  const key = `${project}${KEY_SEP}${sessionId}${KEY_SEP}${model}`;
  let agg = rows.get(key);
  if (!agg) {
    agg = emptyAgg();
    rows.set(key, agg);
  }
  agg.messages++;
  agg.input += Number(usageData.input_tokens) || 0;
  agg.output += Number(usageData.output_tokens) || 0;
  const cacheCreateTotal = Number(usageData.cache_creation_input_tokens) || 0;
  agg.cacheCreate += cacheCreateTotal;
  const breakdown = usageData.cache_creation;
  const has5m = breakdown && typeof breakdown.ephemeral_5m_input_tokens === "number";
  const has1h = breakdown && typeof breakdown.ephemeral_1h_input_tokens === "number";
  if (has5m || has1h) {
    agg.cacheCreate5m += Number(breakdown.ephemeral_5m_input_tokens) || 0;
    agg.cacheCreate1h += Number(breakdown.ephemeral_1h_input_tokens) || 0;
  } else if (cacheCreateTotal > 0) {
    agg.cacheCreateUndetermined += cacheCreateTotal; // TTL not distinguishable — assumed 5m at pricing time
  }
  agg.cacheRead += Number(usageData.cache_read_input_tokens) || 0;
  if (timestamp) {
    if (!agg.firstTs || timestamp < agg.firstTs) agg.firstTs = timestamp;
  }
}

function emptyActivity() {
  return {
    turnIds: new Set(), // distinct message.id seen (a duplicate stream-update record adds nothing new)
    idlessTurns: 0, // records with no message.id — can't be deduped, counted individually (declared fallback)
    toolCallIds: new Set(), // distinct tool_use block id seen, across ALL raw records (not only the deduped-last one)
    toolCallsUnidentified: 0, // tool_use blocks with no id — can't be deduped, counted individually (defensive)
  };
}

// Records one raw assistant record's contribution to turn/tool-call counts.
// Called once per raw record (unlike `accumulate`, which runs once per
// deduped message.id) — see the "Activity accounting" doc block above for why
// tool-call dedup does not depend on message-level dedup.
function recordActivity(project, sessionId, model, actor, id, content) {
  const key = `${project}${KEY_SEP}${sessionId}${KEY_SEP}${model}${KEY_SEP}${actor}`;
  let agg = activity.get(key);
  if (!agg) {
    agg = emptyActivity();
    activity.set(key, agg);
  }
  if (id) agg.turnIds.add(id);
  else agg.idlessTurns++;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || block.type !== "tool_use") continue;
      if (typeof block.id === "string" && block.id) agg.toolCallIds.add(block.id);
      else agg.toolCallsUnidentified++;
    }
  }
}

for (const file of files) {
  const { project: pathProject, sessionId: pathSessionId } = deriveFromPath(file);
  const fileActor = actorOf(file);
  let rl;
  try {
    rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  } catch {
    unreadableFiles++;
    continue;
  }
  const matchedSelection = await processLines(rl, pathProject, pathSessionId, fileActor);
  if (sessionFilter && matchedSelection) filesConsumedForSelection++;
}

// Reads one transcript file end-to-end, dedupes assistant-usage records by
// `message.id` WITHIN this file ("last record per id wins" — duplicates
// are proven byte-identical re-emissions, see schema notes above), and only then
// accumulates the deduped set into the shared `rows` map. Records without a
// `message.id` cannot be deduped and are accumulated immediately, individually
// (declared fallback). Returns whether this file contributed at least one
// record matching `sessionFilter` (undefined/ignored when no filter is active).
async function processLines(rl, pathProject, pathSessionId, fileActor) {
  const lastById = new Map(); // message.id -> latest {sessionId, model, usageData, timestamp} seen in this file
  let matchedSelection = false;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      malformedLines++;
      continue;
    }
    if (!record || record.type !== "assistant") continue;
    const message = record.message;
    const usageData = message && message.usage;
    const model = message && message.model;
    if (!usageData || !model || model === "<synthetic>") continue;

    assistantRecords++;
    const sessionId = typeof record.sessionId === "string" && record.sessionId ? record.sessionId : pathSessionId;
    const id = message.id;

    const inSelection = !sessionFilter || sessionId === sessionFilter; // --session / --latest scoping

    if (inSelection) recordActivity(pathProject, sessionId, model, fileActor, id, message.content);

    if (!id) {
      if (inSelection) idlessRecords++; // diagnostic scoped to the active selection, not the whole root
      if (!inSelection) continue;
      accumulate(pathProject, sessionId, model, usageData, record.timestamp);
      if (sessionFilter) matchedSelection = true;
      continue;
    }

    if (lastById.has(id) && inSelection) duplicateRecordsSkipped++; // diagnostic scoped to the active selection
    lastById.set(id, { sessionId, model, usageData, timestamp: record.timestamp }); // last write wins
  }

  for (const { sessionId, model, usageData, timestamp } of lastById.values()) {
    if (sessionFilter && sessionId !== sessionFilter) continue; // --session / --latest scoping
    accumulate(pathProject, sessionId, model, usageData, timestamp);
    if (sessionFilter) matchedSelection = true;
  }

  return matchedSelection;
}

// --- 1b. Dedup/coverage self-evidence (stderr) — printed for
//         BOTH output modes, independent of --row vs. default table. ---
if (sessionFilter) {
  console.error(
    `Session filter ${sessionFilter}: ${filesConsumedForSelection} of ${files.length} transcript file(s) under root contained matching records (recursive discovery under every subdirectory, incl. subagents/** and workflows/wf_* trees).`,
  );
}
if (idlessRecords > 0) {
  console.error(
    `Warning: ${idlessRecords} assistant-usage record(s) had no message.id — counted individually (dedup fallback), no de-duplication possible for these.`,
  );
}
if (duplicateRecordsSkipped > 0) {
  console.error(
    `Dedup: ${duplicateRecordsSkipped} duplicate usage record(s) skipped (same message.id repeated within one transcript file; last record kept — duplicates proven byte-identical, see schema notes).`,
  );
}

// --- 3. Build the per-(project,session,model) entries — shared by both output modes. ---
function fmt(n) {
  return n.toLocaleString("en-US");
}

const entries = [...rows.entries()].map(([key, agg]) => {
  const [project, sessionId, model] = key.split(KEY_SEP);
  const total = agg.input + agg.output + agg.cacheCreate + agg.cacheRead;
  return { project, sessionId, model, total, ...agg };
});
entries.sort((a, b) => b.total - a.total);

if (rowMode) {
  renderRow();
} else {
  renderTable();
}

// --- 4a. Default output: full markdown table (unchanged since the initial implementation). ---
function renderTable() {
  const grand = entries.reduce(
    (acc, e) => {
      acc.messages += e.messages;
      acc.input += e.input;
      acc.output += e.output;
      acc.cacheCreate += e.cacheCreate;
      acc.cacheRead += e.cacheRead;
      acc.total += e.total;
      return acc;
    },
    { messages: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
  );

  const lines = [];
  lines.push(`# Usage Ledger — token aggregation (${new Date().toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push(
    `Root: \`${root}\` · Files scanned: ${files.length} (${unreadableFiles} unreadable) · Assistant records: ${assistantRecords} · Malformed lines skipped: ${malformedLines}`,
  );
  lines.push("");
  lines.push("| Project | Session | Model | Msgs | Input | Output | Cache-Create | Cache-Read | Total | First seen |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const e of entries) {
    const firstSeen = e.firstTs ? e.firstTs.slice(0, 10) : "n/a";
    lines.push(
      `| ${e.project} | ${e.sessionId} | ${e.model} | ${fmt(e.messages)} | ${fmt(e.input)} | ${fmt(e.output)} | ${fmt(e.cacheCreate)} | ${fmt(e.cacheRead)} | ${fmt(e.total)} | ${firstSeen} |`,
    );
  }
  lines.push(
    `| **TOTAL** | | | ${fmt(grand.messages)} | ${fmt(grand.input)} | ${fmt(grand.output)} | ${fmt(grand.cacheCreate)} | ${fmt(grand.cacheRead)} | ${fmt(grand.total)} | |`,
  );

  console.log(lines.join("\n"));
  process.exit(0);
}

// --- 4b. `--row` output: ONE MP-20-compatible, path-free, English-language fragment. ---
function familyOf(model) {
  const m = model.toLowerCase();
  if (m.includes("fable")) return "fable";
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  return null;
}

function loadPrices(pricesPath) {
  let raw;
  try {
    raw = readFileSync(pricesPath, "utf8");
  } catch {
    usage(`--row: price file not found or unreadable: ${pricesPath}`);
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    usage(`--row: price file is not valid JSON: ${pricesPath}`);
    return;
  }
  if (!data || !data.families) usage(`--row: price file missing "families" object: ${pricesPath}`);
  return data;
}

function fmtDe(n) {
  return n.toLocaleString("de-DE");
}

function fmtUsd(n) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Groups the already (optionally session-)filtered entries by model only —
// `--row` reports one estimate per model, not per project/session.
function groupByModel(list) {
  const map = new Map();
  for (const e of list) {
    let agg = map.get(e.model);
    if (!agg) {
      agg = emptyAgg();
      map.set(e.model, agg);
    }
    agg.messages += e.messages;
    agg.input += e.input;
    agg.output += e.output;
    agg.cacheCreate += e.cacheCreate;
    agg.cacheCreate5m += e.cacheCreate5m;
    agg.cacheCreate1h += e.cacheCreate1h;
    agg.cacheCreateUndetermined += e.cacheCreateUndetermined;
    agg.cacheRead += e.cacheRead;
  }
  return map;
}

function estimateUsd(agg, rates) {
  if (!rates) return null; // unknown model id — never guessed
  const cacheWrite5mBillable = agg.cacheCreate5m + agg.cacheCreateUndetermined; // declared 5m assumption
  const cacheWrite1hBillable = agg.cacheCreate1h;
  return (
    (agg.input * rates.input +
      agg.output * rates.output +
      cacheWrite5mBillable * rates.cacheWrite5m +
      cacheWrite1hBillable * rates.cacheWrite1h +
      agg.cacheRead * rates.cacheRead) /
    1_000_000
  );
}

// Aggregates the `activity` map (keyed per project/session/model/actor) down
// to per-(model, actor) totals — same granularity drop as `groupByModel`
// already applies to tokens (session identity is scoping-only, never shown).
function summarizeActivity() {
  const byModelActor = new Map(); // `${model}${KEY_SEP}${actor}` -> {model, actor, turns, toolCalls, toolCallsUnidentified}
  for (const [key, agg] of activity.entries()) {
    const parts = key.split(KEY_SEP);
    const model = parts[2];
    const actor = parts[3];
    const groupKey = `${model}${KEY_SEP}${actor}`;
    let entry = byModelActor.get(groupKey);
    if (!entry) {
      entry = { model, actor, turns: 0, toolCalls: 0, toolCallsUnidentified: 0 };
      byModelActor.set(groupKey, entry);
    }
    entry.turns += agg.turnIds.size + agg.idlessTurns;
    entry.toolCalls += agg.toolCallIds.size;
    entry.toolCallsUnidentified += agg.toolCallsUnidentified;
  }
  return [...byModelActor.values()].sort((a, b) => b.turns - a.turns);
}

function renderRow() {
  const pricesPath = pricesPathArg || DEFAULT_PRICES_PATH;
  const prices = loadPrices(pricesPath);
  const byModel = groupByModel(entries);

  const fragment = [];
  if (rowLabel) fragment.push(`Session/Block: ${rowLabel}`);

  if (byModel.size === 0) {
    fragment.push("Tokens per `/usage` (collected, script): no records found for the selected session/filter.");
    console.log(fragment.join("\n"));
    process.exit(0);
    return;
  }

  const modelRows = [...byModel.entries()]
    .map(([model, agg]) => ({ model, agg, total: agg.input + agg.output + agg.cacheCreate + agg.cacheRead }))
    .sort((a, b) => b.total - a.total);

  let totalUsd = 0;
  let anyKnown = false;
  let anyUnknown = false;
  let undeterminedTotal = 0;
  const perModelLines = modelRows.map(({ model, agg }) => {
    const rates = prices.families[familyOf(model) ?? ""];
    const usd = estimateUsd(agg, rates);
    let dollarLabel;
    if (usd === null) {
      // Unpriced/unknown model: no $ estimate is computed for it, so its
      // TTL-undetermined cache-write tokens never fed a "5m-Satz angenommen" price
      // calculation either — excluded from undeterminedTotal (the footnote must
      // only count tokens that actually fed a computed estimate).
      anyUnknown = true;
      dollarLabel = "n/a (price unknown)";
    } else {
      anyKnown = true;
      totalUsd += usd;
      undeterminedTotal += agg.cacheCreateUndetermined;
      dollarLabel = `$${fmtUsd(usd)} (estimated)`;
    }
    return `- ${model}: ${fmtDe(agg.input)} in / ${fmtDe(agg.output)} out / ${fmtDe(agg.cacheCreate)} cache-write / ${fmtDe(agg.cacheRead)} cache-read -> ${dollarLabel}`;
  });

  fragment.push("Tokens per `/usage` (collected, script):");
  fragment.push(...perModelLines);
  if (anyKnown) {
    const suffix = anyUnknown ? " — excludes models with unknown price (see above)" : "";
    fragment.push(`TOTAL ≈ $${fmtUsd(totalUsd)} (estimated)${suffix}`);
  } else {
    fragment.push("TOTAL: n/a (no model with known price)");
  }
  fragment.push("");
  fragment.push(
    `Notes: $ values estimated, price table asOf ${prices.asOf ?? "n/a"} (${path.basename(pricesPath)}); cache TTL per model taken from the transcript (ephemeral_5m/1h) where present, otherwise 5m rate assumed (declared assumption${undeterminedTotal > 0 ? `, ${fmtDe(undeterminedTotal)} cache-write tokens without TTL data` : ""}).`,
  );

  const activitySummary = summarizeActivity();
  if (activitySummary.length > 0) {
    let totalTurns = 0;
    let totalToolCalls = 0;
    let totalUnidentified = 0;
    const activityLines = activitySummary.map((e) => {
      totalTurns += e.turns;
      totalToolCalls += e.toolCalls;
      totalUnidentified += e.toolCallsUnidentified;
      return `- ${e.model} / ${e.actor}: ${fmtDe(e.turns)} turn(s) / ${fmtDe(e.toolCalls)} tool call(s)`;
    });
    fragment.push("");
    fragment.push("Turns / tool calls per `/usage` (collected, script):");
    fragment.push(...activityLines);
    fragment.push(
      `TOTAL: ${fmtDe(totalTurns)} turn(s) / ${fmtDe(totalToolCalls)} tool call(s)` +
        (totalUnidentified > 0
          ? ` (+ ${fmtDe(totalUnidentified)} tool-use block(s) without an id, counted individually — dedup not possible)`
          : ""),
    );
  }

  console.log(fragment.join("\n"));
  process.exit(0);
}
