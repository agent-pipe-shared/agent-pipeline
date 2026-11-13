// SPDX-License-Identifier: SUL-1.0
/**
 * Durable, data-sparse audit mirror (Candidate 20, G20-29, AC-108).
 *
 * The places the Pipeline writes its evidence to are private by design: the onboarding seed git-ignores /evidence/ (dispatch
 * records, the work-verify result) and /scratch/ (briefings), and a signed approval proof lives in the private approval store
 * under the Git common directory. A fresh clone therefore holds none of it. This module projects each completed dispatch, the
 * work-verify result of a candidate and each approval's PUBLIC proof reference into small tracked files under `audit/`, plus one
 * auditor index (`audit/index.json`), so that a fresh clone plus the index reaches every record without any private agent store.
 *
 * Data-sparse by construction: every entry is built from a closed list of fields (digests, ids, labels, counts, repository-relative
 * paths). Report prose, transcripts, prompts, absolute host paths and private keys have no field to land in, and `check` scans
 * every tracked file for them again. The signed payload is never touched: the entry only copies the public proof object (schema,
 * signed-payload digest, key reference, PUBLIC key, signature) and records its digest.
 *
 * `sync` is idempotent and write-ahead: it plans every entry first and refuses (writing nothing) when an existing entry would
 * change, because a mirrored entry is evidence, not a cache. `check` is read-only, works on a fresh clone, and gives every finding
 * a code and a runnable repair. Neither signs, consumes a proof, or runs git beyond `ls-files`.
 */
import { createHash, verify as cryptoVerify } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { denyPrivateAbsolutePaths, isTerminalOutcome, maskPrivateAbsolutePaths, validateDispatchRecord } from "./dispatch-record.mjs";
import { traceHumanApprovals } from "./human-approval-trace.mjs";
import { canonical } from "./po-approval-proof.mjs";

export const AUDIT_HOME = "audit";
export const AUDIT_INDEX_PATH = `${AUDIT_HOME}/index.json`;
export const AUDIT_INDEX_SCHEMA = "pipeline.audit-index.v1";
export const DURABLE_ENTRY_SCHEMAS = Object.freeze({
  dispatch: "pipeline.durable-dispatch-evidence.v1",
  verify: "pipeline.durable-verify-evidence.v1",
  approval: "pipeline.durable-approval-reference.v1",
});
export const DURABLE_EVIDENCE_SCRIPT = fileURLToPath(new URL("../scripts/durable-evidence.mjs", import.meta.url));

const FULL_COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ENTRY_PATH = /^audit\/[A-Za-z0-9._-]+\.json$/u;
const APPROVAL_KINDS = new Set(["push", "feature-package-reconcile", "deploy", "plan-approval"]);
const BRIEFING_BLOCK = /<!-- pipeline-native-goldfish-host-commit:[^\n]*\n([\s\S]*?)\n-->/u;
const PRIVATE_KEY_PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----/u;
const PRIVATE_FIELD = /^(?:report|text|transcript|prompt|privateKey|secret|token|password)$/iu;
const MAX_FILES = 2000;
const MAX_BYTES = 2 * 1024 * 1024;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
const sha = (value) => createHash("sha256").update(value).digest("hex");
/** Digest over LF-normalised bytes, so a checkout with core.autocrlf=true reads the same digest the writer produced. */
const lfSha = (bytes) => sha(Buffer.from(bytes.toString("utf8").replace(/\r\n/gu, "\n"), "utf8"));
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const text = (value) => (typeof value === "string" && value !== "" && !/[\0\r\n]/u.test(value) ? value : null);
const digest = (value) => (typeof value === "string" && SHA256.test(value) ? value : null);
const commit = (value) => (typeof value === "string" && FULL_COMMIT.test(value) ? value : null);
const syncRepair = (root) => `node ${DURABLE_EVIDENCE_SCRIPT} sync --root ${root}`;

function readBounded(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) fail("AUDIT-SOURCE-INVALID", "not a bounded regular file");
  return readFileSync(path);
}
function listNames(dir, pattern) {
  try { return readdirSync(dir).filter((name) => pattern.test(name)).sort().slice(0, MAX_FILES); } catch { return []; }
}

// ---- projections (pure) ----------------------------------------------------------------------------------------------------------

