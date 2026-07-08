#!/usr/bin/env node
/**
 * guard-devplan.test.mjs — test suite for the Dev-Plan-Gate PreToolUse guard.
 *
 * AP1-P3 "DURIN". Run: node plugins/pipeline-core/hooks/guard-devplan.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Hermetics: every spawn sets CLAUDE_PROJECT_DIR to a fresh temp dir so this machine's
 * real .claude/pipeline.yaml / pipeline-state.json can never leak into these cases.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./guard-devplan.mjs", import.meta.url));

const ALL_DIRS = [];
function freshDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-devplan-${prefix}-`));
  ALL_DIRS.push(dir);
  return dir;
}
function writeManifest(dir, yamlText) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), yamlText);
}
function writeState(dir, obj) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), typeof obj === "string" ? obj : JSON.stringify(obj));
}

function runGuard(toolName, filePath, projectDir) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath, old_string: "a", new_string: "b" } }),
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
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 200)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 120)}`);
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}
const BLOCK = 2,
  ALLOW = 0,
  WARN = 1;

const MANIFEST_BLOCKING = "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n";
const MANIFEST_WARN = "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: warn\n    type: human\n";
const MANIFEST_OFF = "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: off\n    type: human\n";
const MANIFEST_NO_GATE = "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n";
const MANIFEST_CUSTOM_EXEMPT =
  "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n    exemptPaths:\n      - custom/\n";
const MANIFEST_SYNTAX_BROKEN = "schema: pipeline.manifest.v0\ngates:\n  dev-plan: &anchor\n    mode: blocking\n";

const PLAN_PATH = ".claude/plans/2026-07-07-ap1-pipeline-tuning.md";
// NOTE: no top-level `phase` field here -- `phase` lives
// EXCLUSIVELY inside `activeFeature.phase` (via pipeline-state.mjs `set-phase`); a
// top-level `phase` key was a legacy leftover this hook has never read and would have
// silently masked a schema drift.
const UNAPPROVED_STATE = {
  schema: "pipeline.state.v0",
  activeFeature: { id: "ap1-pipeline-tuning", planPath: PLAN_PATH },
  planApproved: false,
};
const APPROVED_STATE = { ...UNAPPROVED_STATE, planApproved: true };
const NO_FEATURE_STATE = { schema: "pipeline.state.v0" };

// ---- DP01 no manifest at all -> allow --------------------------------------------------
{
  const dir = freshDir("no-manifest");
  check("DP01 allow  no manifest at all", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP02 manifest present, gate "dev-plan" absent -> allow -----------------------------
{
  const dir = freshDir("no-gate");
  writeManifest(dir, MANIFEST_NO_GATE);
  check("DP02 allow  manifest present but gate dev-plan absent", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP03 gate mode off -> allow --------------------------------------------------------
{
  const dir = freshDir("mode-off");
  writeManifest(dir, MANIFEST_OFF);
  writeState(dir, UNAPPROVED_STATE);
  check("DP03 allow  gate mode off", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP04 gate blocking, no state file -> allow -----------------------------------------
{
  const dir = freshDir("no-state");
  writeManifest(dir, MANIFEST_BLOCKING);
  check("DP04 allow  no state file at all", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP05 gate blocking, state present but no activeFeature -> allow --------------------
{
  const dir = freshDir("no-feature");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, NO_FEATURE_STATE);
  check("DP05 allow  no activeFeature in state", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP06 gate blocking, planApproved true -> allow -------------------------------------
{
  const dir = freshDir("approved");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, APPROVED_STATE);
  check("DP06 allow  planApproved true", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP07 gate blocking, unapproved, non-exempt path -> block, names feature id ---------
{
  const dir = freshDir("block");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP07 block  unapproved + non-exempt path -> names feature id", "Edit", "src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning", "guard-devplan"],
  });
}

// ---- DP08 default exempt prefixes -> allow ----------------------------------------------
{
  const prefixes = ["docs/", "specs/", ".claude/", "backlog/"];
  for (const prefix of prefixes) {
    const dir = freshDir(`exempt-${prefix.replace(/\W/g, "")}`);
    writeManifest(dir, MANIFEST_BLOCKING);
    writeState(dir, UNAPPROVED_STATE);
    check(`DP08 allow  default exempt prefix "${prefix}"`, "Edit", `${prefix}something.md`, ALLOW, { projectDir: dir, stderrEmpty: true });
  }
}

// ---- DP09 planPath itself -> allow -------------------------------------------------------
{
  const dir = freshDir("planpath");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP09 allow  the activeFeature.planPath itself", "Edit", PLAN_PATH, ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP10 custom exemptPaths honored -> allow --------------------------------------------
{
  const dir = freshDir("custom-exempt");
  writeManifest(dir, MANIFEST_CUSTOM_EXEMPT);
  writeState(dir, UNAPPROVED_STATE);
  check("DP10 allow  custom exemptPaths from manifest honored", "Edit", "custom/thing.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
  // sanity: a DIFFERENT non-exempt path in the same fixture still blocks.
  check("DP10b block  non-exempt path in same custom-exempt fixture still blocks", "Edit", "src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP11 mode warn, unapproved + non-exempt -> exit 1 -----------------------------------
{
  const dir = freshDir("warn-mode");
  writeManifest(dir, MANIFEST_WARN);
  writeState(dir, UNAPPROVED_STATE);
  check("DP11 warn  mode warn, unapproved + non-exempt -> exit 1", "Edit", "src/foo.ts", WARN, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP12 malformed state JSON -> WARN, not block ----------------------------------------
{
  const dir = freshDir("malformed-state");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, "{ this is not json");
  check("DP12 warn  malformed state JSON surfaces as WARN, not block", "Edit", "src/foo.ts", WARN, {
    projectDir: dir,
    stderrIncludes: ["WARN"],
  });
}

// ---- DP13 Write tool covered (not just Edit) ---------------------------------------------
{
  const dir = freshDir("write-tool");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP13 block  Write tool covered alongside Edit", "Write", "src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP14 backslash path normalization ----------------------------------------------------
{
  const dir = freshDir("backslash");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP14 block  backslash path still matches non-exempt (blocked)", "Edit", "src\\foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
  check("DP14b allow  backslash path under an exempt prefix (Windows docs\\ variant)", "Edit", "docs\\bar.md", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP15 malformed manifest YAML (genuine syntax failure) -> WARN ------------------------
{
  const dir = freshDir("malformed-manifest");
  writeManifest(dir, MANIFEST_SYNTAX_BROKEN);
  check("DP15 warn  malformed manifest YAML surfaces as WARN, not block", "Edit", "src/foo.ts", WARN, {
    projectDir: dir,
    stderrIncludes: ["WARN"],
  });
}

// ---- DP16 absolute path resolution (C1 fix, from a critic review) -----------------------
// `join(dir, ...)` produces an ABSOLUTE path in the platform-native form (backslashes +
// drive letter on Windows) -- exactly the shape Claude Code's real PreToolUse contract
// delivers, unlike the relative fixture paths ("src/foo.ts") used in DP01-DP15 above.
{
  const dir = freshDir("abs-exempt-default");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP16 allow  absolute exempt path (backslash, drive letter) under docs/", "Edit", join(dir, "docs", "state.md"), ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP17 absolute NON-exempt path inside root -> block ---------------------------------
{
  const dir = freshDir("abs-nonexempt");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP17 block  absolute non-exempt path inside root", "Edit", join(dir, "src", "foo.ts"), BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP18 absolute path OUTSIDE the project root -> allow (scope boundary) --------------
{
  const dir = freshDir("abs-outside-root");
  const outsideDir = freshDir("abs-outside-root-elsewhere"); // sibling temp dir, NOT projectDir
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP18 allow  absolute path outside the project root (sibling tree, same drive)", "Edit", join(outsideDir, "src", "foo.ts"), ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP19 absolute planPath -> allow -----------------------------------------------------
{
  const dir = freshDir("abs-planpath");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP19 allow  absolute path resolving to the activeFeature.planPath itself", "Edit", join(dir, PLAN_PATH), ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP20 manifest exemptPaths honored with absolute input -> allow ----------------------
{
  const dir = freshDir("abs-custom-exempt");
  writeManifest(dir, MANIFEST_CUSTOM_EXEMPT);
  writeState(dir, UNAPPROVED_STATE);
  check("DP20 allow  absolute path resolving under manifest exemptPaths (custom/)", "Edit", join(dir, "custom", "thing.ts"), ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
  // sanity: a DIFFERENT absolute non-exempt path in the same fixture still blocks.
  check("DP20b block  different absolute non-exempt path in same custom-exempt fixture still blocks", "Edit", join(dir, "src", "foo.ts"), BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP21 mixed-separator absolute variant (forward slashes appended to a Windows root) --
{
  const dir = freshDir("abs-mixed-separators");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  const mixed = `${dir.replace(/\\/g, "/")}/docs/state.md`; // e.g. "C:/Users/.../docs/state.md"
  check("DP21 allow  mixed-separator absolute exempt path", "Edit", mixed, ALLOW, { projectDir: dir, stderrEmpty: true });
  const mixedBlock = `${dir.replace(/\\/g, "/")}/src/foo.ts`;
  check("DP21b block  mixed-separator absolute non-exempt path still blocks", "Edit", mixedBlock, BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP22 relative traversal must NOT count as exempt (path.normalize hardening) ---------
// Plan `2026-07-07-retro-speed.md` G-B / re-critic nit: a relative `file_path` like
// `docs/../src/foo.ts` starts with the exempt prefix "docs/" as a raw string, but
// resolves to `src/foo.ts` once `..` is collapsed -- it must BLOCK, not exempt.
{
  const dir = freshDir("traversal-relative");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP22 block  relative traversal out of docs/ (docs/../src/foo.ts) is NOT exempt", "Edit", "docs/../src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
  // sanity: a traversal that resolves BACK under an exempt prefix stays exempt.
  check("DP22b allow  traversal that resolves back under docs/ (docs/../docs/state.md) stays exempt", "Edit", "docs/../docs/state.md", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP23 backslash relative traversal (Windows form) ------------------------------------
{
  const dir = freshDir("traversal-relative-backslash");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP23 block  backslash relative traversal out of docs\\ is NOT exempt", "Edit", "docs\\..\\src\\foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP24 absolute path containing a traversal segment inside the project root ----------
// `join()` itself would already collapse this in the fixture builder, so this case builds
// the absolute path by STRING CONCATENATION to actually exercise a `..` segment reaching
// guard-devplan.mjs's own `path.relative()` + `path.normalize()` handling end to end.
{
  const dir = freshDir("traversal-absolute");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  const traversalAbs = `${join(dir, "docs")}${sep}..${sep}src${sep}foo.ts`;
  check("DP24 block  absolute path with a traversal segment resolving outside docs/ is NOT exempt", "Edit", traversalAbs, BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- Cleanup --------------------------------------------------------------------------
for (const dir of ALL_DIRS) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}

// ---- Summary --------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
