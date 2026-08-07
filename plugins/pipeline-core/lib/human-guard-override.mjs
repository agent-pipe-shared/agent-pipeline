// SPDX-License-Identifier: SUL-1.0

import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { parseGuardCommand } from "../hooks/guard-command-grammar.mjs";
import {
  readCriticalHumanProofPolicy,
  readPushApprovalMode,
} from "./critical-human-proof-policy.mjs";
import { createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "./project-authority.mjs";
import {
  assessWindowsPrivatePath,
  hardenWindowsPrivateDirectory,
} from "./windows-private-state.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9._-]{1,120}$/u;
const REQUEST_SCHEMA = "pipeline.human-guard-override-request.v2";
const PLAN_SCHEMA = "pipeline.human-guard-override-plan.v2";
const CAPABILITY_SCHEMA = "pipeline.human-guard-override-capability.v2";
const AUDIT_SCHEMA = "pipeline.human-guard-override-audit.v1";
const AUDIT_HEAD_SCHEMA = "pipeline.human-guard-override-audit-head.v1";
const MAX_REASON_BYTES = 500;
const DEFAULT_TTL_MS = 5 * 60_000;

// ---------------------------------------------------------------------------------
// Signed admission path (ADR-0059). A genuine, verified Ed25519 proof arms the
// identical v2 capability the chat-mode `activate: true` path already produces --
// there is no in-session "activate" step here, by the same principle ADR-0058
// (Guard Maintenance Window) already established: presence of a valid, correctly
// bound signature IS the authorization. The "reason" ceremony
// (`prepareHumanGuardOverrideAuthorization`) is reused byte-for-byte unchanged, with
// a FIXED, documented reason text standing in for a human-typed one -- the proof is
// what authorizes, the reason is only an audit label, and keeping it fixed makes the
// resulting `selectionSha256` (what actually gets bound into the signed intent)
// derivable by the PO from `requestSha256`/`planSha256` alone, without guessing this
// module's internals.
// ---------------------------------------------------------------------------------
export const HGO_SIGNATURE_REASON = "authorized via a detached PO Ed25519 signature (ADR-0059)";
const HGO_SIGNATURE_INTENT_KIND = "guard-override";
const HGO_SIGNATURE_INTENT_FEATURE_ID = "human-guard-override";
const HGO_SIGNATURE_INTENT_POLICY_REVISION = "human-guard-override-signature-v1";
const HGO_SIGNATURE_INTENT_DECISION = "authorize";

export class HumanGuardOverrideError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HumanGuardOverrideError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new HumanGuardOverrideError(code, message);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value)
    ? value
    : canonical(value)).digest("hex");
}

// `createPoApprovalIntent` requires a `planSha256`/`specSha256` pair (feature-plan
// authority, per lib/critical-action-approval-request.mjs and GMW's own CLI defaults).
// HGO's signed path is a general, project-wide mechanism, not scoped to one sprint's
// plan/spec documents the way GMW deliberately is -- so these are fixed, public,
// content-independent sentinel digests (of their own descriptive labels) rather than
// a hash of a specific file. They add no security value of their own: the real,
// unique binding is `subjectSha256` (== the request/plan/reason `selectionSha256`
// already computed by the byte-for-byte-unchanged `prepareHumanGuardOverrideAuthorization`)
// together with the live repository `candidate` below. Fixed values keep the intent
// fully reproducible offline by an external signer, with no repository file I/O.
const HGO_SIGNATURE_INTENT_PLAN_SHA256 = sha("pipeline.human-guard-override-signature-plan.v1");
const HGO_SIGNATURE_INTENT_SPEC_SHA256 = sha("pipeline.human-guard-override-signature-spec.v1");

function exactKeys(value, keys) {
  if (!object(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function git(root, args, spawn = spawnSync) {
  const result = spawn("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });
  if (result?.status !== 0 || result?.error) {
    // The operation label is deliberately argv-only: it is enough to repair a
    // broken adapter/spawn boundary without disclosing repository data.
    const operation = args.map((value) => String(value).replace(/[^A-Za-z0-9._=-]/gu, "_")).join("-").slice(0, 120);
    const outcome = result?.error?.code ?? result?.error?.name
      ?? result?.signal ?? `exit-${String(result?.status)}`;
    fail("HGO-GIT", `repository identity is unavailable (operation=${operation}, outcome=${outcome})`);
  }
  return String(result.stdout ?? "").trim();
}

function physicalRoot(root) {
  const physical = realpathSync(resolve(root));
  const info = lstatSync(physical);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("HGO-ROOT", "repository root is not physical");
  return physical;
}

function topology(root, spawn = spawnSync) {
  const physical = physicalRoot(root);
  const top = realpathSync(git(physical, ["rev-parse", "--show-toplevel"], spawn));
  if (top !== physical) fail("HGO-ROOT", "override root must be the physical repository top");
  const rawCommon = git(physical, ["rev-parse", "--path-format=absolute", "--git-common-dir"], spawn);
  const common = realpathSync(isAbsolute(rawCommon) ? rawCommon : resolve(physical, rawCommon));
  const info = lstatSync(common);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("HGO-COMMON-DIR", "Git common directory is unsafe");
  return { root: physical, common };
}

/**
 * Read Git's already-created control layout without spawning Git.  This is
 * deliberately narrower than topology(): it exists only so a Codex PreTool
 * adapter which cannot spawn host Git can consume a capability for the one
 * global action that does not mutate the repository.  Normal HGO requests
 * continue to require Git's live HEAD/tree/status observation.
 */
function controlPathTopology(root) {
  const physical = physicalRoot(root);
  const control = join(physical, ".git");
  if (!existsSync(control)) fail("HGO-CONTROL", "Git control path is missing");
  const info = lstatSync(control);
  let gitDir;
  if (info.isDirectory() && !info.isSymbolicLink()) {
    gitDir = realpathSync(control);
  } else if (info.isFile() && !info.isSymbolicLink() && info.nlink === 1) {
    const match = readFileSync(control, "utf8").match(/^gitdir:\s*(.+?)\s*$/mu);
    if (!match || match[1].includes("\0")) fail("HGO-CONTROL", "Git control file is malformed");
    const candidate = resolve(physical, match[1]);
    const candidateInfo = lstatSync(candidate);
    if (!candidateInfo.isDirectory() || candidateInfo.isSymbolicLink()) {
      fail("HGO-CONTROL", "Git worktree control directory is unsafe");
    }
    gitDir = realpathSync(candidate);
  } else {
    fail("HGO-CONTROL", "Git control path is unsafe");
  }
  const commonFile = join(gitDir, "commondir");
  let common = gitDir;
  if (existsSync(commonFile)) {
    const commonInfo = lstatSync(commonFile);
    if (!commonInfo.isFile() || commonInfo.isSymbolicLink() || commonInfo.nlink !== 1) {
      fail("HGO-CONTROL", "Git common-dir declaration is unsafe");
    }
    const raw = readFileSync(commonFile, "utf8").trim();
    if (raw === "" || raw.includes("\0")) fail("HGO-CONTROL", "Git common-dir declaration is malformed");
    const candidate = resolve(gitDir, raw);
    const candidateInfo = lstatSync(candidate);
    if (!candidateInfo.isDirectory() || candidateInfo.isSymbolicLink()) {
      fail("HGO-CONTROL", "Git common directory is unsafe");
    }
    common = realpathSync(candidate);
  }
  return { root: physical, common };
}

// Reachability note (Critic finding F1, dispatch CRITIC-REMEDY-09): the
// separate local marketplace root ADR-0052 prescribes for local development
// carries a symlink at ITS OWN `plugins/pipeline-core` entry, pointing back
// at a checkout's real source directory. That symlink is never walked here.
// `sourceRoot` below is always `<repo.root>/plugins/pipeline-core` where
// `repo.root` is the checkout's own physical top-level (`physicalRoot()`
// above always resolves and rejects a symlinked result), and
// `localPluginInstallSourceObservation()` already requires that exact
// directory itself to be a real, non-symlinked entry before calling this
// function. The external local-marketplace root can never become `repo.root`
// either: `isPipelineSourceRoot()` also requires `harness/scripts/verify.mjs`
// to exist alongside it, which the local-marketplace root (containing only
// `.claude-plugin/marketplace.json` and the symlink) never has. So the
// ADR-0052 symlink arrangement is structurally outside the tree this
// function ever walks; the hard-fail on an internal symlink stays exactly as
// strict as before -- it still fail-closes if a checkout's own source tree
// is tampered with to contain one.
function pluginSourceTreeSha256(sourceRoot) {
  const entries = [];
  const visit = (directory, prefix = "") => {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relativePath = prefix === "" ? child.name : `${prefix}/${child.name}`;
      const absolutePath = join(directory, child.name);
      const info = lstatSync(absolutePath);
      if (info.isSymbolicLink()) fail("HGO-PLUGIN-SOURCE", "local plugin source contains a symbolic link");
      if (info.isDirectory()) {
        visit(absolutePath, relativePath);
        continue;
      }
      if (!info.isFile() || info.nlink !== 1 || realpathSync(absolutePath) !== absolutePath) {
        fail("HGO-PLUGIN-SOURCE", "local plugin source contains an unsafe entry");
      }
      entries.push({ path: relativePath, sha256: sha(readFileSync(absolutePath)) });
    }
  };
  visit(sourceRoot);
  return sha(entries);
}

function localPluginInstallSourceObservation(repo) {
  if (!isPipelineSourceRoot(repo.root)) fail("HGO-PLUGIN-SOURCE", "repository is not a Pipeline plugin source checkout");
  const marketplace = join(repo.root, ".claude-plugin", "marketplace.json");
  const sourceRoot = join(repo.root, "plugins", "pipeline-core");
  const manifest = join(sourceRoot, ".codex-plugin", "plugin.json");
  const sourceInfo = lstatSync(sourceRoot);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink() || realpathSync(sourceRoot) !== sourceRoot) {
    fail("HGO-PLUGIN-SOURCE", "local plugin source directory is unsafe");
  }
  for (const path of [marketplace, manifest]) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
      fail("HGO-PLUGIN-SOURCE", "local plugin source file is unsafe");
    }
  }
  let marketplaceValue;
  try { marketplaceValue = JSON.parse(readFileSync(marketplace, "utf8")); }
  catch { fail("HGO-PLUGIN-SOURCE", "local marketplace declaration is malformed"); }
  // ADR-0052: this checkout's OWN `.claude-plugin/marketplace.json` self-names
  // the published identity `agent-pipeline`, never `agent-pipeline-local` --
  // that name is reserved for the separate, external local-marketplace root
  // the ADR mandates, which is deliberately not a committed path this
  // function can discover or inspect. This check therefore attests that the
  // checkout's own manifest is intact and still declares the exact
  // `pipeline-core` -> `./plugins/pipeline-core` binding, not that it IS the
  // local marketplace consulted by `codex plugin add
  // pipeline-core@agent-pipeline-local` (the tree hash below is the actual
  // content attestation; this is the checkout-identity attestation).
  const registered = marketplaceValue?.name === "agent-pipeline"
    && Array.isArray(marketplaceValue?.plugins)
    && marketplaceValue.plugins.some((entry) => entry?.name === "pipeline-core" && entry?.source === "./plugins/pipeline-core");
  if (!registered) fail("HGO-PLUGIN-SOURCE", "local marketplace does not bind pipeline-core");
  return {
    fingerprintSha256: sha({ physicalRoot: repo.root, physicalCommon: repo.common }),
    head: null,
    tree: null,
    statusSha256: sha({
      kind: "local-plugin-install-source.v1",
      marketplaceSha256: sha(readFileSync(marketplace)),
      manifestSha256: sha(readFileSync(manifest)),
      pluginTreeSha256: pluginSourceTreeSha256(sourceRoot),
    }),
  };
}