export function dispatchEntry(record, source, briefing) {
  const kind = record.outcomeClassification?.kind ?? null;
  return {
    schema: DURABLE_ENTRY_SCHEMAS.dispatch, taskId: record.taskId, recordSchema: record.schema, runner: record.runner ?? null,
    agentType: record.agentType, model: record.model, effort: record.effort, rulesetSha: record.rulesetSha, dispatcher: record.dispatcher,
    candidateCommit: record.candidateCommit, commits: [...record.commits], outcome: record.outcome, outcomeKind: kind,
    // The label is a projection of what the writer already enforced: a v4 authored-commit record is only publishable through the
    // host-observed route; the attested kind only through the orchestrator route; a v3 record carries no such label.
    assurance: record.schema === "pipeline.dispatch-record.v4" ? (kind === "authored-commit" ? "host-observed" : kind) : "recorded-unlabelled",
    resultSha256: record.resultSha256 ?? null, changedFiles: [...(record.report?.changedFiles ?? [])],
    criticDisposition: record.criticRequired ? "required" : record.criticSkip ? "skipped" : null,
    briefing, source,
  };
}

export function verifyEntry(bytes, source) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("AUDIT-SOURCE-INVALID", "the work-verify result is not JSON"); }
  if (value?.schema !== "pipeline.verify-evidence.v0" || commit(value.commit) === null || !Array.isArray(value.steps)) fail("AUDIT-SOURCE-INVALID", "the work-verify result is not a pipeline.verify-evidence.v0 record bound to a commit");
  const failedSteps = value.steps.filter((step) => step?.exitCode !== 0).map((step) => text(step?.name) ?? "?").slice(0, 50);
  let command = text(value.command);
  try { denyPrivateAbsolutePaths(command, "command"); } catch { command = null; }
  return {
    schema: DURABLE_ENTRY_SCHEMAS.verify, commit: value.commit, tree: commit(value.tree),
    project: /^[A-Za-z0-9._-]{1,128}$/u.test(value.project ?? "") ? value.project : null, command,
    binding: text(value.candidate?.binding), startedAt: text(value.startedAt), finishedAt: text(value.finishedAt),
    stepCount: value.steps.length, failedSteps, passed: value.steps.length > 0 && failedSteps.length === 0, source,
  };
}

/** `row` is one row of the read-only human-approval trace; the trace's own verdict is deliberately not copied (it changes with trust anchors). */
export function approvalEntry(row) {
  if (!APPROVAL_KINDS.has(row?.kind)) return null;
  const proof = row.proof !== null && typeof row.proof === "object" ? structuredClone(row.proof) : null;
  if (proof !== null && (sha(canonical(proof)) !== row.proofSha256 || proof.intentSha256 !== row.intentSha256)) fail("AUDIT-PROOF-INCONSISTENT", `the ${row.kind} proof does not hash to the digest the approval record names`);
  return {
    schema: DURABLE_ENTRY_SCHEMAS.approval, kind: row.kind, mode: text(row.mode), forCommit: commit(row.forCommit), approvedAt: text(row.approvedAt), approvedBy: text(row.by),
    intentSha256: digest(row.intentSha256), proofSha256: digest(row.proofSha256), keyReference: text(row.keyReference), publicKeySha256: digest(row.publicKeySha256), proof,
  };
}

/** The index row a file projects to (shared by the index rebuild and the check), or null for a file that is not a recognised entry. */
function rowFor(path, value, bytes) {
  const stem = path.slice(AUDIT_HOME.length + 1, -".json".length);
  const common = { path, sha256: sha(bytes) };
  if (value?.schema === DURABLE_ENTRY_SCHEMAS.dispatch) return { kind: "dispatch", id: value.taskId, ...common, commit: value.candidateCommit };
  if (value?.schema === DURABLE_ENTRY_SCHEMAS.verify) return { kind: "verify", id: stem, ...common, commit: value.commit };
  if (value?.schema === DURABLE_ENTRY_SCHEMAS.approval) return { kind: "approval", id: stem, ...common, commit: value.forCommit };
  return null;
}

// ---- sources ---------------------------------------------------------------------------------------------------------------------

