// SPDX-License-Identifier: SUL-1.0
/** Read-only, PO-signed exceptions to inherited architecture defaults. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parseStrictJson } from "./governance-event.mjs";
import { canonical, verifyPoApprovalProof } from "./po-approval-proof.mjs";

export const ARCHITECTURE_DECISION_WAIVERS_PATH = "project/architecture-decision-waivers.json";
const SHA = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._-]{1,96}$/u;
const MODULE = /^[a-z][a-z0-9-]{0,79}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const sha = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fail = (code) => ({ status: "blocked", code, waivers: [], findings: [{ code }] });

function physicalJson(path, maxBytes) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > maxBytes
    || realpathSync(path) !== path) throw new Error("unsafe-file");
  return parseStrictJson(readFileSync(path));
}

function validWaiver(value) {
  return own(value, ["id", "decisionId", "decisionDigest", "moduleIds", "rationaleSha256", "expiresAt"])
    && ID.test(value.id) && ID.test(value.decisionId) && SHA.test(value.decisionDigest)
    && SHA.test(value.rationaleSha256) && validDate(value.expiresAt)
    && Array.isArray(value.moduleIds) && value.moduleIds.length > 0 && value.moduleIds.length <= 64
    && value.moduleIds.every((id) => typeof id === "string" && MODULE.test(id))
    && value.moduleIds.join("\0") === [...new Set(value.moduleIds)].sort().join("\0");
}

export function inspectArchitectureDecisionWaivers({ rootDir, now } = {}) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir) || !validDate(now)) return fail("ARCH-WAIVER-INPUT-INVALID");
  const root = resolve(rootDir);
  try { if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) return fail("ARCH-WAIVER-ROOT-INVALID"); }
  catch { return fail("ARCH-WAIVER-ROOT-INVALID"); }
  const path = join(root, ARCHITECTURE_DECISION_WAIVERS_PATH);
  if (!existsSync(path)) return { status: "ready", code: "ARCH-WAIVERS-NONE", waivers: [], findings: [] };
  let stored;
  let policy;
  try {
    stored = physicalJson(path, 128 * 1024);
    policy = physicalJson(join(root, "project/critical-human-proof.json"), 64 * 1024);
  } catch { return fail("ARCH-WAIVER-SOURCE-UNAVAILABLE"); }
  if (!own(stored, ["schema", "waivers", "proof"])
    || stored.schema !== "pipeline.architecture-decision-waivers.v1"
    || !Array.isArray(stored.waivers) || stored.waivers.length === 0 || stored.waivers.length > 32
    || !stored.waivers.every(validWaiver)
    || stored.waivers.map((entry) => entry.id).join("\0")
      !== [...new Set(stored.waivers.map((entry) => entry.id))].sort().join("\0")
    || policy?.schema !== "pipeline.critical-human-proof-policy.v3"
    || !Array.isArray(policy.trustAnchors) || policy.trustAnchors.length === 0) return fail("ARCH-WAIVER-SOURCE-INVALID");
  const subject = { schema: stored.schema, waivers: stored.waivers };
  const subjectSha256 = sha(subject);
  if (!policy.trustAnchors.some((anchor) => verifyPoApprovalProof({
    intent: { sha256: subjectSha256 }, trustPolicy: anchor, proof: stored.proof,
  }).verified)) return fail("ARCH-WAIVER-AUTHORITY-UNVERIFIED");
  const expired = stored.waivers.filter((entry) => now > entry.expiresAt);
  return { status: expired.length > 0 ? "advisory" : "ready",
    code: expired.length > 0 ? "ARCH-WAIVERS-EXPIRED" : "ARCH-WAIVERS-VERIFIED",
    waivers: stored.waivers.filter((entry) => now <= entry.expiresAt)
      .map((entry) => ({ ...entry, moduleIds: [...entry.moduleIds] })),
    findings: expired.map((entry) => ({ code: "waiver-expired", id: entry.id })) };
}
