#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { checkAuthorityTierAgreement } from "./check-authority-tier-agreement.mjs";

const roots = [];
function root() {
  const value = mkdtempSync(join(tmpdir(), "authority-tier-agreement-"));
  roots.push(value);
  return value;
}
function write(base, relPath, text) {
  mkdirSync(join(base, dirname(relPath)), { recursive: true });
  writeFileSync(join(base, relPath), text);
}
function ownedKeys(base) {
  write(base, "plugins/pipeline-core/config/runtime-projection-v3-owned-keys.json", `${JSON.stringify({
    schema: "pipeline.runtime-projection-owned-keys.v3",
    targets: [
      { path: ".claude/pipeline.json", format: "json", projection: "human-role-display-v3", ownedKeys: ["humanRoles.po.displayLabel"] },
      { path: ".claude/pipeline.yaml", format: "yaml", projection: "claude-model-routing-v3", ownedKeys: ["session.keep_awake", "modelRouting"] },
    ],
  }, null, 2)}\n`);
}
const MANIFEST = (keepAwake, approval) => `schema: pipeline.manifest.v0
session:
  keep_awake: ${keepAwake}
gates:
  push:
    mode: blocking
    type: human
    approval: ${approval}
`;

let passed = 0;
let failed = 0;
function check(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    failed += 1;
  }
}

try {
  check("ATA01 a single-tier project is trivially in agreement", () => {
    const base = root();
    ownedKeys(base);
    write(base, "project/pipeline.yaml", MANIFEST("true", "required"));
    const result = checkAuthorityTierAgreement(base);
    assert.equal(result.ok, true);
    assert.equal(result.comparedArtifacts, 0);
  });

  check("ATA02 identical tiers agree", () => {
    const base = root();
    ownedKeys(base);
    write(base, "project/pipeline.yaml", MANIFEST("true", "required"));
    write(base, ".claude/pipeline.yaml", MANIFEST("true", "required"));
    const result = checkAuthorityTierAgreement(base);
    assert.equal(result.ok, true, result.findings.join("; "));
    assert.equal(result.comparedArtifacts, 1);
  });

  check("ATA03 a stale compiler-owned key is a finding", () => {
    const base = root();
    ownedKeys(base);
    write(base, "project/pipeline.yaml", MANIFEST("false", "required"));
    write(base, ".claude/pipeline.yaml", MANIFEST("true", "required"));
    const result = checkAuthorityTierAgreement(base);
    assert.equal(result.ok, false);
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0], /^session\.keep_awake: compiler-owned key tiers disagree/u);
  });

  check("ATA04 the real push-gate regression is caught", () => {
    // The exact 2026-08-02..2026-08-06 state: a deliberate hardening landed in the
    // legacy copy only, and the resolver served the neutral copy's stale value.
    const base = root();
    ownedKeys(base);
    write(base, "project/pipeline.yaml", MANIFEST("true", "standing-approved"));
    write(base, ".claude/pipeline.yaml", MANIFEST("true", "required"));
    const result = checkAuthorityTierAgreement(base);
    assert.equal(result.ok, false);
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0], /^gates: tiers disagree/u);
    assert.match(result.findings[0], /standing-approved/u);
    assert.match(result.findings[0], /required/u);
  });

  check("ATA05 a key held at one tier only is reported, not failed", () => {
    const base = root();
    ownedKeys(base);
    write(base, "project/pipeline.json", `${JSON.stringify({ project: "x", pipelineUpdateChannel: "alpha" })}\n`);
    write(base, ".claude/pipeline.json", `${JSON.stringify({ project: "x" })}\n`);
    const result = checkAuthorityTierAgreement(base);
    assert.equal(result.ok, true, result.findings.join("; "));
    assert.deepEqual(result.notes, ["pipelineUpdateChannel: present only at project/pipeline.json"]);
  });

  check("ATA06 a compiler-owned key held at one tier only IS a finding", () => {
    const base = root();
    ownedKeys(base);
    write(base, "project/pipeline.json", `${JSON.stringify({ project: "x", humanRoles: { po: { displayLabel: "Human" } } })}\n`);
    write(base, ".claude/pipeline.json", `${JSON.stringify({ project: "x" })}\n`);
    const result = checkAuthorityTierAgreement(base);
    assert.equal(result.ok, false);
    assert.match(result.findings[0], /^humanRoles\.po\.displayLabel: compiler-owned, but present only at project\/pipeline\.json$/u);
  });

  check("ATA07 the guard config is compared, the append-only audit ledger is not", () => {
    const base = root();
    ownedKeys(base);
    write(base, "project/guard-config.json", `${JSON.stringify({ protectedTestPaths: [] })}\n`);
    write(base, ".claude/guard-config.json", `${JSON.stringify({ protectedTestPaths: [{ id: "TP-1" }] })}\n`);
    write(base, "project/guard-override.log.jsonl", '{"event":"a"}\n');
    write(base, ".claude/guard-override.log.jsonl", '{"event":"b"}\n');
    const result = checkAuthorityTierAgreement(base);
    assert.equal(result.ok, false);
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0], /^protectedTestPaths: tiers disagree/u);
  });

  check("ATA08 an unparseable tier fails closed rather than being skipped", () => {
    const base = root();
    ownedKeys(base);
    write(base, "project/pipeline.json", "{ not json\n");
    write(base, ".claude/pipeline.json", `${JSON.stringify({ project: "x" })}\n`);
    const result = checkAuthorityTierAgreement(base);
    assert.equal(result.ok, false);
    assert.match(result.findings[0], /^calibration: a tier could not be parsed/u);
  });

  check("ATA09 a project with no V3 projection manifest still compares shared keys", () => {
    const base = root();
    write(base, "project/pipeline.json", `${JSON.stringify({ project: "x", handover: "docs/state.md" })}\n`);
    write(base, ".claude/pipeline.json", `${JSON.stringify({ project: "x", handover: "STATE.md" })}\n`);
    const result = checkAuthorityTierAgreement(base);
    assert.equal(result.ok, false);
    assert.match(result.findings[0], /^handover: tiers disagree/u);
    assert.doesNotMatch(result.findings[0], /compiler-owned/u);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
