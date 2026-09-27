// SPDX-License-Identifier: SUL-1.0
/** Read-only #9 loader: PO-bound source registry, private signed source bytes. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parseStrictJson } from "./governance-event.mjs";
import { canonical, verifyPoApprovalProof } from "./po-approval-proof.mjs";
import { resolveGitCommonDir } from "./po-key-directory.mjs";
import { resolveOrganizationArchitectureSources } from "./organization-architecture-source.mjs";

export const ORGANIZATION_ARCHITECTURE_CONFIG_PATH = "project/architecture-inherited-sources.json";
const POLICY_PATH = "project/critical-human-proof.json";
const SOURCE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const fail = (code) => ({ schema: "pipeline.effective-organization-architecture-sources.v1",
  status: "blocked", code, decisions: [], sourceBindings: [], findings: [{ code, sourceId: null }] });
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");

function physicalJson(path, maxBytes) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes || stat.size === 0
    || realpathSync(path) !== path) throw new Error("ORG-ARCH-PHYSICAL-FILE");
  return parseStrictJson(readFileSync(path));
}

function validDescriptor(value) {
  return own(value, ["sourceId", "layer", "required", "trustAnchor"])
    && SOURCE_ID.test(value.sourceId) && ["organization", "team"].includes(value.layer)
    && typeof value.required === "boolean"
    && (own(value.trustAnchor, ["keyReference", "publicKeySha256"])
      || own(value.trustAnchor, ["keyReference", "publicKeySha256", "humanName"]))
    && typeof value.trustAnchor.keyReference === "string" && value.trustAnchor.keyReference.length > 0
    && SHA.test(value.trustAnchor.publicKeySha256);
}

/** The exact subject the human signs before a registry replacement. */
export function organizationArchitectureConfigSubject(value) {
  if (!own(value, ["schema", "sources", "expectedPriorSha256"])
    || value.schema !== "pipeline.organization-architecture-config.v1"
    || !(value.expectedPriorSha256 === null || SHA.test(value.expectedPriorSha256))
    || !Array.isArray(value.sources) || value.sources.length === 0 || value.sources.length > 16
    || !value.sources.every(validDescriptor)
    || value.sources.map((item) => item.sourceId).join("\0")
      !== [...new Set(value.sources.map((item) => item.sourceId))].sort().join("\0")) return null;
  return { schema: value.schema, sources: value.sources,
    expectedPriorSha256: value.expectedPriorSha256 };
}

export function organizationArchitectureConfigIntentSha256(value) {
  const subject = organizationArchitectureConfigSubject(value);
  return subject === null ? null : digest(subject);
}

/**
 * A missing registry means no inherited source is configured. A present but
 * invalid registry never silently becomes "none". Source bytes stay under the
 * Git common directory and never enter this public readback.
 */
export function inspectConfiguredOrganizationArchitectureSources({ rootDir, now,
  gitCommonDir = null } = {}) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)) return fail("ORG-ARCH-ROOT-INVALID");
  const root = resolve(rootDir);
  try {
    if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) return fail("ORG-ARCH-ROOT-INVALID");
  } catch { return fail("ORG-ARCH-ROOT-INVALID"); }
  const project = join(root, "project");
  try {
    const stat = lstatSync(project);
    if (!stat.isDirectory() || stat.isSymbolicLink()
      || realpathSync(project) !== project) return fail("ORG-ARCH-CONFIGURATION-UNAVAILABLE");
  } catch (error) {
    return error?.code === "ENOENT"
      ? resolveOrganizationArchitectureSources({ configured: [], now })
      : fail("ORG-ARCH-CONFIGURATION-UNAVAILABLE");
  }
  const configPath = join(root, ORGANIZATION_ARCHITECTURE_CONFIG_PATH);
  if (!existsSync(configPath)) return resolveOrganizationArchitectureSources({ configured: [], now });
  let config;
  let policy;
  try {
    config = physicalJson(configPath, 128 * 1024);
    policy = physicalJson(join(root, POLICY_PATH), 64 * 1024);
  } catch { return fail("ORG-ARCH-CONFIGURATION-UNAVAILABLE"); }
  const subject = config && organizationArchitectureConfigSubject({
    schema: config.schema, sources: config.sources,
    expectedPriorSha256: config.expectedPriorSha256,
  });
  if (!own(config, ["schema", "sources", "expectedPriorSha256", "proof"])
    || subject === null
    || policy?.schema !== "pipeline.critical-human-proof-policy.v3"
    || !Array.isArray(policy.trustAnchors) || policy.trustAnchors.length === 0) {
    return fail("ORG-ARCH-CONFIGURATION-INVALID");
  }
  const subjectSha256 = digest(subject);
  if (!policy.trustAnchors.some((trustPolicy) => verifyPoApprovalProof({
    intent: { sha256: subjectSha256 }, trustPolicy, proof: config.proof,
  }).verified)) return fail("ORG-ARCH-CONFIGURATION-AUTHORITY-UNVERIFIED");
  const common = gitCommonDir ?? resolveGitCommonDir(root);
  if (typeof common !== "string" || !isAbsolute(common)) return fail("ORG-ARCH-PRIVATE-STORE-UNAVAILABLE");
  const privateDir = join(resolve(common), "agent-pipeline", "architecture-inherited-sources");
  const configured = config.sources.map((item) => {
    let source = null;
    let proof = null;
    try {
      const stored = physicalJson(join(privateDir, `${item.sourceId}.json`), 512 * 1024);
      if (own(stored, ["source", "proof"])) ({ source, proof } = stored);
    } catch { /* the trusted descriptor still determines required vs optional */ }
    return { sourceId: item.sourceId, layer: item.layer, required: item.required,
      trustAnchors: [item.trustAnchor], source, proof };
  });
  return resolveOrganizationArchitectureSources({ configured, now });
}
