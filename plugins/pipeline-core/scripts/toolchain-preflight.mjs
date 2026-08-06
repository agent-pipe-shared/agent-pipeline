#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Capability-completeness projection (AC10, CYB-2G) -------------------------
 *
 * `evaluateCapabilityCompleteness(preflightResult, requiredCapabilities)`
 * (defined below, after `runToolchainPreflight()`) is a pure, read-only
 * derivation over an ALREADY-COMPUTED `runToolchainPreflight()` output. It
 * never probes, never touches the filesystem or git, and never re-runs any
 * check -- it only reads `preflightResult.results` (the tool -> status array
 * `runToolchainPreflight()` already produced) plus the caller-supplied list
 * of required `cap.*` ids. `preflightResult` is exactly the object
 * `runToolchainPreflight()` returns (or an equivalently shaped fixture).
 *
 * Tool -> capability-root mapping (CYB-1F Section 3 frozen thirteen roots;
 * only the roots an actual `FIXED_TOOLS` scanner backs today are reachable):
 *   gitleaks     -> cap.secrets
 *   osv-scanner  -> cap.sca
 *   semgrep      -> cap.sast
 * `node` and `git` are toolchain prerequisites, not security capabilities,
 * and are excluded from the capability-level report entirely. `license-check`
 * is a catalog CONTROL, not a capability family (CYB-1F F-4, ratified
 * 2026-07-25) -- it never receives a cap.* required/missing/unsupported/
 * available/optional verdict. Its own readiness is surfaced only through the
 * informative `licenseControl` field on the report (design-latitude call for
 * this task: an informative field, not simply omitted, so a caller can still
 * see whether the license-check control is ready without ever mistaking it
 * for a capability-root verdict).
 *
 * Five-state decision logic. Every candidate `cap.*` id (the union of the
 * caller's `requiredCapabilities` and every `cap.*` root the preflight result
 * has information about) is classified by a 2x3 matrix over
 * (listed-by-caller? x underlying-tool-readiness):
 *
 *   |                  | tool ready | tool exists, not ready | no tool maps |
 *   | ---------------- | ---------- | ----------------------- | ------------ |
 *   | in requiredCaps  | required   | missing                 | unsupported  |
 *   | not in requiredCaps | available | optional              | (omitted)    |
 *
 *   - "required": in the caller's list and the mapped tool's status is
 *     "ready".
 *   - "missing": in the caller's list, a tool maps to it, but that tool's
 *     status is anything other than "ready" (binary_missing, not_required
 *     because the scanner is disabled in the manifest, incompatible_version,
 *     probe_error, etc).
 *   - "unsupported": in the caller's list, but no known tool maps to this
 *     cap.* root at all in this codebase today.
 *   - "available": NOT in the caller's list, a tool maps to it, and the
 *     preflight result shows that tool is "ready".
 *   - "optional": NOT in the caller's list, a tool maps to it, and the
 *     preflight result has information about it (a status other than the
 *     baseline "not_required") but that status is not "ready".
 *   - (omitted): NOT in the caller's list AND (no tool maps to it, OR the
 *     mapped tool's status is absent/"not_required", i.e. the preflight has
 *     no information about it at all) -- dropped from the report entirely
 *     rather than surfaced as a sixth "not-applicable" verdict.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadManifest } from "../lib/manifest.mjs";
import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
import { probeGitleaks } from "./security-readiness/gitleaks-readiness.mjs";
import { probeOsvScanner } from "./security-readiness/osv-scanner-readiness.mjs";
import { probeSemgrep } from "./security-readiness/semgrep-readiness.mjs";
import { buildHandle, executableIdentity, resolveSystemExecutable, resolveTrustedSystemExecutable, runProbe, sha256 } from "./tool-identity.mjs";

