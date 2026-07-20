#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planBacklogMigration } from "./migrate-backlog-state.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "backlog-migration-"));
  mkdirSync(join(root, "backlog", "items"), { recursive: true });
  writeFileSync(join(root, "backlog", "items", "2026-07-20-example.md"), "---\ntype: defect\nstatus: accepted\ncreated: 2026-07-20\nsource: fixture\nowner: Pipeline Elephant\ndue: 2026-07-27\nexpires: 2026-08-03\n---\n\n# Example\n");
  return root;
}

test("legacy plan preserves body and schedule while recording only in-progress baseline", () => {
  const root = fixture();
  try {
    const result = planBacklogMigration(root, { commit: "a".repeat(40), at: "2026-07-20" });
    assert.equal(result.ok, true);
    assert.deepEqual(result.items[0].item.metadata, {
      schema: "pipeline.backlog-item.v1",
      id: "pipeline.example",
      type: "defect",
      owner: "pipeline",
      status: "in_progress",
      created: "2026-07-20",
      source: "fixture",
      due: "2026-07-27",
      expires: "2026-08-03",
    });
    assert.match(result.items[0].item.body, /# Example/);
    assert.equal(result.events[0].to, "in_progress");
    assert.equal(result.events[0].evidence.kind, "baseline-migration");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unsupported legacy status blocks migration before any write", () => {
  const root = fixture();
  try {
    const path = join(root, "backlog", "items", "2026-07-20-example.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("status: accepted", "status: deferred"));
    const result = planBacklogMigration(root, { commit: "a".repeat(40), at: "2026-07-20" });
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), /unsupported legacy status deferred/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
