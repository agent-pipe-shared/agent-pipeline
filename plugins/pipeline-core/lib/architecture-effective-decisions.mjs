// SPDX-License-Identifier: SUL-1.0
/** Read-only effective ADR projection. Invalid governed sources fail closed;
 * historical ADRs without machine-readable applicability remain visible warnings.
 * This is a source-level
 * prerequisite for AC-19, not proof that two native runner sessions consumed it. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { loadMapBundle } from "../scripts/module-inventory.mjs";

const SCHEMA = "pipeline.architecture-effective-decisions.v1";
const OID = /^[a-f0-9]{64}$/u;
const AREA = /^[a-z][a-z0-9-]{0,79}$/u;
const MAX_BYTES = 1024 * 1024;
const ADVISORY_CODES = new Set(["legacy-decision-without-sidecar", "module-applicability-unresolved"]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, path) => ({ code, path });

// Keep the accepted v1 sidecar's closed shape locally checkable in a
// plugin-only installation. The root-level schema is not shipped there.
function validDecision(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) return false;
  const required = ["schema", "id", "title", "status", "digest", "scope", "date"];
  const moduleV2 = record.schema === "pipeline.architecture-decision.v2";
  const allowed = new Set([...required, "supersedes", "exception", ...(moduleV2 ? ["moduleIds"] : [])]);
  if (required.some((key) => !Object.hasOwn(record, key)) || Object.keys(record).some((key) => !allowed.has(key))) return false;
  if (!moduleV2 && record.schema !== "pipeline.architecture-decision.v1") return false;
  if (moduleV2 && (record.scope !== "module" || !Array.isArray(record.moduleIds)
    || record.moduleIds.length === 0
    || record.moduleIds.some((id) => !AREA.test(id))
    || record.moduleIds.join("\0") !== [...new Set(record.moduleIds)].sort().join("\0"))) return false;
  if (!/^[A-Za-z0-9._-]+$/u.test(record.id ?? "")
    || typeof record.title !== "string" || record.title.length === 0 || !OID.test(record.digest ?? "")
    || !["proposed", "accepted", "superseded", "waived"].includes(record.status)
    || !["project", "module", "global"].includes(record.scope)
    || typeof record.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(record.date)
    || !Number.isFinite(Date.parse(`${record.date}T00:00:00.000Z`))
    || new Date(`${record.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== record.date) return false;
  if (Object.hasOwn(record, "supersedes") && !/^[A-Za-z0-9._-]+$/u.test(record.supersedes ?? "")) return false;
  if (Object.hasOwn(record, "exception")) {
    const value = record.exception;
    if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join(",") !== "authority,expiry,rationale,scope"
      || ["authority", "expiry", "rationale", "scope"].some((key) => typeof value[key] !== "string" || value[key].length === 0)) return false;
  }
  return true;
}

function physicalFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error("unsafe-file");
  return readFileSync(path);
}

/** Refuse a redirected map root before using its contents as module authority. */
export function loadPhysicalArchitectureMap(rootDir) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)) return null;
  const root = resolve(rootDir);
  try {
    const mapDir = join(root, "architecture", "map");
    const mapIndex = join(mapDir, "index.md");
    if (realpathSync(root) !== root
      || !lstatSync(mapDir).isDirectory() || lstatSync(mapDir).isSymbolicLink()
      || realpathSync(mapDir) !== mapDir
      || !lstatSync(mapIndex).isFile() || lstatSync(mapIndex).isSymbolicLink()
      || realpathSync(mapIndex) !== mapIndex) return null;
    const inventory = loadMapBundle(root);
    return inventory?.ok ? inventory : null;
  } catch { return null; }
}

