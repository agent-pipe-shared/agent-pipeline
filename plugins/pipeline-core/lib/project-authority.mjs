// SPDX-License-Identifier: SUL-1.0
/**
 * Runner-neutral project-authority compatibility migration.
 *
 * Planning has no writes and exposes only paths and digests.  An in-process,
 * unchanged plan plus an explicit activation are required for a write.  The
 * legacy `.claude` authority is never moved or removed: consumers dual-read
 * it until the neutral `project/` authority has been committed and read back.
 */
import { createHash } from "node:crypto";
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PROJECT_AUTHORITY_SCHEMA = "pipeline.project-authority.v1";
export const PROJECT_AUTHORITY_RECOVERY_SCHEMA = "pipeline.project-authority-recovery.v1";
export const PROJECT_AUTHORITY_CLASSIFICATION_SCHEMA = "pipeline.project-authority-classification.v1";
export const PROJECT_AUTHORITY_ADOPTION_RECEIPT_SCHEMA = "pipeline.project-authority-adoption-receipt.v1";
export const PROJECT_AUTHORITY_CONTRACT_VERSION = "project-authority.v1";
export const PROJECT_AUTHORITY_CONTRACT_SHA256 = createHash("sha256").update("project-authority.v1|pipeline.yaml|pipeline-state.json|pipeline.json|guard-config.json|guard-override.log.jsonl").digest("hex");
export const NEUTRAL_MANIFEST = "project/pipeline.yaml";
export const NEUTRAL_STATE = "project/pipeline-state.json";
export const NEUTRAL_CALIBRATION = "project/pipeline.json";
export const NEUTRAL_GUARD_CONFIG = "project/guard-config.json";
export const NEUTRAL_GUARD_AUDIT = "project/guard-override.log.jsonl";
export const LEGACY_MANIFEST = ".claude/pipeline.yaml";
export const LEGACY_STATE = ".claude/pipeline-state.json";
export const LEGACY_CALIBRATION = ".claude/pipeline.json";
export const LEGACY_GUARD_CONFIG = ".claude/guard-config.json";
export const LEGACY_GUARD_AUDIT = ".claude/guard-override.log.jsonl";
export const PROJECT_AUTHORITY_TRANSACTION_DIR = ".pipeline-project-authority-migration";
const JOURNAL_FILE = "journal.json";
const JOURNAL_SCHEMA = "pipeline.project-authority-journal.v1";
const TARGETS = Object.freeze([
  { path: NEUTRAL_MANIFEST, legacy: LEGACY_MANIFEST, kind: "project-authority" },
  { path: NEUTRAL_STATE, legacy: LEGACY_STATE, kind: "project-state" },
  { path: NEUTRAL_CALIBRATION, legacy: LEGACY_CALIBRATION, kind: "project-calibration" },
  { path: NEUTRAL_GUARD_CONFIG, legacy: LEGACY_GUARD_CONFIG, kind: "project-guard-config" },
  { path: NEUTRAL_GUARD_AUDIT, legacy: LEGACY_GUARD_AUDIT, kind: "project-guard-audit" },
]);
const PLANS = new WeakMap();
const RECOVERY_PLANS = new WeakMap();
const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_OBJECT = /^[0-9a-f]{40,64}$/u;
const MODULE_PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

class IntentionalInterruption extends Error {}
const sha = (value) => createHash("sha256").update(value).digest("hex");
const stableJson = (value) => JSON.stringify(value);
const absent = () => ({ status: "absent", sha256: null, byteLength: 0 });
const present = (bytes) => ({ status: "present", sha256: sha(bytes), byteLength: bytes.length });

function gitEvidence(root) {
  const run = (args) => {
    const value = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });
    return value.status === 0 && !value.error ? String(value.stdout).trim() : null;
  };
  const commit = run(["rev-parse", "HEAD"]);
  const tree = run(["rev-parse", "HEAD^{tree}"]);
  if (!commit || !tree || !GIT_OBJECT.test(commit) || !GIT_OBJECT.test(tree)) return null;
  const branch = run(["branch", "--show-current"]);
  const upstream = run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const status = spawnSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });
  return { commit, tree, branch: branch || null, upstream: upstream || null, clean: status.status === 0 && String(status.stdout).length === 0 };
}