function readDispatchSources(root) {
  const completed = []; const skipped = [];
  for (const name of listNames(join(root, "evidence"), /^dispatch-record-[A-Za-z0-9._-]+\.json$/u)) {
    const path = `evidence/${name}`;
    try {
      const bytes = readBounded(join(root, path));
      const parsed = JSON.parse(bytes.toString("utf8"));
      if (!isTerminalOutcome(parsed?.outcome)) continue;
      completed.push({ path, bytes, record: validateDispatchRecord(parsed) });
    } catch (error) { skipped.push({ path, reason: error?.code ?? "AUDIT-SOURCE-INVALID" }); }
  }
  return { completed, skipped };
}

/** Briefings are git-ignored scratch files; only their digest is durable. A briefing is bound to a dispatch by the id in its own marker block. */
function scanBriefings(root) {
  const found = new Map();
  for (const name of listNames(join(root, "scratch"), /\.md$/u)) {
    try {
      const bytes = readBounded(join(root, "scratch", name));
      const block = BRIEFING_BLOCK.exec(bytes.toString("utf8"));
      const marker = block ? JSON.parse(block[1]) : null; const id = marker?.dispatchId;
      // C28: the text and the item the marker binds travel with the digest, for the close's own projection (the mirror above uses digest and path only).
      if (typeof id === "string") found.set(id, [...(found.get(id) ?? []), { sha256: sha(bytes), path: `scratch/${name}`, text: bytes.toString("utf8"), itemId: typeof marker?.itemDelivery?.itemId === "string" ? marker.itemDelivery.itemId : null }]);
    } catch { /* an unreadable or foreign scratch file is simply not a briefing */ }
  }
  return found;
}

// ---- C28 (AC-108, WSL run): the close's tracked, redacted projection of the dispatches ---------------------------------------------------
// Briefings and dispatch records stay untracked (scratch/ and evidence/ are ignored), so the tracked audit bundle could not show them. The close writes this ONE file into the
// feature's evidence directory; the audit bundle carries it as one artifact (one evidence item, so no item limit is reachable however many dispatches ran).
// Redaction reuses the existing rules and invents none: an absolute host path is masked by the dispatch-record rule, a credential-shaped text is left out by the provenance credential check.
// A text that cannot be carried is a typed gap per dispatch with the digest of the original bytes, never an omission. The private-identifier deny set of the neutral-leakage policy is built
// from the local machine by a script of its own and is not reachable here: the notes name that as not covered.
export const CLOSE_DISPATCH_PROJECTION_SCHEMA = "pipeline.close-dispatch-projection.v1";
const PROJECTION_MAX_DISPATCHES = 200;
const maskDeep = (value) => (typeof value === "string" ? maskPrivateAbsolutePaths(value) : Array.isArray(value) ? value.map(maskDeep) : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, maskDeep(entry)])) : value);
function projectedBriefing(record, hits) {
  if (hits.length > 1) return { status: "gap", code: "BRIEFING-AMBIGUOUS", sourceSha256: null, textSha256: null, text: null };
  const hit = hits[0];
  if (hit === undefined) { const attested = digest(record.attestation?.briefingSha256); return { status: "gap", code: attested === null ? "BRIEFING-NOT-FOUND" : "BRIEFING-TEXT-UNAVAILABLE", sourceSha256: attested, textSha256: null, text: null }; }
  // C28e (Codex test run, PO 2026-11-13): the briefing text is no longer copied into this tracked file. A briefing quotes the Spec and the
  // code, so its copy here raised a gitleaks finding (a public storage key name) AFTER the candidate had been scanned clean, in a file the
  // project cannot change and with no review route. The digest of the briefing bytes stays the durable, verifiable reference.
  return { status: "digest-only", code: null, sourceSha256: hit.sha256, textSha256: null, text: null };
}
/** `records` are validated terminal dispatch records (`{ record }`), `briefings` the map `scanBriefings` returns. A dispatch whose briefing names another feature's item is not this feature's. */
export function projectCloseDispatches({ featureId, records = [], briefings = new Map() } = {}) {
  const dispatches = []; const gaps = []; let omitted = 0;
  for (const { record } of [...records].sort((left, right) => (left.record.taskId < right.record.taskId ? -1 : left.record.taskId > right.record.taskId ? 1 : 0))) {
    const hits = briefings.get(record.taskId) ?? [];
    if (hits.some((hit) => typeof hit.itemId === "string" && !hit.itemId.startsWith(`${featureId}.`))) continue;
    if (dispatches.length >= PROJECTION_MAX_DISPATCHES) { omitted += 1; continue; }
    const { briefing: unusedBriefing, source: unusedSource, ...fields } = dispatchEntry(record, null, null);
    dispatches.push({ taskId: record.taskId, record: maskDeep(fields), briefing: projectedBriefing(record, hits) });
  }
  if (omitted > 0) gaps.push({ code: "DISPATCH-LIST-TRUNCATED", count: omitted });
  return { schema: CLOSE_DISPATCH_PROJECTION_SCHEMA, featureId, dispatches, gaps };
}
export function closeDispatchProjectionBytes(projection) { return jsonBytes(projection); }
/** The completed dispatch records and the briefings found in scratch/, for `projectCloseDispatches` (read-only). */
export function readCloseDispatchInputs(root) {
  return { records: readDispatchSources(resolve(root)).completed.map(({ record }) => ({ record })), briefings: scanBriefings(resolve(root)) };
}
function briefingFor(record, scanned) {
  if (digest(record.attestation?.briefingSha256) !== null) return { sha256: record.attestation.briefingSha256, path: null, source: "attestation" };
  const hits = scanned.get(record.taskId) ?? [];
  if (hits.length === 1) return { sha256: hits[0].sha256, path: hits[0].path, source: "scratch-briefing" };
  return { sha256: null, path: null, source: hits.length > 1 ? "ambiguous" : "none" };
}

