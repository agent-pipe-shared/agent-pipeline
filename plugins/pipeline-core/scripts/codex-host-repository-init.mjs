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
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { inspectProjectOnboardingV3 } from "../lib/project-onboarding-v3.mjs";
import {
  CODEX_HOST_REPOSITORY_INIT_DIRECTORY,
  CODEX_HOST_REPOSITORY_INIT_INTENT,
  CODEX_HOST_REPOSITORY_INIT_MARKER,
  CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
  CODEX_HOST_REPOSITORY_INIT_RECEIPT,
  codexHostRepositoryAuthoritySha256,
  readCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";

const PLAN_SCHEMA = "pipeline.codex-host-repository-init-plan.v1";
const APPLY_SCHEMA = "pipeline.codex-host-repository-init-apply.v1";
const GIT_RESERVATION_SCHEMA = "pipeline.codex-host-git-reservation.v1";
const GIT_INITIALIZED_SCHEMA = "pipeline.codex-host-git-initialized.v1";
const GIT_RESERVATION_FILE = "git-reservation.json";
const GIT_INITIALIZED_FILE = "git-initialized.json";
const GIT_TEMPLATE_DIRECTORY = "git-template";
const INITIAL_GIT_PATHS = new Set([
  "",
  "HEAD",
  "config",
  "objects",
  "objects/info",
  "objects/pack",
  "refs",
  "refs/heads",
  "refs/tags",
]);
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
      statuses: ["restart-required", "host-preimage-changed", "git-unavailable", "apply-failed", "rollback-failed"],
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
  const accepted = lifecycle.status === "host-repository-init-required"
    && lifecycle.repository?.status === "host-managed"
    && lifecycle.repository?.mode === "host-managed"
    && lifecycle.repository?.gitVersion === null
    && lifecycle.runtime?.status === "plugin-managed-unattested"
    && lifecycle.runtime?.sourceSha256
    && lifecycle.runtime?.targetsSha256 === null
    && lifecycle.runtime?.barrierSha256 === null
    && lifecycle.runtime?.readbackSha256 === null
    && lifecycle.continuity?.status === "valid"
    && lifecycle.appServer?.required === true
    && lifecycle.appServer?.status === "running"
    && lifecycle.appServer?.code === "CAS-READY"
    && lifecycle.nextAction?.kind === "command"
    && lifecycle.nextAction?.executable === "node"
    && JSON.stringify(lifecycle.nextAction?.argv) === JSON.stringify([
      fileURLToPath(import.meta.url),
      "plan",
      "--root",
      root,
    ])
    && lifecycle.nextAction?.mutation === false
    && lifecycle.nextAction?.requiresConfirmation === false;
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
      CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
      CODEX_HOST_REPOSITORY_INIT_DIRECTORY,
      CODEX_HOST_REPOSITORY_INIT_INTENT,
      CODEX_HOST_REPOSITORY_INIT_RECEIPT,
      CODEX_HOST_REPOSITORY_INIT_MARKER,
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

function physicalIdentity(info, kind) {
  const valid = kind === "directory"
    ? info && !info.isSymbolicLink() && info.isDirectory()
    : info && !info.isSymbolicLink() && info.isFile() && info.nlink === 1;
  return valid ? { dev: String(info.dev), ino: String(info.ino), kind } : null;
}

function samePhysicalIdentity(path, expected, fs = {}) {
  if (!expected) return false;
  try {
    const info = (fs.lstatSync ?? lstatSync)(path);
    const actual = physicalIdentity(info, expected.kind);
    return actual?.dev === expected.dev && actual?.ino === expected.ino;
  } catch {
    return false;
  }
}

function physicalTreeSnapshot(path, fs = {}) {
  const lstat = fs.lstatSync ?? lstatSync;
  const read = fs.readFileSync ?? readFileSync;
  const readdir = fs.readdirSync ?? readdirSync;
  const rows = [];
  function visit(current, relative) {
    const info = lstat(current);
    if (info.isSymbolicLink()) throw new Error("Git control tree contains a symbolic link");
    if (info.isDirectory()) {
      rows.push({ path: relative, kind: "directory", dev: String(info.dev), ino: String(info.ino) });
      for (const name of readdir(current).sort()) {
        visit(join(current, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    if (!info.isFile() || info.nlink !== 1) throw new Error("Git control tree contains an unsafe file");
    rows.push({
      path: relative,
      kind: "file",
      dev: String(info.dev),
      ino: String(info.ino),
      sha256: sha256(read(current)),
    });
  }
  visit(path, "");
  return rows;
}

function assertPhysicalDirectory(path, fs = {}) {
  const identity = physicalIdentity((fs.lstatSync ?? lstatSync)(path), "directory");
  if (!identity) throw new Error("host-init path contains a non-physical directory");
  return identity;
}

function assertPhysicalParents(root, relative, fs = {}) {
  let current = root;
  for (const component of relative.split("/")) {
    current = join(current, component);
    assertPhysicalDirectory(current, fs);
  }
}

function createPrivateDirectory(path, parent, created, fs = {}) {
  const exists = fs.existsSync ?? existsSync;
  if (exists(path)) throw new Error("host-init private directory appeared before creation");
  assertPhysicalDirectory(parent, fs);
  (fs.mkdirSync ?? mkdirSync)(path, { mode: 0o700 });
  const identity = physicalIdentity((fs.lstatSync ?? lstatSync)(path), "directory");
  if (!identity) throw new Error("created host-init directory identity is unavailable");
  created.directories.push({ path, identity });
}

function removeCreatedFile(path, expected, fs = {}) {
  const exists = fs.existsSync ?? existsSync;
  if (!exists(path)) return;
  if (!samePhysicalIdentity(path, expected, fs)) {
    throw new Error("created host-init file changed identity before rollback");
  }
  (fs.rmSync ?? rmSync)(path, { force: true });
}

function removeCreatedDirectory(path, expected, fs = {}) {
  const exists = fs.existsSync ?? existsSync;
  if (!exists(path)) return;
  if (!samePhysicalIdentity(path, expected, fs)) {
    throw new Error("created host-init directory changed identity before rollback");
  }
  (fs.rmdirSync ?? rmdirSync)(path);
}

function fsyncDirectory(path, fs = {}) {
  if ((fs.process?.platform ?? process.platform) === "win32") return;
  const open = fs.openSync ?? openSync;
  const sync = fs.fsyncSync ?? fsyncSync;
  const close = fs.closeSync ?? closeSync;
  const descriptor = open(path, "r");
  try { sync(descriptor); } finally { close(descriptor); }
}

function readBoundFile(path, fs = {}) {
  const lstat = fs.lstatSync ?? lstatSync;
  const open = fs.openSync ?? openSync;
  const fstat = fs.fstatSync ?? fstatSync;
  const read = fs.readFileSync ?? readFileSync;
  const close = fs.closeSync ?? closeSync;
  const fsConstants = fs.constants ?? constants;
  let descriptor;
  try {
    const parent = dirname(path);
    const parentIdentity = assertPhysicalDirectory(parent, fs);
    const before = physicalIdentity(lstat(path), "file");
    if (!before) return null;
    descriptor = open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = physicalIdentity(fstat(descriptor), "file");
    if (opened?.dev !== before.dev || opened?.ino !== before.ino) return null;
    const bytes = read(descriptor);
    const after = physicalIdentity(fstat(descriptor), "file");
    return after?.dev === opened.dev && after?.ino === opened.ino
      && samePhysicalIdentity(path, opened, fs)
      && samePhysicalIdentity(parent, parentIdentity, fs)
      ? bytes
      : null;
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) {
      try { close(descriptor); } catch {}
    }
  }
}

function exactFile(path, bytes, fs = {}) {
  return readBoundFile(path, fs)?.compare(bytes) === 0;
}

function writeDurableExclusive(path, bytes, fs = {}) {
  const open = fs.openSync ?? openSync;
  const write = fs.writeFileSync ?? writeFileSync;
  const sync = fs.fsyncSync ?? fsyncSync;
  const close = fs.closeSync ?? closeSync;
  const fstat = fs.fstatSync ?? fstatSync;
  const fsConstants = fs.constants ?? constants;
  let descriptor;
  const parent = dirname(path);
  const parentIdentity = assertPhysicalDirectory(parent, fs);
  try {
    descriptor = open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT
      | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    write(descriptor, bytes);
    sync(descriptor);
    const identity = physicalIdentity(fstat(descriptor), "file");
    if (!identity) throw new Error("published host-init file identity is unavailable");
    if (!samePhysicalIdentity(parent, parentIdentity, fs)) {
      throw new Error("host-init file parent changed during publication");
    }
    return identity;
  } finally {
    if (descriptor !== undefined) close(descriptor);
  }
}

function ensureExactDurableFile(path, bytes, fs = {}) {
  if ((fs.existsSync ?? existsSync)(path)) {
    if (!exactFile(path, bytes, fs)) throw new Error("host-init transaction file drifted");
    return physicalIdentity((fs.lstatSync ?? lstatSync)(path), "file");
  }
  const identity = writeDurableExclusive(path, bytes, fs);
  if (!samePhysicalIdentity(path, identity, fs) || !exactFile(path, bytes, fs)) {
    throw new Error("host-init transaction file readback failed");
  }
  return identity;
}

function transactionIntent(root, planSha256) {
  return {
    schema: "pipeline.codex-host-repository-init-intent.v1",
    rootSha256: sha256(Buffer.from(root, "utf8")),
    planSha256,
  };
}

function prepareTransaction(root, planSha256, fs = {}) {
  const pendingPath = join(root, CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY);
  const parent = join(root, ".claude/.runtime/agent-pipeline/onboarding");
  const intentBytes = Buffer.from(`${JSON.stringify(transactionIntent(root, planSha256), null, 2)}\n`, "utf8");
  const exists = fs.existsSync ?? existsSync;
  if (!exists(pendingPath)) {
    assertPhysicalParents(root, ".claude/.runtime/agent-pipeline/onboarding", fs);
    const parentIdentity = assertPhysicalDirectory(parent, fs);
    (fs.mkdirSync ?? mkdirSync)(pendingPath, { mode: 0o700 });
    const identity = physicalIdentity((fs.lstatSync ?? lstatSync)(pendingPath), "directory");
    if (!identity) throw new Error("host-init pending transaction identity is unavailable");
    ensureExactDurableFile(join(pendingPath, "intent.json"), intentBytes, fs);
    if (!samePhysicalIdentity(parent, parentIdentity, fs)) {
      throw new Error("host-init pending parent changed during publication");
    }
    fsyncDirectory(pendingPath, fs);
    fsyncDirectory(parent, fs);
  }
  assertPhysicalDirectory(pendingPath, fs);
  if (!exactFile(join(pendingPath, "intent.json"), intentBytes, fs)) {
    throw new Error("host-init pending transaction does not match the reviewed plan");
  }
  return { pendingPath, intentBytes };
}

function readClosedJson(path, keys, schema, fs = {}) {
  try {
    const bytes = readBoundFile(path, fs);
    if (!bytes) return null;
    const value = JSON.parse(bytes.toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      && value.schema === schema
      && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
      ? { value, bytes }
      : null;
  } catch {
    return null;
  }
}

function initialGitTree(path, fs = {}) {
  const rows = physicalTreeSnapshot(path, fs).filter(
    (row) => row.path !== "agent-pipeline" && !row.path.startsWith("agent-pipeline/"),
  );
  if (rows.some((row) => !INITIAL_GIT_PATHS.has(row.path))) {
    throw new Error("initialized Git control tree contains an unexpected path");
  }
  if (!INITIAL_GIT_PATHS.size || rows.length !== INITIAL_GIT_PATHS.size) {
    throw new Error("initialized Git control tree is incomplete");
  }
  return rows.map(({ path: relativePath, kind, sha256: digestValue = null }) => ({
    path: relativePath,
    kind,
    sha256: digestValue,
  }));
}

function prepareGitControl(root, planSha256, currentGitVersion, pendingPath, spawn, fs = {}) {
  const gitPath = join(root, ".git");
  const reservationPath = join(pendingPath, GIT_RESERVATION_FILE);
  const initializedPath = join(pendingPath, GIT_INITIALIZED_FILE);
  const templatePath = join(pendingPath, GIT_TEMPLATE_DIRECTORY);
  const exists = fs.existsSync ?? existsSync;
  const rootSha256 = sha256(Buffer.from(root, "utf8"));
  let gitIdentity;
  if (!exists(gitPath)) {
    const rootIdentity = assertPhysicalDirectory(root, fs);
    (fs.mkdirSync ?? mkdirSync)(gitPath, { mode: 0o700 });
    gitIdentity = physicalIdentity((fs.lstatSync ?? lstatSync)(gitPath), "directory");
    if (!gitIdentity || !samePhysicalIdentity(root, rootIdentity, fs)) {
      throw new Error("Git reservation identity is unavailable");
    }
    const reservation = {
      schema: GIT_RESERVATION_SCHEMA,
      rootSha256,
      planSha256,
      device: gitIdentity.dev,
      inode: gitIdentity.ino,
    };
    ensureExactDurableFile(
      reservationPath,
      Buffer.from(`${JSON.stringify(reservation, null, 2)}\n`, "utf8"),
      fs,
    );
    fsyncDirectory(gitPath, fs);
    fsyncDirectory(root, fs);
    fsyncDirectory(pendingPath, fs);
  } else {
    const observed = readClosedJson(
      reservationPath,
      ["device", "inode", "planSha256", "rootSha256", "schema"],
      GIT_RESERVATION_SCHEMA,
      fs,
    );
    gitIdentity = physicalIdentity((fs.lstatSync ?? lstatSync)(gitPath), "directory");
    if (!observed || !gitIdentity
      || observed.value.rootSha256 !== rootSha256
      || observed.value.planSha256 !== planSha256
      || observed.value.device !== gitIdentity.dev
      || observed.value.inode !== gitIdentity.ino) {
      throw new Error("existing Git control path is not the reserved transaction path");
    }
  }

  const initialized = exists(initializedPath)
    ? readClosedJson(
      initializedPath,
      ["gitTreeSha256", "gitVersion", "planSha256", "rootSha256", "schema"],
      GIT_INITIALIZED_SCHEMA,
      fs,
    )
    : null;
  if (initialized) {
    const logicalTree = initialGitTree(gitPath, fs);
    if (initialized.value.rootSha256 !== rootSha256
      || initialized.value.planSha256 !== planSha256
      || parseGitVersion(`git version ${initialized.value.gitVersion}`) !== initialized.value.gitVersion
      || initialized.value.gitTreeSha256 !== sha256(Buffer.from(JSON.stringify(logicalTree), "utf8"))) {
      throw new Error("initialized Git control proof drifted");
    }
    return {
      gitIdentity,
      gitVersion: initialized.value.gitVersion,
      gitTreeSha256: initialized.value.gitTreeSha256,
    };
  }
  if (exists(initializedPath)) throw new Error("initialized Git control proof is invalid");

  if (!exists(templatePath)) (fs.mkdirSync ?? mkdirSync)(templatePath, { mode: 0o700 });
  const templateIdentity = assertPhysicalDirectory(templatePath, fs);
  if ((fs.readdirSync ?? readdirSync)(templatePath).length !== 0) {
    throw new Error("Git initialization template is not empty");
  }
  const initializedResult = spawn(
    "git",
    ["init", "--initial-branch=main", `--template=${templatePath}`],
    { cwd: root, encoding: "utf8" },
  );
  if (initializedResult.error || initializedResult.status !== 0) {
    return { status: "git-init-failed", gitIdentity };
  }
  if (!samePhysicalIdentity(gitPath, gitIdentity, fs)) {
    throw new Error("Git control identity changed during initialization");
  }
  if (!samePhysicalIdentity(templatePath, templateIdentity, fs)
    || (fs.readdirSync ?? readdirSync)(templatePath).length !== 0) {
    throw new Error("Git initialization template changed during initialization");
  }
  const logicalTree = initialGitTree(gitPath, fs);
  const initializedProof = {
    schema: GIT_INITIALIZED_SCHEMA,
    rootSha256,
    planSha256,
    gitVersion: currentGitVersion,
    gitTreeSha256: sha256(Buffer.from(JSON.stringify(logicalTree), "utf8")),
  };
  ensureExactDurableFile(
    initializedPath,
    Buffer.from(`${JSON.stringify(initializedProof, null, 2)}\n`, "utf8"),
    fs,
  );
  fsyncDirectory(gitPath, fs);
  fsyncDirectory(pendingPath, fs);
  return {
    gitIdentity,
    gitVersion: currentGitVersion,
    gitTreeSha256: initializedProof.gitTreeSha256,
  };
}

function ensurePrivateDirectory(path, parent, created, fs = {}) {
  const exists = fs.existsSync ?? existsSync;
  if (exists(path)) {
    assertPhysicalDirectory(path, fs);
    return;
  }
  createPrivateDirectory(path, parent, created, fs);
}

function bindPrivateContinuity(root, {
  planSha256,
  gitVersion,
  gitIdentity,
  gitTreeSha256,
  pendingPath,
  intentBytes,
}, fs = {}, created = {}) {
  const source = join(root, ".claude/.runtime/agent-pipeline/onboarding/continuity-history.json");
  const git = join(root, ".git");
  const agentPipeline = join(git, "agent-pipeline");
  const directory = join(agentPipeline, "onboarding");
  const target = join(directory, "continuity-history.json");
  const admissionPath = join(pendingPath, "admission");
  const receiptPath = join(admissionPath, "receipt.json");
  const markerPath = join(admissionPath, "marker.json");
  const intentPath = join(admissionPath, "intent.json");
  const finalAdmissionPath = join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY);
  const admissionParent = join(root, ".claude/.runtime/agent-pipeline/onboarding");
  const read = fs.readFileSync ?? readFileSync;
  const historyBytes = readBoundFile(source, fs);
  if (!historyBytes) throw new Error("portable continuity history changed during binding");
  if (!samePhysicalIdentity(git, gitIdentity, fs)) throw new Error("Git control identity changed before continuity binding");
  ensurePrivateDirectory(agentPipeline, git, created, fs);
  ensurePrivateDirectory(directory, agentPipeline, created, fs);
  assertPhysicalParents(root, ".git/agent-pipeline/onboarding", fs);
  created.history = ensureExactDurableFile(target, historyBytes, fs);
  if (!created.history) throw new Error("created continuity identity is unavailable");
  fsyncDirectory(directory, fs);
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
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (!(fs.existsSync ?? existsSync)(admissionPath)) {
    (fs.mkdirSync ?? mkdirSync)(admissionPath, { mode: 0o700 });
  }
  const admissionIdentity = assertPhysicalDirectory(admissionPath, fs);
  const admissionParentIdentity = assertPhysicalDirectory(admissionParent, fs);
  created.intent = ensureExactDurableFile(intentPath, intentBytes, fs);
  created.receipt = ensureExactDurableFile(receiptPath, receiptBytes, fs);
  if (!created.receipt) throw new Error("created receipt identity is unavailable");
  const marker = {
    schema: "pipeline.codex-host-repository-init-marker.v1",
    rootSha256: receipt.rootSha256,
    planSha256: receipt.planSha256,
    intentSha256: sha256(intentBytes),
    receiptSha256: sha256(receiptBytes),
  };
  const markerBytes = Buffer.from(`${JSON.stringify(marker, null, 2)}\n`, "utf8");
  (fs.faultInjector ?? (() => {}))("before-host-init-marker-publication");
  created.marker = ensureExactDurableFile(markerPath, markerBytes, fs);
  if (!created.marker) throw new Error("created host-init marker identity is unavailable");
  fsyncDirectory(admissionPath, fs);
  if (sha256(Buffer.from(JSON.stringify(initialGitTree(git, fs)), "utf8")) !== gitTreeSha256) {
    throw new Error("Git control tree changed before admission publication");
  }
  if (!samePhysicalIdentity(admissionPath, admissionIdentity, fs)) {
    throw new Error("host-init admission directory changed before publication");
  }
  if ((fs.existsSync ?? existsSync)(finalAdmissionPath)) {
    throw new Error("host-init admission appeared before atomic publication");
  }
  (fs.faultInjector ?? (() => {}))("before-host-init-admission-rename");
  (fs.renameSync ?? renameSync)(admissionPath, finalAdmissionPath);
  created.admission = physicalIdentity((fs.lstatSync ?? lstatSync)(finalAdmissionPath), "directory");
  if (!samePhysicalIdentity(finalAdmissionPath, admissionIdentity, fs)) {
    throw new Error("host-init admission identity changed during publication");
  }
  if (!samePhysicalIdentity(admissionParent, admissionParentIdentity, fs)) {
    throw new Error("host-init admission parent changed during publication");
  }
  fsyncDirectory(admissionParent, fs);
  const readback = readCodexHostRepositoryInitAdmission(root, {
    lstat: fs.lstatSync ?? lstatSync,
    readFile: fs.readFileSync ?? readFileSync,
    open: fs.openSync ?? openSync,
    fstat: fs.fstatSync ?? fstatSync,
    close: fs.closeSync ?? closeSync,
    fsConstants: fs.constants ?? constants,
    platform: fs.process?.platform ?? process.platform,
  });
  if (!readback || readback.gitVersion !== gitVersion || readback.repositoryMode !== "host-managed") {
    throw new Error("host-init admission exact readback failed");
  }
  if (sha256(Buffer.from(JSON.stringify(initialGitTree(git, fs)), "utf8")) !== gitTreeSha256) {
    throw new Error("Git control tree changed during admission publication");
  }
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
    const currentAdmission = readCodexHostRepositoryInitAdmission(root, {
      lstat: deps.lstatSync ?? lstatSync,
      readFile: deps.readFileSync ?? readFileSync,
      open: deps.openSync ?? openSync,
      fstat: deps.fstatSync ?? fstatSync,
      close: deps.closeSync ?? closeSync,
      fsConstants: deps.constants ?? constants,
      platform: deps.process?.platform ?? process.platform,
    });
    if (currentAdmission && exists(join(root, ".git"))
      && !exists(join(root, ".codex")) && !exists(join(root, ".agents"))) {
      return {
        schema: APPLY_SCHEMA,
        status: "restart-required",
        root,
        gitVersion: currentAdmission.gitVersion,
        branch: "main",
        createsCommit: false,
        operatorAction: "Restart the current project session once so Codex remounts the newly initialized repository.",
        diagnostics: [],
      };
    }
    const pendingPath = join(root, CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY);
    const resuming = exists(pendingPath);
    if (exists(join(root, ".codex")) || exists(join(root, ".agents"))
      || (exists(join(root, ".git")) && !resuming)) {
      return { schema: APPLY_SCHEMA, status: "host-preimage-changed", root, diagnostics: [{ code: "reserved_host_path_present" }] };
    }
    const transaction = prepareTransaction(root, planSha256, deps);
    const spawn = deps.spawnSync ?? spawnSync;
    const observed = spawn("git", ["--version"], { cwd: root, encoding: "utf8" });
    const currentGitVersion = !observed.error && observed.status === 0 ? parseGitVersion(observed.stdout) : null;
    if (!currentGitVersion) {
      return { schema: APPLY_SCHEMA, status: "git-unavailable", root, diagnostics: [{ code: "git_2_28_required" }] };
    }
    let gitControl;
    try {
      gitControl = prepareGitControl(
        root,
        planSha256,
        currentGitVersion,
        transaction.pendingPath,
        spawn,
        deps,
      );
    } catch {
      return {
        schema: APPLY_SCHEMA,
        status: "host-preimage-changed",
        root,
        diagnostics: [{ code: "pending_git_control_drift" }],
      };
    }
    if (gitControl.status === "git-init-failed") {
      return {
        schema: APPLY_SCHEMA,
        status: "apply-failed",
        root,
        diagnostics: [{ code: "git_init_failed_reserved_control_path_retained" }],
      };
    }
    const { gitIdentity, gitVersion, gitTreeSha256 } = gitControl;
    const gitTree = physicalTreeSnapshot(join(root, ".git"), deps);
    const created = {
      admission: null,
      history: null,
      intent: null,
      receipt: null,
      marker: null,
      directories: [],
    };
    try {
      bindPrivateContinuity(root, {
        planSha256,
        gitVersion,
        gitIdentity,
        gitTreeSha256,
        pendingPath: transaction.pendingPath,
        intentBytes: transaction.intentBytes,
      }, deps, created);
    } catch {
      try {
        removeCreatedFile(join(root, CODEX_HOST_REPOSITORY_INIT_MARKER), created.marker, deps);
        removeCreatedFile(join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT), created.receipt, deps);
        removeCreatedFile(join(root, CODEX_HOST_REPOSITORY_INIT_INTENT), created.intent, deps);
        removeCreatedDirectory(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY), created.admission, deps);
        removeCreatedFile(join(root, ".git/agent-pipeline/onboarding/continuity-history.json"), created.history, deps);
        for (const entry of [...created.directories].reverse()) {
          removeCreatedDirectory(entry.path, entry.identity, deps);
        }
        if (!samePhysicalIdentity(join(root, ".git"), gitIdentity, deps)
          || JSON.stringify(physicalTreeSnapshot(join(root, ".git"), deps))
            !== JSON.stringify(gitTree)) {
          throw new Error("reserved Git control path changed during rollback");
        }
      } catch {
        return { schema: APPLY_SCHEMA, status: "rollback-failed", root, diagnostics: [{ code: "host_init_identity_changed" }] };
      }
      return { schema: APPLY_SCHEMA, status: "apply-failed", root, diagnostics: [{ code: "continuity_binding_failed" }] };
    }
    try {
      removeCreatedFile(join(transaction.pendingPath, "intent.json"),
        physicalIdentity((deps.lstatSync ?? lstatSync)(join(transaction.pendingPath, "intent.json")), "file"),
        deps);
      removeCreatedFile(join(transaction.pendingPath, GIT_INITIALIZED_FILE),
        physicalIdentity((deps.lstatSync ?? lstatSync)(join(transaction.pendingPath, GIT_INITIALIZED_FILE)), "file"),
        deps);
      removeCreatedFile(join(transaction.pendingPath, GIT_RESERVATION_FILE),
        physicalIdentity((deps.lstatSync ?? lstatSync)(join(transaction.pendingPath, GIT_RESERVATION_FILE)), "file"),
        deps);
      removeCreatedDirectory(join(transaction.pendingPath, GIT_TEMPLATE_DIRECTORY),
        physicalIdentity((deps.lstatSync ?? lstatSync)(join(transaction.pendingPath, GIT_TEMPLATE_DIRECTORY)), "directory"),
        deps);
      removeCreatedDirectory(transaction.pendingPath,
        physicalIdentity((deps.lstatSync ?? lstatSync)(transaction.pendingPath), "directory"),
        deps);
      fsyncDirectory(join(root, ".claude/.runtime/agent-pipeline/onboarding"), deps);
    } catch {
      // The committed admission is already exact and authoritative. A stale
      // empty pending directory is non-authoritative and may be retained for
      // an attended hygiene pass without downgrading the committed result.
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
