#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DENIAL_CODE, evaluateHandoverSizeGuard, proposedHandoverBytes } from "./guard-handover-size.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const SCRATCH_ROOT = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH_ROOT, { recursive: true });

function fixtureRoot(label, { maxBytes = 50 } = {}) {
  const root = mkdtempSync(join(SCRATCH_ROOT, `guard-handover-size-test-${label}-`));
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(
    join(root, "project", "pipeline.json"),
    JSON.stringify({ handover: { path: "docs/state.md", maxBytes } }),
    "utf8",
  );
  mkdirSync(join(root, "docs"), { recursive: true });
  return root;
}

function withFixture(label, opts, fn) {
  const root = fixtureRoot(label, opts);
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == DoD 1: below-cap is inert (admits) for a handover file well under the cap ==
withFixture("below-cap", { maxBytes: 50 }, (root) => {
  writeFileSync(join(root, "docs", "state.md"), "short", "utf8"); // 5 bytes, cap 50
  const result = evaluateHandoverSizeGuard(
    { tool_name: "Write", tool_input: { file_path: join(root, "docs", "state.md"), content: "still short" } },
    { rootDir: root },
  );
  assert.equal(result.exitCode, 0);
});

// == DoD 2: at/over-cap AND growing -- refuses with the typed code + current size/cap/script path ==
withFixture("over-cap-growing", { maxBytes: 10 }, (root) => {
  writeFileSync(join(root, "docs", "state.md"), "0123456789", "utf8"); // 10 bytes, AT the cap already
  const result = evaluateHandoverSizeGuard(
    { tool_name: "Write", tool_input: { file_path: join(root, "docs", "state.md"), content: "01234567890" } }, // 11 bytes: growing
    { rootDir: root, rotateScriptPath: "/fixture/handover-rotate.mjs" },
  );
  assert.equal(result.exitCode, 2);
  assert.ok(result.stderr.includes(DENIAL_CODE));
  assert.ok(result.stderr.includes("Current size: 10 bytes"));
  assert.ok(result.stderr.includes("Cap: 10 bytes"));
  assert.ok(result.stderr.includes("/fixture/handover-rotate.mjs"));
});

// == DoD 3: at/over-cap AND the edit is a net decrease -- admits (never blocks a rotation) ==
withFixture("over-cap-decrease", { maxBytes: 10 }, (root) => {
  writeFileSync(join(root, "docs", "state.md"), "01234567890123456789", "utf8"); // 20 bytes, well over cap
  const result = evaluateHandoverSizeGuard(
    { tool_name: "Write", tool_input: { file_path: join(root, "docs", "state.md"), content: "short" } }, // 5 bytes: a decrease
    { rootDir: root },
  );
  assert.equal(result.exitCode, 0);
});

// == DoD 4: a write to any OTHER file is unaffected regardless of that file's own size ==
withFixture("other-file", { maxBytes: 10 }, (root) => {
  const result = evaluateHandoverSizeGuard(
    { tool_name: "Write", tool_input: { file_path: join(root, "docs", "other.md"), content: "x".repeat(1000) } },
    { rootDir: root },
  );
  assert.equal(result.exitCode, 0);
});

// == Non-write tools are inert regardless of target ==
withFixture("non-write-tool", { maxBytes: 10 }, (root) => {
  writeFileSync(join(root, "docs", "state.md"), "01234567890123456789", "utf8");
  const result = evaluateHandoverSizeGuard(
    { tool_name: "Bash", tool_input: { command: "ls" } },
    { rootDir: root },
  );
  assert.equal(result.exitCode, 0);
});

// == Edit tool: proposed size computed against current on-disk content, single replacement ==
withFixture("edit-tool-growing", { maxBytes: 10 }, (root) => {
  writeFileSync(join(root, "docs", "state.md"), "0123456789", "utf8"); // 10 bytes, at cap
  const result = evaluateHandoverSizeGuard(
    {
      tool_name: "Edit",
      tool_input: { file_path: join(root, "docs", "state.md"), old_string: "9", new_string: "999" }, // net +2 bytes
    },
    { rootDir: root },
  );
  assert.equal(result.exitCode, 2);
});

withFixture("edit-tool-decrease", { maxBytes: 10 }, (root) => {
  writeFileSync(join(root, "docs", "state.md"), "0123456789", "utf8");
  const result = evaluateHandoverSizeGuard(
    {
      tool_name: "Edit",
      tool_input: { file_path: join(root, "docs", "state.md"), old_string: "0123456789", new_string: "0" },
    },
    { rootDir: root },
  );
  assert.equal(result.exitCode, 0);
});

// == NotebookEdit: conservative approximation, insert/replace grows, delete holds size steady ==
withFixture("notebook-edit-growing", { maxBytes: 10 }, (root) => {
  writeFileSync(join(root, "docs", "state.md"), "0123456789", "utf8");
  const result = evaluateHandoverSizeGuard(
    {
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: join(root, "docs", "state.md"), new_source: "x", edit_mode: "insert" },
    },
    { rootDir: root },
  );
  assert.equal(result.exitCode, 2);
});

withFixture("notebook-edit-delete", { maxBytes: 10 }, (root) => {
  writeFileSync(join(root, "docs", "state.md"), "0123456789", "utf8"); // at cap
  const result = evaluateHandoverSizeGuard(
    {
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: join(root, "docs", "state.md"), new_source: "", edit_mode: "delete" },
    },
    { rootDir: root },
  );
  // delete holds proposed == current (== cap, not a decrease) -- still refused, since "at cap, not a decrease" is the documented block condition.
  assert.equal(result.exitCode, 2);
});

// == An unreadable tool_input shape fails OPEN (admits) rather than guessing ==
withFixture("unknown-shape", { maxBytes: 10 }, (root) => {
  writeFileSync(join(root, "docs", "state.md"), "0123456789", "utf8");
  const result = evaluateHandoverSizeGuard(
    { tool_name: "Write", tool_input: { file_path: join(root, "docs", "state.md") } }, // no `content` key
    { rootDir: root },
  );
  assert.equal(result.exitCode, 0);
});

// == proposedHandoverBytes unit coverage (Write/Edit/NotebookEdit) ==
{
  assert.equal(proposedHandoverBytes({ tool_name: "Write", tool_input: { content: "abcd" } }, "xx"), 4);
  assert.equal(proposedHandoverBytes({ tool_name: "Edit", tool_input: { old_string: "a", new_string: "aa", replace_all: true } }, "aaa"), 6);
  assert.equal(proposedHandoverBytes({ tool_name: "NotebookEdit", tool_input: { new_source: "yy", edit_mode: "replace" } }, "xxxx"), 6);
  assert.equal(proposedHandoverBytes({ tool_name: "Write", tool_input: {} }, "xx"), null);
  assert.equal(proposedHandoverBytes({ tool_name: "Grep", tool_input: {} }, "xx"), null);
}

console.log("guard-handover-size.test.mjs: all assertions passed");
