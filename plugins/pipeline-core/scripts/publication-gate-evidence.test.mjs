#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GateEvidenceError,
  PUBLICATION_GATE_EVIDENCE_SCHEMA,
  deriveGateEvidence,
  writeGateEvidence,
} from "./publication-gate-evidence.mjs";

const OID = "a".repeat(40);
const TREE = "b".repeat(40);
const roots = [];
function root(files = {}) {
  const base = mkdtempSync(join(tmpdir(), "publication-gate-evidence-"));
  roots.push(base);
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(join(base, path, ".."), { recursive: true });
    writeFileSync(join(base, path), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
  return base;
}
const verifyPass = (over = {}) => ({
  schema: "pipeline.verify-evidence.v0",
  candidate: { start: { commit: OID, tree: TREE }, finish: { commit: OID, tree: TREE } },
  steps: [{ name: "a", exitCode: 0 }, { name: "b", exitCode: 0 }],
  exitCode: 0,
  ...over,
});
const securityPass = (over = {}) => ({ schema: "pipeline.security-evidence.v0", candidate: { commit: OID, tree: TREE }, findings: [], exitCode: 0, ...over });
const identityPass = (over = {}) => ({
  schema: "pipeline.toolchain-preflight.v1",
  candidate: { commit: OID, tree: TREE },
  results: [{ tool: "node", status: "ready" }, { tool: "git", status: "ready" }],
  exitCode: 0,
  ...over,
});

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}
function refuses(name, code, run) {
  check(name, () => {
    assert.throws(run, (error) => {
      assert.ok(error instanceof GateEvidenceError, `threw ${error?.name}: ${error?.message}`);
      assert.equal(error.code, code, `code ${error.code}: ${error.message}`);
      return true;
    });
  });
}

try {
  check("PGE01 a passing verify artifact yields candidate-bound gate evidence", () => {
    const base = root({ "evidence/verify-latest.json": verifyPass() });
    const { evidence } = deriveGateEvidence({ rootDir: base, gate: "verify", sourcePath: "evidence/verify-latest.json" });
    assert.deepEqual(evidence, {
      schema: PUBLICATION_GATE_EVIDENCE_SCHEMA, gate: "verify",
      candidate: { commit: OID, tree: TREE }, status: "passed", exitCode: 0,
    });
    // The executor compares the key set exactly; an extra field would fail there.
    assert.deepEqual(Object.keys(evidence).sort(), ["candidate", "exitCode", "gate", "schema", "status"]);
  });

  check("PGE02 security and identity derive the same shape", () => {
    const base = root({ "s.json": securityPass(), "i.json": identityPass() });
    for (const [gate, path] of [["security", "s.json"], ["identity", "i.json"]]) {
      const { evidence } = deriveGateEvidence({ rootDir: base, gate, sourcePath: path });
      assert.equal(evidence.gate, gate);
      assert.equal(evidence.status, "passed");
      assert.deepEqual(evidence.candidate, { commit: OID, tree: TREE });
    }
  });

  // The property the whole tool exists for.
  refuses("PGE03 a failed verify run cannot be turned into a pass", "PGE-OUTCOME",
    () => deriveGateEvidence({ rootDir: root({ "v.json": verifyPass({ exitCode: 1 }) }), gate: "verify", sourcePath: "v.json" }));
  refuses("PGE04 a green exit with one red step is still a failure", "PGE-OUTCOME",
    () => deriveGateEvidence({ rootDir: root({ "v.json": verifyPass({ steps: [{ name: "a", exitCode: 0 }, { name: "b", exitCode: 1 }] }) }), gate: "verify", sourcePath: "v.json" }));
  refuses("PGE05 security findings block the derivation", "PGE-OUTCOME",
    () => deriveGateEvidence({ rootDir: root({ "s.json": securityPass({ findings: [{ rule: "x" }] }) }), gate: "security", sourcePath: "s.json" }));
  refuses("PGE06 an unready tool blocks the identity derivation", "PGE-OUTCOME",
    () => deriveGateEvidence({ rootDir: root({ "i.json": identityPass({ results: [{ tool: "git", status: "binary_missing" }] }) }), gate: "identity", sourcePath: "i.json" }));

  refuses("PGE07 an artifact naming no candidate is refused, never assumed current", "PGE-CANDIDATE",
    () => deriveGateEvidence({ rootDir: root({ "v.json": verifyPass({ candidate: undefined }) }), gate: "verify", sourcePath: "v.json" }));
  refuses("PGE08 a verify artifact of the wrong schema is refused", "PGE-SOURCE",
    () => deriveGateEvidence({ rootDir: root({ "v.json": verifyPass({ schema: "something.else" }) }), gate: "verify", sourcePath: "v.json" }));
  refuses("PGE09 an empty step list is not a pass", "PGE-OUTCOME",
    () => deriveGateEvidence({ rootDir: root({ "v.json": verifyPass({ steps: [] }) }), gate: "verify", sourcePath: "v.json" }));
  refuses("PGE10 a gate outside the derivable set is refused", "PGE-GATE",
    () => deriveGateEvidence({ rootDir: root({ "v.json": verifyPass() }), gate: "release-preflight", sourcePath: "v.json" }));
  refuses("PGE11 an absolute source path is refused", "PGE-PATH",
    () => deriveGateEvidence({ rootDir: root(), gate: "verify", sourcePath: "/etc/passwd" }));
  refuses("PGE12 a source escaping the repository is refused", "PGE-PATH",
    () => deriveGateEvidence({ rootDir: root(), gate: "verify", sourcePath: "../outside.json" }));

  check("PGE13 a symlinked source is refused rather than followed", () => {
    const base = root({ "real.json": verifyPass() });
    symlinkSync(join(base, "real.json"), join(base, "link.json"));
    assert.throws(() => deriveGateEvidence({ rootDir: base, gate: "verify", sourcePath: "link.json" }),
      (error) => error.code === "PGE-SOURCE");
  });

  check("PGE14 writing records the source digest and leaves nothing behind on refusal", () => {
    const base = root({ "v.json": verifyPass(), "red.json": verifyPass({ exitCode: 1 }) });
    const written = writeGateEvidence({ rootDir: base, gate: "verify", sourcePath: "v.json", outPath: "evidence/gate.json" });
    assert.match(written.source.sha256, /^[0-9a-f]{64}$/u);
    assert.deepEqual(JSON.parse(readFileSync(join(base, "evidence/gate.json"), "utf8")), written.evidence);
    assert.throws(() => writeGateEvidence({ rootDir: base, gate: "verify", sourcePath: "red.json", outPath: "evidence/red.json" }));
    assert.equal(existsSync(join(base, "evidence/red.json")), false, "a refused derivation must write nothing");
  });

  console.log(`\npublication-gate-evidence: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
