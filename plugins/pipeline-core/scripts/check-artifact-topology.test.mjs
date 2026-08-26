#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_ROOT, checkArtifactTopology, TOPOLOGY_CLASSES, TOPOLOGY_STATES } from "./check-artifact-topology.mjs";
import { FEATURE_CLASSES } from "../lib/feature-package-topology.mjs";

const root = mkdtempSync(join(tmpdir(), "artifact-topology-"));
try {
  mkdirSync(join(root, "governance"), { recursive: true });
  const base = { schema: "pipeline.artifact-topology.v1", mode: "compatibility", packageRoot: "specs/<feature-id>", states: TOPOLOGY_STATES, classes: TOPOLOGY_CLASSES };
  assert.equal(TOPOLOGY_CLASSES.includes("threat-model"), true);
  assert.equal(FEATURE_CLASSES.includes("threat-model"), true);
  assert.equal(FEATURE_CLASSES.every((artifactClass) => TOPOLOGY_CLASSES.includes(artifactClass)), true);
  // A class the repository produces stays in the closed taxonomy by name, not by whichever
  // list a merge happened to keep: governance events are written to
  // governance/events/<stream>/<sequence>-<event-id>.json and are repository-level, never
  // feature-package artifacts.
  assert.equal(TOPOLOGY_CLASSES.includes("governance-event"), true);
  assert.equal(FEATURE_CLASSES.includes("governance-event"), false);
  // The validator's constants must pin the SHIPPED declaration, not a fixture derived from
  // themselves - otherwise editing governance/artifact-topology.json alone is invisible here.
  const shipped = JSON.parse(readFileSync(join(DEFAULT_ROOT, "governance/artifact-topology.json"), "utf8"));
  assert.deepEqual(shipped.classes, [...TOPOLOGY_CLASSES]);
  assert.deepEqual(shipped.states, [...TOPOLOGY_STATES]);
  writeFileSync(join(root, "governance/artifact-topology.json"), JSON.stringify(base));
  assert.equal(checkArtifactTopology(root).ok, true);
  writeFileSync(join(root, "governance/artifact-topology.json"), JSON.stringify({ ...base, states: [...TOPOLOGY_STATES].reverse() }));
  assert.match(checkArtifactTopology(root).findings.join("\n"), /closed topology state order/u);
  assert.equal(checkArtifactTopology(root, "../outside.json").ok, false);
  console.log("artifact-topology: 10 passed, 0 failed");
} finally { rmSync(root, { recursive: true, force: true }); }
