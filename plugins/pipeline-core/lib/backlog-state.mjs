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
export const INDEX_SCHEMA = "pipeline.backlog-index.v1";
export const SENTINEL_RECOVERY_CATALOG_SCHEMA = "pipeline.sentinel-backlog-recovery.v1";
export const PROJECT_CLOSURE_READBACK_SCHEMA = "pipeline.project-closure-readback.v1";
export const BACKLOG_STATUSES = Object.freeze(["open", "in_progress", "closed"]);
export const BACKLOG_TYPES = Object.freeze(["workflow-improvement", "tooling-radar", "defect", "idea"]);
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
const HASH = /^[a-f0-9]{64}$/u;
const EVIDENCE_AMENDMENT_KEYS = new Set(["kind", "commit", "reference", "previousClosureCommit", "resultSha256", "privateLicenseGateSha256", "neutralPublicLicenseGateSha256"]);
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
      events.push(JSON.parse(line));
    } catch {
      errors.push(`${path}: line ${index + 1} is not valid JSON`);
    }
  }
  return { ok: errors.length === 0, errors, events };
}

function validateTransitionShape(event, label) {
  const errors = [];
  const allowed = new Set(["schema", "sequence", "id", "from", "to", "at", "actor", "reason", "evidence", "previousHash", "entryHash"]);
  if (!isPlainObject(event)) return [`${label}: event must be an object`];
  for (const key of ["schema", "sequence", "id", "from", "to", "at", "actor", "reason", "evidence", "previousHash", "entryHash"]) {
    if (!own(event, key)) errors.push(`${label}: missing ${key}`);
  }
  for (const key of Object.keys(event)) if (!allowed.has(key)) errors.push(`${label}: unsupported field ${key}`);
  if (event.schema !== TRANSITION_SCHEMA) errors.push(`${label}: schema must equal ${TRANSITION_SCHEMA}`);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) errors.push(`${label}: sequence must be a positive integer`);
  if (!ITEM_ID.test(asString(event.id))) errors.push(`${label}: id must be a lowercase stable identifier`);
  if (!(event.from === null || BACKLOG_STATUSES.includes(event.from))) errors.push(`${label}: from must be null or a canonical status`);
  if (!BACKLOG_STATUSES.includes(event.to)) errors.push(`${label}: to must be a canonical status`);
  const amendment = event.from === "closed" && event.to === "closed" && event?.evidence?.kind === "evidence-amendment";
  if (event.from === event.to && !amendment) errors.push(`${label}: transition must change status`);
  if (!validDate(asString(event.at))) errors.push(`${label}: at must be an ISO calendar date`);
  if (!ITEM_ID.test(asString(event.actor))) errors.push(`${label}: actor must be a lowercase stable identifier`);
  if (asString(event.reason).trim().length === 0) errors.push(`${label}: reason must be non-empty`);
  if (!isPlainObject(event.evidence)) errors.push(`${label}: evidence must be an object`);
  else {
    const evidenceKeys = amendment ? EVIDENCE_AMENDMENT_KEYS : new Set(["kind", "commit", "legacyStatus", "reference"]);
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
  }
  if (!(event.previousHash === null || HASH.test(asString(event.previousHash)))) errors.push(`${label}: previousHash must be null or a SHA-256 hex digest`);
  if (!HASH.test(asString(event.entryHash))) errors.push(`${label}: entryHash must be a SHA-256 hex digest`);
  else if (event.entryHash !== transitionHash(event)) errors.push(`${label}: entryHash does not match canonical event content`);
  return errors;
}

/**
 * Validate the globally chained append-only ledger and reconcile each item's
 * current status with its final event.  `commitExists` is optional so pure
 * callers can validate shape without a Git repository.
 */
export function validateTransitionLedger(events, items, { commitExists = null } = {}) {
  const errors = [];
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
  let previousHash = null;
  for (const [index, event] of events.entries()) {
    const label = `ledger event ${index + 1}`;
    errors.push(...validateTransitionShape(event, label));
    if (!isPlainObject(event)) continue;
    if (event.sequence !== index + 1) errors.push(`${label}: sequence must equal physical ledger order`);
    if (event.previousHash !== previousHash) errors.push(`${label}: previousHash does not bind the preceding ledger event`);
    if (!itemById.has(event.id)) errors.push(`${label}: id does not name a current backlog item`);
    const item = itemById.get(event.id);
    const prior = stateById.get(event.id);
    if (prior === undefined) {
      if (event.from !== null) errors.push(`${label}: an item's first ledger event must start from null`);
      else if (event.to !== "open" && event.to !== "in_progress" && !(event.to === "closed" && item?.metadata?.owner === "pipeline" && item.metadata.closure_repository === "self")) {
        errors.push(`${label}: first ledger event may only initialize open or in-progress work, or record a self closure`);
      }
    } else {
      if (event.from !== prior) errors.push(`${label}: from does not match that item's prior ledger status`);
      if (prior === "closed") {
        if (!(event.from === "closed" && event.to === "closed" && event?.evidence?.kind === "evidence-amendment")) errors.push(`${label}: closed must never transition to another status`);
        else if (event.evidence.previousClosureCommit !== closureCommitById.get(event.id)) errors.push(`${label}: previousClosureCommit does not bind the prior closure`);
      } else if (FORWARD_TRANSITIONS[prior] !== event.to) errors.push(`${label}: ${prior} may only move to ${FORWARD_TRANSITIONS[prior]}`);
    }
    if (BACKLOG_STATUSES.includes(event.to)) stateById.set(event.id, event.to);
    if (event.to === "closed" && OID.test(asString(event?.evidence?.commit))) closureCommitById.set(event.id, event.evidence.commit);
    const externalProjectClosure = item?.metadata?.closure_repository?.startsWith("project:") && event.to === "closed";
    if (typeof commitExists === "function" && !externalProjectClosure && OID.test(asString(event?.evidence?.commit)) && !commitExists(event.evidence.commit)) {
      errors.push(`${label}: evidence.commit is not a reachable local Git commit`);
    }
    previousHash = typeof event.entryHash === "string" ? event.entryHash : previousHash;
  }
  for (const [id, item] of itemById) {
    const current = stateById.get(id);
    if (current === undefined) errors.push(`items: ${id} has no transition-ledger entry`);
    else if (current !== item.metadata.status) errors.push(`items: ${id} status does not match its final ledger transition`);
    if (item.metadata.status === "closed" && current === "closed") {
      const final = [...events].reverse().find((event) => event?.id === id);
      if (final?.evidence?.commit !== item.metadata.closure_commit) errors.push(`items: ${id} closure_commit must equal its final ledger evidence.commit`);
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