export const TOOLCHAIN_SCHEMA = "pipeline.toolchain-preflight.v1";
export const FIXED_TOOLS = Object.freeze(["node", "git", "gitleaks", "osv-scanner", "semgrep", "license-check"]);
const KNOWN_SCANNERS = new Set(["gitleaks", "osv-scanner", "semgrep", "license-check"]);
const STATUS_PRECEDENCE = Object.freeze(["execution_environment", "untrusted_path", "binary_missing", "input_missing", "probe_timeout", "probe_error", "incompatible_version", "incompatible_capability"]);
const REQUIRED_CAPABILITIES = Object.freeze({ gitleaks: ["--source", "--report-format", "--report-path", "--no-banner", "--exit-code"], "osv-scanner": ["--format", "recursive-source"], semgrep: ["--json", "--config"] });
const GUIDANCE = Object.freeze({
  linux: { node: "Install Node.js 24 or newer from the platform package policy.", git: "Install Git with rev-parse and diff support.", gitleaks: "Install a compatible Gitleaks binary in a recognized system, ~/.local/bin, or ~/go/bin location.", "osv-scanner": "Install OSV-Scanner 2.x in a recognized system, ~/.local/bin, or ~/go/bin location.", semgrep: "Install Semgrep with pipx or place a compatible binary in a recognized location.", "license-check": "Create the configured allowlist and third-party-licenses.json as regular files." },
  darwin: { node: "Install Node.js 24 or newer through the managed macOS toolchain.", git: "Install Xcode Command Line Tools or managed Git.", gitleaks: "Install managed Gitleaks.", "osv-scanner": "Install managed OSV-Scanner 2.x.", semgrep: "Install managed Semgrep.", "license-check": "Create the configured license inputs." },
  win32: { node: "Install Node.js 24 or newer through the managed Windows toolchain.", git: "Install Git for Windows.", gitleaks: "Install managed Gitleaks.", "osv-scanner": "Install managed OSV-Scanner 2.x.", semgrep: "Install managed Semgrep.", "license-check": "Create the configured license inputs." },
  unsupported: { node: "Use a supported linux, darwin, or win32 runner.", git: "Use a supported linux, darwin, or win32 runner.", gitleaks: "Use a supported runner.", "osv-scanner": "Use a supported runner.", semgrep: "Use a supported runner.", "license-check": "Use a supported runner." },
});
const INSTALLER_NAMES = Object.freeze(["apt-get", "brew", "go", "pipx", "sudo", "winget"]);

function installCommandFor(platform, tool, installers) {
  const has = (name) => installers.has(name);
  if (platform === "linux") {
    if (tool === "node" && has("apt-get") && has("sudo")) return "sudo apt-get update && sudo apt-get install -y nodejs";
    if (tool === "git" && has("apt-get") && has("sudo")) return "sudo apt-get update && sudo apt-get install -y git";
    if (tool === "gitleaks") {
      if (has("go")) return "go install github.com/zricethezav/gitleaks/v8@latest";
      if (has("apt-get") && has("sudo")) return "sudo apt-get update && sudo apt-get install -y golang-go && go install github.com/zricethezav/gitleaks/v8@latest";
    }
    if (tool === "osv-scanner") {
      if (has("go")) return "go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest";
      if (has("apt-get") && has("sudo")) return "sudo apt-get update && sudo apt-get install -y golang-go && go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest";
    }
    if (tool === "semgrep") {
      if (has("pipx")) return "pipx install semgrep";
      if (has("apt-get") && has("sudo")) return "sudo apt-get update && sudo apt-get install -y pipx && pipx install semgrep";
    }
    return null;
  }
  if (platform === "darwin") {
    if (has("brew") && tool === "node") return "brew install node@24";
    if (tool === "git") return "xcode-select --install";
    if (has("brew") && ["gitleaks", "osv-scanner", "semgrep"].includes(tool)) return `brew install ${tool}`;
    if (has("go") && tool === "gitleaks") return "go install github.com/zricethezav/gitleaks/v8@latest";
    if (has("go") && tool === "osv-scanner") return "go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest";
    if (has("pipx") && tool === "semgrep") return "pipx install semgrep";
    return null;
  }
  if (platform === "win32") {
    if (has("winget") && tool === "node") return "winget install OpenJS.NodeJS.LTS";
    if (has("winget") && tool === "git") return "winget install Git.Git";
    if (has("go") && tool === "gitleaks") return "go install github.com/zricethezav/gitleaks/v8@latest";
    if (has("winget") && tool === "osv-scanner") return "winget install Google.OSVScanner";
    if (has("pipx") && tool === "semgrep") return "pipx install semgrep";
  }
  return null;
}

