// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installerUsageLines, postInstallGuidanceLines, selectPluginSource, updatePluginRegistry } from "./install-agy.mjs";
import { resolveAntigravityRegistryInstalledRoot } from "./scripts/installed-plugin-attestation-host.mjs";

test("Agy release-tag checkout creates a named branch without changing the signed tag commit", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agy-release-tag-checkout-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source");
  const installed = join(root, "installed");
  mkdirSync(source);
  execFileSync("git", ["-C", source, "init", "--initial-branch", "main"]);
  writeFileSync(join(source, "plugin.json"), JSON.stringify({ name: "agent-pipeline-core", version: "0.7.0" }));
  execFileSync("git", ["-C", source, "add", "plugin.json"]);
  execFileSync("git", ["-C", source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"]);
  execFileSync("git", ["-C", source, "tag", "v0.7.0"]);
  execFileSync("git", ["clone", "--branch", "v0.7.0", "--depth", "1", source, installed]);
  const git = (args) => execFileSync("git", ["-C", installed, ...args], { encoding: "utf8" }).trim();
  const tagCommit = git(["rev-parse", "HEAD"]);
  assert.throws(() => git(["symbolic-ref", "--short", "HEAD"]),
    "a tag checkout alone strands the source observer at detached HEAD");
  git(["switch", "-c", "pipeline-release-v0.7.0"]);
  assert.equal(git(["symbolic-ref", "--short", "HEAD"]), "pipeline-release-v0.7.0");
  assert.equal(git(["rev-parse", "HEAD"]), tagCommit);
  assert.equal(git(["describe", "--tags", "--exact-match"]), "v0.7.0");
  const setup = readFileSync(new URL("../../SETUP.md", import.meta.url), "utf8");
  const onboarding = readFileSync(new URL("../../docs/v3-consumer-onboarding.md", import.meta.url), "utf8");
  assert.match(setup, /git -C "\$pipeline_release_dir" switch -c pipeline-release-v0\.7\.0/u);
  assert.match(onboarding, /\.\.\/SETUP\.md#antigravity-agy-workspace-local-binding/u,
    "consumer onboarding links to the single maintained GitHub installation procedure");
});

test("Agy installer guidance verifies the host PATH without normalizing sudo or yolo", () => {
  const guidance = postInstallGuidanceLines().join("\n");
  assert.match(guidance, /command -v node/u);
  assert.match(guidance, /fully restart Antigravity/u);
  assert.match(guidance, /pipeline-start/u);
  assert.match(guidance, /grants no plan, release, remote, or human authority/u);
  assert.doesNotMatch(guidance, /sudo\s+ln/u);
  assert.doesNotMatch(guidance, /--yolo/u);
  assert.doesNotMatch(guidance, /SILENTLY FAIL OPEN/u);
});

test("Agy installer defaults to the approved script directory and makes local development explicit", () => {
  assert.deepEqual(selectPluginSource({ answer: "", scriptDir: "/approved/plugin", marketplaceRoot: "/local/marketplace", marketplaceAvailable: true }), {
    kind: "approved-directory",
    pluginRoot: "/approved/plugin",
  });
  assert.deepEqual(selectPluginSource({ answer: "2", scriptDir: "/approved/plugin", marketplaceRoot: "/local/marketplace", marketplaceAvailable: true }), {
    kind: "local-marketplace",
    pluginRoot: "/local/marketplace/plugins/pipeline-core",
  });
  assert.match(installerUsageLines().join("\n"), /approved Agent-Pipeline plugin directory/u);
  assert.match(installerUsageLines().join("\n"), /explicit pre-release development choice/u);
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "agy-installer-upgrade-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const oldRoot = join(root, "old", "plugins", "pipeline-core");
  const newRoot = join(root, "new", "plugins", "pipeline-core");
  const otherRoot = join(root, "other-plugin");
  for (const path of [oldRoot, newRoot, otherRoot]) mkdirSync(path, { recursive: true });
  for (const path of [oldRoot, newRoot]) writeFileSync(join(path, "plugin.json"), JSON.stringify({ name: "agent-pipeline-core", version: "0.7.0" }));
  const registryFile = join(root, ".agents", "plugins.json");
  mkdirSync(join(root, ".agents"));
  return { oldRoot, newRoot, otherRoot, registryFile, root };
}

test("Agy upgrade replaces the old physical root and survives its removal", (t) => {
  const { oldRoot, newRoot, otherRoot, registryFile } = fixture(t);
  const unrelated = { path: otherRoot, enabled: false };
  writeFileSync(registryFile, JSON.stringify({ entries: [{ path: oldRoot }, unrelated], custom: { keep: true } }, null, 2));

  updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot });
  const bytes = readFileSync(registryFile, "utf8");
  assert.deepEqual(JSON.parse(bytes), { entries: [unrelated, { path: newRoot }], custom: { keep: true } });
  rmSync(join(oldRoot, "plugin.json"));
  rmSync(oldRoot, { recursive: true });
  const readback = readFileSync(registryFile, "utf8");
  assert.equal(readback, bytes);
  assert.equal(resolveAntigravityRegistryInstalledRoot({ installedPluginRoot: newRoot, registryPayloads: [readback] }), newRoot);
  assert.equal(resolveAntigravityRegistryInstalledRoot({ installedPluginRoot: oldRoot, registryPayloads: [readback] }), null);
  updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot });
  assert.equal(readFileSync(registryFile, "utf8"), bytes);
});

