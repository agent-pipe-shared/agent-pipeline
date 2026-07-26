#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Bind the sandbox-observed fresh Codex control mounts to one host-only Git
 * initialization. The host apply deliberately does not rerun onboarding:
 * Codex's virtual .git/.codex mounts are absent at that boundary.
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { inspectProjectOnboardingV3 } from "../lib/project-onboarding-v3.mjs";
import {
  CODEX_HOST_REPOSITORY_INIT_RECEIPT,
  codexHostRepositoryAuthoritySha256,
} from "../lib/codex-host-layout.mjs";

const PLAN_SCHEMA = "pipeline.codex-host-repository-init-plan.v1";
const APPLY_SCHEMA = "pipeline.codex-host-repository-init-apply.v1";
const REQUIRED = [
  "pipeline.user.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
  ".claude/settings.json",
  ".claude/pipeline-state.json",
  "docs/state.md",
  "specs/kickoff-initial-prd.md",
  "specs/kickoff-initial-spec.md",
  ".claude/.runtime/agent-pipeline/onboarding/continuity-history.json",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function safeRoot(rootDir, fs = {}) {
  const requested = resolve(rootDir);
  const root = (fs.realpathSync ?? realpathSync)(requested);
  if (root !== requested) throw new Error("root must be a physical non-symlink path");
  const stat = (fs.lstatSync ?? lstatSync)(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("root must be a physical directory");
  return root;
}

function portableSnapshot(root, fs = {}) {
  const read = fs.readFileSync ?? readFileSync;
  const lstat = fs.lstatSync ?? lstatSync;
  const files = REQUIRED.map((path) => {
    const absolute = join(root, path);
    const stat = lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`required portable file is unsafe: ${path}`);
    return { path, sha256: sha256(read(absolute)) };
  });
  const calibrationBytes = read(join(root, ".claude/pipeline.json"));
  const calibration = JSON.parse(calibrationBytes.toString("utf8"));
  if (calibration?.repositoryMode !== "host-managed") {
    throw new Error("portable calibration is not host-managed");
  }
  return {
    root,
    files,
    calibrationSha256: sha256(calibrationBytes),
  };
}

function digest(snapshot) {
  return sha256(JSON.stringify(stable(snapshot)));
}

function applyAction(root, planSha256) {
  return {
    kind: "command",
    executable: "node",
    argv: [
      fileURLToPath(import.meta.url),
      "apply",
      "--root",
      root,
      "--plan-sha256",
      planSha256,
      "--activate",
    ],
    mutation: true,
    requiresConfirmation: true,
    requiresHostBoundary: true,
    expected: {
      schema: APPLY_SCHEMA,
      statuses: ["restart-required", "host-preimage-changed", "git-unavailable", "apply-failed"],
    },
  };
}

export function planHostRepositoryInit({ rootDir = process.cwd(), deps = {} } = {}) {
  const root = safeRoot(rootDir, deps);
  const lifecycle = (deps.inspectProjectOnboardingV3 ?? inspectProjectOnboardingV3)({
    rootDir: root,
    intent: "bootstrap",
    deps,
  });
  const accepted = lifecycle.status === "ready"
    && lifecycle.repository?.status === "host-managed"
    && lifecycle.repository?.mode === "host-managed"
    && lifecycle.repository?.gitVersion === null
    && lifecycle.runtime?.status === "plugin-managed"
    && lifecycle.runtime?.sourceSha256
    && lifecycle.runtime?.targetsSha256 === null
    && lifecycle.runtime?.barrierSha256 === null
    && lifecycle.runtime?.readbackSha256 === null
    && lifecycle.continuity?.status === "valid"
    && lifecycle.appServer?.required === false
    && lifecycle.appServer?.status === "not-requested"
    && lifecycle.nextAction === null;
  if (!accepted) {
    return {
      schema: PLAN_SCHEMA,
      status: "not-applicable",
      root,
      planSha256: null,
      applyAction: null,
      diagnostics: [{ code: "host_managed_bootstrap_not_ready" }],
    };
  }
  const snapshot = portableSnapshot(root, deps);
  const planSha256 = digest(snapshot);
  return {
    schema: PLAN_SCHEMA,
    status: "ready",
    root,
    planSha256,
    changes: [
      ".git",
      ".git/agent-pipeline/onboarding/continuity-history.json",
      CODEX_HOST_REPOSITORY_INIT_RECEIPT,
    ],
    createsCommit: false,
    applyAction: applyAction(root, planSha256),
    diagnostics: [],
  };
}

function parseGitVersion(output) {
  const match = String(output ?? "").match(/^git version (\d+)\.(\d+)(?:\.(\d+))?/u);
  if (!match) return null;
  const version = match.slice(1).map((value) => Number.parseInt(value ?? "0", 10));
  return version[0] > 2 || (version[0] === 2 && version[1] >= 28) ? match[0].slice("git version ".length) : null;
}

function bindPrivateContinuity(root, { planSha256, gitVersion }, fs = {}) {
  const source = join(root, ".claude/.runtime/agent-pipeline/onboarding/continuity-history.json");
  const directory = join(root, ".git/agent-pipeline/onboarding");
  const target = join(directory, "continuity-history.json");
  const receiptPath = join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT);
  const read = fs.readFileSync ?? readFileSync;
  const mkdir = fs.mkdirSync ?? mkdirSync;
  const write = fs.writeFileSync ?? writeFileSync;
  const open = fs.openSync ?? openSync;
  const sync = fs.fsyncSync ?? fsyncSync;
  const close = fs.closeSync ?? closeSync;
  const historyBytes = read(source);
  mkdir(directory, { recursive: true, mode: 0o700 });
  write(target, historyBytes, { flag: "wx", mode: 0o600 });
  const descriptor = open(target, "r");
  try { sync(descriptor); } finally { close(descriptor); }
  const receipt = {
    schema: "pipeline.codex-host-repository-init-receipt.v1",
    planSha256,
    rootSha256: sha256(Buffer.from(root, "utf8")),
    authoritySha256: codexHostRepositoryAuthoritySha256(root, {
      lstat: fs.lstatSync ?? lstatSync,
      readFile: read,
    }),
    historySha256: sha256(historyBytes),
    gitVersion,
    branch: "main",
  };
  if (receipt.authoritySha256 === null) throw new Error("host-init authority is unavailable");
  write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const receiptDescriptor = open(receiptPath, "r");
  try { sync(receiptDescriptor); } finally { close(receiptDescriptor); }
}