function isPipelineSourceRoot(root) {
  return existsSync(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"))
    && existsSync(join(root, "harness", "scripts", "verify.mjs"));
}

function secureDirectory(path, {
  platform = process.platform,
  assessWindowsPrivatePathFn = assessWindowsPrivatePath,
  hardenWindowsPrivateDirectoryFn = hardenWindowsPrivateDirectory,
} = {}) {
  const existed = existsSync(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("HGO-STORAGE", "override directory is unsafe");
  }
  if (platform === "win32") {
    const assurance = existed
      ? assessWindowsPrivatePathFn(path)
      : hardenWindowsPrivateDirectoryFn(path);
    if (assurance.status !== "secure") fail("HGO-DACL", "override directory DACL is not owner-private");
  } else if ((info.mode & 0o077) !== 0) {
    try { chmodSync(path, 0o700); } catch {}
    if ((lstatSync(path).mode & 0o077) !== 0) fail("HGO-PERMISSIONS", "override directory is not owner-private");
  }
  return path;
}

function storage(common) {
  const base = secureDirectory(join(common, "agent-pipeline", "human-guard-overrides"));
  return {
    base,
    requests: secureDirectory(join(base, "requests")),
    capabilities: secureDirectory(join(base, "capabilities")),
    locks: secureDirectory(join(base, "locks")),
    key: join(base, "audit.key"),
    audit: join(base, "audit.jsonl"),
    auditHead: join(base, "audit.head.json"),
    auditLock: join(base, "audit.lock"),
  };
}

function safePrivateFile(path, {
  absent = false,
  platform = process.platform,
  assessWindowsPrivatePathFn = assessWindowsPrivatePath,
} = {}) {
  if (!existsSync(path)) {
    if (absent) return null;
    fail("HGO-STORAGE", "required override file is missing");
  }
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail("HGO-STORAGE", "override file is unsafe");
  if (platform === "win32") {
    if (assessWindowsPrivatePathFn(path).status !== "secure") {
      fail("HGO-DACL", "override file DACL is not owner-private");
    }
  } else if ((info.mode & 0o077) !== 0) fail("HGO-PERMISSIONS", "override file is not owner-private");
  return info;
}

function writeExclusive(path, bytes) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); }
  finally { closeSync(fd); }
  safePrivateFile(path);
}

function writeAtomic(path, bytes) {
  const tmp = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeExclusive(tmp, bytes);
    renameSync(tmp, path);
    safePrivateFile(path);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function readJson(path) {
  safePrivateFile(path);
  let value;
  try { value = JSON.parse(readFileSync(path, "utf8")); }
  catch { fail("HGO-STORAGE", "override file is malformed"); }
  return value;
}

function pluginIdentity(pluginRoot) {
  const root = physicalRoot(pluginRoot);
  const manifestPath = join(root, ".codex-plugin", "plugin.json");
  const adapterPath = join(root, "hooks", "codex-pretool-guard.mjs");
  const grammarPath = join(root, "hooks", "guard-command-grammar.mjs");
  const policyPath = join(root, "lib", "human-guard-override.mjs");
  const windowsPrivatePath = join(root, "lib", "windows-private-state.mjs");
  const cliPath = join(root, "scripts", "guard-human-override.mjs");
  for (const path of [
    manifestPath,
    adapterPath,
    grammarPath,
    policyPath,
    windowsPrivatePath,
    cliPath,
  ]) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
      fail("HGO-PLUGIN", "loaded plugin file identity is unsafe");
    }
  }
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch { fail("HGO-PLUGIN", "loaded plugin manifest is malformed"); }
  if (manifest?.name !== "pipeline-core" || typeof manifest.version !== "string") {
    fail("HGO-PLUGIN", "loaded plugin identity is invalid");
  }
  return {
    root,
    name: manifest.name,
    version: manifest.version,
    manifestSha256: sha(readFileSync(manifestPath)),
    adapterSha256: sha(readFileSync(adapterPath)),
    grammarSha256: sha(readFileSync(grammarPath)),
    policySha256: sha(readFileSync(policyPath)),
    windowsPrivateSha256: sha(readFileSync(windowsPrivatePath)),
    cliSha256: sha(readFileSync(cliPath)),
  };
}

function policyIdentity(root, pluginRoot, denials) {
  const hooksRoot = join(pluginRoot, "hooks");
  const guards = [...new Set(denials.map(({ guard }) => String(guard)))].sort().map((guard) => {
    const path = SAFE_ID.test(guard) ? join(hooksRoot, guard) : null;
    if (path === null || !existsSync(path)) return { guard, implementationSha256: null };
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
      fail("HGO-PLUGIN", "guard implementation identity is unsafe");
    }
    return { guard, implementationSha256: sha(readFileSync(path)) };
  });
  const project = [
    ".claude/settings.json",
    ".claude/guard-config.json",
    ".claude/pipeline.json",
    "project/guard-config.json",
    "project/pipeline.json",
  ].map((path) => {
    const absolute = join(root, path);
    if (!existsSync(absolute)) return { path, status: "absent", sha256: null };
    const info = lstatSync(absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(absolute) !== absolute) {
      fail("HGO-POLICY", "project guard policy identity is unsafe");
    }
    return { path, status: "present", sha256: sha(readFileSync(absolute)) };
  });
  return { guards, project };
}

