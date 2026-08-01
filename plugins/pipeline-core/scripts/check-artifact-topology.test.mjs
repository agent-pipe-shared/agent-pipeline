#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkArtifactTopology, TOPOLOGY_CLASSES, TOPOLOGY_STATES } from "./check-artifact-topology.mjs";
import { FEATURE_CLASSES } from "../lib/feature-package-topology.mjs";

const root = mkdtempSync(join(tmpdir(), "artifact-topology-"));
try {
  mkdirSync(join(root, "governance"), { recursive: true });
  const base = { schema: "pipeline.artifact-topology.v1", mode: "compatibility", packageRoot: "specs/<feature-id>", states: TOPOLOGY_STATES, classes: TOPOLOGY_CLASSES };
  assert.equal(TOPOLOGY_CLASSES.includes("threat-model"), true);
  assert.equal(FEATURE_CLASSES.includes("threat-model"), true);
  assert.equal(FEATURE_CLASSES.every((artifactClass) => TOPOLOGY_CLASSES.includes(artifactClass)), true);
  writeFileSync(join(root, "governance/artifact-topology.json"), JSON.stringify(base));
  assert.equal(checkArtifactTopology(root).ok, true);
  writeFileSync(join(root, "governance/artifact-topology.json"), JSON.stringify({ ...base, states: [...TOPOLOGY_STATES].reverse() }));
  assert.match(checkArtifactTopology(root).findings.join("\n"), /closed topology state order/u);
  assert.equal(checkArtifactTopology(root, "../outside.json").ok, false);
  console.log("artifact-topology: 6 passed, 0 failed");
} finally { rmSync(root, { recursive: true, force: true }); }
