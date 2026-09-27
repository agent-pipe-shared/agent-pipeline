// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareEffectiveArchitectureDecisions, inspectEffectiveArchitectureDecisions } from "./architecture-effective-decisions.mjs";
import { runArchitectureEffectiveCli } from "../scripts/architecture-effective-decisions.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "architecture-effective-"));
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function decision(root, stem, { status = "accepted", scope = "project", body = "# Governing decision\n", supersedes, exception, moduleIds } = {}) {
  const dir = join(root, "docs", "adr");
  writeFileSync(join(dir, `${stem}.md`), body);
  const record = { schema: moduleIds ? "pipeline.architecture-decision.v2" : "pipeline.architecture-decision.v1", id: stem, title: stem,
    status, digest: sha(body), scope, date: "2026-09-25",
    ...(moduleIds ? { moduleIds } : {}),
    ...(supersedes ? { supersedes } : {}), ...(exception ? { exception } : {}) };
  writeFileSync(join(dir, `${stem}.json`), `${JSON.stringify(record)}\n`);
  return record;
}
const inspect = (root) => inspectEffectiveArchitectureDecisions({ rootDir: root, area: "pipeline-core", now: "2026-09-25T12:00:00.000Z" });
function map(root, ids = ["pipeline-core", "harness"]) {
  const dir = join(root, "architecture", "map");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.md"), `# Map\n\nOKF v0.1 concept bundle.\n\n${ids.map((id) => `- [${id}](${id}.md)`).join("\n")}\n`);
  for (const id of ids) writeFileSync(join(dir, `${id}.md`), `---
type: Governed Module
id: ${id}
responsibility: Own ${id}
nonResponsibilities: []
ownedPaths:
  - ${id}/**
publicContracts: []
allowedDependencies: []
authorityEffects: []
verificationEntryPoints: []
adrReferences: []
---
# ${id}\n`);
}

test("AC19 source precondition: two isolated reads of the same validated decision set agree", (t) => {
  const root = fixture(t);
  decision(root, "ADR-1");
  const first = inspect(root);
  const second = inspect(root);
  assert.equal(first.status, "ready");
  assert.deepEqual(first.decisions.map(({ id }) => id), ["ADR-1"]);
  assert.equal(compareEffectiveArchitectureDecisions(first, second).code, "ARCH-DECISION-PARITY-MATCH");
});

test("AC19 source precondition: a different valid decision body yields typed divergence", (t) => {
  const leftRoot = fixture(t);
  const rightRoot = fixture(t);
  decision(leftRoot, "ADR-1", { body: "# Decision\nRefuse the write.\n" });
  decision(rightRoot, "ADR-1", { body: "# Decision\nAllow the write.\n" });
  assert.equal(compareEffectiveArchitectureDecisions(inspect(leftRoot), inspect(rightRoot)).code,
    "ARCH-DECISION-PARITY-DIVERGENCE");
});

test("AC19 parity validates the projection digest and includes active-exception differences", (t) => {
  const root = fixture(t);
  decision(root, "ADR-1");
  const left = inspect(root);
  const stale = structuredClone(left);
  stale.decisions[0].digest = "f".repeat(64);
  assert.equal(compareEffectiveArchitectureDecisions(left, stale).code,
    "ARCH-DECISION-PARITY-UNRESOLVED");

  const changedSubject = {
    schema: left.schema,
    status: left.status,
    area: left.area,
    decisions: left.decisions,
    activeExceptions: [{ id: "EX-1", scope: "pipeline-core", expiry: "2026-12-31" }],
    findings: left.findings,
  };
  const right = {
    ...changedSubject,
    code: left.code,
    projectionSha256: sha(JSON.stringify(changedSubject)),
  };
  assert.equal(compareEffectiveArchitectureDecisions(left, right).code,
    "ARCH-DECISION-PARITY-DIVERGENCE");
});