export function inspectEffectiveArchitectureDecisions({ rootDir, area, now = new Date().toISOString() } = {}) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir) || !AREA.test(area ?? "")
    || typeof now !== "string" || !Number.isFinite(Date.parse(now))) {
    return { schema: SCHEMA, status: "blocked", code: "ARCH-DECISION-INPUT-INVALID", area: area ?? null,
      decisions: [], activeExceptions: [], findings: [finding("input-invalid", null)], projectionSha256: null };
  }
  const root = resolve(rootDir);
  const dir = join(root, "docs", "adr");
  const findings = [];
  const loaded = [];
  let entries;
  try {
    if (realpathSync(root) !== root || lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()
      || realpathSync(dir) !== dir) throw new Error("unsafe-directory");
    entries = readdirSync(dir).filter((name) => /\.(?:json|md)$/u.test(name)).sort();
  } catch {
    return { schema: SCHEMA, status: "blocked", code: "ARCH-DECISION-SOURCE-UNAVAILABLE", area,
      decisions: [], activeExceptions: [], findings: [finding("adr-directory-unavailable", "docs/adr")], projectionSha256: null };
  }
  const names = new Set(entries);
  for (const name of entries.filter((entry) => entry.endsWith(".md"))) {
    const stem = name.slice(0, -3);
    const markdownPath = `docs/adr/${name}`;
    const sidecarName = `${stem}.json`;
    if (!names.has(sidecarName)) {
      findings.push(finding("legacy-decision-without-sidecar", markdownPath));
      continue;
    }
    let record;
    let bytes;
    try {
      bytes = physicalFile(join(dir, name));
      record = JSON.parse(physicalFile(join(dir, sidecarName)).toString("utf8"));
    } catch {
      findings.push(finding("decision-source-invalid", markdownPath));
      continue;
    }
    if (!validDecision(record) || record.digest !== digest(bytes)
      || !Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) {
      findings.push(finding("decision-sidecar-invalid-or-drifted", `docs/adr/${sidecarName}`));
      continue;
    }
    loaded.push({ record, path: markdownPath });
  }
  for (const name of entries.filter((entry) => entry.endsWith(".json") && !names.has(`${entry.slice(0, -5)}.md`))) {
    findings.push(finding("orphan-decision-sidecar", `docs/adr/${name}`));
  }
  const byId = new Map();
  for (const item of loaded) {
    if (byId.has(item.record.id)) findings.push(finding("duplicate-decision-id", item.path));
    else byId.set(item.record.id, item);
  }
  for (const { record, path } of loaded) {
    if (record.status === "accepted" && record.supersedes) {
      const former = byId.get(record.supersedes)?.record;
      if (!former || former.status !== "superseded" || former.id === record.id) {
        findings.push(finding("supersession-unresolved", path));
      }
    }
    if (record.status === "superseded" && !loaded.some(({ record: successor }) =>
      successor.status === "accepted" && successor.supersedes === record.id)) {
      findings.push(finding("superseded-without-accepted-successor", path));
    }
    if (record.schema === "pipeline.architecture-decision.v1"
      && record.scope === "module" && ["accepted", "waived"].includes(record.status)) {
      // The v1 sidecar names no module. Guessing from a filename would turn an
      // unscoped decision into authority. An approved schema revision is needed.
      findings.push(finding("module-applicability-unresolved", path));
    }
    // Accepted v2 module sidecars are effective for their explicitly named
    // modules once their digest and every module ID have passed the physical
    // map checks below. A sidecar never widens that scope to another module.
    // Waivers still require separately verified authority and stay inactive.
    if (record.exception && record.status !== "waived") {
      findings.push(finding("exception-status-invalid", path));
    }
    if (record.status === "waived") {
      const expiry = record.exception?.expiry;
      if (typeof expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(expiry)
        || !Number.isFinite(Date.parse(`${expiry}T00:00:00.000Z`))
        || new Date(`${expiry}T00:00:00.000Z`).toISOString().slice(0, 10) !== expiry) {
        findings.push(finding("waiver-expiry-invalid", path));
      } else if (now.slice(0, 10) > expiry) {
        findings.push(finding("waiver-expired", path));
      } else {
        // The v1 authority field is self-declared; it is not a human proof.
        findings.push(finding("waiver-human-authority-unverified", path));
      }
    }
  }
  const explicitModules = loaded.filter(({ record }) => record.schema === "pipeline.architecture-decision.v2");
  if (explicitModules.length > 0) {
    const inventory = loadPhysicalArchitectureMap(root);
    if (!inventory?.ok) {
      findings.push(finding("module-inventory-unavailable", "architecture/map/index.md"));
    } else {
      const known = new Set(inventory.modules.map((module) => module.id));
      // "project" is the bounded all-area view used by the compiled session
      // summary, not a claim that the map owns a module with that ID.
      if (area !== "project" && !known.has(area)) findings.push(finding("module-area-unresolved", "architecture/map/index.md"));
      for (const { record, path } of explicitModules) {
        if (record.moduleIds.some((id) => !known.has(id))) {
          findings.push(finding("module-id-unresolved", path));
        }
      }
    }
  }
  const candidateDecisions = loaded.filter(({ record }) => record.status === "accepted"
    && (["project", "global"].includes(record.scope)
      || (area !== "project" && record.schema === "pipeline.architecture-decision.v2"
        && record.scope === "module" && record.moduleIds.includes(area))))
    .map(({ record, path }) => ({ id: record.id, digest: record.digest, scope: record.scope,
      ...(record.schema === "pipeline.architecture-decision.v2" ? { moduleIds: record.moduleIds } : {}), path }))
    .sort((left, right) => left.id.localeCompare(right.id));
  findings.sort((left, right) => left.path?.localeCompare(right.path ?? "") || left.code.localeCompare(right.code));
  // A historical ADR with no sidecar (or a v1 module sidecar with no module
  // identity) cannot be guessed into scope. The PO chose a visible warning,
  // not an implementation stop, for this legacy ambiguity on 2026-09-25.
  // Invalid or forged governed sources still block; advisory parity is never
  // mislabeled as a complete decision inventory.
  const blockingCount = findings.filter(({ code }) => !ADVISORY_CODES.has(code)).length;
  const status = blockingCount > 0 ? "blocked" : findings.length > 0 ? "advisory" : "ready";
  const decisions = status === "blocked" ? [] : candidateDecisions;
  const subject = { schema: SCHEMA, status, area, decisions, activeExceptions: [], findings };
  return { ...subject, code: status === "ready" ? "ARCH-DECISION-EFFECTIVE-READY"
    : status === "advisory" ? "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING" : "ARCH-DECISION-EFFECTIVE-UNRESOLVED",
  projectionSha256: status === "blocked" ? null : digest(JSON.stringify(subject)) };
}

