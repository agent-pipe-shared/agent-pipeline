// SPDX-License-Identifier: SUL-1.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIT_INDEX_SCHEMA, buildAuditIndex } from "./audit-index.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const COMMIT = "a".repeat(40);

function withFixture(fn) {
  const scratch = join(repoRoot, "scratch");
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, "audit-index-"));
  try {
    writeFileSync(join(dir, "spec.md"), "spec body");
    writeFileSync(join(dir, "gate.json"), '{"ok":true}');
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("complete index carries source, commit and gate digests", () => {
  withFixture((dir) => {
    const index = buildAuditIndex({ rootDir: dir, sources: ["spec.md"], commit: COMMIT, gates: [{ id: "verify", path: "gate.json" }] });
    assert.equal(index.schema, AUDIT_INDEX_SCHEMA);
    assert.equal(index.sources[0].sha256, sha("spec body"));
    assert.equal(index.gates[0].sha256, sha('{"ok":true}'));
    assert.equal(index.commit.sha, COMMIT);
    assert.deepEqual(index.missingSteps, []);
    assert.equal(index.complete, true);
  });
});

test("missing source, gate and commit are named explicitly, never omitted", () => {
  withFixture((dir) => {
    const index = buildAuditIndex({ rootDir: dir, sources: ["spec.md", "nope.md"], gates: [{ id: "critic", path: "absent.json" }] });
    const steps = index.missingSteps.map((m) => `${m.step}=${m.reason}`);
    assert.deepEqual(steps, ["source:nope.md=missing", "commit=missing", "gate:critic=missing"]);
    assert.equal(index.complete, false);
    assert.equal(index.sources.find((s) => s.path === "nope.md").sha256, null);
  });
});

test("nothing declared reports sources and gates as missing steps", () => {
  withFixture((dir) => {
    const index = buildAuditIndex({ rootDir: dir });
    assert.deepEqual(
      index.missingSteps.map((m) => m.step),
      ["sources", "commit", "gates"],
    );
  });
});

test("malformed commit and escaping or absolute paths are refused, not hashed", () => {
  withFixture((dir) => {
    const index = buildAuditIndex({ rootDir: dir, sources: ["../outside.md", resolve(dir, "spec.md")], commit: "HEAD", gates: [] });
    assert.equal(index.commit.status, "refused");
    assert.ok(index.sources.every((s) => s.status === "refused" && s.sha256 === null));
    assert.equal(index.complete, false);
  });
});

test("output is deterministic regardless of input order", () => {
  withFixture((dir) => {
    const a = buildAuditIndex({ rootDir: dir, sources: ["spec.md", "gate.json"], commit: COMMIT, gates: [{ id: "b", path: "gate.json" }, { id: "a", path: "spec.md" }] });
    const b = buildAuditIndex({ rootDir: dir, sources: ["gate.json", "spec.md"], commit: COMMIT, gates: [{ id: "a", path: "spec.md" }, { id: "b", path: "gate.json" }] });
    assert.deepEqual(a, b);
  });
});

test("rootDir is required", () => {
  assert.throws(() => buildAuditIndex({}), TypeError);
});
