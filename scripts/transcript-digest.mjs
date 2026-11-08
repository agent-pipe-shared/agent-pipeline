#!/usr/bin/env node
/**
 * Purpose: shrink recorded agent runs (a Codex rollout, a Claude Code session, an Antigravity conversation store, a plain log) into short
 * digests that one reader can take in whole, so an audit of a greenfield run sees every refusal and retry instead of an excerpt.
 *
 * Usage (from the repository root, by the operator, because the transcripts live outside the repository):
 *   node scripts/transcript-digest.mjs --sources <list.json> --out <directory>
 *
 * <list.json> is an array of { "label": "<name>", "format": "codex" | "claude" | "sqlite" | "text", "path": "<absolute path>" }. Keep that
 * file and the output under scratch/: both name local paths. Each source gives <out>/<label>.txt. Kept: human messages, the agent's text,
 * every tool call, and tool results (long only when they look like a refusal or an error, otherwise only their start). Dropped: reasoning
 * and system prompts. E-mail addresses, home directories and token shapes are replaced; names in free text are not, so the digests stay
 * private material. Prints only sizes, never content. A source that cannot be read is reported and the others still run.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INTERESTING = /refus|blocked|denied|guard-|error|fail|exit code [1-9]|warning|reopen|retry|stale|drift|not allowed|cannot|\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+\b/iu;
const LIMIT = { human: 3000, agent: 1500, call: 600, resultLong: 1500, resultShort: 160, stringsTotal: 1_500_000 };

export function redact(text) {
  return String(text)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu, "[EMAIL]")
    .replace(/(\/home\/|\/Users\/|\/mnt\/[a-z]\/Users\/|[A-Za-z]:\\Users\\|[A-Za-z]:\/Users\/)[^/\\\s"']+/gu, "$1[USER]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/gu, "[SECRET]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, "[SECRET]");
}

const cut = (text, limit) => {
  const flat = redact(text).replace(/\s*\n\s*/gu, " | ");
  return flat.length <= limit ? flat : `${flat.slice(0, limit)} ...[+${flat.length - limit}]`;
};
const result = (text) => cut(text, INTERESTING.test(text) ? LIMIT.resultLong : LIMIT.resultShort);
const textOf = (content) => (typeof content === "string" ? content
  : Array.isArray(content) ? content.map((part) => part?.text ?? (typeof part === "string" ? part : "")).join("\n") : "");

function codexLine(event, number) {
  const item = event.type === "response_item" ? event.payload : null;
  if (!item) return null;
  if (item.type === "message" && item.role === "user") return `L${number} HUMAN: ${cut(textOf(item.content), LIMIT.human)}`;
  if (item.type === "message" && item.role === "assistant") return `L${number} AGENT: ${cut(textOf(item.content), LIMIT.agent)}`;
  if (item.type === "function_call" || item.type === "custom_tool_call") return `L${number} CALL ${item.name}: ${cut(item.arguments ?? item.input ?? "", LIMIT.call)}`;
  if (item.type === "function_call_output" || item.type === "custom_tool_call_output") return `L${number} RESULT: ${result(typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? ""))}`;
  return null;
}

function claudeLines(event, number) {
  if (event.isMeta === true || !["user", "assistant"].includes(event.type)) return [];
  const content = event.message?.content;
  if (typeof content === "string") return [`L${number} ${event.type === "user" ? "HUMAN" : "AGENT"}: ${cut(content, event.type === "user" ? LIMIT.human : LIMIT.agent)}`];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (part.type === "text") return [`L${number} ${event.type === "user" ? "HUMAN" : "AGENT"}: ${cut(part.text, event.type === "user" ? LIMIT.human : LIMIT.agent)}`];
    if (part.type === "tool_use") return [`L${number} CALL ${part.name}: ${cut(JSON.stringify(part.input ?? {}), LIMIT.call)}`];
    if (part.type === "tool_result") return [`L${number} RESULT${part.is_error ? " (error)" : ""}: ${result(textOf(part.content))}`];
    return [];
  });
}

function jsonlDigest(path, format) {
  const out = [];
  readFileSync(path, "utf8").split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    let event;
    try { event = JSON.parse(line); } catch { out.push(`L${index + 1} (unparsable line)`); return; }
    if (format === "codex") { const entry = codexLine(event, index + 1); if (entry) out.push(entry); } else out.push(...claudeLines(event, index + 1));
  });
  return out;
}

async function sqliteDigest(path) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(path, { readOnly: true });
  const seen = new Set(), out = [];
  let total = 0;
  for (const { name } of database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
    const rows = database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all();
    out.push(`TABLE ${name}: ${rows.length} rows`);
    rows.forEach((row, rowIndex) => {
      for (const value of Object.values(row)) {
        if (value === null || typeof value === "number" || typeof value === "bigint") continue;
        const text = typeof value === "string" ? value : Buffer.from(value).toString("latin1");
        for (const run of text.match(/[\x20-\x7E\n\t]{24,}/gu) ?? []) {
          if (!INTERESTING.test(run) || seen.has(run) || total > LIMIT.stringsTotal) continue;
          seen.add(run);
          const entry = `${name}#${rowIndex}: ${cut(run, LIMIT.resultLong)}`;
          total += entry.length;
          out.push(entry);
        }
      }
    });
  }
  database.close();
  return out;
}

function textDigest(path) {
  return readFileSync(path, "utf8").split("\n").flatMap((line, index) => (INTERESTING.test(line) ? [`L${index + 1}: ${cut(line, LIMIT.resultLong)}`] : []));
}

async function main(argv) {
  const value = (flag) => { const at = argv.indexOf(flag); return at === -1 ? null : argv[at + 1] ?? null; };
  const sourcesPath = value("--sources"), outDir = value("--out");
  if (sourcesPath === null || outDir === null) { console.error("Usage: node scripts/transcript-digest.mjs --sources <list.json> --out <directory>"); return 2; }
  mkdirSync(outDir, { recursive: true });
  let failed = 0;
  for (const { label, format, path } of JSON.parse(readFileSync(sourcesPath, "utf8"))) {
    if (!/^[A-Za-z0-9._-]+$/u.test(label ?? "")) { console.log(`${label}: refused, label is not a plain file name`); failed += 1; continue; }
    try {
      const lines = format === "sqlite" ? await sqliteDigest(path) : format === "text" ? textDigest(path) : jsonlDigest(path, format);
      const body = `${lines.join("\n")}\n`;
      writeFileSync(join(outDir, `${label}.txt`), body, { mode: 0o600 });
      console.log(`${label}: ${lines.length} entries, ${Buffer.byteLength(body)} bytes`);
    } catch (error) { console.log(`${label}: not read (${error.code ?? error.name})`); failed += 1; }
  }
  return failed === 0 ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
