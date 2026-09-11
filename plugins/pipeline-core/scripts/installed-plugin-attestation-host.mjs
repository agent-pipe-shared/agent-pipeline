#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Host-side post-install receipt writer and read-only receipt adapter. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, realpathSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { verifyInstalledPluginAttestation } from "../lib/installed-plugin-attestation.mjs";
import { observePublicCoreIdentity } from "../lib/public-core-observation.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const HOST_RESULT_SCHEMA = "pipeline.installed-plugin-attestation-host-result.v1";
const RECEIPT_SCHEMA = "pipeline.installed-plugin-attestation.v1";
const REQUEST_SCHEMA = "pipeline.installed-plugin-attestation-authority-request.v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)(?!.*\0)[^\r\n]+$/u;
export const DEFAULT_INSTALLED_PLUGIN_PROTECTED_PATHS = Object.freeze([
  ".codex-plugin/plugin.json",
  "agents/critic.md",
  "hooks/codex-hooks.json",
  "hooks/codex-pretool-guard.mjs",
  "skills/critic-review/SKILL.md",
]);
const identityKeys = ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"];

const hash = (value) => createHash("sha256").update(value).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function physicalDirectory(path, mode = null) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || path.includes("\0")) throw new Error("IPA-HOST-DIRECTORY");
  mkdirSync(path, { recursive: true, mode: mode ?? 0o700 });
  const info = lstatSync(path, { bigint: true });
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path || (info.mode & 0o022n) !== 0n) throw new Error("IPA-HOST-DIRECTORY");
  return { path, info };
}

function captureIdentity(info, physicalPath, bytes) {
  return {
    physicalPath,
    physicalPathSha256: hash(physicalPath),
    dev: Number(info.dev), ino: Number(info.ino), mode: Number(info.mode), uid: Number(info.uid),
    gid: Number(info.gid), nlink: Number(info.nlink), size: Number(info.size),
    mtimeNs: String(info.mtimeNs), ctimeNs: String(info.ctimeNs), contentSha256: hash(bytes),
  };
}

function requestValid(request) {
  return exact(request, ["schema", "provider", "plugin", "sourceClass", "physicalRootPathSha256", "physicalRootIdentitySha256", "installedContentSha256", "protectedGraphSha256"])
    && request.schema === REQUEST_SCHEMA && ID.test(request.provider ?? "")
    && exact(request.plugin, ["name", "version"]) && ID.test(request.plugin.name ?? "") && VERSION.test(request.plugin.version ?? "")
    && request.sourceClass === "local-development"
    && [request.physicalRootPathSha256, request.physicalRootIdentitySha256, request.installedContentSha256, request.protectedGraphSha256].every((value) => SHA256.test(value ?? ""));
}

function receiptName(request) {
  if (!requestValid(request)) throw new Error("IPA-HOST-REQUEST");
  return `${hash(canonical(request))}.json`;
}

function locatorBinding({ provider, plugin, installedPluginRoot }) {
  if (!ID.test(provider ?? "") || !exact(plugin, ["name", "version"]) || !ID.test(plugin.name ?? "") || !VERSION.test(plugin.version ?? "")
    || typeof installedPluginRoot !== "string" || !isAbsolute(installedPluginRoot) || resolve(installedPluginRoot) !== installedPluginRoot) throw new Error("IPA-HOST-LOCATOR-INPUT");
  return { provider, plugin, installedRootPathSha256: hash(installedPluginRoot) };
}

function locatorName(binding) {
  return `${hash(canonical({ schema: "pipeline.installed-plugin-source-locator-key.v1", ...binding }))}.source.json`;
}

function locatorValid(value, binding) {
  return exact(value, ["schema", "provider", "plugin", "installedRootPathSha256", "sourcePluginRoot", "sourcePluginRootSha256"])
    && value.schema === "pipeline.installed-plugin-source-locator.v1"
    && canonical({ provider: value.provider, plugin: value.plugin, installedRootPathSha256: value.installedRootPathSha256 }) === canonical(binding)
    && typeof value.sourcePluginRoot === "string" && isAbsolute(value.sourcePluginRoot) && resolve(value.sourcePluginRoot) === value.sourcePluginRoot
    && value.sourcePluginRootSha256 === hash(value.sourcePluginRoot);
}

