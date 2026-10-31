#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Generated audit index: one machine-readable record of the source, commit and
// gate digests behind a change, with every step that cannot be evidenced named
// explicitly as missing (never silently omitted).
//
// `buildAuditIndex` is pure and read-only: it hashes files the caller names, runs
// no git command and writes nothing. Transcript text is deliberately not included
// (data minimisation); only digests and presence are indexed.
//
// AC-175 part A (D209/D210) adds, on top of that, a read-only collector
// (`collectAuditIndex`, verb `collect`) that gathers a feature's own records, a
// sanitized auditor manifest (paths and digests only, screened with the
// repository's public-evidence privacy screen) and the one writer
// (`writeAuditIndexEvidence`) the close course calls on the feature-close-prepared
// transition. The index reports; it never blocks: a missing source is a named
// missing step, never a refusal.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { hasPrivateTransferContent } from "../lib/bound-artifact-transfer.mjs";
import { ensurePrivateDirectory, writePrivateJsonAtomic } from "../lib/private-boundary.mjs";
import { LEGACY_STATE, NEUTRAL_STATE, resolveProjectAuthorityPaths } from "../lib/project-authority.mjs";

export const AUDIT_INDEX_SCHEMA = "pipeline.audit-index.v1";
export const AUDIT_INDEX_MANIFEST_SCHEMA = "pipeline.audit-index-manifest.v1";
export const AUDIT_INDEX_FILE = "audit-index.json";

const COMMIT_RE = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/u;
const SLICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FEATURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
// What a manifest or collected path may look like: repository-relative, plain characters only. Anything else
// (absolute, drive letter, home, space, control character) never enters the index.
const REPO_PATH = /^[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/u;
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_CANDIDATE_EVIDENCE = 8;

function sha256Of(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Resolve a repository-relative path; anything escaping the root is refused.
function digestRelative(rootDir, rel) {
  if (typeof rel !== "string" || rel === "" || isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) {
    return { status: "refused", sha256: null };
  }
  const root = resolve(rootDir);
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) return { status: "refused", sha256: null };
  try {
    if (!statSync(abs).isFile()) return { status: "missing", sha256: null };
    return { status: "present", sha256: sha256Of(readFileSync(abs)) };
  } catch {
    return { status: "missing", sha256: null };
  }
}

function entries(rootDir, list, idKey) {
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      const spec = typeof item === "string" ? { [idKey]: item, path: item } : item;
      let digest = digestRelative(rootDir, spec?.path);
      // A record that binds a digest (a dispatch record's Critic receipt, an approval's PRD/Spec bytes) is compared with
      // the file: present bytes that differ are named, not trusted.
      if (digest.status === "present" && typeof spec?.expectedSha256 === "string" && spec.expectedSha256 !== digest.sha256) {
        digest = { status: "digest-mismatch", sha256: digest.sha256 };
      }
      return { [idKey]: String(spec?.[idKey] ?? spec?.path ?? ""), path: spec?.path ?? null, ...digest };
    })
    .sort((a, b) => (a[idKey] < b[idKey] ? -1 : a[idKey] > b[idKey] ? 1 : 0));
}

/**
 * @param {object} input
 * @param {string} input.rootDir repository root
 * @param {string[]} [input.sources] repo-relative source/spec/approval paths
 * @param {string} [input.commit] 40-hex commit id
 * @param {{id:string,path:string,expectedSha256?:string}[]} [input.gates] gate evidence files
 * @param {{step:string,reason:string}[]} [input.missing] steps the caller could not even name a file for
 * @returns {object} index; `complete` is true only when no step is missing
 */
