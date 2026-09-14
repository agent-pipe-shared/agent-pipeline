// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ALFRED_SHIPPED_CONTROL_IDS, checkControlPlacement, expectedControlIds, hookControlIds, validateControlPlacement } from "./control-placement.mjs";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const oid = "b".repeat(40);
const sha = "a".repeat(64);

function record(runner = "codex", changes = {}) {
  return {
    schema: "pipeline.enforcement-conformance.v1", recordId: `${runner}:runner-hook`,
    candidate: { commit: oid, tree: oid, artifactSha256: sha },
    runner: { name: runner, version: "1.0.0", pluginVersion: "0.6.2" }, layer: "runner-hook",
    probeSurfaces: ["runner-hook/orchestrator"], measurement: { status: "measured", values: [{ name: "duration", value: 1, unit: "ms" }] },
    observations: [{ probeSurface: "runner-hook/orchestrator", hookObservation: "fires", evidenceKind: "deterministic-execution", exitCode: 2, markerSha256: sha }],
    evaluator: { outcome: "pass", basis: "fixture", acceptanceSha256: null },
    staleness: { status: "current", runnerVersion: "1.0.0", pluginVersion: "0.6.2", invalidatedBy: null },
    sanitization: { policy: "fixture", redactions: [] }, provenance: { commandSha256: sha, fixtureIds: ["a2"], sourceSha256: sha },
    measuredAt: "2026-09-14T12:00:00.000Z", ...changes,
  };
}

function hooksDocument() {
  return { hooks: { PreToolUse: [{ hooks: [{ command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/guard-alpha.mjs\"" }] }], Stop: [{ hooks: [{ command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/stop-beta.mjs\"" }] }] } };
}

function table(document = hooksDocument(), changes = {}) {
  const status = (runner) => ({ runner, status: "enforced", detail: "fixture A1 record fires" });
  return { schema: "pipeline.control-placement.v1", revision: 1, controls: expectedControlIds(document).map((controlId) => ({
    controlId, protects: ["fixture protected surface"], enforcedBy: ["runner-hook"],
    perRunnerStatus: [status("claude"), status("codex"), status("antigravity")], residualGaps: [],
  })), ...changes };
}

test("derives one stable control per unique hooks.json command and covers the shipped Alfred catalog", () => {
  assert.deepEqual(hookControlIds(hooksDocument()), ["hook:pretooluse:guard-alpha", "hook:stop:stop-beta"]);
  assert.equal(expectedControlIds(hooksDocument()).includes("alfred:a2-control-placement"), true);
  assert.equal(new Set(ALFRED_SHIPPED_CONTROL_IDS).size, ALFRED_SHIPPED_CONTROL_IDS.length);
});

test("accepts complete exact rows only and requires prose compensation", () => {
  assert.equal(validateControlPlacement(table()), true);
  const invalid = table(); invalid.controls[0].unexpected = true;
  assert.throws(() => validateControlPlacement(invalid), /non-canonical keys/);
  const prose = table(); prose.controls[0].enforcedBy = ["prose"];
  assert.throws(() => validateControlPlacement(prose), /compensating detection/);
  prose.controls[0].residualGaps = ["compensating-detection: fixture check"];
  assert.equal(validateControlPlacement(prose), true);
});

test("fails closed without a usable A1 record and rejects contradicted runner-hook claims", () => {
  const absent = checkControlPlacement({ table: table(), hooksDocument: hooksDocument(), a1Record: null, activeRunner: "codex" });
  assert.equal(absent.ok, false);
  assert.equal(absent.findings.includes("A2-A1-RECORD-REQUIRED"), true);
  assert.equal(absent.findings.some((finding) => finding.startsWith("A2-RUNNER-HOOK-CONTRADICTED:")), true);
  const contradicted = record("codex", { observations: [{ probeSurface: "runner-hook/orchestrator", hookObservation: "fires-not", evidenceKind: "deterministic-execution", exitCode: 2, markerSha256: sha }], evaluator: { outcome: "finding", basis: "fixture", acceptanceSha256: null } });
  const result = checkControlPlacement({ table: table(), hooksDocument: hooksDocument(), a1Record: contradicted, activeRunner: "codex" });
  assert.equal(result.findings.some((finding) => finding.startsWith("A2-RUNNER-HOOK-CONTRADICTED:")), true);
});

test("allows runner-hook claims only with a current matching A1 fires record", () => {
  assert.deepEqual(checkControlPlacement({ table: table(), hooksDocument: hooksDocument(), a1Record: record(), activeRunner: "codex" }).findings, []);
});

test("ships a syntactically complete but deliberately unqualified table until A1 evidence exists", () => {
  const hooks = JSON.parse(readFileSync(join(repoRoot, "plugins/pipeline-core/hooks/hooks.json"), "utf8"));
  const shipped = JSON.parse(readFileSync(join(repoRoot, "policies/control-placement.v1.json"), "utf8"));
  assert.equal(validateControlPlacement(shipped), true);
  assert.deepEqual(shipped.controls.map((row) => row.controlId).sort(), expectedControlIds(hooks));
  assert.equal(checkControlPlacement({ table: shipped, hooksDocument: hooks, a1Record: null, activeRunner: "codex" }).findings.includes("A2-A1-RECORD-REQUIRED"), true);
});