function defaultReceiptDirectory() {
  const base = process.env.CODEX_HOME && isAbsolute(process.env.CODEX_HOME)
    ? resolve(process.env.CODEX_HOME)
    : resolve(homedir(), ".codex");
  return join(base, "agent-pipeline", "installed-plugin-attestations");
}

function readExistingAuthorityDirectory(directory) {
  const path = resolve(directory);
  const info = lstatSync(path, { bigint: true });
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path || (info.mode & 0o022n) !== 0n) throw new Error("IPA-HOST-DIRECTORY");
  return path;
}

function assertExternalDirectory(directory, sourcePluginRoot, installedPluginRoot) {
  const resolved = resolve(directory);
  for (const root of [sourcePluginRoot, installedPluginRoot]) {
    const physical = realpathSync(root);
    if (inside(physical, resolved) || inside(resolved, physical)) throw new Error("IPA-HOST-RECEIPT-LOCAL");
  }
  return physicalDirectory(resolved, 0o700);
}

function readAuthorityFile(path) {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || (before.mode & 0o077n) !== 0n) throw new Error("IPA-HOST-RECEIPT-UNSAFE");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    for (const key of ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"]) {
      if (opened[key] !== after[key] || after[key] !== current[key]) throw new Error("IPA-HOST-RECEIPT-CHANGED");
    }
    if (after.size !== BigInt(bytes.length)) throw new Error("IPA-HOST-RECEIPT-CHANGED");
    return { receiptBytes: bytes, receiptIdentity: captureIdentity(after, path, bytes), releaseAttestation: null };
  } finally { closeSync(fd); }
}

function writeAtomic(directory, name, bytes) {
  const target = join(directory, name);
  const temp = join(directory, `.${name}.${process.pid}.${Date.now()}.tmp`);
  let fd;
  try {
    fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(fd, bytes);
    const info = fstatSync(fd, { bigint: true });
    if (!info.isFile() || info.nlink !== 1n || info.size !== BigInt(bytes.length) || (info.mode & 0o077n) !== 0n) throw new Error("IPA-HOST-WRITE");
    closeSync(fd); fd = undefined;
    renameSync(temp, target);
    chmodSync(target, 0o600);
    return target;
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    rmSync(temp, { force: true });
    throw error;
  }
}

/** Read-only callback for verifyInstalledPluginAttestation; the request alone selects the receipt. */
export function readExternalInstalledPluginReceipt(request, { receiptDirectory = defaultReceiptDirectory() } = {}) {
  try {
    const path = readExistingAuthorityDirectory(receiptDirectory);
    return readAuthorityFile(join(path, receiptName(request)));
  } catch {
    return null;
  }
}

/** Bootstrap/readback consumer. The private source path is loaded only from a 0600 host locator. */
export function verifyLocalDevelopmentInstalledPluginReceipt(input, {
  receiptDirectory = defaultReceiptDirectory(),
  verify = verifyInstalledPluginAttestation,
} = {}) {
  try {
    const protectedPaths = input?.protectedPaths ?? DEFAULT_INSTALLED_PLUGIN_PROTECTED_PATHS;
    const normalized = { ...input, protectedPaths };
    if (!exact(normalized, ["provider", "plugin", "installedPluginRoot", "registrySourcePluginRoot", "protectedPaths"])) throw new Error("IPA-HOST-INPUT");
    const binding = locatorBinding(normalized);
    const authorityDirectory = readExistingAuthorityDirectory(receiptDirectory);
    const locatorAuthority = readAuthorityFile(join(authorityDirectory, locatorName(binding)));
    const installedOwner = lstatSync(normalized.installedPluginRoot, { bigint: true });
    if (BigInt(locatorAuthority.receiptIdentity.uid) !== installedOwner.uid
      || BigInt(locatorAuthority.receiptIdentity.gid) !== installedOwner.gid) throw new Error("IPA-HOST-LOCATOR-OWNER");
    const locator = JSON.parse(Buffer.from(locatorAuthority.receiptBytes).toString("utf8"));
    if (!locatorValid(locator, binding)) throw new Error("IPA-HOST-LOCATOR");
    if (realpathSync(normalized.registrySourcePluginRoot) !== locator.sourcePluginRoot) throw new Error("IPA-HOST-LOCATOR-SOURCE");
    return verify({
      provider: normalized.provider, plugin: normalized.plugin,
      installedPluginRoot: normalized.installedPluginRoot,
      source: { class: "local-development", sourcePluginRoot: locator.sourcePluginRoot },
      protectedPaths,
    }, { readExternalReceipt: (request) => readExternalInstalledPluginReceipt(request, { receiptDirectory }) });
  } catch {
    return { schema: "pipeline.installed-plugin-attestation-verification.v1", status: "unavailable", reasonCodes: ["IPA-HOST-LOCATOR-UNAVAILABLE"] };
  }
}

