// SPDX-License-Identifier: SUL-1.0
// AC-109 / G6: apply the inert proposal in an owned scratch copy, then exercise it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const proposal = join(repo, "specs/sprint-alfred-epic/evidence/verify-fixes/k152a-native-tools.diff");
const scratch = join(repo, "scratch", `k152a-proposal-check-${process.pid}`);
const plugin = join(scratch, "plugins/pipeline-core");
const fixture = join(scratch, "fixture");
const phase = process.env.K152A_PROPOSAL_PHASE ?? "green";
assert.ok(["red", "green", "integrated"].includes(phase), `unknown K152A proposal phase: ${phase}`);
const sourcePaths = [
  "plugins/pipeline-core/hooks.json",
  "plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs",
  "plugins/pipeline-core/lib/tool-write-target.mjs",
];

test.before(() => {
  assert.equal(existsSync(scratch), false, "owned scratch directory must be free");
  mkdirSync(dirname(plugin), { recursive: true });
  const init = spawnSync("git", ["init", "-q"], { cwd: scratch, encoding: "utf8", timeout: 10_000 });
  assert.equal(init.status, 0, init.stderr);
  cpSync(join(repo, "plugins/pipeline-core"), plugin, { recursive: true });
  mkdirSync(join(fixture, ".agent-pipeline"), { recursive: true });
  mkdirSync(join(fixture, ".claude"), { recursive: true });
  const fixtureInit = spawnSync("git", ["init", "-q"], { cwd: fixture, encoding: "utf8", timeout: 10_000 });
  assert.equal(fixtureInit.status, 0, fixtureInit.stderr);
  writeFileSync(join(fixture, ".claude/pipeline.json"), JSON.stringify({ project: "fixture", verify: "node verify.mjs" }));
  writeFileSync(join(fixture, ".claude/guard-config.json"), JSON.stringify({
    protectedTestPaths: [{ id: "TP-FIXTURE", pattern: "plugins/pipeline-core/hooks/hooks\\.json$", reason: "synthetic protected target" }],
  }));
  writeFileSync(join(fixture, ".agent-pipeline/onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-10-02T00:00:00.000Z",
  }));
  if (phase === "green") {
    const patch = readFileSync(proposal);
    const paths = [...patch.toString("utf8").matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map((m) => {
      assert.equal(m[1], m[2]);
      return m[1];
    });
    assert.deepEqual(paths.sort(), [...sourcePaths].sort(), "proposal touches exactly the declared source paths");
    const applied = spawnSync("git", ["apply", "--check", "-"], { cwd: scratch, input: patch, encoding: "utf8", timeout: 10_000 });
    assert.equal(applied.status, 0, applied.stderr);
    const result = spawnSync("git", ["apply", "-"], { cwd: scratch, input: patch, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    for (const path of sourcePaths) {
      const before = readFileSync(join(repo, path));
      const after = readFileSync(join(scratch, path));
      assert.notEqual(createHash("sha256").update(before).digest("hex"), createHash("sha256").update(after).digest("hex"));
    }
  } else if (phase === "integrated") {
    // Git's diff index records abbreviated blob IDs. Match each copied source
    // blob against the proposal's declared postimage ID, never against itself.
    const patch = readFileSync(proposal, "utf8");
    const declared = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)\nindex ([0-9a-f]{9,40})\.\.([0-9a-f]{9,40}) 100644$/gm)];
    assert.deepEqual(declared.map((m) => m[1]).sort(), [...sourcePaths].sort());
    for (const [, source, destination, , postimage] of declared) {
      assert.equal(source, destination);
      const result = spawnSync("git", ["hash-object", "--", join(scratch, source)], {
        cwd: scratch, encoding: "utf8", timeout: 10_000,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim().slice(0, postimage.length), postimage, `integrated blob differs from K152A postimage: ${source}`);
    }
  }
});
test.after(() => rmSync(scratch, { recursive: true, force: true }));

function fire(name, args) {
  const result = spawnSync(process.execPath, [join(plugin, "hooks/antigravity-pretool-guard.mjs")], {
    cwd: fixture,
    env: { ...process.env, CLAUDE_PROJECT_DIR: fixture },
    input: JSON.stringify({ workspacePaths: [fixture], toolCall: { name, args } }),
    encoding: "utf8", timeout: 15_000,
  });
  assert.ok(result.status === 0 || result.status === 2, `${name}: ${result.stderr}`);
  if (result.status === 2) return { decision: "deny", reason: result.stderr };
  return JSON.parse(result.stdout.trim());
}