function readVerifySource(root) {
  try {
    const bytes = readBounded(join(root, "evidence/verify-latest.json"));
    const entry = verifyEntry(bytes, { path: "evidence/verify-latest.json", sha256: sha(bytes) });
    return { name: `verify-${entry.commit.slice(0, 12)}-${entry.source.sha256.slice(0, 12)}.json`, entry };
  } catch (error) { return error?.code === "ENOENT" ? null : { skipped: { path: "evidence/verify-latest.json", reason: error?.code ?? "AUDIT-SOURCE-INVALID" } }; }
}

const defaultTrace = (root) => traceHumanApprovals({ repositoryRoot: root });

// ---- sync ------------------------------------------------------------------------------------------------------------------------

function publishAtomically(dir, name, bytes) {
  const temporary = join(dir, `.${name}.${process.pid}.tmp`);
  try { writeFileSync(temporary, bytes, { flag: "wx" }); renameSync(temporary, join(dir, name)); }
  catch (error) { rmSync(temporary, { force: true }); throw error; }
}

export function syncDurableEvidence({ root: rootArgument, trace = defaultTrace } = {}) {
  const root = resolve(rootArgument ?? "");
  const planned = new Map(); const skipped = []; const notes = [];
  const sources = readDispatchSources(root); skipped.push(...sources.skipped);
  const briefings = scanBriefings(root);
  for (const { path, bytes, record } of sources.completed) planned.set(`dispatch-${record.taskId}.json`, dispatchEntry(record, { path, sha256: sha(bytes) }, briefingFor(record, briefings)));
  const verify = readVerifySource(root);
  if (verify?.entry) planned.set(verify.name, verify.entry); else if (verify?.skipped) skipped.push(verify.skipped);
  try {
    for (const row of trace(root).rows ?? []) {
      try {
        const entry = approvalEntry(row);
        if (entry !== null) planned.set(`approval-${entry.kind}-${(entry.forCommit ?? "none").slice(0, 12)}-${sha(canonical(entry)).slice(0, 12)}.json`, entry);
      } catch (error) { skipped.push({ path: `approval:${row?.kind ?? "?"}`, reason: error?.code ?? "AUDIT-PROOF-INCONSISTENT" }); }
    }
  } catch (error) { notes.push(`no approval was mirrored: the approval trace was unavailable (${error?.code ?? "error"}); run sync again from a repository with a valid HEAD`); }

  const dir = join(root, AUDIT_HOME);
  const write = []; const unchanged = []; const conflicts = [];
  for (const [name, entry] of planned) {
    let existing = null;
    try { existing = readFileSync(join(dir, name)); } catch { /* not mirrored yet */ }
    let bytes = jsonBytes(entry);
    if (existing === null) { write.push([name, bytes]); continue; }
    if (entry.schema === DURABLE_ENTRY_SCHEMAS.dispatch && entry.briefing.sha256 === null) {
      // A briefing found earlier is never forgotten because the ignored scratch file is gone now.
      try { bytes = jsonBytes({ ...entry, briefing: JSON.parse(existing.toString("utf8")).briefing }); } catch { /* compared as is */ }
    }
    if (lfSha(existing) === sha(bytes)) unchanged.push(name); else conflicts.push(name);
  }
  if (conflicts.length > 0) {
    const first = conflicts[0];
    fail("AUDIT-ENTRY-DIFFERS", `the mirrored ${conflicts.map((name) => `${AUDIT_HOME}/${name}`).join(", ")} differ from what the sources project now; an entry is immutable evidence, so nothing was written. Repair: review the difference, then remove ${AUDIT_HOME}/${first} (git rm if it is committed) and run: ${syncRepair(root)}`);
  }
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const [name, bytes] of write) { publishAtomically(dir, name, bytes); written.push(`${AUDIT_HOME}/${name}`); }

  const rows = [];
  for (const name of listNames(dir, /^(?!index\.json$)[A-Za-z0-9._-]+\.json$/u)) {
    const path = `${AUDIT_HOME}/${name}`; const bytes = readFileSync(join(dir, name));
    let value = null; try { value = JSON.parse(bytes.toString("utf8")); } catch { /* left out of the index; check reports it */ }
    const row = rowFor(path, value, bytes); if (row !== null) rows.push(row);
  }
  rows.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const indexBytes = jsonBytes({ schema: AUDIT_INDEX_SCHEMA, entries: rows });
  let currentIndex = null; try { currentIndex = readFileSync(join(dir, "index.json")); } catch { /* first sync */ }
  if (currentIndex === null || lfSha(currentIndex) !== sha(indexBytes)) { publishAtomically(dir, "index.json", indexBytes); written.push(AUDIT_INDEX_PATH); }
  return { written, unchanged: unchanged.map((name) => `${AUDIT_HOME}/${name}`), skipped, notes,
    index: { path: AUDIT_INDEX_PATH, sha256: sha(indexBytes), entries: rows.length } };
}