test("legacy, forged, orphan and malformed decision sources never mint an effective projection", (t) => {
  const root = fixture(t);
  const dir = join(root, "docs", "adr");
  writeFileSync(join(dir, "legacy.md"), "# Legacy\nStatus: accepted\n");
  decision(root, "drifted");
  writeFileSync(join(dir, "drifted.md"), "# silently changed\n");
  writeFileSync(join(dir, "orphan.json"), "{}\n");
  writeFileSync(join(dir, "malformed.md"), "# Malformed\n");
  writeFileSync(join(dir, "malformed.json"), "{oops\n");
  const invalid = decision(root, "wrong-status");
  writeFileSync(join(dir, "wrong-status.json"), `${JSON.stringify({ ...invalid, status: "closed", extra: true })}\n`);
  const result = inspect(root);
  assert.equal(result.status, "blocked");
  assert.equal(result.projectionSha256, null);
  assert.deepEqual(result.findings.map(({ code }) => code).sort(), [
    "decision-sidecar-invalid-or-drifted", "decision-source-invalid",
    "legacy-decision-without-sidecar", "orphan-decision-sidecar", "decision-sidecar-invalid-or-drifted",
  ].sort());
  assert.equal(compareEffectiveArchitectureDecisions(result, result).code, "ARCH-DECISION-PARITY-UNRESOLVED");
});

test("accepted supersession requires a real superseded predecessor; proposed decisions are not effective", (t) => {
  const root = fixture(t);
  decision(root, "ADR-old", { status: "superseded" });
  decision(root, "ADR-new", { supersedes: "ADR-old" });
  decision(root, "ADR-draft", { status: "proposed" });
  assert.deepEqual(inspect(root).decisions.map(({ id }) => id), ["ADR-new"]);
  decision(root, "ADR-new", { supersedes: "missing" });
  assert.ok(inspect(root).findings.some(({ code }) => code === "supersession-unresolved"));
});

test("historical ADRs and unscoped v1 module decisions warn without blocking valid decisions", (t) => {
  const root = fixture(t);
  decision(root, "ADR-known");
  decision(root, "ADR-module", { scope: "module" });
  writeFileSync(join(root, "docs", "adr", "legacy.md"), "# Legacy\nStatus: accepted\n");
  const result = inspect(root);
  assert.equal(result.status, "advisory");
  assert.equal(result.code, "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING");
  assert.deepEqual(result.decisions.map(({ id }) => id), ["ADR-known"]);
  assert.deepEqual(result.findings.map(({ code }) => code).sort(), [
    "legacy-decision-without-sidecar", "module-applicability-unresolved",
  ]);
  assert.match(result.projectionSha256, /^[a-f0-9]{64}$/u);
  assert.equal(compareEffectiveArchitectureDecisions(result, inspect(root)).code,
    "ARCH-DECISION-PARITY-ADVISORY-MATCH");
});

test("accepted v2 module applicability is effective only for its explicit, validated module IDs", (t) => {
  const root = fixture(t);
  map(root);
  decision(root, "ADR-project");
  decision(root, "ADR-module", { scope: "module", moduleIds: ["pipeline-core"] });
  decision(root, "ADR-other-module", { scope: "module", moduleIds: ["harness"] });
  decision(root, "ADR-proposed", { status: "proposed", scope: "module", moduleIds: ["pipeline-core"] });
  const core = inspect(root);
  const harness = inspectEffectiveArchitectureDecisions({ rootDir: root, area: "harness",
    now: "2026-09-25T12:00:00.000Z" });
  assert.equal(core.status, "ready");
  assert.deepEqual(core.decisions.map(({ id }) => id), ["ADR-module", "ADR-project"]);
  assert.deepEqual(core.decisions[0], { id: "ADR-module", digest: sha("# Governing decision\n"),
    scope: "module", moduleIds: ["pipeline-core"], path: "docs/adr/ADR-module.md" });
  assert.deepEqual(harness.decisions.map(({ id }) => id), ["ADR-other-module", "ADR-project"]);
  assert.equal(core.findings.some(({ code }) => code === "module-applicability-awaiting-approval"), false);
  assert.notEqual(core.projectionSha256, harness.projectionSha256);
  assert.equal(compareEffectiveArchitectureDecisions(core, inspect(root)).code, "ARCH-DECISION-PARITY-MATCH");
  const allAreas = inspectEffectiveArchitectureDecisions({ rootDir: root, area: "project",
    now: "2026-09-25T12:00:00.000Z" });
  assert.equal(allAreas.status, "ready");
  assert.deepEqual(allAreas.decisions.map(({ id }) => id), ["ADR-project"]);
  assert.equal(allAreas.findings.some(({ code }) => code === "module-area-unresolved"), false);
});

