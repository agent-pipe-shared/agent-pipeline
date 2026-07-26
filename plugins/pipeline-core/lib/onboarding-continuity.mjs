// SPDX-License-Identifier: SUL-1.0

/**
 * Installed-plugin continuity classification and pristine kickoff transaction.
 *
 * This module intentionally does not import the Public-Core harness writer.
 * Kickoff is the one narrow installed-plugin initializer: it accepts only an
 * absent-pristine preimage, validates one closed revision-0 continuity state,
 * serializes against the ordinary State lock, atomically replaces three fixed
 * targets, and immediately projects the sanctioned continuity readback.
 */
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import { projectReadContinuityStatus } from "./continuity-status.mjs";
import { validateContinuityState } from "./continuity-state.mjs";
import { resolveOnboardingPrivateState } from "./codex-onboarding-runtime.mjs";
import { readState as readSanctionedState } from "../scripts/continuity-status.mjs";

export const KICKOFF_PLAN_SCHEMA = "pipeline.codex-onboarding-kickoff-plan.v1";
export const KICKOFF_HISTORY_SCHEMA = "pipeline.codex-onboarding-continuity-history.v1";
export const KICKOFF_APPLY_SCHEMA = "pipeline.codex-onboarding-kickoff-apply.v1";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ONBOARDING_SCRIPT = join(HERE, "..", "scripts", "project-onboarding-v3.mjs");
const STATE_RELATIVE_PATH = ".claude/pipeline-state.json";
const CALIBRATION_RELATIVE_PATH = ".claude/pipeline.json";
const INITIAL_PRD_RELATIVE_PATH = "specs/kickoff-initial-prd.md";
const INITIAL_SPEC_RELATIVE_PATH = "specs/kickoff-initial-spec.md";
const HISTORY_BASENAME = "continuity-history.json";
const SHA256_RE = /^[a-f0-9]{64}$/u;
const PLAN_KEYS = new Set([
  "schema", "root", "repositoryCapability", "goal", "goalSha256", "calibration",
  "targets", "transactionSha256", "onboardingScript", "planSha256", "applyAction",
]);
const TARGET_KEYS = {
  state: new Set(["path", "beforeSha256", "afterSha256", "value"]),
  handover: new Set(["path", "beforeSha256", "afterSha256", "content"]),
  prd: new Set(["path", "beforeSha256", "afterSha256", "content"]),
  spec: new Set(["path", "beforeSha256", "afterSha256", "content"]),
  history: new Set(["path", "beforeSha256", "afterSha256", "value"]),
};

export const KICKOFF_FAULT_STAGES = Object.freeze([
  "prd-temp-fsync",
  "spec-temp-fsync",
  "state-temp-fsync",
  "handover-temp-fsync",
  "history-temp-fsync",
  "prd-rename",
  "prd-directory-fsync",
  "spec-rename",
  "spec-directory-fsync",
  "handover-rename",
  "handover-directory-fsync",
  "history-rename",
  "history-directory-fsync",
  "state-rename",
  "state-directory-fsync",
]);

export class KickoffError extends Error {
  constructor(code, message, { committed = false } = {}) {
    super(message);
    this.name = "KickoffError";
    this.code = code;
    this.committed = committed;
  }
}

class SimulatedKickoffCrash extends Error {}

function fail(code, message, options = undefined) {
  throw new KickoffError(code, message, options);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return isObject(value)
    && Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function physicalRoot(rootDir) {
  let info;
  const requested = resolve(rootDir);
  try {
    info = lstatSync(requested);
  } catch {
    fail("KICKOFF-ROOT-UNAVAILABLE", "project root is unavailable");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("KICKOFF-ROOT-UNSAFE", "project root must be a physical directory");
  }
  const actual = realpathSync(requested);
  if (actual !== requested) fail("KICKOFF-ROOT-UNSAFE", "project root must not resolve through a symlink");
  return actual;
}

function safeRelativePath(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240
    || isAbsolute(value) || value.includes("\\") || value.includes("\0")) {
    fail("KICKOFF-PATH-UNSAFE", `${label} path is unsafe`);
  }
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    fail("KICKOFF-PATH-UNSAFE", `${label} path is unsafe`);
  }
  return value;
}

function absoluteProjectPath(root, relativePath, label) {
  safeRelativePath(relativePath, label);
  const path = resolve(root, relativePath);
  const rel = relative(root, path);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail("KICKOFF-PATH-UNSAFE", `${label} path escaped the project root`);
  }
  return path;
}

function assertPhysicalChain(root, path, { leafMayBeAbsent = true } = {}) {
  const rel = relative(root, path);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail("KICKOFF-PATH-UNSAFE", "project target escaped its root");
  }
  let cursor = root;
  const parts = rel.split(sep);
  for (let index = 0; index < parts.length; index += 1) {
    cursor = join(cursor, parts[index]);
    if (!existsSync(cursor)) {
      if (leafMayBeAbsent) return;
      fail("KICKOFF-PATH-UNAVAILABLE", "required project path is absent");
    }
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) fail("KICKOFF-PATH-UNSAFE", "project path contains a symlink");
    if (index < parts.length - 1 && !info.isDirectory()) {
      fail("KICKOFF-PATH-UNSAFE", "project path parent is not a directory");
    }
  }
}

function readPhysicalFile(path, label) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) fail("KICKOFF-PATH-UNSAFE", `${label} is not a physical regular file`);
  if ((info.mode & 0o444) === 0) fail("KICKOFF-READ-UNAVAILABLE", `${label} is unreadable`);
  try {
    return readFileSync(path);
  } catch {
    fail("KICKOFF-READ-UNAVAILABLE", `${label} is unreadable`);
  }
}

