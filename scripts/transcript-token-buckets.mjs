#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Rough token split of Claude Code session transcripts (JSONL) into three buckets.
 *
 * PURPOSE. Answers "how much of a pipeline session is (impl) work on the product, (content) content the
 * pipeline requires, (admin) pure pipeline administration" so the admin share can be tracked towards the
 * PO's target (about 15 % overall for user repositories). It is a heuristic: every assistant message is
 * assigned to ONE bucket by the tool calls it makes (the first matching rule wins, a tool-less message goes
 * to `dialogue`). Subagent (Goldfish) transcripts are passed the same way and counted with the same rules,
 * so the substantive work they do lands in `impl`/`content`. Read the numbers as +-10 points.
 *
 * USAGE. node scripts/transcript-token-buckets.mjs <transcript.jsonl> [more.jsonl ...]
 *   Prints one JSON object: per file and in total, tokens per bucket as
 *   {fresh (input + cache creation + output), cacheRead, messages}, and the share of `fresh` per bucket.
 *   Reads only the files named; writes nothing. Messages are de-duplicated by message id (last usage wins).
 *
 * RULES (first match wins, on the message's tool calls in order):
 *   admin   : git (any), node on scratch/apply-*, scratch/msg-*, scratch/append-*, pipeline preflight/state/
 *             approval scripts, memory files, mkdir, stamp, TaskStop/Monitor/ScheduleWakeup/SendMessage
 *   content : Write/Edit/Read of specs/**, docs/**, templates/**, backlog/**, scratch/briefing-*, scratch/spec-*,
 *             and node scripts/fill-goldfish-briefing.mjs
 *   impl    : Write/Edit/Read of plugins/**, harness/**, scripts/**, architecture/**, scratch/agent-out/**,
 *             scratch/clones/**, Agent dispatches, node scripts/run-*.mjs / full-verify / verify, rg/grep/cat
 *             on those paths
 *   dialogue: no tool call (chat, reasoning), AskUserQuestion
 *   other tool calls fall back to admin.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BUCKETS = ["impl", "content", "admin", "dialogue"];
const has = (s, re) => re.test(s);

function classifyCall(name, input) {
  const text = JSON.stringify(input ?? {});
  const path = String(input?.file_path ?? input?.path ?? "");
  const cmd = String(input?.command ?? "");
  if (["TaskStop", "Monitor", "ScheduleWakeup", "SendMessage", "ToolSearch", "Skill"].includes(name)) return "admin";
  if (name === "AskUserQuestion") return "dialogue";
  if (name === "Agent") return "impl";
  if (["Write", "Edit", "Read", "NotebookEdit"].includes(name)) {
    if (has(path, /\/memory\/|scratch\/(msg-|apply-|append-|add-)/)) return "admin";
    if (has(path, /\/(specs|docs|templates|backlog)\/|scratch\/(briefing-|spec-)/)) return "content";
    if (has(path, /\/(plugins|harness|scripts|architecture)\/|scratch\/(agent-out|clones)\//)) return "impl";
    return "admin";
  }
  if (name === "Bash") {
    if (has(cmd, /^git\b/)) return "admin";
    if (has(cmd, /scratch\/(apply-|msg-|append-|add-)/)) return "admin";
    if (has(cmd, /pipeline-start-preflight|pipeline-state|po-human-approval|refresh-mandatory|stamp-candidate|onboarding/)) return "admin";
    if (has(cmd, /fill-goldfish-briefing/)) return "content";
    if (has(cmd, /scripts\/(run-in|run-parallel|full-verify)|harness\/scripts\/verify|--test\b|\.test\.mjs/)) return "impl";
    if (has(cmd, /^(rg|grep|cat|head|tail|find|sed|wc)\b/)) {
      if (has(cmd, /\b(specs|docs|templates|backlog)\//)) return "content";
      if (has(cmd, /\b(plugins|harness|scripts|architecture|scratch\/(agent-out|clones))\//)) return "impl";
    }
    if (has(cmd, /^mkdir\b/)) return "admin";
    return "admin";
  }
  return has(text, /plugins\/|harness\//) ? "impl" : "admin";
}

function newTotals() {
  return Object.fromEntries(BUCKETS.map((b) => [b, { fresh: 0, cacheRead: 0, messages: 0 }]));
}

function analyse(file) {
  const byId = new Map();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const m = row.message;
    if (row.type !== "assistant" || !m?.usage) continue;
    const key = m.id ?? row.uuid;
    const calls = (Array.isArray(m.content) ? m.content : []).filter((c) => c?.type === "tool_use");
    const previous = byId.get(key);
    byId.set(key, { usage: m.usage, calls: calls.length ? calls : previous?.calls ?? [] });
  }
  const totals = newTotals();
  for (const { usage, calls } of byId.values()) {
    const bucket = calls.length === 0 ? "dialogue" : calls.map((c) => classifyCall(c.name, c.input))[0];
    const fresh = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.output_tokens ?? 0);
    totals[bucket].fresh += fresh;
    totals[bucket].cacheRead += usage.cache_read_input_tokens ?? 0;
    totals[bucket].messages += 1;
  }
  return totals;
}

// A directory argument stands for every `*.output` and `*.jsonl` file directly inside it (subagent transcripts).
const files = process.argv.slice(2).flatMap((arg) =>
  statSync(arg).isDirectory()
    ? readdirSync(arg).filter((n) => /\.(output|jsonl)$/u.test(n)).sort().map((n) => join(arg, n))
    : [arg]);
if (files.length === 0) { console.error("usage: node scripts/transcript-token-buckets.mjs <transcript.jsonl> [more.jsonl ...]"); process.exit(2); }
const all = newTotals();
const perFile = {};
for (const file of files) {
  const t = analyse(file);
  perFile[file.split("/").pop()] = t;
  for (const b of BUCKETS) for (const k of ["fresh", "cacheRead", "messages"]) all[b][k] += t[b][k];
}
const sum = (key) => BUCKETS.reduce((s, b) => s + all[b][key], 0);
const share = Object.fromEntries(BUCKETS.map((b) => [b, {
  freshPercent: Number(((100 * all[b].fresh) / (sum("fresh") || 1)).toFixed(1)),
  cacheReadPercent: Number(((100 * all[b].cacheRead) / (sum("cacheRead") || 1)).toFixed(1)),
}]));
console.log(JSON.stringify({ files: files.length, total: all, share, ...(files.length <= 3 ? { perFile } : {}) }));