function semver(value) { const match = typeof value === "string" && value.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/); return match ? match.slice(1, 4).map(Number) : null; }
function result(tool, status, observed = {}) {
  return { tool, status, version: observed.handle?.version ?? null, capabilities: observed.handle?.capabilities ?? [], preparedHandleDigest: status === "ready" ? observed.handle.digest : null, guidance: null };
}
function actionableResult(entry, platform, installers = new Set()) {
  const prerequisiteMissing = !["ready", "not_required"].includes(entry.status);
  const hostBoundaryFailure = ["execution_environment", "probe_timeout", "probe_error"].includes(entry.status);
  const installCommand = ["binary_missing", "incompatible_version", "incompatible_capability"].includes(entry.status)
    ? installCommandFor(platform, entry.tool, installers)
    : null;
  const affectedClaim = hostBoundaryFailure
    ? `Toolchain readiness for ${entry.tool} was not observed at the current execution boundary.`
    : prerequisiteMissing
    ? entry.status === "input_missing"
      ? `Security readiness cannot be claimed until the configured inputs for ${entry.tool} exist.`
    : entry.status === "untrusted_path"
      ? `Security readiness cannot be claimed because ${entry.tool} resolved to an untrusted path.`
    : entry.tool === "license-check"
      ? "Security readiness cannot be claimed until the configured license inputs exist."
      : entry.tool === "node" || entry.tool === "git"
        ? `Pipeline verification cannot be claimed until ${entry.tool} is installed and compatible.`
        : `Security readiness cannot be claimed until ${entry.tool} is installed.`
    : null;
  const baseGuidance = hostBoundaryFailure
    ? `Rerun the no-flag setup or self-application preflight through the host-authorized local read-only boundary; do not reinstall ${entry.tool} from this result.`
    : entry.status === "untrusted_path"
      ? `Use a direct .exe for ${entry.tool} in a named Windows system root; wrappers, user, repository, and temporary paths are not accepted.`
    : prerequisiteMissing
    ? entry.status === "input_missing"
      ? `Create the configured project inputs required by ${entry.tool}.`
      : GUIDANCE[platform][entry.tool]
    : null;
  const installerGuidance = installCommand === null && ["binary_missing", "incompatible_version", "incompatible_capability"].includes(entry.status)
    ? " No verified installer chain is available on this host; install a supported package manager or use the official prebuilt binary. npm is not an approved installer for these scanners."
    : "";
  return {
    ...entry,
    affectedClaim,
    installCommand,
    installAttempted: false,
    guidance: installCommand === null ? `${baseGuidance ?? ""}${installerGuidance}`.trim() : `${baseGuidance} Run: ${installCommand}`,
  };
}
function readyCompatibility(tool, observed) {
  if (!observed.ok) return result(tool, observed.status ?? "probe_error", observed);
  const parsed = semver(observed.handle.version);
  if (tool === "node" && (!parsed || parsed[0] < 24)) return result(tool, "incompatible_version", observed);
  if (tool === "git" && (!parsed || !["object-format", "diff-paths"].every((capability) => observed.handle.capabilities.includes(capability)))) return result(tool, parsed ? "incompatible_capability" : "incompatible_version", observed);
  if (tool === "gitleaks" && !parsed) return result(tool, "incompatible_version", observed);
  if (tool === "osv-scanner" && (!parsed || parsed[0] < 2 || parsed[0] >= 3)) return result(tool, "incompatible_version", observed);
  if (tool === "semgrep" && !parsed) return result(tool, "incompatible_version", observed);
  const required = REQUIRED_CAPABILITIES[tool] ?? [];
  if (!required.every((capability) => observed.handle.capabilities.includes(capability))) return result(tool, "incompatible_capability", observed);
  return result(tool, "ready", observed);
}
function defaultNodeProbe({ now = new Date() } = {}) {
  const observed = executableIdentity(process.execPath); if (!observed.ok) return observed;
  return { ok: true, status: "ready", handle: buildHandle("node", observed.identity, process.versions.node, ["spawn-shell-false"], now.toISOString()) };
}
export function defaultGitProbe({ rootDir, tempDir, now = new Date(), platform = process.platform } = {}, { runProbeFn = runProbe, resolveExecutableFn = resolveTrustedSystemExecutable } = {}) {
  const resolved = resolveExecutableFn("git", { platform });
  const path = typeof resolved === "string" ? resolved : resolved?.ok ? resolved.path : null;
  if (path === null) return { ok: false, status: typeof resolved === "object" ? resolved.status ?? "probe_error" : "binary_missing" };
  const observed = executableIdentity(path); if (!observed.ok) return observed;
  const probeOptions = { cwd: rootDir, tempDir, acceptSuccessfulEperm: true };
  const versionResult = runProbeFn(observed.identity.realPath, ["--version"], probeOptions); if (!versionResult.ok) return versionResult;
  const match = versionResult.stdout.match(/git version (\d+\.\d+\.\d+)/);
  const capabilities = [];
  if (runProbeFn(observed.identity.realPath, ["rev-parse", "--show-object-format"], probeOptions).ok) capabilities.push("object-format");
  if (runProbeFn(observed.identity.realPath, ["diff", "--name-only", "HEAD", "HEAD", "--"], probeOptions).ok) capabilities.push("diff-paths");
  return { ok: true, status: "ready", handle: buildHandle("git", observed.identity, match?.[1] ?? null, capabilities, now.toISOString()) };
}
/**
 * The exact candidate this probe observed. An identity attestation that does not say
 * WHICH tree it probed cannot be consumed as gate evidence (ADR-0051 candidate
 * binding); an unavailable or dirty repository yields null rather than a guess.
 */
