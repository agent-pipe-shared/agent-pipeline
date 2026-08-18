#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-el01-tripwire.test.mjs — test suite for the EL-01 write-time tripwire.
 *
 * Run: node plugins/pipeline-core/hooks/guard-el01-tripwire.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Hermetics: every spawn sets CLAUDE_PROJECT_DIR to a fresh temp dir so this machine's
 * real state/specs can never leak into these cases. This suite doubles as the briefed
 * break-and-restore acceptance test: TP-01/TP-02 construct the refused scenario live
 * (orchestrator-session write, risk-flagged feature, no matching dispatch record) and
 * demonstrate the refusal; TP-03 constructs the admitted scenario (matching dispatch
 * record present) and demonstrates success; every temp dir is removed at the end
 * (restore), and no case ever touches the real repository's own state.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./guard-el01-tripwire.mjs", import.meta.url));

const ALL_DIRS = [];
function freshDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-el01-${prefix}-`));
  ALL_DIRS.push(dir);
  return dir;
}
function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
}
function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const RULESET_SHA = "a".repeat(64);

const SPEC_HIGH = [
  "# Spec: Example",
  "",
  "| Field | Value |",
  "| --- | --- |",
  "| Rigor level | 2 (core contracts) |",
  "| Risk class | high |",
  "",
].join("\n");
const SPEC_LOW = [
  "# Spec: Example",
  "",
  "| Field | Value |",
  "| --- | --- |",
  "| Rigor level | 0 |",
  "| Risk class | low |",
  "",
].join("\n");

function stateWithFeature({ specPath, planPath, viaContinuity }) {
  const base = {
    schema: "pipeline.state.v0",
    activeFeature: { id: "phx-example", planPath, phase: "implementation" },
  };
  if (viaContinuity) {
    base.continuity = {
      schema: "pipeline.continuity.v0",
      featureId: "phx-example",
      authority: { spec: { path: specPath, sha256: "b".repeat(64) } },
    };
  }
  return base;
}

function runGuard(toolName, filePath, projectDir) {
  const toolInput = toolName === "NotebookEdit"
    ? { notebook_path: filePath, cell_id: "1" }
    : { file_path: filePath, old_string: "a", new_string: "b" };
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
function check(id, toolName, filePath, expectExit, { projectDir, stderrIncludes, stderrEmpty } = {}) {
  const { code, stderr } = runGuard(toolName, filePath, projectDir);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 300)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 200)}`);
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}
const BLOCK = 2, ALLOW = 0, WARN = 1;

// ---- TP-01: BREAK -- refused scenario, spec.md via continuity.authority.spec.path -----
{
  const dir = freshDir("refuse-continuity");
  writeJson(join(dir, "project", "pipeline-state.json"), stateWithFeature({
    specPath: "specs/phx-example/spec.md",
    planPath: "specs/phx-example/prd_example.md",
    viaContinuity: true,
  }));
  writeText(join(dir, "specs", "phx-example", "spec.md"), SPEC_HIGH);
  check("TP-01 BLOCK: risk-flagged feature, no dispatch record, source-path Edit", "Edit", "src/foo.mjs", BLOCK, {
    projectDir: dir,
    stderrIncludes: [
      "BLOCKED (guard-el01-tripwire",
      'Feature: "phx-example" (risk class: high',
      "No active, matching, currently-open dispatch record",
    ],
  });
  check("TP-01b BLOCK: Write tool also refused", "Write", "src/bar.mjs", BLOCK, { projectDir: dir });
  check("TP-01c BLOCK: NotebookEdit also refused (notebook_path)", "NotebookEdit", "analysis/nb.ipynb", BLOCK, { projectDir: dir });
}

// ---- TP-02: BREAK -- refused via planPath-sibling spec.md fallback (no continuity) ----
{
  const dir = freshDir("refuse-fallback");
  writeJson(join(dir, "project", "pipeline-state.json"), stateWithFeature({
    specPath: "specs/phx-example/spec.md",
    planPath: "specs/phx-example/prd_example.md",
    viaContinuity: false,
  }));
  writeText(join(dir, "specs", "phx-example", "spec.md"), SPEC_HIGH);
  check("TP-02 BLOCK: fallback sibling-spec resolution still finds risk class high", "Edit", "src/foo.mjs", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["risk class: high"],
  });
}

