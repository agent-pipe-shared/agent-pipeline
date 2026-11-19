#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * ALF-G4C: the producer of design review receipts (ADR-0085 U2).
 *
 * The PO's design signature binds the review receipts, so a receipt must not be hand-written. This
 * command is the one sanctioned way to make one. It reads every source (PRD, Spec, companions), the
 * Critic report and, for the delta round, the previous receipt FROM DISK, and takes the rest from
 * places the caller cannot choose:
 *   reviewedAt       the clock, at production time (injectable only through the exported API)
 *   reviewer.runner  the runtime signal in the environment (CLAUDECODE, ANTIGRAVITY_AGENT or
 *                    AI_AGENT=antigravity, CODEX_SESSION_ID or CODEX_THREAD_ID); no signal refuses
 *   reviewer.model   D247: on Claude the model the host recorded for the readiness-reviewer dispatch whose
 *                    returned text is this report (lib/design-review-observation.mjs; `export-report` writes
 *                    that text), stamped with `reviewerObservation`; otherwise `unknown` and `unobserved`.
 *                    It is never read from an agent profile or supplied by the caller (W7).
 *   every sha256     the bytes of the file on disk
 * There is deliberately no flag for a timestamp, a hash, a runner or a model: such a flag is refused
 * as DRC-FORBIDDEN-FLAG. The bytes are the library's own canonical output (createDesignReviewReceipt)
 * and are written with exclusive create, so an existing receipt is never overwritten.
 *
 * Refusals are typed. Library codes (DRR-*) pass through unchanged; this command adds DRC-USAGE,
 * DRC-UNKNOWN-FLAG, DRC-FORBIDDEN-FLAG, DRC-PATH-UNSAFE, DRC-OUT-EXISTS, DRC-OUT-PARENT-MISSING,
 * DRC-FILE-MISSING, DRC-FILE-UNSAFE, DRC-NO-RUNNER, DRC-CLOCK,
 * DRC-REPO-INVALID, DRC-WRITE-FAILED, DRC-OBSERVATION-REPLAYED and DRC-INTERNAL; `export-report` adds DRC-OBSERVATION-STORE,
 * DRC-OBSERVATION-MISSING and DRC-OBSERVATION-AMBIGUOUS.
 *
 * Its pure counterpart is lib/design-review-receipt-write-guard.mjs, which recognises a receipt that
 * was written by hand instead.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";

import { createDesignReviewReceipt, describeDesignReviewFindingIdRefusal, DESIGN_REVIEW_UNOBSERVED_ASSURANCE } from "../lib/design-review-receipt.mjs";
import { consumeDesignReviewObservation, listUnexportedDesignReviewObservations, markDesignReviewObservationExported, readDesignReviewObservation, readLastUnobservedDesignReview } from "../lib/design-review-observation.mjs";
import { checkOpenFindingsAgainstReport, designReviewReportLines } from "../lib/design-review-report-sections.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";

export const DESIGN_REVIEW_RECEIPT_CREATE_SCHEMA = "pipeline.design-review-receipt-create.v1";

const USAGE = "Usage: design-review-receipt.mjs create --repo <repo-root> --feature <feature-id> --report <critic-report> --prd <prd> --spec <spec> "
  + "[--original-report <path>] [--companion <path>]... [--previous <receipt>] [--open-finding <id>]... [--sources-at <commit>] [--requested-route <route>] [--observed-identity <identity>] [--fallback-reason-code <RRP-code>] --out <receipt>\n"
  + "       design-review-receipt.mjs export-report --repo <repo-root> --out <report> [--observation <sha256>]\n"
  + "Every path is repo-relative. The review time, runner, reviewer model and all digests are derived, never supplied. On Claude the "
  + "reviewer model is read from the host's record of the readiness-reviewer dispatch, found by the report's digest (export-report "
  + "writes the returned text as the report); without one, and on another runner, the receipt says unobserved.";

export const OBSERVED_IDENTITY_UNKNOWN = "unknown";
export const REVIEWER_ROLE = "critic";
const OBSERVED_IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,127}$/u;
const REQUESTED_ROUTE_PATTERN = /^[\x21-\x7e]{1,128}$/u;
// The library's own feature-id shape (lib/design-review-receipt.mjs FEATURE_ID), used only to name the field in a DRR-SHAPE refusal.
const DESIGN_FEATURE_ID = /^[a-z][a-z0-9-]{0,63}$/u;

