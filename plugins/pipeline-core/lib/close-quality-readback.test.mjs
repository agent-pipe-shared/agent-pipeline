// SPDX-License-Identifier: SUL-1.0
// AC-239: the close reads back which quality artefacts exist for the change. Readers are injected; no repository fixture is needed.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { QUALITY_ROW_IDS, HANDOVER_FRESHNESS_BOUND_MS, closeQualityReadback, buildAuditIndex } from "./close-quality-readback.mjs";

const FEATURE = "feature";
const SEC = "evidence/security-latest.v2.json";
const SEC_VERDICT = "evidence/security-latest.v2.verdict.json";
const CRITIC_DIR = `specs/${FEATURE}/evidence/critic`;

// A reader set describing a change where every artefact exists.
const full = (over = {}) => ({
  exists: (p) => new Set([SEC, SEC_VERDICT, `${CRITIC_DIR}/pk-1/report.md`, "docs/state.md"]).has(p),
  listDir: (p) => (p === CRITIC_DIR ? ["pk-1"] : p === "docs/adr" ? ["0001-x.md"] : []),
  architectureImpact: () => "architecture-decision-added",
  rigorHistory: () => [{ body: { featureId: FEATURE, fitnessProjection: { outcomes: [] } } }],
  handoverUpdatedMs: () => 1_000_000,
  headCommitMs: () => 1_000_000 + 1000,
  ...over,
});
const rows = (readers) => Object.fromEntries(closeQualityReadback({ root: "<root>", featureId: FEATURE, readers }).map((r) => [r.id, r]));

test("AC-239: exactly the five ids, in order, with the closed row shape", () => {
  const list = closeQualityReadback({ root: "<root>", featureId: FEATURE, readers: full() });
  assert.deepEqual(QUALITY_ROW_IDS, ["security-scan", "adr-decision", "architecture-fitness", "critic-report-file", "handover-freshness"]);
  assert.deepEqual(list.map((r) => r.id), [...QUALITY_ROW_IDS]);
  for (const row of list) {
    assert.deepEqual(Object.keys(row).sort(), ["evidence", "id", "remedy", "status"]);
    assert.ok(["present", "missing", "not-applicable", "unknown"].includes(row.status));
  }
  assert.ok(list.every((r) => r.status === "present"), JSON.stringify(list));
});

test("AC-239 security-scan: present with the envelope path, missing with the scan command, unknown when unreadable", () => {
  assert.equal(rows(full())["security-scan"].evidence, SEC);
  const missing = rows(full({ exists: () => false }))["security-scan"];
  assert.equal(missing.status, "missing");
  assert.match(missing.remedy, /security-scan\.mjs/u);
  const unknown = rows(full({ exists: () => { throw new Error("boom"); } }))["security-scan"];
  assert.equal(unknown.status, "unknown");
});

test("AC-239 adr-decision: present, not-applicable when no decision qualifies, missing when claimed but absent, unknown without a signal", () => {
  assert.equal(rows(full())["adr-decision"].status, "present");
  assert.equal(rows(full({ architectureImpact: () => "no-architecture-impact" }))["adr-decision"].status, "not-applicable");
  assert.equal(rows(full({ listDir: () => [] }))["adr-decision"].status, "missing");
  const unknown = rows(full({ architectureImpact: () => null }))["adr-decision"];
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.remedy, null);
});

test("AC-239 architecture-fitness: present from a recorded run for this feature, missing with the command, unknown without history", () => {
  assert.equal(rows(full())["architecture-fitness"].status, "present");
  const missing = rows(full({ rigorHistory: () => [{ body: { featureId: "other", fitnessProjection: {} } }] }))["architecture-fitness"];
  assert.equal(missing.status, "missing");
  assert.match(missing.remedy, /architecture-fitness\.mjs/u);
  assert.equal(rows(full({ rigorHistory: () => null }))["architecture-fitness"].status, "unknown");
});

test("AC-239 critic-report-file: present with the report path, missing with the export command, unknown when the directory cannot be listed", () => {
  assert.equal(rows(full())["critic-report-file"].evidence, `${CRITIC_DIR}/pk-1/report.md`);
  const missing = rows(full({ listDir: (p) => (p === "docs/adr" ? ["a.md"] : []) }))["critic-report-file"];
  assert.equal(missing.status, "missing");
  assert.match(missing.remedy, /session-critic-finalizer\.mjs export --root <root> --request <request\.json>/u);
  assert.equal(rows(full({ listDir: (p) => { if (p === CRITIC_DIR) throw new Error("x"); return []; } }))["critic-report-file"].status, "unknown");
});

test("AC-239 handover-freshness: within the bound present, older than the bound missing, unreadable unknown", () => {
  assert.equal(rows(full())["handover-freshness"].evidence, "docs/state.md");
  const stale = rows(full({ headCommitMs: () => 1_000_000 + HANDOVER_FRESHNESS_BOUND_MS + 1 }))["handover-freshness"];
  assert.equal(stale.status, "missing");
  assert.equal(rows(full({ handoverUpdatedMs: () => null }))["handover-freshness"].status, "unknown");
  assert.ok(HANDOVER_FRESHNESS_BOUND_MS > 0);
});

test("AC-239: a row is never present when its signal cannot be read, and the readback writes nothing", () => {
  const all = rows({});
  for (const id of QUALITY_ROW_IDS) assert.equal(all[id].status, "unknown", id);
});

test("AC-239 audit index: paths with sha256 only where the file exists", () => {
  const bytes = { "specs/feature/prd.md": "p", [SEC]: "s" };
  const index = buildAuditIndex({
    featureId: FEATURE, prdPath: "specs/feature/prd.md", specPath: "specs/feature/spec.md", rows: [],
    readers: { exists: (p) => p in bytes, readBytes: (p) => Buffer.from(bytes[p]), listDir: () => [] },
  });
  const by = Object.fromEntries(index.entries.map((e) => [e.id, e]));
  assert.equal(by.prd.sha256, createHash("sha256").update("p").digest("hex"));
  assert.equal(by.spec.sha256, null);
  assert.equal(by["security-scan-evidence"].path, SEC);
  for (const id of ["prd", "spec", "plan", "verify-evidence", "critic-reports", "security-scan-evidence", "fitness-evidence", "push-threat-model"]) assert.ok(by[id], id);
  assert.deepEqual(index.qualityRows, []);
});