// Inventory only closed regular files below the loaded package.  Symlinks,
// device nodes and path escapes are refused so a receipt cannot attest to a
// caller-selected/private source tree.
function packageInventory(root) {
  const base = realpathSync(root);
  const entries = [];
  const walk = (dir, prefix = "") => {
    for (const name of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${name.name}` : name.name;
      const full = join(dir, name.name);
      if (name.isSymbolicLink()) throw new Error("package inventory contains a symbolic link");
      if (name.isDirectory()) walk(full, rel);
      else if (name.isFile()) entries.push({ path: rel, sha256: sha(readFileSync(full)), byteLength: readFileSync(full).length });
      else throw new Error("package inventory contains a non-regular file");
    }
  };
  walk(base);
  const digest = sha(Buffer.from(entries.map((entry) => `${entry.path}\0${entry.sha256}\0${entry.byteLength}`).join("\n")));
  return { digest, entries };
}
function loadedPackageEvidence(destination) {
  try {
    const manifestPath = join(MODULE_PLUGIN_ROOT, ".codex-plugin", "plugin.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!manifest || typeof manifest !== "object" || typeof manifest.version !== "string" || !manifest.version) throw new Error("plugin manifest is invalid");
    const sourceInventory = packageInventory(MODULE_PLUGIN_ROOT);
    const destinationRoot = join(destination, "plugins", "pipeline-core");
    if (!existsSync(destinationRoot)) throw new Error("destination package is missing");
    const destinationInventory = packageInventory(destinationRoot);
    if (sourceInventory.digest !== destinationInventory.digest) throw new Error("loaded and destination packages differ");
    return {
      loadedPackageRoot: MODULE_PLUGIN_ROOT,
      manifestVersion: manifest.version,
      manifestSha256: sha(Buffer.from(JSON.stringify(manifest))),
      packageSha256: sourceInventory.digest,
      compatibility: "byte-identical-self-application",
      operation: "adopt-existing-neutral",
    };
  } catch (error) { return { error: error.message }; }
}
/** Read-only runtime/package evidence used to construct a closed adoption envelope. */
export function inspectProjectAuthorityProvenance({ rootDir = process.cwd() } = {}) {
  try {
    const root = realRoot(rootDir);
    const git = gitEvidence(root);
    const runtime = loadedPackageEvidence(root);
    if (runtime.error) return { status: "unavailable", reason: "loaded package provenance unavailable" };
    return { status: "ready", ...git, ...runtime, authorityContractSha256: PROJECT_AUTHORITY_CONTRACT_SHA256 };
  } catch { return { status: "unavailable", reason: "runtime provenance unavailable" }; }
}

function realRoot(rootDir) {
  const requested = resolve(rootDir);
  const info = lstatSync(requested);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("root must be a real project directory");
  return realpathSync(requested);
}
function projectPath(root, path) {
  const candidate = resolve(root, path);
  if (relative(root, candidate).startsWith(`..${sep}`) || candidate === root) throw new Error("unsafe project-relative path");
  let cursor = root;
  for (const component of path.split("/")) {
    cursor = join(cursor, component);
    if (!existsSync(cursor)) continue;
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) throw new Error(`project path contains a symbolic link: ${path}`);
    if (cursor !== candidate && !info.isDirectory()) throw new Error(`project path has a non-directory parent: ${path}`);
  }
  return candidate;
}
function image(root, path) {
  const full = projectPath(root, path);
  if (!existsSync(full)) return absent();
  const info = lstatSync(full);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`authority path is not a regular file: ${path}`);
  return present(readFileSync(full));
}
function bytes(root, path) {
  const full = projectPath(root, path);
  if (!existsSync(full)) return null;
  const info = lstatSync(full);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`authority path is not a regular file: ${path}`);
  return readFileSync(full);
}
function sameImage(left, right) {
  return left?.status === right?.status && left?.sha256 === right?.sha256 && left?.byteLength === right?.byteLength;
}
function readLayer(root, manifest, state, calibration, guardConfig, guardAudit, source) {
  const manifestImage = image(root, manifest);
  const stateImage = image(root, state);
  const calibrationImage = image(root, calibration);
  const guardConfigImage = image(root, guardConfig);
  const guardAuditImage = image(root, guardAudit);
  if (manifestImage.status === "absent") {
    return {
      source, status: "absent", manifest: manifestImage, state: stateImage,
      calibration: calibrationImage, guardConfig: guardConfigImage, guardAudit: guardAuditImage,
    };
  }
  return {
    source, status: "ready", manifest: manifestImage, state: stateImage,
    calibration: calibrationImage, guardConfig: guardConfigImage, guardAudit: guardAuditImage,
  };
}
function authority(root) {
  const neutral = readLayer(
    root, NEUTRAL_MANIFEST, NEUTRAL_STATE, NEUTRAL_CALIBRATION,
    NEUTRAL_GUARD_CONFIG, NEUTRAL_GUARD_AUDIT, "neutral",
  );
  const legacy = readLayer(
    root, LEGACY_MANIFEST, LEGACY_STATE, LEGACY_CALIBRATION,
    LEGACY_GUARD_CONFIG, LEGACY_GUARD_AUDIT, "legacy",
  );
  if (neutral.status === "ready") {
    if (neutral.state.status === "present") {
      let state;
      try { state = JSON.parse(bytes(root, NEUTRAL_STATE).toString("utf8")); }
      catch { state = null; }
      if (state !== null) {
        const portability = validatePortablePipelineState(state);
        if (!portability.ok) {
          return {
            status: "unsafe",
            reason: portability.reason,
            code: portability.code,
          };
        }
      }
    }
    // A state file from a different layer would make the reader dependent on
    // precedence rather than one authority boundary.  Stop instead of mixing.
    if (neutral.state.status === "absent" && legacy.state.status === "present") {
      return { status: "mixed", reason: "neutral authority has no neutral state while legacy state remains" };
    }
    for (const [name, neutralImage, legacyImage] of [
      ["calibration", neutral.calibration, legacy.calibration],
      ["guard config", neutral.guardConfig, legacy.guardConfig],
      ["guard audit", neutral.guardAudit, legacy.guardAudit],
    ]) {
      if (neutralImage.status === "absent" && legacyImage.status === "present") {
        return { status: "mixed", reason: `neutral authority has no neutral ${name} while legacy ${name} remains` };
      }
    }
    return {
      status: "ready",
      source: "neutral",
      manifest: NEUTRAL_MANIFEST,
      state: neutral.state.status === "present" ? NEUTRAL_STATE : null,
      calibration: neutral.calibration.status === "present" ? NEUTRAL_CALIBRATION : null,
      guardConfig: neutral.guardConfig.status === "present" ? NEUTRAL_GUARD_CONFIG : null,
      guardAudit: neutral.guardAudit.status === "present" ? NEUTRAL_GUARD_AUDIT : null,
      manifestSha256: neutral.manifest.sha256,
      stateSha256: neutral.state.sha256,
    };
  }
  if (legacy.status === "ready") {
    return {
      status: "ready",
      source: "legacy",
      manifest: LEGACY_MANIFEST,
      state: legacy.state.status === "present" ? LEGACY_STATE : null,
      calibration: legacy.calibration.status === "present" ? LEGACY_CALIBRATION : null,
      guardConfig: legacy.guardConfig.status === "present" ? LEGACY_GUARD_CONFIG : null,
      guardAudit: legacy.guardAudit.status === "present" ? LEGACY_GUARD_AUDIT : null,
      manifestSha256: legacy.manifest.sha256,
      stateSha256: legacy.state.sha256,
    };
  }
  return { status: "missing", reason: "project authority manifest is missing" };
}

function classifyLayer(layer, source, legacyLayer = null) {
  const files = [
    [NEUTRAL_MANIFEST, layer.manifest], [NEUTRAL_STATE, layer.state],
    [NEUTRAL_CALIBRATION, layer.calibration], [NEUTRAL_GUARD_CONFIG, layer.guardConfig],
    [NEUTRAL_GUARD_AUDIT, layer.guardAudit],
  ];
  return files.map(([path, image]) => ({
    path,
    classification: image.status === "present" ? (source === "neutral" ? "canonical" : "migrated") : (legacyLayer && legacyLayer.manifest.status === "present" ? "generated" : "prohibited"),
    status: image.status, sha256: image.sha256, byteLength: image.byteLength,
  }));
}

export function classifyProjectAuthority({ rootDir = process.cwd() } = {}) {
  try {
    const root = realRoot(rootDir);
    const current = authority(root);
    const layer = readLayer(root, NEUTRAL_MANIFEST, NEUTRAL_STATE, NEUTRAL_CALIBRATION, NEUTRAL_GUARD_CONFIG, NEUTRAL_GUARD_AUDIT, "neutral");
    const legacyLayer = readLayer(root, LEGACY_MANIFEST, LEGACY_STATE, LEGACY_CALIBRATION, LEGACY_GUARD_CONFIG, LEGACY_GUARD_AUDIT, "legacy");
    return { schema: PROJECT_AUTHORITY_CLASSIFICATION_SCHEMA, version: PROJECT_AUTHORITY_CONTRACT_VERSION, status: current.status, source: current.source ?? null, files: classifyLayer(layer, current.source, legacyLayer), git: gitEvidence(root) };
  } catch {
    return { schema: PROJECT_AUTHORITY_CLASSIFICATION_SCHEMA, version: PROJECT_AUTHORITY_CONTRACT_VERSION, status: "invalid", reason: "project authority classification unavailable" };
  }
}
function result(status, extra = {}) { return { schema: PROJECT_AUTHORITY_SCHEMA, status, requiresExplicitActivation: true, ...extra }; }
function recoveryResult(status, extra = {}) { return { schema: PROJECT_AUTHORITY_RECOVERY_SCHEMA, status, requiresExplicitActivation: true, ...extra }; }
function transactionPaths(root) {
  const transaction = projectPath(root, PROJECT_AUTHORITY_TRANSACTION_DIR);
  return { transaction, journal: join(transaction, JOURNAL_FILE) };
}
function fsyncFile(path) { const fd = openSync(path, "r+"); try { fsyncSync(fd); } finally { closeSync(fd); } }
function fsyncDirectory(path) {
  try { const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }
  catch (error) {
    // Windows does not consistently support directory fsync. The rename and
    // journal protocol remain recoverable; do not misclassify that platform
    // limitation as a successful durability claim.
    if (process.platform !== "win32") throw error;
  }
}
function durableWrite(path, value) { writeFileSync(path, value, { mode: 0o600 }); fsyncFile(path); }
function durableJournal(root, journal) {
  const { transaction, journal: path } = transactionPaths(root);
  durableWrite(path, `${JSON.stringify(journal)}\n`); fsyncDirectory(transaction);
}
function planSignature(plan) { return stableJson(plan); }
function remember(plan, internal) { PLANS.set(plan, { signature: planSignature(plan), ...internal }); return plan; }
function authenticated(plan) {
  try {
    const remembered = PLANS.get(plan);
    if (!remembered || planSignature(plan) !== remembered.signature) return null;
    return remembered;
  } catch { return null; }
}
function changedTargets(root) {
  return TARGETS.map((target) => {
    const source = image(root, target.legacy);
    const before = image(root, target.path);
    return { ...target, before, after: source, changed: !sameImage(before, source) };
  }).filter((target) => target.after.status === "present");
}

function provenanceEvidence(root, declared) {
  if (declared === undefined || declared === null) return { ok: true, value: gitEvidence(root) };
  if (typeof declared !== "object" || Array.isArray(declared)) return { ok: false, reason: "provenance must be an object" };
  const value = gitEvidence(root);
  const source = declared.source ?? declared.sourceCommit ?? declared.commit ?? null;
  const destination = declared.destination ?? declared.destinationCommit ?? declared.commit ?? null;
  const commit = declared.commit ?? destination;
  const tree = declared.tree ?? declared.destinationTree ?? null;
  if (declared.contractVersion !== undefined && declared.contractVersion !== PROJECT_AUTHORITY_CONTRACT_VERSION) return { ok: false, reason: "authority contract provenance mismatch" };
  if (declared.authorityContractSha256 !== undefined && declared.authorityContractSha256 !== PROJECT_AUTHORITY_CONTRACT_SHA256) return { ok: false, reason: "authority contract digest provenance mismatch" };
  if (declared.sourceCommit !== undefined && (!value || !GIT_OBJECT.test(String(declared.sourceCommit)) || declared.sourceCommit !== value.commit)) return { ok: false, reason: "source commit provenance mismatch" };
  if (declared.sourceTree !== undefined && (!value || !GIT_OBJECT.test(String(declared.sourceTree)) || declared.sourceTree !== value.tree)) return { ok: false, reason: "source tree provenance mismatch" };
  if (commit !== null && (!value || !GIT_OBJECT.test(String(commit)) || commit !== value.commit)) return { ok: false, reason: "destination commit provenance mismatch" };
  if (tree !== null && (!value || !GIT_OBJECT.test(String(tree)) || tree !== value.tree)) return { ok: false, reason: "destination tree provenance mismatch" };
  if (declared.clean !== undefined && (!value || declared.clean !== value.clean)) return { ok: false, reason: "destination cleanliness provenance mismatch" };
  if (declared.branch !== undefined && (!value || declared.branch !== value.branch)) return { ok: false, reason: "destination branch provenance mismatch" };
  if (declared.upstream !== undefined && (!value || declared.upstream !== value.upstream)) return { ok: false, reason: "destination upstream provenance mismatch" };
  if (declared.compatibility !== undefined && typeof declared.compatibility !== "string") return { ok: false, reason: "runtime compatibility provenance is malformed" };
  if (declared.operation !== undefined && declared.operation !== "adopt-existing-neutral" && declared.operation !== "adopt-legacy" && declared.operation !== "migrate-legacy") return { ok: false, reason: "runtime operation provenance mismatch" };
  for (const key of ["manifestVersion", "manifestSha256", "packageSha256"]) {
    if (declared[key] !== undefined && (key.endsWith("Sha256") ? !SHA256.test(String(declared[key])) : typeof declared[key] !== "string" || !declared[key])) return { ok: false, reason: `runtime ${key} provenance is malformed` };
  }
  if (declared.operation === "adopt-existing-neutral" || declared.compatibility === "byte-identical-self-application") {
    if (declared.receipt !== undefined) {
      const receipt = declared.receipt;
      if (!receipt || receipt.schema !== PROJECT_AUTHORITY_ADOPTION_RECEIPT_SCHEMA || receipt.version !== PROJECT_AUTHORITY_CONTRACT_VERSION || receipt.operation !== "adopt-existing-neutral" || !SHA256.test(String(receipt.receiptSha256 ?? ""))) return { ok: false, reason: "adoption receipt is malformed" };
      const copy = { ...receipt }; delete copy.receiptSha256;
      if (sha(Buffer.from(JSON.stringify(copy))) !== receipt.receiptSha256) return { ok: false, reason: "adoption receipt digest mismatch" };
      const packageEvidence = loadedPackageEvidence(root);
      if (packageEvidence.error) return { ok: false, reason: "loaded package provenance unavailable" };
      for (const key of ["manifestVersion", "manifestSha256", "packageSha256"]) {
        if (receipt[key] !== packageEvidence[key]) return { ok: false, reason: `runtime ${key} provenance mismatch` };
      }
    } else {
      const packageEvidence = loadedPackageEvidence(root);
      if (packageEvidence.error) return { ok: false, reason: "loaded package provenance unavailable" };
      for (const key of ["manifestVersion", "manifestSha256", "packageSha256"]) if (declared[key] !== packageEvidence[key]) return { ok: false, reason: `runtime ${key} provenance mismatch` };
      if (declared.compatibility !== packageEvidence.compatibility) return { ok: false, reason: "runtime compatibility provenance mismatch" };
    }
  }
  return { ok: true, value: { ...declared, observed: value, sourceCommit: declared.sourceCommit ?? source, destinationCommit: declared.destinationCommit ?? destination } };
}

function privateAdoptionArchive(root, planSha256, targets) {
  const git = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  let common;
  if (git.status === 0 && !git.error && String(git.stdout).trim()) common = realpathSync(String(git.stdout).trim());
  else {
    const fallback = join(root, ".git");
    if (!existsSync(fallback)) throw new Error("mixed authority adoption requires a Git common directory");
    common = realpathSync(fallback);
  }
  const commonInfo = lstatSync(common);
  if (!commonInfo.isDirectory() || commonInfo.isSymbolicLink()) throw new Error("Git common directory is unsafe");
  const archive = join(common, "agent-pipeline", "project-authority-adoption", planSha256);
  if (existsSync(archive)) throw new Error("project authority adoption archive already exists");
  mkdirSync(archive, { recursive: true, mode: 0o700 });
  const archiveInfo = lstatSync(archive);
  if (!archiveInfo.isDirectory() || archiveInfo.isSymbolicLink() || (archiveInfo.mode & 0o077) !== 0) {
    throw new Error("project authority adoption archive is unsafe");
  }
  const entries = [];
  for (const [index, target] of targets.entries()) {
    if (target.before.status !== "present") continue;
    const name = `preimage-${index}`;
    const destination = join(archive, name);
    writeFileSync(destination, bytes(root, target.path), { mode: 0o600, flag: "wx" });
    const observed = image(archive, name);
    if (!sameImage(observed, target.before)) throw new Error(`project authority adoption archive readback failed: ${target.path}`);
    entries.push({ path: target.path, archive: name, before: target.before });
  }
  const baseRecord = { schema: "pipeline.project-authority-adoption-archive.v1", planSha256, entries };
  const packageEvidence = loadedPackageEvidence(root);
  if (packageEvidence.error) throw new Error("loaded package provenance unavailable");
  const receiptPayload = {
    schema: PROJECT_AUTHORITY_ADOPTION_RECEIPT_SCHEMA,
    version: PROJECT_AUTHORITY_CONTRACT_VERSION,
    operation: "adopt-existing-neutral",
    planSha256,
    entryCount: entries.length,
    sanitized: true,
    manifestVersion: packageEvidence.manifestVersion,
    manifestSha256: packageEvidence.manifestSha256,
    packageSha256: packageEvidence.packageSha256,
  };
  const receiptSha256 = sha(Buffer.from(JSON.stringify(receiptPayload)));
  const record = { ...baseRecord, receipt: { ...receiptPayload, receiptSha256 } };
  const manifest = JSON.stringify(record);
  writeFileSync(join(archive, "manifest.json"), `${manifest}\n`, { mode: 0o600, flag: "wx" });
  // Keep a standalone sanitized receipt for downstream replay; it contains no
  // private path or caller-supplied identity and is digest-bound to the plan.
  writeFileSync(join(archive, "receipt.json"), `${JSON.stringify(record.receipt)}\n`, { mode: 0o600, flag: "wx" });
  const manifestSha256 = sha(Buffer.from(manifest));
  return {
    entryCount: entries.length, manifestSha256,
    receipt: { ...receiptPayload, receiptSha256, manifestSha256 },
  };
}

function legacyStatePortability(root) {
  const raw = bytes(root, LEGACY_STATE);
  if (raw === null) return { ok: true };
  let state;
  try { state = JSON.parse(raw.toString("utf8")); }
  catch { return { ok: false, status: "invalid-source", reason: "legacy State is not valid JSON" }; }
  const portability = validatePortablePipelineState(state);
  if (!portability.ok) {
    return {
      ok: false,
      status: "session-cleanup-required",
      reason: "legacy State retains a machine-local session cleanup binding",
    };
  }
  return { ok: true };
}

/**
 * Portable State may describe that cleanup is structurally unbound (`null`),
 * but may never carry a descriptor identity or a historical copy of one.
 * This validator is shared by migration and every neutral reader/writer.
 */
export function validatePortablePipelineState(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    return { ok: false, code: "PA-STATE-INVALID", reason: "portable State is not a JSON object" };
  }
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const failure = visit(value[index], `${path}[${index}]`);
        if (failure) return failure;
      }
      return null;
    }
    if (value === null || typeof value !== "object") return null;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (key === "sessionCleanup" && child !== null) {
        return {
          ok: false,
          code: "PA-STATE-SESSION-CLEANUP-PRIVATE",
          reason: "portable State retains a machine-local session cleanup binding",
          path: childPath,
        };
      }
      const failure = visit(child, childPath);
      if (failure) return failure;
    }
    return null;
  };
  return visit(state, "$") ?? { ok: true, code: "PA-STATE-PORTABLE" };
}

function portabilityFailureResult(portability) {
  return result(portability.status, {
    code: portability.status === "session-cleanup-required"
      ? "PA-MIGRATION-SESSION-CLEANUP-BOUND"
      : "PA-MIGRATION-STATE-INVALID",
    source: "legacy",
    compatibility: "dual-read-one-write",
    diagnostics: [portability.reason],
    recovery: portability.status === "session-cleanup-required"
      ? {
        operation: "sanctioned-session-cleanup-release",
        replan: "project-authority-migration",
      }
      : null,
    targets: [],
  });
}

/** Read neutral authority first; legacy is a compatibility reader only. */
export function readProjectAuthority({ rootDir = process.cwd() } = {}) {
  try { return authority(realRoot(rootDir)); }
  catch { return { status: "invalid", reason: "project authority cannot be read" }; }
}

/** Resolve one coherent runner-neutral or compatibility-layer path set. */
export function resolveProjectAuthorityPaths({ rootDir = process.cwd() } = {}) {
  const current = readProjectAuthority({ rootDir });
  if (current.status !== "ready") return current;
  const neutral = current.source === "neutral";
  return {
    ...current,
    manifest: current.manifest,
    state: current.state ?? (neutral ? NEUTRAL_STATE : LEGACY_STATE),
    calibration: current.calibration ?? (neutral ? NEUTRAL_CALIBRATION : LEGACY_CALIBRATION),
    guardConfig: current.guardConfig ?? (neutral ? NEUTRAL_GUARD_CONFIG : LEGACY_GUARD_CONFIG),
    guardAudit: current.guardAudit ?? (neutral ? NEUTRAL_GUARD_AUDIT : LEGACY_GUARD_AUDIT),
  };
}

/** Create an exact, write-free legacy-to-neutral migration plan. */
export function planProjectAuthorityMigration({ rootDir = process.cwd(), provenance } = {}) {
  let root;
  try { root = realRoot(rootDir); } catch (error) { return result("invalid-root", { diagnostics: [error.message], targets: [] }); }
  try {
    const provenanceResult = provenanceEvidence(root, provenance);
    if (!provenanceResult.ok) return result("provenance-rejected", { code: "PA-PROVENANCE-MISMATCH", diagnostics: [provenanceResult.reason], targets: [] });
    const { transaction, journal } = transactionPaths(root);
    if (existsSync(transaction) || existsSync(journal)) return result("recovery-required", { diagnostics: ["project authority recovery is required"], targets: [] });
    const current = authority(root);
    if (current.status === "mixed") {
      if (provenance === undefined || provenance === null) return result("provenance-rejected", { code: "PA-PROVENANCE-REQUIRED", diagnostics: ["adopt-existing-neutral requires closed runtime/source/destination provenance"], targets: [] });
      if (provenanceResult.value?.operation !== undefined && provenanceResult.value.operation !== "adopt-existing-neutral") return result("provenance-rejected", { code: "PA-PROVENANCE-MISMATCH", diagnostics: ["mixed authority requires adopt-existing-neutral provenance"], targets: [] });
      const portability = legacyStatePortability(root);
      if (!portability.ok) return portabilityFailureResult(portability);
      const internalTargets = changedTargets(root);
      if (internalTargets.length === 0) return result("mixed", { diagnostics: [current.reason], targets: [] });
      // When this is a real governed checkout, bind the loaded runtime/package
      // automatically; compatibility fixtures without a package remain legacy
      // migrate-compatible and carry no adoption claim.
      const runtime = loadedPackageEvidence(root);
      const boundProvenance = runtime.error ? provenanceResult.value : { ...provenanceResult.value, ...runtime };
      const publicTargets = internalTargets.map(({ path, kind, before, after, changed }) => ({ path, kind, before, after, changed }));
      return remember(result("ready", {
        source: "legacy", operation: "adopt-existing-neutral",
        compatibility: "dual-read-one-write",
        contractVersion: PROJECT_AUTHORITY_CONTRACT_VERSION, authorityContractSha256: PROJECT_AUTHORITY_CONTRACT_SHA256,
        provenance: boundProvenance,
        classification: classifyProjectAuthority({ rootDir: root }),
        recovery: "adopt-legacy-after-remote-checkout",
        targets: publicTargets,
        activation: {
          required: true,
          command: "apply --activate",
          legacyRetained: true,
          neutralPreimagesArchivedInGitMetadata: true,
        },
      }), { root, status: "ready", mode: "adopt-legacy", targets: internalTargets, provenance: boundProvenance });
    }
    if (current.status !== "ready") return result(current.status, { diagnostics: [current.reason], targets: [] });
    if (current.source === "neutral") return remember(result("noop", { source: "neutral", compatibility: "dual-read-one-write", targets: [] }), { root, status: "noop", targets: [] });
    const portability = legacyStatePortability(root);
    if (!portability.ok) return portabilityFailureResult(portability);
    const internalTargets = changedTargets(root);
    const publicTargets = internalTargets.map(({ path, kind, before, after, changed }) => ({ path, kind, before, after, changed }));
    return remember(result(publicTargets.some((target) => target.changed) ? "ready" : "noop", {
      source: "legacy", operation: "migrate-legacy", compatibility: "dual-read-one-write", contractVersion: PROJECT_AUTHORITY_CONTRACT_VERSION, authorityContractSha256: PROJECT_AUTHORITY_CONTRACT_SHA256,
      provenance: provenanceResult.value,
      classification: classifyProjectAuthority({ rootDir: root }), targets: publicTargets,
      activation: { required: true, command: "apply --activate", legacyRetained: true },
    }), { root, status: publicTargets.some((target) => target.changed) ? "ready" : "noop", targets: internalTargets, provenance: provenanceResult.value });
  } catch (error) { return result("invalid-source", { diagnostics: [error.message], targets: [] }); }
}
function validateBeforeApply(root, state) {
  const current = authority(root);
  if (state.mode === "adopt-legacy") {
    if (current.status !== "mixed") throw new Error("mixed authority changed since planning");
  } else if (current.source !== "legacy") throw new Error("legacy source changed since planning");
  if (state.provenance && state.provenance.observed) {
    const reobserved = provenanceEvidence(root, state.provenance);
    if (!reobserved.ok) throw new Error(reobserved.reason);
    const before = state.provenance.observed;
    const now = reobserved.value.observed;
    for (const key of ["commit", "tree", "branch", "upstream", "clean"]) {
      if (before?.[key] !== undefined && before[key] !== now?.[key]) throw new Error(`destination ${key} provenance changed since planning`);
    }
  }
  for (const target of state.targets) {
    if (!sameImage(image(root, target.path), target.before)) throw new Error(`neutral destination changed since planning: ${target.path}`);
    if (!sameImage(image(root, target.legacy), target.after)) throw new Error(`legacy source changed since planning: ${target.legacy}`);
  }
}
function prepare(root, targets) {
  const { transaction } = transactionPaths(root);
  if (existsSync(transaction)) throw new Error("project authority recovery is required");
  mkdirSync(transaction, { mode: 0o700 }); fsyncDirectory(root);
  const entries = [];
  try {
    for (const [index, target] of targets.entries()) {
      const stage = `stage-${index}`; const preimage = target.before.status === "present" ? `preimage-${index}` : null;
      durableWrite(join(transaction, stage), bytes(root, target.legacy));
      if (preimage) durableWrite(join(transaction, preimage), bytes(root, target.path));
      entries.push({ path: target.path, kind: target.kind, before: target.before, after: target.after, stage, preimage, displaced: preimage ? `displaced-${index}` : null, state: "staged" });
    }
    const journal = { schema: JOURNAL_SCHEMA, state: "prepared", targets: entries };
    durableJournal(root, journal); return journal;
  } catch (error) { rmSync(transaction, { recursive: true, force: true }); throw error; }
}
function commitTarget(root, journal, entry) {
  const { transaction } = transactionPaths(root); const destination = projectPath(root, entry.path);
  // The neutral layer may not exist yet.  It contains no authority bytes until
  // the already-journalled staged file is atomically renamed into it.
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 }); fsyncDirectory(dirname(destination));
  if (entry.before.status === "present") {
    journal.state = "applying"; entry.state = "displacing"; durableJournal(root, journal);
    renameSync(destination, join(transaction, entry.displaced)); fsyncDirectory(dirname(destination)); fsyncDirectory(transaction);
  }
  renameSync(join(transaction, entry.stage), destination); fsyncDirectory(dirname(destination)); fsyncDirectory(transaction);
  if (!sameImage(image(root, entry.path), entry.after)) throw new Error(`neutral write readback failed: ${entry.path}`);
  entry.state = "renamed"; durableJournal(root, journal);
}
function validateJournal(root, journal) {
  if (!journal || journal.schema !== JOURNAL_SCHEMA || !["prepared", "applying", "complete"].includes(journal.state) || !Array.isArray(journal.targets)) throw new Error("project authority journal is corrupt");
  if (journal.targets.length > TARGETS.length || new Set(journal.targets.map((entry) => entry.path)).size !== journal.targets.length) throw new Error("project authority journal has an invalid target boundary");
  const { transaction } = transactionPaths(root);
  for (const entry of journal.targets) {
    const expected = TARGETS.find((target) => target.path === entry.path);
    if (!expected || entry.path !== expected.path || entry.kind !== expected.kind || !["staged", "displacing", "renamed"].includes(entry.state)
      || !entry.before || !entry.after || !["present", "absent"].includes(entry.before.status) || entry.after.status !== "present"
      || !SHA256.test(entry.after.sha256) || !Number.isInteger(entry.after.byteLength)) throw new Error("project authority journal has an invalid target proof");
    if (entry.before.status === "present" && (!SHA256.test(entry.before.sha256) || !Number.isInteger(entry.before.byteLength) || !entry.preimage || !entry.displaced)) throw new Error("project authority journal has an invalid preimage proof");
    if (entry.before.status === "absent" && (entry.preimage !== null || entry.displaced !== null || entry.before.sha256 !== null || entry.before.byteLength !== 0)) throw new Error("project authority journal has an invalid absent preimage");
    const stage = join(transaction, entry.stage);
    if (entry.state !== "renamed" && (!existsSync(stage) || !sameImage(present(readFileSync(stage)), entry.after))) throw new Error("project authority staged proof is missing or corrupt");
    if (entry.before.status === "present" && (!existsSync(join(transaction, entry.preimage)) || !sameImage(present(readFileSync(join(transaction, entry.preimage))), entry.before))) throw new Error("project authority preimage proof is missing or corrupt");
    const destination = image(root, entry.path);
    if (!["staged", "displacing"].includes(entry.state) && !sameImage(destination, entry.after)) throw new Error("project authority target changed after interruption");
    if (entry.state === "displacing" && entry.before.status === "present" && !existsSync(join(transaction, entry.displaced))) throw new Error("project authority displaced proof is missing");
  }
}
function restore(root, journal) {
  const { transaction } = transactionPaths(root);
  journal.state = "applying"; durableJournal(root, journal);
  for (const entry of [...journal.targets].reverse()) {
    const destination = projectPath(root, entry.path); const actual = image(root, entry.path);
    if (entry.state === "staged") continue;
    if (entry.state === "displacing") {
      if (actual.status !== "absent") throw new Error(`destination changed during recovery: ${entry.path}`);
      renameSync(join(transaction, entry.displaced), destination); fsyncDirectory(dirname(destination));
      entry.state = "staged"; durableJournal(root, journal); continue;
    }
    if (!sameImage(actual, entry.after)) throw new Error(`destination changed during recovery: ${entry.path}`);
    if (entry.before.status === "absent") unlinkSync(destination);
    else {
      const quarantine = join(transaction, `rollback-${entry.stage}`);
      renameSync(destination, quarantine); renameSync(join(transaction, entry.displaced), destination); unlinkSync(quarantine);
    }
    fsyncDirectory(dirname(destination)); entry.state = "staged"; durableJournal(root, journal);
  }
  rmSync(transaction, { recursive: true, force: true }); fsyncDirectory(root);
}

export function applyProjectAuthorityMigration(plan, { rootDir = process.cwd(), activate = false, interruptAfterRename } = {}) {
  const state = authenticated(plan);
  if (!state) return result("rejected", { reason: "unauthenticated or changed plan" });
  if (state.status === "noop") return result("noop", { source: "neutral", targets: [] });
  if (!activate) return result("activation-required", { reason: "explicit activation required" });
  let root;
  try {
    root = realRoot(rootDir); if (root !== state.root) throw new Error("apply root differs from the authenticated plan root");
    const { transaction } = transactionPaths(root); if (existsSync(transaction)) throw new Error("project authority recovery is required");
    if (!authenticated(plan)) throw new Error("public plan changed since authentication");
    const portability = legacyStatePortability(root);
    if (!portability.ok) return portabilityFailureResult(portability);
    validateBeforeApply(root, state);
    const adoptionArchive = state.mode === "adopt-legacy"
      ? privateAdoptionArchive(root, sha(Buffer.from(planSignature(plan))), state.targets)
      : null;
    const journal = prepare(root, state.targets);
    try {
      for (const [index, entry] of journal.targets.entries()) {
        commitTarget(root, journal, entry);
        if (interruptAfterRename?.({ index, target: entry.path })) throw new IntentionalInterruption(`interrupted after ${entry.path}`);
      }
      journal.state = "complete"; durableJournal(root, journal); rmSync(transaction, { recursive: true, force: true }); fsyncDirectory(root);
      const readback = authority(root); if (readback.status !== "ready" || readback.source !== "neutral") throw new Error("neutral authority readback failed");
      PLANS.delete(plan); return result("applied", {
        source: "neutral",
        targets: state.targets.map(({ path }) => path),
        legacyRetained: true,
        ...(adoptionArchive === null ? {} : { adoptionArchive, adoptionReceipt: adoptionArchive.receipt }),
      });
    } catch (error) {
      if (error instanceof IntentionalInterruption) return result("interrupted", { reason: error.message });
      try { restore(root, journal); } catch (recoveryError) { return result("recovery-required", { reason: recoveryError.message }); }
      return result("rolled-back", { reason: error.message });
    }
  } catch (error) { return result("rejected", { reason: error.message }); }
}

/** Preview recovery only; it never writes or silently resumes a cutover. */
export function planPendingProjectAuthorityRecovery({ rootDir = process.cwd() } = {}) {
  let root;
  try { root = realRoot(rootDir); const { transaction, journal: journalPath } = transactionPaths(root);
    if (!existsSync(transaction)) return recoveryResult("none", { targets: [] });
    if (!existsSync(journalPath)) return recoveryResult("recovery-required", { diagnostics: ["transaction directory has no journal"], targets: [] });
    const raw = readFileSync(journalPath); const journal = JSON.parse(raw); validateJournal(root, journal);
    const plan = recoveryResult("ready", { transaction: { journalSha256: sha(raw), journalState: journal.state }, targets: journal.targets.map(({ path, kind, before, after, state }) => ({ path, kind, before, after, journalState: state, action: "restore-recorded-preimage" })) });
    RECOVERY_PLANS.set(plan, { root, signature: planSignature(plan), journalSha256: sha(raw) }); return plan;
  } catch (error) { return recoveryResult("recovery-required", { diagnostics: [error.message], targets: [] }); }
}
export function applyPendingProjectAuthorityRecovery(plan, { rootDir = process.cwd(), activate = false } = {}) {
  const state = RECOVERY_PLANS.get(plan);
  let authentic = false;
  try { authentic = Boolean(state && planSignature(plan) === state.signature); } catch { authentic = false; }
  if (!authentic) return recoveryResult("rejected", { reason: "unauthenticated or changed recovery plan" });
  if (!activate) return recoveryResult("activation-required", { reason: "explicit activation required" });
  try {
    const root = realRoot(rootDir); if (root !== state.root) throw new Error("recovery root differs from the authenticated plan root");
    const { journal: journalPath } = transactionPaths(root); const raw = readFileSync(journalPath);
    if (sha(raw) !== state.journalSha256) throw new Error("recovery journal changed since preview");
    const journal = JSON.parse(raw); validateJournal(root, journal); restore(root, journal); RECOVERY_PLANS.delete(plan);
    return recoveryResult("recovered", { restored: journal.targets.map(({ path }) => path) });
  } catch (error) { return recoveryResult("rejected", { reason: error.message }); }
}
