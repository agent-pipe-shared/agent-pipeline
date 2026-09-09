// SPDX-License-Identifier: SUL-1.0

import { nativeCriticCanonicalDigest } from "./codex-native-critic-policy.mjs";
import { parseGuardCommand } from "../hooks/guard-command-grammar.mjs";

export const NATIVE_CRITIC_PROHIBITED_FEATURES = Object.freeze([
  "plugins",
  "apps",
  "enable_mcp_apps",
  "multi_agent",
  "multi_agent_v2",
  "web_search_request",
  "web_search_cached",
  "standalone_web_search",
  "remote_plugin",
  "plugin_sharing",
  "image_generation",
  "goals",
  "memories",
  "token_budget",
  "browser_use",
  "browser_use_full_cdp_access",
  "browser_use_external",
  "computer_use",
]);

export const NATIVE_CRITIC_REDUCING_CONFIG = Object.freeze(Object.fromEntries(
  [
    ...NATIVE_CRITIC_PROHIBITED_FEATURES.map((name) => [`features.${name}`, false]),
  ],
));

export const NATIVE_CRITIC_REDUCING_CONFIG_SHA256 = nativeCriticCanonicalDigest(NATIVE_CRITIC_REDUCING_CONFIG);

const MAX_METADATA_PAGES = 10;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

const NATIVE_GIT_READ_PREFIX = Object.freeze([
  "--no-optional-locks", "-c", "core.pager=cat", "--no-pager",
]);

function exactPrefix(argv, prefix) {
  return argv.length >= prefix.length && prefix.every((value, index) => argv[index] === value);
}

function isBoundReferencePath(path, referencePaths) {
  return typeof path === "string" && path.length > 0 && !path.startsWith("-")
    && !path.startsWith("/") && !path.includes("\\")
    && path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
    && referencePaths.includes(path);
}

function isBoundPathSuffix(argv, offset, referencePaths) {
  const paths = argv.slice(offset);
  return paths.length === 0 || (new Set(paths).size === paths.length
    && paths.every((path) => isBoundReferencePath(path, referencePaths)));
}

/**
 * A deliberately small supplement for the app-server's presentation-only
 * CommandAction::Unknown projection. It accepts no shell syntax and only the
 * Git reads a refs-only Critic needs; every other unknown remains rejected.
 */
export function isNativeCriticBoundedGitReadCommand(command, {
  cwd,
  candidateCommit,
  reviewBase,
  referencePaths,
} = {}) {
  if (typeof command !== "string" || command.length === 0 || command.length > 8192
    || typeof cwd !== "string" || !cwd.startsWith("/")
    || !/^[0-9a-f]{40}$/.test(candidateCommit ?? "")
    || !/^[0-9a-f]{40}$/.test(reviewBase ?? "")
    || !Array.isArray(referencePaths) || referencePaths.length === 0
    || new Set(referencePaths).size !== referencePaths.length
    || !referencePaths.every((path) => isBoundReferencePath(path, referencePaths))) return false;
  const parsed = parseGuardCommand(command, cwd);
  if (parsed.parseStatus !== "accepted" || parsed.operators.length !== 0
    || parsed.redirects.length !== 0 || parsed.segments.length !== 1) return false;
  const [{ executable, argv }] = parsed.segments;
  if (executable !== "git" || !exactPrefix(argv, NATIVE_GIT_READ_PREFIX)) return false;
  const args = argv.slice(NATIVE_GIT_READ_PREFIX.length);
  if (args[0] === "diff") {
    const prefix = ["diff", "--no-ext-diff", "--no-textconv", reviewBase, candidateCommit, "--"];
    return exactPrefix(args, prefix) && isBoundPathSuffix(args, prefix.length, referencePaths);
  }
  if (args[0] === "show") {
    const prefix = ["show", "--no-ext-diff", "--no-textconv", candidateCommit, "--"];
    return exactPrefix(args, prefix) && isBoundPathSuffix(args, prefix.length, referencePaths);
  }
  if (args[0] === "rev-parse") {
    return args.length === 3 && args[1] === "--verify"
      && (args[2] === `${reviewBase}^{commit}` || args[2] === `${candidateCommit}^{commit}` || args[2] === `${candidateCommit}^{tree}`);
  }
  return args.length === 3 && args[0] === "status" && args[1] === "--porcelain=v1" && args[2] === "--untracked-files=no";
}

