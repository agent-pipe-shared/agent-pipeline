// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkpointAuditRecord, readCheckpointArchitectureDebt, recordCheckpointPushAttempt } from "./checkpoint-push-audit.mjs";

test("checkpoint audit persists bound debt and resolves only after descendant map update", () => {
  const dir = mkdtempSync(join(tmpdir(), "checkpoint-debt-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    mkdirSync(join(dir, "architecture", "map"), { recursive: true });
    writeFileSync(join(dir, "architecture", "map", "core.md"), "# map\n");
    git("add", "."); git("commit", "-q", "-m", "base map");
    writeFileSync(join(dir, "contract.mjs"), "export const value = 1;\n");
    git("add", "."); git("commit", "-q", "-m", "checkpoint");
    const commit = git("rev-parse", "HEAD");
    const tree = git("rev-parse", "HEAD^{tree}");
    const record = checkpointAuditRecord({ commit, tree, remote: "origin", destination: "refs/heads/feat/checkpoint", intent: "backup before change", stalenessDebt: [{ type: "architecture-map-stale", target: "architecture/map/core.md", contract: "contract.mjs" }] });
    assert.equal(record?.commit, commit);
    assert.equal(recordCheckpointPushAttempt({ projectDir: dir, record }).ok, true);
    const open = readCheckpointArchitectureDebt({ projectDir: dir });
    assert.equal(open.ok, true);
    assert.equal(open.debt.length, 1);
    assert.equal(open.resolvedDebt.length, 0);
    writeFileSync(join(dir, "architecture", "map", "core.md"), "# updated map\n");
    git("add", "."); git("commit", "-q", "-m", "refresh map");
    const updated = readCheckpointArchitectureDebt({ projectDir: dir });
    assert.equal(updated.debt.length, 0);
    assert.equal(updated.resolvedDebt.length, 1);
    assert.equal(updated.rawDebt.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