function stateObservation(root) {
  let authority = null;
  try { authority = resolveProjectAuthorityPaths({ rootDir: root }); } catch {}
  const stateRelPath = authority?.status === "ready"
    ? authority.state
    : (existsSync(join(root, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
  const path = join(root, stateRelPath);
  if (!existsSync(path)) {
    return { status: "absent", path: stateRelPath, sha256: null, continuityRevision: null };
  }
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
    fail("HGO-STATE", "Pipeline State identity is unsafe");
  }
  const bytes = readFileSync(path);
  let value;
  try { value = JSON.parse(bytes); } catch {
    return { status: "malformed", path: stateRelPath, sha256: sha(bytes), continuityRevision: null };
  }
  const revision = value?.continuity?.revision ?? null;
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) {
    return { status: "invalid", path: stateRelPath, sha256: sha(bytes), continuityRevision: null };
  }
  return { status: "present", path: stateRelPath, sha256: sha(bytes), continuityRevision: revision };
}

function repositoryObservation(root, spawn = spawnSync) {
  const common = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"], spawn);
  const physicalCommon = realpathSync(isAbsolute(common) ? common : resolve(root, common));
  return {
    fingerprintSha256: sha({ physicalRoot: realpathSync(root), physicalCommon }),
    head: git(root, ["rev-parse", "HEAD"], spawn),
    tree: git(root, ["rev-parse", "HEAD^{tree}"], spawn),
    statusSha256: sha(git(root, ["status", "--porcelain=v1", "--untracked-files=all"], spawn)),
    state: stateObservation(root),
  };
}

function safePath(root, candidate) {
  if (typeof candidate !== "string" || candidate.trim() === "" || candidate.includes("\0")) return null;
  const absolute = resolve(root, candidate);
  const rel = relative(root, absolute).split("\\").join("/");
  if (rel === "" || rel === "." || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return null;
  let cursor = root;
  const components = rel.split("/");
  for (let index = 0; index < components.length; index += 1) {
    cursor = join(cursor, components[index]);
    if (!existsSync(cursor)) break;
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()
      || realpathSync(cursor) !== cursor
      || (index < components.length - 1 && !info.isDirectory())
      || (index === components.length - 1 && info.isFile() && info.nlink !== 1)) {
      return null;
    }
  }
  return { absolute, relative: rel };
}

function protectedPath(path) {
  const normalized = path.toLowerCase();
  return normalized === ".claude/pipeline-state.json"
    || normalized.startsWith(".claude/pipeline-state.json.")
    || normalized === ".claude/pipeline.yaml"
    || normalized === ".claude/pipeline.json"
    || normalized === ".claude/settings.json"
    || normalized === ".claude/settings.local.json"
    || normalized === ".claude/guard-config.json"
    || normalized === ".claude/guard-override.log.jsonl"
    || normalized === "project/pipeline-state.json"
    || normalized.startsWith("project/pipeline-state.json.")
    || normalized === "project/pipeline.yaml"
    || normalized === "project/pipeline.json"
    || normalized === "project/guard-config.json"
    || normalized === "project/guard-override.log.jsonl"
    || normalized === "pipeline.user.yaml"
    || normalized === ".agent-pipeline" || normalized.startsWith(".agent-pipeline/")
    || normalized === ".git" || normalized.startsWith(".git/")
    || normalized === ".codex" || normalized.startsWith(".codex/")
    || /(^|\/)(?:secrets?|credentials?|tokens?|id_rsa|id_ed25519)(?:[./_-]|$)/u.test(normalized);
}

function hardBoundaryPath(path) {
  const normalized = path.toLowerCase();
  return normalized === ".git" || normalized.startsWith(".git/")
    || normalized === ".codex" || normalized.startsWith(".codex/")
    || normalized === ".agent-pipeline" || normalized.startsWith(".agent-pipeline/")
    || /(^|\/)(?:secrets?|credentials?|tokens?|id_rsa|id_ed25519)(?:[./_-]|$)/u.test(normalized);
}

function pipelineSourcePath(path) {
  const normalized = path.toLowerCase();
  return normalized === "plugins/pipeline-core" || normalized.startsWith("plugins/pipeline-core/");
}

function authorSourceRoot(repoRoot, candidate) {
  if (typeof candidate !== "string" || !isAbsolute(candidate)) return null;
  let physical;
  try { physical = physicalRoot(candidate); } catch { return null; }
  const expected = join(repoRoot, "plugins", "pipeline-core");
  if (physical !== expected || !existsSync(join(physical, ".codex-plugin", "plugin.json"))) return null;
  return physical;
}

function authorEligiblePaths(root, paths, selectedSourceRoot) {
  const sourceRoot = authorSourceRoot(root, selectedSourceRoot);
  if (sourceRoot === null || paths.length === 0) return null;
  for (const path of paths) {
    if (!pipelineSourcePath(path)) return null;
    const safe = safePath(root, path);
    if (safe === null || safe.relative !== path) return null;
    const rel = relative(sourceRoot, safe.absolute);
    if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return null;
  }
  return sourceRoot;
}

function patchPaths(command) {
  if (typeof command !== "string") return null;
  const normalized = command.replace(/\r\n/gu, "\n").replace(/\n+$/u, "");
  if (!normalized.startsWith("*** Begin Patch\n") || !normalized.endsWith("*** End Patch")) return null;
  const paths = [];
  for (const line of normalized.split("\n")) {
    const match = line.match(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/u);
    if (match) paths.push(match[1]);
  }
  return paths.length > 0 ? paths : null;
}

function exactGitSubcommand(parsed) {
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1) return null;
  const segment = parsed.segments[0];
  if (segment.executable.toLowerCase().replace(/\.exe$/u, "") !== "git") return null;
  let index = 0;
  while (index < segment.argv.length) {
    const value = segment.argv[index];
    if (value === "-C" || value === "-c" || value === "--git-dir" || value === "--work-tree") {
      index += 2;
      continue;
    }
    if (value.startsWith("--git-dir=") || value.startsWith("--work-tree=") || value.startsWith("--config-env=")) {
      index += 1;
      continue;
    }
    break;
  }
  return segment.argv[index] ?? null;
}

function exactLocalPluginInstall(toolName, toolInput, root) {
  if (toolName !== "Bash" || !isPipelineSourceRoot(root)) return false;
  const parsed = parseGuardCommand(String(toolInput?.command ?? ""), root);
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return false;
  const segment = parsed.segments[0];
  if (!/codex(?:\.exe)?$/iu.test(basename(segment.executable))) return false;
  return canonical(segment.argv) === canonical([
    "plugin",
    "add",
    "pipeline-core@agent-pipeline-local",
  ]);
}

function actionPreview(toolName, toolInput, paths, commandClass) {
  if (toolName === "Bash") {
    return {
      toolName,
      command: String(toolInput?.command ?? ""),
      commandClass,
      eligiblePaths: paths,
    };
  }
  return {
    toolName,
    command: null,
    commandClass,
    eligiblePaths: paths,
  };
}

function denialRationale(denials) {
  return denials.map((denial) => ({
    guard: String(denial.guard),
    denialSha256: sha(String(denial.reason)),
    rationale: String(denial.reason).slice(0, 2_000),
  })).sort((left, right) => `${left.guard}:${left.denialSha256}`.localeCompare(`${right.guard}:${right.denialSha256}`));
}

function denialRetryActions(denials) {
  const actions = [];
  for (const { reason } of denials) {
    for (const line of String(reason).split("\n")) {
      let value;
      try { value = JSON.parse(line); } catch { continue; }
      if (value?.schema !== "pipeline.guard-retry-actions.v1" || !Array.isArray(value.retryActions)) continue;
      for (const action of value.retryActions) {
        if (!object(action) || typeof action.executable !== "string" || !Array.isArray(action.argv)
          || action.mutation !== false || action.requiresConfirmation !== false) continue;
        actions.push(structuredClone(action));
      }
    }
  }
  return actions;
}

function decisionPreview({ toolName, toolInput, paths, commandClass, denials }) {
  const effect = commandClass === "local-plugin-install"
    ? {
      repository: "does not change the bound repository working tree, index, refs, or configuration",
      external: "adds exactly pipeline-core@agent-pipeline-local to the host Codex plugin registry; only this checkout's manifest identity and plugin-source tree digest are attested, not the external agent-pipeline-local marketplace root the install actually resolves through",
      rollbackRecovery: "read back the native plugin registry; removal/restart remains a separately attended operator action",
      residualRisk: "the host-wide Codex plugin selection changes and existing sessions keep their already-loaded plugin until the attended refresh boundary",
    }
    : commandClass === "git-commit"
    ? {
      repository: "creates one local commit from the already staged index if Git and hooks succeed",
      external: "no external effect is expected from git commit",
      rollbackRecovery: "read back HEAD/tree/status; correct by a new commit or an explicitly reviewed revert, never infer commit success",
      residualRisk: "the commit may capture unintended staged bytes or invalidate candidate-bound evidence",
    }
    : new Set(["exact-in-root-patch", "exact-in-root-write", "pipeline-author-repair"]).has(commandClass)
      ? {
        repository: "changes only the listed in-root working-tree paths if the original tool succeeds",
        external: "no external effect is expected from the classified in-root file action",
        rollbackRecovery: "read back every listed path and repository status; repair with a reviewed inverse patch when needed",
        residualRisk: "the exact edit may violate project invariants or invalidate evidence that covered the prior bytes",
      }
      : {
        repository: "the exact command may change the bound repository preimage",
        external: "external effects are unknown for this exact command and must be treated as possible",
        rollbackRecovery: "use command-specific readback or reconciliation; never repeat an ambiguous effect",
        residualRisk: "the exact command may have effects not inferable by the guard adapter",
      };
  return {
    action: actionPreview(toolName, toolInput, paths, commandClass),
    guardRationale: denialRationale(denials),
    alternatives: [
      {
        route: "normal-retry",
        status: "denied",
        evidenceSha256: sha(denialRationale(denials).map(({ guard, denialSha256 }) => ({ guard, denialSha256 }))),
      },
      {
        route: "narrower-typed-recovery",
        status: "not-returned-by-denying-guard",
        evidenceSha256: null,
      },
    ],
    expectedEffects: {
      repository: effect.repository,
      external: effect.external,
    },
    evidenceInvalidation: "all candidate-bound Verify, Security, Critic, preflight, or release evidence affected by the changed preimage must be rerun",
    rollbackRecovery: effect.rollbackRecovery,
    residualRisk: effect.residualRisk,
    postcondition: "retry the byte-identical original tool action, then run its ordinary effect readback; override admission is not operation success",
    poAuthority: "final-for-this-exact-project-policy-decision",
  };
}

function localAction(executable, argv, expected) {
  return {
    executable,
    argv,
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: "local-process",
    expected,
  };
}

