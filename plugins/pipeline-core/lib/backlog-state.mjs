// SPDX-License-Identifier: SUL-1.0

/**
 * Canonical, dependency-light backlog state model.
 *
 * Markdown remains the human-facing source of truth.  This module owns the
 * deliberately narrow frontmatter dialect, the append-only transition-ledger
 * validation, and deterministic read projections.  It has no filesystem
 * dependency so project adapters can use the same validation before writing.
 */
import { createHash } from "node:crypto";

export const ITEM_SCHEMA = "pipeline.backlog-item.v1";
export const TRANSITION_SCHEMA = "pipeline.backlog-transition.v1";
export const TRANSITION_V2_SCHEMA = "pipeline.backlog-transition.v2";
export const EVIDENCE_AMENDMENT_SCHEMA = "pipeline.backlog-evidence-amendment.v1";
export const INDEX_SCHEMA = "pipeline.backlog-index.v1";
export const SENTINEL_RECOVERY_CATALOG_SCHEMA = "pipeline.sentinel-backlog-recovery.v1";
export const PROJECT_CLOSURE_READBACK_SCHEMA = "pipeline.project-closure-readback.v1";
export const BACKLOG_STATUSES = Object.freeze(["open", "in_progress", "closed"]);
export const BACKLOG_TYPES = Object.freeze(["workflow-improvement", "tooling-radar", "defect", "idea", "requirement"]);
const FORWARD_TRANSITIONS = Object.freeze({ open: "in_progress", in_progress: "closed" });

