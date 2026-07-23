#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(scriptDir, "codex-isolated-critic-claims.schema.json"), "utf8"));
const CLAIM_NAMES = ["briefingBounded", "inputConfined", "technicallyIsolatedReadOnly", "verdictIntegrity"];
const REQUIRED_KIND = {
  briefingBounded: "briefing",
  inputConfined: "input-manifest",
  technicallyIsolatedReadOnly: "sandbox-preflight",
  verdictIntegrity: "verdict",
};
const STATES = new Set(["proven", "disproven", "not-proven"]);
const EVIDENCE_KINDS = new Set(schema.$defs.evidence.properties.kind.enum);
const SHA256 = /^[0-9a-f]{64}$/;
const LOCATOR = /^[A-Za-z0-9][A-Za-z0-9._/:#-]{0,511}$/;

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function validClaims(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const expected = ["schema", ...CLAIM_NAMES].sort();
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected)) return false;
  if (value.schema !== "pipeline.codex-isolated-critic-claims.v1") return false;
  for (const name of CLAIM_NAMES) {
    const claim = value[name];
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return false;
    if (JSON.stringify(Object.keys(claim).sort()) !== JSON.stringify(["evidence", "state"])) return false;
    if (!STATES.has(claim.state) || !Array.isArray(claim.evidence)) return false;
    if (claim.state === "not-proven" && claim.evidence.length !== 0) return false;
    if (claim.state !== "not-proven" && claim.evidence.length === 0) return false;
    const seen = new Set();
    for (const evidence of claim.evidence) {
      if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return false;
      if (JSON.stringify(Object.keys(evidence).sort()) !== JSON.stringify(["kind", "locator", "rawSha256"])) return false;
      if (!EVIDENCE_KINDS.has(evidence.kind) || !LOCATOR.test(evidence.locator) || !SHA256.test(evidence.rawSha256)) return false;
      const tuple = `${evidence.kind}\0${evidence.locator}\0${evidence.rawSha256}`;
      if (seen.has(tuple)) return false;
      seen.add(tuple);
    }
    if (claim.state === "proven" && !claim.evidence.some((entry) => entry.kind === REQUIRED_KIND[name])) return false;
  }
  return true;
}

function unknownClaims() {
  return Object.fromEntries(CLAIM_NAMES.map((name) => [name, { state: "not-proven", evidence: [] }]));
}

function document(overrides = {}) {
  return {
    schema: "pipeline.codex-isolated-critic-claims.v1",
    ...unknownClaims(),
    ...overrides,
  };
}

const digest = "a".repeat(64);
const evidence = (kind, locator) => ({ kind, locator, rawSha256: digest });

check("F1 schema closes the four independent claim names", () => {
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["schema", ...CLAIM_NAMES]);
  assert.deepEqual(Object.keys(schema.properties), ["schema", ...CLAIM_NAMES]);
  assert.deepEqual(schema.$defs.claim.properties.state.enum, ["proven", "disproven", "not-proven"]);
});

check("F1 unknown claims are valid and carry no synthetic evidence", () => {
  assert.equal(validClaims(document()), true);
});

check("F1 each proven property carries its own typed evidence", () => {
  const value = document({
    briefingBounded: { state: "proven", evidence: [evidence("briefing", "inputs/briefing.json")] },
    inputConfined: { state: "proven", evidence: [evidence("input-manifest", "receipts/inputs.json")] },
    technicallyIsolatedReadOnly: { state: "proven", evidence: [evidence("sandbox-preflight", "receipts/preflight.json")] },
    verdictIntegrity: { state: "proven", evidence: [evidence("verdict", "receipts/verdict.json")] },
  });
  assert.equal(validClaims(value), true);
});

check("F1 empty proven and evidenced not-proven states fail closed", () => {
  assert.equal(validClaims(document({ briefingBounded: { state: "proven", evidence: [] } })), false);
  assert.equal(
    validClaims(document({ briefingBounded: { state: "not-proven", evidence: [evidence("briefing", "inputs/briefing.json")] } })),
    false,
  );
});

check("F1 contradictory, unknown and additional claim shapes fail closed", () => {
  assert.equal(validClaims(document({ briefingBounded: { state: ["proven", "disproven"], evidence: [] } })), false);
  assert.equal(validClaims(document({ briefingBounded: { state: "unknown", evidence: [] } })), false);
  assert.equal(validClaims({ ...document(), promptConfined: { state: "proven", evidence: [] } }), false);
});

check("F1 prompt-only evidence cannot prove technical isolation", () => {
  assert.equal(
    validClaims(document({
      technicallyIsolatedReadOnly: { state: "proven", evidence: [evidence("briefing", "inputs/briefing.json")] },
    })),
    false,
  );
});

check("F1 post-state canary evidence alone cannot prove enforced read-only isolation", () => {
  assert.equal(
    validClaims(document({
      technicallyIsolatedReadOnly: { state: "proven", evidence: [evidence("canary", "receipts/canary.json")] },
    })),
    false,
  );
});

check("F1 evidence tuples are closed, normalized and duplicate-free", () => {
  const duplicate = evidence("briefing", "inputs/briefing.json");
  assert.equal(
    validClaims(document({ briefingBounded: { state: "proven", evidence: [duplicate, duplicate] } })),
    false,
  );
  assert.equal(
    validClaims(document({ briefingBounded: { state: "proven", evidence: [{ ...duplicate, locator: "/private/root" }] } })),
    false,
  );
  assert.equal(
    validClaims(document({ briefingBounded: { state: "proven", evidence: [{ ...duplicate, extra: true }] } })),
    false,
  );
});

check("F1 network-open diagnostics and write-restore observations are not promoted by the threat model", () => {
  const threatModel = readFileSync(join(scriptDir, "..", "..", "..", "docs", "critic-isolation-threat-model.md"), "utf8");
  assert.match(threatModel, /network\.enabled=true[^\n]+Zwischenklasse/);
  assert.match(threatModel, /Nachzustand allein ist kein Präventionsbeleg/);
  assert.match(threatModel, /no-usable-review/);
});

process.stdout.write(`1..${passed}\n`);
