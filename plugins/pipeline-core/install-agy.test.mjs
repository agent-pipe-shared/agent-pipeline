import test from "node:test";
import assert from "node:assert/strict";
import { installerUsageLines, postInstallGuidanceLines, selectPluginSource } from "./install-agy.mjs";

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