// ---- TP-03: RESTORE -- admitted scenario, a genuinely open matching dispatch record ---
{
  const dir = freshDir("admit-open-record");
  writeJson(join(dir, "project", "pipeline-state.json"), stateWithFeature({
    specPath: "specs/phx-example/spec.md",
    planPath: "specs/phx-example/prd_example.md",
    viaContinuity: true,
  }));
  writeText(join(dir, "specs", "phx-example", "spec.md"), SPEC_HIGH);
  writeJson(join(dir, "dispatch-record-PHX-EXAMPLE.json"), {
    taskId: "PHX-EXAMPLE",
    model: "claude-sonnet-5",
    rulesetSha: RULESET_SHA,
    dispatcher: "elephant",
    outcome: "in-progress",
    log: [],
  });
  check("TP-03 ALLOW: matching open dispatch record present at repo root", "Edit", "src/foo.mjs", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- TP-04: RESTORE -- admitted scenario, open record nested deep in the tree ---------
{
  const dir = freshDir("admit-nested-record");
  writeJson(join(dir, "project", "pipeline-state.json"), stateWithFeature({
    specPath: "specs/phx-example/spec.md",
    planPath: "specs/phx-example/prd_example.md",
    viaContinuity: true,
  }));
  writeText(join(dir, "specs", "phx-example", "spec.md"), SPEC_HIGH);
  writeJson(join(dir, "plugins", "pipeline-core", "scripts", "dispatch-record.json"), {
    taskId: "PHX-NESTED",
    model: "claude-sonnet-5",
    rulesetSha: RULESET_SHA,
    dispatcher: "elephant",
    outcome: "in-progress",
    log: [{ phase: "start" }],
  });
  check("TP-04 ALLOW: matching open dispatch record nested under plugins/", "Edit", "src/foo.mjs", ALLOW, { projectDir: dir });
}

// ---- TP-05: a TERMINAL-outcome record does not admit the write ------------------------
{
  const dir = freshDir("refuse-terminal-record");
  writeJson(join(dir, "project", "pipeline-state.json"), stateWithFeature({
    specPath: "specs/phx-example/spec.md",
    planPath: "specs/phx-example/prd_example.md",
    viaContinuity: true,
  }));
  writeText(join(dir, "specs", "phx-example", "spec.md"), SPEC_HIGH);
  writeJson(join(dir, "dispatch-record-DONE.json"), {
    taskId: "PHX-DONE",
    model: "claude-sonnet-5",
    rulesetSha: RULESET_SHA,
    dispatcher: "goldfish",
    outcome: "passed",
    log: [],
  });
  check("TP-05 BLOCK: a closed (passed) record does not count as open", "Edit", "src/foo.mjs", BLOCK, { projectDir: dir });
}

// ---- TP-06: a malformed/incomplete record does not admit the write --------------------
{
  const dir = freshDir("refuse-malformed-record");
  writeJson(join(dir, "project", "pipeline-state.json"), stateWithFeature({
    specPath: "specs/phx-example/spec.md",
    planPath: "specs/phx-example/prd_example.md",
    viaContinuity: true,
  }));
  writeText(join(dir, "specs", "phx-example", "spec.md"), SPEC_HIGH);
  writeJson(join(dir, "dispatch-record-FAKE.json"), { outcome: "in-progress" }); // missing every other required field
  check("TP-06 BLOCK: a shape-invalid record (prompt-forgeable one-liner) does not admit", "Edit", "src/foo.mjs", BLOCK, { projectDir: dir });
}

// ---- TP-07: risk class low/absent -- EL-01 exception's own criterion holds, no block --
{
  const dir = freshDir("allow-low-risk");
  writeJson(join(dir, "project", "pipeline-state.json"), stateWithFeature({
    specPath: "specs/phx-example/spec.md",
    planPath: "specs/phx-example/prd_example.md",
    viaContinuity: true,
  }));
  writeText(join(dir, "specs", "phx-example", "spec.md"), SPEC_LOW);
  check("TP-07 ALLOW: risk class low -- no risk flag set, EL-01 fast path stays available", "Edit", "src/foo.mjs", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- TP-08: EL-01's own permitted set is exempt regardless of risk/dispatch state -----
{
  const dir = freshDir("allow-exempt-paths");
  writeJson(join(dir, "project", "pipeline-state.json"), stateWithFeature({
    specPath: "specs/phx-example/spec.md",
    planPath: "specs/phx-example/prd_example.md",
    viaContinuity: true,
  }));
  writeText(join(dir, "specs", "phx-example", "spec.md"), SPEC_HIGH);
  check("TP-08a ALLOW: docs/ is EL-01's own permitted set", "Edit", "docs/state.md", ALLOW, { projectDir: dir });
  check("TP-08b ALLOW: specs/ is EL-01's own permitted set", "Edit", "specs/phx-example/prd_example.md", ALLOW, { projectDir: dir });
  check("TP-08c ALLOW: backlog/items/ is EL-01's own permitted set", "Write", "backlog/items/2026-01-01-x.md", ALLOW, { projectDir: dir });
  check("TP-08d ALLOW: .claude/ is EL-01's own permitted set", "Edit", ".claude/pipeline-state.json", ALLOW, { projectDir: dir });
  check("TP-08e ALLOW: writing a dispatch-record itself is the bootstrap exemption", "Write", "dispatch-record-NEW.json", ALLOW, { projectDir: dir });
  check("TP-08f BLOCK: a traversal segment does not smuggle a source path under docs/", "Edit", "docs/../src/foo.mjs", BLOCK, { projectDir: dir });
}

// ---- TP-09: fail-open baselines -- no state, no active feature, unreadable spec -------
{
  const dir = freshDir("fail-open-no-state");
  check("TP-09a ALLOW: no state file at all", "Edit", "src/foo.mjs", ALLOW, { projectDir: dir, stderrEmpty: true });
}
{
  const dir = freshDir("fail-open-no-feature");
  writeJson(join(dir, "project", "pipeline-state.json"), { schema: "pipeline.state.v0" });
  check("TP-09b ALLOW: state present but no activeFeature", "Edit", "src/foo.mjs", ALLOW, { projectDir: dir, stderrEmpty: true });
}
{
  const dir = freshDir("fail-open-no-spec");
  writeJson(join(dir, "project", "pipeline-state.json"), {
    schema: "pipeline.state.v0",
    activeFeature: { id: "phx-nospec", planPath: "specs/phx-nospec/prd.md", phase: "implementation" },
  });
  // spec.md deliberately absent
  check("TP-09c ALLOW: activeFeature present but its spec.md cannot be found", "Edit", "src/foo.mjs", ALLOW, { projectDir: dir, stderrEmpty: true });
}
{
  const dir = freshDir("warn-invalid-state-json");
  writeJson(join(dir, "project", "pipeline-state.json"), "{not valid json");
  check("TP-09d WARN: state file present but not valid JSON", "Edit", "src/foo.mjs", WARN, {
    projectDir: dir,
    stderrIncludes: ["WARN", "invalid JSON"],
  });
}

// ---- TP-10: absolute path outside the project root is allowed unconditionally ---------
{
  const dir = freshDir("outside-root");
  writeJson(join(dir, "project", "pipeline-state.json"), stateWithFeature({
    specPath: "specs/phx-example/spec.md",
    planPath: "specs/phx-example/prd_example.md",
    viaContinuity: true,
  }));
  writeText(join(dir, "specs", "phx-example", "spec.md"), SPEC_HIGH);
  const outsideDir = freshDir("outside-root-target");
  check("TP-10 ALLOW: an absolute path outside the project root is not this project's file", "Edit", join(outsideDir, "foo.mjs"), ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- Cleanup (restore) -----------------------------------------------------------------
for (const dir of ALL_DIRS) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}

// ---- Summary -----------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