function observeOptionalProjectFile(root, relativePath, label) {
  const path = absoluteProjectPath(root, relativePath, label);
  assertPhysicalChain(root, path);
  if (!existsSync(path)) return { status: "absent", path, raw: null, sha256: null };
  const raw = readPhysicalFile(path, label);
  return { status: "present", path, raw, sha256: sha256(raw) };
}

function observeOptionalAbsoluteFile(path, label) {
  if (!existsSync(path)) return { status: "absent", path, raw: null, sha256: null };
  const raw = readPhysicalFile(path, label);
  return { status: "present", path, raw, sha256: sha256(raw) };
}

function parseJsonObject(observation, label) {
  let value;
  try {
    value = JSON.parse(observation.raw.toString("utf8"));
  } catch {
    fail("KICKOFF-READ-MALFORMED", `${label} is malformed`);
  }
  if (!isObject(value)) fail("KICKOFF-READ-MALFORMED", `${label} is not a JSON object`);
  return value;
}

function validateHistory(value) {
  const entryKeys = new Set([
    "kind", "transactionSha256", "goalSha256", "calibrationSha256",
    "stateSha256", "handoverSha256", "prdSha256", "specSha256",
  ]);
  if (!exactKeys(value, new Set(["schema", "transactions"]))
    || value.schema !== KICKOFF_HISTORY_SCHEMA
    || !Array.isArray(value.transactions)
    || value.transactions.length < 1
    || !value.transactions.every((entry) => exactKeys(entry, entryKeys)
      && entry.kind === "kickoff"
      && [
        "transactionSha256", "goalSha256", "calibrationSha256", "stateSha256",
        "handoverSha256", "prdSha256", "specSha256",
      ]
        .every((key) => SHA256_RE.test(entry[key])))) {
    fail("KICKOFF-HISTORY-MALFORMED", "private continuity history is malformed");
  }
  return true;
}

function defaultGitSpawn(executable, argv, options) {
  return spawnSync(executable, argv, options);
}

function resolvePrivate(root, repositoryCapability, {
  create = false,
  spawn = defaultGitSpawn,
  createdDirectories,
  createdDirectoryRecords,
} = {}) {
  try {
    return resolveOnboardingPrivateState(root, repositoryCapability, {
      create, spawn, createdDirectories, createdDirectoryRecords,
    });
  } catch {
    fail("KICKOFF-PRIVATE-UNAVAILABLE", "private onboarding state is unavailable");
  }
}

function observeDetailed({
  rootDir,
  repositoryCapability = "local",
  spawn = defaultGitSpawn,
} = {}) {
  const empty = {
    status: "unavailable",
    stateSha256: null,
    handoverSha256: null,
    historySha256: null,
  };
  let root;
  let stateObservation;
  let handoverObservation;
  let historyObservation;
  try {
    root = physicalRoot(rootDir);
    const calibrationObservation = observeOptionalProjectFile(root, CALIBRATION_RELATIVE_PATH, "Pipeline calibration");
    if (calibrationObservation.status !== "present") return { continuity: empty };
    const calibration = parseJsonObject(calibrationObservation, "Pipeline calibration");
    const handoverPath = calibration.handover === undefined
      ? "docs/state.md"
      : safeRelativePath(calibration.handover, "configured handover");
    if ([CALIBRATION_RELATIVE_PATH, STATE_RELATIVE_PATH].includes(handoverPath)
      || handoverPath === ".git" || handoverPath.startsWith(".git/")) {
      fail("KICKOFF-PATH-UNSAFE", "configured handover collides with a control path");
    }

    stateObservation = observeOptionalProjectFile(root, STATE_RELATIVE_PATH, "Pipeline machine state");
    handoverObservation = observeOptionalProjectFile(root, handoverPath, "configured handover");
    const privatePaths = resolvePrivate(root, repositoryCapability, { spawn });
    if (existsSync(privatePaths.directory) && (lstatSync(privatePaths.directory).mode & 0o777) !== 0o700) {
      fail("KICKOFF-PRIVATE-UNAVAILABLE", "private onboarding state directory is not mode 0700");
    }
    const historyPath = join(privatePaths.directory, HISTORY_BASENAME);
    historyObservation = observeOptionalAbsoluteFile(historyPath, "private continuity history");

    let history = null;
    if (historyObservation.status === "present") {
      if ((lstatSync(historyPath).mode & 0o777) !== 0o600) {
        fail("KICKOFF-PRIVATE-UNAVAILABLE", "private continuity history is not mode 0600");
      }
      history = parseJsonObject(historyObservation, "private continuity history");
      validateHistory(history);
    }

    const hashes = {
      stateSha256: stateObservation.sha256,
      handoverSha256: handoverObservation.sha256,
      historySha256: historyObservation.sha256,
    };
    if (stateObservation.status === "absent") {
      const status = handoverObservation.status === "absent" && historyObservation.status === "absent"
        ? "absent-pristine"
        : "damaged";
      return {
        continuity: { status, ...hashes },
        root,
        repositoryCapability,
        calibration,
        calibrationSha256: calibrationObservation.sha256,
        handoverPath,
        stateObservation,
        handoverObservation,
        historyObservation,
        history,
        privatePaths,
      };
    }

    const state = parseJsonObject(stateObservation, "Pipeline machine state");
    if (state.schema !== "pipeline.state.v0") {
      fail("KICKOFF-READ-MALFORMED", "Pipeline machine state schema is malformed");
    }
    const projected = projectReadContinuityStatus({ status: "ok", state });
    let status;
    if (projected.code === "CS-STATUS-ACTIVE" && projected.continuity.status === "valid") {
      status = "valid";
    } else if (new Set([
      "CS-STATUS-ACTIVE-NO-CONTINUITY",
      "CS-STATUS-CONTINUITY-INVALID",
      "CS-STATUS-ORPHAN-CONTINUITY",
      "CS-STATUS-ACTIVE-FEATURE-INVALID",
      "CS-STATUS-INACTIVE",
    ]).has(projected.code)) {
      status = "damaged";
    } else {
      status = "unavailable";
    }
    return {
      continuity: { status, ...hashes },
      root,
      repositoryCapability,
      calibration,
      calibrationSha256: calibrationObservation.sha256,
      handoverPath,
      stateObservation,
      handoverObservation,
      historyObservation,
      history,
      privatePaths,
      state,
      projected,
    };
  } catch (error) {
    if (!(error instanceof KickoffError)) throw error;
    let stateSha256 = stateObservation?.sha256 ?? null;
    let handoverSha256 = handoverObservation?.sha256 ?? null;
    let historySha256 = historyObservation?.sha256 ?? null;
    if (stateObservation === undefined) {
      try {
        if (root) {
          const state = observeOptionalProjectFile(root, STATE_RELATIVE_PATH, "Pipeline machine state");
          stateSha256 = state.sha256;
        }
      } catch { /* unavailable means unobserved */ }
    }
    return {
      continuity: { status: "unavailable", stateSha256, handoverSha256, historySha256 },
      error,
    };
  }
}

