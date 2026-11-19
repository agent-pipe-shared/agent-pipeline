// SPDX-License-Identifier: SUL-1.0
// Tracked source of a greenfield watch tool (docs/operating-tools.md, section "Greenfield watch"). Reads runner transcripts, never writes to a project.
// Read-only: friction counters of ONE runner transcript (substring counts per raw line, so a code inside a loaded document counts too: read the digest before quoting a number).
// usage: node scripts/greenfield-watch/gf-count.mjs <transcript.jsonl>...
import { readFileSync } from "node:fs";

const PATTERNS = {
  escalated: /require_escalated/gu,
  guardBlocked: /BLOCKED \(guard-/gu,
  claudeIsError: /"is_error":\s*true/gu,
  nonZeroExit: /"exit_code":\s*[1-9]|exited with code [1-9]|Exit code [1-9]/gu,
  toolCalls: /"type":"(?:function_call|custom_tool_call)"|"type":"tool_use"|"tool_calls":\[/gu,
};
for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const escalatedCalls = lines.filter((l) => /"type":"(?:function_call|custom_tool_call)"/u.test(l) && /sandbox_permissions[^,]{0,8}require_escalated/u.test(l)).length;
  const counts = [`escalatedCalls ${escalatedCalls}`, ...Object.entries(PATTERNS).map(([k, re]) => `${k} ${(text.match(re) ?? []).length}`)].join(" | ");
  console.log(`${file.split(/[\\/]/u).slice(-1)[0].slice(0, 48)} (${text.split("\n").length} lines): ${counts}`);
}
