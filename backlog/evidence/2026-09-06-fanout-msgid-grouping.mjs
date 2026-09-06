#!/usr/bin/env node
// Does message.id group dispatch calls by TURN? If yes, a PreToolUse hook holding
// transcript_path can decide "same turn" exactly, and the slicing design's open
// timestamp-window parameter dissolves instead of needing a guessed number.
import { readFileSync } from "node:fs";

const raw = readFileSync(process.argv[2], "utf8");
const groups = new Map(); // msgId -> [{ts, desc}]

for (const line of raw.split("\n")) {
  if (!line.trim()) continue;
  let row;
  try { row = JSON.parse(line); } catch { continue; }
  const content = row?.message?.content;
  if (!Array.isArray(content)) continue;
  const msgId = row?.message?.id;
  if (!msgId) continue;
  for (const block of content) {
    if (block?.type !== "tool_use") continue;
    if (!["Task", "Agent", "Workflow"].includes(block.name)) continue;
    if (!groups.has(msgId)) groups.set(msgId, []);
    groups.get(msgId).push({
      ts: row.timestamp,
      desc: String(block?.input?.description ?? "").slice(0, 46),
    });
  }
}

const sizes = new Map();
for (const [, calls] of groups) sizes.set(calls.length, (sizes.get(calls.length) ?? 0) + 1);

console.log(`distinct message ids carrying a dispatch call: ${groups.size}`);
console.log("group size -> how many messages:", Object.fromEntries([...sizes].sort((a, b) => a[0] - b[0])));

console.log("\nmulti-dispatch messages (these are the real fan-outs):");
let shown = 0;
for (const [msgId, calls] of groups) {
  if (calls.length < 2 || shown >= 5) continue;
  shown += 1;
  console.log(`  ${msgId}  n=${calls.length}`);
  for (const c of calls) console.log(`    ${c.ts}  ${c.desc}`);
}
if (shown === 0) console.log("  none");