function recoveryRoute(code, toolName, toolInput, paths = [], context = {}) {
  const { root = null, pluginRoot = null, repository = null } = context;
  const command = String(toolInput?.command ?? "");
  if (code === "HGO-NONOVERRIDABLE-SECRET") {
    return {
      status: "external-operator-required",
      code: "HGO-EXTERNAL-SENSITIVE-INPUT",
      nextAction: {
        kind: "external-operator",
        executionBoundary: "attended-external-terminal",
        invocation: "user-copy-only",
        action: {
          toolName,
          toolInputSha256: sha(toolInput),
          repositoryRoot: root,
        },
        reason: "the guarded input may contain sensitive bytes that cannot enter the override preview or durable request",
      },
    };
  }
  if (code === "HGO-NONOVERRIDABLE-PATH" || code === "HGO-NONOVERRIDABLE-CROSS-BOUNDARY") {
    const protectedTarget = paths.some(protectedPath)
      || /(?:pipeline-state\.json|pipeline\.ya?ml|guard-config\.json|settings(?:\.local)?\.json)/iu.test(command);
    return protectedTarget
      ? {
        status: "narrower-recovery-required",
        code: "HGO-NARROWER-WRITER-REQUIRED",
        nextAction: {
          kind: "typed-recovery",
          action: localAction(
            process.execPath,
            [join(pluginRoot, "scripts", "guard-human-override.mjs"), "verify-audit", "--repo", root],
            { schema: "pipeline.human-guard-override-audit-verification.v1", status: "valid" },
          ),
          after: "retry the exact original denial to obtain a fresh emergency plan or use its sanctioned writer",
        },
      }
      : {
        status: "external-operator-required",
        code: "HGO-EXTERNAL-PROJECT-BOUNDARY",
        nextAction: {
          kind: "external-operator",
          executionBoundary: "separate-session-rooted-at-exact-target",
          invocation: "user-copy-only",
          action: {
            toolName,
            toolInputSha256: sha(toolInput),
            sourceRepositoryRoot: root,
            targetPaths: paths,
          },
          reason: "the target is outside this project's physical authority boundary",
        },
      };
  }
  if (code === "HGO-PUBLICATION-REQUIRED" || /\bgit(?:\.exe)?\b[^\n]*\bpush\b/iu.test(command)) {
    const preflightId = `guard-${sha(toolInput).slice(0, 24)}`;
    return {
      status: "narrower-recovery-required",
      code: "HGO-NARROWER-PUBLICATION-REQUIRED",
      nextAction: {
        kind: "typed-recovery",
        action: localAction(
          process.execPath,
          [
            join(pluginRoot, "scripts", "publication-executor.mjs"),
            "preflight",
            "--root", root,
            "--preflight-id", preflightId,
            "--candidate", repository?.head ?? "unavailable",
            "--remote-name", "origin",
            "--destination-ref", "refs/heads/main",
          ],
          { schema: "pipeline.publication-capability-preflight.v1", statuses: ["ready", "blocked"] },
        ),
        limitation: "the fixed productive publication route revalidates candidate, remote, destination, credentials, policy, and preimage; it never inherits raw push argv",
      },
    };
  }
  if (code === "HGO-NONOVERRIDABLE-WILDCARD") {
    return {
      status: "narrower-recovery-required",
      code: "HGO-NARROWER-EXACT-TARGET-REQUIRED",
      nextAction: {
        kind: "typed-recovery",
        action: {
          toolName,
          toolInputSha256: sha(toolInput),
          requiredChange: "replace every wildcard with one exact target",
          repositoryRoot: root,
        },
      },
    };
  }
  return {
    status: "external-operator-required",
    code: "HGO-EXTERNAL-ADAPTER-BOUNDARY",
    nextAction: {
      kind: "external-operator",
      executionBoundary: "attended-external-tool",
      invocation: "user-copy-only",
      action: {
        toolName,
        toolInputSha256: sha(toolInput),
        repositoryRoot: root,
      },
      reason: "the exact action class or target cannot be safely attested inside this guard adapter",
    },
  };
}