export function applyHostRepositoryInit({
  rootDir = process.cwd(),
  planSha256,
  activate = false,
  deps = {},
} = {}) {
  let root;
  try {
    root = safeRoot(rootDir, deps);
    if (!activate || !/^[a-f0-9]{64}$/u.test(planSha256 ?? "")) throw new Error("activation and a plan digest are required");
    const snapshot = portableSnapshot(root, deps);
    if (digest(snapshot) !== planSha256) {
      return { schema: APPLY_SCHEMA, status: "host-preimage-changed", root, diagnostics: [{ code: "plan_digest_mismatch" }] };
    }
    const exists = deps.existsSync ?? existsSync;
    if (exists(join(root, ".git")) || exists(join(root, ".codex")) || exists(join(root, ".agents"))) {
      return { schema: APPLY_SCHEMA, status: "host-preimage-changed", root, diagnostics: [{ code: "reserved_host_path_present" }] };
    }
    const spawn = deps.spawnSync ?? spawnSync;
    const observed = spawn("git", ["--version"], { cwd: root, encoding: "utf8" });
    const gitVersion = !observed.error && observed.status === 0 ? parseGitVersion(observed.stdout) : null;
    if (!gitVersion) {
      return { schema: APPLY_SCHEMA, status: "git-unavailable", root, diagnostics: [{ code: "git_2_28_required" }] };
    }

    const initialized = spawn("git", ["init", "--initial-branch=main"], { cwd: root, encoding: "utf8" });
    if (initialized.error || initialized.status !== 0) {
      if (exists(join(root, ".git"))) (deps.rmSync ?? rmSync)(join(root, ".git"), { recursive: true, force: true });
      return { schema: APPLY_SCHEMA, status: "apply-failed", root, diagnostics: [{ code: "git_init_failed" }] };
    }
    try {
      bindPrivateContinuity(root, { planSha256, gitVersion }, deps);
    } catch {
      (deps.rmSync ?? rmSync)(join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT), { force: true });
      if (exists(join(root, ".git"))) (deps.rmSync ?? rmSync)(join(root, ".git"), { recursive: true, force: true });
      return { schema: APPLY_SCHEMA, status: "apply-failed", root, diagnostics: [{ code: "continuity_binding_failed" }] };
    }
    return {
      schema: APPLY_SCHEMA,
      status: "restart-required",
      root,
      gitVersion,
      branch: "main",
      createsCommit: false,
      operatorAction: "Restart the current project session once so Codex remounts the newly initialized repository.",
      diagnostics: [],
    };
  } catch {
    return {
      schema: APPLY_SCHEMA,
      status: "apply-failed",
      root: root ?? null,
      diagnostics: [{ code: "host_repository_init_failed" }],
    };
  }
}

function valueAfter(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function main(argv = process.argv.slice(2)) {
  const operation = argv[0];
  const rootDir = valueAfter(argv, "--root") ?? process.cwd();
  const result = operation === "plan"
    ? planHostRepositoryInit({ rootDir })
    : operation === "apply"
      ? applyHostRepositoryInit({
        rootDir,
        planSha256: valueAfter(argv, "--plan-sha256"),
        activate: argv.includes("--activate"),
      })
      : { schema: PLAN_SCHEMA, status: "invalid-command", root: null, diagnostics: [{ code: "invalid_command" }] };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return ["ready", "restart-required"].includes(result.status) ? 0 : 2;
}

const invokedDirectly = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (invokedDirectly) process.exitCode = main();
