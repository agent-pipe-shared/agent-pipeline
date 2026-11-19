// SPDX-License-Identifier: SUL-1.0
// Tracked source of a greenfield watch tool (docs/operating-tools.md, section "Greenfield watch"). Reads runner transcripts, never writes to a project.
// Read-only: list the Codex tool calls that ran with sandbox_permissions require_escalated (time, command head, justification head).
// usage: node scripts/greenfield-watch/gf-esc.mjs <codex rollout.jsonl>
import { readFileSync } from "node:fs";

const lines = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
let n = 0;
for (let i = 0; i < lines.length; i += 1) {
  let o; try { o = JSON.parse(lines[i]); } catch { continue; }
  const p = o.payload ?? {};
  if (o.type !== "response_item" || !(p.type === "function_call" || p.type === "custom_tool_call")) continue;
  const raw = String(p.arguments ?? p.input ?? "");
  if (!/sandbox_permissions[^,]{0,8}require_escalated/u.test(raw)) continue;
  n += 1;
  const cmd = (raw.match(/cmd:\s*['"`]([^'"`]{0,140})/u) ?? raw.match(/"cmd":"([^"]{0,140})/u) ?? [])[1] ?? raw.slice(0, 100);
  const just = (raw.match(/justification:\s*"([^"]{0,110})/u) ?? raw.match(/"justification":"([^"]{0,110})/u) ?? [])[1] ?? "";
  console.log(`${String(n).padStart(2)} ${(o.timestamp ?? "").slice(11, 19)} ${cmd.replace(/\/home\/[^ ]*pipeline-core\/[^/ ]+\//u, "<plugin>/").replace(/\s+/gu, " ").slice(0, 120)} || ${just}`);
}
