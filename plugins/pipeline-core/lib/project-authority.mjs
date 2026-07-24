// SPDX-License-Identifier: SUL-1.0
/** Neutral project authority with a compatibility-only legacy reader. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PROJECT_AUTHORITY_SCHEMA = "pipeline.project-authority.v1";
export const NEUTRAL_MANIFEST = "project/pipeline.yaml";
export const NEUTRAL_STATE = "project/pipeline-state.json";
export const LEGACY_MANIFEST = ".claude/pipeline.yaml";
export const LEGACY_STATE = ".claude/pipeline-state.json";
const PLANS = new WeakMap();
const sha = (value) => createHash("sha256").update(value).digest("hex");
const image = (root, path) => {
  const full = join(root, path);
  if (!existsSync(full)) return { status: "absent", sha256: null, byteLength: 0 };
  const bytes = readFileSync(full);
  return { status: "present", sha256: sha(bytes), byteLength: bytes.length };
};

function authority(root) {
  const manifest = existsSync(join(root, NEUTRAL_MANIFEST)) ? NEUTRAL_MANIFEST : LEGACY_MANIFEST;
  const state = existsSync(join(root, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE;
  if (!existsSync(join(root, manifest))) return { status: "missing", reason: "project authority manifest is missing" };
  try {
    const manifestBytes = readFileSync(join(root, manifest));
    const stateBytes = existsSync(join(root, state)) ? readFileSync(join(root, state)) : null;
    return { status: "ready", source: manifest === NEUTRAL_MANIFEST ? "neutral" : "legacy", manifest, state: stateBytes === null ? null : state, manifestSha256: sha(manifestBytes), stateSha256: stateBytes === null ? null : sha(stateBytes) };
  } catch { return { status: "invalid", reason: "project authority cannot be read" }; }
}

export function readProjectAuthority({ rootDir = process.cwd() } = {}) {
  return authority(resolve(rootDir));
}

/** Plan a dual-read/one-write migration without touching legacy authority. */
export function planProjectAuthorityMigration({ rootDir = process.cwd() } = {}) {
  const root = resolve(rootDir); const current = authority(root);
  if (current.status !== "ready") return { schema: PROJECT_AUTHORITY_SCHEMA, status: current.status, diagnostics: [current.reason] };
  if (current.source === "neutral") return { schema: PROJECT_AUTHORITY_SCHEMA, status: "noop", source: "neutral", targets: [] };
  const targets = [
    { path: NEUTRAL_MANIFEST, kind: "project-authority", before: image(root, NEUTRAL_MANIFEST), after: image(root, LEGACY_MANIFEST) },
    ...(current.state ? [{ path: NEUTRAL_STATE, kind: "project-state", before: image(root, NEUTRAL_STATE), after: image(root, LEGACY_STATE) }] : []),
  ].map((target) => ({ ...target, changed: target.before.sha256 !== target.after.sha256 }));
  const plan = { schema: PROJECT_AUTHORITY_SCHEMA, status: "ready", source: "legacy", compatibility: "dual-read-one-write", targets, requiresExplicitActivation: true };
  PLANS.set(plan, JSON.stringify(plan)); return plan;
}

export function applyProjectAuthorityMigration(plan, { rootDir = process.cwd(), activate = false } = {}) {
  if (!plan || PLANS.get(plan) !== JSON.stringify(plan)) return { schema: PROJECT_AUTHORITY_SCHEMA, status: "rejected", reason: "unauthenticated plan" };
  if (!activate) return { schema: PROJECT_AUTHORITY_SCHEMA, status: "rejected", reason: "explicit activation required" };
  const root = resolve(rootDir); const current = authority(root);
  if (current.status !== "ready" || current.source !== "legacy") return { schema: PROJECT_AUTHORITY_SCHEMA, status: "rejected", reason: "legacy source changed" };
  try {
    for (const target of plan.targets) {
      if (image(root, target.path).sha256 !== target.before.sha256) throw new Error("neutral destination changed");
      const legacy = target.path === NEUTRAL_MANIFEST ? LEGACY_MANIFEST : LEGACY_STATE;
      if (image(root, legacy).sha256 !== target.after.sha256) throw new Error("legacy source changed");
      const destination = join(root, target.path); mkdirSync(join(destination, ".."), { recursive: true });
      const temporary = `${destination}.tmp-${process.pid}`; writeFileSync(temporary, readFileSync(join(root, legacy)), { mode: 0o600 }); renameSync(temporary, destination);
    }
    const readback = authority(root);
    if (readback.status !== "ready" || readback.source !== "neutral") throw new Error("neutral readback failed");
    PLANS.delete(plan); return { schema: PROJECT_AUTHORITY_SCHEMA, status: "applied", source: "neutral", targets: plan.targets.map(({ path }) => path) };
  } catch (error) { return { schema: PROJECT_AUTHORITY_SCHEMA, status: "rejected", reason: error.message }; }
}