export function buildAuditIndex({ rootDir, sources, commit, gates, missing } = {}) {
  if (typeof rootDir !== "string" || rootDir === "") throw new TypeError("rootDir is required");
  const sourceEntries = entries(rootDir, sources, "path");
  const gateEntries = entries(rootDir, gates, "id");
  const commitEntry =
    typeof commit === "string" && COMMIT_RE.test(commit)
      ? { sha: commit, status: "present" }
      : { sha: null, status: commit === undefined || commit === null || commit === "" ? "missing" : "refused" };

  const missingSteps = [];
  if (sourceEntries.length === 0) missingSteps.push({ step: "sources", reason: "none-declared" });
  for (const s of sourceEntries) {
    if (s.status !== "present") missingSteps.push({ step: `source:${s.path}`, reason: s.status });
  }
  if (commitEntry.status !== "present") missingSteps.push({ step: "commit", reason: commitEntry.status });
  if (gateEntries.length === 0) missingSteps.push({ step: "gates", reason: "none-declared" });
  for (const g of gateEntries) {
    if (g.status !== "present") missingSteps.push({ step: `gate:${g.id}`, reason: g.status });
  }
  for (const m of Array.isArray(missing) ? missing : []) {
    if (typeof m?.step === "string" && typeof m?.reason === "string") missingSteps.push({ step: m.step, reason: m.reason });
  }

  return {
    schema: AUDIT_INDEX_SCHEMA,
    sources: sourceEntries,
    commit: commitEntry,
    gates: gateEntries,
    missingSteps,
    complete: missingSteps.length === 0,
  };
}

const isRepoPath = (value) => typeof value === "string" && value.length <= 240 && REPO_PATH.test(value)
  && value.split("/").every((part) => part !== "." && part !== "..");
const hex64 = (value) => (typeof value === "string" && HEX64.test(value) ? value : undefined);

