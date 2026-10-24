// SPDX-License-Identifier: SUL-1.0
/** Prepare only committed npm prerequisites in an exact candidate worktree. */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { planEvidenceCommandLaunch } from "../scripts/capture-evidence.mjs";

export class CommitDependencyError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const refuse = (code, message) => { throw new CommitDependencyError(code, message); };
const exactNpmVersion = /^npm@([0-9]+\.[0-9]+\.[0-9]+)$/u;

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 10_000 });
  return result.status === 0 ? String(result.stdout).trim() : null;
}
function committedFile(root, path) {
  return git(root, ["ls-files", "--error-unmatch", "--", path]) === path;
}
function ordinaryFile(root, name) {
  const path = join(root, name);
  return existsSync(path) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink();
}

function sameDependencyMap(left, right) {
  const entries = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const pairs = Object.entries(value);
    if (pairs.some(([name, version]) => name.length === 0 || typeof version !== "string" || version.length === 0)) return null;
    return pairs.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  };
  const a = entries(left ?? {});
  const b = entries(right ?? {});
  return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}

/** Reuse the shipped Windows npm shim planner; resolve away from the candidate checkout. */
export function planCommitNpmInvocation(args, {
  root, npmExecutable = "npm", npmPrefixArgs = [], platform = process.platform,
  environment = process.env, lstatSyncFn = lstatSync,
  resolutionCwd = dirname(process.execPath),
} = {}) {
  const command = [npmExecutable, ...npmPrefixArgs, ...args];
  const plan = planEvidenceCommandLaunch(command, { cwd: resolutionCwd, platform, environment, lstatSyncFn });
  return { executable: plan.executable, args: plan.args, options: {
    cwd: root, env: environment, shell: false, windowsHide: true,
    ...(plan.windowsBatch ? { windowsVerbatimArguments: true } : {}),
  } };
}

export function prepareCommitWorktreeDependencies({ root, commit, npmExecutable = "npm", npmPrefixArgs = [] }) {
  if (git(root, ["rev-parse", "HEAD"]) !== commit || git(root, ["status", "--porcelain=v1"]) !== "") {
    refuse("VEP-DEPENDENCY-CANDIDATE", "Dependency preparation requires the clean exact candidate worktree.");
  }
  if (!committedFile(root, "package.json")) return { status: "not-required" };
  if (!ordinaryFile(root, "package.json")) refuse("VEP-DEPENDENCY-CONFIG", "Committed package.json must be an ordinary file.");
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")); }
  catch { refuse("VEP-DEPENDENCY-CONFIG", "Committed package.json is invalid JSON."); }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) refuse("VEP-DEPENDENCY-CONFIG", "Committed package.json is invalid.");
  const dependencyGroups = [manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies];
  if (dependencyGroups.some(group => group !== undefined && (!group || typeof group !== "object" || Array.isArray(group)))) {
    refuse("VEP-DEPENDENCY-CONFIG", "Committed package.json has invalid dependency declarations.");
  }
  if (!dependencyGroups.some(group => group && Object.keys(group).length > 0)) return { status: "not-required" };
  if (!committedFile(root, "package-lock.json") || !ordinaryFile(root, "package-lock.json")) {
    refuse("VEP-DEPENDENCY-LOCK", "Commit package-lock.json for this candidate before --commit Verify.");
  }
  let lock;
  try { lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")); }
  catch { refuse("VEP-DEPENDENCY-LOCK", "Committed package-lock.json is invalid JSON."); }
  if (![2, 3].includes(lock?.lockfileVersion) || !lock.packages?.[""] || typeof lock.packages[""] !== "object") {
    refuse("VEP-DEPENDENCY-LOCK", "Committed package-lock.json needs npm lockfile version 2 or 3 and a root package entry.");
  }
  for (const name of ["dependencies", "devDependencies", "optionalDependencies"]) {
    if (!sameDependencyMap(manifest[name], lock.packages[""][name])) {
      refuse("VEP-DEPENDENCY-LOCK", `Committed package-lock.json does not match package.json ${name}.`);
    }
  }
  const version = exactNpmVersion.exec(manifest.packageManager ?? "")?.[1];
  if (!version) refuse("VEP-DEPENDENCY-MANAGER", "Commit packageManager: npm@<exact-version> in package.json before --commit Verify.");
  if (existsSync(join(root, "node_modules"))) refuse("VEP-DEPENDENCY-EXISTING", "Candidate worktree already contains node_modules; refuse mutable dependency reuse.");
  const environment = Object.freeze({ ...process.env });
  let versionPlan; let installPlan;
  try {
    versionPlan = planCommitNpmInvocation(["--version"], { root, npmExecutable, npmPrefixArgs, environment });
    installPlan = planCommitNpmInvocation(["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { root, npmExecutable, npmPrefixArgs, environment });
  } catch (error) {
    refuse("VEP-DEPENDENCY-LAUNCH", `npm cannot be launched safely on this platform (${error.code ?? "unknown"}); select a supported npm executable and retry. Verify did not run.`);
  }
  const installed = spawnSync(versionPlan.executable, versionPlan.args, { ...versionPlan.options, encoding: "utf8", timeout: 30_000 });
  if (installed.status !== 0 || String(installed.stdout).trim() !== version) {
    refuse("VEP-DEPENDENCY-MANAGER", `The available npm must be exactly ${version}; install/select that version and retry.`);
  }
  const result = spawnSync(installPlan.executable, installPlan.args, {
    ...installPlan.options, stdio: "inherit", timeout: 300_000,
  });
  if (result.status !== 0) refuse("VEP-DEPENDENCY-SETUP", "npm ci failed in the candidate worktree; resolve the committed lockfile or package source and retry. Verify did not run.");
  if (git(root, ["rev-parse", "HEAD"]) !== commit || git(root, ["status", "--porcelain=v1"]) !== "") {
    refuse("VEP-DEPENDENCY-CANDIDATE", "Dependency setup changed the candidate worktree; no Verify evidence was written.");
  }
  return { status: "prepared", manager: `npm@${version}` };
}
