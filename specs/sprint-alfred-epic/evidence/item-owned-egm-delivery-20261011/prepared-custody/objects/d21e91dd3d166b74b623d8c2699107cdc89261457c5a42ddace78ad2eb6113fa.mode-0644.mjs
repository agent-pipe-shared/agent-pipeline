import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const repo = resolve(".");
const scratch = resolve("scratch/alfred-postinstall-whole-items-20261011/bounded-denial-help-whole-item");
const pluginRoot = join(repo, "plugins/pipeline-core");
const runtime = join(scratch, "runtime/plugins/pipeline-core");
const { recordHumanGuardDenial } = await import(join(pluginRoot, "lib/human-guard-override.mjs"));
const { readHumanGuardOverrideRequestForHelp } = await import(join(runtime, "lib/human-guard-override.mjs"));
const { humanOverrideRoute } = await import(join(runtime, "lib/guard/denial-route.mjs"));
const { evaluateLifecycleReadyGuard } = await import(join(pluginRoot, "lib/guard/evaluate.mjs"));
const { main } = await import(join(runtime, "scripts/guard-human-override.mjs"));
const { placeholder, renderHumanCopySafeCommand } = await import(join(pluginRoot, "lib/copy-safe-command.mjs"));

function fixtureRepo() {
  const path = mkdtempSync(join(scratch, "valid-request-fixture-"));
  execFileSync("git", ["init", "--quiet", "--template="], {
    cwd: path,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/u.test(key))),
  });
  return path;
}

function sourceRefusal(path, { nowMs = Date.now(), ttlMs = undefined } = {}) {
  return recordHumanGuardDenial({
    rootDir: path,
    pluginRoot,
    toolName: "Bash",
    toolInput: { command: "rg -n marker . | tee output.txt" },
    denials: [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-OPERATOR-UNAPPROVED: owned fixture command" }],
    nowMs,
    ...(ttlMs === undefined ? {} : { ttlMs }),
  });
}

function requestDigestInFixture(path) {
  const directory = join(path, ".git/agent-pipeline/human-guard-overrides/requests");
  const names = readdirSync(directory).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name));
  assert.equal(names.length, 1, "fixture must contain exactly the request created by the Source producer");
  return names[0].slice(0, -5);
}