const ITEM_REQUIRED = Object.freeze(["schema", "id", "type", "owner", "status", "created", "source"]);
const ITEM_OPTIONAL = Object.freeze(["tracking", "due", "expires", "closed_at", "closure_repository", "closure_commit", "closure_evidence", "closure_readback"]);
const ITEM_KEYS = new Set([...ITEM_REQUIRED, ...ITEM_OPTIONAL]);
const ITEM_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const OWNER = /^(?:pipeline|project:[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/u;
const PROJECT_REPOSITORY = /^project:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const OID = /^[a-f0-9]{40}$/u;
const SAFE_REPOSITORY_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;
const CANONICAL_REPOSITORY_FILE_PATH = /^(?!\/)(?!.*\\)(?!.*\/\/)(?!.*\/$)(?!\.{1,2}$)(?!\.{1,2}\/)(?!.*\/\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const HASH = /^[a-f0-9]{64}$/u;
const EVIDENCE_AMENDMENT_KEYS = new Set(["kind", "commit", "reference", "previousClosureCommit", "resultSha256", "privateLicenseGateSha256", "neutralPublicLicenseGateSha256"]);
const REACHABILITY_AMENDMENT_KEYS = new Set(["kind", "commit", "reference", "supersedesSequence", "supersedesEntryHash", "referenceBlobOid", "referenceSha256"]);
const V2_EVIDENCE_AMENDMENT_KEYS = new Set(["schema", "kind", "targetSequence", "targetEntryHash", "targetCommit", "replacementCommit", "reference", "dispositionSha256", "idempotencyKey"]);
const V2_ORDINARY_EVIDENCE_KEYS = new Set(["kind", "commit", "reference", "legacyStatus"]);
const AFK_REPAIR_ID = "pipeline.elephant-direct-implementation-under-afk-authorization";
const MANAGED_ONBOARDING_REPAIR_ID = "pipeline.managed-onboarding-success-contract";
const REACHABILITY_REPAIR_ACTOR = "hotfix-047-reachability-repair";
const REACHABILITY_REPAIR_TARGETS = Object.freeze({
  "pipeline.elephant-direct-implementation-under-afk-authorization": Object.freeze({
    sequence: 39,
    entryHash: "84d2128467224ca61aa980c088e92473b9dda27959ecd29600cf8d4a72b83d3b",
    status: "open",
  }),
  "pipeline.source-available-commercial-licensing": Object.freeze({
    sequence: 40,
    entryHash: "2849de19fb7f0d0f34d6f2cbe6ed6d5171445abb09fa02132bc9a1d0d707e2b1",
    status: "closed",
  }),
});
const AFK_REPAIR_EVIDENCE_KEYS = new Set(["kind", "commit", "reference", "sourceSha256"]);
const AFK_REPAIR_DATE = "2026-07-23";
const AFK_REPAIR_ACTOR = "sentinel-recovery";
const AFK_REPAIR_REASON = "Repair the single missing initial ledger event for the existing open AFK-authorization process item; no status change or completion is claimed.";
const PROJECT_CLOSURE_READBACK_KEYS = new Set(["schema", "repository", "commit", "readbackCommit"]);
const SENTINEL_RECOVERY_CATALOG_KEYS = new Set(["schema", "source", "recoveredAt", "items"]);
const SENTINEL_RECOVERY_ITEM_KEYS = new Set(["id", "status", "type"]);
const SENTINEL_RECOVERY_IDS = Object.freeze([
  "pipeline.afk-assumption-mode",
  "pipeline.canonical-worktree-lifecycle",
  "pipeline.codex-plugin-validator-host-parity",
  "pipeline.codex-sandbox-critic-longterm",
  "pipeline.documentation-information-architecture",
  "pipeline.dual-channel-publication",
  "pipeline.execution-model-switchback",
  "pipeline.nonblocking-interaction-continuity",
  "pipeline.po-gate-worktree-authority",
  "pipeline.push-guard-worktree-target",
  "pipeline.regulated-document-hooks",
  "pipeline.session-keep-awake",
  "pipeline.stateful-design-contract-template",
  "pipeline.t1-governance-path-preflight",
  "pipeline.verify-gate-scoped-registration",
]);

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function v2Finding(domain, message) {
  return `${domain}: ${message}`;
}

function typedAuthority(result) {
  return isPlainObject(result)
    && Object.keys(result).length === 2
    && result.ok === true
    && result.code === "AUTHORITY:VALID";
}

function validDate(value) {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, error: "frontmatter values must not be empty" };
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string"
        ? { ok: true, value: parsed }
        : { ok: false, error: "quoted frontmatter value must be a JSON string" };
    } catch {
      return { ok: false, error: "quoted frontmatter value is not a valid JSON string" };
    }
  }
  if (/['\[\]{},]/u.test(value)) return { ok: false, error: "frontmatter values must be plain text or JSON strings" };
  return { ok: true, value };
}

/** Parse the intentionally small, one-level YAML frontmatter dialect. */
export function parseBacklogItem(text, { path = "item" } = {}) {
  const errors = [];
  if (typeof text !== "string" || !text.startsWith("---\n")) {
    return { ok: false, errors: [`${path}: item must begin with YAML frontmatter`], item: null };
  }
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return { ok: false, errors: [`${path}: frontmatter closing delimiter is missing`], item: null };
  const metadata = {};
  for (const [index, line] of text.slice(4, end).split("\n").entries()) {
    if (line.length === 0) continue;
    const match = line.match(/^([a-z_]+):\s*(.*?)\s*$/u);
    if (!match) {
      errors.push(`${path}: frontmatter line ${index + 1} is not a scalar key/value`);
      continue;
    }
    const [, key, raw] = match;
    if (own(metadata, key)) {
      errors.push(`${path}: frontmatter key ${key} is duplicated`);
      continue;
    }
    const scalar = parseScalar(raw);
    if (!scalar.ok) {
      errors.push(`${path}: ${key} ${scalar.error}`);
      continue;
    }
    metadata[key] = scalar.value;
  }
  const item = { path, metadata, body: text.slice(end + 5) };
  errors.push(...validateBacklogItem(item));
  return { ok: errors.length === 0, errors, item };
}

/** Render canonical frontmatter while preserving the supplied Markdown body exactly. */
export function renderBacklogItem({ metadata, body }) {
  const ordered = [...ITEM_REQUIRED, ...ITEM_OPTIONAL].filter((key) => own(metadata, key));
  const frontmatter = ordered.map((key) => `${key}: ${JSON.stringify(metadata[key])}`).join("\n");
  return `---\n${frontmatter}\n---\n${body.startsWith("\n") ? "" : "\n"}${body}`;
}

/** Validate only data, never the filesystem or Git object store. */
export function validateBacklogItem(item) {
  const errors = [];
  const { path = "item", metadata } = item ?? {};
  if (!isPlainObject(metadata)) return [`${path}: metadata must be an object`];
  for (const key of ITEM_REQUIRED) {
    if (!own(metadata, key)) errors.push(`${path}: missing required field ${key}`);
  }
  for (const key of Object.keys(metadata)) {
    if (!ITEM_KEYS.has(key)) errors.push(`${path}: unsupported field ${key}`);
    else if (typeof metadata[key] !== "string") errors.push(`${path}: ${key} must be a string`);
  }
  if (metadata.schema !== ITEM_SCHEMA) errors.push(`${path}: schema must equal ${ITEM_SCHEMA}`);
  if (!ITEM_ID.test(asString(metadata.id))) errors.push(`${path}: id must be a lowercase stable identifier`);
  if (!BACKLOG_TYPES.includes(metadata.type)) errors.push(`${path}: type is not in the canonical item taxonomy`);
  if (!OWNER.test(asString(metadata.owner))) errors.push(`${path}: owner must be pipeline or project:<slug>`);
  if (!BACKLOG_STATUSES.includes(metadata.status)) errors.push(`${path}: status must be open, in_progress, or closed`);
  if (!validDate(asString(metadata.created))) errors.push(`${path}: created must be an ISO calendar date`);
  if (asString(metadata.source).trim().length === 0) errors.push(`${path}: source must be non-empty`);
  if (own(metadata, "tracking") && asString(metadata.tracking).trim().length === 0) errors.push(`${path}: tracking must be non-empty when present`);
  for (const key of ["due", "expires"]) if (own(metadata, key) && !validDate(asString(metadata[key]))) errors.push(`${path}: ${key} must be an ISO calendar date`);

  const closureKeys = ["closed_at", "closure_repository", "closure_commit", "closure_evidence", "closure_readback"];
  if (metadata.status === "closed") {
    for (const key of ["closed_at", "closure_repository", "closure_commit", "closure_evidence"]) if (!own(metadata, key)) errors.push(`${path}: closed item requires ${key}`);
    if (own(metadata, "closed_at") && !validDate(asString(metadata.closed_at))) errors.push(`${path}: closed_at must be an ISO calendar date`);
    if (own(metadata, "closure_repository") && !(metadata.closure_repository === "self" || PROJECT_REPOSITORY.test(asString(metadata.closure_repository)))) errors.push(`${path}: closure_repository must be self or project:<slug>`);
    if (own(metadata, "closure_commit") && !OID.test(asString(metadata.closure_commit))) errors.push(`${path}: closure_commit must be a full lowercase Git commit OID`);
    if (own(metadata, "closure_evidence") && !SAFE_REPOSITORY_PATH.test(asString(metadata.closure_evidence))) errors.push(`${path}: closure_evidence must be a safe repository-relative path`);
    if (PROJECT_REPOSITORY.test(asString(metadata.owner))) {
      if (metadata.owner !== metadata.closure_repository) errors.push(`${path}: project closure_repository must match the configured item project binding`);
      if (!own(metadata, "closure_readback")) errors.push(`${path}: project closure requires closure_readback`);
    } else if (metadata.closure_repository?.startsWith("project:")) {
      if (!own(metadata, "closure_readback")) errors.push(`${path}: project closure requires closure_readback`);
      errors.push(`${path}: project closure_repository must match the configured item project binding`);
    }
    if (metadata.closure_repository === "self" && own(metadata, "closure_readback")) errors.push(`${path}: self closure must not carry a project read-back receipt`);
    if (own(metadata, "closure_readback") && !SAFE_REPOSITORY_PATH.test(asString(metadata.closure_readback))) errors.push(`${path}: closure_readback must be a safe repository-relative path`);
  } else if (closureKeys.some((key) => own(metadata, key))) {
    errors.push(`${path}: only closed items may carry closure evidence`);
  }
  return errors;
}

/**
 * Validate the small, self-describing receipt required to close a shared
 * project item from this control repository. It records both the commit the
 * project reports closed and the commit observed by the independent read-back;
 * the two must agree and bind the item's project repository and closure commit.
 */
export function validateProjectClosureReadback(receipt, { repository, configuredRepository, commit } = {}) {
  const errors = [];
  if (!isPlainObject(receipt)) return ["must be a JSON object"];
  for (const key of ["schema", "repository", "commit", "readbackCommit"]) {
    if (!own(receipt, key)) errors.push(`is missing ${key}`);
  }
  for (const key of Object.keys(receipt)) if (!PROJECT_CLOSURE_READBACK_KEYS.has(key)) errors.push(`has unsupported field ${key}`);
  if (receipt.schema !== PROJECT_CLOSURE_READBACK_SCHEMA) errors.push(`schema must equal ${PROJECT_CLOSURE_READBACK_SCHEMA}`);
  if (!PROJECT_REPOSITORY.test(asString(receipt.repository))) errors.push("repository must be project:<slug>");
  if (!OID.test(asString(receipt.commit))) errors.push("commit must be a full lowercase Git commit OID");
  if (!OID.test(asString(receipt.readbackCommit))) errors.push("readbackCommit must be a full lowercase Git commit OID");
  if (typeof receipt.commit === "string" && typeof receipt.readbackCommit === "string" && receipt.readbackCommit !== receipt.commit) {
    errors.push("readbackCommit must equal commit");
  }
  if (typeof repository === "string" && receipt.repository !== repository) errors.push("repository does not match closure_repository");
  if (typeof configuredRepository === "string" && receipt.repository !== configuredRepository) errors.push("repository does not match configured item project binding");
  if (typeof commit === "string" && receipt.commit !== commit) errors.push("commit does not match closure_commit");
  return errors;
}

/**
 * Validate the deliberately small public Sentinel recovery catalog.  It is an
 * inventory of historical baseline states, never a source of completion or
 * closure evidence.
 */
export function validateSentinelRecoveryCatalog(catalog) {
  const errors = [];
  if (!isPlainObject(catalog)) return ["recovery catalog must be a JSON object"];
  for (const key of ["schema", "source", "recoveredAt", "items"]) {
    if (!own(catalog, key)) errors.push(`recovery catalog is missing ${key}`);
  }
  for (const key of Object.keys(catalog)) if (!SENTINEL_RECOVERY_CATALOG_KEYS.has(key)) errors.push(`recovery catalog has unsupported field ${key}`);
  if (catalog.schema !== SENTINEL_RECOVERY_CATALOG_SCHEMA) errors.push(`recovery catalog schema must equal ${SENTINEL_RECOVERY_CATALOG_SCHEMA}`);
  if (typeof catalog.source !== "string" || !SAFE_REPOSITORY_PATH.test(catalog.source)) errors.push("recovery catalog source must be a safe repository-relative path");
  if (!validDate(asString(catalog.recoveredAt))) errors.push("recovery catalog recoveredAt must be an ISO calendar date");
  if (!Array.isArray(catalog.items) || catalog.items.length === 0) errors.push("recovery catalog items must be a non-empty array");
  if (!Array.isArray(catalog.items)) return errors;
  const ids = new Set();
  for (const [index, entry] of catalog.items.entries()) {
    const label = `recovery catalog item ${index + 1}`;
    if (!isPlainObject(entry)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    for (const key of ["id", "status", "type"]) if (!own(entry, key)) errors.push(`${label} is missing ${key}`);
    for (const key of Object.keys(entry)) if (!SENTINEL_RECOVERY_ITEM_KEYS.has(key)) errors.push(`${label} has unsupported field ${key}`);
    if (!ITEM_ID.test(asString(entry.id))) errors.push(`${label} id must be a lowercase stable identifier`);
    else if (ids.has(entry.id)) errors.push(`${label} duplicates id ${entry.id}`);
    else ids.add(entry.id);
    if (!BACKLOG_STATUSES.includes(entry.status)) errors.push(`${label} status must be open, in_progress, or closed`);
    else if (entry.status === "closed") errors.push(`${label} must not claim closed status during recovery`);
    if (!BACKLOG_TYPES.includes(entry.type)) errors.push(`${label} type is not in the canonical item taxonomy`);
  }
  const expected = new Set(SENTINEL_RECOVERY_IDS);
  for (const id of expected) if (!ids.has(id)) errors.push(`recovery catalog is missing required Sentinel id ${id}`);
  for (const id of ids) if (!expected.has(id)) errors.push(`recovery catalog contains unsupported Sentinel id ${id}`);
  return errors;
}

/** Stable JSON is the ledger's hash input and the generated JSON projection format. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function transitionHash(event) {
  const copy = { ...event };
  delete copy.entryHash;
  return createHash("sha256").update(canonicalJson(copy)).digest("hex");
}

/** Validate the closed, authority-bound evidence repair carried by v2 events. */
export function validateBacklogEvidenceAmendment(evidence, { label = "evidence amendment", readDispositionBytes = null, authorizeAmendment = null } = {}) {
  const errors = [];
  if (!isPlainObject(evidence)) return [v2Finding("SHAPE", `${label}: evidence must be an object`)];
  for (const key of V2_EVIDENCE_AMENDMENT_KEYS) {
    if (!own(evidence, key)) errors.push(v2Finding("SHAPE", `${label}: missing ${key}`));
  }
  for (const key of Object.keys(evidence)) {
    if (!V2_EVIDENCE_AMENDMENT_KEYS.has(key)) errors.push(v2Finding("SHAPE", `${label}: unsupported field ${key}`));
  }
  if (evidence.schema !== EVIDENCE_AMENDMENT_SCHEMA) errors.push(v2Finding("SCHEMA", `${label}: schema must equal ${EVIDENCE_AMENDMENT_SCHEMA}`));
  if (evidence.kind !== "evidence-amendment") errors.push(v2Finding("SHAPE", `${label}: kind must equal evidence-amendment`));
  if (!Number.isSafeInteger(evidence.targetSequence) || evidence.targetSequence < 1) errors.push(v2Finding("BOUND", `${label}: targetSequence must be a positive integer`));
  if (!HASH.test(asString(evidence.targetEntryHash))) errors.push(v2Finding("SHAPE", `${label}: targetEntryHash must be a SHA-256 hex digest`));
  if (!OID.test(asString(evidence.targetCommit))) errors.push(v2Finding("SHAPE", `${label}: targetCommit must be a full lowercase Git commit OID`));
  if (!OID.test(asString(evidence.replacementCommit))) errors.push(v2Finding("SHAPE", `${label}: replacementCommit must be a full lowercase Git commit OID`));
  if (!CANONICAL_REPOSITORY_FILE_PATH.test(asString(evidence.reference)) || evidence.reference.length > 512) errors.push(v2Finding("BOUND", `${label}: reference must be a safe repository-relative path of at most 512 characters`));
  if (!HASH.test(asString(evidence.dispositionSha256))) errors.push(v2Finding("SHAPE", `${label}: dispositionSha256 must be a SHA-256 hex digest`));
  if (!HASH.test(asString(evidence.idempotencyKey))) errors.push(v2Finding("SHAPE", `${label}: idempotencyKey must be a SHA-256 hex digest`));
  if (errors.length > 0) return errors;
  if (typeof readDispositionBytes !== "function") {
    errors.push(v2Finding("UNAVAILABLE", `${label}: disposition bytes reader is required`));
    return errors;
  }
  let dispositionBytes;
  try {
    dispositionBytes = readDispositionBytes(evidence.reference);
  } catch {
    errors.push(v2Finding("UNAVAILABLE", `${label}: referenced disposition bytes are unavailable`));
    return errors;
  }
  if (typeof dispositionBytes === "string") dispositionBytes = Buffer.from(dispositionBytes, "utf8");
  if (!(dispositionBytes instanceof Uint8Array)) {
    errors.push(v2Finding("UNAVAILABLE", `${label}: referenced disposition bytes must be a string, Buffer, or Uint8Array`));
    return errors;
  }
  const dispositionSha256 = createHash("sha256").update(dispositionBytes).digest("hex");
  if (dispositionSha256 !== evidence.dispositionSha256) errors.push(v2Finding("BOUND", `${label}: dispositionSha256 does not bind the referenced disposition bytes`));
  if (errors.length > 0) return errors;
  if (typeof authorizeAmendment !== "function") return [v2Finding("AUTHORITY", `${label}: amendment authority is required`)];
  let authority;
  try {
    authority = authorizeAmendment({ evidence, dispositionBytes, dispositionSha256 });
  } catch {
    return [v2Finding("UNAVAILABLE", `${label}: amendment authority is unavailable`)];
  }
  if (!typedAuthority(authority)) return [v2Finding("AUTHORITY", `${label}: amendment authority is not the exact typed approval`)];
  return errors;
}

function parseJsonWithDuplicateKeys(source) {
  let offset = 0;
  const duplicates = [];
  const duplicate = (key) => duplicates.push(key);
  const invalid = () => {
    throw new SyntaxError("invalid JSON");
  };
  const whitespace = () => {
    while (offset < source.length && /[\t\n\r ]/u.test(source[offset])) offset += 1;
  };
  const string = () => {
    if (source[offset] !== '"') invalid();
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset));
      }
      if (source[offset] === "\\") {
        offset += 2;
      } else {
        offset += 1;
      }
    }
    invalid();
  };
  const value = () => {
    whitespace();
    const token = source[offset];
    if (token === "{") {
      offset += 1;
      whitespace();
      const keys = new Set();
      if (source[offset] === "}") {
        offset += 1;
        return;
      }
      while (offset < source.length) {
        const key = string();
        if (keys.has(key)) duplicate(key);
        keys.add(key);
        whitespace();
        if (source[offset] !== ":") invalid();
        offset += 1;
        value();
        whitespace();
        if (source[offset] === "}") {
          offset += 1;
          return;
        }
        if (source[offset] !== ",") invalid();
        offset += 1;
        whitespace();
      }
      invalid();
    }
    if (token === "[") {
      offset += 1;
      whitespace();
      if (source[offset] === "]") {
        offset += 1;
        return;
      }
      while (offset < source.length) {
        value();
        whitespace();
        if (source[offset] === "]") {
          offset += 1;
          return;
        }
        if (source[offset] !== ",") invalid();
        offset += 1;
      }
      invalid();
    }
    if (token === '"') {
      string();
      return;
    }
    const remainder = source.slice(offset);
    const primitive = remainder.match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u);
    if (!primitive) invalid();
    offset += primitive[0].length;
  };
  value();
  whitespace();
  if (offset !== source.length) invalid();
  return { value: JSON.parse(source), duplicates };
}