function eligibility(root, toolName, toolInput, { selectedAuthorSourceRoot = null } = {}) {
  const paths = [];
  const serialized = canonical(toolInput);
  if (/(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{12,})/u.test(serialized)) {
    return { eligible: false, code: "HGO-NONOVERRIDABLE-SECRET", paths };
  }
  if (exactLocalPluginInstall(toolName, toolInput, root)) {
    return {
      eligible: true,
      mode: "global-plugin-install",
      sourceRoot: join(root, "plugins", "pipeline-core"),
      paths,
      commandClass: "local-plugin-install",
    };
  }
  if (new Set(["Edit", "Write"]).has(toolName)) {
    const path = safePath(root, toolInput?.file_path);
    if (!path) return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths };
    if (hardBoundaryPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [path.relative] };
    paths.push(path.relative);
    if (protectedPath(path.relative)) return {
      eligible: true,
      mode: "standard",
      sourceRoot: null,
      paths,
      commandClass: "writer-owned-project-policy-emergency",
    };
  } else if (toolName === "apply_patch") {
    const parsed = patchPaths(toolInput?.command);
    if (!parsed) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-GRAMMAR", paths };
    }
    for (const candidate of parsed) {
      const path = safePath(root, candidate);
      if (!path) return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [...paths, candidate] };
      if (hardBoundaryPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [...paths, path.relative] };
      paths.push(path.relative);
    }
    if (paths.some(protectedPath)) return {
      eligible: true,
      mode: "standard",
      sourceRoot: null,
      paths: [...new Set(paths)].sort(),
      commandClass: "writer-owned-project-policy-emergency",
    };
  } else if (toolName === "Bash") {
    const command = String(toolInput?.command ?? "");
    const parsed = parseGuardCommand(command, root);
    let writerOwnedProjectPolicy = false;
    if (/\bgit(?:\.exe)?\b[^\n]*\bpush\b/iu.test(command)) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-COMMAND", paths, commandClass: "raw-git-push" };
    }
    if (/(^|[\s=])(?:\*|\?)(?=$|\s)/u.test(command)) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-WILDCARD", paths, commandClass: "wildcard-command" };
    }
    if (parsed.parseStatus !== "accepted") {
      if (/(?:^|\s)\.\.(?:\s|$)|[\\/$`<>]/u.test(command)) {
        return { eligible: false, code: "HGO-NONOVERRIDABLE-GRAMMAR", paths };
      }
      return {
        eligible: true,
        mode: "standard",
        sourceRoot: null,
        paths,
        commandClass: "closed-shell-exact",
      };
    }
    for (const redirect of parsed.redirects) {
      if (redirect.target === "/dev/null" || redirect.target?.toLowerCase() === "nul") continue;
      const path = safePath(root, redirect.target);
      if (!path) return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [redirect.target] };
      if (hardBoundaryPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [path.relative] };
      paths.push(path.relative);
      if (protectedPath(path.relative)) writerOwnedProjectPolicy = true;
    }
    for (const segment of parsed.segments) {
      for (let index = 0; index < segment.argv.length; index += 1) {
        const token = segment.argv[index];
        if (token === "-C" || token === "--git-dir" || token === "--work-tree") {
          const candidate = segment.argv[index + 1];
          if (typeof candidate === "string") {
            const path = safePath(root, candidate);
            if (!path) return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [candidate] };
            paths.push(path.relative);
          }
          index += 1;
          continue;
        }
        const assignedPath = token.match(/^--(?:git-dir|work-tree)=(.+)$/u)?.[1];
        if (assignedPath !== undefined) {
          const path = safePath(root, assignedPath);
          if (!path) return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [assignedPath] };
          paths.push(path.relative);
          continue;
        }
        const normalizedToken = token.replace(/\\/gu, "/");
        if (!token.startsWith("-") && hardBoundaryPath(normalizedToken)) {
          return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [normalizedToken] };
        }
        if (!token.startsWith("-") && protectedPath(normalizedToken)) {
          writerOwnedProjectPolicy = true;
          paths.push(normalizedToken);
          continue;
        }
        if (isAbsolute(token) || token === ".." || token.startsWith("../") || token.includes("/../")) {
          const path = safePath(root, token);
          if (!path) return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [token] };
          if (hardBoundaryPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [path.relative] };
          paths.push(path.relative);
          if (protectedPath(path.relative)) writerOwnedProjectPolicy = true;
        }
      }
    }
    if (parsed.segments.length !== 1 || parsed.operators.length !== 0 || parsed.redirects.length !== 0) {
      return {
        eligible: true,
        mode: "standard",
        sourceRoot: null,
        paths: [...new Set(paths)].sort(),
        commandClass: writerOwnedProjectPolicy
          ? "writer-owned-project-policy-emergency"
          : "closed-shell-exact",
      };
    }
    const segment = parsed.segments[0];
    const normalizedExecutable = segment.executable.toLowerCase().replace(/\.exe$/u, "");
    if (normalizedExecutable === "node" && segment.argv.length === 2 && segment.argv[0] === "--check") {
      const path = safePath(root, segment.argv[1]);
      if (!path) return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [segment.argv[1]] };
      if (hardBoundaryPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [path.relative] };
      paths.push(path.relative);
      if (protectedPath(path.relative)) writerOwnedProjectPolicy = true;
    }
    const subcommand = exactGitSubcommand(parsed);
    return {
      eligible: true,
      mode: "standard",
      sourceRoot: null,
      paths: [...new Set(paths)].sort(),
      commandClass: writerOwnedProjectPolicy
        ? "writer-owned-project-policy-emergency"
        : subcommand === null ? "exact-command" : `git-${subcommand}`,
    };
  } else {
    return { eligible: false, code: "HGO-NONOVERRIDABLE-TOOL", paths };
  }
  const uniquePaths = [...new Set(paths)].sort();
  const pipelinePaths = uniquePaths.filter(pipelineSourcePath);
  if (pipelinePaths.length > 0) {
    if (pipelinePaths.length !== uniquePaths.length) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: uniquePaths };
    }
    if (selectedAuthorSourceRoot === null) {
      return {
        eligible: false,
        code: "HGO-AUTHOR-ROOT-REQUIRED",
        authorCandidate: true,
        paths: uniquePaths,
        candidateSourceRoot: join(root, "plugins", "pipeline-core"),
      };
    }
    const sourceRoot = authorEligiblePaths(root, uniquePaths, selectedAuthorSourceRoot);
    if (sourceRoot === null) return { eligible: false, code: "HGO-AUTHOR-ROOT-MISMATCH" };
    return { eligible: true, mode: "pipeline-author-repair", sourceRoot, paths: uniquePaths };
  }
  if (selectedAuthorSourceRoot !== null) return { eligible: false, code: "HGO-AUTHOR-SCOPE-MISMATCH" };
  return {
    eligible: true,
    mode: "standard",
    sourceRoot: null,
    paths: uniquePaths,
    commandClass: toolName === "apply_patch" ? "exact-in-root-patch" : "exact-in-root-write",
  };
}

function requestPath(paths, digest) {
  if (!SHA256.test(digest)) fail("HGO-DIGEST", "request digest is invalid");
  return join(paths.requests, `${digest}.json`);
}

function capabilityPath(paths, digest) {
  if (!SHA256.test(digest)) fail("HGO-DIGEST", "plan digest is invalid");
  return join(paths.capabilities, `${digest}.json`);
}

function key(paths, { create = false } = {}) {
  if (!existsSync(paths.key)) {
    if (!create) fail("HGO-AUDIT-KEY", "audit key is missing");
    writeExclusive(paths.key, randomBytes(32));
  }
  safePrivateFile(paths.key);
  const bytes = readFileSync(paths.key);
  if (bytes.length !== 32) fail("HGO-AUDIT", "audit key is invalid");
  return bytes;
}

function auditEntries(paths, secret) {
  if (!existsSync(paths.audit)) return [];
  safePrivateFile(paths.audit);
  const entries = [];
  let prior = "0".repeat(64);
  const lines = readFileSync(paths.audit, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { fail("HGO-AUDIT", "audit ledger is malformed"); }
    if (!exactKeys(entry, ["schema", "sequence", "previousMac", "event", "mac"])
      || entry.schema !== AUDIT_SCHEMA || entry.sequence !== entries.length + 1
      || entry.previousMac !== prior || !object(entry.event) || !SHA256.test(entry.mac)) {
      fail("HGO-AUDIT", "audit ledger structure is invalid");
    }
    const expected = createHmac("sha256", secret).update(canonical({
      schema: entry.schema,
      sequence: entry.sequence,
      previousMac: entry.previousMac,
      event: entry.event,
    })).digest("hex");
    if (entry.mac !== expected) fail("HGO-AUDIT", "audit ledger authentication failed");
    entries.push(entry);
    prior = entry.mac;
  }
  return entries;
}

function auditHead(secret, entries, ledgerBytes) {
  const core = {
    schema: AUDIT_HEAD_SCHEMA,
    entries: entries.length,
    lastMac: entries.at(-1)?.mac ?? null,
    ledgerSha256: sha(ledgerBytes),
  };
  return {
    ...core,
    mac: createHmac("sha256", secret).update(canonical(core)).digest("hex"),
  };
}

function verifiedAuditEntries(paths, secret) {
  const hasAudit = existsSync(paths.audit);
  const hasHead = existsSync(paths.auditHead);
  if (hasAudit !== hasHead) fail("HGO-AUDIT", "audit ledger/head presence is inconsistent");
  if (!hasAudit) fail("HGO-AUDIT", "audit ledger/head are missing");
  const entries = auditEntries(paths, secret);
  const ledgerBytes = readFileSync(paths.audit);
  const head = readJson(paths.auditHead);
  const expected = auditHead(secret, entries, ledgerBytes);
  if (!exactKeys(head, ["schema", "entries", "lastMac", "ledgerSha256", "mac"])
    || canonical(head) !== canonical(expected)) {
    fail("HGO-AUDIT", "audit ledger head authentication failed");
  }
  return entries;
}

function appendAudit(paths, event) {
  let fd;
  try {
    fd = openSync(paths.auditLock, "wx", 0o600);
    const initialize = !existsSync(paths.key)
      && !existsSync(paths.audit)
      && !existsSync(paths.auditHead);
    const secret = key(paths, { create: initialize });
    const entries = initialize
      ? []
      : verifiedAuditEntries(paths, secret);
    const core = {
      schema: AUDIT_SCHEMA,
      sequence: entries.length + 1,
      previousMac: entries.at(-1)?.mac ?? "0".repeat(64),
      event,
    };
    const entry = { ...core, mac: createHmac("sha256", secret).update(canonical(core)).digest("hex") };
    const content = `${entries.map((item) => JSON.stringify(item)).join("\n")}${entries.length ? "\n" : ""}${JSON.stringify(entry)}\n`;
    const ledgerBytes = Buffer.from(content, "utf8");
    writeAtomic(paths.audit, ledgerBytes);
    writeAtomic(
      paths.auditHead,
      Buffer.from(`${JSON.stringify(auditHead(secret, [...entries, entry], ledgerBytes))}\n`, "utf8"),
    );
    return entry;
  } catch (error) {
    if (error?.code === "EEXIST") fail("HGO-AUDIT-LOCKED", "audit ledger is busy");
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(paths.auditLock); } catch {}
  }
}

const CAPABILITY_KEYS = [
  "schema",
  "status",
  "root",
  "requestSha256",
  "planSha256",
  "selectionSha256",
  "reasonSha256",
  "plugin",
  "repository",
  "toolName",
  "toolInputSha256",
  "commandClass",
  "denials",
  "policy",
  "preview",
  "eligiblePaths",
  "mode",
  "authorSourceRoot",
  "authorizedAt",
  "expiresAt",
  "consumedAt",
  "mac",
];

function capabilityMac(secret, value) {
  const core = Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== "mac"),
  );
  return createHmac("sha256", secret).update(canonical(core)).digest("hex");
}

function validatedCapability(paths, path) {
  const value = readJson(path);
  if (!exactKeys(value, CAPABILITY_KEYS)
    || value.schema !== CAPABILITY_SCHEMA
    || !new Set(["armed", "consumed"]).has(value.status)
    || !SHA256.test(value.requestSha256 ?? "")
    || !SHA256.test(value.planSha256 ?? "")
    || !SHA256.test(value.selectionSha256 ?? "")
    || !SHA256.test(value.reasonSha256 ?? "")
    || !SHA256.test(value.toolInputSha256 ?? "")
    || typeof value.commandClass !== "string" || value.commandClass.trim() === ""
    || !object(value.policy) || !object(value.preview)
    || !new Set(["standard", "pipeline-author-repair", "global-plugin-install"]).has(value.mode)
    || !(value.authorSourceRoot === null || typeof value.authorSourceRoot === "string")
    || !SHA256.test(value.mac ?? "")
    || !(value.consumedAt === null || typeof value.consumedAt === "string")
    || value.mac !== capabilityMac(key(paths), value)) {
    fail("HGO-CAPABILITY", "override capability authentication failed");
  }
  return value;
}

function hasAuthorizedAuditEntry(paths, capability) {
  const entries = verifiedAuditEntries(paths, key(paths));
  return entries.some(({ event }) => event?.type === "authorized"
    && event.requestSha256 === capability.requestSha256
    && event.planSha256 === capability.planSha256
    && event.reasonSha256 === capability.reasonSha256
    && event.selectionSha256 === capability.selectionSha256
    && event.mode === capability.mode
    && event.authorSourceRoot === capability.authorSourceRoot
    && event.at === capability.authorizedAt);
}

function validatedRequest(paths, requestSha256) {
  const request = readJson(requestPath(paths, requestSha256));
  if (!exactKeys(request, [
    "schema", "root", "plugin", "repository", "toolName", "toolInputSha256", "denials",
    "policy", "preview", "eligiblePaths", "commandClass", "mode", "authorSourceRoot", "createdAt", "expiresAt",
  ])
    || request.schema !== REQUEST_SCHEMA || request.root === undefined
    || !new Set(["standard", "pipeline-author-repair-candidate", "global-plugin-install"]).has(request.mode)
    || request.authorSourceRoot !== null
    || !SHA256.test(request.toolInputSha256) || !Array.isArray(request.denials)
    || sha(request) !== requestSha256) fail("HGO-REQUEST", "override request is invalid");
  return request;
}

// ---------------------------------------------------------------------------------
// ADR-0059 Decision 4: every denial reports its next step. recordHumanGuardDenial() below
// has THREE outcomes, not one -- it returns `planned` (there is a next step to print), it
// returns one of the other typed statuses (the route machinery worked and answered "not
// this way"), or it throws (the route machinery could not answer at all). Consuming guards
// rendered only the first and swallowed the other two, so a denial that could not be
// routed printed exactly like a denial that was never eligible for one: silence, the one
// outcome Decision 4 does not admit. Observed twice in the field -- a grammar denial
// against a path outside the repository root, and a TP-7 denial against a
// `plugins/pipeline-core/**` path (every write there is author repair and needs an explicit
// author source root, so it never reaches `planned`).
//
// This renders the line a guard prints INSTEAD of a route. The defect being closed is the
// swallowed reason, not the missing route, so this deliberately offers no command: it says
// that a route was attempted, and what the attempt observed.
//
// What it can disclose is bounded by construction rather than by care. Only two tokens ever
// reach the output, each rendered only if it matches a typed-token shape and is short --
// so no `/`, `\`, `:`, whitespace or newline can pass -- plus a fixed clause selected by
// the observed status. No error message, no stack, no digest, no path. `candidateSourceRoot`
// (the one field of a non-planned outcome carrying an absolute host path) is never read.
// ---------------------------------------------------------------------------------
const ROUTE_STATUS_TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const ROUTE_CODE_TOKEN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/u;
const ROUTE_SUBJECT_TOKEN = /^[a-z]+(?: [a-z]+)*$/u;
const ROUTE_TOKEN_MAX_LENGTH = 64;
const ROUTE_UNTYPED_CODE = "HGO-UNTYPED";
const ROUTE_UNTYPED_STATUS = "unrecognized";

/**
 * Why THIS status carries no route. Keyed on the value actually observed; a status with no
 * entry here is still reported, just without a clause -- the guard never invents one.
 */
const ROUTE_STATUS_EXPLANATION = Object.freeze({
  "author-repair-required":
    "the target is Pipeline plugin source, so an override is author repair and needs an "
    + "explicit author source root, which a guard cannot select on the human's behalf",
  "narrower-recovery-required":
    "a narrower typed recovery is required instead of a general override",
  "external-operator-required":
    "the exact action must be carried out by an attended operator outside this session",
});

function routeToken(value, pattern, fallback) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= ROUTE_TOKEN_MAX_LENGTH
    && pattern.test(value)
    ? value
    : fallback;
}

/**
 * @param {string} subject short noun the denying guard uses for the refused thing ("command", "edit").
 * @param {{planned?: object}|{error?: unknown}} outcome exactly what route planning produced.
 * @returns {string} two lines: that no route is offered, and the typed reason why.
 */
export function humanGuardRouteUnavailableReason(subject, outcome = {}) {
  const noun = routeToken(subject, ROUTE_SUBJECT_TOKEN, "action");
  const headline = `No human override route is offered for this exact ${noun}; the guard attempted to plan one.`;
  if (object(outcome) && Object.hasOwn(outcome, "error")) {
    const code = routeToken(outcome.error?.code, ROUTE_CODE_TOKEN, ROUTE_UNTYPED_CODE);
    return `${headline}\nReason: planning the route failed with code=${code}.`;
  }
  const planned = object(outcome) && object(outcome.planned) ? outcome.planned : {};
  const status = routeToken(planned.status, ROUTE_STATUS_TOKEN, ROUTE_UNTYPED_STATUS);
  const code = Object.hasOwn(planned, "code")
    ? routeToken(planned.code, ROUTE_CODE_TOKEN, ROUTE_UNTYPED_CODE)
    : null;
  const explanation = ROUTE_STATUS_EXPLANATION[status] ?? null;
  return `${headline}\nReason: the override planner returned status=${status}`
    + (code === null ? "" : `, code=${code}`)
    + (explanation === null ? "" : ` (${explanation})`)
    + ".";
}

export function recordHumanGuardDenial({
  rootDir,
  pluginRoot,
  toolName,
  toolInput,
  denials,
  nowMs = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  spawn = spawnSync,
} = {}) {
  if (!Array.isArray(denials) || denials.length === 0) fail("HGO-DENIAL", "denial set is empty");
  const physicalRootDir = physicalRoot(rootDir);
  const eligible = eligibility(physicalRootDir, toolName, toolInput);
  const isLocalPluginInstall = eligible.eligible && eligible.mode === "global-plugin-install";
  const repo = isLocalPluginInstall
    ? controlPathTopology(physicalRootDir)
    : topology(physicalRootDir, spawn);
  const repository = isLocalPluginInstall
    ? localPluginInstallSourceObservation(repo)
    : repositoryObservation(repo.root, spawn);
  if (denials.some(({ guard }) => String(guard) === "guard-push.mjs")) {
    return recoveryRoute("HGO-PUBLICATION-REQUIRED", toolName, toolInput, [], {
      root: repo.root,
      pluginRoot,
      repository,
    });
  }
  const retryActions = denialRetryActions(denials);
  if (retryActions.length > 0) {
    return {
      status: "narrower-recovery-required",
      code: "HGO-NORMAL-RETRY-ACTIONS",
      nextAction: {
        kind: "typed-recovery",
        actions: retryActions,
      },
    };
  }
  if (!eligible.eligible && !eligible.authorCandidate) {
    return recoveryRoute(eligible.code, toolName, toolInput, eligible.paths, {
      root: repo.root,
      pluginRoot,
      repository,
    });
  }
  const paths = storage(repo.common);
  const policy = policyIdentity(repo.root, pluginRoot, denials);
  const commandClass = eligible.commandClass
    ?? (eligible.authorCandidate ? "pipeline-author-repair" : "exact-project-action");
  const preview = decisionPreview({
    toolName,
    toolInput,
    paths: eligible.paths,
    commandClass,
    denials,
  });
  const request = {
    schema: REQUEST_SCHEMA,
    root: repo.root,
    plugin: pluginIdentity(pluginRoot),
    repository,
    toolName,
    toolInputSha256: sha(toolInput),
    commandClass,
    denials: denials.map((denial) => ({
      guard: String(denial.guard),
      sha256: sha(String(denial.reason)),
    })).sort((left, right) => `${left.guard}:${left.sha256}`.localeCompare(`${right.guard}:${right.sha256}`)),
    policy,
    preview,
    eligiblePaths: eligible.paths,
    mode: eligible.authorCandidate ? "pipeline-author-repair-candidate" : eligible.mode,
    authorSourceRoot: null,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
  };
  const requestSha256 = sha(request);
  const path = requestPath(paths, requestSha256);
  if (!existsSync(path)) writeExclusive(path, Buffer.from(`${JSON.stringify(request)}\n`, "utf8"));
  else if (sha(readJson(path)) !== requestSha256) fail("HGO-REQUEST", "request replay conflicts");
  appendAudit(paths, {
    type: "denied",
    at: new Date(nowMs).toISOString(),
    requestSha256,
    toolName,
    commandClass,
    denialDigests: request.denials,
    policySha256: sha(policy),
    previewSha256: sha(preview),
  });
  return eligible.authorCandidate
    ? {
      status: "author-repair-required",
      requestSha256,
      candidateSourceRoot: eligible.candidateSourceRoot,
    }
    : { status: "planned", requestSha256 };
}

export function planHumanGuardOverride({
  rootDir,
  pluginRoot,
  requestSha256,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
  authorSourceRoot: selectedAuthorSourceRoot = null,
} = {}) {
  let repo;
  let paths;
  let topologyError = null;
  try {
    repo = topology(rootDir, spawn);
    paths = storage(repo.common);
  } catch (error) {
    topologyError = error;
    repo = controlPathTopology(rootDir);
    paths = storage(repo.common);
  }
  let request;
  try { request = validatedRequest(paths, requestSha256); }
  catch (error) {
    if (topologyError !== null) throw topologyError;
    throw error;
  }
  const isLocalPluginInstall = request.mode === "global-plugin-install";
  if (topologyError !== null && !isLocalPluginInstall) throw topologyError;
  if (request.root !== repo.root || new Date(request.expiresAt).getTime() <= nowMs) fail("HGO-EXPIRED", "override request expired");
  const plugin = pluginIdentity(pluginRoot);
  const repository = isLocalPluginInstall
    ? localPluginInstallSourceObservation(repo)
    : repositoryObservation(repo.root, spawn);
  const policy = policyIdentity(repo.root, pluginRoot, request.denials);
  if (canonical(plugin) !== canonical(request.plugin)
    || canonical(policy) !== canonical(request.policy)
    || canonical(repository) !== canonical(request.repository)) {
    fail("HGO-DRIFT", "override request preimage drifted");
  }
  let mode = isLocalPluginInstall ? "global-plugin-install" : "standard";
  let authorSourceRootValue = null;
  if (request.mode === "pipeline-author-repair-candidate") {
    authorSourceRootValue = authorEligiblePaths(repo.root, request.eligiblePaths, selectedAuthorSourceRoot);
    if (authorSourceRootValue === null) {
      fail("HGO-AUTHOR-ROOT", "author repair requires the exact Pipeline source root");
    }
    mode = "pipeline-author-repair";
  } else if (selectedAuthorSourceRoot !== null) {
    fail("HGO-AUTHOR-SCOPE", "author repair root does not match this request");
  }
  const payload = {
    schema: PLAN_SCHEMA,
    status: "planned",
    root: repo.root,
    requestSha256,
    plugin,
    repository,
    toolName: request.toolName,
    toolInputSha256: request.toolInputSha256,
    commandClass: request.commandClass,
    denials: request.denials,
    policy: request.policy,
    preview: request.preview,
    eligiblePaths: request.eligiblePaths,
    mode,
    authorSourceRoot: authorSourceRootValue,
    expiresAt: request.expiresAt,
  };
  const planSha256 = sha(payload);
  return {
    ...payload,
    planSha256,
    prepareAuthorizationAction: {
      executable: process.execPath,
      argv: [
        scriptPath,
        "prepare-authorization",
        "--repo",
        repo.root,
        "--request-sha256",
        requestSha256,
        "--plan-sha256",
        planSha256,
        "--reason",
        "<human-reason>",
        ...(authorSourceRootValue === null ? [] : ["--author-source-root", authorSourceRootValue]),
      ],
      mutation: false,
      requiresConfirmation: false,
      executionBoundary: "local-process",
      expected: {
        schema: "pipeline.human-guard-override-authorization-selection.v1",
        status: "prepared",
      },
    },
  };
}

export function prepareHumanGuardOverrideAuthorization({
  rootDir,
  pluginRoot,
  requestSha256,
  planSha256,
  reason,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
  authorSourceRoot = null,
} = {}) {
  const reasonBytes = Buffer.from(String(reason ?? ""), "utf8");
  if (reasonBytes.length < 1 || reasonBytes.length > MAX_REASON_BYTES) {
    fail("HGO-REASON", "override reason is invalid");
  }
  const planned = planHumanGuardOverride({
    rootDir,
    pluginRoot,
    requestSha256,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  if (planned.planSha256 !== planSha256) {
    fail("HGO-PLAN", "override plan digest does not match");
  }
  const reasonSha256 = sha(reasonBytes);
  const selection = {
    schema: "pipeline.human-guard-override-authorization-selection.v1",
    requestSha256,
    planSha256,
    reasonSha256,
  };
  const selectionSha256 = sha(selection);
  return {
    ...selection,
    status: "prepared",
    selectionSha256,
    expiresAt: planned.expiresAt,
    decisionPreview: planned.preview,
    authorizeAction: {
      executable: process.execPath,
      argv: [
        scriptPath,
        "authorize",
        "--repo",
        planned.root,
        "--request-sha256",
        requestSha256,
        "--plan-sha256",
        planSha256,
        "--selection-sha256",
        selectionSha256,
        "--reason",
        String(reason),
        "--reason-sha256",
        reasonSha256,
        ...(planned.authorSourceRoot === null
          ? []
          : ["--author-source-root", planned.authorSourceRoot]),
        "--activate",
      ],
      mutation: true,
      requiresConfirmation: true,
      executionBoundary: "local-process",
      expected: { schema: CAPABILITY_SCHEMA, status: "armed" },
    },
  };
}

export function authorizeHumanGuardOverride({
  rootDir,
  pluginRoot,
  requestSha256,
  planSha256,
  selectionSha256,
  reason,
  reasonSha256,
  activate = false,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
  authorSourceRoot = null,
} = {}) {
  if (activate !== true) fail("HGO-ACTIVATION", "override authorization requires explicit activation");
  // ADR-0059 Decision 1, defense in depth: this in-session `activate` path is an
  // ordinary command a ready agent session can run itself -- harmless while
  // `gates.push_approval` is "chat" (an attribution record, not proof, same as
  // chat-mode push approval), disqualifying while it is "signature". The calling
  // guards already stop offering this route in that mode (Decision 3), but this
  // function must refuse it outright too, never relying on the caller alone to keep
  // it out of reach. `readPushApprovalMode` itself already fails closed to
  // "signature" for anything absent, unreadable, unrecognised or uncommitted.
  let approvalMode = "signature";
  try { approvalMode = readPushApprovalMode(rootDir, { spawn })?.mode ?? "signature"; }
  catch { approvalMode = "signature"; }
  if (approvalMode !== "chat") {
    fail(
      "HGO-SIGNATURE-MODE-REQUIRED",
      `the in-session activation path is refused while gates.push_approval is "${approvalMode}"; use authorizeHumanGuardOverrideBySignature() (CLI: authorize-by-signature) instead`,
    );
  }
  const reasonBytes = Buffer.from(String(reason ?? ""), "utf8");
  if (reasonBytes.length < 1 || reasonBytes.length > MAX_REASON_BYTES || sha(reasonBytes) !== reasonSha256) {
    fail("HGO-REASON", "override reason digest is invalid");
  }
  const prepared = prepareHumanGuardOverrideAuthorization({
    rootDir,
    pluginRoot,
    requestSha256,
    planSha256,
    reason,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  if (prepared.selectionSha256 !== selectionSha256
    || prepared.reasonSha256 !== reasonSha256) {
    fail("HGO-SELECTION", "override authorization selection digest does not match");
  }
  const planned = planHumanGuardOverride({
    rootDir,
    pluginRoot,
    requestSha256,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  const repo = planned.mode === "global-plugin-install"
    ? controlPathTopology(rootDir)
    : topology(rootDir, spawn);
  const paths = storage(repo.common);
  const capabilityCore = {
    schema: CAPABILITY_SCHEMA,
    status: "armed",
    root: repo.root,
    requestSha256,
    planSha256,
    selectionSha256,
    reasonSha256,
    plugin: planned.plugin,
    repository: planned.repository,
    toolName: planned.toolName,
    toolInputSha256: planned.toolInputSha256,
    commandClass: planned.commandClass,
    denials: planned.denials,
    policy: planned.policy,
    preview: planned.preview,
    eligiblePaths: planned.eligiblePaths,
    mode: planned.mode,
    authorSourceRoot: planned.authorSourceRoot,
    authorizedAt: new Date(nowMs).toISOString(),
    expiresAt: planned.expiresAt,
    consumedAt: null,
  };
  const capability = {
    ...capabilityCore,
    mac: capabilityMac(key(paths), capabilityCore),
  };
  const path = capabilityPath(paths, planSha256);
  if (existsSync(path)) {
    const prior = validatedCapability(paths, path);
    if (canonical(prior) === canonical(capability)) {
      if (!hasAuthorizedAuditEntry(paths, prior)) {
        appendAudit(paths, {
          type: "authorized",
          at: capability.authorizedAt,
          requestSha256,
          planSha256,
          reasonSha256,
          selectionSha256,
          mode: capability.mode,
          authorSourceRoot: capability.authorSourceRoot,
        });
      }
      return { schema: CAPABILITY_SCHEMA, status: "armed", planSha256, requestSha256, mutated: false };
    }
    fail("HGO-REPLAY", "override plan is already used or conflicts");
  }
  writeExclusive(path, Buffer.from(`${JSON.stringify(capability)}\n`, "utf8"));
  const owned = safePrivateFile(path);
  try {
    appendAudit(paths, {
      type: "authorized",
      at: capability.authorizedAt,
      requestSha256,
      planSha256,
      reasonSha256,
      selectionSha256,
      mode: capability.mode,
      authorSourceRoot: capability.authorSourceRoot,
    });
  } catch (error) {
    try {
      const observed = safePrivateFile(path);
      if (observed.dev === owned.dev && observed.ino === owned.ino) unlinkSync(path);
    } catch {}
    throw error;
  }
  return { schema: CAPABILITY_SCHEMA, status: "armed", planSha256, requestSha256, mutated: true };
}

/**
 * ADR-0059 Decision 1: the signed admission path, alongside the existing chat-mode
 * one. Mirrors `authorizeHumanGuardOverride()`'s exact capability-building/audit/
 * persistence shape (prepare -> plan -> build capabilityCore -> mac -> persist), but
 * gates arming on a verified Ed25519 proof instead of `activate === true`. There is
 * no `activate` parameter here at all: a genuine verified proof IS the authorization.
 *
 * `prepareHumanGuardOverrideAuthorization()` and `planHumanGuardOverride()` are
 * reused completely unchanged (Decision 2) -- the only difference from the chat path
 * is what gates the write: a rebuilt `po-approval-proof.mjs` intent bound to the
 * exact `(requestSha256, planSha256)` pair via `prepared.selectionSha256`, verified
 * against a trust anchor that defaults to this repository's own committed
 * `project/critical-human-proof.json` (the same one push approval and GMW already
 * use) when `trustPolicy` is not supplied -- exactly like GMW's CLI defaults
 * `--authority`.
 *
 * External signing recipe (no repository file I/O needed by the signer): run `plan`
 * to obtain `planSha256` and `repository.{head,tree}`, run `prepare-authorization`
 * with the fixed `HGO_SIGNATURE_REASON` text to obtain `selectionSha256`, then sign
 * `createPoApprovalIntent({ kind: "guard-override", featureId: "human-guard-override",
 * planSha256: HGO_SIGNATURE_INTENT_PLAN_SHA256, specSha256: HGO_SIGNATURE_INTENT_SPEC_SHA256,
 * candidate: { commit: repository.head, tree: repository.tree }, policyRevision:
 * "human-guard-override-signature-v1", subjectSha256: selectionSha256, decision:
 * "authorize" }).sha256` with the PO's own Ed25519 key.
 *
 * Deliberate scope narrowing (reported deviation, not required by ADR-0059's own
 * scope): the `global-plugin-install` denial class carries no commit/tree in its
 * repository observation (see `localPluginInstallSourceObservation`), so it has no
 * `candidate` to bind a po-approval-proof intent to. It keeps its existing
 * chat-mode-only route; extending signed admission to it is a separate, narrower
 * follow-up.
 */
export function authorizeHumanGuardOverrideBySignature({
  rootDir,
  pluginRoot,
  requestSha256,
  planSha256,
  proof,
  trustPolicy = null,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
  authorSourceRoot = null,
} = {}) {
  const prepared = prepareHumanGuardOverrideAuthorization({
    rootDir,
    pluginRoot,
    requestSha256,
    planSha256,
    reason: HGO_SIGNATURE_REASON,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  const planned = planHumanGuardOverride({
    rootDir,
    pluginRoot,
    requestSha256,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  if (planned.mode === "global-plugin-install") {
    fail("HGO-SIGNATURE-UNSUPPORTED-MODE", "signed authorization does not cover the local-plugin-install class; use the chat-mode path");
  }
  let intent;
  try {
    intent = createPoApprovalIntent({
      kind: HGO_SIGNATURE_INTENT_KIND,
      featureId: HGO_SIGNATURE_INTENT_FEATURE_ID,
      planSha256: HGO_SIGNATURE_INTENT_PLAN_SHA256,
      specSha256: HGO_SIGNATURE_INTENT_SPEC_SHA256,
      candidate: { commit: planned.repository.head, tree: planned.repository.tree },
      policyRevision: HGO_SIGNATURE_INTENT_POLICY_REVISION,
      subjectSha256: prepared.selectionSha256,
      decision: HGO_SIGNATURE_INTENT_DECISION,
    });
  } catch { fail("HGO-SIGNATURE-INTENT-INVALID", "signed authorization intent could not be built from the current repository observation"); }
  const resolvedTrustPolicy = trustPolicy ?? (() => {
    const policy = readCriticalHumanProofPolicy(rootDir);
    if (!policy.ok || policy.trustAnchor === null) {
      fail("HGO-TRUST-ANCHOR-MISSING", "project/critical-human-proof.json carries no trustAnchor");
    }
    return policy.trustAnchor;
  })();
  const verified = verifyPoApprovalProof({ intent, trustPolicy: resolvedTrustPolicy, proof });
  if (!verified.verified) fail("HGO-PROOF-INVALID", verified.code ?? "PO-APPROVAL-PROOF-INVALID");

  // global-plugin-install is already excluded above, so this is always the ordinary
  // physical-repository topology -- exactly what authorizeHumanGuardOverride() also
  // uses for every mode other than global-plugin-install.
  const repo = topology(rootDir, spawn);
  const paths = storage(repo.common);
  const capabilityCore = {
    schema: CAPABILITY_SCHEMA,
    status: "armed",
    root: repo.root,
    requestSha256,
    planSha256,
    selectionSha256: prepared.selectionSha256,
    reasonSha256: prepared.reasonSha256,
    plugin: planned.plugin,
    repository: planned.repository,
    toolName: planned.toolName,
    toolInputSha256: planned.toolInputSha256,
    commandClass: planned.commandClass,
    denials: planned.denials,
    policy: planned.policy,
    preview: planned.preview,
    eligiblePaths: planned.eligiblePaths,
    mode: planned.mode,
    authorSourceRoot: planned.authorSourceRoot,
    authorizedAt: new Date(nowMs).toISOString(),
    expiresAt: planned.expiresAt,
    consumedAt: null,
  };
  const capability = {
    ...capabilityCore,
    mac: capabilityMac(key(paths), capabilityCore),
  };
  const path = capabilityPath(paths, planSha256);
  if (existsSync(path)) {
    const prior = validatedCapability(paths, path);
    if (canonical(prior) === canonical(capability)) {
      if (!hasAuthorizedAuditEntry(paths, prior)) {
        appendAudit(paths, {
          type: "authorized",
          at: capability.authorizedAt,
          requestSha256,
          planSha256,
          reasonSha256: capability.reasonSha256,
          selectionSha256: capability.selectionSha256,
          mode: capability.mode,
          authorSourceRoot: capability.authorSourceRoot,
        });
      }
      return { schema: CAPABILITY_SCHEMA, status: "armed", planSha256, requestSha256, mutated: false };
    }
    fail("HGO-REPLAY", "override plan is already used or conflicts");
  }
  writeExclusive(path, Buffer.from(`${JSON.stringify(capability)}\n`, "utf8"));
  const owned = safePrivateFile(path);
  try {
    appendAudit(paths, {
      type: "authorized",
      at: capability.authorizedAt,
      requestSha256,
      planSha256,
      reasonSha256: capability.reasonSha256,
      selectionSha256: capability.selectionSha256,
      mode: capability.mode,
      authorSourceRoot: capability.authorSourceRoot,
    });
  } catch (error) {
    try {
      const observed = safePrivateFile(path);
      if (observed.dev === owned.dev && observed.ino === owned.ino) unlinkSync(path);
    } catch {}
    throw error;
  }
  return { schema: CAPABILITY_SCHEMA, status: "armed", planSha256, requestSha256, mutated: true };
}

export function consumeHumanGuardOverride({
  rootDir,
  pluginRoot,
  toolName,
  toolInput,
  denials,
  nowMs = Date.now(),
  spawn = spawnSync,
} = {}) {
  let repo;
  try { repo = topology(rootDir, spawn); }
  catch {
    try { repo = controlPathTopology(rootDir); }
    catch { return { status: "absent" }; }
  }
  const paths = storage(repo.common);
  const toolInputSha256 = sha(toolInput);
  const denialDigests = denials.map((denial) => ({
    guard: String(denial.guard),
    sha256: sha(String(denial.reason)),
  })).sort((left, right) => `${left.guard}:${left.sha256}`.localeCompare(`${right.guard}:${right.sha256}`));
  const files = [];
  let replanRequired = false;
  try {
    files.push(...readdirSync(paths.capabilities).filter((name) => name.endsWith(".json")).sort());
  } catch { return { status: "absent" }; }
  for (const name of files) {
    const planSha256 = name.slice(0, -5);
    if (!SHA256.test(planSha256)) continue;
    const path = capabilityPath(paths, planSha256);
    let capability;
    try { capability = validatedCapability(paths, path); }
    catch { return { status: "invalid", code: "HGO-CAPABILITY" }; }
    if (capability.status !== "armed" || capability.toolName !== toolName
      || capability.toolInputSha256 !== toolInputSha256
      || canonical(capability.denials) !== canonical(denialDigests)) continue;
    const lock = join(paths.locks, `${planSha256}.lock`);
    let lockFd;
    try { lockFd = openSync(lock, "wx", 0o600); }
    catch { return { status: "invalid", code: "HGO-CONCURRENT-CONSUME" }; }
    try {
      capability = validatedCapability(paths, path);
      let authorized = false;
      try { authorized = hasAuthorizedAuditEntry(paths, capability); }
      catch { return { status: "invalid", code: "HGO-AUDIT" }; }
      if (!authorized) {
        return { status: "invalid", code: "HGO-AUDIT" };
      }
      const plugin = pluginIdentity(pluginRoot);
      const policy = policyIdentity(repo.root, pluginRoot, denials);
      const isLocalPluginInstall = capability.mode === "global-plugin-install";
      if (isLocalPluginInstall && !exactLocalPluginInstall(toolName, toolInput, repo.root)) {
        return { status: "replan", code: "HGO-PLUGIN-INSTALL-SHAPE" };
      }
      const repository = isLocalPluginInstall
        ? localPluginInstallSourceObservation(repo)
        : repositoryObservation(repo.root, spawn);
      const expired = new Date(capability.expiresAt).getTime() <= nowMs;
      const drifted = capability.status !== "armed" || capability.root !== repo.root
        || capability.toolName !== toolName || capability.toolInputSha256 !== toolInputSha256
        || canonical(capability.denials) !== canonical(denialDigests)
        || canonical(capability.plugin) !== canonical(plugin)
        || canonical(capability.policy) !== canonical(policy)
        || canonical(capability.repository) !== canonical(repository)
        || (capability.mode === "pipeline-author-repair"
          && authorEligiblePaths(repo.root, capability.eligiblePaths, capability.authorSourceRoot) === null);
      if (expired || drifted) {
        appendAudit(paths, {
          type: expired ? "expired" : "rejected",
          at: new Date(nowMs).toISOString(),
          requestSha256: capability.requestSha256,
          planSha256,
          reasonSha256: capability.reasonSha256,
          code: expired ? "HGO-EXPIRED" : "HGO-DRIFT",
        });
        if (expired) {
          replanRequired = true;
          continue;
        }
        return { status: "replan", code: "HGO-DRIFT" };
      }
      const consumedCore = {
        ...capability,
        status: "consumed",
        consumedAt: new Date(nowMs).toISOString(),
      };
      delete consumedCore.mac;
      const consumed = {
        ...consumedCore,
        mac: capabilityMac(key(paths), consumedCore),
      };
      writeAtomic(path, Buffer.from(`${JSON.stringify(consumed)}\n`, "utf8"));
      appendAudit(paths, {
        type: "consumed",
        at: consumed.consumedAt,
        requestSha256: capability.requestSha256,
        planSha256,
        reasonSha256: capability.reasonSha256,
        mode: capability.mode,
        authorSourceRoot: capability.authorSourceRoot,
      });
      return { status: "consumed", planSha256, requestSha256: capability.requestSha256 };
    } finally {
      if (lockFd !== undefined) closeSync(lockFd);
      try { unlinkSync(lock); } catch {}
    }
  }
  return replanRequired
    ? { status: "replan", code: "HGO-EXPIRED" }
    : { status: "absent" };
}

export function verifyHumanGuardOverrideAudit({ rootDir, spawn = spawnSync } = {}) {
  const repo = topology(rootDir, spawn);
  const paths = storage(repo.common);
  const secret = key(paths);
  const entries = verifiedAuditEntries(paths, secret);
  return {
    schema: "pipeline.human-guard-override-audit-verification.v1",
    status: "valid",
    entries: entries.length,
    lastMac: entries.at(-1)?.mac ?? null,
  };
}

export const humanGuardOverrideInternals = {
  canonical,
  sha,
  eligibility,
  secureDirectory,
  safePrivateFile,
  // Exposed only so Full Verify can directly exercise the local-plugin-install
  // attestation against THIS repository's own, real .claude-plugin/marketplace.json
  // and plugins/pipeline-core tree (Critic finding F1, dispatch CRITIC-REMEDY-09) --
  // without this, the suite's synthetic fixtures could never observe a regression
  // in the real repository manifest.
  isPipelineSourceRoot,
  localPluginInstallSourceObservation,
};
