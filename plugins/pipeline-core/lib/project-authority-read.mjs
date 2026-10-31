// SPDX-License-Identifier: SUL-1.0
/**
 * Read half of lib/project-authority.mjs (D216 option A, D219): the authority path resolvers, with no filesystem-write API.
 * The old module imports and re-exports these symbols.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

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

export const sha = (value) => createHash("sha256").update(value).digest("hex");
export const absent = () => ({ status: "absent", sha256: null, byteLength: 0 });
export const present = (bytes) => ({ status: "present", sha256: sha(bytes), byteLength: bytes.length });

export function realRoot(rootDir) {
  const requested = resolve(rootDir);
  const info = lstatSync(requested);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("root must be a real project directory");
  return realpathSync(requested);
}
export function projectPath(root, path) {
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
export function image(root, path) {
  const full = projectPath(root, path);
  if (!existsSync(full)) return absent();
  const info = lstatSync(full);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`authority path is not a regular file: ${path}`);
  return present(readFileSync(full));
}
export function bytes(root, path) {
  const full = projectPath(root, path);
  if (!existsSync(full)) return null;
  const info = lstatSync(full);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`authority path is not a regular file: ${path}`);
  return readFileSync(full);
}
export function readLayer(root, manifest, state, calibration, guardConfig, guardAudit, source) {
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
export function authority(root) {
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