/** Parse newline-delimited transition records without accepting blank or malformed rows. */
export function parseTransitionLedger(text, { path = "backlog/transitions.ndjson" } = {}) {
  const errors = [];
  if (typeof text !== "string" || !text.endsWith("\n")) errors.push(`${path}: ledger must end with one newline`);
  const source = typeof text === "string" ? text : "";
  const lines = source.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const events = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) {
      errors.push(`${path}: blank ledger line ${index + 1} is not allowed`);
      continue;
    }
    try {
      const parsed = parseJsonWithDuplicateKeys(line);
      if (parsed.value?.schema === TRANSITION_V2_SCHEMA && parsed.duplicates.length > 0) {
        errors.push(v2Finding("SCHEMA", `${path}: line ${index + 1} has duplicate JSON key ${JSON.stringify(parsed.duplicates[0])}`));
        continue;
      }
      events.push(parsed.value);
    } catch (error) {
      errors.push(`${path}: line ${index + 1} is not valid JSON`);
    }
  }
  return { ok: errors.length === 0, errors, events };
}

function validateV2OrdinaryEvidence(evidence, label) {
  const errors = [];
  if (!isPlainObject(evidence)) return [v2Finding("SHAPE", `${label}: evidence must be an object`)];
  for (const key of ["kind", "commit", "reference"]) {
    if (!own(evidence, key)) errors.push(v2Finding("SHAPE", `${label}: missing ${key}`));
  }
  for (const key of Object.keys(evidence)) {
    if (!V2_ORDINARY_EVIDENCE_KEYS.has(key)) errors.push(v2Finding("SHAPE", `${label}: unsupported field ${key}`));
  }
  if (typeof evidence.kind !== "string" || evidence.kind.length === 0 || evidence.kind === "evidence-amendment") errors.push(v2Finding("SHAPE", `${label}: kind must be a non-amendment string`));
  if (!OID.test(asString(evidence.commit))) errors.push(v2Finding("SHAPE", `${label}: commit must be a full lowercase Git commit OID`));
  if (!CANONICAL_REPOSITORY_FILE_PATH.test(asString(evidence.reference)) || asString(evidence.reference).length > 512) errors.push(v2Finding("BOUND", `${label}: reference must be a safe repository-relative path of at most 512 characters`));
  if (own(evidence, "legacyStatus") && typeof evidence.legacyStatus !== "string") errors.push(v2Finding("SHAPE", `${label}: legacyStatus must be a string`));
  return errors;
}

