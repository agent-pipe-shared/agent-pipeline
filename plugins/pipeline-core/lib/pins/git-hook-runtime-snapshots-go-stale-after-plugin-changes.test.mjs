// SPDX-License-Identifier: SUL-1.0
// Regression pin for pipeline.git-hook-runtime-snapshots-go-stale-after-plugin-changes (AC-179, matrix stage 25).
// Acceptance points of the original item:
//   P1 a hook snapshot is bound to the plugin identity (content-addressed) and a changed plugin is detected as stale;
//   P2 a typed HOOK-SNAPSHOT-STALE diagnostic is reported in preflight AND in the commit refusal, naming one refresh command;
//   P3 only the destination operand of cp/mv/install is the write target (a source outside the root is a read);
//   P4 fixtures run on win32 and POSIX (directory mode bits / directory symlinks are a typed host limitation).
// Fixtures live under the repository scratch/ (gitignored) and are removed before a test ends.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { publishGitHookRuntimeSnapshot } from "../git-hook-runtime-snapshot.mjs";
import { assessHookCurrentness } from "../hook-currentness.mjs";
import { renderImpl } from "../../scripts/commit-msg-hook-install.mjs";
import { isForbiddenCrossRepositoryMutation } from "../../hooks/guard-lifecycle-ready.mjs";

const REPO = resolve(import.meta.dirname, "..", "..", "..", "..");
const PLUGIN = resolve(import.meta.dirname, "..", "..");
const HOST_LIMITATION = "host-limitation: owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)";
const REAL_CATALOG = readFileSync(join(PLUGIN, "protected-baseline.json"));

function scratch(t) {
  const parent = join(REPO, "scratch");
  mkdirSync(parent, { recursive: true });
  const base = mkdtempSync(join(parent, "ghs-stale-"));
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 3 }));
  return base;
}
function pluginFixture(t, hookBody = "export const h = 1;\n") {
  const base = scratch(t), plugin = join(base, "plugin"), state = join(base, "state");
  for (const [path, body] of [["lib/governance-scope.mjs", "export const scope = 1;\n"], ["hooks/h.mjs", hookBody]]) {
    mkdirSync(join(plugin, path, ".."), { recursive: true });
    writeFileSync(join(plugin, path), body);
  }
  writeFileSync(join(plugin, "protected-baseline.json"), REAL_CATALOG);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  return { base, plugin, lib: join(plugin, "lib"), state };
}

test("P1: the snapshot is content-addressed and a plugin change makes the recorded hook stale", (t) => {
  const f = pluginFixture(t);
  const snap = publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state });
  const recorded = join(snap.root, "lib");
  assert.match(snap.root.replaceAll("\\", "/"), new RegExp(`/runtime-${snap.manifestSha256}$`));
  assert.deepEqual(assessHookCurrentness({ recordedPluginLibDir: recorded, pluginLibDir: f.lib }), { current: true, updateRequired: false });
  writeFileSync(join(f.plugin, "hooks", "h.mjs"), "export const h = 2; // hotfix\n");
  assert.deepEqual(assessHookCurrentness({ recordedPluginLibDir: recorded, pluginLibDir: f.lib }), { current: false, updateRequired: true });
  // Fail closed: an unreadable source tree and a missing binding are stale, never current.
  assert.equal(assessHookCurrentness({ recordedPluginLibDir: recorded, pluginLibDir: join(f.base, "missing", "lib") }).current, false);
  assert.equal(assessHookCurrentness({ recordedPluginLibDir: undefined, pluginLibDir: f.lib }).current, false);
});

test("P1: republishing after the change yields a different snapshot (old one is not silently reused)", (t) => {
  const f = pluginFixture(t);
  const first = publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state });
  writeFileSync(join(f.plugin, "hooks", "h.mjs"), "export const h = 3;\n");
  const second = publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state });
  assert.notEqual(second.manifestSha256, first.manifestSha256);
});

test("P2 (commit refusal): the rendered commit-msg implementation checks snapshot currentness and names HOOK-SNAPSHOT-STALE", () => {
  // RED on the current source: renderImpl()/decorateInstalledImpl() in scripts/commit-msg-hook-install.mjs verify the
  // snapshot against ITSELF (admitPipelineScope) but never compare it with the loaded plugin, so an old active snapshot admits.
  const rendered = renderImpl("/state/agent-pipeline/commit-msg-hook/runtime-" + "a".repeat(64) + "/lib");
  assert.match(rendered, /HOOK-SNAPSHOT-STALE/u);
});

test("P2 (preflight): the typed stale diagnostic is the literal HOOK-SNAPSHOT-STALE code", () => {
  // Preflight reports status hook-refresh-required / state installed-but-stale with a refresh nextAction, but not the
  // item's typed code. Pinned against the preflight source text; RED while the literal code is absent.
  const source = readFileSync(join(PLUGIN, "scripts", "pipeline-start-preflight.mjs"), "utf8");
  assert.match(source, /HOOK-SNAPSHOT-STALE/u);
});

test("P3: cp/mv/install classify only the destination operand; an outside source is a read", (t) => {
  const base = scratch(t), inside = join(base, "project"), outside = join(base, "installed-plugin").replaceAll("\\", "/");
  mkdirSync(inside, { recursive: true });
  const dest = join(inside, "x.mjs").replaceAll("\\", "/");
  for (const verb of ["cp", "mv", "install"]) {
    assert.equal(isForbiddenCrossRepositoryMutation(`${verb} /outside-root/src/x.mjs ${dest}`, inside), false, `${verb} outside source, inside destination`);
  }
  assert.equal(isForbiddenCrossRepositoryMutation(`cp ${dest} /tmp/elsewhere/x.mjs`, inside), true, "outside destination stays refused");
  assert.equal(typeof outside, "string");
});

test("P4: directory-mode and directory-symlink variants are a typed host limitation on win32", (t) => {
  if (process.platform === "win32") { t.skip(HOST_LIMITATION); return; }
  const f = pluginFixture(t);
  const snap = publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state });
  assert.ok(snap.root);
});
