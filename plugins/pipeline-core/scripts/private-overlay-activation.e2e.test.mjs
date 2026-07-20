#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { loadRunnerProfilesV3Registry } from "../lib/runner-profiles-v3.mjs";
import { main } from "./private-overlay-activation.mjs";

const REPOSITORY = "https://example.invalid/public/agent-pipeline.git";
const VERSION = "0.2.0+e2e";
const POLICY_NAME = "customer-policy.md";
const GUIDELINE_NAME = "customer-guideline.md";
const POLICY_TEXT = "Operate the private policy in class order.\n";
const GUIDELINE_TEXT = "Apply the private guideline after policies.\n";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function scalar(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || Number.isInteger(value)) return String(value);
  throw new TypeError("unsupported fixture scalar");
}

function yaml(value, indent = "") {
  return Object.entries(value).map(([key, child]) => {
    if (Array.isArray(child)) {
      return `${indent}${key}:\n${child.map((item) => (item !== null && typeof item === "object")
        ? `${indent}  -\n${yaml(item, `${indent}    `)}`
        : `${indent}  - ${scalar(item)}\n`).join("")}`;
    }
    if (child !== null && typeof child === "object") return `${indent}${key}:\n${yaml(child, `${indent}  `)}`;
    return `${indent}${key}: ${scalar(child)}\n`;
  }).join("");
}

function v3Intent() {
  const registry = loadRunnerProfilesV3Registry();
  return {
    schema: "pipeline.user.v3",
    language: { human_facing: "de", agent_facing: "en" },
    agent_runtime: "other",
    runners: { enabled: ["claude", "codex"], default: "codex" },
    routing: clone({ profiles: registry.profiles, duties: registry.duties }),
    usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 },
    critic_export: clone(registry.criticExportPolicy),
    roles: { po: { display_label: "PO" } },
    session: { keep_awake: true },
    advisor_export: { consent: "approved" },
  };
}

function write(root, relativePath, value) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function initializeGit(root, withOrigin = false) {
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.email", "e2e@example.invalid");
  git(root, "config", "user.name", "SNT A E2E");
  if (withOrigin) git(root, "remote", "add", "origin", REPOSITORY);
}

function commitAll(root, message) {
  git(root, "add", "--all");
  git(root, "commit", "--message", message);
}

function pluginFiles() {
  const manifest = {
    name: "pipeline-core",
    version: VERSION,
    description: "Minimal flattened SNT-A E2E plugin fixture.",
    hooks: "./hooks/codex-hooks.json",
    author: { name: "agent-pipeline" },
    interface: { displayName: "Pipeline Core E2E" },
  };
  return new Map([
    [".codex-plugin/plugin.json", `${JSON.stringify(manifest, null, 2)}\n`],
    ["hooks/codex-hooks.json", "{}\n"],
  ]);
}

function createFixture() {
  const base = mkdtempSync(join(tmpdir(), "private-overlay-cli-e2e-"));
  const publicRoot = join(base, "public-source");
  const sourcePluginRoot = join(publicRoot, "plugins", "pipeline-core");
  const installedPluginRoot = join(base, "installed-cache", "pipeline-core");
  const overlayRoot = join(base, "private-overlay");
  mkdirSync(sourcePluginRoot, { recursive: true });
  mkdirSync(installedPluginRoot, { recursive: true });
  mkdirSync(overlayRoot, { recursive: true });

  const files = pluginFiles();
  for (const [relativePath, bytes] of files) {
    write(sourcePluginRoot, relativePath, bytes);
    write(installedPluginRoot, relativePath, bytes);
  }
  initializeGit(publicRoot, true);
  commitAll(publicRoot, "public plugin fixture");

  const candidate = {
    repository: REPOSITORY,
    branch: "main",
    commit: git(publicRoot, "rev-parse", "HEAD"),
    tree: git(publicRoot, "rev-parse", "HEAD^{tree}"),
  };
  const manifestBytes = files.get(".codex-plugin/plugin.json");
  const lock = {
    $schema: "pipeline.core-lock.v1",
    source: candidate,
    plugin: {
      name: "pipeline-core",
      version: VERSION,
      manifest_sha256: sha256(manifestBytes),
    },
  };

  write(overlayRoot, "pipeline.user.yaml", yaml(v3Intent()));
  write(overlayRoot, ".agent-pipeline/core.lock.json", `${JSON.stringify(lock, null, 2)}\n`);
  for (const className of ["policies", "guidelines", "templates", "extensions"]) {
    mkdirSync(join(overlayRoot, ".agent-pipeline", className), { recursive: true });
  }
  write(overlayRoot, `.agent-pipeline/policies/${POLICY_NAME}`, POLICY_TEXT);
  write(overlayRoot, `.agent-pipeline/guidelines/${GUIDELINE_NAME}`, GUIDELINE_TEXT);
  initializeGit(overlayRoot);
  commitAll(overlayRoot, "slim private overlay fixture");

  return {
    base,
    publicRoot,
    sourcePluginRoot,
    installedPluginRoot,
    overlayRoot,
    lock,
  };
}

function runCli(fixture, command, ...extra) {
  let stdout = "";
  let stderr = "";
  let preview = "";
  const code = main([
    command,
    "--project-root", fixture.overlayRoot,
    "--source-plugin-root", fixture.sourcePluginRoot,
    ...extra,
  ], {
    pluginRoot: fixture.installedPluginRoot,
    write(chunk) { stdout += String(chunk); return true; },
    writeError(chunk) { stderr += String(chunk); return true; },
    previewWriteSync(_fd, buffer, offset, length) {
      preview += buffer.subarray(offset, offset + length).toString("utf8");
      return length;
    },
  });
  return {
    code,
    stdout,
    stderr,
    preview,
    output: stdout === "" ? undefined : JSON.parse(stdout),
  };
}