/** A small JSON file under the root, or a typed reason; never throws and never reads outside the root. */
function readSmallJson(rootDir, rel) {
  if (!isRepoPath(rel)) return { status: "refused", value: null };
  const root = resolve(rootDir);
  const abs = resolve(root, rel);
  if (!abs.startsWith(root + sep)) return { status: "refused", value: null };
  try {
    const info = statSync(abs);
    if (!info.isFile()) return { status: "missing", value: null };
    if (info.size > MAX_JSON_BYTES) return { status: "invalid", value: null };
    return { status: "present", value: JSON.parse(readFileSync(abs, "utf8")) };
  } catch (error) {
    return { status: error?.code === "ENOENT" || error?.code === "ENOTDIR" ? "missing" : "invalid", value: null };
  }
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Gathers a feature's own records into `buildAuditIndex` inputs (read-only, no git): the PRD, Spec and Result the State
 * binds, the plan approval's PRD/Spec digests, the dispatch records of the feature's delivery course, the Critic receipt
 * each record binds and the passing candidate Verify evidence of the feature package. Whatever cannot be found is a named
 * entry of `missing`, whatever would not be a clean repository-relative path never enters the index.
 */
export function collectAuditIndexInputs({ rootDir, featureId, state } = {}) {
  const sources = [];
  const gates = [];
  const missing = [];
  const feature = isObject(state) ? state.activeFeature : null;
  if (!isObject(feature) || feature.id !== featureId) {
    missing.push({ step: "feature", reason: "not-active" });
    return { sources, gates, missing };
  }
  const addSource = (path, step) => {
    if (isRepoPath(path)) sources.push(path);
    else missing.push({ step, reason: path === undefined || path === null ? "not-declared" : "path-not-repo-relative" });
  };
  const approval = isObject(state.planApproval?.poGateAuthority) ? state.planApproval.poGateAuthority : null;
  const authority = isObject(state.continuity?.authority) ? state.continuity.authority : {};
  const planPath = feature.planPath;
  const specPath = approval?.specPath ?? authority.spec?.path;
  const resultPath = authority.result?.path ?? null;

  addSource(planPath, "source:prd");
  addSource(specPath, "source:spec");
  if (resultPath === null) missing.push({ step: "source:result", reason: "not-bound" });
  else addSource(resultPath, "source:result");

  if (approval === null) missing.push({ step: "gate:plan-approval", reason: "missing" });
  else {
    if (isRepoPath(planPath)) gates.push({ id: "plan-approval:plan", path: planPath, expectedSha256: hex64(approval.planSha256) });
    if (isRepoPath(specPath)) gates.push({ id: "plan-approval:spec", path: specPath, expectedSha256: hex64(approval.specSha256) });
  }

  if (isRepoPath(planPath)) {
    const directory = dirname(planPath);
    const coursePath = directory === "." ? "slice-queue.json" : `${directory}/slice-queue.json`;
    const course = readSmallJson(rootDir, coursePath);
    if (course.status === "missing") missing.push({ step: "dispatch-records", reason: "no-delivery-course" });
    else if (course.status !== "present" || !Array.isArray(course.value?.slices)) missing.push({ step: "dispatch-records", reason: "delivery-course-unreadable" });
    else if (course.value.feature !== featureId) missing.push({ step: "dispatch-records", reason: "delivery-course-foreign" });
    else {
      sources.push(coursePath);
      const ids = course.value.slices
        .filter((slice) => isObject(slice) && typeof slice.id === "string" && SLICE_ID.test(slice.id) && slice.state !== "cancelled" && slice.state !== "deferred")
        .map((slice) => slice.id)
        .sort();
      for (const id of ids) {
        const recordPath = `evidence/dispatch-record-${id}.json`;
        gates.push({ id: `dispatch:${id}`, path: recordPath });
        const record = readSmallJson(rootDir, recordPath);
        if (record.status !== "present" || !isObject(record.value)) continue;
        const receipt = record.value.criticEvidence;
        if (isObject(receipt)) {
          if (isRepoPath(receipt.path)) gates.push({ id: `critic:${id}`, path: receipt.path, expectedSha256: hex64(receipt.sha256) });
          else missing.push({ step: `gate:critic:${id}`, reason: "path-not-repo-relative" });
        } else if (record.value.criticRequired !== undefined) {
          missing.push({ step: `gate:critic:${id}`, reason: "missing" });
        }
      }
    }
  }

  if (!isRepoPath(resultPath)) missing.push({ step: "gate:verify", reason: "no-result-bound" });
  else {
    const directory = dirname(resultPath);
    const manifest = readSmallJson(rootDir, directory === "." ? "lifecycle.json" : `${directory}/lifecycle.json`);
    if (manifest.status === "missing") missing.push({ step: "gate:verify", reason: "no-feature-package" });
    else {
      const candidates = (manifest.status === "present" && Array.isArray(manifest.value?.artifacts) ? manifest.value.artifacts : [])
        .filter((artifact) => isObject(artifact) && artifact.class === "candidate-evidence" && isRepoPath(artifact.path))
        .slice(0, MAX_CANDIDATE_EVIDENCE);
      const passing = candidates.find((artifact) => {
        const evidence = readSmallJson(rootDir, artifact.path);
        return evidence.status === "present" && isObject(evidence.value) && evidence.value.schema === "pipeline.verify-evidence.v0" && evidence.value.exitCode === 0;
      });
      if (passing) gates.push({ id: "verify", path: passing.path, expectedSha256: hex64(passing.sha256) });
      else missing.push({ step: "gate:verify", reason: candidates.length === 0 ? "no-candidate-evidence" : "no-passing-candidate-evidence" });
    }
  }
  return { sources, gates, missing };
}

/**
 * The sanctioned auditor manifest (D152 clause): paths and digests of the PRESENT entries only. No file body, no absolute
 * path, no free text. Each entry must be a plain repository-relative path and pass the repository's public-evidence privacy
 * screen (`hasPrivateTransferContent`); an entry that does not is counted in `held`, never listed.
 */
export function buildAuditManifest(index) {
  const entriesOut = [];
  let held = 0;
  const take = (kind, id, path, sha256, status) => {
    if (status !== "present" || typeof sha256 !== "string") return;
    const entry = { kind, id: String(id), path, sha256 };
    if (isRepoPath(path) && HEX64.test(sha256) && !hasPrivateTransferContent(Buffer.from(JSON.stringify(entry), "utf8"))) entriesOut.push(entry);
    else held += 1;
  };
  for (const s of Array.isArray(index?.sources) ? index.sources : []) take("source", s?.path, s?.path, s?.sha256, s?.status);
  for (const g of Array.isArray(index?.gates) ? index.gates : []) take("gate", g?.id, g?.path, g?.sha256, g?.status);
  entriesOut.sort((a, b) => (a.kind + a.id < b.kind + b.id ? -1 : a.kind + a.id > b.kind + b.id ? 1 : 0));
  return { schema: AUDIT_INDEX_MANIFEST_SCHEMA, entries: entriesOut, held };
}

/** Collect the feature's records, build the index and attach the sanitized manifest. Never throws for a missing source. */
export function collectAuditIndex({ rootDir, featureId, state, commit } = {}) {
  const inputs = collectAuditIndexInputs({ rootDir, featureId, state });
  const index = buildAuditIndex({ rootDir, sources: inputs.sources, gates: inputs.gates, commit, missing: inputs.missing });
  return { ...index, manifest: buildAuditManifest(index) };
}

/**
 * The one writer: the index as `audit-index.json` in a private directory (the coordinator-private close evidence
 * directory when the close course calls it). An index the privacy screen rejects is held and not written. The result
 * names the file and its digest, never a directory.
 */
export function writeAuditIndexEvidence({ directory, index } = {}) {
  const text = `${JSON.stringify(index, null, 2)}\n`;
  if (hasPrivateTransferContent(Buffer.from(text, "utf8"))) return { status: "held", code: "BT-PRIVACY" };
  const target = join(ensurePrivateDirectory(directory), AUDIT_INDEX_FILE);
  writePrivateJsonAtomic(target, index);
  return {
    status: "written",
    file: AUDIT_INDEX_FILE,
    sha256: sha256Of(readFileSync(target)),
    complete: index.complete === true,
    missingSteps: Array.isArray(index.missingSteps) ? index.missingSteps.length : 0,
  };
}

/**
 * The summary of an index already written into `directory`, read back from its own bytes (null when there is none or it is
 * unreadable). A replay of the close transition reports the file it wrote the first time instead of re-collecting against a
 * later State, which would overwrite earlier evidence under a different digest.
 */
export function readAuditIndexEvidence({ directory } = {}) {
  try {
    const bytes = readFileSync(join(resolve(directory), AUDIT_INDEX_FILE));
    const index = JSON.parse(bytes.toString("utf8"));
    if (!isObject(index) || index.schema !== AUDIT_INDEX_SCHEMA) return null;
    return {
      status: "written",
      file: AUDIT_INDEX_FILE,
      sha256: sha256Of(bytes),
      complete: index.complete === true,
      missingSteps: Array.isArray(index.missingSteps) ? index.missingSteps.length : 0,
    };
  } catch {
    return null;
  }
}

function readStateForCollect(rootDir) {
  try {
    const authority = resolveProjectAuthorityPaths({ rootDir });
    const rel = authority.status === "ready" ? authority.state : (existsSync(join(rootDir, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
    const value = JSON.parse(readFileSync(join(rootDir, rel), "utf8"));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function refuseCollect(code, message) {
  process.stdout.write(`${JSON.stringify({ schema: "pipeline.audit-index.refusal.v1", ok: false, code, message }, null, 2)}\n`);
  process.exitCode = 2;
}

function collectMain(argv) {
  const flags = { "--root": "root", "--feature-id": "featureId", "--commit": "commit" };
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = flags[argv[i]];
    if (key === undefined || typeof argv[i + 1] !== "string" || argv[i + 1] === "" || Object.hasOwn(values, key)) {
      return refuseCollect("AUDIT-INDEX-ARGS", "collect takes --root <dir> --feature-id <id> [--commit <40-hex>], each once");
    }
    values[key] = argv[i + 1];
  }
  if (!FEATURE_ID.test(values.featureId ?? "")) return refuseCollect("AUDIT-INDEX-ARGS", "collect needs --feature-id <the feature id>");
  let rootDir;
  try { rootDir = realpathSync(resolve(values.root ?? process.cwd())); } catch { return refuseCollect("AUDIT-INDEX-ARGS", "--root cannot be resolved to a directory"); }
  const state = readStateForCollect(rootDir);
  if (state === null) return refuseCollect("AUDIT-INDEX-STATE-UNREADABLE", "the project State could not be read under --root; repair: run this from the project root or pass --root");
  const index = collectAuditIndex({ rootDir, featureId: values.featureId, state, commit: values.commit });
  // A report, not a gate: exit 0 whenever the index was generated; `complete` carries the verdict.
  process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
}

export function main(argv = process.argv.slice(2)) {
  if (argv[0] === "collect") return collectMain(argv.slice(1));
  const args = { sources: [], gates: [], root: process.cwd(), commit: undefined };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === "--root") args.root = value;
    else if (flag === "--commit") args.commit = value;
    else if (flag === "--source") args.sources.push(value);
    else if (flag === "--gate") {
      const eq = typeof value === "string" ? value.indexOf("=") : -1;
      args.gates.push(eq > 0 ? { id: value.slice(0, eq), path: value.slice(eq + 1) } : { id: value, path: value });
    } else {
      process.stderr.write(`unknown argument: ${flag}\n`);
      process.exitCode = 2;
      return;
    }
  }
  const index = buildAuditIndex({ rootDir: args.root, sources: args.sources, commit: args.commit, gates: args.gates });
  process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
  process.exitCode = index.complete ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) main();
