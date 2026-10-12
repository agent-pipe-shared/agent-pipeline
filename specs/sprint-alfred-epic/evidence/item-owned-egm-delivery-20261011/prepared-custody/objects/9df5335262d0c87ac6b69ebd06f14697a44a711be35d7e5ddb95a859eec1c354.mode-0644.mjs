import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const runtime = join(here, "runtime", "plugins", "pipeline-core");
const scratch = resolve("scratch/alfred-postinstall-whole-items-20261011/bounded-denial-help-whole-item");
const repo = resolve(".");
const digest = "a".repeat(64);

const { readHumanGuardOverrideRequestForHelp, recordHumanGuardDenial } = await import(join(runtime, "lib/human-guard-override.mjs"));
const { humanOverrideRoute } = await import(join(runtime, "lib/guard/denial-route.mjs"));
const { evaluateLifecycleReadyGuard } = await import(join(runtime, "lib/guard/evaluate.mjs"));
const { sanctionedHumanOverrideArgs } = await import(join(runtime, "lib/guard/sanctioned-args-scripts.mjs"));
const { main } = await import(join(runtime, "scripts/guard-human-override.mjs"));
const { placeholder, renderHumanCopySafeCommand } = await import(join(runtime, "lib/copy-safe-command.mjs"));

function fixtureRepo() {
  const path = mkdtempSync(join(scratch, "fixture-repo-"));
  execFileSync("git", ["init", "--quiet", "--template="], {
    cwd: path,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/u.test(key))),
  });
  return path;
}

