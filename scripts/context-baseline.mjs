#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Fixed context baseline of a Claude Code session transcript (JSONL), per context window.
 *
 * PURPOSE. Answers "how many tokens does every request of a session carry before any work, and how much of
 * that does the Pipeline put there". A context window starts at the session start and after every compaction.
 * Its baseline is the input of the first model reply in that window (fresh input + cache write + cache read);
 * every later request of the window re-reads it. The tool attributes the attachments that precede that first
 * reply to their source (Pipeline, user, harness) and counts the guard denials a window accumulates.
 *
 * USAGE. node scripts/context-baseline.mjs <transcript.jsonl> [--windows N]
 *   Prints one JSON object (schema pipeline.context-baseline.v1): session totals (requests, input tokens, the
 *   share of all input that is the re-read window baseline), the last N windows (default 3) with their
 *   baseline tokens and attributed sizes in KB, and the guard denials (count, KB, KB per window).
 *   Reads only the file named; writes nothing; prints sizes and names, never content. Sizes are UTF-8 bytes,
 *   not model tokens (roughly bytes / 4).
 *
 * ATTRIBUTION. pipeline: invoked skills, agent and skill descriptions and hook context of the pipeline-core
 * plugin, the repository CLAUDE.md / AGENTS.md; user: the memory index; harness: everything else (tool
 * schemas are not in the transcript; they are inside the cache read of the first reply).
 */
import { readFileSync } from "node:fs";
import { isDirectInvocation } from "../plugins/pipeline-core/lib/entrypoint.mjs";

export const SCHEMA = "pipeline.context-baseline.v1";
const PIPELINE_PREFIX = "pipeline-core:";
const DENIAL = /PreToolUse:\w+ hook error: \[[^\]]*\]: BLOCKED/;
const kb = (bytes) => Math.round(bytes / 102.4) / 10;
const size = (value) => Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value ?? ""));

function listingBytes(text) {
  const out = { pipeline: 0, other: 0 };
  for (const line of String(text).split("\n")) {
    out[line.replace(/^[-*\s]+/, "").startsWith(PIPELINE_PREFIX) ? "pipeline" : "other"] += size(line);
  }
  return out;
}

/** Attribute one attachment to { pipeline, user, harness } byte counts. */
export function attributeAttachment(attachment) {
  const a = attachment ?? {};
  const total = size(a);
  if (a.type === "invoked_skills") {
    const skills = Array.isArray(a.skills) ? a.skills : [];
    const pipeline = skills.filter((s) => String(s.name ?? "").startsWith(PIPELINE_PREFIX)).reduce((n, s) => n + size(s.content ?? s), 0);
    return { pipeline, user: 0, harness: total - pipeline };
  }
  if (a.type === "skill_listing" || a.type === "agent_listing_delta") {
    const text = a.type === "skill_listing" ? a.content ?? "" : (Array.isArray(a.addedLines) ? a.addedLines : []).join("\n");
    const { pipeline } = listingBytes(text);
    return { pipeline, user: 0, harness: Math.max(0, total - pipeline) };
  }
  if (a.type === "instructions" || a.type === "nested_memory") {
    const items = Array.isArray(a.files) ? a.files : Array.isArray(a.content) ? a.content : [];
    let pipeline = 0;
    let user = 0;
    for (const item of items) {
      const path = String(item.path ?? "");
      if (/\/memory\/MEMORY\.md$/.test(path)) user += size(item.content ?? item);
      else if (/(^|\/)(CLAUDE|AGENTS)\.md$/.test(path)) pipeline += size(item.content ?? item);
    }
    return { pipeline, user, harness: Math.max(0, total - pipeline - user) };
  }
  if (a.type === "hook_additional_context") return { pipeline: total, user: 0, harness: 0 };
  return { pipeline: 0, user: 0, harness: total };
}

/** Measure a parsed transcript (array of entries). */
export function measureContextBaseline(entries, { windows: keep = 3 } = {}) {
  const windows = [];
  let current = null;
  let denials = 0;
  let denialBytes = 0;
  for (const e of entries) {
    if (!current || (e.type === "system" && /compact/i.test(e.subtype ?? ""))) {
      current = { baselineTokens: null, requests: new Map(), parts: {}, bytes: { pipeline: 0, user: 0, harness: 0 } };
      windows.push(current);
      if (e.type === "system") continue;
    }
    if (e.type === "assistant" && e.message?.usage) {
      const u = e.message.usage;
      const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      if (input === 0) continue; // a synthetic reply (interrupt, error) carries no request
      current.requests.set(e.message.id ?? `${current.requests.size}`, input);
      if (current.baselineTokens === null) current.baselineTokens = input;
      continue;
    }
    if (e.type === "user" && Array.isArray(e.message?.content)) {
      for (const c of e.message.content) {
        if (c.type !== "tool_result") continue;
        const text = typeof c.content === "string" ? c.content : JSON.stringify(c.content ?? "");
        if (DENIAL.test(text)) { denials += 1; denialBytes += size(text); }
      }
    }
    if (e.type === "attachment" && current.baselineTokens === null) {
      const a = e.attachment ?? {};
      const key = a.type === "invoked_skills"
        ? `invoked_skills(${(a.skills ?? []).map((s) => s.name).join(",")})`
        : `${a.type ?? "?"}${a.hookName ? `:${a.hookName}` : ""}`;
      const attributed = attributeAttachment(a);
      for (const owner of Object.keys(attributed)) current.bytes[owner] += attributed[owner];
      current.parts[key] = (current.parts[key] ?? 0) + size(a);
    }
  }
  const measured = windows.filter((w) => w.baselineTokens !== null);
  let requests = 0;
  let inputTokens = 0;
  let baselineTokens = 0;
  for (const w of measured) {
    requests += w.requests.size;
    for (const t of w.requests.values()) { inputTokens += t; baselineTokens += Math.min(t, w.baselineTokens); }
  }
  return {
    schema: SCHEMA,
    windows: measured.length,
    requests,
    inputTokens,
    baselineShareOfInput: inputTokens ? Math.round((baselineTokens / inputTokens) * 1000) / 1000 : 0,
    baselineTokensPerWindow: measured.map((w) => w.baselineTokens),
    guardDenials: { count: denials, kb: kb(denialBytes), kbPerWindow: measured.length ? kb(denialBytes / measured.length) : 0 },
    lastWindows: measured.slice(-keep).map((w) => ({
      baselineTokens: w.baselineTokens,
      attributedKB: { pipeline: kb(w.bytes.pipeline), user: kb(w.bytes.user), harness: kb(w.bytes.harness) },
      partsKB: Object.fromEntries(Object.entries(w.parts).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, kb(v)])),
    })),
  };
}

export function parseTranscript(text) {
  const entries = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try { entries.push(JSON.parse(line)); } catch { /* a torn line is skipped */ }
  }
  return entries;
}

if (isDirectInvocation(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args[0];
  const at = args.indexOf("--windows");
  if (!file || file.startsWith("--")) {
    process.stderr.write("usage: node scripts/context-baseline.mjs <transcript.jsonl> [--windows N]\n");
    process.exit(2);
  }
  const report = measureContextBaseline(parseTranscript(readFileSync(file, "utf8")), { windows: at >= 0 ? Number(args[at + 1]) : 3 });
  process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
}