function probedCandidate(rootDir) {
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8", shell: false, timeout: 5000 });
    return result.status === 0 && !result.error ? String(result.stdout).trim() : null;
  };
  const commit = git(["rev-parse", "HEAD"]);
  const tree = git(["rev-parse", "HEAD^{tree}"]);
  const status = spawnSync("git", ["status", "--porcelain=v1"], { cwd: rootDir, encoding: "utf8", shell: false, timeout: 5000 });
  if (!commit || !tree || !/^[0-9a-f]{40,64}$/u.test(commit) || !/^[0-9a-f]{40,64}$/u.test(tree)) return null;
  if (status.status !== 0 || String(status.stdout).length !== 0) return null;
  return { commit, tree };
}

function manifestDigest(rootDir) {
  const { path } = resolveAuthorityArtifactPath("manifest", { rootDir });
  if (!existsSync(path)) return null;
  try { return createHash("sha256").update(readFileSync(path)).digest("hex"); } catch { return null; }
}
function platformName(value) { return ["linux", "darwin", "win32"].includes(value) ? value : "unsupported"; }
function resolvedTool(resolver, tool, platform) { const resolved = resolver(tool, { platform }); if (typeof resolved === "string") return { ok: true, path: resolved }; if (resolved === null || resolved === undefined) return { ok: false, status: "binary_missing" }; return resolved.ok === true && typeof resolved.path === "string" ? { ok: true, path: resolved.path } : { ok: false, status: resolved.status ?? "probe_error" }; }
function licenseProbe(rootDir, manifest, now) {
  const policyRoot = manifest.governance?.policies_path;
  const paths = [typeof policyRoot === "string" ? join(rootDir, policyRoot, "license-allowlist.json") : null, join(rootDir, "third-party-licenses.json")];
  for (const path of paths) {
    if (path === null) return { ok: false, status: "input_missing" };
    try { const info = lstatSync(path); if (info.isSymbolicLink() || !info.isFile()) return { ok: false, status: "input_missing" }; }
    catch { return { ok: false, status: "input_missing" }; }
  }
  const identity = { realPath: "internal:license-check", device: "internal", inode: "internal", size: paths.reduce((sum, path) => sum + lstatSync(path).size, 0), mtimeNs: "not-applicable", sha256: sha256(Buffer.concat(paths.map((path) => readFileSync(path)))) };
  return { ok: true, status: "ready", handle: buildHandle("license-check", identity, process.versions.node, ["regular-license-inputs"], now.toISOString()) };
}
function overallStatus(results, invalidManifest, unsupported) {
  if (invalidManifest) return { ok: false, code: "TCP-MANIFEST-INVALID", status: "invalid_manifest" };
  if (unsupported) return { ok: false, code: "TCP-UNSUPPORTED-SCANNER", status: "unsupported_scanner" };
  for (const status of STATUS_PRECEDENCE) if (results.some((entry) => entry.status === status)) return { ok: false, code: `TCP-${status.toUpperCase().replaceAll("_", "-")}`, status };
  return { ok: true, code: "TCP-READY", status: "ready" };
}

