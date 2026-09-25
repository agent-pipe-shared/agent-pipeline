// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
function decision(root, stem, { status = "accepted", scope = "project", body = "# Governing decision\n", supersedes, exception } = {}) {
  const dir = join(root, "docs", "adr");
  writeFileSync(join(dir, `${stem}.md`), body);
  const record = { schema: "pipeline.architecture-decision.v1", id: stem, title: stem,
    status, digest: sha(body), scope, date: "2026-09-25",
    ...(supersedes ? { supersedes } : {}), ...(exception ? { exception } : {}) };
  writeFileSync(join(dir, `${stem}.json`), `${JSON.stringify(record)}\n`);
  return record;
}
const inspect = (root) => inspectEffectiveArchitectureDecisions({ rootDir: root, area: "pipeline-core", now: "2026-09-25T12:00:00.000Z" });

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
