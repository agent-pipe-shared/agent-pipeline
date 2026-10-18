// SPDX-License-Identifier: SUL-1.0
// Contract for ALF-G4C at the guard: hooks/guard-gate-strength.mjs refuses a write whose RESULTING content is a design
// review receipt (schema DESIGN_REVIEW_RECEIPT_SCHEMA), because a receipt is produced by
// scripts/design-review-receipt.mjs and never written or edited by hand. The decision is made on the resulting content,
// never on the target path or extension (lib/design-review-receipt-write-guard.mjs), and it fails open: an ordinary JSON
// file, a source file that merely mentions the schema string, and a write the guard cannot simulate all pass.
//
// The guard is spawned as the host spawns it (tool call on stdin, project root in CLAUDE_PROJECT_DIR) in a fixture
// repository; a refusal must name the producer and must NOT plan a human-override ceremony (no request file is written).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DESIGN_REVIEW_RECEIPT_SCHEMA } from "../lib/design-review-receipt.mjs";

const GUARD = join(dirname(fileURLToPath(import.meta.url)), "guard-gate-strength.mjs");
const roots = [];
process.on("exit", () => { for (const root of roots) { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } } });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gate-strength-receipt-"));
  roots.push(root);
  const init = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  mkdirSync(join(root, "receipts"), { recursive: true });
  return root;
}

function ask(root, toolName, toolInput) {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(result.error, undefined, String(result.error));
  return { status: result.status, stderr: result.stderr ?? "" };
}

const RECEIPT = JSON.stringify({ schema: DESIGN_REVIEW_RECEIPT_SCHEMA });
const refused = (answer, label) => {
  assert.equal(answer.status, 2, `${label}: ${answer.stderr}`);
  assert.match(answer.stderr, /guard-gate-strength/u, label);
  assert.match(answer.stderr, /DRR-HAND-WRITTEN/u, label);
  assert.match(answer.stderr, /scripts\/design-review-receipt\.mjs create/u, `${label}: the refusal names the producer`);
  assert.doesNotMatch(answer.stderr, /guard-human-override|Human override|human-authorized override/iu, `${label}: no override ceremony is offered`);
};

test("a Write whose content is a design review receipt is refused, names the producer and plans no override", () => {
  const root = fixture();
  const target = join(root, "receipts", "review.json");
  refused(ask(root, "Write", { file_path: target, content: RECEIPT }), "minimal receipt");
  refused(ask(root, "Write", { file_path: target, content: JSON.stringify({ schema: DESIGN_REVIEW_RECEIPT_SCHEMA, reviewedAt: "2026-01-01T00:00:00.000Z", extra: [1, 2] }) }), "receipt with invented fields");
  refused(ask(root, "Write", { file_path: join(root, "receipts", "no-extension"), content: RECEIPT }), "any file name");
  assert.equal(existsSync(target), false, "the guard never writes the file itself");
  assert.equal(existsSync(join(root, ".git", "agent-pipeline")), false, "a refusal records no human-override request and no private state");
});

test("an Edit that turns a JSON file into a design review receipt is refused", () => {
  const root = fixture();
  const target = join(root, "receipts", "draft.json");
  writeFileSync(target, "{}");
  refused(ask(root, "Edit", { file_path: target, old_string: "{}", new_string: RECEIPT }), "edit of an empty object");
  writeFileSync(target, JSON.stringify({ schema: "something.else.v1", note: "draft" }));
  refused(ask(root, "Edit", { file_path: target, old_string: "something.else.v1", new_string: DESIGN_REVIEW_RECEIPT_SCHEMA }), "edit of the schema value");
  assert.equal(existsSync(join(root, ".git", "agent-pipeline")), false, "a refusal records no human-override request and no private state");
});

test("ordinary writes pass: another JSON document, a source file that mentions the schema string, and an edit that stays ordinary", () => {
  const root = fixture();
  const json = join(root, "receipts", "other.json");
  assert.equal(ask(root, "Write", { file_path: json, content: JSON.stringify({ schema: "pipeline.something-else.v1", value: 1 }) }).status, 0);
  assert.equal(ask(root, "Write", { file_path: join(root, "receipts", "module.mjs"), content: `export const SCHEMA = ${JSON.stringify(DESIGN_REVIEW_RECEIPT_SCHEMA)};\n` }).status, 0,
    "source code that only contains the schema string is not a receipt");
  assert.equal(ask(root, "Write", { file_path: join(root, "receipts", "array.json"), content: JSON.stringify([{ schema: DESIGN_REVIEW_RECEIPT_SCHEMA }]) }).status, 0,
    "only a JSON object whose schema is the receipt schema is a receipt");
  writeFileSync(json, JSON.stringify({ schema: "pipeline.something-else.v1", value: 1 }));
  assert.equal(ask(root, "Edit", { file_path: json, old_string: "\"value\":1", new_string: "\"value\":2" }).status, 0);
  assert.equal(ask(root, "Edit", { file_path: json, old_string: "no such text", new_string: RECEIPT }).status, 0,
    "an Edit the guard cannot simulate fails open");
});