test("Agy upgrade refuses an unverifiable deleted Pipeline-shaped registration", (t) => {
  const { newRoot, otherRoot, registryFile, root } = fixture(t);
  const ambiguous = join(root, "retired", "plugins", "pipeline-core");
  const bytes = `${JSON.stringify({ entries: [{ path: ambiguous }, { path: otherRoot, enabled: false }] }, null, 2)}\n`;
  writeFileSync(registryFile, bytes);
  assert.throws(
    () => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }),
    /Unverifiable existing Pipeline registration/u,
  );
  assert.equal(readFileSync(registryFile, "utf8"), bytes);
  mkdirSync(ambiguous, { recursive: true });
  writeFileSync(join(ambiguous, "plugin.json"), "not json\n");
  assert.throws(
    () => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }),
    /Unverifiable existing Pipeline registration/u,
  );
  assert.equal(readFileSync(registryFile, "utf8"), bytes);
  writeFileSync(join(ambiguous, "plugin.json"), JSON.stringify({ name: "different-plugin" }));
  updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot });
  assert.deepEqual(JSON.parse(readFileSync(registryFile, "utf8")).entries, [
    { path: ambiguous }, { path: otherRoot, enabled: false }, { path: newRoot },
  ]);
});

test("Agy installer refuses malformed existing registry without changing bytes", (t) => {
  const { newRoot, registryFile } = fixture(t);
  for (const bytes of ["{invalid", '{"entries":{}}', '{"entries":[null]}', Buffer.from([0x7b, 0x22, 0x80, 0x22, 0x3a, 0x31, 0x7d])]) {
    writeFileSync(registryFile, bytes);
    assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }));
    assert.deepEqual(readFileSync(registryFile), Buffer.from(bytes));
  }
});

test("Agy installer rejects unsafe new roots and resolver retains exact non-symlink binding", (t) => {
  const { newRoot, registryFile, root } = fixture(t);
  const alias = join(root, "alias");
  symlinkSync(newRoot, alias);
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: alias }));
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: `${root}/new/../new/plugins/pipeline-core` }));
  assert.equal(resolveAntigravityRegistryInstalledRoot({ installedPluginRoot: newRoot, registryPayloads: [JSON.stringify({ entries: [{ path: alias }] })] }), null);
  assert.equal(resolveAntigravityRegistryInstalledRoot({ installedPluginRoot: newRoot, registryPayloads: [JSON.stringify({ entries: [{ path: newRoot }] })] }), newRoot);
});

test("Agy installer rejects directories without a valid physical Pipeline manifest before registry publication", (t) => {
  const { oldRoot, newRoot, registryFile } = fixture(t);
  const original = '{"entries":[]}\n';
  writeFileSync(registryFile, original);
  rmSync(join(newRoot, "plugin.json"));
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unverifiable Pipeline source manifest/u);
  writeFileSync(join(newRoot, "plugin.json"), JSON.stringify({ name: "other-plugin", version: "0.7.0" }));
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unverifiable Pipeline source manifest/u);
  writeFileSync(join(newRoot, "plugin.json"), "not json\n");
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unverifiable Pipeline source manifest/u);
  rmSync(join(newRoot, "plugin.json"));
  symlinkSync(join(oldRoot, "plugin.json"), join(newRoot, "plugin.json"));
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unverifiable Pipeline source manifest/u);
  rmSync(join(newRoot, "plugin.json"));
  writeFileSync(join(newRoot, "plugin.json"), JSON.stringify({ name: "agent-pipeline-core", version: "" }));
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unverifiable Pipeline source manifest/u);
  assert.equal(readFileSync(registryFile, "utf8"), original);
});

test("Agy installer never follows registry-file or parent aliases while updating", (t) => {
  const { newRoot, registryFile, root } = fixture(t);
  const unrelatedFile = join(root, "unrelated.json");
  const original = '{"entries":[],"marker":"keep"}\n';
  writeFileSync(unrelatedFile, original);
  symlinkSync(unrelatedFile, registryFile);
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unsafe plugin registry target/u);
  assert.equal(readFileSync(unrelatedFile, "utf8"), original);
  assert.deepEqual(readdirSync(join(root, ".agents")), ["plugins.json"]);

  rmSync(registryFile);
  const aliasParent = join(root, "alias-agents");
  symlinkSync(join(root, ".agents"), aliasParent);
  assert.throws(() => updatePluginRegistry({ targetFile: join(aliasParent, "plugins.json"), corePluginPath: newRoot }), /Unsafe plugin registry parent/u);
  assert.deepEqual(readdirSync(join(root, ".agents")), []);
});