function producedRefusal(path, { nowMs = Date.now(), ttlMs = undefined } = {}) {
  const result = recordHumanGuardDenial({
    rootDir: path,
    pluginRoot: join(repo, "plugins/pipeline-core"),
    toolName: "Bash",
    toolInput: { command: "rg -n marker . | tee output.txt" },
    denials: [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-OPERATOR-UNAPPROVED: owned fixture command" }],
    nowMs,
    ...(ttlMs === undefined ? {} : { ttlMs }),
  });
  assert.equal(result.status, "planned", `Source request producer did not plan: ${JSON.stringify(result)}`);
  return result;
}

function hgoNamespaceSnapshot(root) {
  const namespace = join(root, ".git", "agent-pipeline", "human-guard-overrides");
  const entries = [];
  function visit(path, relativePath) {
    for (const name of readdirSync(path).sort()) {
      const child = join(path, name);
      const rel = relativePath === "" ? name : `${relativePath}/${name}`;
      const info = lstatSync(child);
      const row = {
        path: rel,
        mode: info.mode & 0o777,
        nlink: info.nlink,
        size: info.size,
        mtimeMs: info.mtimeMs,
        ino: info.ino,
        type: info.isDirectory() ? "directory" : info.isFile() ? "file" : "other",
      };
      if (info.isDirectory()) visit(child, rel);
      else if (info.isFile() && !/key/iu.test(name)) {
        row.sha256 = createHash("sha256").update(readFileSync(child)).digest("hex");
      }
      entries.push(row);
    }
  }
  visit(namespace, "");
  return entries;
}

test("HGO-LOOKUP-01 invalid digest is a typed refusal before filesystem access", () => {
  assert.throws(
    () => readHumanGuardOverrideRequestForHelp({ rootDir: scratch, requestSha256: "bad" }),
    (error) => error.code === "HGO-DIGEST",
  );
});

test("HGO-LOOKUP-02 absent request is typed and creates no HGO namespace", () => {
  const path = fixtureRepo();
  try {
    const result = readHumanGuardOverrideRequestForHelp({ rootDir: path, requestSha256: digest });
    assert.fail(`unexpected result: ${JSON.stringify(result)}`);
  } catch (error) {
    assert.equal(error.code, "HGO-REQUEST-ABSENT");
    assert.equal(existsSync(join(path, ".git", "agent-pipeline")), false);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("HGO-LOOKUP-03 help CLI refuses unknown digest without mutation or path disclosure", () => {
  const path = fixtureRepo();
  const out = [];
  const errors = [];
  try {
    const code = main(["help", "--repo", path, "--request-sha256", digest], {
      write: (value) => out.push(value),
      writeError: (value) => errors.push(value),
    });
    assert.equal(code, 2);
    assert.match(errors.join(""), /^HGO-REQUEST-ABSENT:/u);
    assert.equal(out.join(""), "");
    assert.doesNotMatch(errors.join(""), new RegExp(path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.equal(existsSync(join(path, ".git", "agent-pipeline")), false);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("HGO-LOOKUP-04 refusal exposes only bounded exact digest help action", () => {
  const result = humanOverrideRoute(
    "GUARD-OPERATOR-UNAPPROVED",
    "operator command refused",
    "command",
    repo,
    "Bash",
    { command: "rg -n marker . | tee out.txt" },
    {
      consumeHumanGuardOverrideFn: () => ({ status: "absent" }),
      recordHumanGuardDenialFn: () => ({ status: "planned", requestSha256: digest }),
    },
  );
  assert.equal(result.admitted, null);
  assert.match(result.overrideGuidance, /Human override help for this exact command/u);
  const script = join(repo, "plugins/pipeline-core/scripts/guard-human-override.mjs");
  const exactHelpCommand = renderHumanCopySafeCommand({
    label: "human-override-help",
    executable: process.execPath,
    argv: [placeholder(JSON.stringify(script)), "help", "--repo", placeholder(JSON.stringify(repo)),
      "--request-sha256", digest],
    platform: "posix",
  }).text;
  assert.ok(result.overrideGuidance.includes(`Read-only instructions: ${exactHelpCommand}`));
  assert.match(result.repeatOverrideGuidance, /--request-sha256/u);
  assert.doesNotMatch(result.overrideGuidance, /prepare-for-signature|authorize-by-signature|human-held Ed25519/u);
  assert.ok(Buffer.byteLength(result.overrideGuidance, "utf8") <= 1024);
});

test("OUT-01 Source denial bytes are stable across three runner-labelled fixtures", () => {
  // Labels are fixture dimensions only; this measures the shared Source renderer,
  // not any host-native runner observation or model identity.
  const observations = ["claude", "codex", "antigravity"].map((runnerFixture) => {
    const result = humanOverrideRoute(
      "GUARD-OPERATOR-UNAPPROVED",
      "operator command refused",
      "command",
      repo,
      "Bash",
      { command: "rg -n marker . | tee out.txt" },
      {
        consumeHumanGuardOverrideFn: () => ({ status: "absent" }),
        recordHumanGuardDenialFn: () => ({ status: "planned", requestSha256: digest }),
      },
    );
    return {
      runnerFixture,
      bytes: Buffer.byteLength(result.overrideGuidance, "utf8"),
      guidance: result.overrideGuidance,
    };
  });
  assert.deepEqual(observations.map(({ bytes }) => bytes), [observations[0].bytes, observations[0].bytes, observations[0].bytes]);
  for (const { bytes, guidance } of observations) {
    assert.ok(bytes <= 1024);
    assert.match(guidance, /Human override help for this exact command/u);
    assert.match(guidance, /--request-sha256/u);
  }
});

test("HGO-LOOKUP-05 only exact digest help argv is sanctioned", () => {
  const exact = ["help", "--repo", repo, "--request-sha256", digest];
  assert.equal(sanctionedHumanOverrideArgs(exact, repo), true);
  assert.equal(sanctionedHumanOverrideArgs([...exact, "--activate"], repo), false);
  assert.equal(sanctionedHumanOverrideArgs(["help", "--repo", repo, "--request-sha256", "bad"], repo), false);
});

test("LOOKUP-05 valid digest comes from the canonical Source refusal producer", () => {
  const path = fixtureRepo();
  try {
    const recorded = producedRefusal(path);
    const result = readHumanGuardOverrideRequestForHelp({ rootDir: path, requestSha256: recorded.requestSha256 });
    assert.deepEqual(Object.keys(result).sort(), ["commandClass", "mode", "requestSha256", "schema", "status", "toolName"].sort());
    assert.equal(result.schema, "pipeline.hgo-denial-help-request.v1");
    assert.equal(result.status, "available");
    assert.equal(result.requestSha256, recorded.requestSha256);
    assert.equal(result.mode, "standard");
    assert.equal(result.toolName, "Bash");
    assert.doesNotHaveProperty(result, "toolInput");
    assert.doesNotHaveProperty(result, "denials");
    assert.doesNotHaveProperty(result, "root");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("LOOKUP-06 CLI help returns exact bounded action and leaves HGO namespace unchanged", () => {
  const path = fixtureRepo();
  try {
    const recorded = producedRefusal(path);
    const before = hgoNamespaceSnapshot(path);
    const out = [];
    const errors = [];
    const code = main(["help", "--repo", path, "--request-sha256", recorded.requestSha256], {
      write: (value) => out.push(value),
      writeError: (value) => errors.push(value),
    });
    assert.equal(code, 0, errors.join(""));
    assert.equal(errors.join(""), "");
    const response = JSON.parse(out.join(""));
    assert.equal(response.schema, "pipeline.hgo-denial-help.v1");
    assert.equal(response.status, "available");
    assert.equal(response.requestSha256, recorded.requestSha256);
    assert.equal(response.nextAction.executable, process.execPath);
    assert.deepEqual(response.nextAction.argv, [
      join(runtime, "scripts/guard-human-override.mjs"), "plan", "--repo", path,
      "--request-sha256", recorded.requestSha256,
    ]);
    const exact = renderHumanCopySafeCommand({
      label: "plan",
      executable: process.execPath,
      argv: [placeholder(JSON.stringify(join(runtime, "scripts/guard-human-override.mjs"))), "plan",
        "--repo", placeholder(JSON.stringify(path)), "--request-sha256", recorded.requestSha256],
      platform: process.platform === "win32" ? "powershell" : "posix",
    }).text;
    assert.equal(response.nextAction.copyCommand, exact);
    assert.equal(response.nextAction.mutation, true);
    assert.ok(Buffer.byteLength(out.join(""), "utf8") <= 4096);
    assert.doesNotMatch(out.join(""), /human-guard-overrides|audit\.key|toolInput|owned fixture command/u);
    assert.deepEqual(hgoNamespaceSnapshot(path), before);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("LOOKUP-07 changed request bytes under the original digest are refused", () => {
  const path = fixtureRepo();
  try {
    const recorded = producedRefusal(path);
    const requestFile = join(path, ".git", "agent-pipeline", "human-guard-overrides", "requests", `${recorded.requestSha256}.json`);
    const value = JSON.parse(readFileSync(requestFile, "utf8"));
    value.toolName = "Write";
    writeFileSync(requestFile, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    assert.throws(
      () => readHumanGuardOverrideRequestForHelp({ rootDir: path, requestSha256: recorded.requestSha256 }),
      (error) => error.code === "HGO-REQUEST",
    );
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("LOOKUP-08 expired request uses canonical HGO expiry refusal", () => {
  const path = fixtureRepo();
  const createdAt = Date.now() - 5000;
  try {
    const recorded = producedRefusal(path, { nowMs: createdAt, ttlMs: 1000 });
    assert.throws(
      () => readHumanGuardOverrideRequestForHelp({ rootDir: path, requestSha256: recorded.requestSha256, nowMs: Date.now() }),
      (error) => error.code === "HGO-EXPIRED",
    );
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("LOOKUP-09 supported Source evaluator retains refusal and exposes digest help", () => {
  const path = fixtureRepo();
  try {
    const result = evaluateLifecycleReadyGuard(
      { tool_name: "Bash", tool_input: { command: "rg -n marker . | tee output.txt" } },
      {
        projectDir: path,
        observeGovernanceScopeFn: () => ({ requiresEnforcement: true }),
      },
    );
    assert.equal(result.exitCode, 2, result.stderr);
    assert.match(result.stderr, /GUARD-OPERATOR-UNAPPROVED/u);
    assert.match(result.stderr, /Human override help for this exact command/u);
    assert.match(result.stderr, /--request-sha256/u);
    assert.doesNotMatch(result.stderr, /human-guard-overrides|audit\.key/u);
    assert.ok(Buffer.byteLength(result.stderr, "utf8") <= 2048);
  } finally { rmSync(path, { recursive: true, force: true }); }
});