/** Classify exactly absent-pristine|valid|damaged|unavailable without writing. */
export function classifyOnboardingContinuity(options = {}) {
  return observeDetailed(options).continuity;
}

/** Trim and validate one goal as UTF-8 data, never as shell syntax. */
export function validateKickoffGoal(goal) {
  if (typeof goal !== "string" || goal.includes("\0")) {
    fail("KICKOFF-GOAL-INVALID", "goal must be NUL-free UTF-8 text");
  }
  const normalized = goal.trim();
  const bytes = Buffer.byteLength(normalized, "utf8");
  if (bytes < 1 || bytes > 8192) {
    fail("KICKOFF-GOAL-INVALID", "goal must contain 1-8192 UTF-8 bytes after trimming");
  }
  return normalized;
}

function projectGoal(goal) {
  return goal.split("\n").map((line) => `> ${line}`).join("\n");
}

function initialPrdContent(goal, goalSha256) {
  return [
    "# Initial product requirements",
    "",
    "## Goal",
    "",
    projectGoal(goal),
    "",
    "## Goal binding",
    "",
    `SHA-256: \`${goalSha256}\``,
    "",
    "## Initial acceptance",
    "",
    "- Refine this sanctioned kickoff artifact through the normal reviewed planning lifecycle.",
    "- Preserve the bound goal unless the PO explicitly changes project intent.",
    "",
  ].join("\n");
}

function initialSpecContent(goalSha256, prdSha256) {
  return [
    "# Initial technical specification",
    "",
    "## Authority binding",
    "",
    `- Goal SHA-256: \`${goalSha256}\``,
    `- Initial PRD SHA-256: \`${prdSha256}\``,
    "",
    "## Initial implementation contract",
    "",
    "Review the initial PRD, establish bounded implementation packages, and replace this",
    "kickoff specification only through the sanctioned reviewed planning lifecycle.",
    "",
  ].join("\n");
}

function handoverContent(goal, featureId, prdPath, specPath) {
  return [
    "# Project state",
    "",
    "## Goal",
    "",
    projectGoal(goal),
    "",
    "## Current state",
    "",
    `Feature \`${featureId}\` is active in design.`,
    `Initial PRD: \`${prdPath}\`.`,
    `Initial specification: \`${specPath}\`.`,
    "",
    "## Next action",
    "",
    "Review the goal and establish the initial PRD and technical specification.",
    "",
  ].join("\n");
}