test("a v2 module decision cannot name absent, duplicate or unsorted modules", (t) => {
  const root = fixture(t);
  map(root);
  decision(root, "ADR-unknown", { scope: "module", moduleIds: ["unknown"] });
  assert.ok(inspect(root).findings.some(({ code }) => code === "module-id-unresolved"));
  decision(root, "ADR-unknown", { scope: "module", moduleIds: ["pipeline-core", "pipeline-core"] });
  assert.ok(inspect(root).findings.some(({ code }) => code === "decision-sidecar-invalid-or-drifted"));
  decision(root, "ADR-unknown", { scope: "module", moduleIds: ["pipeline-core"] });
  rmSync(join(root, "architecture", "map", "index.md"));
  assert.ok(inspect(root).findings.some(({ code }) => code === "module-inventory-unavailable"));
  writeFileSync(join(root, "outside-index.md"), "# Map\n\nOKF v0.1 concept bundle.\n");
  symlinkSync(join(root, "outside-index.md"), join(root, "architecture", "map", "index.md"));
  assert.ok(inspect(root).findings.some(({ code }) => code === "module-inventory-unavailable"));
});

test("the task-path CLI resolves one map owner before selecting module decisions", (t) => {
  const root = fixture(t);
  map(root);
  decision(root, "ADR-module", { scope: "module", moduleIds: ["pipeline-core"] });
  const selected = runArchitectureEffectiveCli(["--root", root, "--path", "pipeline-core/new-feature.mjs"]);
  assert.equal(selected.exitCode, 0);
  assert.equal(selected.output.area, "pipeline-core");
  assert.deepEqual(selected.output.decisions.map(({ id }) => id), ["ADR-module"]);
  assert.equal(selected.output.findings.some(({ code }) => code === "module-applicability-awaiting-approval"), false);
  assert.equal(runArchitectureEffectiveCli(["--root", root, "--path", "unowned/file.mjs"]).output.code,
    "TASK-MODULE-UNRESOLVED");
  assert.equal(runArchitectureEffectiveCli(["--root", root, "--path", "../outside.mjs"]).output.code,
    "TASK-PATH-INVALID");
  assert.equal(runArchitectureEffectiveCli(["--root", root, "--path", "pipeline-core/a.mjs",
    "--area", "pipeline-core"]).output.code, "ARGUMENTS-INVALID");
});

test("the task-path CLI rejects redirected map authority before resolving an owner", (t) => {
  const root = fixture(t);
  map(root);
  const index = join(root, "architecture", "map", "index.md");
  const outside = join(root, "redirected-index.md");
  writeFileSync(outside, "# Redirected map\n\nOKF v0.1 concept bundle.\n");
  rmSync(index);
  symlinkSync(outside, index);
  const result = runArchitectureEffectiveCli(["--root", root, "--path", "pipeline-core/new-feature.mjs"]);
  assert.equal(result.exitCode, 2);
  assert.equal(result.output.code, "MODULE-INVENTORY-UNAVAILABLE");
});

test("a module-scoped v1 decision and a self-declared waiver remain unresolved", (t) => {
  const root = fixture(t);
  decision(root, "ADR-module", { scope: "module" });
  decision(root, "ADR-waiver", { status: "waived", exception: {
    authority: "human-po", rationale: "Fixture", scope: "project", expiry: "2026-12-31",
  } });
  const result = inspect(root);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.activeExceptions, []);
  assert.ok(result.findings.some(({ code }) => code === "module-applicability-unresolved"));
  assert.ok(result.findings.some(({ code }) => code === "waiver-human-authority-unverified"));
});

test("the read-only CLI reports unresolved legacy input as a nonblocking warning", (t) => {
  const root = fixture(t);
  assert.equal(runArchitectureEffectiveCli(["--root", root, "--area", "pipeline-core", "--now", "2026-09-25T12:00:00.000Z"]).exitCode, 0);
  writeFileSync(join(root, "docs", "adr", "legacy.md"), "# Legacy\n");
  const advisory = runArchitectureEffectiveCli(["--root", root, "--area", "pipeline-core", "--now", "2026-09-25T12:00:00.000Z"]);
  assert.equal(advisory.exitCode, 0);
  assert.equal(advisory.output.code, "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING");
  writeFileSync(join(root, "docs", "adr", "orphan.json"), "{}\n");
  const blocked = runArchitectureEffectiveCli(["--root", root, "--area", "pipeline-core", "--now", "2026-09-25T12:00:00.000Z"]);
  assert.equal(blocked.exitCode, 2);
  assert.equal(blocked.output.code, "ARCH-DECISION-EFFECTIVE-UNRESOLVED");
  assert.equal(runArchitectureEffectiveCli(["--root", ".", "--area", "pipeline-core"]).exitCode, 2);
});