export function runToolchainPreflight({ rootDir, manifestResult = null, platform = process.platform, tempDir = "/tmp" } = {}, deps = {}) {
  const root = realpathSync(resolve(rootDir));
  const loaded = manifestResult ?? loadManifest(root);
  const selectedPlatform = platformName(platform);
  const baseResults = Object.fromEntries(FIXED_TOOLS.map((tool) => [tool, result(tool, "not_required")]));
  const handles = {};
  if (loaded.status === "invalid") {
    const overall = overallStatus(Object.values(baseResults), true, false);
    return { schema: TOOLCHAIN_SCHEMA, ...overall, candidate: probedCandidate(root), manifest: { status: "invalid", digest: manifestDigest(root) }, securityGate: "blocking", platform: selectedPlatform, results: FIXED_TOOLS.map((tool) => actionableResult(baseResults[tool], selectedPlatform)), preparedHandles: handles, exitCode: 2 };
  }
  const now = deps.now ?? new Date();
  const nodeObserved = (deps.probeNodeFn ?? defaultNodeProbe)({ rootDir: root, tempDir, now });
  const gitObserved = (deps.probeGitFn ?? defaultGitProbe)({ rootDir: root, tempDir, now, platform }, { resolveExecutableFn: deps.resolveTrustedExecutableFn ?? resolveTrustedSystemExecutable });
  baseResults.node = readyCompatibility("node", nodeObserved); if (baseResults.node.status === "ready") handles.node = nodeObserved.handle;
  baseResults.git = readyCompatibility("git", gitObserved); if (baseResults.git.status === "ready") handles.git = gitObserved.handle;
  const manifest = loaded.status === "ok" ? loaded.manifest : null;
  const gateMode = manifest?.gates?.security?.mode ?? "blocking";
  const enabled = Object.entries(manifest?.security?.scanners ?? {}).filter(([, config]) => config?.enabled === true).map(([name]) => name).sort();
  const unsupported = enabled.some((name) => !KNOWN_SCANNERS.has(name));
  const probes = deps.scannerProbes ?? { gitleaks: probeGitleaks, "osv-scanner": probeOsvScanner, semgrep: probeSemgrep };
  const resolver = deps.resolveExecutableFn ?? resolveTrustedSystemExecutable;
  const installerResolver = deps.resolveInstallerFn ?? resolveSystemExecutable;
  const installers = new Set(INSTALLER_NAMES.filter((name) => installerResolver(name, { platform }) !== null));
  for (const tool of ["gitleaks", "osv-scanner", "semgrep"]) {
    if (!enabled.includes(tool)) continue;
    const trusted = resolvedTool(resolver, tool, platform);
    const observed = !trusted.ok ? trusted : probes[tool]({ executablePath: trusted.path, rootDir: root, tempDir }, { now });
    baseResults[tool] = readyCompatibility(tool, observed); if (baseResults[tool].status === "ready") handles[tool] = observed.handle;
  }
  if (enabled.includes("license-check")) {
    const observed = licenseProbe(root, manifest, now); baseResults["license-check"] = observed.ok ? result("license-check", "ready", observed) : result("license-check", observed.status);
    if (observed.ok) handles["license-check"] = observed.handle;
  }
  const overall = overallStatus(Object.values(baseResults), false, unsupported);
  const exitCode = overall.ok ? 0 : gateMode === "blocking" ? 2 : gateMode === "warn" ? 1 : 0;
  return {
    schema: TOOLCHAIN_SCHEMA, ...overall,
    candidate: probedCandidate(root),
    manifest: { status: loaded.status, digest: manifestDigest(root) },
    securityGate: gateMode,
    platform: selectedPlatform,
    results: FIXED_TOOLS.map((tool) => actionableResult(baseResults[tool], selectedPlatform, installers)),
    preparedHandles: handles,
    exitCode,
  };
}