// ---- check -----------------------------------------------------------------------------------------------------------------------

function scanPrivate(value, path = "") {
  if (typeof value === "string") {
    if (PRIVATE_KEY_PEM.test(value)) return `${path || "value"} holds private key material`;
    try { denyPrivateAbsolutePaths(value, path || "value"); } catch { return `${path || "value"} holds an absolute host path`; }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  for (const [key, entry] of Object.entries(value)) {
    if (PRIVATE_FIELD.test(key)) return `${path}.${key} is a field this mirror never carries`;
    const found = scanPrivate(entry, `${path}.${key}`); if (found !== null) return found;
  }
  return null;
}
function proofFinding(entry) {
  if (entry.proof === null) return null;
  if (sha(canonical(entry.proof)) !== entry.proofSha256 || entry.proof.intentSha256 !== entry.intentSha256) return "the stored proof does not hash to the digest the entry names";
  try {
    if (!cryptoVerify(null, Buffer.from(entry.intentSha256, "utf8"), entry.proof.publicKey, Buffer.from(entry.proof.signatureBase64, "base64"))) return "the stored signature does not verify over the signed-payload digest";
  } catch { return "the stored proof is not a verifiable Ed25519 signature"; }
  return null;
}

export function checkDurableEvidence({ root: rootArgument, requireTracked = true } = {}) {
  const root = resolve(rootArgument ?? "");
  const findings = [];
  const add = (code, path, message, repair) => findings.push({ code, path, message, repair });
  const repairSync = syncRepair(root);
  let tracked = null;
  if (requireTracked) {
    const listing = spawnSync("git", ["-C", root, "ls-files", "--", AUDIT_HOME], { encoding: "utf8", timeout: 10000, shell: false });
    if (listing.status === 0) tracked = new Set(listing.stdout.split("\n").filter(Boolean));
    else add("AUDIT-GIT-UNAVAILABLE", AUDIT_HOME, "git could not list the tracked files, so durability cannot be shown", "run the check inside a Git working tree, or pass no tracking requirement");
  }
  const trackingFinding = (path) => { if (tracked !== null && !tracked.has(path)) add("AUDIT-NOT-TRACKED", path, `${path} exists but is not tracked, so a fresh clone would not have it`, `git add -- ${path}, then commit it`); };

  let index = null;
  try {
    const bytes = readBounded(join(root, AUDIT_INDEX_PATH));
    index = JSON.parse(bytes.toString("utf8"));
    if (index?.schema !== AUDIT_INDEX_SCHEMA || !Array.isArray(index.entries)) fail("AUDIT-INDEX-INVALID", "not an index");
    trackingFinding(AUDIT_INDEX_PATH);
  } catch (error) {
    const missing = error?.code === "ENOENT";
    add(missing ? "AUDIT-INDEX-MISSING" : "AUDIT-INDEX-INVALID", AUDIT_INDEX_PATH, missing ? "there is no auditor index" : "the auditor index is not a valid index", missing ? repairSync : `remove ${AUDIT_INDEX_PATH}, then run: ${repairSync}`);
    index = null;
  }

  const entries = []; const listed = new Set();
  for (const row of index?.entries ?? []) {
    const path = typeof row?.path === "string" ? row.path : "";
    if (!ENTRY_PATH.test(path) || path === AUDIT_INDEX_PATH || !Object.hasOwn(DURABLE_ENTRY_SCHEMAS, row.kind) || digest(row.sha256) === null) { add("AUDIT-INDEX-INVALID", path || AUDIT_INDEX_PATH, "an index row is malformed", `remove ${AUDIT_INDEX_PATH}, then run: ${repairSync}`); continue; }
    listed.add(path);
    let bytes;
    try { bytes = readBounded(join(root, path)); } catch { add("AUDIT-ENTRY-MISSING", path, `${path} is listed in the index but is not in this tree`, `git checkout -- ${path} (or, if it was never committed, run: ${repairSync})`); continue; }
    trackingFinding(path);
    if (lfSha(bytes) !== row.sha256) add("AUDIT-DIGEST-MISMATCH", path, `${path} no longer matches the digest the index names`, `git checkout -- ${path} to restore the committed bytes; if the entry was replaced on purpose, remove it and run: ${repairSync}`);
    let value = null;
    try { value = JSON.parse(bytes.toString("utf8")); } catch { add("AUDIT-ENTRY-INVALID", path, `${path} is not JSON`, `git checkout -- ${path}`); continue; }
    const projected = rowFor(path, value, Buffer.from(bytes.toString("utf8").replace(/\r\n/gu, "\n"), "utf8"));
    if (projected === null || projected.kind !== row.kind || projected.id !== row.id || projected.commit !== row.commit) add("AUDIT-ENTRY-INVALID", path, `${path} is not the ${row.kind} entry the index describes`, `remove ${AUDIT_INDEX_PATH}, then run: ${repairSync}`);
    const privateFinding = scanPrivate(value);
    if (privateFinding !== null) add("AUDIT-PRIVATE-CONTENT", path, `${path}: ${privateFinding}`, `remove ${path} and the private content's source, then run: ${repairSync}`);
    const proof = value?.schema === DURABLE_ENTRY_SCHEMAS.approval ? proofFinding(value) : null;
    if (proof !== null) add("AUDIT-PROOF-INVALID", path, `${path}: ${proof}`, `git checkout -- ${path}; if the proof was never valid, the approval must be signed again`);
    entries.push({ kind: row.kind, id: row.id, path, sha256: row.sha256, commit: row.commit });
  }
  for (const name of listNames(join(root, AUDIT_HOME), /^(?!index\.json$)[A-Za-z0-9._-]+\.json$/u)) {
    const path = `${AUDIT_HOME}/${name}`;
    if (!listed.has(path)) add("AUDIT-INDEX-STALE", path, `${path} is in audit/ but not in the index`, `${repairSync} (it rederives the index; a file that is not a recognised entry must be removed first)`);
  }
  // A completed dispatch whose private record is on this machine but not mirrored is the exact gap this module closes.
  const mirrored = new Set(entries.filter((entry) => entry.kind === "dispatch").map((entry) => entry.id));
  for (const { path, record } of readDispatchSources(root).completed) {
    if (!mirrored.has(record.taskId)) add("AUDIT-UNSYNCED", path, `the completed dispatch ${record.taskId} has no tracked mirror`, repairSync);
  }
  const verify = readVerifySource(root);
  if (verify?.entry && !listed.has(`${AUDIT_HOME}/${verify.name}`)) add("AUDIT-UNSYNCED", "evidence/verify-latest.json", "the work-verify result has no tracked mirror", repairSync);
  return { ok: findings.length === 0, findings, entries };
}
