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

// QG-04 restatement (C20 G20-27, AC-108): the original five ids are unchanged and keep their order and shape; the readback gained a sixth,
// appended row, "journey-coverage", whose cases live in lib/pins/acceptance-criteria-are-examined-as-whole-user-journeys.test.mjs. `full()`
// carries no Spec reader, so that row is "unknown" here (never "present" without a signal), and the original "every row is present"
// assertion now covers the five original rows.
// CGF-08 / CGF-23 (AC-108): the fitness row stays in its closed shape and its status rules; the evidence text now labels the verdict
// (candidate, observation date, report-only, source currency not re-checked) and lists the open report-only classes beside "present".
test("CGF-23 the architecture-fitness evidence labels the observation and lists the open report-only classes beside a present row", () => {
  const COMMIT = "a".repeat(40), TREE = "b".repeat(40);
  const history = (outcomes) => () => [{ body: { featureId: FEATURE, observedAt: "2026-11-09T09:00:00.000Z", candidate: { commit: COMMIT, tree: TREE }, fitnessProjection: { outcomes } } }];
  const open = rows(full({ rigorHistory: history([{ classId: 2, propertyId: "p2", outcome: "pass" }, { classId: 3, propertyId: "p3", outcome: "finding" }]) }))["architecture-fitness"];
  assert.equal(open.status, "present");
  for (const part of ["report-only", "a".repeat(12), "2026-11-09T09:00:00.000Z", "open report-only: 3 (1)"]) assert.ok(open.evidence.includes(part), `${part} in ${open.evidence}`);
  assert.deepEqual(Object.keys(open).sort(), ["evidence", "id", "remedy", "status"]);
  const clean = rows(full({ rigorHistory: history([{ classId: 2, propertyId: "p2", outcome: "pass" }]) }))["architecture-fitness"];
  assert.ok(clean.evidence.includes("no open report-only class"), clean.evidence);
  assert.equal(rows(full())["architecture-fitness"].status, "present", "a bare projection stays present, typed unobserved");
});

test("AC-239: exactly the five ids, in order, with the closed row shape", () => {
  const list = closeQualityReadback({ root: "<root>", featureId: FEATURE, readers: full() });
  assert.deepEqual(QUALITY_ROW_IDS, ["security-scan", "adr-decision", "architecture-fitness", "critic-report-file", "handover-freshness", "journey-coverage"]);
  assert.deepEqual(list.map((r) => r.id), [...QUALITY_ROW_IDS]);
  for (const row of list) {
    assert.deepEqual(Object.keys(row).sort(), ["evidence", "id", "remedy", "status"]);
    assert.ok(["present", "missing", "not-applicable", "unknown"].includes(row.status));
  }
  assert.ok(list.filter((r) => r.id !== "journey-coverage").every((r) => r.status === "present"), JSON.stringify(list));
  assert.equal(list.find((r) => r.id === "journey-coverage").status, "unknown");
});

test("AC-239 security-scan: present with the envelope path, missing with the scan command, unknown when unreadable", () => {
  assert.equal(rows(full())["security-scan"].evidence, SEC);
  const missing = rows(full({ exists: () => false }))["security-scan"];
  assert.equal(missing.status, "missing");
  assert.match(missing.remedy, /security-scan\.mjs/u);
  const unknown = rows(full({ exists: () => { throw new Error("boom"); } }))["security-scan"];
  assert.equal(unknown.status, "unknown");
});

test("G20-25 security-scan: a readable scan result puts the four-state reading in the evidence, never a bare present for a skipped scanner", () => {
  const scan = JSON.stringify({ scanners: [{ tool: "gitleaks", status: "SKIPPED", classification: "binary_missing" }, { tool: "semgrep", status: "PASS", classification: "success" }] });
  const row = rows(full({ readBytes: (p) => { if (p !== "evidence/security-latest.json") throw new Error("unexpected"); return Buffer.from(scan); } }))["security-scan"];
  assert.equal(row.status, "present");
  assert.match(row.evidence, /gitleaks: not executed/u);
  assert.match(row.evidence, /semgrep: passed/u);
  assert.match(row.evidence, /osv-scanner: not applicable/u);
  assert.equal(rows(full({ readBytes: () => Buffer.from("not json") }))["security-scan"].evidence, SEC); // unreadable result: the bare path
});

test("C29-C3 security-scan: an empty or unreadable v2 capability plan is named open beside the scanner states, never left to read as passed", () => {
  // Codex run 3 (C3, PO tile 2026-11-13 "only honest display"): the v2 plan was empty and reporting only while the row said present.
  const scan = JSON.stringify({ scanners: [{ tool: "semgrep", status: "PASS", classification: "success" }] });
  const verdict = (plan) => JSON.stringify({ schema: "pipeline.security-verdict.v2", exitAuthority: "v1-blocking-logic", plan, verdict: { blocking: false }, capabilityOutcomes: {}, controls: [] });
  const withVerdict = (text) => rows(full({ readBytes: (p) => { if (p === "evidence/security-latest.json") return Buffer.from(scan); if (p === SEC_VERDICT && text !== null) return Buffer.from(text); throw new Error("absent"); } }))["security-scan"];
  assert.match(withVerdict(verdict({ required: [], optional: [] })).evidence, /semgrep: passed; license-check: not applicable; trivy: not applicable; v2 capability plan empty, reporting only: capability controls open\)$/u);
  assert.match(withVerdict(null).evidence, /; v2 scope unavailable\)$/u);
  const planned = withVerdict(verdict({ required: ["cap.sast"], optional: [] })).evidence;
  assert.match(planned, /v2 verdict reporting only, exit by v1\)$/u); assert.doesNotMatch(planned, /plan empty|unavailable/u);
});

