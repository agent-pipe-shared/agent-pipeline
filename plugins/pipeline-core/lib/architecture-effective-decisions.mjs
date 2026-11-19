// SPDX-License-Identifier: SUL-1.0
/** Read-only effective ADR projection. Invalid governed sources fail closed;
 * historical ADRs without machine-readable applicability remain visible warnings.
 * This is a source-level
 * prerequisite for AC-19, not proof that two native runner sessions consumed it. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { loadMapBundle } from "../scripts/module-inventory.mjs";
import { readEffectiveDesignArchitectureAuthority } from "./design-decision-bindings.mjs";

const SCHEMA = "pipeline.architecture-effective-decisions.v1";
const OID = /^[a-f0-9]{64}$/u;
const AREA = /^[a-z][a-z0-9-]{0,79}$/u;
const MAX_BYTES = 1024 * 1024;
const ADVISORY_CODES = new Set(["legacy-decision-without-sidecar", "module-applicability-unresolved"]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, path) => ({ code, path });

// The closed shape of both sidecar versions, checked structurally. Both schemas ship in plugins/pipeline-core/schemas, but
// schema-lite evaluates neither const, pattern, minItems, uniqueItems nor format, so this check is what enforces them.
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

function inspectStructuralArchitectureDecisions({ rootDir, area, now = new Date().toISOString() } = {}) {
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
    if (realpathSync(root) !== root) throw new Error("unsafe-directory");
    let absent = false;
    try { lstatSync(dir); } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") absent = true;
      else throw error;
    }
    if (absent) entries = [];
    else {
      if (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()
        || realpathSync(dir) !== dir) throw new Error("unsafe-directory");
      entries = readdirSync(dir).filter((name) => /\.(?:json|md)$/u.test(name)).sort();
    }
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
    // Accepted v2 module sidecars are structural candidates only for their
    // explicitly named modules after digest and physical map checks. The
    // production projection separately requires genuine aggregate authority.
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

/** Authoring-only structural view. This never establishes adoption authority. */
export function inspectArchitectureDecisionAuthoringSources(input = {}) {
  return { ...inspectStructuralArchitectureDecisions(input), purpose: "structural-authoring-only" };
}

/** Production planning authority requires the exact original aggregate proof. */
export function inspectEffectiveArchitectureDecisions(input = {}) {
  const structural = inspectStructuralArchitectureDecisions(input);
  if (structural.status === "blocked") return structural;
  const authority = readEffectiveDesignArchitectureAuthority({ rootDir: resolve(input.rootDir) });
  const findings = [...structural.findings];
  if (!authority.ok) {
    // C31b: name the reader's typed code (for example DDB-RETENTION-SHAPE); it was swallowed and a session could not tell why the projection was blocked.
    findings.push({ ...finding("aggregate-design-authority-unverified", "project/aggregate-design-architecture-references"),
      ...(typeof authority.code === "string" && /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,6}$/u.test(authority.code) ? { cause: authority.code } : {}) });
    return { ...structural, status: "blocked", code: "ARCH-DECISION-EFFECTIVE-UNRESOLVED",
      decisions: [], findings, projectionSha256: null };
  }
  const approved = new Map(authority.decisions.map(record => [record.id, record]));
  const decisions = structural.decisions.filter(record => {
    const verified = approved.get(record.id);
    const matches = verified && verified.digest === record.digest && verified.path === record.path
      && verified.scope === record.scope
      && JSON.stringify(verified.moduleIds) === JSON.stringify(record.moduleIds ?? []);
    if (!matches) findings.push(finding("decision-adoption-unverified", record.path));
    return matches;
  });
  findings.sort((left,right) => left.path?.localeCompare(right.path ?? "") || left.code.localeCompare(right.code));
  const status = findings.length ? "advisory" : "ready";
  const subject = { schema: SCHEMA, status, area: structural.area, decisions, activeExceptions: [], findings };
  return { ...subject, code: status === "ready" ? "ARCH-DECISION-EFFECTIVE-READY" : "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING",
    projectionSha256: digest(JSON.stringify(subject)) };
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

/** Reuse the closed physical sidecar syntax; this grants no adoption authority. */
export const validateArchitectureDecisionSidecar = validDecision;