/** The v0.153.4 app-server may present `bash -lc <command>` as a full item
 * command and its parsed inner command as CommandAction::Unknown.command. */
export function nativeCriticUnknownGitActionMatchesCommand(command, actionCommand, request) {
  if (typeof command !== "string" || typeof actionCommand !== "string"
    || !isNativeCriticBoundedGitReadCommand(actionCommand, request)) return false;
  if (command === actionCommand) return true;
  const parsed = parseGuardCommand(command, request?.cwd);
  if (parsed.parseStatus !== "accepted" || parsed.operators.length !== 0
    || parsed.redirects.length !== 0 || parsed.segments.length !== 1) return false;
  const [{ executable, argv }] = parsed.segments;
  return ["bash", "sh", "zsh", "/bin/bash", "/bin/sh", "/bin/zsh"].includes(executable)
    && argv.length === 2 && ["-c", "-lc"].includes(argv[0]) && argv[1] === actionCommand;
}

function isBoundNativeCriticContentPath(path, request) {
  if (typeof path !== "string" || !path.startsWith("/") || !request || typeof request.cwd !== "string") return false;
  const contractPaths = [request.roleContractPath, request.promptContractPath, request.verdictSchemaPath];
  const referencePaths = Array.isArray(request.referencePaths)
    ? request.referencePaths.map((referencePath) => `${request.cwd}/${referencePath}`)
    : [];
  return [...contractPaths, ...referencePaths].includes(path);
}