/** Resolve exactly one enabled Codex local-development source from host registry readback. */
export function resolveCodexRegistrySource({ plugin, readPluginList = () => {
  const result = spawnSync("codex", ["plugin", "list", "--json"], { encoding: "utf8", shell: false, timeout: 5_000, maxBuffer: 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
} } = {}) {
  try {
    const payload = JSON.parse(readPluginList());
    const matches = payload.installed.filter((entry) => entry?.pluginId === "pipeline-core@agent-pipeline-local"
      && entry.name === plugin.name && entry.version === plugin.version && entry.installed === true && entry.enabled === true
      && entry.marketplaceName === "agent-pipeline-local"
      && entry.marketplaceSource?.sourceType === "local" && typeof entry.marketplaceSource.source === "string"
      && entry.source?.source === "local" && typeof entry.source.path === "string"
      && isAbsolute(entry.marketplaceSource.source) && resolve(entry.marketplaceSource.source) === entry.marketplaceSource.source
      && isAbsolute(entry.source.path) && resolve(entry.source.path) === entry.source.path
      && resolve(entry.marketplaceSource.source, "plugins", "pipeline-core") === resolve(entry.source.path));
    if (matches.length !== 1) return null;
    const root = realpathSync(matches[0].source.path);
    const info = lstatSync(root, { bigint: true });
    return info.isDirectory() && !info.isSymbolicLink() ? root : null;
  } catch { return null; }
}

export function writeCodexRegistryInstalledPluginReceipt(input, dependencies = {}) {
  const sourcePluginRoot = resolveCodexRegistrySource({
    plugin: input?.plugin,
    ...(typeof dependencies.readPluginList === "function" ? { readPluginList: dependencies.readPluginList } : {}),
  });
  if (sourcePluginRoot === null) return { schema: HOST_RESULT_SCHEMA, status: "rejected", reason: "IPA-HOST-REGISTRY-SOURCE" };
  return writeLocalDevelopmentInstalledPluginReceipt({ ...input, sourcePluginRoot }, dependencies);
}

/**
 * Post-install host operation. It never installs or copies the plugin. It first
 * verifies a clean source↔installed readback, writes a path-free receipt outside
 * both trees, then asks the provider-neutral core to read and verify that file.
 */
export function writeLocalDevelopmentInstalledPluginReceipt(input, {
  receiptDirectory = defaultReceiptDirectory(),
  observe = observePublicCoreIdentity,
} = {}) {
  const protectedPaths = input?.protectedPaths ?? DEFAULT_INSTALLED_PLUGIN_PROTECTED_PATHS;
  const normalized = { ...input, protectedPaths };
  if (!exact(normalized, ["provider", "plugin", "sourcePluginRoot", "installedPluginRoot", "protectedPaths"])
    || normalized.provider !== "codex" || !ID.test(normalized.plugin?.name ?? "") || !VERSION.test(normalized.plugin?.version ?? "")
    || !isAbsolute(normalized.sourcePluginRoot ?? "") || !isAbsolute(normalized.installedPluginRoot ?? "")
    || !Array.isArray(protectedPaths) || protectedPaths.length === 0 || !protectedPaths.every((path) => SAFE_PATH.test(path))
    || new Set(protectedPaths).size !== protectedPaths.length || [...protectedPaths].sort().join("\0") !== protectedPaths.join("\0")) {
    return { schema: HOST_RESULT_SCHEMA, status: "rejected", reason: "IPA-HOST-INPUT" };
  }
  try {
    const directory = assertExternalDirectory(receiptDirectory, normalized.sourcePluginRoot, normalized.installedPluginRoot);
    const observation = observe({ sourcePluginRoot: normalized.sourcePluginRoot, installedPluginRoot: normalized.installedPluginRoot });
    if (observation?.status !== "ready" || observation.plugin.name !== normalized.plugin.name || observation.plugin.version !== normalized.plugin.version) {
      return { schema: HOST_RESULT_SCHEMA, status: "rejected", reason: "IPA-HOST-READBACK" };
    }
    const binding = locatorBinding(normalized);
    const locator = {
      schema: "pipeline.installed-plugin-source-locator.v1", ...binding,
      sourcePluginRoot: normalized.sourcePluginRoot,
      sourcePluginRootSha256: hash(normalized.sourcePluginRoot),
    };
    const locatorPath = writeAtomic(directory.path, locatorName(binding), Buffer.from(`${JSON.stringify(locator)}\n`));
    let writtenPath = null;
    const verification = verifyInstalledPluginAttestation({
      provider: normalized.provider,
      plugin: normalized.plugin,
      installedPluginRoot: normalized.installedPluginRoot,
      source: { class: "local-development", sourcePluginRoot: normalized.sourcePluginRoot },
      protectedPaths,
    }, {
      observeLocal: observe,
      readExternalReceipt(request) {
        const protectedFiles = protectedPaths.map((path) => {
          const snapshot = readFileSync(join(normalized.installedPluginRoot, path));
          return { path, sha256: hash(snapshot) };
        });
        const unsigned = {
          schema: RECEIPT_SCHEMA, provider: request.provider, plugin: request.plugin,
          installed: {
            physicalRootPathSha256: request.physicalRootPathSha256,
            physicalRootIdentitySha256: request.physicalRootIdentitySha256,
            contentSha256: request.installedContentSha256,
          },
          source: { class: "local-development", ...observation.candidate },
          protected: { graphSha256: request.protectedGraphSha256, files: protectedFiles },
        };
        const receipt = { ...unsigned, receiptId: hash(canonical(unsigned)) };
        writtenPath = writeAtomic(directory.path, receiptName(request), Buffer.from(`${JSON.stringify(receipt)}\n`));
        return readAuthorityFile(writtenPath);
      },
    });
    if (verification.status !== "verified") {
      if (writtenPath !== null) rmSync(writtenPath, { force: true });
      rmSync(locatorPath, { force: true });
      return { schema: HOST_RESULT_SCHEMA, status: "rejected", reason: verification.reasonCodes[0] };
    }
    return {
      schema: HOST_RESULT_SCHEMA, status: "written", provider: normalized.provider,
      plugin: normalized.plugin, receiptId: verification.receiptId,
      requestSha256: hash(canonical(verification.request)),
    };
  } catch {
    return { schema: HOST_RESULT_SCHEMA, status: "rejected", reason: "IPA-HOST-OPERATION" };
  }
}

function parse(argv) {
  if (!["write-local", "write-local-from-codex-registry"].includes(argv[0])) return null;
  const operation = argv[0];
  const value = { provider: "codex", plugin: { name: "pipeline-core", version: null }, sourcePluginRoot: null, installedPluginRoot: null };
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i]; const arg = argv[i + 1];
    if (!arg) return null;
    if (flag === "--version") value.plugin.version = arg;
    else if (flag === "--source-plugin-root") value.sourcePluginRoot = resolve(arg);
    else if (flag === "--installed-plugin-root") value.installedPluginRoot = resolve(arg);
    else return null;
  }
  if (!value.plugin.version || !value.installedPluginRoot) return null;
  if (operation === "write-local" && !value.sourcePluginRoot) return null;
  if (operation === "write-local-from-codex-registry" && value.sourcePluginRoot) return null;
  return { operation, input: value };
}

if (isDirectInvocation(import.meta.url)) {
  const input = parse(process.argv.slice(2));
  if (input === null) {
    process.stderr.write("installed-plugin-attestation-host: write-local --version <version> --source-plugin-root <path> --installed-plugin-root <path>\n");
    process.exit(2);
  }
  const result = input === null ? null : input.operation === "write-local"
    ? writeLocalDevelopmentInstalledPluginReceipt(input.input)
    : writeCodexRegistryInstalledPluginReceipt(input.input);
  if (result === null) {
    process.stderr.write("installed-plugin-attestation-host: write-local[-from-codex-registry] --version <version> [--source-plugin-root <path>] --installed-plugin-root <path>\n");
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.status === "written" ? 0 : 2);
}
