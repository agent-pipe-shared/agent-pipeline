// SPDX-License-Identifier: SUL-1.0
/**
 * Runner-neutral project-authority compatibility migration.
 *
 * Planning has no writes and exposes only paths and digests.  An in-process,
 * unchanged plan plus an explicit activation are required for a write.  The
 * legacy `.claude` configuration remains a compatibility input until the
 * neutral `project/` authority has been committed and read back.  Mutable
 * lifecycle State is different: after cutover, only the neutral State may
 * remain, so a stale legacy copy can never become a second authority.
 */
import { createHash } from "node:crypto";
import {
  closeSync, copyFileSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  inspectSessionClosure,
  listActiveSessionDescriptors,
} from "./worktree-lifecycle.mjs";
import { hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

export const PROJECT_AUTHORITY_SCHEMA = "pipeline.project-authority.v1";
export const PROJECT_AUTHORITY_RECOVERY_SCHEMA = "pipeline.project-authority-recovery.v1";
export const PROJECT_AUTHORITY_CLASSIFICATION_SCHEMA = "pipeline.project-authority-classification.v1";
export const PROJECT_AUTHORITY_ADOPTION_RECEIPT_SCHEMA = "pipeline.project-authority-adoption-receipt.v1";
export const PROJECT_AUTHORITY_VENDOR_SYNC_SCHEMA = "pipeline.project-authority-vendor-sync.v1";
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
// A fresh Claude-runner project onboarded by project-onboarding-v3.mjs
// legitimately WRITES exactly two of these five legacy paths on day one --
// LEGACY_MANIFEST and LEGACY_CALIBRATION, byte-identical to their NEUTRAL_*
// counterpart -- never LEGACY_STATE, LEGACY_GUARD_CONFIG or LEGACY_GUARD_AUDIT.
// This is not the "mixed-tier" defect a brand-new repository was once thought
// to fall into (backlog: greenfield-onboarding-writes-mixed-authority-tiers):
// `.claude/pipeline.yaml`/`.claude/pipeline.json` are ADR-0054's own Reader
// Classification category C, "deliberate legacy-tier projection writers" whose
// write side "belongs to step 3, not step 1" of that ADR's implementation
// order. Until step 3 (moving writes to the new top tier) lands, `.claude/`
// stays the Claude Code runtime's own live surface for model routing
// (`modelRouting`, `runnerRoutes`, `criticExport`) and the PO display label
// (`humanRoles.po.displayLabel`), seeded ALONGSIDE -- not instead of -- the
// neutral authority record. Two both-tiers-populated regressions confirm the
// resolver still reads this cleanly: readProjectAuthority() resolves
// `status: "ready", source: "neutral"`, never `"mixed"`, and the seeded bytes
// are identical across tiers either way (project-onboarding-v3.test.mjs: "an
// ordinary consumer project's runtime initialization never seeds the private
// overlay's own calibration", "a fresh greenfield onboarding populates both
// manifest tiers without ever reaching a mixed authority status";
// runner-profile-migration-v3.test.mjs: "a freshly onboarded project seeds
// both manifest tiers byte-identically"). Retiring the byte-identity
// invariant commit 7a99a18 added would remove a check that protects this
// real property -- it stays.

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
const VENDOR_SYNC_PLANS = new WeakMap();
const RECOVERY_PLANS = new WeakMap();
const SESSION_CLEANUP_RECOVERY_PLANS = new WeakMap();
const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_OBJECT = /^[0-9a-f]{40,64}$/u;
const MODULE_PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/**
 * The one vendored destination `loadedPackageEvidence()` compares against,
 * stated once.  For a real root, `projectPath(root, VENDORED_PACKAGE_PATH)`
 * returns the identical absolute path that function computes itself as
 * `join(destination, "plugins", "pipeline-core")`.
 */
const VENDORED_PACKAGE_PATH = "plugins/pipeline-core";
/**
 * The `loadedPackageEvidence()` failures an explicit vendored-package sync can
 * repair.  Every other failure (malformed manifest, symlinked destination) is
 * reported as `PA-VENDOR-COPY-UNKNOWN` and must NOT be offered the sync as its
 * remedy: those are not a missing copy, they are a broken one.
 *
 * STALE is included alongside MISSING deliberately, not by omission: a sync
 * only ever overwrites a LOCAL, gitignored, untracked copy with the package
 * that is already loaded and executing in this very session (source is
 * re-read at apply time, never taken from the plan -- see
 * `applyVendoredPackageSync`).  It cannot turn an untrusted package into a
 * trusted one; it only re-proves that the local copy matches what is already
 * running.  A destination holding TRACKED project bytes is refused
 * unconditionally regardless of this list (`vendoredPackageWriteEvidence`),
 * so a deliberately pinned, committed vendored copy is never a sync target.
 */
export const SELF_HEALABLE_VENDOR_PROVENANCE_CODES = Object.freeze(["PA-VENDOR-COPY-MISSING", "PA-VENDOR-COPY-STALE"]);
const VENDOR_PROVENANCE_CODES = new Map([
  ["destination package is missing", "PA-VENDOR-COPY-MISSING"],
  ["loaded and destination packages differ", "PA-VENDOR-COPY-STALE"],
]);

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
    // The status and reason are unchanged; `code` is additive, and names WHICH
    // package failure this is so a caller can tell "no local copy exists yet"
    // (repairable by an explicit sync) from "the copy that exists is broken".
    if (runtime.error) return { status: "unavailable", reason: "loaded package provenance unavailable", code: VENDOR_PROVENANCE_CODES.get(runtime.error) ?? "PA-VENDOR-COPY-UNKNOWN" };
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
    // Lifecycle State is mutable.  Retaining a legacy copy after the neutral
    // cutover creates two plausible, eventually divergent sources of truth.
    // Do not hide that drift behind precedence: require the bounded retirement
    // action before any reader proceeds.
    if (neutral.state.status === "present" && legacy.state.status === "present") {
      return {
        status: "migration-required",
        code: "PA-LEGACY-STATE-RETIREMENT-REQUIRED",
        reason: "neutral authority and legacy lifecycle State coexist",
        source: "neutral",
        manifest: NEUTRAL_MANIFEST,
        state: neutral.state.status === "present" ? NEUTRAL_STATE : null,
        calibration: neutral.calibration.status === "present" ? NEUTRAL_CALIBRATION : null,
        guardConfig: neutral.guardConfig.status === "present" ? NEUTRAL_GUARD_CONFIG : null,
        guardAudit: neutral.guardAudit.status === "present" ? NEUTRAL_GUARD_AUDIT : null,
        manifestSha256: neutral.manifest.sha256,
        stateSha256: neutral.state.sha256,
        legacyStateSha256: legacy.state.sha256,
      };
    }
    if (neutral.state.status === "absent" && legacy.state.status === "present") {
      return { status: "mixed", reason: "neutral authority has no neutral State while legacy lifecycle State remains" };
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

// The twin calibration pair (`project/pipeline.json` and `.claude/pipeline.json`)
// is legitimately seeded byte-identical on day one (see the "byte-identical
// across tiers" comment on TARGETS above), but nothing re-verifies they STAY
// identical afterward: each tier is writable independently, and neither
// `authority()` nor `classifyLayer()` above ever compares their bytes once
// both are present. A project whose neutral `project/pipeline.json` is edited
// (e.g. a corrected verify contract) without the legacy compatibility copy
// following along drifts silently -- the answer to "what is the verify
// contract" then depends on which file the reader happens to load
// (backlog: 2026-08-28-the-twin-manifest-files-can-drift-without-detection.md).
// This reports that divergence the same way `classifyProjectAuthority()`
// already reports everything else about the twin pair: as part of its typed
// result, naming which file is authoritative (the tier `authority()` resolved
// as the current source; neutral whenever the resolver could not determine a
// source at all, since neutral is always preferred once both exist).
function calibrationDriftDiagnostics(layer, legacyLayer, source) {
  if (layer.calibration.status !== "present" || legacyLayer.calibration.status !== "present") return [];
  if (layer.calibration.sha256 === legacyLayer.calibration.sha256) return [];
  return [{
    path: NEUTRAL_CALIBRATION,
    legacyPath: LEGACY_CALIBRATION,
    code: "PA-CALIBRATION-DRIFT",
    message: `${NEUTRAL_CALIBRATION} and ${LEGACY_CALIBRATION} disagree`,
    authoritative: source === "legacy" ? LEGACY_CALIBRATION : NEUTRAL_CALIBRATION,
  }];
}

export function classifyProjectAuthority({ rootDir = process.cwd() } = {}) {
  try {
    const root = realRoot(rootDir);
    const current = authority(root);
    const layer = readLayer(root, NEUTRAL_MANIFEST, NEUTRAL_STATE, NEUTRAL_CALIBRATION, NEUTRAL_GUARD_CONFIG, NEUTRAL_GUARD_AUDIT, "neutral");
    const legacyLayer = readLayer(root, LEGACY_MANIFEST, LEGACY_STATE, LEGACY_CALIBRATION, LEGACY_GUARD_CONFIG, LEGACY_GUARD_AUDIT, "legacy");
    return {
      schema: PROJECT_AUTHORITY_CLASSIFICATION_SCHEMA,
      version: PROJECT_AUTHORITY_CONTRACT_VERSION,
      status: current.status,
      source: current.source ?? null,
      files: classifyLayer(layer, current.source, legacyLayer),
      diagnostics: calibrationDriftDiagnostics(layer, legacyLayer, current.source),
      git: gitEvidence(root),
    };
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

function privateAdoptionArchive(root, planSha256, targets, {
  platform = process.platform,
  hardenWindowsPrivateDirectoryFn = hardenWindowsPrivateDirectory,
} = {}) {
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
  if (!archiveInfo.isDirectory() || archiveInfo.isSymbolicLink()) {
    throw new Error("project authority adoption archive is unsafe");
  }
  // The archive directory above is always freshly created (the existsSync
  // throw two lines up rules out a pre-existing one), so the win32 branch
  // only ever needs the "harden a freshly created directory" primitive --
  // never the "assess an existing one" primitive `secureDirectory()` (in
  // human-guard-override.mjs) also uses for its own, pre-existing-directory
  // case. `mkdirSync(..., { mode: 0o700 })`'s `mode` is a documented no-op
  // on Windows/NTFS, so `archiveInfo.mode` carries no real signal there.
  if (platform === "win32") {
    if (hardenWindowsPrivateDirectoryFn(archive).status !== "secure") {
      throw new Error("project authority adoption archive is unsafe");
    }
  } else if ((archiveInfo.mode & 0o077) !== 0) {
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

/** The five authority artifacts, per tier.  Keys match `resolveProjectAuthorityPaths()`. */
export const AUTHORITY_ARTIFACTS = Object.freeze({
  manifest: Object.freeze({ neutral: NEUTRAL_MANIFEST, legacy: LEGACY_MANIFEST }),
  state: Object.freeze({ neutral: NEUTRAL_STATE, legacy: LEGACY_STATE }),
  calibration: Object.freeze({ neutral: NEUTRAL_CALIBRATION, legacy: LEGACY_CALIBRATION }),
  guardConfig: Object.freeze({ neutral: NEUTRAL_GUARD_CONFIG, legacy: LEGACY_GUARD_CONFIG }),
  guardAudit: Object.freeze({ neutral: NEUTRAL_GUARD_AUDIT, legacy: LEGACY_GUARD_AUDIT }),
});

/**
 * Resolve ONE authority artifact for a plain reader (ADR-0054 step 1).
 *
 * `loadManifest()`, `pipeline-state.mjs`'s `statePath()` and `security-scan.mjs`
 * each hand-rolled this same resolve-then-fall-back shape; this is that shape,
 * once, so the remaining hardcoded readers can be routed without each inventing
 * its own fallback.
 *
 * A reader must never become STRICTER by being routed.  An unresolvable or
 * ambiguous authority therefore does not fail here: it falls back to the tier
 * whose file actually exists, preferring legacy when neither does — byte-for-byte
 * the behaviour of the hardcoded `.claude/` path it replaces, and the same rule
 * `loadManifest()` already applies.  Callers that need to react to a broken
 * authority read `authorityStatus`.
 */
export function resolveAuthorityArtifactPath(kind, { rootDir = process.cwd() } = {}) {
  const artifact = AUTHORITY_ARTIFACTS[kind];
  if (artifact === undefined) throw new TypeError(`unknown project-authority artifact: ${String(kind)}`);
  const root = resolve(rootDir);
  let authorityStatus = "invalid";
  let source = null;
  let relPath = null;
  try {
    const current = resolveProjectAuthorityPaths({ rootDir: root });
    authorityStatus = current.status;
    if (current.status === "ready") {
      relPath = current[kind] ?? null;
      source = relPath === null ? null : (current.source ?? null);
    }
  } catch {
    // A malformed root is the hardcoded reader's own problem to report, exactly
    // as it was before routing; it is not this resolver's to escalate.
  }
  if (relPath === null) {
    const neutral = existsSync(join(root, artifact.neutral));
    relPath = neutral ? artifact.neutral : artifact.legacy;
    source = neutral ? "neutral" : "legacy";
  }
  const path = join(root, relPath);
  return { kind, source, authorityStatus, relPath, path, exists: existsSync(path) };
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
    if (current.code === "PA-LEGACY-STATE-RETIREMENT-REQUIRED") {
      const neutralState = image(root, NEUTRAL_STATE);
      const legacyState = image(root, LEGACY_STATE);
      if (neutralState.status !== "present" || legacyState.status !== "present") {
        return result("invalid-source", { diagnostics: ["legacy State retirement preimage is unavailable"], targets: [] });
      }
      return remember(result("ready", {
        source: "neutral",
        operation: "retire-legacy-state",
        compatibility: "neutral-state-only",
        targets: [{ path: LEGACY_STATE, kind: "legacy-project-state", before: legacyState, action: "retire" }],
        activation: { required: true, command: "apply --activate", legacyStateRetired: true },
      }), {
        root,
        status: "retire-legacy-state",
        neutralState,
        legacyState,
      });
    }
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
    if (state.status === "retire-legacy-state") {
      const current = authority(root);
      const neutralState = image(root, NEUTRAL_STATE);
      const legacyState = image(root, LEGACY_STATE);
      if (current.code !== "PA-LEGACY-STATE-RETIREMENT-REQUIRED"
        || !sameImage(neutralState, state.neutralState)
        || !sameImage(legacyState, state.legacyState)) {
        throw new Error("legacy State retirement preimage changed since planning");
      }
      unlinkSync(projectPath(root, LEGACY_STATE));
      fsyncDirectory(dirname(projectPath(root, LEGACY_STATE)));
      const readback = authority(root);
      if (readback.status !== "ready" || readback.source !== "neutral"
        || readback.state !== NEUTRAL_STATE
        || readback.stateSha256 !== state.neutralState.sha256) {
        throw new Error("neutral State readback failed after legacy retirement");
      }
      PLANS.delete(plan);
      return result("applied", {
        source: "neutral",
        targets: [LEGACY_STATE],
        legacyStateRetired: true,
      });
    }
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
      // The copy phase has committed the neutral State.  Retire the legacy
      // state as a final, exact-image step so static Claude compatibility
      // files remain available without leaving a second mutable authority.
      const legacyStateEntry = journal.targets.find((entry) => entry.path === NEUTRAL_STATE);
      const observedLegacyState = image(root, LEGACY_STATE);
      if (legacyStateEntry?.after?.status === "present"
        && !sameImage(observedLegacyState, legacyStateEntry.after)) {
        return result("retirement-required", {
          source: "neutral",
          code: "PA-LEGACY-STATE-RETIREMENT-STALE",
          diagnostics: ["legacy State changed before retirement"],
          targets: [LEGACY_STATE],
        });
      }
      try {
        if (observedLegacyState.status === "present") {
          unlinkSync(projectPath(root, LEGACY_STATE));
          fsyncDirectory(dirname(projectPath(root, LEGACY_STATE)));
        }
      } catch (error) {
        return result("retirement-required", {
          source: "neutral",
          code: "PA-LEGACY-STATE-RETIREMENT-UNRESOLVED",
          diagnostics: [error.message],
          targets: [LEGACY_STATE],
        });
      }
      const readback = authority(root); if (readback.status !== "ready" || readback.source !== "neutral") return result("retirement-required", {
        source: "neutral",
        code: "PA-LEGACY-STATE-RETIREMENT-UNRESOLVED",
        diagnostics: ["neutral authority readback requires legacy State retirement"],
        targets: [LEGACY_STATE],
      });
      PLANS.delete(plan); return result("applied", {
        source: "neutral",
        targets: state.targets.map(({ path }) => path),
        legacyConfigurationRetained: true,
        legacyStateRetired: true,
        ...(adoptionArchive === null ? {} : { adoptionArchive, adoptionReceipt: adoptionArchive.receipt }),
      });
    } catch (error) {
      if (error instanceof IntentionalInterruption) return result("interrupted", { reason: error.message });
      try { restore(root, journal); } catch (recoveryError) { return result("recovery-required", { reason: recoveryError.message }); }
      return result("rolled-back", { reason: error.message });
    }
  } catch (error) { return result("rejected", { reason: error.message }); }
}

function exactSessionCleanupTuple(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, "sessionId")
    && Object.hasOwn(value, "descriptorSha256")
    && typeof value.sessionId === "string"
    && value.sessionId.length > 0
    && /^[A-Za-z0-9._-]{1,80}$/u.test(value.sessionId)
    && SHA256.test(value.descriptorSha256);
}

function nonPortableCleanupPaths(value, path = "$") {
  if (Array.isArray(value)) return value.flatMap((child, index) => nonPortableCleanupPaths(child, `${path}[${index}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    return key === "sessionCleanup" && child !== null
      ? [childPath]
      : nonPortableCleanupPaths(child, childPath);
  });
}

function sessionCleanupRecoveryPlanCore(observed) {
  return {
    schema: PROJECT_AUTHORITY_RECOVERY_SCHEMA,
    status: observed.status,
    operation: "sanitize-completed-session-cleanup",
    root: observed.root,
    statePath: NEUTRAL_STATE,
    stateSha256: observed.stateSha256 ?? null,
    closureReceiptSha256: observed.closureReceiptSha256 ?? null,
    targets: observed.targets ?? [],
    ...(observed.diagnostics ? { diagnostics: observed.diagnostics } : {}),
  };
}

/**
 * Preview the one upgrade-only cleanup repair.  A legacy neutral State may
 * have leaked the private cleanup tuple before the V4 split.  We never infer
 * a target from a descriptor: one exact tuple, no active descriptors and the
 * matching completed private closure receipt are all required before the
 * portable field can be cleared.
 */
export function planProjectAuthoritySessionCleanupRecovery({ rootDir = process.cwd() } = {}) {
  let root;
  try { root = realRoot(rootDir); } catch (error) {
    return recoveryResult("invalid-root", { targets: [], diagnostics: [error.message] });
  }
  try {
    const raw = bytes(root, NEUTRAL_STATE);
    if (raw === null) return recoveryResult("none", { targets: [] });
    let state;
    try { state = JSON.parse(raw.toString("utf8")); } catch {
      return recoveryResult("recovery-unavailable", { targets: [], diagnostics: ["neutral State is not valid JSON"] });
    }
    const portability = validatePortablePipelineState(state);
    if (portability.ok) return recoveryResult("none", { targets: [] });
    const leakedPaths = nonPortableCleanupPaths(state);
    const tuple = state?.continuity?.runtime?.sessionCleanup;
    if (portability.code !== "PA-STATE-SESSION-CLEANUP-PRIVATE"
      || leakedPaths.length !== 1
      || leakedPaths[0] !== "$.continuity.runtime.sessionCleanup"
      || !exactSessionCleanupTuple(tuple)) {
      return recoveryResult("recovery-unavailable", {
        targets: [], diagnostics: ["neutral cleanup leakage is not one exact recoverable binding"],
      });
    }
    // A closed receipt is valid only after the descriptor has disappeared;
    // any active descriptor (including an unrelated concurrent session) makes
    // target selection ambiguous and therefore remains a hard stop.
    const descriptors = listActiveSessionDescriptors(root);
    if (descriptors.length !== 0) {
      return recoveryResult("recovery-unavailable", {
        targets: [], diagnostics: ["active or multiple cleanup descriptors prevent recovery"],
      });
    }
    const closure = inspectSessionClosure(root, tuple.sessionId, {
      expectedDescriptorSha256: tuple.descriptorSha256,
    });
    if (closure.status !== "closed" || !SHA256.test(closure.receiptSha256 ?? "")) {
      return recoveryResult("recovery-unavailable", {
        targets: [], diagnostics: ["the exact cleanup binding has no completed closure receipt"],
      });
    }
    const sanitized = structuredClone(state);
    sanitized.continuity.runtime.sessionCleanup = null;
    if (!validatePortablePipelineState(sanitized).ok) {
      return recoveryResult("recovery-unavailable", {
        targets: [], diagnostics: ["sanitized State still contains private cleanup identity"],
      });
    }
    const observed = {
      status: "ready",
      root,
      stateSha256: sha(raw),
      closureReceiptSha256: closure.receiptSha256,
      targets: [{
        path: NEUTRAL_STATE,
        kind: "project-state",
        action: "replace-completed-session-cleanup-with-null",
        before: present(raw),
        after: present(Buffer.from(`${JSON.stringify(sanitized)}\n`, "utf8")),
      }],
    };
    const core = sessionCleanupRecoveryPlanCore(observed);
    const plan = recoveryResult("ready", core);
    SESSION_CLEANUP_RECOVERY_PLANS.set(plan, {
      root,
      signature: planSignature(plan),
      stateSha256: observed.stateSha256,
      closureReceiptSha256: closure.receiptSha256,
    });
    return plan;
  } catch (error) {
    return recoveryResult("recovery-unavailable", { targets: [], diagnostics: [error.message] });
  }
}

function cleanupRecoveryAuthenticated(plan) {
  try {
    const remembered = SESSION_CLEANUP_RECOVERY_PLANS.get(plan);
    return remembered && planSignature(plan) === remembered.signature ? remembered : null;
  } catch { return null; }
}

/** Apply the exact receipt-bound cleanup sanitization under a state CAS. */
export function applyProjectAuthoritySessionCleanupRecovery(plan, {
  rootDir = process.cwd(), activate = false,
} = {}) {
  const remembered = cleanupRecoveryAuthenticated(plan);
  if (!remembered || plan.status !== "ready") {
    return recoveryResult("rejected", { reason: "unauthenticated or changed cleanup recovery plan" });
  }
  if (!activate) return recoveryResult("activation-required", { reason: "explicit activation required" });
  let lockFd = null;
  let lockPath = null;
  let ownsLock = false;
  let temporary = null;
  try {
    const root = realRoot(rootDir);
    if (root !== remembered.root) throw new Error("recovery root differs from the authenticated plan root");
    const current = planProjectAuthoritySessionCleanupRecovery({ rootDir: root });
    const currentState = cleanupRecoveryAuthenticated(current);
    if (!currentState
      || current.status !== "ready"
      || currentState.stateSha256 !== remembered.stateSha256
      || currentState.closureReceiptSha256 !== remembered.closureReceiptSha256
      || planSignature(current) !== planSignature(plan)) {
      throw new Error("cleanup recovery preimage changed since planning");
    }
    const statePath = projectPath(root, NEUTRAL_STATE);
    lockPath = `${statePath}.lock`;
    lockFd = openSync(lockPath, "wx", 0o600);
    ownsLock = true;
    writeFileSync(lockFd, `${JSON.stringify({ schema: "pipeline.project-authority-cleanup-recovery-lock.v1", stateSha256: remembered.stateSha256 })}\n`);
    fsyncSync(lockFd);
    const locked = planProjectAuthoritySessionCleanupRecovery({ rootDir: root });
    const lockedState = cleanupRecoveryAuthenticated(locked);
    if (!lockedState
      || locked.status !== "ready"
      || lockedState.stateSha256 !== remembered.stateSha256
      || lockedState.closureReceiptSha256 !== remembered.closureReceiptSha256
      || planSignature(locked) !== planSignature(plan)) {
      throw new Error("cleanup recovery preimage changed while acquiring the State lock");
    }
    const raw = bytes(root, NEUTRAL_STATE);
    if (raw === null || sha(raw) !== remembered.stateSha256) throw new Error("cleanup recovery State preimage changed");
    const state = JSON.parse(raw.toString("utf8"));
    state.continuity.runtime.sessionCleanup = null;
    if (!validatePortablePipelineState(state).ok) throw new Error("cleanup recovery produced nonportable State");
    const after = Buffer.from(`${JSON.stringify(state)}\n`, "utf8");
    const expectedAfterSha256 = sha(after);
    temporary = join(dirname(statePath), `.${basename(statePath)}.project-authority-cleanup-recovery-${remembered.stateSha256.slice(0, 16)}.tmp`);
    const temporaryFd = openSync(temporary, "wx", 0o600);
    try { writeFileSync(temporaryFd, after); fsyncSync(temporaryFd); } finally { closeSync(temporaryFd); }
    if (sha(bytes(root, NEUTRAL_STATE)) !== remembered.stateSha256) throw new Error("cleanup recovery State preimage changed before commit");
    renameSync(temporary, statePath); temporary = null; fsyncDirectory(dirname(statePath));
    const readback = authority(root);
    if (readback.status !== "ready" || readback.source !== "neutral"
      || readback.stateSha256 !== expectedAfterSha256) {
      throw new Error("cleanup recovery portable State readback failed");
    }
    SESSION_CLEANUP_RECOVERY_PLANS.delete(plan);
    return recoveryResult("recovered", {
      operation: "sanitize-completed-session-cleanup",
      stateSha256: expectedAfterSha256,
      targets: [{ path: NEUTRAL_STATE, action: "session-cleanup-null-readback" }],
    });
  } catch (error) {
    return recoveryResult("rejected", { reason: error.message });
  } finally {
    if (temporary !== null) {
      try { unlinkSync(temporary); } catch {}
    }
    if (lockFd !== null) {
      try { closeSync(lockFd); } catch {}
    }
    if (ownsLock && lockPath !== null) {
      try { unlinkSync(lockPath); fsyncDirectory(dirname(lockPath)); } catch {}
    }
  }
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

/*
 * Vendored-package sync.
 *
 * `loadedPackageEvidence()` proves package provenance by comparing the loaded
 * package against a byte-identical copy at `<root>/plugins/pipeline-core`.  A
 * project that installs this plugin through the standard marketplace mechanism
 * loads it from the marketplace cache and structurally never has that copy, so
 * its provenance is permanently `unavailable` and the mixed-authority migration
 * path is permanently unreachable.  This pair is the explicit repair: it
 * provisions exactly that copy, as a plan the operator can read and an apply
 * they must activate -- never a silent background write, and never a second,
 * weaker provenance rule.  The gate itself is untouched.
 *
 * The copy is deliberately NOT journalled like the five authority TARGETS.  It
 * holds no project bytes, is disposable, and is exactly reconstructible from
 * the loaded package, so an interrupted copy needs no preimage and no rollback:
 * a partial copy simply fails `loadedPackageEvidence()`'s digest comparison --
 * fail-closed, indistinguishable from having no copy at all -- until the same
 * command is run again.
 */
function loadedPackageManifest() {
  // A second, local read of the manifest `loadedPackageEvidence()` also reads.
  // That function is a fixed provenance contract and is deliberately not
  // refactored to share this; the duplication is three lines and it keeps the
  // gate's own code byte-unchanged.
  const manifest = JSON.parse(readFileSync(join(MODULE_PLUGIN_ROOT, ".codex-plugin", "plugin.json"), "utf8"));
  if (!manifest || typeof manifest !== "object" || typeof manifest.version !== "string" || !manifest.version) throw new Error("plugin manifest is invalid");
  return manifest;
}
function vendorSyncResult(status, extra = {}) { return { schema: PROJECT_AUTHORITY_VENDOR_SYNC_SCHEMA, status, requiresExplicitActivation: true, ...extra }; }
function vendorSyncAuthenticated(plan) {
  try {
    const remembered = VENDOR_SYNC_PLANS.get(plan);
    return remembered && planSignature(plan) === remembered.signature ? remembered : null;
  } catch { return null; }
}

/**
 * May this root receive the vendored copy?  Two questions, both answered by Git
 * rather than guessed, both fail-closed:
 *
 * 1. Does the destination hold TRACKED files?  Then those bytes are the
 *    project's own, whatever the directory is named, and a sync would delete
 *    committed content.  Refuse; this is never repaired on the project's behalf.
 * 2. Would the copied files be ignored?  Asked about a path INSIDE the
 *    destination, not the destination itself: the recommended rule
 *    `/plugins/pipeline-core/` is directory-only, and `git check-ignore` cannot
 *    match a directory-only rule against a directory that does not exist yet
 *    (measured) -- which is precisely the state a marketplace consumer is in
 *    before its first sync.  A contained path answers the question that
 *    actually matters, "will the bytes I am about to write dirty this
 *    repository?", for the anchored-directory and anchored-flat rule shape
 *    alike.
 *
 * A tracked destination is reported even when an ignore rule also exists: git
 * reports a tracked path as not-ignored, so without question 1 that project
 * would be told to edit a `.gitignore` that is already correct.
 */
function vendoredPackageWriteEvidence(root, spawn = spawnSync) {
  const run = (args) => spawn("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });
  const tracked = run(["ls-files", "--", VENDORED_PACKAGE_PATH]);
  if (tracked.error || tracked.status !== 0) return { status: "unavailable", reason: "git tracking evidence for the vendored package path is unavailable" };
  if (String(tracked.stdout ?? "").trim().length > 0) return { status: "tracked", reason: `${VENDORED_PACKAGE_PATH} holds tracked project files; a sync would replace committed bytes` };
  const ignored = run(["check-ignore", "--quiet", "--", `${VENDORED_PACKAGE_PATH}/.codex-plugin/plugin.json`]);
  if (ignored.error || ignored.status === null) return { status: "unavailable", reason: "git ignore evidence for the vendored package path is unavailable" };
  if (ignored.status === 0) return { status: "ignored" };
  if (ignored.status === 1) return { status: "not-ignored", reason: `add /${VENDORED_PACKAGE_PATH}/ to this project's .gitignore, then plan the sync again` };
  return { status: "unavailable", reason: "git ignore evidence for the vendored package path is unavailable" };
}
function vendoredDestination(root) {
  // `projectPath` refuses a symlinked component and a path escape; its return
  // value for a real root is `join(root, "plugins", "pipeline-core")`, the exact
  // path `loadedPackageEvidence()` compares against.
  const destinationRoot = projectPath(root, VENDORED_PACKAGE_PATH);
  if (!existsSync(destinationRoot)) return { destinationRoot, state: "missing", digest: null };
  return { destinationRoot, state: "present", digest: packageInventory(destinationRoot).digest };
}
function isLoadedPackage(destinationRoot) {
  try { return realpathSync(destinationRoot) === realpathSync(MODULE_PLUGIN_ROOT); }
  catch { return false; }
}
// Copy exactly the files `packageInventory()` admitted.  Its walk is the single
// refusal for symlinks and non-regular files in the source tree, and driving
// the copy from its entry list keeps the copier and the digest from ever
// disagreeing about what the package is.
function copyPackage(sourceRoot, destinationRoot, inventory) {
  const base = realpathSync(sourceRoot);
  mkdirSync(destinationRoot, { recursive: true });
  for (const entry of inventory.entries) {
    const parts = entry.path.split("/");
    const target = join(destinationRoot, ...parts);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(base, ...parts), target);
  }
}

/** Preview the vendored copy `loadedPackageEvidence()` requires; never writes. */
export function planVendoredPackageSync({ rootDir = process.cwd() } = {}) {
  let root;
  try { root = realRoot(rootDir); } catch (error) { return vendorSyncResult("invalid-root", { diagnostics: [error.message], targets: [] }); }
  let source;
  let manifestVersion;
  try { source = packageInventory(MODULE_PLUGIN_ROOT); manifestVersion = loadedPackageManifest().version; }
  catch (error) { return vendorSyncResult("invalid-source", { diagnostics: [error.message], targets: [] }); }
  const loaded = { operation: "sync-vendored-package", destinationRoot: VENDORED_PACKAGE_PATH, packageSha256: source.digest, manifestVersion, fileCount: source.entries.length };
  let destination;
  try { destination = vendoredDestination(root); }
  catch (error) { return vendorSyncResult("invalid-destination", { ...loaded, diagnostics: [error.message], targets: [] }); }
  // Self-application: the loaded package IS the destination.  Already current by
  // construction, and nothing here may ever remove it.
  if (destination.state === "present" && isLoadedPackage(destination.destinationRoot)) {
    return vendorSyncResult("noop", { ...loaded, diagnostics: ["the loaded package is the destination"], targets: [] });
  }
  if (destination.digest === source.digest) return vendorSyncResult("noop", { ...loaded, targets: [] });
  const evidence = vendoredPackageWriteEvidence(root);
  if (evidence.status === "tracked") return vendorSyncResult("tracked-destination", { ...loaded, code: "PA-VENDOR-COPY-TRACKED", diagnostics: [evidence.reason], targets: [] });
  if (evidence.status === "not-ignored") return vendorSyncResult("gitignore-required", { ...loaded, code: "PA-VENDOR-COPY-NOT-IGNORED", diagnostics: [evidence.reason], targets: [] });
  if (evidence.status !== "ignored") return vendorSyncResult("ignore-evidence-unavailable", { ...loaded, code: "PA-VENDOR-COPY-IGNORE-EVIDENCE-UNAVAILABLE", diagnostics: [evidence.reason], targets: [] });
  const plan = vendorSyncResult("ready", {
    ...loaded,
    destinationState: destination.state,
    destinationSha256: destination.digest,
    targets: [{ path: VENDORED_PACKAGE_PATH, kind: "vendored-package", action: destination.state === "missing" ? "create-vendored-package" : "replace-vendored-package" }],
    activation: { required: true, command: "vendor-sync --activate", vendoredCopyReplaced: destination.state === "present" },
  });
  VENDOR_SYNC_PLANS.set(plan, {
    root,
    signature: planSignature(plan),
    destinationRoot: destination.destinationRoot,
    destinationState: destination.state,
    destinationSha256: destination.digest,
    packageSha256: source.digest,
  });
  return plan;
}

/**
 * Write the vendored copy under an unchanged, authenticated plan.
 *
 * The source is re-read HERE rather than taken from the plan: a plan may
 * predate a plugin update, and the copy is only useful if it matches the
 * package loaded at this moment -- that is the exact comparison
 * `loadedPackageEvidence()` will make afterwards.  The receipt therefore
 * reports the digest that was actually written, not the planned one.
 *
 * `interruptAfterCopy` is a test seam, the same one `applyProjectAuthority-
 * Migration`'s `interruptAfterRename` is: it exists so the readback below can
 * be proven to be real.  It can neither select the source nor move the
 * destination.
 */
export function applyVendoredPackageSync(plan, { rootDir = process.cwd(), activate = false, interruptAfterCopy } = {}) {
  const state = vendorSyncAuthenticated(plan);
  if (!state || plan.status !== "ready") return vendorSyncResult("rejected", { reason: "unauthenticated or changed vendored package sync plan" });
  if (!activate) return vendorSyncResult("activation-required", { reason: "explicit activation required" });
  try {
    const root = realRoot(rootDir);
    if (root !== state.root) throw new Error("sync root differs from the authenticated plan root");
    const destination = vendoredDestination(root);
    if (destination.destinationRoot !== state.destinationRoot) throw new Error("vendored package destination differs from the authenticated plan destination");
    if (destination.state !== state.destinationState || destination.digest !== state.destinationSha256) throw new Error("vendored package destination changed since planning");
    if (destination.state === "present" && isLoadedPackage(destination.destinationRoot)) throw new Error("the loaded package is the destination");
    const evidence = vendoredPackageWriteEvidence(root);
    if (evidence.status !== "ignored") throw new Error(evidence.reason);
    const source = packageInventory(MODULE_PLUGIN_ROOT);
    const manifestVersion = loadedPackageManifest().version;
    if (destination.state === "present") rmSync(destination.destinationRoot, { recursive: true, force: true });
    copyPackage(MODULE_PLUGIN_ROOT, destination.destinationRoot, source);
    if (interruptAfterCopy?.({ destinationRoot: VENDORED_PACKAGE_PATH, fileCount: source.entries.length })) throw new Error("interrupted after the vendored package copy");
    if (packageInventory(destination.destinationRoot).digest !== source.digest) throw new Error("vendored package readback failed");
    const provenance = loadedPackageEvidence(root);
    if (provenance.error) throw new Error(`vendored package provenance readback failed: ${provenance.error}`);
    VENDOR_SYNC_PLANS.delete(plan);
    return vendorSyncResult("applied", {
      operation: "sync-vendored-package",
      destinationRoot: VENDORED_PACKAGE_PATH,
      packageSha256: provenance.packageSha256,
      manifestVersion,
      fileCount: source.entries.length,
      targets: [VENDORED_PACKAGE_PATH],
    });
  } catch (error) { return vendorSyncResult("rejected", { reason: error.message }); }
}

// NVA-PAWINACL-1: exposed so the suite can drive privateAdoptionArchive()'s
// win32 DACL-hardening seam directly (injected platform + a mocked
// hardenWindowsPrivateDirectoryFn), the same pattern
// humanGuardOverrideInternals.secureDirectory exposes in
// human-guard-override.mjs for the sibling case -- without this, a POSIX
// test host could never actually exercise the win32 branch.
export const projectAuthorityInternals = { privateAdoptionArchive };
