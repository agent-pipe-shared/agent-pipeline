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
 *   reviewer.model   the OBSERVED execution identity the caller supplies, else `unknown`. It is never read
 *                    from an agent profile: a profile's `model:` line is a request, not an observation.
 *                    The result and the CLI report additionally carry the reviewer role (`critic`) and the
 *                    requested route, as the caller supplies it, kept apart from the observation.
 *   every sha256     the bytes of the file on disk
 * There is deliberately no flag for a timestamp, a hash, a runner or a model: such a flag is refused
 * as DRC-FORBIDDEN-FLAG. The bytes are the library's own canonical output (createDesignReviewReceipt)
 * and are written with exclusive create, so an existing receipt is never overwritten.
 *
 * Refusals are typed. Library codes (DRR-*) pass through unchanged; this command adds DRC-USAGE,
 * DRC-UNKNOWN-FLAG, DRC-FORBIDDEN-FLAG, DRC-PATH-UNSAFE, DRC-OUT-EXISTS, DRC-OUT-PARENT-MISSING,
 * DRC-FILE-MISSING, DRC-FILE-UNSAFE, DRC-NO-RUNNER, DRC-CLOCK,
 * DRC-REPO-INVALID, DRC-WRITE-FAILED and DRC-INTERNAL.
 *
 * Its pure counterpart is lib/design-review-receipt-write-guard.mjs, which recognises a receipt that
 * was written by hand instead.
 */

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";

import { createDesignReviewReceipt } from "../lib/design-review-receipt.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const DESIGN_REVIEW_RECEIPT_CREATE_SCHEMA = "pipeline.design-review-receipt-create.v1";

const USAGE = "Usage: design-review-receipt.mjs create --repo <repo-root> --feature <feature-id> --report <critic-report> --prd <prd> --spec <spec> "
  + "[--original-report <path>] [--companion <path>]... [--previous <receipt>] [--open-finding <id>]... [--requested-route <route>] [--observed-identity <identity>] --out <receipt>\n"
  + "Every path is repo-relative. The review time, runner and all digests are derived, never supplied. The observed identity is "
  + "recorded only when you supply a direct observation of the concrete review dispatch; otherwise it is `unknown`.";

export const OBSERVED_IDENTITY_UNKNOWN = "unknown";
export const REVIEWER_ROLE = "critic";
const OBSERVED_IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,127}$/u;
const REQUESTED_ROUTE_PATTERN = /^[\x21-\x7e]{1,128}$/u;

const SINGLE_FLAGS = new Map([
  ["repo", "repo"], ["feature", "featureId"], ["report", "reportPath"], ["prd", "prdPath"],
  ["spec", "specPath"], ["previous", "previousPath"], ["out", "outPath"],
  ["original-report", "originalReportPath"], ["requested-route", "requestedRoute"], ["observed-identity", "observedIdentity"],
]);
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

