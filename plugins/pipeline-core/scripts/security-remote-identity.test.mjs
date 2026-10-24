import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import nodeTest from "node:test";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { runSecurityScan } from "./security-scan.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";

const scratch = join(process.cwd(), "scratch", "g32-security-remote-fixtures");
mkdirSync(scratch, { recursive: true });
const fixture = mkdtempSync(join(scratch, "repo-"));
nodeTest.after(() => rmSync(fixture, { recursive: true, force: true }));
const cases = [];
function test(name, run) { cases.push({ id: `SRI${String(cases.length + 1).padStart(3, "0")}`, name, run }); }

function git(...args) {
  const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, `fixture git ${args[0]} failed`);
}
function digest(url) { return createHash("sha256").update(url).digest("hex"); }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
async function scan(remoteName) {
  const { evidence } = await runSecurityScan({ rootDir: fixture, remoteName, env: {}, scanMode: "snapshot" });
  return evidence.candidate;
}

test("security evidence follows one effective push destination across a remote rename", async () => {
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(fixture, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-qm", "fixture");
  const fetch = "https://example.invalid/fetch.git";
  const push = "https://example.invalid/push.git";
  git("remote", "add", "delivery", fetch);
  git("remote", "set-url", "--push", "delivery", push);
  const initial = await scan();
  assert.deepEqual([initial.status, initial.repositorySha256], ["clean", digest(push)]);
  git("remote", "rename", "delivery", "release");
  const renamed = await scan();
  assert.deepEqual([renamed.status, renamed.repositorySha256], ["clean", digest(push)]);
  git("remote", "set-url", "--push", "release", "https://example.invalid/other.git");
  assert.equal((await scan()).repositorySha256, digest("https://example.invalid/other.git"));
  git("remote", "remove", "release");
  assert.notEqual((await scan()).status, "clean");
  git("remote", "add", "first", "https://example.invalid/one.git");
  git("remote", "add", "second", "https://example.invalid/two.git");
  assert.notEqual((await scan()).status, "clean");
  const selected = await scan("second");
  assert.equal(selected.status, "clean");
  assert.equal(selected.repositorySha256, digest("https://example.invalid/two.git"));
  git("remote", "set-url", "--push", "second", "https://example.invalid/two-push.git");
  git("remote", "set-url", "--add", "--push", "second", "https://example.invalid/three-push.git");
  assert.notEqual((await scan("second")).status, "clean");
});

test("push guard rejects evidence for a different effective destination", () => {
  const dir = mkdtempSync(join(scratch, "guard-"));
  try {
    const at = (...args) => {
      const result = spawnSync("git", args, { cwd: dir, encoding: "utf8", shell: false });
      assert.equal(result.status, 0, `fixture git ${args[0]} failed`);
      return result.stdout.trim();
    };
    at("init", "-q", "-b", "main");
    at("config", "user.name", "Fixture");
    at("config", "user.email", "fixture@example.invalid");
    writeFileSync(join(dir, "README.md"), "fixture\n");
    at("add", "README.md");
    at("commit", "-qm", "fixture");
    const controller = createGovernanceScopeController({ hostStateRoot: join(dir, ".git", "fixture-hoststate") });
    const plan = controller.planDecision({ rootDir: dir, decision: "enroll", by: "fixture" });
    assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
    at("remote", "add", "delivery", "https://example.invalid/right.git");
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n  security:\n    mode: blocking\n    type: automated\n");
    const head = at("rev-parse", "HEAD"), tree = at("rev-parse", "HEAD^{tree}");
    mkdirSync(join(dir, "evidence"));
    const guardPath = join(process.cwd(), "plugins", "pipeline-core", "hooks", "guard-push.mjs");
    function check(repositorySha256) {
      const payload = {
        schema: "pipeline.security-evidence.v1", exitCode: 0, commit: head,
        candidate: { status: "clean", commit: head, tree, inputSha256: "a".repeat(64), repositorySha256,
          inventory: { entries: 1, symlinkPolicy: "reject", submodulePolicy: "reject" },
          snapshot: { method: "git-detached-worktree.v1", verifiedBeforeAfter: true } },
        policy: { configurationSha256: "c".repeat(64), sha256: "d".repeat(64) },
      };
      writeFileSync(join(dir, "evidence", "security-latest.json"), JSON.stringify({ ...payload, payloadSha256: digest(canonicalJson(payload)) }));
      return spawnSync(process.execPath, [guardPath], {
        cwd: dir, encoding: "utf8", shell: false,
        input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push delivery main:refs/heads/test" } }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, timeout: 10000,
      });
    }
    const wrong = check(digest("https://example.invalid/wrong.git"));
    assert.equal(wrong.status, 2);
    assert.match(wrong.stderr, /candidate repository identity does not match the effective push destination/);
    assert.doesNotMatch(wrong.stderr, /wrong\.git|right\.git/);
    const right = check(digest("https://example.invalid/right.git"));
    assert.doesNotMatch(right.stderr, /candidate repository identity does not match the effective push destination/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

if (cases.length !== 2) throw new Error("security remote identity case count drift");
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"), maxBytes: 65536 });