// --- C28-PLAN-GATES (AC-108): which ADR proposals of a feature were never bound into its design package ---
// `create-adr.mjs` writes docs/adr/draft-<slug>.{md,json}; only `bind-adr-proposals.mjs` turns them into something the PO's design approval
// signs. A proposal nobody binds is invisible to every later check (only an accepted record is read as a decision), so submit-plan asks this
// reader before the PO is asked to sign. Read-only; it grants nothing.
export const ADR_DRAFT_DISCARD_SCHEMA = "pipeline.adr-draft-discard.v1";
const PROSPECTIVE_MANIFEST_SCHEMA = "pipeline.architecture-prospective-materialization.v1";
const PROSPECTIVE_MANIFEST_FILE = "prospective-architecture.json";
/** The discard record lives in a SUBFOLDER on purpose: a `.json` or `.md` directly in docs/adr would be read as an orphan decision sidecar. */
export const adrDraftDiscardPath = (slug) => `docs/adr/discarded/draft-${slug}.json`;
const DRAFT_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const MAX_MANIFEST_WALK = 2000;

function readJsonFile(path) {
  try { return JSON.parse(physicalFile(path).toString("utf8")); } catch { return null; }
}

/** The binding manifests (the file bind-adr-proposals writes next to its carrier) below the given repository-relative folders. */
function boundManifestRows(root, featureDirs) {
  const rows = [];
  let seen = 0;
  const walk = (relative, depth) => {
    let entries;
    try { entries = readdirSync(join(root, ...relative.split("/").filter(Boolean)), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (++seen > MAX_MANIFEST_WALK || entry.name.startsWith(".") || entry.name === "node_modules" || entry.isSymbolicLink()) continue;
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) { if (depth < 4) walk(child, depth + 1); continue; }
      if (entry.name !== PROSPECTIVE_MANIFEST_FILE) continue;
      const value = readJsonFile(join(root, ...child.split("/")));
      if (value?.schema !== PROSPECTIVE_MANIFEST_SCHEMA || !Array.isArray(value.decisions)) continue;
      for (const row of value.decisions) {
        if (typeof row?.id === "string" && typeof row.proposedMarkdown?.path === "string" && typeof row.proposedMarkdown.sha256 === "string") {
          rows.push({ id: row.id, path: row.proposedMarkdown.path, sha256: row.proposedMarkdown.sha256 });
        }
      }
    }
  };
  for (const folder of featureDirs) if (typeof folder === "string") walk(folder.replace(/\\/gu, "/").replace(/^\.\//u, "").replace(/\/+$/u, ""), 0);
  return rows;
}

/**
 * The ADR proposals under docs/adr and what became of each: `{ slug, path, state, acceptedId }`. A proposal is a draft-<slug>.md whose sidecar is a valid
 * `proposed` record of the same id (hand-written notes and accepted drafts are not proposals). State:
 *   materialized  an accepted or superseded docs/adr/NNNN-<slug> record exists (the draft stays on disk as history; never unbound again)
 *   bound         a binding manifest below `featureDirs` lists the draft with its CURRENT digest (an edit after binding means unbound)
 *   discarded     docs/adr/discarded/draft-<slug>.json records a discard of the CURRENT draft bytes (an edited or recreated draft is not exempt)
 *   unbound       none of the above
 */
export function inspectAdrDraftBindings({ rootDir, featureDirs = [] } = {}) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)) return [];
  const root = resolve(rootDir);
  const dir = join(root, "docs", "adr");
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  const manifest = boundManifestRows(root, Array.isArray(featureDirs) ? featureDirs : []);
  const result = [];
  for (const name of names.sort()) {
    const slug = /^draft-(.+)\.md$/u.exec(name)?.[1];
    if (slug === undefined || !DRAFT_SLUG.test(slug)) continue;
    let markdown;
    try { markdown = physicalFile(join(dir, name)); } catch { continue; }
    const sidecar = readJsonFile(join(dir, `draft-${slug}.json`));
    if (!validDecision(sidecar) || sidecar.id !== `draft-${slug}` || sidecar.status !== "proposed") continue;
    const path = `docs/adr/${name}`;
    const current = digest(markdown);
    const accepted = names.filter((entry) => new RegExp(`^\\d{4}-${slug}\\.json$`, "u").test(entry))
      .find((entry) => ["accepted", "superseded"].includes(readJsonFile(join(dir, entry))?.status));
    const row = manifest.find((entry) => entry.path === path && entry.sha256 === current);
    const discard = readJsonFile(join(root, ...adrDraftDiscardPath(slug).split("/")));
    if (accepted !== undefined) result.push({ slug, path, state: "materialized", acceptedId: accepted.slice(0, -5) });
    else if (row !== undefined) result.push({ slug, path, state: "bound", acceptedId: row.id });
    else if (discard?.schema === ADR_DRAFT_DISCARD_SCHEMA && discard.id === `draft-${slug}` && discard.markdownSha256 === current) result.push({ slug, path, state: "discarded", acceptedId: null });
    else result.push({ slug, path, state: "unbound", acceptedId: null });
  }
  return result;
}