function initialContinuity({ featureId, prdSha256, specSha256 }) {
  return {
    schema: "pipeline.continuity.v0",
    featureId,
    revision: 0,
    runtime: {
      humanFacingLanguage: "en",
      activeDuty: "Coordinator",
      sessionCleanup: null,
    },
    authority: {
      prd: { path: INITIAL_PRD_RELATIVE_PATH, sha256: prdSha256 },
      spec: { path: INITIAL_SPEC_RELATIVE_PATH, sha256: specSha256 },
      result: null,
    },
    queueHead: {
      packageId: "initial-planning",
      actionId: "review-goal",
      nextAction: "review",
      productRetryCount: 0,
      environmentRerouteCount: 0,
      dispatch: null,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: {
      mode: "resume-on-next-turn",
      sourceRevision: 0,
      reasonCode: "host-no-background-wakeup",
    },
    recovery: null,
    decisionTxn: null,
    capacity: {
      concurrencyLimit: 4,
      reservedCriticSlots: 1,
      reservedRecoverySlots: 1,
      fallbackPolicy: "defer",
    },
  };
}

function applyAction(onboardingScript, root, goal, planSha256) {
  return {
    kind: "command",
    executable: "node",
    argv: [
      onboardingScript,
      "kickoff",
      "apply",
      "--root",
      root,
      "--goal",
      goal,
      "--plan-sha256",
      planSha256,
      "--activate",
    ],
    mutation: true,
    requiresConfirmation: true,
    expected: {
      schema: "pipeline.project-onboarding.v4",
      statuses: ["ready"],
    },
  };
}

function planBinding(plan) {
  return {
    schema: plan.schema,
    root: plan.root,
    repositoryCapability: plan.repositoryCapability,
    goal: plan.goal,
    goalSha256: plan.goalSha256,
    calibration: plan.calibration,
    targets: plan.targets,
    transactionSha256: plan.transactionSha256,
    onboardingScript: plan.onboardingScript,
  };
}

function expectedStateBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function expectedHistoryBytes(value) {
  return Buffer.from(canonicalJson(value), "utf8");
}

function validatePlan(plan) {
  if (!exactKeys(plan, PLAN_KEYS)
    || plan.schema !== KICKOFF_PLAN_SCHEMA
    || !new Set(["local", "host-managed"]).has(plan.repositoryCapability)
    || !SHA256_RE.test(plan.goalSha256 ?? "")
    || !SHA256_RE.test(plan.transactionSha256 ?? "")
    || !SHA256_RE.test(plan.planSha256 ?? "")
    || !isAbsolute(plan.onboardingScript ?? "")
    || validateKickoffGoal(plan.goal) !== plan.goal
    || sha256(Buffer.from(plan.goal, "utf8")) !== plan.goalSha256
    || !exactKeys(plan.calibration, new Set(["path", "sha256"]))
    || plan.calibration.path !== CALIBRATION_RELATIVE_PATH
    || !SHA256_RE.test(plan.calibration.sha256 ?? "")
    || !exactKeys(plan.targets, new Set(["state", "handover", "prd", "spec", "history"]))
    || !exactKeys(plan.targets.state, TARGET_KEYS.state)
    || !exactKeys(plan.targets.handover, TARGET_KEYS.handover)
    || !exactKeys(plan.targets.prd, TARGET_KEYS.prd)
    || !exactKeys(plan.targets.spec, TARGET_KEYS.spec)
    || !exactKeys(plan.targets.history, TARGET_KEYS.history)) {
    fail("KICKOFF-PLAN-INVALID", "kickoff plan is not closed and valid");
  }
  const root = physicalRoot(plan.root);
  if (root !== plan.root
    || plan.targets.state.path !== STATE_RELATIVE_PATH
    || plan.targets.history.path !== HISTORY_BASENAME
    || plan.targets.prd.path !== INITIAL_PRD_RELATIVE_PATH
    || plan.targets.spec.path !== INITIAL_SPEC_RELATIVE_PATH
    || plan.targets.state.beforeSha256 !== null
    || plan.targets.handover.beforeSha256 !== null
    || plan.targets.prd.beforeSha256 !== null
    || plan.targets.spec.beforeSha256 !== null
    || plan.targets.history.beforeSha256 !== null) {
    fail("KICKOFF-PLAN-INVALID", "kickoff plan targets or preimages are invalid");
  }
  safeRelativePath(plan.targets.handover.path, "configured handover");
  const state = plan.targets.state.value;
  if (!exactKeys(state, new Set(["schema", "activeFeature", "planApproved", "continuity"]))
    || state.schema !== "pipeline.state.v0"
    || !exactKeys(state.activeFeature, new Set(["id", "planPath", "phase"]))
    || state.activeFeature.id !== state.continuity?.featureId
    || state.activeFeature.planPath !== plan.targets.spec.path
    || state.activeFeature.phase !== "design"
    || state.planApproved !== false
    || state.continuity.authority.prd.path !== plan.targets.prd.path
    || state.continuity.authority.prd.sha256 !== plan.targets.prd.afterSha256
    || state.continuity.authority.spec.path !== plan.targets.spec.path
    || state.continuity.authority.spec.sha256 !== plan.targets.spec.afterSha256
    || state.continuity.authority.prd.path === plan.targets.handover.path
    || state.continuity.authority.spec.path === plan.targets.handover.path
    || !validateContinuityState(state.continuity, state.activeFeature.id).ok) {
    fail("KICKOFF-PLAN-INVALID", "proposed Pipeline state is invalid");
  }
  const proposedReadback = projectReadContinuityStatus({ status: "ok", state });
  if (proposedReadback.code !== "CS-STATUS-ACTIVE" || proposedReadback.continuity.status !== "valid") {
    fail("KICKOFF-PLAN-INVALID", "proposed continuity does not pass sanctioned readback");
  }
  const stateBytes = expectedStateBytes(state);
  const handoverBytes = Buffer.from(plan.targets.handover.content, "utf8");
  const prdBytes = Buffer.from(plan.targets.prd.content, "utf8");
  const specBytes = Buffer.from(plan.targets.spec.content, "utf8");
  validateHistory(plan.targets.history.value);
  const historyBytes = expectedHistoryBytes(plan.targets.history.value);
  if (sha256(stateBytes) !== plan.targets.state.afterSha256
    || sha256(handoverBytes) !== plan.targets.handover.afterSha256
    || sha256(prdBytes) !== plan.targets.prd.afterSha256
    || sha256(specBytes) !== plan.targets.spec.afterSha256
    || sha256(historyBytes) !== plan.targets.history.afterSha256) {
    fail("KICKOFF-PLAN-INVALID", "kickoff postimage digest is invalid");
  }
  const transaction = {
    schema: "pipeline.codex-onboarding-kickoff-transaction.v1",
    root: plan.root,
    repositoryCapability: plan.repositoryCapability,
    goalSha256: plan.goalSha256,
    calibrationSha256: plan.calibration.sha256,
    prdSha256: plan.targets.prd.afterSha256,
    specSha256: plan.targets.spec.afterSha256,
    stateSha256: plan.targets.state.afterSha256,
    handoverSha256: plan.targets.handover.afterSha256,
  };
  if (canonicalSha256(transaction) !== plan.transactionSha256
    || plan.targets.history.value.transactions.length !== 1
    || canonicalJson(plan.targets.history.value.transactions[0]) !== canonicalJson({
      kind: "kickoff",
      transactionSha256: plan.transactionSha256,
      goalSha256: plan.goalSha256,
      calibrationSha256: plan.calibration.sha256,
      prdSha256: plan.targets.prd.afterSha256,
      specSha256: plan.targets.spec.afterSha256,
      stateSha256: plan.targets.state.afterSha256,
      handoverSha256: plan.targets.handover.afterSha256,
    })
    || canonicalSha256(planBinding(plan)) !== plan.planSha256) {
    fail("KICKOFF-PLAN-INVALID", "kickoff transaction binding is invalid");
  }
  if (canonicalJson(plan.applyAction) !== canonicalJson(
    applyAction(plan.onboardingScript, plan.root, plan.goal, plan.planSha256),
  )) {
    fail("KICKOFF-PLAN-INVALID", "kickoff apply action is invalid");
  }
  return {
    stateBytes,
    handoverBytes,
    prdBytes,
    specBytes,
    historyBytes,
    proposedReadback,
  };
}

/**
 * Produce one deterministic plan. The observation and construction path has no
 * mkdir, lock, temporary file, or private-state write.
 */
function buildOnboardingKickoffPlan({
  rootDir,
  goal,
  repositoryCapability = "local",
  onboardingScript = DEFAULT_ONBOARDING_SCRIPT,
  spawn = defaultGitSpawn,
  allowAppliedReplay = false,
} = {}) {
  const normalizedGoal = validateKickoffGoal(goal);
  if (!isAbsolute(onboardingScript)) fail("KICKOFF-PLAN-INVALID", "onboarding script must be absolute");
  const observed = observeDetailed({ rootDir, repositoryCapability, spawn });
  const replay = allowAppliedReplay && observed.continuity.status === "valid";
  if (observed.continuity.status !== "absent-pristine" && !replay) {
    fail("KICKOFF-NOT-PRISTINE", "kickoff is permitted only for absent-pristine continuity");
  }
  const authorityObservations = Object.fromEntries([
    ["prd", INITIAL_PRD_RELATIVE_PATH, "initial PRD"],
    ["spec", INITIAL_SPEC_RELATIVE_PATH, "initial specification"],
  ].map(([key, path, label]) => [key, observeOptionalProjectFile(observed.root, path, label)]));
  if (!replay) {
    for (const [key, label] of [["prd", "initial PRD"], ["spec", "initial specification"]]) {
      if (authorityObservations[key].status !== "absent") {
      fail("KICKOFF-NOT-PRISTINE", `${label} target already exists`);
      }
    }
  }
  const goalSha256 = sha256(Buffer.from(normalizedGoal, "utf8"));
  const featureId = `kickoff-${goalSha256.slice(0, 16)}`;
  const prdContent = initialPrdContent(normalizedGoal, goalSha256);
  const prdSha256 = sha256(Buffer.from(prdContent, "utf8"));
  const specContent = initialSpecContent(goalSha256, prdSha256);
  const specSha256 = sha256(Buffer.from(specContent, "utf8"));
  const content = handoverContent(
    normalizedGoal,
    featureId,
    INITIAL_PRD_RELATIVE_PATH,
    INITIAL_SPEC_RELATIVE_PATH,
  );
  const handoverSha256 = sha256(Buffer.from(content, "utf8"));
  const continuity = initialContinuity({ featureId, prdSha256, specSha256 });
  const state = {
    schema: "pipeline.state.v0",
    activeFeature: {
      id: featureId,
      planPath: INITIAL_SPEC_RELATIVE_PATH,
      phase: "design",
    },
    planApproved: false,
    continuity,
  };
  const valid = validateContinuityState(continuity, featureId);
  if (!valid.ok) fail("KICKOFF-PLAN-INVALID", `initial continuity was rejected (${valid.code})`);
  const stateSha256 = sha256(expectedStateBytes(state));
  const transaction = {
    schema: "pipeline.codex-onboarding-kickoff-transaction.v1",
    root: observed.root,
    repositoryCapability,
    goalSha256,
    calibrationSha256: observed.calibrationSha256,
    prdSha256,
    specSha256,
    stateSha256,
    handoverSha256,
  };
  const transactionSha256 = canonicalSha256(transaction);
  const history = {
    schema: KICKOFF_HISTORY_SCHEMA,
    transactions: [{
      kind: "kickoff",
      transactionSha256,
      goalSha256,
      calibrationSha256: observed.calibrationSha256,
      prdSha256,
      specSha256,
      stateSha256,
      handoverSha256,
    }],
  };
  const targets = {
    state: {
      path: STATE_RELATIVE_PATH,
      beforeSha256: null,
      afterSha256: stateSha256,
      value: state,
    },
    handover: {
      path: observed.handoverPath,
      beforeSha256: null,
      afterSha256: handoverSha256,
      content,
    },
    prd: {
      path: INITIAL_PRD_RELATIVE_PATH,
      beforeSha256: null,
      afterSha256: prdSha256,
      content: prdContent,
    },
    spec: {
      path: INITIAL_SPEC_RELATIVE_PATH,
      beforeSha256: null,
      afterSha256: specSha256,
      content: specContent,
    },
    history: {
      path: HISTORY_BASENAME,
      beforeSha256: null,
      afterSha256: sha256(expectedHistoryBytes(history)),
      value: history,
    },
  };
  const binding = {
    schema: KICKOFF_PLAN_SCHEMA,
    root: observed.root,
    repositoryCapability,
    goal: normalizedGoal,
    goalSha256,
    calibration: {
      path: CALIBRATION_RELATIVE_PATH,
      sha256: observed.calibrationSha256,
    },
    targets,
    transactionSha256,
    onboardingScript,
  };
  const planSha256 = canonicalSha256(binding);
  const plan = {
    ...binding,
    planSha256,
    applyAction: applyAction(onboardingScript, observed.root, normalizedGoal, planSha256),
  };
  validatePlan(plan);
  if (replay) {
    const current = {
      state: observed.stateObservation,
      handover: observed.handoverObservation,
      prd: authorityObservations.prd,
      spec: authorityObservations.spec,
      history: observed.historyObservation,
    };
    if (Object.entries(current).some(([key, observation]) => (
      observation?.status !== "present" || observation.sha256 !== plan.targets[key].afterSha256
    ))) {
      fail("KICKOFF-CAS-DRIFT", "completed kickoff does not match the reconstructed goal-bound plan");
    }
  }
  return plan;
}

export function planOnboardingKickoff(options = {}) {
  return buildOnboardingKickoffPlan(options);
}

/**
 * Reconstruct the same closed goal-bound plan for public apply. Exact completed
 * postimages are accepted solely to make a digest-identical apply replayable.
 */
export function reconstructOnboardingKickoffPlan(options = {}) {
  return buildOnboardingKickoffPlan({ ...options, allowAppliedReplay: true });
}

function fsyncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    fsyncSync(fd);
  } catch (error) {
    if (!(process.platform === "win32"
      && ["EPERM", "EINVAL", "EISDIR", "ENOTSUP", "EBADF"].includes(error?.code))) {
      throw error;
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function sameDirectoryIdentity(record) {
  try {
    const info = lstatSync(record.path);
    return info.isDirectory() && !info.isSymbolicLink()
      && String(info.dev) === record.dev && String(info.ino) === record.ino;
  } catch { return false; }
}

function sameFileIdentity(record) {
  try {
    const info = lstatSync(record.path);
    return info.isFile() && !info.isSymbolicLink()
      && String(info.dev) === record.dev && String(info.ino) === record.ino
      && sha256(readFileSync(record.path)) === record.sha256;
  } catch { return false; }
}

function rollbackCreatedDirectories(records) {
  const failures = [];
  for (const record of [...records].reverse()) {
    try {
      if (!existsSync(record.path)) continue;
      if (!sameDirectoryIdentity(record) || readdirSync(record.path).length !== 0) {
        throw new Error("created kickoff directory changed before rollback");
      }
      rmdirSync(record.path);
      fsyncDirectory(dirname(record.path));
    } catch (error) { failures.push(error); }
  }
  if (failures.length) fail("KICKOFF-ROLLBACK-INDETERMINATE", "kickoff directory rollback disposition is indeterminate");
}

function ensurePhysicalParent(root, target, createdDirectories = []) {
  const rel = relative(root, dirname(target));
  if (rel === "" || rel === ".") return;
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail("KICKOFF-PATH-UNSAFE", "kickoff target parent escaped its root");
  }
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    if (!existsSync(cursor)) {
      mkdirSync(cursor, { mode: 0o755 });
      const created = lstatSync(cursor);
      createdDirectories.push({ path: cursor, dev: String(created.dev), ino: String(created.ino) });
    }
    const info = lstatSync(cursor);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      fail("KICKOFF-PATH-UNSAFE", "kickoff target parent is unsafe");
    }
  }
}

