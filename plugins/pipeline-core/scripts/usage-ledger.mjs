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
 * modifies or deletes anything under the transcripts root. The optional `--prices`
 * file is the only other file this script reads (default: `model-prices.json` next
 * to this script, resolved from the script's own location — never the process cwd —
 * so the default works regardless of the invoking directory).
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

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Composite map-key separator: project dir names and Windows paths can never
// contain a colon (reserved char), and session UUIDs / model ids are
// alnum+dash — "::" cannot collide with any real value here.
const KEY_SEP = "::";

// Default price file lives next to this script (repo-relative by construction,
// independent of the invoking cwd).
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PRICES_PATH = path.join(SCRIPT_DIR, "model-prices.json");

function usage(msg) {
  if (msg) console.error(msg);
  console.error(
    "Usage: node plugins/pipeline-core/scripts/usage-ledger.mjs <transcripts-root> [--session <uuid>] [--latest [projectDirName]] [--row [label]] [--prices <path>] | --metering <sanitized-bundle.json...>",
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
  const rel = path.relative(root, filePath);
  const segments = rel.split(path.sep);
  if (!segments.includes("subagents")) return "main";
  return `subagent:${path.basename(filePath, ".jsonl")}`;
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
