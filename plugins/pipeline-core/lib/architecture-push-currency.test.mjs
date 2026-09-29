// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspectArchitecturePushCurrency } from "./architecture-push-currency.mjs";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "architecture-push-currency-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "contract.mjs"), "export const value = 1;\n");
  git("add", "."); git("commit", "-q", "-m", "initial contract");
  return { dir, git, commit: () => git("rev-parse", "HEAD") };
}

test("unadopted repository stays outside AC-18 push map gate", () => {
  const f = fixture();
  try { assert.deepEqual(inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() }).applicable, false); }
  finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("a candidate cannot become unadopted by deleting its committed map", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.dir, "architecture", "map"), { recursive: true });
    writeFileSync(join(f.dir, "architecture", "map", "index.md"), "# Map\n");
    writeFileSync(join(f.dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "adopt map");
    f.git("rm", "-q", "-r", "architecture/map");
    f.git("commit", "-q", "-m", "remove map");
    const removed = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() });
    assert.equal(removed.ok, false);
    assert.match(removed.reason, /removed after adoption/u);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("a valid deferred adoption decision may precede the first map commit", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.dir, "architecture"), { recursive: true });
    writeFileSync(join(f.dir, "architecture", "adoption-state.json"), JSON.stringify({ schema: "pipeline.adoption-state.v1", state: "deferred", scope: ["specs/example/"] }));
    f.git("add", "."); f.git("commit", "-q", "-m", "defer adoption");
    const deferred = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() });
    assert.equal(deferred.ok, true);
    assert.equal(deferred.applicable, false);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("approved or malformed adoption state without a map fails closed", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.dir, "architecture"), { recursive: true });
    const path = join(f.dir, "architecture", "adoption-state.json");
    writeFileSync(path, JSON.stringify({ schema: "pipeline.adoption-state.v1", state: "approved-scoped", scope: ["specs/example/"] }));
    f.git("add", "."); f.git("commit", "-q", "-m", "approve scoped adoption");
    const approved = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() });
    assert.equal(approved.ok, false);
    assert.match(approved.reason, /requires a map/u);
    writeFileSync(path, "{broken\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "malform adoption");
    const malformed = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() });
    assert.equal(malformed.ok, false);
    assert.match(malformed.reason, /malformed/u);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("candidate sees contract changes after map update and checkpoint binds debt", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.dir, "architecture", "map"), { recursive: true });
    writeFileSync(join(f.dir, "architecture", "map", "index.md"), "# Map\n");
    writeFileSync(join(f.dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "map contract");
    assert.equal(inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() }).stale, false);
    writeFileSync(join(f.dir, "src", "contract.mjs"), "export const value = 2;\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "change contract");
    const stale = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit(), checkpoint: true });
    assert.equal(stale.stale, true);
    assert.equal(stale.stalenessDebt.length, 1);
    assert.equal(stale.stalenessDebt[0].target, "architecture/map/core.md");
    writeFileSync(join(f.dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core v2\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "refresh map");
    assert.equal(inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() }).stale, false);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("partial map fails closed while wildcard and append-only data do not stale the map", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.dir, "architecture", "map"), { recursive: true });
    writeFileSync(join(f.dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n  - backlog/items/**\n  - backlog/transitions.ndjson\n---\n# Core\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "partial map");
    assert.match(inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() }).reason, /index is missing/u);
    writeFileSync(join(f.dir, "architecture", "map", "index.md"), "# Map\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "complete map");
    mkdirSync(join(f.dir, "backlog", "items"), { recursive: true });
    writeFileSync(join(f.dir, "backlog", "transitions.ndjson"), "{}\n");
    writeFileSync(join(f.dir, "backlog", "items", "item.md"), "# Item\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "append backlog");
    assert.equal(inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() }).stale, false);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
