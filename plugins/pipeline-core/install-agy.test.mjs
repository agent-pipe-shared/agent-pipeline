import test from "node:test";
import assert from "node:assert/strict";
import { postInstallGuidanceLines } from "./install-agy.mjs";

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