/** Resolve the output location: a new file in an existing directory inside the repository. */
function resolveOutput(repoReal, outPath) {
  const absolute = join(repoReal, ...outPath.split("/"));
  try {
    lstatSync(absolute);
    return refuse("DRC-OUT-EXISTS", `the output already exists and is never overwritten: ${outPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") return refuse("DRC-OUT-PARENT-MISSING", `the output directory is not usable: ${outPath}`);
  }
  try {
    if (!isInside(repoReal, realpathSync(dirname(absolute)))) return refuse("DRC-PATH-UNSAFE", `the output directory resolves outside the repository: ${outPath}`);
  } catch {
    return refuse("DRC-OUT-PARENT-MISSING", `the output directory does not exist: ${outPath}`);
  }
  return { ok: true, absolute };
}

const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");

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

  const sources = {};
  let specBytes = null;
  for (const [key, role, path] of [["prd", "PRD", request.prdPath], ["spec", "Spec", request.specPath]]) {
    const read = readBound(repoReal, path, role);
    if (!read.ok) return read;
    sources[key] = { path, sha256: sha256Of(read.bytes) };
    if (key === "spec") specBytes = read.bytes;
  }
  sources.companions = [];
  for (const path of companionPaths) {
    const read = readBound(repoReal, path, "companion");
    if (!read.ok) return read;
    sources.companions.push({ path, sha256: sha256Of(read.bytes) });
  }
  const reportRead = readBound(repoReal, request.reportPath, "report");
  if (!reportRead.ok) return reportRead;
  // D64: a sanitized report. The unpublished original is read only to derive its digest; the receipt binds both digests.
  let originalSha256 = null;
  if (originalReportPath !== null) {
    const originalRead = readBound(repoReal, originalReportPath, "original report");
    if (!originalRead.ok) return originalRead;
    originalSha256 = sha256Of(originalRead.bytes);
  }
  let previous = null;
  if (previousPath !== null) {
    const previousRead = readBound(repoReal, previousPath, "previous receipt");
    if (!previousRead.ok) return previousRead;
    previous = { path: previousPath, bytes: previousRead.bytes };
  }

  const runner = detectRunner(env);
  if (runner === null) return refuse("DRC-NO-RUNNER", "no runner signal in the environment (CLAUDECODE, ANTIGRAVITY_AGENT, AI_AGENT=antigravity, CODEX_SESSION_ID or CODEX_THREAD_ID); the reviewer runner is never supplied by hand");
  // The old `reviewer.model` field is kept for existing readers and carries the honest value: the observation, else unknown.
  const model = observedIdentity ?? OBSERVED_IDENTITY_UNKNOWN;
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
  });
  if (!created.ok) {
    // AC-155: a PASS is refused while a declared foundational Spec decision has no ADR/register reference and no
    // recorded non-significance reason; the library names the unresolved decisions.
    if (created.code === "DRR-DECISION-TRACE") {
      return refuse(created.code, `design review receipt refused: DRR-DECISION-TRACE: foundational Spec decision(s) without an ADR/register reference or a recorded non-significance reason: ${created.unresolved.join(", ")}. Under the "Foundational decisions" heading give each entry "ADR: ADR-NNNN", "Register: <id>" or "Not significant: <reason>".`);
    }
    return refuse(created.code, `design review receipt refused: ${created.code}`);
  }

  try {
    writeFileSync(output.absolute, created.bytes, { flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") return refuse("DRC-OUT-EXISTS", `the output already exists and is never overwritten: ${request.outPath}`);
    if (error?.code === "ENOENT") return refuse("DRC-OUT-PARENT-MISSING", `the output directory does not exist: ${request.outPath}`);
    return refuse("DRC-WRITE-FAILED", `the receipt could not be written: ${request.outPath}`);
  }
  return {
    ok: true, path: request.outPath, sha256: created.sha256, receipt: created.receipt,
    reviewerRole: REVIEWER_ROLE, requestedRoute, observedIdentity: model,
  };
}

function parseArgv(argv) {
  const [command, ...rest] = argv;
  if (command !== "create") return refuse("DRC-USAGE", `expected the subcommand \`create\`\n${USAGE}`);
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
  const request = { ...repeated, previousPath: null, originalReportPath: null, requestedRoute: null, observedIdentity: null };
  for (const [name, key] of SINGLE_FLAGS) if (single.has(name)) request[key] = single.get(name);
  return { ok: true, request };
}

export function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const write = deps.writeFn ?? ((text) => process.stdout.write(text));
  const writeError = deps.errorFn ?? ((text) => process.stderr.write(text));
  const refused = (result) => {
    write(`${JSON.stringify({ schema: DESIGN_REVIEW_RECEIPT_CREATE_SCHEMA, status: "refused", code: result.code, message: result.message })}\n`);
    writeError(`${result.code}: ${result.message}\n`);
    return 2;
  };
  try {
    const parsed = parseArgv(argv);
    if (!parsed.ok) return refused(parsed);
    const result = createReceiptFromDisk(parsed.request, { env, now: deps.now });
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
    })}\n`);
    return 0;
  } catch (error) {
    return refused(refuse("DRC-INTERNAL", `unexpected failure: ${error?.name ?? "Error"}`));
  }
}

if (isDirectInvocation(import.meta.url)) {
  process.exitCode = main();
}