export const CAPABILITY_TOOL_ROOTS = Object.freeze({ gitleaks: "cap.secrets", "osv-scanner": "cap.sca", semgrep: "cap.sast" });

export function evaluateCapabilityCompleteness(preflightResult, requiredCapabilities) {
  if (!preflightResult || !Array.isArray(preflightResult.results)) throw new TypeError("evaluateCapabilityCompleteness: preflightResult.results must be the results array produced by runToolchainPreflight()");
  if (!Array.isArray(requiredCapabilities) || !requiredCapabilities.every((id) => typeof id === "string")) throw new TypeError("evaluateCapabilityCompleteness: requiredCapabilities must be a string[] of cap.* ids");
  const statusByTool = new Map(preflightResult.results.map((entry) => [entry.tool, entry.status]));
  const toolByCapability = new Map(Object.entries(CAPABILITY_TOOL_ROOTS).map(([tool, capability]) => [capability, tool]));
  const requiredSet = new Set(requiredCapabilities);
  const discovered = new Set([...toolByCapability.keys()].filter((capability) => {
    const status = statusByTool.get(toolByCapability.get(capability));
    return status !== undefined && status !== "not_required";
  }));
  const candidates = [...new Set([...requiredSet, ...discovered])].sort();
  const capabilities = candidates.map((capability) => {
    const tool = toolByCapability.get(capability) ?? null;
    const isRequired = requiredSet.has(capability);
    if (tool === null) return { capability, status: "unsupported", tool: null };
    const ready = statusByTool.get(tool) === "ready";
    return { capability, status: isRequired ? (ready ? "required" : "missing") : (ready ? "available" : "optional"), tool };
  });
  const licenseStatus = statusByTool.get("license-check");
  const licenseControl = licenseStatus === undefined ? null : { control: "license-check", status: licenseStatus, note: "catalog control (CYB-1F F-4), not a cap.* capability-root verdict" };
  return { schema: "pipeline.capability-completeness.v1", capabilities, licenseControl };
}

function parseArgs(argv) {
  let rootDir = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--root" || !argv[index + 1]) throw new Error("Usage: toolchain-preflight.mjs [--root <repository>]");
    rootDir = argv[++index];
  }
  return { rootDir };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const output = runToolchainPreflight(parseArgs(process.argv.slice(2))); process.stdout.write(`${JSON.stringify(output, null, 2)}\n`); process.exitCode = output.exitCode; }
  catch (error) { process.stderr.write(`toolchain-preflight: ${error.message}\n`); process.exitCode = 2; }
}