function assertSanitized(result, fixture, ...privateValues) {
  for (const forbidden of [
    fixture.base,
    fixture.publicRoot,
    fixture.sourcePluginRoot,
    fixture.installedPluginRoot,
    fixture.overlayRoot,
    POLICY_NAME,
    GUIDELINE_NAME,
    ...privateValues,
  ]) {
    assert.equal(result.stdout.includes(forbidden), false, `stdout exposed ${forbidden}`);
    assert.equal(result.stderr.includes(forbidden), false, `stderr exposed ${forbidden}`);
  }
}

test("production CLI completes the real slim-overlay lifecycle and transfers context only explicitly", () => {
  const fixture = createFixture();
  try {
    const initial = runCli(fixture, "status");
    assert.equal(initial.code, 2);
    assert.equal(initial.output.schema, "pipeline.private-overlay-bootstrap-status.v1");
    assert.equal(initial.output.status, "activation-required", initial.stdout);
    assert.deepEqual(initial.output.reasonCodes, ["SNT-A-RUNTIME-PROJECTION-REQUIRED"]);
    assertSanitized(initial, fixture, POLICY_TEXT, GUIDELINE_TEXT);

    const planned = runCli(fixture, "plan");
    assert.equal(planned.code, 0, planned.stdout);
    assert.equal(planned.output.status, "ready");
    assert.match(planned.output.planSha256, /^[0-9a-f]{64}$/u);
    assert.ok(planned.output.changeCount > 0);
    assert.equal(planned.preview, "");
    assertSanitized(planned, fixture, POLICY_TEXT, GUIDELINE_TEXT);

    const activated = runCli(
      fixture,
      "activate",
      "--expected-plan-sha256",
      planned.output.planSha256,
    );
    assert.equal(activated.code, 0, activated.stdout);
    assert.equal(activated.output.status, "activated");
    assert.equal(activated.output.planSha256, planned.output.planSha256);
    assert.equal(activated.output.readback.status, "activated");
    assert.equal(
      activated.output.readback.profile.receiptSha256,
      activated.output.receipt.receiptSha256,
    );
    assert.notEqual(activated.output.readback.planSha256, planned.output.planSha256);
    assert.notEqual(activated.preview, "");
    assertSanitized(activated, fixture, POLICY_TEXT, GUIDELINE_TEXT);
    assert.equal(existsSync(join(fixture.overlayRoot, ".claude", "pipeline.yaml")), true);
    assert.equal(existsSync(join(fixture.overlayRoot, ".codex", "config.toml")), true);

    const fresh = runCli(fixture, "status");
    assert.equal(fresh.code, 0, fresh.stdout);
    assert.equal(fresh.output.status, "activated");
    assert.equal(fresh.output.planSha256, activated.output.readback.planSha256);
    assertSanitized(fresh, fixture, POLICY_TEXT, GUIDELINE_TEXT);

    const context = runCli(fixture, "load-context");
    assert.equal(context.code, 0, context.stdout);
    assert.equal(context.output.status, "context-loaded");
    assert.equal(context.output.classification, "private-operational-context");
    assert.equal(context.output.machineEvidence, false);
    assert.equal(context.output.handling, "do-not-persist-or-export");
    assert.deepEqual(context.output.entries, [
      { className: "policies", text: POLICY_TEXT },
      { className: "guidelines", text: GUIDELINE_TEXT },
    ]);
    assert.equal(context.stdout.includes(POLICY_NAME), false);
    assert.equal(context.stdout.includes(GUIDELINE_NAME), false);
    for (const path of [fixture.base, fixture.publicRoot, fixture.sourcePluginRoot, fixture.installedPluginRoot, fixture.overlayRoot]) {
      assert.equal(context.stdout.includes(path), false);
    }
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("production status rejects dirty Public source drift without exposing it", () => {
  const fixture = createFixture();
  try {
    write(fixture.sourcePluginRoot, "hooks/codex-hooks.json", "{\"drift\":true}\n");
    const result = runCli(fixture, "status");
    assert.equal(result.code, 2);
    assert.deepEqual(result.output, {
      schema: "pipeline.private-overlay-bootstrap-status.v1",
      status: "rejected",
      reasonCodes: ["SNT-A2-SOURCE-DIRTY"],
    });
    assertSanitized(result, fixture, "drift");
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("production status rejects flattened Installed-cache drift without exposing it", () => {
  const fixture = createFixture();
  try {
    write(fixture.installedPluginRoot, "hooks/codex-hooks.json", "{\"installedDrift\":true}\n");
    const result = runCli(fixture, "status");
    assert.equal(result.code, 2);
    assert.deepEqual(result.output, {
      schema: "pipeline.private-overlay-bootstrap-status.v1",
      status: "rejected",
      reasonCodes: ["SNT-A2-CONTENT-MISMATCH"],
    });
    assertSanitized(result, fixture, "installedDrift");
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("production status rejects a stale exact lock after the Public candidate advances", () => {
  const fixture = createFixture();
  try {
    write(fixture.publicRoot, "candidate-marker.txt", "advanced candidate\n");
    commitAll(fixture.publicRoot, "advance public candidate without plugin drift");
    assert.notEqual(git(fixture.publicRoot, "rev-parse", "HEAD"), fixture.lock.source.commit);
    const result = runCli(fixture, "status");
    assert.equal(result.code, 2);
    assert.deepEqual(result.output, {
      schema: "pipeline.private-overlay-bootstrap-status.v1",
      status: "rejected",
      reasonCodes: ["SNT-A-COMMIT-MISMATCH"],
    });
    assertSanitized(result, fixture, "advanced candidate");
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});