export function compareEffectiveArchitectureDecisions(left, right) {
  const validProjection = (value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join("\0") !== ["schema", "status", "code", "area", "decisions", "activeExceptions", "findings", "projectionSha256"].sort().join("\0")
      || value.schema !== SCHEMA || !["ready", "advisory"].includes(value.status)
      || value.code !== (value.status === "ready" ? "ARCH-DECISION-EFFECTIVE-READY" : "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING")
      || !AREA.test(value.area ?? "") || !Array.isArray(value.decisions)
      || !Array.isArray(value.activeExceptions) || !Array.isArray(value.findings)
      || !OID.test(value.projectionSha256 ?? "")) return false;
    const subject = { schema: value.schema, status: value.status, area: value.area,
      decisions: value.decisions, activeExceptions: value.activeExceptions, findings: value.findings };
    return digest(JSON.stringify(subject)) === value.projectionSha256;
  };
  if (!validProjection(left) || !validProjection(right) || left.area !== right.area) {
    return { ok: false, code: "ARCH-DECISION-PARITY-UNRESOLVED" };
  }
  if (left.status !== right.status) return { ok: false, code: "ARCH-DECISION-PARITY-DIVERGENCE" };
  return left.projectionSha256 === right.projectionSha256
    ? { ok: true, code: left.status === "advisory" ? "ARCH-DECISION-PARITY-ADVISORY-MATCH"
      : "ARCH-DECISION-PARITY-MATCH", projectionSha256: left.projectionSha256 }
    : { ok: false, code: "ARCH-DECISION-PARITY-DIVERGENCE" };
}