function validateTransitionShape(event, label, { readDispositionBytes = null, authorizeAmendment = null, authorizeOrdinaryEvidence = null } = {}) {
  const errors = [];
  const allowed = new Set(["schema", "sequence", "id", "from", "to", "at", "actor", "reason", "evidence", "previousHash", "entryHash"]);
  if (!isPlainObject(event)) return [`${label}: event must be an object`];
  for (const key of ["schema", "sequence", "id", "from", "to", "at", "actor", "reason", "evidence", "previousHash", "entryHash"]) {
    if (!own(event, key)) errors.push(`${label}: missing ${key}`);
  }
  for (const key of Object.keys(event)) if (!allowed.has(key)) errors.push(`${label}: unsupported field ${key}`);
  const isV2 = event.schema === TRANSITION_V2_SCHEMA;
  if (event.schema !== TRANSITION_SCHEMA && !isV2) errors.push(`${label}: schema must equal ${TRANSITION_SCHEMA}`);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) errors.push(`${label}: sequence must be a positive integer`);
  if (!ITEM_ID.test(asString(event.id))) errors.push(`${label}: id must be a lowercase stable identifier`);
  if (!(event.from === null || BACKLOG_STATUSES.includes(event.from))) errors.push(`${label}: from must be null or a canonical status`);
  if (!BACKLOG_STATUSES.includes(event.to)) errors.push(`${label}: to must be a canonical status`);
  const amendment = event.from === "closed" && event.to === "closed" && event?.evidence?.kind === "evidence-amendment";
  const reachabilityAmendment = event.from === event.to
    && event?.evidence?.kind === "reachability-amendment";
  const v2Amendment = isV2EvidenceAmendment(event);
  const afkRepair = event.id === AFK_REPAIR_ID && event.from === null && event.to === "open" && event?.evidence?.kind === "missing-initial-ledger-repair";
  const managedRepair = event.id === MANAGED_ONBOARDING_REPAIR_ID && event.from === null && event.to === "open" && event?.evidence?.kind === "missing-initial-ledger-repair";
  if (event.from === event.to && !amendment && !reachabilityAmendment) errors.push(`${label}: transition must change status`);
  if (!validDate(asString(event.at))) errors.push(`${label}: at must be an ISO calendar date`);
  if (!ITEM_ID.test(asString(event.actor))) errors.push(`${label}: actor must be a lowercase stable identifier`);
  if (asString(event.reason).trim().length === 0) errors.push(`${label}: reason must be non-empty`);
  if (isV2 && asString(event.id).length > 128) errors.push(`${label}: id must be at most 128 characters`);
  if (isV2 && asString(event.actor).length > 128) errors.push(`${label}: actor must be at most 128 characters`);
  if (isV2 && asString(event.reason).length > 512) errors.push(`${label}: reason must be at most 512 characters`);
  if (!isPlainObject(event.evidence)) errors.push(`${label}: evidence must be an object`);
  else if (v2Amendment) {
    errors.push(...validateBacklogEvidenceAmendment(event.evidence, { label: `${label}: evidence`, readDispositionBytes, authorizeAmendment }));
  }
  else if (isV2) {
    errors.push(...validateV2OrdinaryEvidence(event.evidence, `${label}: evidence`));
    if (errors.length === 0) {
      if (typeof authorizeOrdinaryEvidence !== "function") errors.push(v2Finding("AUTHORITY", `${label}: ordinary evidence authority is required`));
      else {
        try {
          if (!typedAuthority(authorizeOrdinaryEvidence({ event, evidence: event.evidence }))) errors.push(v2Finding("AUTHORITY", `${label}: ordinary evidence authority is not the exact typed approval`));
        } catch {
          errors.push(v2Finding("UNAVAILABLE", `${label}: ordinary evidence authority is unavailable`));
        }
      }
    }
  }
  else {
    const evidenceKeys = amendment
      ? EVIDENCE_AMENDMENT_KEYS
      : reachabilityAmendment
        ? REACHABILITY_AMENDMENT_KEYS
        : afkRepair
          ? AFK_REPAIR_EVIDENCE_KEYS
          : managedRepair
            ? new Set(["kind", "commit", "reference", "itemSha256"])
            : new Set(["kind", "commit", "legacyStatus", "reference"]);
    for (const key of Object.keys(event.evidence)) if (!evidenceKeys.has(key)) errors.push(`${label}: evidence has unsupported field ${key}`);
    if (typeof event.evidence.kind !== "string" || event.evidence.kind.length === 0) errors.push(`${label}: evidence.kind must be non-empty`);
    if (!OID.test(asString(event.evidence.commit))) errors.push(`${label}: evidence.commit must be a full lowercase Git commit OID`);
    if (own(event.evidence, "legacyStatus") && typeof event.evidence.legacyStatus !== "string") errors.push(`${label}: evidence.legacyStatus must be a string`);
    if (own(event.evidence, "reference") && !SAFE_REPOSITORY_PATH.test(asString(event.evidence.reference))) errors.push(`${label}: evidence.reference must be a safe repository-relative path`);
    if (amendment) {
      for (const key of ["previousClosureCommit", "resultSha256", "privateLicenseGateSha256", "neutralPublicLicenseGateSha256"]) if (!own(event.evidence, key)) errors.push(`${label}: evidence-amendment is missing ${key}`);
      if (!OID.test(asString(event.evidence.previousClosureCommit))) errors.push(`${label}: previousClosureCommit must be a full lowercase Git commit OID`);
      for (const key of ["resultSha256", "privateLicenseGateSha256", "neutralPublicLicenseGateSha256"]) if (!HASH.test(asString(event.evidence[key]))) errors.push(`${label}: ${key} must be a SHA-256 hex digest`);
    }
    if (reachabilityAmendment) {
      const target = REACHABILITY_REPAIR_TARGETS[event.id];
      if (!target
        || event.actor !== REACHABILITY_REPAIR_ACTOR
        || event.from !== target.status
        || event.to !== target.status) {
        errors.push(`${label}: reachability amendment is not an authorized 0.4.7 target`);
      }
      for (const key of ["supersedesSequence", "supersedesEntryHash", "referenceBlobOid", "referenceSha256"]) {
        if (!own(event.evidence, key)) errors.push(`${label}: reachability-amendment is missing ${key}`);
      }
      if (!Number.isSafeInteger(event.evidence.supersedesSequence) || event.evidence.supersedesSequence < 1) {
        errors.push(`${label}: supersedesSequence must be a positive integer`);
      }
      if (!HASH.test(asString(event.evidence.supersedesEntryHash))) errors.push(`${label}: supersedesEntryHash must be a SHA-256 hex digest`);
      if (!OID.test(asString(event.evidence.referenceBlobOid))) errors.push(`${label}: referenceBlobOid must be a full lowercase Git blob OID`);
      if (!HASH.test(asString(event.evidence.referenceSha256))) errors.push(`${label}: referenceSha256 must be a SHA-256 hex digest`);
      if (target && (event.evidence.supersedesSequence !== target.sequence
        || event.evidence.supersedesEntryHash !== target.entryHash)) {
        errors.push(`${label}: reachability amendment does not bind the authorized historical event`);
      }
    }
    if (afkRepair && !HASH.test(asString(event.evidence.sourceSha256))) errors.push(`${label}: sourceSha256 must be a SHA-256 hex digest`);
    if (managedRepair && !HASH.test(asString(event.evidence.itemSha256))) errors.push(`${label}: itemSha256 must be a SHA-256 hex digest`);
  }
  if (!(event.previousHash === null || HASH.test(asString(event.previousHash)))) errors.push(`${label}: previousHash must be null or a SHA-256 hex digest`);
  if (!HASH.test(asString(event.entryHash))) errors.push(`${label}: entryHash must be a SHA-256 hex digest`);
  else if (event.entryHash !== transitionHash(event)) errors.push(`${label}: entryHash does not match canonical event content`);
  return isV2 ? errors.map((error) => /^(?:SHAPE|SCHEMA|BOUND|AUTHORITY|CAS|STALE|REPLAY|CONFLICT|UNAVAILABLE|DURABILITY|READBACK|INTERNAL):/u.test(error) ? error : v2Finding("SHAPE", error)) : errors;
}

