// SPDX-License-Identifier: SUL-1.0
// Regression for pipeline.git-hook-runtime-snapshot-omits-protected-baseline-catalog (AC-178): the runtime snapshot must
// carry the exact plugin-root protected-baseline.json (digest-bound), and a missing, changed, removed or aliased catalog
// stays refused under the existing inventory / physical verification controls. Fixtures live under os.tmpdir() and are
// removed before a test ends.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectGitHookSourceSnapshot, publishGitHookRuntimeSnapshot, verifyGitHookRuntimeSnapshot } from "./git-hook-runtime-snapshot.mjs";

const CATALOG = "protected-baseline.json";
const REAL_CATALOG = readFileSync(join(import.meta.dirname, "..", CATALOG));

function fixture(t, { catalog = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), "ghs-baseline-"));
  const plugin = join(base, "plugin"), state = join(base, "state");
  for (const [path, body] of [["lib/governance-scope.mjs", "export const scope = 1;\n"], ["hooks/h.mjs", "export const h = 2;\n"]]) {
    mkdirSync(join(plugin, path, ".."), { recursive: true });
    writeFileSync(join(plugin, path), body);
  }
  if (catalog) writeFileSync(join(plugin, CATALOG), REAL_CATALOG);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 3 }));
  return { plugin, lib: join(plugin, "lib"), state };
}
const publish = (f) => publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state });
const codeOf = (fn) => { try { fn(); } catch (error) { return error?.code ?? String(error?.message); } return null; };

test("the snapshot contains the exact catalog, listed with its digest, at the snapshot-local path the copied loader resolves", (t) => {
  const f = fixture(t), snap = publish(f);
  const copied = readFileSync(join(snap.root, CATALOG));
  assert.ok(copied.equals(REAL_CATALOG));
  const manifest = JSON.parse(readFileSync(join(snap.root, "snapshot.json"), "utf8"));
  const row = manifest.inventory.find((r) => r.path === CATALOG);
  assert.equal(row?.sha256, createHash("sha256").update(REAL_CATALOG).digest("hex"));
  assert.deepEqual(Object.keys(row).sort(), ["path", "sha256"]);
  assert.equal(verifyGitHookRuntimeSnapshot({ snapshotRoot: snap.root, manifestSha256: snap.manifestSha256 }).status, "verified");
});

test("the catalog digest is part of the manifest digest: a changed source catalog yields a different snapshot", (t) => {
  const f = fixture(t), first = publish(f);
  writeFileSync(join(f.plugin, CATALOG), Buffer.concat([REAL_CATALOG, Buffer.from(" ")]));
  assert.notEqual(publish(f).manifestSha256, first.manifestSha256);
});

test("a missing source catalog fails publication and inspection with a useful code", (t) => {
  const f = fixture(t, { catalog: false });
  assert.equal(codeOf(() => publish(f)), "GHS-BASELINE-MISSING");
  assert.equal(codeOf(() => inspectGitHookSourceSnapshot({ pluginLibDir: f.lib })), "GHS-BASELINE-MISSING");
});

test("a changed catalog in a published snapshot is refused (GHS-CONTENT)", (t) => {
  const f = fixture(t), snap = publish(f);
  writeFileSync(join(snap.root, CATALOG), "x".repeat(REAL_CATALOG.length));
  assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot({ snapshotRoot: snap.root, manifestSha256: snap.manifestSha256 })), "GHS-CONTENT");
});

test("a catalog removed from a published snapshot is refused", (t) => {
  const f = fixture(t), snap = publish(f);
  unlinkSync(join(snap.root, CATALOG));
  assert.notEqual(codeOf(() => verifyGitHookRuntimeSnapshot({ snapshotRoot: snap.root, manifestSha256: snap.manifestSha256 })), null);
});

test("an aliased (symlink) source catalog is refused", (t) => {
  const f = fixture(t, { catalog: false });
  const target = join(f.plugin, "elsewhere.json");
  writeFileSync(target, REAL_CATALOG);
  try { symlinkSync(target, join(f.plugin, CATALOG), "file"); } catch (error) { t.skip("symlink creation unavailable: " + error.code); return; }
  assert.notEqual(codeOf(() => publish(f)), null);
});

test("an aliased (hardlinked) source catalog is refused on every host, with no symlink privilege needed", (t) => {
  const f = fixture(t, { catalog: false });
  const target = join(f.plugin, "elsewhere.json");
  writeFileSync(target, REAL_CATALOG);
  linkSync(target, join(f.plugin, CATALOG));
  assert.equal(codeOf(() => publish(f)), "PU-FILE");
});

test("only the named catalog is admitted from the plugin root: other root files are not copied", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.plugin, "other.json"), "{}\n");
  const snap = publish(f);
  const manifest = JSON.parse(readFileSync(join(snap.root, "snapshot.json"), "utf8"));
  assert.equal(manifest.inventory.some((r) => r.path === "other.json"), false);
  assert.equal(manifest.inventory.some((r) => r.path === CATALOG), true);
});