function isBoundNativeCriticPythonReadCommand(command, request) {
  // This is intentionally not a Python allowlist. It is one observed,
  // content-only expression emitted by the native model before it falls back
  // to cat: a Path construction followed directly by read_text().
  const match = /^from pathlib import Path\nprint\(Path\((['"])([^'"\n]+)\1\)\.read_text\(\)\)$/.exec(command);
  return match !== null && isBoundNativeCriticContentPath(match[2], request);
}

/**
 * The native model currently exposes some simple file reads as
 * CommandAction::Unknown. Admit only a direct `cat`, or the one observed
 * Path(...).read_text() expression, for a contract or already-bound reference
 * set; no generic interpreter, glob, option, directory, or unbound filesystem
 * path can enter this allowance.
 */
export function nativeCriticUnknownContentReadMatchesCommand(command, actionCommand, request) {
  if (typeof command !== "string" || typeof actionCommand !== "string") return false;
  const parsedAction = parseGuardCommand(actionCommand, request?.cwd);
  if (parsedAction.parseStatus !== "accepted" || parsedAction.operators.length !== 0
    || parsedAction.redirects.length !== 0 || parsedAction.segments.length !== 1) return false;
  const [{ executable, argv }] = parsedAction.segments;
  const boundedCat = ["cat", "/bin/cat", "/usr/bin/cat"].includes(executable) && argv.length === 1
    && isBoundNativeCriticContentPath(argv[0], request);
  const boundedPythonRead = isBoundNativeCriticPythonReadCommand(actionCommand, request);
  if (!boundedCat && !boundedPythonRead) return false;
  if (command === actionCommand) return true;
  const parsedCommand = parseGuardCommand(command, request?.cwd);
  if (parsedCommand.parseStatus !== "accepted" || parsedCommand.operators.length !== 0
    || parsedCommand.redirects.length !== 0 || parsedCommand.segments.length !== 1) return false;
  const [{ executable: wrapper, argv: wrapperArgv }] = parsedCommand.segments;
  return ["bash", "sh", "zsh", "/bin/bash", "/bin/sh", "/bin/zsh"].includes(wrapper)
    && wrapperArgv.length === 2 && ["-c", "-lc"].includes(wrapperArgv[0]) && wrapperArgv[1] === actionCommand;
}

export function nativeCriticReducingCliArgs() {
  return Object.entries(NATIVE_CRITIC_REDUCING_CONFIG).flatMap(([key, value]) => ["-c", `${key}=${value}`]);
}

function validatePages(pages, kind) {
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_METADATA_PAGES) {
    throw new TypeError(`${kind} metadata pages are incomplete`);
  }
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!isPlainObject(page) || !Array.isArray(page.data)
      || (page.nextCursor !== null && page.nextCursor !== undefined && typeof page.nextCursor !== "string")) {
      throw new TypeError(`${kind} metadata page is malformed`);
    }
    if (index < pages.length - 1 && typeof page.nextCursor !== "string") {
      throw new TypeError(`${kind} metadata pagination is incomplete`);
    }
    if (index === pages.length - 1 && page.nextCursor != null) {
      throw new TypeError(`${kind} metadata pagination is incomplete`);
    }
  }
}

export function validateNativeFeaturePages(pages) {
  validatePages(pages, "feature");
  const observed = new Map();
  let dataCount = 0;
  for (const page of pages) {
    dataCount += page.data.length;
    for (const row of page.data) {
      if (!isPlainObject(row) || typeof row.name !== "string") {
        throw new TypeError("feature metadata row is malformed");
      }
      if (!NATIVE_CRITIC_PROHIBITED_FEATURES.includes(row.name)) continue;
      if (observed.has(row.name) || typeof row.enabled !== "boolean") {
        throw new TypeError("required feature metadata is invalid");
      }
      observed.set(row.name, row.enabled);
    }
  }
  if (observed.size !== NATIVE_CRITIC_PROHIBITED_FEATURES.length
    || NATIVE_CRITIC_PROHIBITED_FEATURES.some((name) => observed.get(name) !== false)) {
    throw new TypeError("required feature is enabled or absent");
  }
  const values = Object.fromEntries(NATIVE_CRITIC_PROHIBITED_FEATURES.map((name) => [name, observed.get(name)]));
  return Object.freeze({ pageCount: pages.length, dataCount, digest: nativeCriticCanonicalDigest(values) });
}

export function validateNativeMcpPages(pages) {
  validatePages(pages, "MCP");
  const dataCount = pages.reduce((count, page) => count + page.data.length, 0);
  for (const page of pages) {
    for (const row of page.data) {
      if (!isPlainObject(row) || row.runtimeStatus !== "disabled"
        || row.toolsEmpty !== true || row.resourcesEmpty !== true || row.resourceTemplatesEmpty !== true
        || row.catalogFree !== true) {
        throw new TypeError("MCP inventory is not disabled and empty");
      }
    }
  }
  return Object.freeze({
    pageCount: pages.length,
    dataCount,
    digest: nativeCriticCanonicalDigest({ pageCount: pages.length, dataCount, allDisabled: true, allEmpty: true, catalogFree: true }),
  });
}

export function reduceDiscoveredNativeMcpServers(pages) {
  validatePages(pages, "MCP discovery");
  const config = {};
  for (const page of pages) {
    for (const row of page.data) {
      if (!isPlainObject(row) || typeof row.name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(row.name)) {
        throw new TypeError("MCP discovery identifier is unsafe");
      }
      const key = `mcp_servers.${row.name}.enabled`;
      if (Object.hasOwn(config, key)) throw new TypeError("MCP discovery identifier is duplicated");
      config[key] = false;
    }
  }
  const dataCount = Object.keys(config).length;
  return Object.freeze({
    config: Object.freeze(config),
    dataCount,
    configSha256: nativeCriticCanonicalDigest(config),
  });
}

export function nativeCriticToolSurfaceConfigDigest(mcpReduction) {
  if (!isPlainObject(mcpReduction) || !Number.isSafeInteger(mcpReduction.dataCount)
    || !/^[a-f0-9]{64}$/.test(mcpReduction.configSha256 ?? "")) {
    throw new TypeError("native MCP reduction summary is invalid");
  }
  return nativeCriticCanonicalDigest({
    featureConfig: NATIVE_CRITIC_REDUCING_CONFIG,
    mcpReduction: { dataCount: mcpReduction.dataCount, configSha256: mcpReduction.configSha256 },
  });
}

export function nativeCriticToolSurfaceObservationDigest(featureSnapshot, mcpSnapshot) {
  if (!isPlainObject(featureSnapshot) || !isPlainObject(mcpSnapshot)) {
    throw new TypeError("native tool-surface snapshots are required");
  }
  return nativeCriticCanonicalDigest({
    featureSnapshot: {
      pageCount: featureSnapshot.pageCount,
      dataCount: featureSnapshot.dataCount,
      digest: featureSnapshot.digest,
    },
    mcpSnapshot: {
      pageCount: mcpSnapshot.pageCount,
      dataCount: mcpSnapshot.dataCount,
      digest: mcpSnapshot.digest,
    },
  });
}