function isV2EvidenceAmendment(event) {
  return event?.schema === TRANSITION_V2_SCHEMA && event?.evidence?.kind === "evidence-amendment";
}

function projectedClosureCommit(event) {
  if (isV2EvidenceAmendment(event)) return event.evidence.replacementCommit;
  return event?.evidence?.commit;
}

/**
 * Validate the globally chained append-only ledger and reconcile each item's
 * current status with its final event.  `commitExists` is optional so pure
 * callers can validate shape without a Git repository.
 */
export function validateTransitionLedger(events, items, { commitExists = null, readDispositionBytes = null, authorizeAmendment = null, authorizeOrdinaryEvidence = null } = {}) {
  const errors = [];
  const eventValidity = Array.from({ length: events.length }, () => true);
  const mark = (index, message) => {
    const isV2 = events[index]?.schema === TRANSITION_V2_SCHEMA;
    errors.push(isV2 && !/^(?:SHAPE|SCHEMA|BOUND|AUTHORITY|CAS|STALE|REPLAY|CONFLICT|UNAVAILABLE|DURABILITY|READBACK|INTERNAL):/u.test(message)
      ? v2Finding("BOUND", message)
      : message);
    if (index >= 0 && index < eventValidity.length) eventValidity[index] = false;
  };
  const itemById = new Map();
  for (const item of items) {
    const id = item?.metadata?.id;
    if (typeof id === "string") {
      if (itemById.has(id)) errors.push(`items: duplicate id ${id}`);
      itemById.set(id, item);
    }
  }
  const stateById = new Map();
  const closureCommitById = new Map();
  const localEvidenceCommits = [];
  const reachabilitySupersessions = new Set();
  for (const event of events) {
    if (event?.evidence?.kind !== "reachability-amendment") continue;
    const target = REACHABILITY_REPAIR_TARGETS[event.id];
    const superseded = events[event.evidence.supersedesSequence - 1];
    if (target
      && event.actor === REACHABILITY_REPAIR_ACTOR
      && event.from === target.status
      && event.to === target.status
      && event.evidence.supersedesSequence === target.sequence
      && event.evidence.supersedesEntryHash === target.entryHash
      && superseded?.id === event.id
      && superseded?.entryHash === target.entryHash
      && superseded?.evidence?.reference === event.evidence.reference
      && OID.test(asString(event.evidence.commit))
      && (typeof commitExists !== "function" || commitExists(event.evidence.commit))) {
      reachabilitySupersessions.add(target.sequence);
    }
  }
  let previousHash = null;
  let seenV2 = false;
  for (const [index, event] of events.entries()) {
    const label = `ledger event ${index + 1}`;
    const shapeErrors = validateTransitionShape(event, label, { readDispositionBytes, authorizeAmendment, authorizeOrdinaryEvidence });
    for (const error of shapeErrors) mark(index, error);
    if (!isPlainObject(event)) continue;
    if (event.schema === TRANSITION_V2_SCHEMA) seenV2 = true;
    else if (seenV2 && event.schema === TRANSITION_SCHEMA) mark(index, `${label}: v1 transition must not follow a v2 transition`);
    if (event.sequence !== index + 1) mark(index, `${label}: sequence must equal physical ledger order`);
    if (event.previousHash !== previousHash) mark(index, `${label}: previousHash does not bind the preceding ledger event`);
    if (!itemById.has(event.id)) mark(index, `${label}: id does not name a current backlog item`);
    const item = itemById.get(event.id);
    if (event?.evidence?.kind === "missing-initial-ledger-repair" && event.evidence.sourceSha256 && event.evidence.sourceSha256 !== createHash("sha256").update(asString(item?.metadata?.source)).digest("hex")) errors.push(`${label}: sourceSha256 does not bind the current item source`);
    const prior = stateById.get(event.id);
    const v2Amendment = isV2EvidenceAmendment(event);
    if (prior === undefined) {
      if (event.from !== null) mark(index, `${label}: an item's first ledger event must start from null`);
      else if (event.to !== "open" && event.to !== "in_progress" && !(event.to === "closed" && item?.metadata?.owner === "pipeline" && item.metadata.closure_repository === "self")) {
        mark(index, `${label}: first ledger event may only initialize open or in-progress work, or record a self closure`);
      }
    } else {
      if (event.from !== prior) mark(index, `${label}: from does not match that item's prior ledger status`);
      if (prior === "closed") {
        const closureAmendment = event.from === "closed" && event.to === "closed" && event?.evidence?.kind === "evidence-amendment";
        const reachabilityAmendment = event.from === "closed" && event.to === "closed" && event?.evidence?.kind === "reachability-amendment";
        if (v2Amendment) {
          if (event.to !== "closed") mark(index, `${label}: evidence amendment must preserve closed status`);
        } else if (!closureAmendment && !reachabilityAmendment) errors.push(`${label}: closed must never transition to another status`);
        else if (closureAmendment && event.evidence.previousClosureCommit !== closureCommitById.get(event.id)) errors.push(`${label}: previousClosureCommit does not bind the prior closure`);
      } else if (v2Amendment) {
        if (event.to !== prior) mark(index, `${label}: evidence amendment must not mutate status`);
      } else if (event?.evidence?.kind === "reachability-amendment") {
        if (event.to !== prior) errors.push(`${label}: reachability amendment must preserve status`);
      } else if (FORWARD_TRANSITIONS[prior] !== event.to) errors.push(`${label}: ${prior} may only move to ${FORWARD_TRANSITIONS[prior]}`);
    }
    if (BACKLOG_STATUSES.includes(event.to)) stateById.set(event.id, event.to);
    const projectedCommit = projectedClosureCommit(event);
    if (event.to === "closed" && event?.evidence?.kind !== "reachability-amendment" && OID.test(asString(projectedCommit))) closureCommitById.set(event.id, projectedCommit);
    const externalProjectClosure = item?.metadata?.closure_repository?.startsWith("project:") && event.to === "closed";
    if (!externalProjectClosure && OID.test(asString(event?.evidence?.commit))) localEvidenceCommits.push({ index, commit: event.evidence.commit });
    previousHash = typeof event.entryHash === "string" ? event.entryHash : previousHash;
  }

  const amendments = [];
  for (const [index, event] of events.entries()) {
    if (!isV2EvidenceAmendment(event)) continue;
    const label = `ledger event ${index + 1}`;
    const evidence = event.evidence;
    const amendment = { index, targetIndex: -1, relationValid: true };
    if (!Number.isSafeInteger(evidence.targetSequence) || evidence.targetSequence >= index + 1) {
      mark(index, `${label}: evidence amendment must target an earlier physical event`);
      amendment.relationValid = false;
    } else {
      amendment.targetIndex = evidence.targetSequence - 1;
      const target = events[amendment.targetIndex];
      if (!isPlainObject(target) || target.sequence !== evidence.targetSequence) {
        mark(index, `${label}: targetSequence does not identify its physical target event`);
        amendment.relationValid = false;
      } else {
        if (target.entryHash !== evidence.targetEntryHash) {
          mark(index, `${label}: targetEntryHash does not bind the target event`);
          amendment.relationValid = false;
        }
        if (target?.evidence?.commit !== evidence.targetCommit) {
          mark(index, `${label}: targetCommit does not bind the target event evidence`);
          amendment.relationValid = false;
        }
        if (target.id !== event.id) {
          mark(index, `${label}: evidence amendment id does not match the target event id`);
          amendment.relationValid = false;
        }
      }
    }
    amendments.push(amendment);
  }

  const amendmentsByTarget = new Map();
  const amendmentsByIdempotency = new Map();
  for (const amendment of amendments) {
    const event = events[amendment.index];
    const targetKey = event?.evidence?.targetSequence;
    if (Number.isSafeInteger(targetKey)) {
      const prior = amendmentsByTarget.get(targetKey);
      if (prior !== undefined) {
        mark(prior, `ledger event ${prior + 1}: duplicate or conflicting evidence amendment for target sequence ${targetKey}`);
        mark(amendment.index, `ledger event ${amendment.index + 1}: duplicate or conflicting evidence amendment for target sequence ${targetKey}`);
      } else {
        amendmentsByTarget.set(targetKey, amendment.index);
      }
    }
    const idempotencyKey = event?.evidence?.idempotencyKey;
    if (HASH.test(asString(idempotencyKey))) {
      const prior = amendmentsByIdempotency.get(idempotencyKey);
      if (prior !== undefined) {
        mark(prior, `ledger event ${prior + 1}: evidence amendment idempotencyKey is duplicated`);
        mark(amendment.index, `ledger event ${amendment.index + 1}: evidence amendment idempotencyKey is duplicated`);
      } else {
        amendmentsByIdempotency.set(idempotencyKey, amendment.index);
      }
    }
  }

  if (typeof commitExists === "function") {
    const reachability = new Map();
    const reachable = (oid) => {
      if (!reachability.has(oid)) reachability.set(oid, Boolean(commitExists(oid)));
      return reachability.get(oid);
    };
    const acceptedByTarget = new Map();
    for (const amendment of amendments) {
      const event = events[amendment.index];
      const evidence = event.evidence;
      const targetValid = amendment.targetIndex >= 0 && eventValidity[amendment.targetIndex];
      const uniqueTarget = amendmentsByTarget.get(evidence.targetSequence) === amendment.index;
      const uniqueIdempotency = amendmentsByIdempotency.get(evidence.idempotencyKey) === amendment.index;
      if (!amendment.relationValid || !eventValidity[amendment.index] || !targetValid || !uniqueTarget || !uniqueIdempotency) continue;
      if (reachable(evidence.targetCommit)) {
        mark(amendment.index, `ledger event ${amendment.index + 1}: evidence amendment targetCommit is already reachable`);
        continue;
      }
      if (!reachable(evidence.replacementCommit)) {
        mark(amendment.index, `ledger event ${amendment.index + 1}: evidence amendment replacementCommit is not a reachable local Git commit`);
        continue;
      }
      acceptedByTarget.set(evidence.targetSequence, amendment.index);
    }
    for (const record of localEvidenceCommits) {
      if (reachabilitySupersessions.has(record.index + 1)) continue;
      if (reachable(record.commit)) continue;
      if (acceptedByTarget.has(record.index + 1)) continue;
      mark(record.index, `ledger event ${record.index + 1}: evidence.commit is not a reachable local Git commit`);
    }
  }

  for (const [id, item] of itemById) {
    const current = stateById.get(id);
    if (current === undefined) errors.push(`items: ${id} has no transition-ledger entry`);
    else if (current !== item.metadata.status) errors.push(`items: ${id} status does not match its final ledger transition`);
    if (item.metadata.status === "closed" && current === "closed") {
      const latest = [...events].reverse().find((event) => event?.id === id);
      const reachabilitySuperseded = latest?.evidence?.kind === "reachability-amendment"
        && reachabilitySupersessions.has(latest.evidence.supersedesSequence);
      const final = [...events].reverse().find((event) => event?.id === id && event?.evidence?.kind !== "reachability-amendment");
      if (!reachabilitySuperseded && projectedClosureCommit(final) !== item.metadata.closure_commit) {
        const finding = isV2EvidenceAmendment(final)
          ? `items: ${id} closure_commit must equal its final ledger evidence.replacementCommit`
          : `items: ${id} closure_commit must equal its final ledger evidence.commit`;
        errors.push(isV2EvidenceAmendment(final) ? v2Finding("BOUND", finding) : finding);
      }
      if (isV2EvidenceAmendment(final) && item.metadata.closure_evidence !== final.evidence.reference) {
        errors.push(v2Finding("BOUND", `items: ${id} closure_evidence must equal its final ledger evidence.reference`));
      }
    }
  }
  return errors;
}