function namespaceSnapshot(root) {
  const namespace = join(root, ".git/agent-pipeline/human-guard-overrides");
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

test("LOOKUP-05 valid digest is produced by Main Source and exposes only an allowlisted view", () => {
  const path = fixtureRepo();
  try {
    const produced = sourceRefusal(path);
    assert.equal(produced.status, "planned");
    const digest = requestDigestInFixture(path);
    assert.equal(produced.requestSha256, digest);
    const request = readHumanGuardOverrideRequestForHelp({ rootDir: path, requestSha256: digest });
    assert.deepEqual(Object.keys(request).sort(), ["commandClass", "mode", "requestSha256", "schema", "status", "toolName"].sort());
    assert.equal(request.schema, "pipeline.hgo-denial-help-request.v1");
    assert.equal(request.status, "available");
    assert.equal(request.mode, "standard");
    assert.equal(request.toolName, "Bash");
    assert.equal(Object.hasOwn(request, "toolInput"), false);
    assert.equal(Object.hasOwn(request, "denials"), false);
    assert.equal(Object.hasOwn(request, "root"), false);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("LOOKUP-06 CLI help returns exact bounded action and leaves the namespace unchanged", (t) => {
  const path = fixtureRepo();
  try {
    const produced = sourceRefusal(path);
    assert.equal(produced.status, "planned");
    const digest = requestDigestInFixture(path);
    const before = namespaceSnapshot(path);
    const out = [];
    const errors = [];
    const code = main(["help", "--repo", path, "--request-sha256", digest], {
      write: (value) => out.push(value),
      writeError: (value) => errors.push(value),
    });
    assert.equal(code, 0, errors.join(""));
    assert.equal(errors.join(""), "");
    const response = JSON.parse(out.join(""));
    const script = join(runtime, "scripts/guard-human-override.mjs");
    assert.equal(response.schema, "pipeline.hgo-denial-help.v1");
    assert.equal(response.status, "available");
    assert.equal(response.requestSha256, digest);
    assert.equal(response.nextAction.executable, process.execPath);
    assert.deepEqual(response.nextAction.argv, [script, "plan", "--repo", path, "--request-sha256", digest]);
    const exactCopy = renderHumanCopySafeCommand({
      label: "plan",
      executable: process.execPath,
      argv: [placeholder(JSON.stringify(script)), "plan", "--repo", placeholder(JSON.stringify(path)), "--request-sha256", digest],
      platform: process.platform === "win32" ? "powershell" : "posix",
    }).text;
    assert.equal(response.nextAction.copyCommand, exactCopy);
    assert.equal(response.nextAction.mutation, true);
    assert.ok(Buffer.byteLength(out.join(""), "utf8") <= 4096);
    assert.doesNotMatch(out.join(""), /human-guard-overrides|audit\.key|toolInput|owned fixture command/u);
    assert.deepEqual(namespaceSnapshot(path), before);
    t.diagnostic(`help JSON bytes=${Buffer.byteLength(out.join(""), "utf8")}; namespace entries and non-key bytes unchanged`);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("LOOKUP-07 altered request bytes under original digest are refused", () => {
  const path = fixtureRepo();
  try {
    const produced = sourceRefusal(path);
    assert.equal(produced.status, "planned");
    const digest = requestDigestInFixture(path);
    const requestFile = join(path, ".git/agent-pipeline/human-guard-overrides/requests", `${digest}.json`);
    const value = JSON.parse(readFileSync(requestFile, "utf8"));
    value.toolName = "Write";
    writeFileSync(requestFile, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    assert.throws(
      () => readHumanGuardOverrideRequestForHelp({ rootDir: path, requestSha256: digest }),
      (error) => error.code === "HGO-REQUEST",
    );
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("LOOKUP-08 expired source request is refused by canonical HGO expiry validation", () => {
  const path = fixtureRepo();
  const createdAt = Date.now() - 5000;
  try {
    const produced = sourceRefusal(path, { nowMs: createdAt, ttlMs: 1000 });
    assert.equal(produced.status, "planned");
    const digest = requestDigestInFixture(path);
    assert.throws(
      () => readHumanGuardOverrideRequestForHelp({ rootDir: path, requestSha256: digest, nowMs: Date.now() }),
      (error) => error.code === "HGO-EXPIRED",
    );
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("LOOKUP-09 actual Source evaluator keeps current denial output distinct from private help proposal", (t) => {
  const path = fixtureRepo();
  try {
    const result = evaluateLifecycleReadyGuard(
      { tool_name: "Bash", tool_input: { command: "rg -n marker . | tee output.txt" } },
      { projectDir: path, observeGovernanceScopeFn: () => ({ requiresEnforcement: true }) },
    );
    assert.equal(result.exitCode, 2, result.stderr);
    assert.match(result.stderr, /GUARD-OPERATOR-UNAPPROVED/u);
    assert.match(result.stderr, /Human override available for this exact command/u);
    assert.match(result.stderr, /--request-sha256/u);
    assert.doesNotMatch(result.stderr, /human-guard-overrides|audit\.key/u);
    assert.ok(Buffer.byteLength(result.stderr, "utf8") > 1024);
    t.diagnostic(`Main Source denial bytes=${Buffer.byteLength(result.stderr, "utf8")}; current inline HGO route remains long`);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("OUT-02 denial route byte count is stable across runner-labelled Source fixtures", (t) => {
  const digest = "b".repeat(64);
  const observations = ["claude", "codex", "antigravity"].map((runnerFixture) => {
    const route = humanOverrideRoute(
      "GUARD-OPERATOR-UNAPPROVED",
      "operator command refused",
      "command",
      repo,
      "Bash",
      { command: "rg -n marker . | tee output.txt" },
      {
        consumeHumanGuardOverrideFn: () => ({ status: "absent" }),
        recordHumanGuardDenialFn: () => ({ status: "planned", requestSha256: digest }),
      },
    );
    return { runnerFixture, bytes: Buffer.byteLength(route.overrideGuidance, "utf8"), route: route.overrideGuidance };
  });
  assert.deepEqual(observations.map((row) => row.bytes), [observations[0].bytes, observations[0].bytes, observations[0].bytes]);
  for (const row of observations) {
    assert.ok(row.bytes <= 1024);
    assert.match(row.route, /--request-sha256/u);
  }
  t.diagnostic(`Source-only fixtures Claude=${observations[0].bytes}, Codex=${observations[1].bytes}, Antigravity=${observations[2].bytes} UTF-8 bytes`);
});