const SINGLE_FLAGS = new Map([
  ["repo", "repo"], ["feature", "featureId"], ["report", "reportPath"], ["prd", "prdPath"],
  ["spec", "specPath"], ["previous", "previousPath"], ["out", "outPath"],
  ["original-report", "originalReportPath"], ["requested-route", "requestedRoute"], ["observed-identity", "observedIdentity"],
  ["fallback-reason-code", "fallbackReasonCode"], ["sources-at", "sourcesAt"],
]);
// K128: the one fallback route name, as the canonical fallback result and the recovery state spell it.
const FALLBACK_ROUTE = "fallback-self-dispatch";
const FALLBACK_REASON_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,7}$/u;
const REPEATED_FLAGS = new Map([["companion", "companionPaths"], ["open-finding", "openFindingIds"]]);
const REQUIRED = ["repo", "feature", "report", "prd", "spec", "out"];
// A flag whose name asks for a value the producer derives (time, digest, runner, model) is named as such.
const DERIVED_VALUE_FLAG = /(?:time|date|stamp|reviewed|clock|now|sha|hash|digest|model|runner|reviewer)/iu;

const MAX_PATH_LENGTH = 240;
const DRIVE_PREFIX = /^[A-Za-z]:/u;

const refuse = (code, message) => ({ ok: false, code, message });

