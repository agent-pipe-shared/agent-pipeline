// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installerUsageLines, postInstallGuidanceLines, selectPluginSource, updateAutonomousSettings, updatePluginRegistry } from "./install-agy.mjs";
import { resolveAntigravityRegistryInstalledRoot } from "./scripts/installed-plugin-attestation-host.mjs";

test("Agy release-tag checkout creates a named branch without changing the tag commit", (t) => {
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
  const agyEntry = readFileSync(new URL("../../GEMINI.md", import.meta.url), "utf8");
  const onboarding = readFileSync(new URL("../../docs/v3-consumer-onboarding.md", import.meta.url), "utf8");
  assert.match(setup, /https:\/\/github\.com\/agent-pipe-shared\/agent-pipeline(?:\.git)?/u);
  assert.match(setup, /Before `v0\.7\.0` is published, use the installation instructions at the\s+already-approved release tag/u);
  assert.doesNotMatch(setup, /\[version-independent Agy installation path\]\(GEMINI\.md/u,
    "the pre-release instruction must not loop back to GEMINI.md");
  assert.match(agyEntry, /SETUP\.md#antigravity-agy-workspace-local-binding/u);
  assert.match(setup, /git -C "\$pipeline_release_dir" switch -c pipeline-release-v0\.7\.0/u);
  assert.match(setup, /\$pipelineReleaseDir = Join-Path \$env:LOCALAPPDATA/u);
  assert.match(setup, /git -C \$pipelineReleaseDir switch -c pipeline-release-v0\.7\.0/u);
  assert.match(setup, /node \(Join-Path \$pipelineReleaseDir 'plugins\/pipeline-core\/install-agy\.mjs'\)/u);
  assert.match(onboarding, /\.\.\/SETUP\.md#antigravity-agy-workspace-local-binding/u,
    "consumer onboarding links to the single maintained GitHub installation procedure");
});

test("Agy installer guidance verifies the host PATH without normalizing sudo or yolo", () => {
  const guidance = postInstallGuidanceLines("linux").join("\n");
  assert.match(guidance, /command -v node/u);
  const windowsGuidance = postInstallGuidanceLines("win32").join("\n");
  assert.match(windowsGuidance, /where\.exe node/u);
  assert.doesNotMatch(windowsGuidance, /command -v node/u);
  assert.match(guidance, /fully restart Antigravity/u);
  assert.match(guidance, /pipeline-start/u);
  assert.match(guidance, /grants no plan, release, remote, or human authority/u);
  assert.doesNotMatch(guidance, /sudo\s+ln/u);
  assert.doesNotMatch(guidance, /--yolo/u);
  assert.doesNotMatch(guidance, /SILENTLY FAIL OPEN/u);
});

test("Agy optional autonomous settings preserve unrelated keys and refuse malformed input", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agy-installer-settings-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const targetFile = join(root, "settings.json");
  const original = '{"custom":{"keep":true},"terminalSandbox":false}\n';
  writeFileSync(targetFile, original);
  updateAutonomousSettings({ targetFile });
  assert.deepEqual(JSON.parse(readFileSync(targetFile, "utf8")), {
    custom: { keep: true }, terminalSandbox: true,
    toolExecutionPolicy: "always-proceed", artifactReviewMode: "always-proceed",
  });
  for (const bytes of ["{broken", "[]", "null", Buffer.from([0x7b, 0x22, 0x80, 0x22, 0x3a, 0x31, 0x7d])]) {
    writeFileSync(targetFile, bytes);
    assert.throws(() => updateAutonomousSettings({ targetFile }), /Malformed Antigravity settings/u);
    assert.deepEqual(readFileSync(targetFile), Buffer.from(bytes));
  }
  assert.deepEqual(readdirSync(root), ["settings.json"], "failed updates leave no temporary files");
});

test("Agy optional autonomous settings never follow file or parent aliases", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agy-installer-settings-alias-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const actual = join(root, "actual");
  const alias = join(root, "alias");
  mkdirSync(actual);
  const outside = join(root, "outside.json");
  writeFileSync(outside, '{"keep":true}\n');
  symlinkSync(outside, join(actual, "settings.json"));
  assert.throws(() => updateAutonomousSettings({ targetFile: join(actual, "settings.json") }), /Unsafe Antigravity settings target/u);
  symlinkSync(actual, alias);
  assert.throws(() => updateAutonomousSettings({ targetFile: join(alias, "settings.json") }), /Unsafe Antigravity settings parent/u);
  assert.equal(readFileSync(outside, "utf8"), '{"keep":true}\n');
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
  assert.throws(() => selectPluginSource({ answer: "2", scriptDir: "/approved/plugin", marketplaceRoot: "/missing", marketplaceAvailable: false }),
    /Local development marketplace is unavailable; no plugin was registered/u);
  assert.throws(() => selectPluginSource({ answer: "99", scriptDir: "/approved/plugin", marketplaceRoot: "/local/marketplace", marketplaceAvailable: true }),
    /Invalid plugin source selection; no plugin was registered/u);
  assert.match(installerUsageLines().join("\n"), /approved Agent-Pipeline plugin directory/u);
  assert.match(installerUsageLines().join("\n"), /explicit pre-release development choice/u);
  assert.match(installerUsageLines().join("\n"), /does not prove GitHub origin or release authenticity/u);
});

test("Agy installer shows an invalid source choice as a refusal before touching the consumer registry", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agy-installer-source-choice-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./install-agy.mjs", import.meta.url))],
    { cwd: root, input: "99\n", encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Source approval is your decision: this installer does not prove GitHub origin or release authenticity/u);
  assert.match(result.stderr, /Installation refused: Invalid plugin source selection; no plugin was registered/u);
  assert.equal(existsSync(join(root, ".agents", "plugins.json")), false);
});

test("Agy interactive optional-mode failure leaves malformed consumer settings untouched", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agy-installer-optional-refusal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".agents"));
  const targetFile = join(root, ".agents", "settings.json");
  const original = "{broken\n";
  writeFileSync(targetFile, original);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./install-agy.mjs", import.meta.url))],
    { cwd: root, input: "1\n1\ny\n", encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Autonomous settings update refused: Malformed Antigravity settings/u);
  assert.equal(readFileSync(targetFile, "utf8"), original);
  assert.deepEqual(JSON.parse(readFileSync(join(root, ".agents", "plugins.json"), "utf8")).entries.length, 1,
    "the already completed plugin registration is reported separately from optional-mode failure");
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
