#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Test coverage for guard-handover-size.mjs. Uses ONLY synthetic fixture repos built by
// this file — NEVER the real docs/state.md (read separately, read-only, by this dispatch's
// own report for the "current repo status" DoD check, not exercised here).

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { decide, resolveCalibratedHandoverRelPath, checkHandoverSize } from "./guard-handover-size.mjs";

const SCRIPT = fileURLToPath(new URL("./guard-handover-size.mjs", import.meta.url));
const roots = [];
let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function tmp(name) {
  const root = mkdtempSync(join(tmpdir(), `guard-handover-size-${name}-`));
  roots.push(root);
  return root;
}

// Builds a fixture project: docs/state.md with the given content, project/pipeline.json
// declaring "handover": "docs/state.md" (this repo's own real calibration shape — a plain
// path string, not an object with maxBytes, per this dispatch's own investigation).
function buildFixture(name, { handoverBytes, otherFile = false } = {}) {
  const cwd = tmp(name);
  mkdirSync(join(cwd, "docs"), { recursive: true });
  mkdirSync(join(cwd, "project"), { recursive: true });
  const content = "x".repeat(handoverBytes);
  writeFileSync(join(cwd, "docs", "state.md"), content, "utf8");
  writeFileSync(
    join(cwd, "project", "pipeline.json"),
    JSON.stringify({ handover: "docs/state.md" }, null, 2),
    "utf8"
  );
  if (otherFile) writeFileSync(join(cwd, "docs", "other.md"), "unrelated content", "utf8");
  return cwd;
}

check("resolveCalibratedHandoverRelPath reads the handover string key from project/pipeline.json", () => {
  const cwd = buildFixture("resolve-path", { handoverBytes: 10 });
  expect(resolveCalibratedHandoverRelPath(cwd) === "docs/state.md", "expected docs/state.md from calibration");
});

check("resolveCalibratedHandoverRelPath falls back to the default when calibration is absent", () => {
  const cwd = tmp("resolve-path-absent");
  expect(resolveCalibratedHandoverRelPath(cwd) === "docs/state.md", "expected default docs/state.md");
});

check("checkHandoverSize reports over/under against the calibrated (default 12000) budget", () => {
  const cwdUnder = buildFixture("check-size-under", { handoverBytes: 100 });
  const resultUnder = checkHandoverSize(cwdUnder, "docs/state.md");
  expect(resultUnder !== null, "expected a payload for the under-budget fixture");
  expect(resultUnder.over === false, "100 bytes must be under the 12000-byte default budget");

  const cwdOver = buildFixture("check-size-over", { handoverBytes: 20000 });
  const resultOver = checkHandoverSize(cwdOver, "docs/state.md");
  expect(resultOver !== null, "expected a payload for the over-budget fixture");
  expect(resultOver.over === true, "20000 bytes must be over the 12000-byte default budget");
  expect(resultOver.bytes === 20000, `expected bytes=20000, got ${resultOver.bytes}`);
  expect(resultOver.maxBytes === 12000, `expected maxBytes=12000, got ${resultOver.maxBytes}`);
});

check("checkHandoverSize returns null (fail-open cue) when the file does not exist", () => {
  const cwd = tmp("check-size-missing");
  mkdirSync(join(cwd, "project"), { recursive: true });
  writeFileSync(join(cwd, "project", "pipeline.json"), JSON.stringify({ handover: "docs/state.md" }), "utf8");
  const result = checkHandoverSize(cwd, "docs/state.md");
  expect(result === null, "expected null for a missing handover file");
});

check("decide() allows an Edit under budget on the calibrated handover file", () => {
  const cwd = buildFixture("decide-under", { handoverBytes: 100 });
  const verdict = decide({
    toolName: "Edit",
    toolInput: { file_path: join(cwd, "docs", "state.md") },
    projectDir: cwd,
  });
  expect(verdict.decision === "allow", `expected allow, got ${verdict.decision}`);
  expect(verdict.exitCode === 0, `expected exit 0, got ${verdict.exitCode}`);
});