function markdownCell(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

/** Return deterministic projections from already validated item/ledger data. */
export function projectBacklog(items, events) {
  const ordered = [...items].sort((left, right) => left.metadata.id.localeCompare(right.metadata.id));
  const counts = Object.fromEntries(BACKLOG_STATUSES.map((status) => [status, 0]));
  const projectedItems = ordered.map(({ metadata }) => {
    counts[metadata.status] += 1;
    const output = {
      id: metadata.id,
      status: metadata.status,
      type: metadata.type,
      owner: metadata.owner,
      created: metadata.created,
      source: metadata.source,
    };
    if (own(metadata, "tracking")) output.tracking = metadata.tracking;
    if (metadata.status === "closed") {
      output.closedAt = metadata.closed_at;
      output.closureRepository = metadata.closure_repository;
      output.closureCommit = metadata.closure_commit;
      output.closureEvidence = metadata.closure_evidence;
      if (own(metadata, "closure_readback")) output.closureReadback = metadata.closure_readback;
    }
    return output;
  });
  const index = {
    schema: INDEX_SCHEMA,
    generatedFrom: {
      items: "backlog/items/*.md",
      ledger: "backlog/transitions.ndjson",
      transitionHead: events.length === 0 ? null : events.at(-1).entryHash,
    },
    counts,
    items: projectedItems,
  };
  const status = [
    "# Backlog status",
    "",
    "> Generated from `backlog/items/*.md` and `backlog/transitions.ndjson`; do not edit manually.",
    "> Item status is operational work tracking, never the active feature lifecycle authority.",
    "",
    "| ID | Status | Type | Owner | Created | Tracking |",
    "| --- | --- | --- | --- | --- | --- |",
    ...projectedItems.map((item) => `| ${markdownCell(item.id)} | ${markdownCell(item.status)} | ${markdownCell(item.type)} | ${markdownCell(item.owner)} | ${markdownCell(item.created)} | ${markdownCell(item.tracking)} |`),
    "",
    "## Counts",
    "",
    `- open: ${counts.open}`,
    `- in_progress: ${counts.in_progress}`,
    `- closed: ${counts.closed}`,
    "",
  ].join("\n");
  return { index, indexText: `${JSON.stringify(index, null, 2)}\n`, statusText: status };
}

/**
 * Build, but never write, one valid forward status transition.  The I/O layer
 * persists this exact plan as an all-or-nothing transaction.
 */
export function planBacklogTransition(items, events, input) {
  const errors = [];
  const { id, to, at, actor, reason, evidence, closure = null } = input ?? {};
  const index = items.findIndex((item) => item?.metadata?.id === id);
  if (index === -1) return { ok: false, errors: [`transition: unknown item id ${id}`], items, events, projection: null };
  const original = items[index];
  const from = original.metadata.status;
  if (FORWARD_TRANSITIONS[from] !== to) errors.push(`transition: ${from} may only move to ${FORWARD_TRANSITIONS[from] ?? "no further status"}`);
  if (!validDate(asString(at))) errors.push("transition: at must be an ISO calendar date");
  if (!ITEM_ID.test(asString(actor))) errors.push("transition: actor must be a lowercase stable identifier");
  if (asString(reason).trim().length === 0) errors.push("transition: reason must be non-empty");
  if (!isPlainObject(evidence)) errors.push("transition: evidence must be an object");
  if (to === "closed" && !isPlainObject(closure)) errors.push("transition: closing requires closure repository, commit, and evidence");
  if (errors.length > 0) return { ok: false, errors, items, events, projection: null };

  const metadata = { ...original.metadata, status: to };
  if (to === "closed") {
    Object.assign(metadata, {
      closed_at: closure.closedAt,
      closure_repository: closure.repository,
      closure_commit: closure.commit,
      closure_evidence: closure.evidence,
    });
    if (closure.readback !== undefined && closure.readback !== null) metadata.closure_readback = closure.readback;
  }
  const updated = { ...original, metadata };
  errors.push(...validateBacklogItem(updated));
  const event = {
    schema: TRANSITION_SCHEMA,
    sequence: events.length + 1,
    id,
    from,
    to,
    at,
    actor,
    reason,
    evidence,
    previousHash: events.length === 0 ? null : events.at(-1).entryHash,
    entryHash: "",
  };
  event.entryHash = transitionHash(event);
  const nextItems = [...items];
  nextItems[index] = updated;
  const nextEvents = [...events, event];
  errors.push(...validateTransitionLedger(nextEvents, nextItems));
  const projection = errors.length === 0 ? projectBacklog(nextItems, nextEvents) : null;
  return { ok: errors.length === 0, errors, items: nextItems, events: nextEvents, event, projection };
}

/** Add evidence to an already-closed item without reopening or rewriting history. */
export function planBacklogEvidenceAmendment(items, events, input) {
  const errors = [];
  const { id, at, actor, reason, evidence, closure } = input ?? {};
  const index = items.findIndex((entry) => entry?.metadata?.id === id);
  if (index === -1) return { ok: false, errors: [`evidence amendment: unknown item id ${id}`], items, events, projection: null };
  const original = items[index];
  if (id !== "pipeline.source-available-commercial-licensing") errors.push("evidence amendment: only the SNT-1 licensing item is authorized");
  if (original.metadata.status !== "closed") errors.push("evidence amendment: item must already be closed");
  if (!validDate(asString(at)) || !ITEM_ID.test(asString(actor)) || asString(reason).trim().length === 0) errors.push("evidence amendment: actor/date/reason is invalid");
  if (!isPlainObject(evidence) || evidence.kind !== "evidence-amendment") errors.push("evidence amendment: exact evidence kind is required");
  if (!isPlainObject(closure) || closure.repository !== original.metadata.closure_repository || !OID.test(asString(closure.commit)) || !SAFE_REPOSITORY_PATH.test(asString(closure.evidence))) errors.push("evidence amendment: closure binding is invalid");
  if (errors.length) return { ok: false, errors, items, events, projection: null };
  const updated = { ...original, metadata: { ...original.metadata, closure_commit: closure.commit, closure_evidence: closure.evidence } };
  errors.push(...validateBacklogItem(updated));
  const event = { schema: TRANSITION_SCHEMA, sequence: events.length + 1, id, from: "closed", to: "closed", at, actor, reason, evidence: { ...evidence, commit: closure.commit, reference: closure.evidence, previousClosureCommit: original.metadata.closure_commit }, previousHash: events.at(-1)?.entryHash ?? null, entryHash: "" };
  event.entryHash = transitionHash(event);
  const nextItems = [...items]; nextItems[index] = updated;
  const nextEvents = [...events, event];
  errors.push(...validateTransitionLedger(nextEvents, nextItems));
  return { ok: errors.length === 0, errors, items: nextItems, events: nextEvents, event, projection: errors.length ? null : projectBacklog(nextItems, nextEvents) };
}

/** Plan the one authorized missing-initial-event repair; never a generic initializer. */
export function planElephantAfkLedgerRepair(items, events, input) {
  const errors = [];
  const expectedKeys = ["id", "at", "actor", "evidenceCommit", "source"];
  if (!isPlainObject(input) || Object.keys(input).sort().join("\n") !== expectedKeys.sort().join("\n")) return { ok: false, errors: ["AFK ledger repair input shape is invalid"], items, events, projection: null };
  const record = items.find((entry) => entry?.metadata?.id === AFK_REPAIR_ID);
  if (input.id !== AFK_REPAIR_ID || input.at !== AFK_REPAIR_DATE || input.actor !== AFK_REPAIR_ACTOR) errors.push("AFK ledger repair authority binding is invalid");
  if (!record || record.metadata.status !== "open" || input.source !== record.metadata.source) errors.push("AFK ledger repair item/source binding is invalid");
  if (!OID.test(asString(input.evidenceCommit))) errors.push("AFK ledger repair evidence commit is invalid");
  if (events.some((event) => event?.id === AFK_REPAIR_ID)) errors.push("AFK ledger repair event already exists");
  if (errors.length) return { ok: false, errors, items, events, projection: null };
  const event = { schema: TRANSITION_SCHEMA, sequence: events.length + 1, id: AFK_REPAIR_ID, from: null, to: "open", at: input.at, actor: input.actor, reason: AFK_REPAIR_REASON, evidence: { kind: "missing-initial-ledger-repair", commit: input.evidenceCommit, reference: record.path, sourceSha256: createHash("sha256").update(record.metadata.source).digest("hex") }, previousHash: events.at(-1)?.entryHash ?? null, entryHash: "" };
  event.entryHash = transitionHash(event);
  const nextEvents = [...events, event];
  errors.push(...validateTransitionLedger(nextEvents, items));
  return { ok: errors.length === 0, errors, items, events: nextEvents, event, projection: errors.length ? null : projectBacklog(items, nextEvents) };
}

/** Plan the single 0.4.7 missing initial event for the managed-onboarding item. */
export function planManagedOnboardingLedgerRepair(items, events, input) {
  const errors = [];
  const expectedKeys = ["id", "at", "actor", "evidenceCommit", "itemSha256"];
  if (!isPlainObject(input) || Object.keys(input).sort().join("\n") !== expectedKeys.sort().join("\n")) return { ok: false, errors: ["managed onboarding ledger repair input shape is invalid"], items, events, projection: null };
  const record = items.find((entry) => entry?.metadata?.id === MANAGED_ONBOARDING_REPAIR_ID);
  if (input.id !== MANAGED_ONBOARDING_REPAIR_ID || input.actor !== "hotfix-047-missing-initial-ledger-repair") errors.push("managed onboarding ledger repair authority binding is invalid");
  if (!record || record.metadata.status !== "open") errors.push("managed onboarding ledger repair item must remain open");
  if (!validDate(asString(input.at))) errors.push("managed onboarding ledger repair date is invalid");
  if (!OID.test(asString(input.evidenceCommit))) errors.push("managed onboarding ledger repair evidence commit is invalid");
  if (!HASH.test(asString(input.itemSha256))) errors.push("managed onboarding ledger repair itemSha256 is invalid");
  if (events.some((event) => event?.id === MANAGED_ONBOARDING_REPAIR_ID)) errors.push("managed onboarding ledger repair event already exists");
  if (errors.length) return { ok: false, errors, items, events, projection: null };
  const event = { schema: TRANSITION_SCHEMA, sequence: events.length + 1, id: MANAGED_ONBOARDING_REPAIR_ID, from: null, to: "open", at: input.at, actor: input.actor, reason: "Admit the existing open 0.4.7 managed-onboarding success-contract item; no implementation or closure is claimed.", evidence: { kind: "missing-initial-ledger-repair", commit: input.evidenceCommit, reference: record.path, itemSha256: input.itemSha256 }, previousHash: events.at(-1)?.entryHash ?? null, entryHash: "" };
  event.entryHash = transitionHash(event);
  const nextEvents = [...events, event];
  errors.push(...validateTransitionLedger(nextEvents, items));
  return { ok: errors.length === 0, errors, items, events: nextEvents, event, projection: errors.length ? null : projectBacklog(items, nextEvents) };
}

/**
 * Append the two narrowly authorized 0.4.7 reachability corrections. The
 * historical events remain byte-for-byte intact and item status is unchanged.
 */
export function planBacklogReachabilityRepair(items, events, input) {
  const errors = [];
  const expectedKeys = ["at", "actor", "commit", "references"];
  if (!isPlainObject(input)
    || Object.keys(input).sort().join("\n") !== expectedKeys.sort().join("\n")) {
    return { ok: false, errors: ["reachability repair input shape is invalid"], items, events, projection: null };
  }
  if (input.actor !== REACHABILITY_REPAIR_ACTOR || !validDate(asString(input.at))) {
    errors.push("reachability repair authority binding is invalid");
  }
  if (!OID.test(asString(input.commit))) errors.push("reachability repair commit is invalid");
  const expectedIds = Object.keys(REACHABILITY_REPAIR_TARGETS);
  if (!Array.isArray(input.references)
    || input.references.length !== expectedIds.length
    || input.references.map((entry) => entry?.id).join("\n") !== expectedIds.join("\n")) {
    errors.push("reachability repair references must equal the authorized ordered target set");
  }
  if (events.some((event) => event?.evidence?.kind === "reachability-amendment")) {
    errors.push("reachability repair was already appended");
  }
  for (const [index, id] of expectedIds.entries()) {
    const target = REACHABILITY_REPAIR_TARGETS[id];
    const historical = events[target.sequence - 1];
    const reference = input.references?.[index];
    const item = items.find((entry) => entry?.metadata?.id === id);
    if (historical?.id !== id
      || historical?.entryHash !== target.entryHash
      || historical?.evidence?.reference !== reference?.reference) {
      errors.push(`reachability repair target ${id} does not bind canonical history`);
    }
    if (!item || item.metadata.status !== target.status) {
      errors.push(`reachability repair target ${id} must preserve ${target.status}`);
    }
    if (!isPlainObject(reference)
      || !exactReferenceKeys(reference)
      || !SAFE_REPOSITORY_PATH.test(asString(reference.reference))
      || !OID.test(asString(reference.referenceBlobOid))
      || !HASH.test(asString(reference.referenceSha256))) {
      errors.push(`reachability repair reference ${id} is invalid`);
    }
  }
  if (errors.length) return { ok: false, errors, items, events, projection: null };

  const nextEvents = [...events];
  let previousHash = nextEvents.at(-1)?.entryHash ?? null;
  for (const [index, id] of expectedIds.entries()) {
    const target = REACHABILITY_REPAIR_TARGETS[id];
    const reference = input.references[index];
    const event = {
      schema: TRANSITION_SCHEMA,
      sequence: nextEvents.length + 1,
      id,
      from: target.status,
      to: target.status,
      at: input.at,
      actor: input.actor,
      reason: `Append reachable evidence for historical event ${target.sequence} without rewriting it or changing item status.`,
      evidence: {
        kind: "reachability-amendment",
        commit: input.commit,
        reference: reference.reference,
        supersedesSequence: target.sequence,
        supersedesEntryHash: target.entryHash,
        referenceBlobOid: reference.referenceBlobOid,
        referenceSha256: reference.referenceSha256,
      },
      previousHash,
      entryHash: "",
    };
    event.entryHash = transitionHash(event);
    nextEvents.push(event);
    previousHash = event.entryHash;
  }
  // This planner deliberately receives a historical ledger prefix. Items
  // admitted by later append-only events are outside that snapshot; their
  // absence must not invalidate a replay of these two historical repairs.
  // The normal state checker still validates every current item against the
  // complete ledger.
  const snapshotIds = new Set([...events.map((event) => event?.id), ...expectedIds]);
  const snapshotItems = items.filter((item) => snapshotIds.has(item?.metadata?.id));
  errors.push(...validateTransitionLedger(nextEvents, snapshotItems));
  return {
    ok: errors.length === 0,
    errors,
    items,
    events: nextEvents,
    appended: nextEvents.slice(events.length),
    projection: errors.length ? null : projectBacklog(items, nextEvents),
  };
}

function exactReferenceKeys(value) {
  return Object.keys(value).sort().join("\n")
    === ["id", "reference", "referenceBlobOid", "referenceSha256"].sort().join("\n");
}
