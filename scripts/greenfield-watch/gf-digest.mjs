// SPDX-License-Identifier: SUL-1.0
// Tracked source of a greenfield watch tool (docs/operating-tools.md, section "Greenfield watch"). Reads runner transcripts, never writes to a project.
// Read-only: compact digest of ONE runner transcript (Codex rollout or Claude project JSONL): human turns, commands with a short result, coded refusals.
// usage: node scripts/greenfield-watch/gf-digest.mjs <transcript.jsonl> [fromLine=0] [maxLines=400]   (prints the next line number to continue from)
import { readFileSync } from "node:fs";

if (process.env.GF_ONLY) { const log = console.log.bind(console); console.log = (s) => { if (/REFUSAL|NONZERO|-- next line/u.test(String(s))) log(s); }; }
const [file, fromArg, maxArg] = process.argv.slice(2);
const from = Number(fromArg ?? 0);
const max = Number(maxArg ?? 400);
const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
const clip = (s, n) => String(s ?? "").replace(/\s+/gu, " ").trim().slice(0, n);
const calls = new Map();
let shown = 0;
let i = from;
const codeOf = (t) => (t.match(/\b([A-Z][A-Z0-9]+(?:-[A-Z0-9]+){1,6})\b/u) ?? [])[1] ?? "";
for (; i < lines.length && shown < max; i += 1) {
  let o;
  try { o = JSON.parse(lines[i]); } catch { continue; }
  const ts = (o.timestamp ?? o.created_at ?? "").slice(11, 19);
  const p = o.payload ?? {};
  // Antigravity brain transcript (.system_generated/logs/transcript.jsonl)
  if (o.step_index !== undefined) {
    if (o.type === "USER_INPUT") { console.log(`[${i}] ${ts} HUMAN: ${clip(o.content, 260)}`); shown += 1; }
    else if (o.type === "PLANNER_RESPONSE") {
      for (const tc of o.tool_calls ?? []) { console.log(`[${i}] ${ts} CALL ${tc.name}: ${clip(tc.args?.CommandLine ?? tc.args?.toolSummary ?? JSON.stringify(tc.args), Number(process.env.GF_CMD ?? 220))}`); shown += 1; }
      if (!(o.tool_calls ?? []).length && o.content) { console.log(`[${i}] ${ts} agent: ${clip(o.content, 200)}`); shown += 1; }
    } else if (o.type === "GENERIC" && /Command exited with code/u.test(o.content ?? "")) {
      const code = (o.content.match(/Command exited with code (\d+)/u) ?? [])[1];
      const guard = (o.content.match(/\b(GUARD-[A-Z0-9-]+)\b/u) ?? [])[1];
      console.log(`[${i}] ${ts}   -> exit ${code}${code !== "0" || guard ? " NONZERO/REFUSAL " + (guard ?? "") : ""} | ${clip(o.content.split("Command output:").pop(), code !== "0" || guard ? Number(process.env.GF_LONG ?? 420) : 110)}`);
      shown += 1;
    }
    continue;
  }
  // Codex
  if (o.type === "event_msg" && p.type === "user_message") { console.log(`[${i}] ${ts} HUMAN: ${clip(p.message, 260)}`); shown += 1; continue; }
  if (o.type === "event_msg" && p.type === "agent_message") { console.log(`[${i}] ${ts} agent: ${clip(p.message, 200)}`); shown += 1; continue; }
  if (o.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call")) {
    let cmd = p.arguments ?? p.input ?? "";
    try { const a = JSON.parse(cmd); cmd = a.cmd ?? a.command ?? cmd; } catch { /* raw */ }
    calls.set(p.call_id, { ts, cmd: clip(Array.isArray(cmd) ? cmd.join(" ") : cmd, Number(process.env.GF_CMD ?? 220)), idx: i });
    continue;
  }
  if (o.type === "response_item" && (p.type === "function_call_output" || p.type === "custom_tool_call_output")) {
    const c = calls.get(p.call_id) ?? { ts, cmd: "(call before the window)", idx: i };
    let out = typeof p.output === "string" ? p.output : JSON.stringify(p.output);
    try { const j = JSON.parse(out); if (Array.isArray(j)) out = j.map((x) => x.text ?? "").join("\n"); } catch { /* plain */ }
    let exit = (out.match(/Process exited with code (\d+)/u) ?? out.match(/"exit_code":\s*(\d+)/u) ?? [])[1];
    try { const j = JSON.parse(out); if (j && typeof j === "object" && "output" in j) { out = String(j.output); exit = j.exit_code ?? exit; } } catch { /* plain */ }
    const guard = (out.match(/\b(GUARD-[A-Z0-9-]+|[A-Z]{2,}-[A-Z0-9-]*(?:REFUSED|UNAVAILABLE|DENIED|BLOCKED|REQUIRED)[A-Z0-9-]*)\b/u) ?? [])[1];
    const refusal = (exit !== undefined && String(exit) !== "0") || guard ? ` ${guard ? "REFUSAL " + guard : "NONZERO"}` : "";
    console.log(`[${c.idx}] ${c.ts} CMD: ${c.cmd}\n      -> exit ${exit ?? "?"}${refusal} | ${clip(out, refusal ? Number(process.env.GF_LONG ?? 420) : 150)}`);
    shown += 1;
    continue;
  }
  // Claude project JSONL
  if (o.type === "user" && typeof o.message?.content === "string") { console.log(`[${i}] ${ts} HUMAN: ${clip(o.message.content, 260)}`); shown += 1; continue; }
  if (o.type === "assistant" && Array.isArray(o.message?.content)) {
    for (const b of o.message.content) {
      if (b.type === "tool_use") calls.set(b.id, { ts, cmd: clip(b.name + " " + JSON.stringify(b.input), Number(process.env.GF_CMD ?? 220)), idx: i });
      else if (b.type === "text" && b.text.trim()) { console.log(`[${i}] ${ts} agent: ${clip(b.text, 200)}`); shown += 1; }
    }
    continue;
  }
  if (o.type === "user" && Array.isArray(o.message?.content)) {
    for (const b of o.message.content) {
      if (b.type !== "tool_result") continue;
      const c = calls.get(b.tool_use_id) ?? { ts, cmd: "(call before the window)", idx: i };
      const out = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
      const refusal = b.is_error || /GUARD-|-REFUSED/u.test(out) ? ` ERR/REFUSAL ${codeOf(out)}` : "";
      console.log(`[${c.idx}] ${c.ts} CMD: ${c.cmd}\n      ->${refusal} ${clip(out, b.is_error || process.env.GF_WIDE ? Number(process.env.GF_LONG ?? 420) : 170)}`);
      shown += 1;
    }
  }
}
console.log(`-- next line: ${i} of ${lines.length}`);