test("native write and edit normalize to IDE-equivalent canonical guards and targets", async () => {
  const { normalizeAntigravityToolInput } = await import(pathToFileURL(join(plugin, "hooks/antigravity-pretool-guard.mjs")));
  const { writeTargetPath } = await import(pathToFileURL(join(plugin, "lib/tool-write-target.mjs")));
  const target = join(fixture, "plugins/pipeline-core/hooks/hooks.json");
  const pairs = [
    [{ name: "write_file", args: { Path: target, Content: "x" } }, { name: "write_to_file", args: { TargetFile: target, CodeContent: "x" } }, "Write"],
    [{ name: "edit_file", args: { Path: target, Target: "x", Replacement: "y" } }, { name: "replace_file_content", args: { TargetFile: target, TargetContent: "x", ReplacementContent: "y" } }, "Edit"],
  ];
  for (const [native, ide, canonical] of pairs) {
    const n = normalizeAntigravityToolInput({ toolCall: native });
    const i = normalizeAntigravityToolInput({ toolCall: ide });
    assert.equal(n.toolName, canonical);
    assert.deepEqual(n.toolInput, i.toolInput);
    assert.equal(n.filePath, target);
    assert.equal(n.isReadOnly, false);
    assert.equal(writeTargetPath(native.args, native.name), target);
    const nativeVerdict = fire(native.name, native.args);
    const ideVerdict = fire(ide.name, ide.args);
    assert.equal(nativeVerdict.decision, "deny");
    assert.deepEqual(nativeVerdict, ideVerdict, "native and IDE calls must reach the same refusal");
    assert.match(nativeVerdict.reason, /guard-lifecycle-ready|guard-testpath/i);
    const protectedVerdict = spawnSync(process.execPath, [join(plugin, "hooks/guard-testpath.mjs")], {
      cwd: fixture,
      env: { ...process.env, CLAUDE_PROJECT_DIR: fixture },
      input: JSON.stringify({ tool_name: canonical, tool_input: n.toolInput }),
      encoding: "utf8", timeout: 15_000,
    });
    assert.equal(protectedVerdict.status, 2, protectedVerdict.stderr);
    assert.match(protectedVerdict.stderr, /guard-testpath|protected/i);
  }
});

test("native read follows IDE passive-read target checks, including unsafe and missing targets", async () => {
  const { normalizeAntigravityToolInput, nativeReadTargets } = await import(pathToFileURL(join(plugin, "hooks/antigravity-pretool-guard.mjs")));
  const safe = join(fixture, "input.txt");
  writeFileSync(safe, "fixture\n");
  const native = normalizeAntigravityToolInput({ toolCall: { name: "read_file", args: { Path: safe } } });
  assert.equal(native.isReadOnly, true);
  assert.deepEqual(nativeReadTargets(native.toolName, native.toolInput), [{ kind: "file", value: safe }]);
  const nativeSafe = fire("read_file", { Path: safe });
  const ideSafe = fire("view_file", { AbsolutePath: safe });
  assert.equal(nativeSafe.decision, "allow", "a safe native read must actually be admitted");
  assert.equal(nativeSafe.decision, ideSafe.decision);
  const unsafe = join(fixture, ".aws/credentials");
  for (const call of [["read_file", { Path: unsafe }], ["view_file", { AbsolutePath: unsafe }], ["read_file", {}]]) {
    const verdict = fire(...call);
    assert.equal(verdict.decision, "deny");
    assert.match(verdict.reason, /GUARD-READ|read.target|credential/i);
  }
});

test("matcher covers native names and retains IDE names", () => {
  const config = JSON.parse(readFileSync(join(plugin, "hooks.json"), "utf8"));
  const matchers = config["pipeline-core"].PreToolUse.map((entry) => entry.matcher);
  for (const name of ["write_file", "edit_file", "read_file", "write_to_file", "replace_file_content", "run_command", "invoke_subagent"]) {
    assert.ok(matchers.some((matcher) => new RegExp(`^(?:${matcher})$`).test(name)), `matcher misses ${name}`);
  }
});
