// SPDX-License-Identifier: SUL-1.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { attributeAttachment, measureContextBaseline, parseTranscript, SCHEMA } from "./context-baseline.mjs";
import { mkdtempTestScratch } from "../plugins/pipeline-core/lib/test-tmpdir.mjs";

const usage = (id, fresh, write, read) => ({ type: "assistant", message: { id, usage: { input_tokens: fresh, cache_creation_input_tokens: write, cache_read_input_tokens: read } } });
const attach = (attachment) => ({ type: "attachment", attachment });
const denial = { type: "user", message: { content: [{ type: "tool_result", content: "PreToolUse:Bash hook error: [command hook 6]: BLOCKED (guard-lifecycle-ready): x" }] } };

const fixture = [
  attach({ type: "skill_listing", content: "- pipeline-core:pipeline-start: start\n- other:thing: elsewhere" }),
  attach({ type: "instructions", files: [{ path: "/r/CLAUDE.md", content: "r".repeat(1024) }, { path: "/h/.claude/projects/p/memory/MEMORY.md", content: "m".repeat(512) }] }),
  usage("m1", 2, 900, 100),
  usage("m2", 2, 50, 1000),
  denial,
  { type: "system", subtype: "compact_boundary" },
  attach({ type: "invoked_skills", skills: [{ name: "pipeline-core:pipeline-start", content: "x".repeat(2048) }, { name: "other:skill", content: "y".repeat(1024) }] }),
  attach({ type: "hook_additional_context", content: ["continuity"] }),
  usage("m3", 0, 0, 0),
  usage("m4", 2, 500, 300),
  usage("m5", 2, 10, 900),
  denial,
];

test("each window's baseline is the first real reply's input; later requests re-read at most that much", () => {
  const r = measureContextBaseline(fixture, { windows: 2 });
  assert.equal(r.schema, SCHEMA);
  assert.equal(r.windows, 2);
  assert.deepEqual(r.baselineTokensPerWindow, [1002, 802]);
  assert.equal(r.requests, 4, "the zero-usage reply is not a request");
  assert.equal(r.inputTokens, 1002 + 1052 + 802 + 912);
  assert.equal(r.baselineShareOfInput, Math.round(((1002 + 1002 + 802 + 802) / 3768) * 1000) / 1000);
  assert.equal(r.guardDenials.count, 2);
});

test("attachments before the first reply are attributed to pipeline, user and harness", () => {
  const r = measureContextBaseline(fixture, { windows: 2 });
  const [first, second] = r.lastWindows;
  assert.ok(first.attributedKB.pipeline > 0, "pipeline-core listing line and CLAUDE.md count as pipeline");
  assert.ok(first.attributedKB.user > 0, "the memory index counts as user");
  assert.equal(second.attributedKB.pipeline, Math.round((2048 + Buffer.byteLength(JSON.stringify({ type: "hook_additional_context", content: ["continuity"] }))) / 102.4) / 10);
  assert.ok(Object.keys(second.partsKB).some((k) => k.startsWith("invoked_skills(pipeline-core:pipeline-start,other:skill)")));
});

test("only pipeline-core skills of an invoked-skills attachment are pipeline-owned", () => {
  const a = { type: "invoked_skills", skills: [{ name: "pipeline-core:x", content: "abc" }, { name: "design:y", content: "defg" }] };
  const out = attributeAttachment(a);
  assert.equal(out.pipeline, 3);
  assert.equal(out.pipeline + out.harness, Buffer.byteLength(JSON.stringify(a)));
});

test("the CLI prints the report for a file, skips torn lines and refuses a missing argument", () => {
  const dir = mkdtempTestScratch("context-baseline-");
  const file = join(dir, "t.jsonl");
  writeFileSync(file, `${fixture.map((e) => JSON.stringify(e)).join("\n")}\n{torn\n`);
  assert.equal(parseTranscript(`${JSON.stringify(fixture[0])}\n{torn`).length, 1);
  const script = fileURLToPath(new URL("./context-baseline.mjs", import.meta.url));
  const ok = spawnSync(process.execPath, [script, file, "--windows", "1"], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  const report = JSON.parse(ok.stdout);
  assert.equal(report.lastWindows.length, 1);
  assert.equal(report.windows, 2);
  const bad = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /usage: node scripts\/context-baseline\.mjs/);
});
