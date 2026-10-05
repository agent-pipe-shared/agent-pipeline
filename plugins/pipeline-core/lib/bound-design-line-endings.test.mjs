// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { openSync } from "node:fs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { applyBoundDesignLineEndings, planBoundDesignLineEndings } from "./bound-design-line-endings.mjs";

const cases = [];
const fixtureRoots = [];
function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "bound-design-line-endings-"));
  fixtureRoots.push(root);
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "Disposable Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "core.autocrlf", "true"]);
  git(root, ["config", "fixture.preserve", "untouched"]);
  writeFileSync(join(root, ".gitattributes"), "*.md text eol=lf\n");
  writeFileSync(join(root, "signed-design.md"), "# Signed design\n\nCanonical LF bytes.\n");
  git(root, ["add", ".gitattributes", "signed-design.md"]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  return root;
}
function add(id, name, run) { cases.push({ id, name, run }); }

add("BDL001", "plans only for the exact repository root and observed LF-compatible attributes", async () => {
  const root = fixture();
  const original = process.env.GIT_DIR;
  process.env.GIT_DIR = join(root, "nonexistent-git-dir");
  try {
    const plan = planBoundDesignLineEndings({ projectDir: root, filePaths: ["signed-design.md"] });
    assert.equal(plan.ok, true, plan.code);
    assert.equal(plan.root, root);
    assert.equal(plan.configBefore.value, "true");
    assert.deepEqual(plan.attributes["signed-design.md"], { text: "set", eol: "lf" });
    const nested = join(root, "nested");
    mkdirSync(nested);
    const wrongRoot = planBoundDesignLineEndings({ projectDir: nested, filePaths: ["signed-design.md"] });
    assert.equal(wrongRoot.code, "LINE-ENDINGS-ROOT-MISMATCH");
  } finally {
    if (original === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = original;
  }
});

add("BDL002", "applies only local autocrlf=false and preserves the signed LF checkout bytes", async () => {
  const root = fixture();
  const expected = readFileSync(join(root, "signed-design.md"));
  const expectedSha = createHash("sha256").update(expected).digest("hex");
  const plan = planBoundDesignLineEndings({ projectDir: root, filePaths: ["signed-design.md"] });
  assert.equal(plan.ok, true, plan.code);
  const applied = applyBoundDesignLineEndings(plan);
  assert.equal(applied.ok, true, applied.code);
  assert.deepEqual(applied.rollbackPreimage, { present: true, value: "true" });
  assert.equal(git(root, ["config", "--local", "--get", "core.autocrlf"]), "false");
  assert.equal(git(root, ["config", "--local", "--get", "fixture.preserve"]), "untouched");
  unlinkSync(join(root, "signed-design.md"));
  git(root, ["checkout", "HEAD", "--", "signed-design.md"]);
  const checkedOut = readFileSync(join(root, "signed-design.md"));
  assert.equal(createHash("sha256").update(checkedOut).digest("hex"), expectedSha);
  assert.equal(checkedOut.includes(Buffer.from("\r\n")), false);
});

add("BDL003", "refuses an effective filter before changing repository configuration", async () => {
  const root = fixture();
  writeFileSync(join(root, ".gitattributes"), "*.md text eol=lf filter=hostile\n");
  const plan = planBoundDesignLineEndings({ projectDir: root, filePaths: ["signed-design.md"] });
  assert.equal(plan.ok, false);
  assert.equal(plan.code, "LINE-ENDINGS-TRANSFORM-UNSUPPORTED");
  assert.equal(plan.attribute, "filter");
  assert.equal(git(root, ["config", "--local", "--get", "core.autocrlf"]), "true");
});

add("BDL004", "rejects a stale plan and retains the changed configuration preimage", async () => {
  const root = fixture();
  const plan = planBoundDesignLineEndings({ projectDir: root, filePaths: ["signed-design.md"] });
  assert.equal(plan.ok, true, plan.code);
  git(root, ["config", "--local", "core.autocrlf", "input"]);
  const applied = applyBoundDesignLineEndings(plan);
  assert.deepEqual(applied, { ok: false, code: "LINE-ENDINGS-PLAN-STALE" });
  assert.equal(git(root, ["config", "--local", "--get", "core.autocrlf"]), "input");
});

assert.equal(cases.length, 4, "all line-ending planner/apply regressions must be declared before execution");
const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases,
  fd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});

process.on("exit", () => {
  for (const root of fixtureRoots) {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* retain any unremovable fixture rather than walking elsewhere */ }
  }
});