// --- AC-112 (candidate 31, L4 stages 2 and 3): the ADR paths a design declares that have neither a draft nor an accepted record ---
// The design's only marker of a decision to record is a module `adrReferences` path `docs/adr/NNNN-<slug>.md` (the number is a preview, binding assigns
// the final one, so the slug is the identity). Derived from the declared paths and the files alone: no stored status, nothing written here.
const DECLARED_ADR_REFERENCE = /^(?:\.\/)?docs\/adr\/\d{4}-([a-z0-9][a-z0-9-]{0,63})\.md$/u;
const slugTitle = (slug) => { const words = slug.replace(/-+/gu, " ").trim(); return `${words.charAt(0).toUpperCase()}${words.slice(1)}`; };

/**
 * `{ pending, skipped }` for the declared references of `modules` (the design block's module list), sorted by slug and unique across modules.
 * `pending`: `{ slug, reference, title }` with the title derived from the slug. `skipped`: `{ slug, reference, reason }`, reason `draft` (a
 * draft-<slug> file exists in any state, the same test create-adr refuses on) or `accepted` (an accepted or superseded NNNN-<slug> record exists).
 */
export function classifyDeclaredAdrReferences({ rootDir, modules } = {}) {
  const found = new Map();
  for (const module of Array.isArray(modules) ? modules : []) {
    for (const reference of Array.isArray(module?.adrReferences) ? module.adrReferences : []) {
      const slug = typeof reference === "string" ? DECLARED_ADR_REFERENCE.exec(reference)?.[1] : undefined;
      if (slug !== undefined && !found.has(slug)) found.set(slug, reference.replace(/^\.\//u, ""));
    }
  }
  const dir = typeof rootDir === "string" ? join(resolve(rootDir), "docs", "adr") : null;
  let names = [];
  try { if (dir !== null) names = readdirSync(dir); } catch { names = []; }
  const pending = [];
  const skipped = [];
  for (const slug of [...found.keys()].sort()) {
    const reference = found.get(slug);
    const accepted = names.some((name) => new RegExp(`^\\d{4}-${slug}\\.json$`, "u").test(name) && ["accepted", "superseded"].includes(readJsonFile(join(dir, name))?.status));
    if (names.includes(`draft-${slug}.md`) || names.includes(`draft-${slug}.json`)) skipped.push({ slug, reference, reason: "draft" });
    else if (accepted) skipped.push({ slug, reference, reason: "accepted" });
    else pending.push({ slug, reference, title: slugTitle(slug) });
  }
  return { pending, skipped };
}

/** The non-blocking submit-plan notice for the pending declared paths (null when there is none): the exact create-adr commands and the steps after them. */
export function adrDraftHintText({ rootDir, modules, createAdrScript } = {}) {
  const { pending } = classifyDeclaredAdrReferences({ rootDir, modules });
  if (pending.length === 0) return null;
  const base = `node ${createAdrScript} --root ${rootDir}`;
  return `Notice: the design declares ${pending.length === 1 ? "an ADR path" : `${pending.length} ADR paths`} with no draft and no accepted record (${pending.map((entry) => entry.reference).join(", ")}). `
    + `This submission is not blocked. To record ${pending.length === 1 ? "the decision" : "the decisions"} with this design, first withdraw the recorded submission (a draft written while it stands could not be bound): `
    + `pipeline-state.mjs cancel-submitted-plan --by <name> --submission-sha256 <the submission digest shown by submit-plan>; then create the draft${pending.length === 1 ? "" : "s"}: ${base} --from-design `
    + `(one draft per declared path; for one entry at a time: ${pending.map((entry) => `${base} --slug ${entry.slug} --title "${entry.title}"`).join(" ; ")}), write each REPLACE: line of the new docs/adr/draft-<slug>.md, `
    + `run ${base} --refresh, bind the drafts with bind-adr-proposals.mjs (the next submit-plan names the exact command) and submit again. `
    + `A path that is not meant to be a decision is removed from the module's adrReferences instead.`;
}
