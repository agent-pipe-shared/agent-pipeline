#!/usr/bin/env node
/**
 * guard-push.test.mjs — test suite for the Push-Gate PreToolUse guard.
 *
 * AP1-P3 "DURIN". Run: node plugins/pipeline-core/hooks/guard-push.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Hermetics: every spawn sets CLAUDE_PROJECT_DIR (and cwd) to a fresh temp dir with its
 * own `git init` + commit, so this machine's real .claude/pipeline.yaml / pipeline-
 * state.json / evidence files can never leak into these cases, and HEAD-dependent
 * cases have a real, deterministic commit sha to compare against.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));

const ALL_DIRS = [];

/** Fresh temp dir with a real git repo (one commit) so `git rev-parse HEAD` resolves. */
function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-${prefix}-`));
  ALL_DIRS.push(dir);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();
  return { dir, head };
}

function writeManifest(dir, yamlText) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), yamlText);
}
function writeState(dir, obj) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), typeof obj === "string" ? obj : JSON.stringify(obj));
}
function writeEvidence(dir, relPath, obj) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, typeof obj === "string" ? obj : JSON.stringify(obj));
}

function runGuard(command, dir) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
function check(id, command, dir, expectExit, { stderrIncludes, stderrEmpty } = {}) {
  const { code, stderr } = runGuard(command, dir);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 300)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 300)}`);
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
const BLOCK = 2,
  ALLOW = 0,
  WARN = 1;

const PUSH_CMD = "git push origin main";

function manifestPush({ mode = "blocking", approval = "required", security = null }) {
  let y = `schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: ${mode}\n    type: human\n    approval: ${approval}\n`;
  if (security) y += `  security:\n    mode: ${security}\n    type: automated\n`;
  return y;
}

// ---- PG01 no manifest -> allow --------------------------------------------------------
{
  const { dir } = freshRepo("no-manifest");
  check("PG01 allow  no manifest at all", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG02 non-push command -> allow fast (even with a strict manifest present) --------
{
  const { dir } = freshRepo("non-push");
  writeManifest(dir, manifestPush({ approval: "required" }));
  check("PG02 allow  non-push command -> fast path", "git status", dir, ALLOW, { stderrEmpty: true });
}

// ---- PG03 gate mode off -> allow -------------------------------------------------------
{
  const { dir } = freshRepo("mode-off");
  writeManifest(dir, manifestPush({ mode: "off" }));
  check("PG03 allow  push gate mode off", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG04 blocking + missing verify evidence -> exit 2 ---------------------------------
{
  const { dir } = freshRepo("missing-evidence");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  check("PG04 block  blocking + missing verify evidence", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["evidence/verify-latest.json missing"],
  });
}

// ---- PG05 blocking + stale commit -> exit 2 --------------------------------------------
{
  const { dir, head } = freshRepo("stale-commit");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: "0000000000000000000000000000000000000000" });
  check("PG05 block  blocking + stale commit in verify evidence", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["is stale"],
  });
  void head;
}

// ---- PG06 blocking + red exitCode -> exit 2 --------------------------------------------
{
  const { dir, head } = freshRepo("red-exit");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 1, commit: head });
  check("PG06 block  blocking + red exitCode in verify evidence", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["exitCode=1"],
  });
}

// ---- PG07 warn + missing evidence -> exit 1 --------------------------------------------
{
  const { dir } = freshRepo("warn-missing");
  writeManifest(dir, manifestPush({ mode: "warn", approval: "standing-approved" }));
  check("PG07 warn  warn mode + missing verify evidence -> exit 1", PUSH_CMD, dir, WARN, {
    stderrIncludes: ["evidence/verify-latest.json missing"],
  });
}

// ---- PG08 security check enforced when security mode blocking -------------------------
{
  const { dir, head } = freshRepo("security-enforced");
  writeManifest(dir, manifestPush({ approval: "standing-approved", security: "blocking" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  // security-latest.json intentionally absent -> must be reported as a failure.
  check("PG08 block  security evidence enforced when gates.security mode=blocking", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["evidence/security-latest.json missing"],
  });
}

// ---- PG09 security check skipped when security mode off -------------------------------
{
  const { dir, head } = freshRepo("security-skipped");
  writeManifest(dir, manifestPush({ approval: "standing-approved", security: "off" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  // security-latest.json absent, but security gate is off -> must NOT be reported, all-green.
  check("PG09 allow  security evidence skipped when gates.security mode=off", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG10 standing-approved passes without any state file ------------------------------
{
  const { dir, head } = freshRepo("standing-approved");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  check("PG10 allow  standing-approved passes without any state file", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG11a required + absent approval (no state file at all) -> exit 2 -----------------
{
  const { dir, head } = freshRepo("required-absent");
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  check("PG11a block  required approval, no state file at all", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["Push approval missing"],
  });
}

// ---- PG11b required + stale approval (state present, wrong commit) -> exit 2 -----------
{
  const { dir, head } = freshRepo("required-stale");
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  writeState(dir, {
    schema: "pipeline.state.v0",
    pushApproval: { lastApproved: { approvedBy: "po-test", approvedAt: "2020-01-01T00:00:00.000Z", forCommit: "deadbeef" } },
  });
  check("PG11b block  required approval, state present but stale forCommit", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["Push approval missing or stale"],
  });
}

// ---- PG12 required + fresh approval -> allow -------------------------------------------
{
  const { dir, head } = freshRepo("required-fresh");
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  writeState(dir, {
    schema: "pipeline.state.v0",
    pushApproval: { lastApproved: { approvedBy: "po-test", approvedAt: "2026-07-07T20:00:00.000Z", forCommit: head } },
  });
  check("PG12 allow  required approval, fresh forCommit matches HEAD", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG13 all-green (standing-approved + verify + security both fresh) -> allow --------
{
  const { dir, head } = freshRepo("all-green");
  writeManifest(dir, manifestPush({ approval: "standing-approved", security: "blocking" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  writeEvidence(dir, "evidence/security-latest.json", { exitCode: 0, commit: head });
  check("PG13 allow  all-green (verify + security fresh, standing-approved)", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG14 malformed manifest -> exit 1 warn --------------------------------------------
{
  const { dir } = freshRepo("malformed-manifest");
  writeManifest(dir, "schema: pipeline.manifest.v0\ngates:\n  push: &anchor\n    mode: blocking\n");
  check("PG14 warn  malformed manifest YAML -> exit 1 warn, not block", PUSH_CMD, dir, WARN, {
    stderrIncludes: ["WARN"],
  });
}

// ---- PG15 push inside second segment -> detected ---------------------------------------
{
  const { dir } = freshRepo("second-segment");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  check("PG15 block  push detected inside second segment (git add . && git push)", "git add . && git push", dir, BLOCK, {
    stderrIncludes: ["evidence/verify-latest.json missing"],
  });
}

// ---- PG16 quoted prose mentioning push -> NOT detected ---------------------------------
{
  const { dir } = freshRepo("quoted-prose");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  check(
    "PG16 allow  quoted prose mentioning push is NOT detected as a push command",
    'git commit -m "remember to git push later"',
    dir,
    ALLOW,
    { stderrEmpty: true },
  );
}

// ---- Cleanup ----------------------------------------------------------------------------
for (const dir of ALL_DIRS) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}

// ---- Summary ------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
