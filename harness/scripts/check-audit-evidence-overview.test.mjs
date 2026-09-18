#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOC_PATH = join(REPO_ROOT, "docs", "audit-evidence-overview.md");

test("audit-evidence-overview: file exists and meets length requirements", () => {
  assert.equal(existsSync(DOC_PATH), true, "docs/audit-evidence-overview.md must exist");
  const content = readFileSync(DOC_PATH, "utf8");
  assert.ok(content.length > 500, "content must be comprehensive (>500 bytes)");
});

test("audit-evidence-overview: covers versioned project authority artifacts", () => {
  const content = readFileSync(DOC_PATH, "utf8");
  assert.match(content, /project\/pipeline\.json/, "must cover project/pipeline.json");
  assert.match(content, /project\/pipeline-state\.json/, "must cover project/pipeline-state.json");
  assert.match(content, /project\/critical-human-proof\.json/, "must cover critical-human-proof.json");
  assert.match(content, /project\/push-threat-model\.md/, "must cover push-threat-model.md");
  assert.match(content, /specs\//, "must cover specs/ directory");
});

test("audit-evidence-overview: covers verification and security evidence classes", () => {
  const content = readFileSync(DOC_PATH, "utf8");
  assert.match(content, /evidence\/verify-latest\.json/, "must cover verify evidence");
  assert.match(content, /evidence\/security-latest\.json/, "must cover security evidence");
  assert.match(content, /release-promotion/, "must cover release promotion envelopes");
  assert.match(content, /dispatch-record/, "must cover dispatch records");
});

test("audit-evidence-overview: covers human gates and attended signing", () => {
  const content = readFileSync(DOC_PATH, "utf8");
  assert.match(content, /planApproval/, "must mention planApproval");
  assert.match(content, /guard-push\.mjs/, "must mention guard-push.mjs");
  assert.match(content, /Ed25519/, "must mention Ed25519 signatures");
});

test("audit-evidence-overview: covers private local store and absence behavior", () => {
  const content = readFileSync(DOC_PATH, "utf8");
  assert.match(content, /\.git\/agent-pipeline\//, "must document .git/agent-pipeline/");
  assert.match(content, /human-guard-override-audit\.ndjson/, "must document HGO audit ledger");
  assert.match(content, /external-push-ledger\.ndjson/, "must document push proof ledger");
  assert.match(content, /dispatch-budget/, "must document dispatch budget counters");
  assert.match(content, /clean clone|remote review/i, "must document clean clone/remote absence behavior");
});

test("audit-evidence-overview: covers waivers, exceptions and fail-closed posture", () => {
  const content = readFileSync(DOC_PATH, "utf8");
  assert.match(content, /ADR-0055/i, "must document ADR-0055 waivers");
  assert.match(content, /fail-closed/i, "must document fail-closed posture");
});

test("audit-evidence-overview: privacy assertion -- zero secrets, home paths, or private keys", () => {
  const content = readFileSync(DOC_PATH, "utf8");
  assert.doesNotMatch(content, /BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY/, "must not leak private keys");
  assert.doesNotMatch(content, /\/home\/[a-zA-Z0-9_-]+\//, "must not leak user home directory paths");
  assert.doesNotMatch(content, /[A-Za-z]:\\Users\\[a-zA-Z0-9_-]+/, "must not leak Windows user home paths");
});