test("AC-239 adr-decision: present, not-applicable when no decision qualifies, missing when claimed but absent, unknown without a signal", () => {
  assert.equal(rows(full())["adr-decision"].status, "present");
  assert.equal(rows(full({ architectureImpact: () => "no-architecture-impact" }))["adr-decision"].status, "not-applicable");
  assert.equal(rows(full({ listDir: () => [] }))["adr-decision"].status, "missing");
  const unknown = rows(full({ architectureImpact: () => null }))["adr-decision"];
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.remedy, null);
  // Every ADR path the design names must exist; the check takes precedence over a not-applicable impact (report-only).
  const promised = ["docs/adr/0001-a.md", "docs/adr/0002-b.md"];
  const withPromise = (paths, over = {}) => full({ architectureImpact: () => "no-architecture-impact", promisedAdrPaths: () => paths, exists: (p) => new Set([...promised.slice(0, 1), ...(over.have ?? [])]).has(p), ...(over.readers ?? {}) });
  const allThere = rows(withPromise(promised, { have: [promised[1]] }))["adr-decision"];
  assert.equal(allThere.status, "present");
  assert.match(String(allThere.evidence), /0001-a\.md/u);
  assert.match(String(allThere.evidence), /0002-b\.md/u);
  const gap = rows(withPromise(promised))["adr-decision"];
  assert.equal(gap.status, "missing");
  assert.match(gap.remedy, /docs\/adr\/0002-b\.md/u);
  assert.doesNotMatch(gap.remedy, /0001-a\.md/u);
  assert.match(gap.remedy, /architecture-decision/u);
  // Absent, throwing or null reader, and an empty array, leave every existing impact outcome unchanged.
  for (const reader of [undefined, () => { throw new Error("x"); }, () => null, () => []]) {
    assert.equal(rows(full({ promisedAdrPaths: reader }))["adr-decision"].status, "present");
    assert.equal(rows(full({ promisedAdrPaths: reader, architectureImpact: () => "no-architecture-impact" }))["adr-decision"].status, "not-applicable");
    assert.equal(rows(full({ promisedAdrPaths: reader, listDir: () => [] }))["adr-decision"].status, "missing");
    assert.equal(rows(full({ promisedAdrPaths: reader, architectureImpact: () => null }))["adr-decision"].status, "unknown");
  }
});

test("AC-239 adr-decision: the evidence lists every named ADR path with whether it exists, report-only", () => {
  const promised = ["docs/adr/0001-a.md", "docs/adr/0002-b.md"];
  const gap = rows(full({ architectureImpact: () => "no-architecture-impact", promisedAdrPaths: () => promised, exists: (p) => p === promised[0] }))["adr-decision"];
  assert.equal(gap.status, "missing");
  assert.match(String(gap.evidence), /docs\/adr\/0001-a\.md: exists/u);
  assert.match(String(gap.evidence), /docs\/adr\/0002-b\.md: missing/u);
  const ok = rows(full({ promisedAdrPaths: () => promised, exists: () => true }))["adr-decision"];
  assert.equal(ok.status, "present");
  assert.match(String(ok.evidence), /docs\/adr\/0002-b\.md: exists/u);
  // Report-only: the readback never throws and the other rows keep their outcome.
  assert.equal(rows(full({ promisedAdrPaths: () => promised, exists: () => false }))["security-scan"].status, "missing");
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

// Candidate 19 (Codex greenfield F6): three rounds, the first FAIL, the last PASS. The row names the passing round, never the old FAIL.
test("AC-239 critic-report-file: names the passing round when receipts are readable, missing when every round failed, legacy answer when a receipt is unreadable", () => {
  const three = (verdicts, over = {}) => {
    const dirs = ["pk-1", "pk-2", "pk-3"];
    const reports = new Set(dirs.map((d) => `${CRITIC_DIR}/${d}/report.md`));
    return full({
      exists: (p) => reports.has(p) || [SEC, SEC_VERDICT, "docs/state.md"].includes(p),
      listDir: (p) => (p === CRITIC_DIR ? dirs : p === "docs/adr" ? ["0001-x.md"] : []),
      readBytes: (p) => {
        const index = dirs.findIndex((d) => p === `${CRITIC_DIR}/${d}/receipt.json`);
        if (index < 0 || verdicts[index] === undefined) throw new Error("no receipt");
        return Buffer.from(JSON.stringify({ reviewPass: verdicts[index] }));
      },
      ...over,
    });
  };
  const passing = rows(three([false, false, true]))["critic-report-file"];
  assert.equal(passing.status, "present");
  assert.equal(passing.evidence, `${CRITIC_DIR}/pk-3/report.md`);
  assert.equal(rows(three([true, false, false]))["critic-report-file"].evidence, `${CRITIC_DIR}/pk-1/report.md`, "a later fail does not hide the earlier pass");
  const failed = rows(three([false, false, false]))["critic-report-file"];
  assert.equal(failed.status, "missing");
  assert.match(failed.remedy, /no passing review/u);
  const unreadable = rows(three([]))["critic-report-file"];
  assert.equal(unreadable.status, "present");
  assert.equal(unreadable.evidence, `${CRITIC_DIR}/pk-1/report.md`, "an unreadable receipt keeps the legacy answer");
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