check("decide() denies an Edit over budget on the calibrated handover file, citing exact byte counts", () => {
  const cwd = buildFixture("decide-over", { handoverBytes: 15000 });
  const verdict = decide({
    toolName: "Edit",
    toolInput: { file_path: join(cwd, "docs", "state.md") },
    projectDir: cwd,
  });
  expect(verdict.decision === "deny", `expected deny, got ${verdict.decision}`);
  expect(verdict.exitCode === 2, `expected exit 2, got ${verdict.exitCode}`);
  const text = verdict.lines.join("\n");
  expect(text.includes("15000 bytes"), `deny message must cite current bytes: ${text}`);
  expect(text.includes("12000 bytes"), `deny message must cite configured budget: ${text}`);
  expect(text.includes("docs/state.md"), `deny message must cite the file: ${text}`);
});

check("decide() allows (fail-open) an Edit targeting a different file entirely, even over budget", () => {
  const cwd = buildFixture("decide-other-file", { handoverBytes: 20000, otherFile: true });
  const verdict = decide({
    toolName: "Edit",
    toolInput: { file_path: join(cwd, "docs", "other.md") },
    projectDir: cwd,
  });
  expect(verdict.decision === "allow", `expected allow for a non-handover target, got ${verdict.decision}`);
  expect(verdict.exitCode === 0, `expected exit 0, got ${verdict.exitCode}`);
});

check("decide() allows an Edit with no usable target path (fail-open)", () => {
  const cwd = buildFixture("decide-no-target", { handoverBytes: 20000 });
  const verdict = decide({ toolName: "Edit", toolInput: {}, projectDir: cwd });
  expect(verdict.decision === "allow", `expected allow for no target path, got ${verdict.decision}`);
});

check("decide() matches a relative file_path against the calibrated handover file too", () => {
  const cwd = buildFixture("decide-relative", { handoverBytes: 15000 });
  const verdict = decide({
    toolName: "Edit",
    toolInput: { file_path: "docs/state.md" },
    projectDir: cwd,
  });
  expect(verdict.decision === "deny", `expected deny for a relative-path match, got ${verdict.decision}`);
});

check("CLI subprocess: malformed stdin fails open (exit 0)", () => {
  const cwd = buildFixture("cli-malformed", { handoverBytes: 20000 });
  const result = spawnSync(process.execPath, [SCRIPT], { cwd, input: "not json{{{", encoding: "utf8" });
  expect(result.status === 0, `expected exit 0 for malformed stdin, got ${result.status}; stderr=${result.stderr}`);
});

check("CLI subprocess: allows under-budget handover edit via stdin, exit 0", () => {
  const cwd = buildFixture("cli-under", { handoverBytes: 100 });
  const payload = JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "docs/state.md" } });
  const result = spawnSync(process.execPath, [SCRIPT], { cwd, input: payload, encoding: "utf8" });
  expect(result.status === 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
});

check("CLI subprocess: denies over-budget handover edit via stdin, exit 2, message on stderr", () => {
  const cwd = buildFixture("cli-over", { handoverBytes: 15000 });
  const payload = JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "docs/state.md" } });
  const result = spawnSync(process.execPath, [SCRIPT], { cwd, input: payload, encoding: "utf8" });
  expect(result.status === 2, `expected exit 2, got ${result.status}`);
  expect(result.stderr.includes("BLOCKED (guard-handover-size"), `expected BLOCKED message on stderr: ${result.stderr}`);
  expect(result.stderr.includes("15000 bytes"), `expected exact byte count on stderr: ${result.stderr}`);
});

check("CLI subprocess: allows (fail-open) a tool call targeting an unrelated file", () => {
  const cwd = buildFixture("cli-other", { handoverBytes: 20000, otherFile: true });
  const payload = JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "docs/other.md" } });
  const result = spawnSync(process.execPath, [SCRIPT], { cwd, input: payload, encoding: "utf8" });
  expect(result.status === 0, `expected exit 0 for unrelated target, got ${result.status}; stderr=${result.stderr}`);
});

check("CLI subprocess: NotebookEdit target is matched via notebook_path", () => {
  const cwd = buildFixture("cli-notebook", { handoverBytes: 15000 });
  const payload = JSON.stringify({ tool_name: "NotebookEdit", tool_input: { notebook_path: "docs/state.md" } });
  const result = spawnSync(process.execPath, [SCRIPT], { cwd, input: payload, encoding: "utf8" });
  expect(result.status === 2, `expected exit 2 for NotebookEdit over-budget target, got ${result.status}`);
});

for (const root of roots) rmSync(root, { recursive: true, force: true });

const total = passed + failures.length;
console.log(`\n${passed}/${total} cases passed.`);
if (failures.length) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