/** SafePath, as the receipt library defines it: 1-240 chars, repo-relative, no `.`, `..` or empty segment. */
function isSafePath(path) {
  if (typeof path !== "string" || path.length < 1 || path.length > MAX_PATH_LENGTH || path !== path.trim()) return false;
  if (path.includes("\\") || path.includes("\0")) return false;
  if (path.startsWith("/") || path.endsWith("/") || DRIVE_PREFIX.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

const isInside = (root, candidate) => candidate === root || candidate.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);

/**
 * The runner of the current runtime, from its own signal only. There is no fallback: an environment
 * with no recognised signal yields null and the command refuses. Precedence when signals coexist:
 * claude, then antigravity, then codex.
 */
export function detectRunner(env) {
  const source = env ?? {};
  if (source.CLAUDECODE === "1") return "claude";
  if (source.ANTIGRAVITY_AGENT === "1" || source.AI_AGENT === "antigravity") return "antigravity";
  const nonEmpty = (value) => typeof value === "string" && value.length > 0;
  if (nonEmpty(source.CODEX_SESSION_ID) || nonEmpty(source.CODEX_THREAD_ID)) return "codex";
  return null;
}

/** A regular, non-symlink file whose real path stays inside the repository; its bytes, or a refusal. */
function readBound(repoReal, path, role) {
  const absolute = join(repoReal, ...path.split("/"));
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return refuse("DRC-FILE-MISSING", `${role} file does not exist: ${path}`);
    return refuse("DRC-FILE-UNSAFE", `${role} file cannot be inspected: ${path}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return refuse("DRC-FILE-UNSAFE", `${role} must be a regular file, not a link or directory: ${path}`);
  try {
    if (!isInside(repoReal, realpathSync(absolute))) return refuse("DRC-FILE-UNSAFE", `${role} resolves outside the repository: ${path}`);
    return { ok: true, bytes: readFileSync(absolute) };
  } catch {
    return refuse("DRC-FILE-UNSAFE", `${role} file cannot be read: ${path}`);
  }
}

const SOURCES_AT_PATTERN = /^[0-9a-f]{7,40}$/u;

/**
 * C31a: the commit whose PRD, Spec and companion bytes the reviewer read. A receipt binds the bytes a review read; when the sources were
 * corrected after the review and before the receipt existed (the correction is committed, the next dispatch is blocked until the round has
 * a receipt), the working tree no longer holds them. `--sources-at <commit>` reads those bytes from git objects instead of restoring them
 * in the tree. The commit must be an ancestor of HEAD, so it names history of this branch, never an unrelated object.
 */
function resolveSourcesAt(repoReal, ref) {
  if (!SOURCES_AT_PATTERN.test(ref)) return refuse("DRC-SOURCES-AT-INVALID", "--sources-at takes a commit id of 7 to 40 lowercase hex digits (git log shows it)");
  const git = (args) => execFileSync("git", args, { cwd: repoReal, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 20 }).trim();
  let commit;
  try { commit = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]); } catch { return refuse("DRC-SOURCES-AT-INVALID", `--sources-at ${ref} is not a commit of this repository`); }
  try { git(["merge-base", "--is-ancestor", commit, "HEAD"]); } catch { return refuse("DRC-SOURCES-AT-INVALID", `--sources-at ${ref} is not an ancestor of HEAD; name the commit the reviewer read, from this branch's history`); }
  return { ok: true, commit };
}

/** The bytes of a file at a commit (a blob, never a link), or a refusal. */
function readBoundAt(repoReal, commit, path, role) {
  const git = (args) => execFileSync("git", args, { cwd: repoReal, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 << 20 });
  let entry;
  try { entry = execFileSync("git", ["ls-tree", commit, "--", path], { cwd: repoReal, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { entry = ""; }
  if (entry === "") return refuse("DRC-SOURCES-AT-MISSING", `${role} file ${path} does not exist at commit ${commit.slice(0, 12)}`);
  if (!/^100(?:644|755) blob /u.test(entry)) return refuse("DRC-FILE-UNSAFE", `${role} at commit ${commit.slice(0, 12)} must be a regular file, not a link or directory: ${path}`);
  try { return { ok: true, bytes: git(["show", `${commit}:${path}`]) }; } catch { return refuse("DRC-SOURCES-AT-MISSING", `${role} file ${path} cannot be read at commit ${commit.slice(0, 12)}`); }
}

// C32 (Claude greenfield 2026-11-19): the refusal printed the FILE path as "the output directory" and named no repair. It names the directory and the way out.
function missingParentMessage(outPath) {
  const directory = outPath.includes("/") ? outPath.slice(0, outPath.lastIndexOf("/")) : ".";
  return `the output directory does not exist: ${directory} (this command never creates one; create it by writing any file into it with the Write tool, or choose an existing directory such as the feature's own specs folder, then run the command again with --out ${outPath})`;
}

/** Resolve the output location: a new file in an existing directory inside the repository. */
function resolveOutput(repoReal, outPath) {
  const absolute = join(repoReal, ...outPath.split("/"));
  try {
    lstatSync(absolute);
    return refuse("DRC-OUT-EXISTS", `the output already exists and is never overwritten: ${outPath}; choose a new --out path (for example the same name with a -2 suffix) and run the command again`);
  } catch (error) {
    if (error?.code !== "ENOENT") return refuse("DRC-OUT-PARENT-MISSING", `the output directory is not usable: ${outPath}`);
  }
  try {
    if (!isInside(repoReal, realpathSync(dirname(absolute)))) return refuse("DRC-PATH-UNSAFE", `the output directory resolves outside the repository: ${outPath}`);
  } catch {
    return refuse("DRC-OUT-PARENT-MISSING", missingParentMessage(outPath));
  }
  return { ok: true, absolute };
}

const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** A sibling receipt that binds this report to other PRD or Spec bytes, or null. Unreadable siblings are not receipts and are skipped. */
function priorReceiptOfReport(repoReal, outPath, reportSha256, sources) {
  const directory = dirname(outPath) === "." ? "" : `${dirname(outPath)}/`;
  let names;
  try { names = readdirSync(join(repoReal, ...directory.split("/").filter(Boolean))); } catch { return null; }
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    let parsed;
    try { parsed = JSON.parse(readFileSync(join(repoReal, ...directory.split("/").filter(Boolean), name), "utf8")); } catch { continue; }
    if (typeof parsed?.report?.sha256 !== "string" || parsed.report.sha256 !== reportSha256 || typeof parsed?.sources?.prd?.sha256 !== "string") continue;
    if (parsed.sources.prd.sha256 !== sources.prd.sha256 || parsed.sources.spec?.sha256 !== sources.spec.sha256) return `${directory}${name}`;
  }
  return null;
}

/**
 * D247: one observed dispatch stamps one round. The receipt (the --previous one, or any in the target folder) that already
 * carries this observation's digest, else null; a delta round that reuses an earlier round's report is then refused.
 */
function receiptClaimingObservation(repoReal, outPath, previous, resultSha256) {
  const claims = (value) => value?.reviewerObservation?.resultSha256 === resultSha256;
  if (previous !== null) {
    try { if (claims(JSON.parse(Buffer.from(previous.bytes).toString("utf8")))) return previous.path; } catch { /* the library refuses a broken previous receipt */ }
  }
  const directory = dirname(outPath) === "." ? "" : `${dirname(outPath)}/`;
  let names;
  try { names = readdirSync(join(repoReal, ...directory.split("/").filter(Boolean))); } catch { return null; }
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    try { if (claims(JSON.parse(readFileSync(join(repoReal, ...directory.split("/").filter(Boolean), name), "utf8")))) return `${directory}${name}`; } catch { /* not a receipt */ }
  }
  return null;
}

/**
 * Produce a receipt from files on disk and write it with exclusive create.
 * `deps.now` exists for tests; no command-line flag reaches them.
 * @returns {{ ok: true, path: string, sha256: string, receipt: object } | { ok: false, code: string, message: string }}
 */
export function createReceiptFromDisk(input, deps = {}) {
  const { env = process.env, now = () => new Date() } = deps;
  const request = input ?? {};
  const companionPaths = request.companionPaths ?? [];
  const openFindingIds = request.openFindingIds ?? [];
  const previousPath = request.previousPath ?? null;
  const originalReportPath = request.originalReportPath ?? null;
  const sourcesAtRef = request.sourcesAt ?? null;
  if (sourcesAtRef !== null && typeof sourcesAtRef !== "string") return refuse("DRC-USAGE", "the request is malformed");
  const requestedRoute = request.requestedRoute ?? null;
  const observedIdentity = request.observedIdentity ?? null;
  const isStrings = (value) => Array.isArray(value) && value.every((entry) => typeof entry === "string");
  if (typeof request.repo !== "string" || request.repo === "" || typeof request.featureId !== "string"
    || !isStrings(companionPaths) || !isStrings(openFindingIds) || (previousPath !== null && typeof previousPath !== "string")) {
    return refuse("DRC-USAGE", "the request is malformed");
  }
  if (requestedRoute !== null && !(typeof requestedRoute === "string" && REQUESTED_ROUTE_PATTERN.test(requestedRoute))) {
    return refuse("DRC-USAGE", "the requested route must be 1-128 printable characters without spaces");
  }
  if (observedIdentity !== null && !(typeof observedIdentity === "string" && OBSERVED_IDENTITY_PATTERN.test(observedIdentity))) {
    return refuse("DRC-USAGE", "the observed identity is not a valid model identity");
  }
  // K128: a review that ran on the typed fallback-self-dispatch route says so in the receipt. The fallback names the route that
  // was requested, so a reason code without a requested route is a malformed request, not a receipt with half a record.
  const fallbackReasonCode = request.fallbackReasonCode ?? null;
  if (fallbackReasonCode !== null) {
    if (!(typeof fallbackReasonCode === "string" && FALLBACK_REASON_CODE_PATTERN.test(fallbackReasonCode))) {
      return refuse("DRC-USAGE", "the fallback reason code must look like RRP-FALLBACK-SELF-DISPATCH-NO-CARRIER");
    }
    if (requestedRoute === null) return refuse("DRC-USAGE", "a fallback names the route that was requested: supply --requested-route with --fallback-reason-code");
  }
  // W7 attestation: a self-asserted requested route or observed identity is unattested and stays refused. The observed model
  // comes only from the host's own record of the review dispatch (D247), which this command reads itself below. Only the typed
  // fallback record (which says it is not an independent review) may carry a supplied route and identity.
  if ((requestedRoute !== null || observedIdentity !== null) && fallbackReasonCode === null) {
    return refuse("DRC-OBSERVATION-UNATTESTED", "a requested route or observed identity cannot be supplied: a self-asserted value is unattested; omit it. On Claude the reviewer's model is read from the host's record of the readiness-reviewer dispatch (write the report with export-report); on another runner the receipt says unobserved");
  }

  const named = [["report", request.reportPath], ["PRD", request.prdPath], ["Spec", request.specPath], ["output", request.outPath]];
  companionPaths.forEach((path) => named.push(["companion", path]));
  if (previousPath !== null) named.push(["previous receipt", previousPath]);
  if (originalReportPath !== null) named.push(["original report", originalReportPath]);
  for (const [role, path] of named) {
    if (!isSafePath(path)) return refuse("DRC-PATH-UNSAFE", `the ${role} path is not a safe repo-relative path: ${JSON.stringify(path)}`);
  }

  let repoReal;
  try {
    repoReal = realpathSync(request.repo);
    if (!statSync(repoReal).isDirectory()) throw new Error("not a directory");
  } catch {
    return refuse("DRC-REPO-INVALID", "the repository root is not an existing directory");
  }

  const output = resolveOutput(repoReal, request.outPath);
  if (!output.ok) return output;

  // C31a: the PRD, Spec and companion bytes come from the working tree, or from the named commit when --sources-at is given.
  let readSource = (path, role) => readBound(repoReal, path, role);
  if (sourcesAtRef !== null) {
    const resolved = resolveSourcesAt(repoReal, sourcesAtRef);
    if (!resolved.ok) return resolved;
    readSource = (path, role) => readBoundAt(repoReal, resolved.commit, path, role);
  }

  const sources = {};
  let specBytes = null;
  for (const [key, role, path] of [["prd", "PRD", request.prdPath], ["spec", "Spec", request.specPath]]) {
    const read = readSource(path, role);
    if (!read.ok) return read;
    sources[key] = { path, sha256: sha256Of(read.bytes) };
    if (key === "spec") specBytes = read.bytes;
  }
  sources.companions = [];
  for (const path of companionPaths) {
    const read = readSource(path, "companion");
    if (!read.ok) return read;
    sources.companions.push({ path, sha256: sha256Of(read.bytes) });
  }
  const reportRead = readBound(repoReal, request.reportPath, "report");
  if (!reportRead.ok) return reportRead;
  // D64: a sanitized report. The unpublished original is read only to derive its digest; the receipt binds both digests.
  let originalSha256 = null;
  let splitBytes = reportRead.bytes;
  if (originalReportPath !== null) {
    const originalRead = readBound(repoReal, originalReportPath, "original report");
    if (!originalRead.ok) return originalRead;
    originalSha256 = sha256Of(originalRead.bytes);
    splitBytes = originalRead.bytes;
  }
  // C30-6: the blocking/question split comes from the bound report text (the reviewer's own words, the unpublished original when
  // there is one), never from what the Elephant passes. A report with a `Blocking findings:` section must list exactly the ids
  // passed as --open-finding; a question never holds the design. A report without that section is a legacy report and is not checked.
  let splitText = null;
  try { splitText = new TextDecoder("utf-8", { fatal: true }).decode(splitBytes); } catch { splitText = null; }
  const split = splitText === null ? { ok: true } : checkOpenFindingsAgainstReport(splitText, openFindingIds);
  if (!split.ok) {
    const parts = [];
    // C31a: name the report line each id was read from, so a misread section is visible instead of retried unchanged.
    const readAt = designReviewReportLines(splitText).blocking;
    const withLine = (id) => (readAt[id] === undefined ? id : `${id} (report line ${readAt[id]})`);
    if (split.missing.length > 0) parts.push(`the report lists blocking finding(s) not passed as --open-finding: ${split.missing.map(withLine).join(", ")}; if one of them is an earlier-round item the reviewer marks resolved, the report keeps it under "Blocking findings:" without a label line of its own ending in a colon: pass it as --open-finding as well (a delta round withdraws it) and have the next briefing ask for earlier-round status under such a label line`);
    if (split.questionsAsFindings.length > 0) parts.push(`a question is not an open finding and is never passed as one: ${split.questionsAsFindings.join(", ")}`);
    const other = split.extra.filter((id) => !split.questionsAsFindings.includes(id));
    if (other.length > 0) parts.push(`--open-finding id(s) the report does not list under "Blocking findings": ${other.join(", ")}`);
    return refuse("DRC-FINDINGS-SPLIT", `design review receipt refused: DRC-FINDINGS-SPLIT: ${parts.join("; ")}. The open findings of a receipt are exactly the report's blocking findings (C30-6); pass one --open-finding per id under "Blocking findings:" and none for a question.`);
  }
  let previous = null;
  if (previousPath !== null) {
    const previousRead = readBound(repoReal, previousPath, "previous receipt");
    if (!previousRead.ok) return previousRead;
    previous = { path: previousPath, bytes: previousRead.bytes };
  }

  // Antigravity greenfield 2026-11-08: the old report was stamped onto a changed PRD, labelled round 1, and the second signature bound it.
  // A receipt says a review read these bytes, so a report already bound to other bytes in this folder cannot be bound again.
  const reused = priorReceiptOfReport(repoReal, request.outPath, sha256Of(reportRead.bytes), sources);
  if (reused !== null) {
    return refuse("DRC-REPORT-REUSED", `the report ${request.reportPath} is already bound to different PRD or Spec bytes by ${reused}. A report describes what its review read: run the review again for the current bytes, write a new report, and pass the earlier receipt with --previous for a delta round.`);
  }

  const runner = detectRunner(env);
  if (runner === null) return refuse("DRC-NO-RUNNER", "no runner signal in the environment (CLAUDECODE, ANTIGRAVITY_AGENT, AI_AGENT=antigravity, CODEX_SESSION_ID or CODEX_THREAD_ID); the reviewer runner is never supplied by hand");
  // D247: the reviewer observation. A fallback receipt names its own route and carries none (no dispatch was observed). On
  // Claude the host's record of the readiness-reviewer dispatch is found by the digest of the returned text, which is the
  // report (its unpublished original when sanitized); found, it is stamped in and gives `reviewer.model`. Otherwise, and on a
  // runner without a built observation route, the receipt says `unobserved`.
  let reviewerObservation;
  let observedModel = null;
  let commonDir = null;
  const replayRoute = "One observed review dispatch stamps one review: dispatch pipeline-core:readiness-reviewer again for this round, write its report with export-report, and pass the earlier receipt with --previous. A receipt made by mistake and not yet committed may be deleted and made again over the same PRD and Spec";
  if (fallbackReasonCode === null) {
    const returnedSha256 = originalSha256 ?? sha256Of(reportRead.bytes);
    let record = null;
    if (runner === "claude") {
      try { commonDir = typeof deps.commonDirFn === "function" ? deps.commonDirFn(repoReal) : resolveGitCommonDir(repoReal); } catch { commonDir = null; }
      record = commonDir === null ? null : readDesignReviewObservation({ commonDir, resultSha256: returnedSha256 });
    }
    const claimed = record === null ? null : receiptClaimingObservation(repoReal, request.outPath, previous, returnedSha256);
    if (claimed !== null) {
      return refuse("DRC-OBSERVATION-REPLAYED", `the host observation of this review text (${returnedSha256.slice(0, 12)}...) already stamps ${claimed}. ${replayRoute}`);
    }
    if (record === null) reviewerObservation = { assurance: DESIGN_REVIEW_UNOBSERVED_ASSURANCE, modelsUsed: [], resultSha256: null };
    else {
      reviewerObservation = { assurance: record.assurance, modelsUsed: record.modelsUsed, resultSha256: returnedSha256 };
      observedModel = record.modelsUsed[record.modelsUsed.length - 1];
    }
  }
  // The old `reviewer.model` field is kept for existing readers and carries the honest value: the observation, else unknown.
  const model = observedModel ?? observedIdentity ?? OBSERVED_IDENTITY_UNKNOWN;
  const clock = now();
  if (!(clock instanceof Date) || Number.isNaN(clock.getTime())) return refuse("DRC-CLOCK", "the clock did not yield a valid time");

  const created = createDesignReviewReceipt({
    featureId: request.featureId,
    previous,
    sources,
    reviewer: { runner, model },
    report: { path: request.reportPath, sha256: sha256Of(reportRead.bytes), ...(originalSha256 === null ? {} : { originalSha256 }) },
    openFindingIds,
    reviewedAt: clock.toISOString(),
    specBytes,
    ...(fallbackReasonCode === null ? {} : { fallback: { route: FALLBACK_ROUTE, reasonCode: fallbackReasonCode, requestedRoute, observedIdentity: model } }),
    ...(reviewerObservation === undefined ? {} : { reviewerObservation }),
  });
  if (!created.ok) {
    // AC-155: a PASS is refused while a declared foundational Spec decision has no ADR/register reference and no
    // recorded non-significance reason; the library names the unresolved decisions.
    if (created.code === "DRR-DECISION-TRACE") {
      return refuse(created.code, `design review receipt refused: DRR-DECISION-TRACE: foundational Spec decision(s) without an ADR/register reference or a recorded non-significance reason: ${created.unresolved.join(", ")}. Under the "Foundational decisions" heading give each entry "ADR: ADR-NNNN", "Register: <id>" or "Not significant: <reason>".`);
    }
    // Toolbox D23: the library answers with the code alone; say which id is wrong and what an id looks like.
    if (created.code === "DRR-FINDING-IDS") {
      const why = describeDesignReviewFindingIdRefusal(openFindingIds);
      if (why !== null) return refuse(created.code, `design review receipt refused: DRR-FINDING-IDS: ${why}`);
    }
    // C30-6: one full round and two delta rounds. A fourth is never created; the open findings of round 3 go to the PO, who signs them knowingly.
    if (created.code === "DRR-ROUND-CAP") {
      return refuse(created.code, "design review receipt refused: DRR-ROUND-CAP: the design review is one full round and at most two delta rounds (C30-6), and the previous receipt is already round 3. No round 4 is made. Correct what you can, commit, and run present-plan with every receipt of the chain: the findings still open after round 3 are carried in the design binding and shown to the PO before the one signature, who accepts them knowingly or sends the design back.");
    }
    if (created.code === "DRR-DELTA-UNCHANGED") {
      return refuse(created.code, "design review receipt refused: DRR-DELTA-UNCHANGED: the documents did not change, so a second receipt may only withdraw findings of the first (fewer open ids, no new id, the reviewer's report says so). Otherwise change a document and review again.");
    }
    // Glossover G1: DRR-SHAPE alone did not say that the feature id was the malformed field.
    if (created.code === "DRR-SHAPE" && !DESIGN_FEATURE_ID.test(request.featureId)) {
      return refuse(created.code, `design review receipt refused: DRR-SHAPE: --feature ${JSON.stringify(request.featureId.slice(0, 80))} is not a valid feature id (a lowercase letter, then up to 63 lowercase letters, digits or hyphens; ^[a-z][a-z0-9-]{0,63}$). Use the id the State's activeFeature carries; an id that starts with a digit is refused from candidate 28e on already by set-feature.`);
    }
    return refuse(created.code, `design review receipt refused: ${created.code}`);
  }

  // D247: the observation is bound to the PRD and Spec of its first receipt, so it cannot stamp a review of other bytes in any folder.
  if (reviewerObservation !== undefined && reviewerObservation.resultSha256 !== null) {
    const consumed = consumeDesignReviewObservation({ commonDir, resultSha256: reviewerObservation.resultSha256, prdSha256: sources.prd.sha256, specSha256: sources.spec.sha256 });
    if (!consumed.ok && consumed.code === "DRO-CONSUMED-ELSEWHERE") {
      return refuse("DRC-OBSERVATION-REPLAYED", `the host observation of this review text (${reviewerObservation.resultSha256.slice(0, 12)}...) already stamps a receipt over other PRD or Spec bytes. ${replayRoute}`);
    }
    if (!consumed.ok) return refuse("DRC-OBSERVATION-STORE", "the host observation could not be bound to this receipt in the private control area; nothing was written");
  }

  try {
    writeFileSync(output.absolute, created.bytes, { flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") return refuse("DRC-OUT-EXISTS", `the output already exists and is never overwritten: ${request.outPath}; choose a new --out path (for example the same name with a -2 suffix) and run the command again`);
    if (error?.code === "ENOENT") return refuse("DRC-OUT-PARENT-MISSING", missingParentMessage(request.outPath));
    return refuse("DRC-WRITE-FAILED", `the receipt could not be written: ${request.outPath}`);
  }
  return {
    ok: true, path: request.outPath, sha256: created.sha256, receipt: created.receipt,
    reviewerRole: REVIEWER_ROLE, requestedRoute, observedIdentity: model,
    ...(created.receipt.fallback === undefined ? {} : { fallback: created.receipt.fallback }),
    ...(reviewerObservation === undefined ? {} : { reviewerObservation: { assurance: reviewerObservation.assurance, model } }),
    ...(reviewerObservation?.assurance === DESIGN_REVIEW_UNOBSERVED_ASSURANCE && runner === "claude"
      ? { notice: UNOBSERVED_CLAUDE_NOTICE } : {}),
  };
}

/** D247: the one route to an observed Claude review, said where the receipt came out unobserved. */
export const UNOBSERVED_CLAUDE_NOTICE = "this receipt says unobserved, and present-plan refuses an unobserved Claude review (PLAN-DESIGN-REVIEW-UNOBSERVED). "
  + "Dispatch pipeline-core:readiness-reviewer in a session whose plugin hooks are loaded (after an install or hook refresh: restart the session first), "
  + "write its returned text as the report with design-review-receipt.mjs export-report --repo <root> --out <report path>, and create a new receipt with that --report "
  + "(the report reads, as returned; a sanitized publication goes in --report and the exported text in --original-report).";

/**
 * D247: write the text a host-observed Claude design review returned as the report file, exclusive create. The digest of
 * those bytes is what `create` finds the observation by. Without --observation exactly one observation may be unexported.
 * @returns {{ ok: true, path: string, resultSha256: string, model: string, assurance: string } | { ok: false, code: string, message: string }}
 */
export function exportReportFromObservation(input, deps = {}) {
  const request = input ?? {};
  if (typeof request.repo !== "string" || request.repo === "" || !isSafePath(request.outPath)) return refuse("DRC-USAGE", "export-report needs --repo and a safe repo-relative --out");
  if (request.observation !== null && !(typeof request.observation === "string" && /^[a-f0-9]{64}$/u.test(request.observation))) return refuse("DRC-USAGE", "--observation is the 64-hex digest an earlier refusal listed");
  let repoReal;
  try { repoReal = realpathSync(request.repo); if (!statSync(repoReal).isDirectory()) throw new Error("not a directory"); }
  catch { return refuse("DRC-REPO-INVALID", "the repository root is not an existing directory"); }
  const output = resolveOutput(repoReal, request.outPath);
  if (!output.ok) return output;
  let commonDir = null;
  try { commonDir = typeof deps.commonDirFn === "function" ? deps.commonDirFn(repoReal) : resolveGitCommonDir(repoReal); } catch { commonDir = null; }
  if (commonDir === null) return refuse("DRC-OBSERVATION-STORE", "the private control area of this repository could not be resolved");
  let record;
  if (request.observation !== null) {
    record = readDesignReviewObservation({ commonDir, resultSha256: request.observation });
    if (record === null) return refuse("DRC-OBSERVATION-MISSING", `no design review observation ${request.observation} is recorded on this device`);
  } else {
    const open = listUnexportedDesignReviewObservations({ commonDir });
    if (open.length === 0) {
      const last = readLastUnobservedDesignReview({ commonDir });
      const why = last === null ? "" : ` The latest reviewer stop on this device was not observed: ${last.code} at ${new Date(last.observedAtMs).toISOString()}.`;
      return refuse("DRC-OBSERVATION-MISSING", `no unexported design review observation is recorded on this device.${why} Only a Claude dispatch of pipeline-core:readiness-reviewer in a session whose plugin hooks are loaded records one (after an install or hook refresh: restart the session first); dispatch the review again`);
    }
    if (open.length > 1) {
      return refuse("DRC-OBSERVATION-AMBIGUOUS", `${open.length} design review observations are unexported; name one with --observation: ${open.slice(0, 8).map((entry) => `${entry.resultSha256} (${entry.modelsUsed[entry.modelsUsed.length - 1]}, ${new Date(entry.observedAtMs).toISOString()}, ${Buffer.byteLength(entry.text, "utf8")} bytes)`).join("; ")}`);
    }
    record = open[0];
  }
  try { writeFileSync(output.absolute, record.text, { flag: "wx" }); }
  catch (error) {
    if (error?.code === "EEXIST") return refuse("DRC-OUT-EXISTS", `the output already exists and is never overwritten: ${request.outPath}`);
    return refuse("DRC-WRITE-FAILED", `the report could not be written: ${request.outPath}`);
  }
  try { markDesignReviewObservationExported({ commonDir, resultSha256: record.resultSha256 }); } catch { /* an exported marker only narrows the next default choice */ }
  return { ok: true, path: request.outPath, resultSha256: record.resultSha256, model: record.modelsUsed[record.modelsUsed.length - 1], assurance: record.assurance };
}

function parseArgv(argv) {
  const [command, ...rest] = argv;
  if (command === "export-report") return parseExportArgv(rest);
  if (command !== "create") return refuse("DRC-USAGE", `expected the subcommand \`create\` or \`export-report\`\n${USAGE}`);
  const single = new Map();
  const repeated = { companionPaths: [], openFindingIds: [] };
  let index = 0;
  while (index < rest.length) {
    const token = rest[index];
    if (typeof token !== "string" || !token.startsWith("--")) return refuse("DRC-USAGE", `unexpected argument ${JSON.stringify(token)}\n${USAGE}`);
    const equals = token.indexOf("=");
    const name = token.slice(2, equals === -1 ? undefined : equals);
    const isSingle = SINGLE_FLAGS.has(name);
    const isRepeated = REPEATED_FLAGS.has(name);
    if (!isSingle && !isRepeated) {
      return DERIVED_VALUE_FLAG.test(name)
        ? refuse("DRC-FORBIDDEN-FLAG", `--${name} is refused: the review time, runner and digests are derived by the producer, never supplied`)
        : refuse("DRC-UNKNOWN-FLAG", `unknown flag --${name}\n${USAGE}`);
    }
    if (equals !== -1) return refuse("DRC-USAGE", `write --${name} <value> as two arguments\n${USAGE}`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) return refuse("DRC-USAGE", `--${name} needs a value\n${USAGE}`);
    if (isRepeated) {
      repeated[REPEATED_FLAGS.get(name)].push(value);
    } else {
      if (single.has(name)) return refuse("DRC-USAGE", `--${name} was given more than once\n${USAGE}`);
      single.set(name, value);
    }
    index += 2;
  }
  const missing = REQUIRED.find((name) => !single.has(name));
  if (missing !== undefined) return refuse("DRC-USAGE", `missing --${missing}\n${USAGE}`);
  const request = { ...repeated, previousPath: null, originalReportPath: null, sourcesAt: null, requestedRoute: null, observedIdentity: null, fallbackReasonCode: null };
  for (const [name, key] of SINGLE_FLAGS) if (single.has(name)) request[key] = single.get(name);
  return { ok: true, command: "create", request };
}

const EXPORT_FLAGS = new Map([["repo", "repo"], ["out", "outPath"], ["observation", "observation"]]);
function parseExportArgv(rest) {
  const request = { repo: null, outPath: null, observation: null };
  for (let index = 0; index < rest.length; index += 2) {
    const token = rest[index];
    const name = typeof token === "string" && token.startsWith("--") ? token.slice(2) : null;
    if (name === null || !EXPORT_FLAGS.has(name)) return refuse(name === null ? "DRC-USAGE" : "DRC-UNKNOWN-FLAG", `unexpected argument ${JSON.stringify(token)}\n${USAGE}`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) return refuse("DRC-USAGE", `--${name} needs a value\n${USAGE}`);
    if (request[EXPORT_FLAGS.get(name)] !== null) return refuse("DRC-USAGE", `--${name} was given more than once\n${USAGE}`);
    request[EXPORT_FLAGS.get(name)] = value;
  }
  if (request.repo === null || request.outPath === null) return refuse("DRC-USAGE", `export-report needs --repo and --out\n${USAGE}`);
  return { ok: true, command: "export-report", request };
}

export function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const write = deps.writeFn ?? ((text) => process.stdout.write(text));
  const writeError = deps.errorFn ?? ((text) => process.stderr.write(text));
  const refused = (result) => {
    write(`${JSON.stringify({ schema: DESIGN_REVIEW_RECEIPT_CREATE_SCHEMA, status: "refused", code: result.code, message: result.message })}\n`);
    writeError(`${result.code}: ${result.message}\n`);
    return 2;
  };
  // Asking for the usage is a question, never a refusal; the first argument is the only place the flag means that.
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    write(`${USAGE}\n`);
    return 0;
  }
  try {
    const parsed = parseArgv(argv);
    if (!parsed.ok) return refused(parsed);
    if (parsed.command === "export-report") {
      const exported = exportReportFromObservation(parsed.request, { commonDirFn: deps.commonDirFn });
      if (!exported.ok) return refused(exported);
      write(`${JSON.stringify({ schema: DESIGN_REVIEW_RECEIPT_CREATE_SCHEMA, status: "exported", path: exported.path, resultSha256: exported.resultSha256, model: exported.model, assurance: exported.assurance })}\n`);
      return 0;
    }
    const result = createReceiptFromDisk(parsed.request, { env, now: deps.now, commonDirFn: deps.commonDirFn });
    if (!result.ok) return refused(result);
    write(`${JSON.stringify({
      schema: DESIGN_REVIEW_RECEIPT_CREATE_SCHEMA,
      status: "created",
      path: result.path,
      sha256: result.sha256,
      kind: result.receipt.kind,
      round: result.receipt.round,
      verdict: result.receipt.verdict,
      reviewedAt: result.receipt.reviewedAt,
      reviewerRole: result.reviewerRole,
      requestedRoute: result.requestedRoute,
      observedIdentity: result.observedIdentity,
      ...(result.fallback === undefined ? {} : { fallback: result.fallback }),
      ...(result.reviewerObservation === undefined ? {} : { reviewerObservation: result.reviewerObservation }),
      ...(result.notice === undefined ? {} : { notice: result.notice }),
    })}\n`);
    return 0;
  } catch (error) {
    return refused(refuse("DRC-INTERNAL", `unexpected failure: ${error?.name ?? "Error"}`));
  }
}

if (isDirectInvocation(import.meta.url)) {
  process.exitCode = main();
}