function writeExclusiveSynced(path, bytes, mode) {
  let fd;
  let identity;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), mode);
    const opened = fstatSync(fd);
    identity = { path, dev: String(opened.dev), ino: String(opened.ino), sha256: sha256(bytes) };
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    return identity;
  } catch (error) {
    if (identity && existsSync(path) && sameFileIdentity(identity)) {
      try { unlinkSync(path); fsyncDirectory(dirname(path)); } catch {}
    }
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function unlinkOwned(record) {
  if (!record || !existsSync(record.path)) return;
  if (!sameFileIdentity(record)) throw new Error("kickoff artifact identity changed before cleanup");
  unlinkSync(record.path);
  fsyncDirectory(dirname(record.path));
}

function lockRecord(schema, token, ownerNonce, acquiredAtMs) {
  return {
    schema,
    token,
    ownerNonce,
    acquiredAtMs,
  };
}

function parseLock(path, schema) {
  try {
    const value = JSON.parse(readPhysicalFile(path, "kickoff writer lock").toString("utf8"));
    if (!exactKeys(value, new Set(["schema", "token", "ownerNonce", "acquiredAtMs"]))
      || value.schema !== schema
      || typeof value.token !== "string"
      || typeof value.ownerNonce !== "string"
      || !Number.isSafeInteger(value.acquiredAtMs)
      || value.acquiredAtMs < 0) return null;
    return value;
  } catch {
    return null;
  }
}

function publishLock(path, record) {
  writeExclusiveSynced(path, Buffer.from(`${JSON.stringify(record)}\n`, "utf8"), 0o600);
  fsyncDirectory(dirname(path));
}

function acquireLock(path, schema, token, { nowMs = Date.now, lockStaleMs = 30_000 } = {}) {
  const clock = typeof nowMs === "function" ? nowMs : () => nowMs;
  const acquiredAtMs = clock();
  if (!Number.isSafeInteger(acquiredAtMs) || acquiredAtMs < 0
    || !Number.isSafeInteger(lockStaleMs) || lockStaleMs < 0) {
    fail("KICKOFF-LOCKED", "kickoff lock clock is invalid");
  }
  const ownerNonce = randomUUID();
  const record = lockRecord(schema, token, ownerNonce, acquiredAtMs);
  try {
    publishLock(path, record);
    return { path, record, recovered: false };
  } catch (error) {
    if (error?.code !== "EEXIST") fail("KICKOFF-LOCKED", "kickoff writer lock is unavailable");
  }

  const observed = parseLock(path, schema);
  if (observed === null
    || observed.token !== token
    || acquiredAtMs - observed.acquiredAtMs < lockStaleMs) {
    fail("KICKOFF-LOCKED", "kickoff writer lock is unavailable");
  }
  const recoveryPath = `${path}.recover`;
  try {
    publishLock(recoveryPath, record);
  } catch {
    fail("KICKOFF-LOCKED", "kickoff lock recovery is unavailable");
  }
  let recovered = false;
  try {
    const current = parseLock(path, schema);
    if (current === null
      || canonicalJson(current) !== canonicalJson(observed)
      || acquiredAtMs - current.acquiredAtMs < lockStaleMs) {
      fail("KICKOFF-LOCKED", "kickoff lock changed during recovery");
    }
    unlinkSync(path);
    fsyncDirectory(dirname(path));
    publishLock(path, record);
    recovered = true;
    unlinkSync(recoveryPath);
    fsyncDirectory(dirname(path));
    return { path, record, recovered: true };
  } finally {
    if (!recovered) {
      // A recovery guard with uncertain disposition deliberately remains. It
      // prevents either writer from claiming a second owner.
    }
  }
}

function releaseLock(lock) {
  let current;
  try {
    current = JSON.parse(readPhysicalFile(lock.path, "kickoff writer lock").toString("utf8"));
  } catch {
    return false;
  }
  if (canonicalJson(current) !== canonicalJson(lock.record)) return false;
  try {
    unlinkSync(lock.path);
    fsyncDirectory(dirname(lock.path));
    return true;
  } catch {
    return false;
  }
}

function currentTarget(path, expectedSha256) {
  if (!existsSync(path)) return { status: "absent", sha256: null };
  const raw = readPhysicalFile(path, "kickoff target");
  const actual = sha256(raw);
  return { status: actual === expectedSha256 ? "exact" : "conflict", sha256: actual };
}

function resultFromPersisted(plan, status, mutated, spawn = defaultGitSpawn) {
  const readback = projectReadContinuityStatus(readSanctionedState(plan.root));
  if (readback.code !== "CS-STATUS-ACTIVE" || readback.continuity.status !== "valid") {
    fail("KICKOFF-READBACK-INVALID", "sanctioned continuity readback rejected kickoff");
  }
  const continuity = classifyOnboardingContinuity({
    rootDir: plan.root,
    repositoryCapability: plan.repositoryCapability,
    spawn,
  });
  if (continuity.status !== "valid"
    || continuity.stateSha256 !== plan.targets.state.afterSha256
    || continuity.handoverSha256 !== plan.targets.handover.afterSha256
    || continuity.historySha256 !== plan.targets.history.afterSha256) {
    fail("KICKOFF-READBACK-INVALID", "kickoff hashes did not validate immediately");
  }
  return {
    schema: KICKOFF_APPLY_SCHEMA,
    status,
    root: plan.root,
    planSha256: plan.planSha256,
    mutated,
    continuity,
    readback,
  };
}

/**
 * Apply one closed plan. The public CLI reconstructs this object from the
 * separately validated goal argv element; this writer never invents or
 * recovers a goal from a digest, cache, environment variable, or file payload.
 */
export function applyOnboardingKickoff({
  plan,
  expectedPlanSha256,
  activate = false,
  deps = {},
} = {}) {
  if (activate !== true) fail("KICKOFF-ACTIVATION-REQUIRED", "kickoff apply requires explicit activation");
  if (!SHA256_RE.test(expectedPlanSha256 ?? "") || plan?.planSha256 !== expectedPlanSha256) {
    fail("KICKOFF-PLAN-DIGEST", "kickoff plan digest does not match");
  }
  const bytes = validatePlan(plan);
  if (canonicalSha256(planBinding(plan)) !== expectedPlanSha256) {
    fail("KICKOFF-PLAN-DIGEST", "kickoff plan digest does not authenticate the plan");
  }

  const privatePaths = resolvePrivate(plan.root, plan.repositoryCapability, {
    create: false,
    spawn: deps.spawn ?? defaultGitSpawn,
  });
  const paths = {
    state: absoluteProjectPath(plan.root, plan.targets.state.path, "Pipeline machine state"),
    handover: absoluteProjectPath(plan.root, plan.targets.handover.path, "configured handover"),
    prd: absoluteProjectPath(plan.root, plan.targets.prd.path, "initial PRD"),
    spec: absoluteProjectPath(plan.root, plan.targets.spec.path, "initial specification"),
    history: join(privatePaths.directory, HISTORY_BASENAME),
  };
  const token = `kickoff-${plan.planSha256.slice(0, 40)}`;
  const lockOptions = {
    nowMs: deps.nowMs ?? Date.now,
    lockStaleMs: deps.lockStaleMs ?? 30_000,
  };
  const stateLock = acquireLock(
    `${paths.state}.lock`,
    "pipeline.continuity-lock.v0",
    token,
    lockOptions,
  );
  let privateLock;
  let wroteTargets = false;
  let simulatedCrash = false;
  let rollbackAuthorized = false;
  let cleanupCreatedDirectories = false;
  const createdProjectDirectories = [];
  const createdPrivateDirectories = [];
  const temporaryRecords = {};
  const publishedRecords = {};
  const proposedBytes = {
    state: bytes.stateBytes,
    handover: bytes.handoverBytes,
    prd: bytes.prdBytes,
    spec: bytes.specBytes,
    history: bytes.historyBytes,
  };
  const proposedHashes = {
    state: plan.targets.state.afterSha256,
    handover: plan.targets.handover.afterSha256,
    prd: plan.targets.prd.afterSha256,
    spec: plan.targets.spec.afterSha256,
    history: plan.targets.history.afterSha256,
  };
  try {
    const createdPrivatePaths = resolvePrivate(plan.root, plan.repositoryCapability, {
      create: true,
      spawn: deps.spawn ?? defaultGitSpawn,
      createdDirectories: [],
      createdDirectoryRecords: createdPrivateDirectories,
    });
    if (createdPrivatePaths.directory !== privatePaths.directory) {
      fail("KICKOFF-PRIVATE-UNAVAILABLE", "private onboarding state changed during kickoff");
    }
    privateLock = acquireLock(
      join(privatePaths.directory, ".kickoff-writer.lock"),
      "pipeline.codex-onboarding-kickoff-lock.v1",
      token,
      lockOptions,
    );
    const targets = Object.fromEntries(Object.keys(paths).map((key) => [
      key,
      currentTarget(paths[key], proposedHashes[key]),
    ]));
    if (Object.values(targets).every((target) => target.status === "exact")) {
      return resultFromPersisted(plan, "replayed", false, deps.spawn ?? defaultGitSpawn);
    }
    if (Object.values(targets).some((target) => target.status === "conflict")) {
      fail("KICKOFF-CAS-DRIFT", "kickoff target preimage drifted");
    }
    const targetOrder = ["prd", "spec", "handover", "history", "state"];
    const exactCount = targetOrder.filter((key) => targets[key].status === "exact").length;
    const interruptedPrefix = targetOrder.every((key, index) => (
      index < exactCount ? targets[key].status === "exact" : targets[key].status === "absent"
    ));
    if (exactCount > 0 && (!interruptedPrefix || !stateLock.recovered || !privateLock.recovered)) {
      fail("KICKOFF-CAS-DRIFT", "kickoff target preimage drifted");
    }
    const observed = observeDetailed({
      rootDir: plan.root,
      repositoryCapability: plan.repositoryCapability,
      spawn: deps.spawn ?? defaultGitSpawn,
    });
    if (exactCount === 0 && (observed.continuity.status !== "absent-pristine"
      || observed.calibrationSha256 !== plan.calibration.sha256
      || observed.handoverPath !== plan.targets.handover.path)) {
      fail("KICKOFF-CAS-DRIFT", "kickoff continuity/calibration CAS drifted");
    }
    if (exactCount > 0 && observed.calibrationSha256 !== plan.calibration.sha256) {
      fail("KICKOFF-CAS-DRIFT", "kickoff calibration CAS drifted during recovery");
    }
    rollbackAuthorized = true;

    ensurePhysicalParent(plan.root, paths.handover, createdProjectDirectories);
    ensurePhysicalParent(plan.root, paths.prd, createdProjectDirectories);
    ensurePhysicalParent(plan.root, paths.spec, createdProjectDirectories);
    const suffixSource = (deps.randomUUID ?? randomUUID)();
    if (typeof suffixSource !== "string" || !/^[a-f0-9-]{32,64}$/iu.test(suffixSource)) {
      fail("KICKOFF-RANDOM-UNAVAILABLE", "kickoff temporary-name source is invalid");
    }
    const suffix = suffixSource.replaceAll("-", "");
    const temporary = {
      state: join(dirname(paths.state), `.${basename(paths.state)}.kickoff-${suffix}.tmp`),
      handover: join(dirname(paths.handover), `.${basename(paths.handover)}.kickoff-${suffix}.tmp`),
      prd: join(dirname(paths.prd), `.${basename(paths.prd)}.kickoff-${suffix}.tmp`),
      spec: join(dirname(paths.spec), `.${basename(paths.spec)}.kickoff-${suffix}.tmp`),
      history: join(dirname(paths.history), `.${basename(paths.history)}.kickoff-${suffix}.tmp`),
    };

    const fault = (point) => {
      if (deps.crashAt === point) throw new SimulatedKickoffCrash(point);
      (deps.fault ?? (() => {}))(point);
    };
    for (const key of ["prd", "spec", "state", "handover", "history"]) {
      if (targets[key].status === "exact") continue;
      temporaryRecords[key] = writeExclusiveSynced(
        temporary[key],
        proposedBytes[key],
        new Set(["state", "history"]).has(key) ? 0o600 : 0o644,
      );
      fault(`${key}-temp-fsync`);
    }
    for (const key of targetOrder) {
      if (targets[key].status === "exact") continue;
      if (existsSync(paths[key])) fail("KICKOFF-CAS-DRIFT", "kickoff target appeared before publication");
      renameSync(temporary[key], paths[key]);
      publishedRecords[key] = { ...temporaryRecords[key], path: paths[key] };
      wroteTargets = true;
      fault(`${key}-rename`);
      fsyncDirectory(dirname(paths[key]));
      fault(`${key}-directory-fsync`);
    }
    return resultFromPersisted(plan, "applied", true, deps.spawn ?? defaultGitSpawn);
  } catch (error) {
    if (error instanceof SimulatedKickoffCrash) {
      simulatedCrash = true;
      throw new KickoffError("KICKOFF-SIMULATED-CRASH", `simulated crash at ${error.message}`, {
        committed: wroteTargets ? null : false,
      });
    }
    cleanupCreatedDirectories = true;
    if (!rollbackAuthorized) throw error;
    let rollbackFailed = false;
    for (const key of ["state", "history", "handover", "spec", "prd"]) {
      try {
        unlinkOwned(publishedRecords[key]);
        unlinkOwned(temporaryRecords[key]);
      } catch {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) {
      fail("KICKOFF-ROLLBACK-INDETERMINATE", "kickoff rollback disposition is indeterminate", {
        committed: wroteTargets ? null : false,
      });
    }
    if (error instanceof KickoffError || /^KICKOFF-/u.test(error?.code ?? "")) throw error;
    fail("KICKOFF-WRITE-FAILED", "kickoff transaction failed before commit");
  } finally {
    if (!simulatedCrash && privateLock && !releaseLock(privateLock)) {
      // A retained lock fails the next writer closed. Never report it as a
      // successful unlock or steal it under a different plan.
    }
    if (!simulatedCrash && !releaseLock(stateLock)) {
      // Same fail-closed disposition as the private lock.
    }
    if (!simulatedCrash && cleanupCreatedDirectories) {
      rollbackCreatedDirectories([...createdPrivateDirectories, ...createdProjectDirectories]);
    }
  }
}
