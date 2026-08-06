#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Emit `pipeline.publication-gate-evidence.v1` — the schema the publication executor
 * demands and that, until now, nothing produced.
 *
 * THE GAP THIS CLOSES. `guard-push.mjs` refuses a raw push carrying a valid critical
 * proof and directs the caller to the publication executor. The executor's v2 path
 * then requires bound gate evidence for identity, verify, security, critic and release
 * preflight. Both schemas its `requireSuccessfulGate` accepts
 * (`pipeline.publication-gate-evidence.v1` and `pipeline.nova-a-gate-observation.v1`)
 * appeared nowhere but at the reading site. The only sanctioned route to an externally
 * attested push was therefore closed at both ends: the guard permitted the action only
 * through the executor, and the executor could not be satisfied except by hand-writing
 * the attestations that authorize one's own publication — the one thing an agent
 * session must never do.
 *
 * WHAT THIS TOOL IS, AND IS NOT. It **derives**; it does not attest. Every field it
 * emits is read out of an artifact a real gate wrote, and it refuses to emit
 * `status: "passed"` unless that artifact itself says so and is bound to the exact
 * candidate. It cannot manufacture a pass, it cannot upgrade a failure, and it holds
 * no opinion of its own. Running it on a red gate produces a refusal, not evidence.
 *
 * That distinction is the whole point. A tool that could write "passed" without a
 * passing source would reintroduce the self-attestation the closed loop was
 * (accidentally) preventing.
 *
 * Usage:
 *   node publication-gate-evidence.mjs --gate <identity|verify|security> \
 *     --source <repo-relative artifact> --out <repo-relative target> [--root <repo>]
 *
 * `critic` needs no derivation: the executor already accepts a critic record whose own
 * schema carries a passing verdict with zero findings. `release-preflight` is validated
 * by `validateReleasePreflight`, not by this schema, and needs its own producer.
 *
 * Exit 0: evidence written. Exit 2: the source did not pass, is not candidate-bound,
 * or is unreadable — nothing is written.
 */
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLICATION_GATE_EVIDENCE_SCHEMA = "pipeline.publication-gate-evidence.v1";
export const DERIVABLE_GATES = Object.freeze(["identity", "verify", "security"]);
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export class GateEvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GateEvidenceError";
    this.code = code;
  }
}
const fail = (code, message) => { throw new GateEvidenceError(code, message); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** Repository-relative, symlink-free, regular file — the same shape the executor demands. */
function safeRepositoryFile(root, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || isAbsolute(relativePath)) {
    fail("PGE-PATH", `${label} path must be repository-relative`);
  }
  const absolute = resolve(root, relativePath);
  if (relative(root, absolute).startsWith(`..${sep}`) || absolute === root) fail("PGE-PATH", `${label} path escapes the repository`);
  let info;
  try { info = lstatSync(absolute); } catch { fail("PGE-SOURCE", `${label} is unavailable`); }
  if (!info.isFile() || info.isSymbolicLink()) fail("PGE-SOURCE", `${label} is not a regular file`);
  if (info.size > MAX_SOURCE_BYTES) fail("PGE-SOURCE", `${label} is too large to be gate evidence`);
  return absolute;
}

/**
 * Read the candidate a source artifact binds itself to. Accepts the shapes the
 * existing gates actually write; an artifact that names no candidate is refused
 * rather than assumed to describe the current one.
 */
function sourceCandidate(record) {
  const direct = record?.candidate;
  const finish = direct?.finish;
  const commit = finish?.commit ?? direct?.commit ?? record?.commit ?? null;
  const tree = finish?.tree ?? direct?.tree ?? record?.tree ?? null;
  if (typeof commit !== "string" || !/^[0-9a-f]{40,64}$/u.test(commit)
    || typeof tree !== "string" || !/^[0-9a-f]{40,64}$/u.test(tree)) {
    fail("PGE-CANDIDATE", "the source artifact does not bind an exact candidate commit and tree");
  }
  return { commit, tree };
}

/**
 * Decide pass/fail FROM THE SOURCE, per gate. Each rule reads the field that gate's
 * own producer writes; none of them can be satisfied by an artifact that failed.
 */
function sourceOutcome(gate, record) {
  if (gate === "verify") {
    if (record?.schema !== "pipeline.verify-evidence.v0") fail("PGE-SOURCE", "verify evidence must be pipeline.verify-evidence.v0");
    const steps = Array.isArray(record.steps) ? record.steps : [];
    if (steps.length === 0) fail("PGE-OUTCOME", "verify evidence records no steps");
    const failed = steps.filter((step) => step?.exitCode !== 0).map((step) => step?.name);
    if (record.exitCode !== 0 || failed.length > 0) fail("PGE-OUTCOME", `verify did not pass (exitCode ${record.exitCode}${failed.length ? `, failing: ${failed.join(", ")}` : ""})`);
    return { status: "passed", exitCode: 0 };
  }
  if (gate === "security") {
    const findings = Array.isArray(record?.findings) ? record.findings : null;
    if (findings === null) fail("PGE-SOURCE", "security evidence records no findings array");
    if (record.exitCode !== 0 || findings.length > 0) fail("PGE-OUTCOME", `security did not pass (exitCode ${record.exitCode}, ${findings.length} finding(s))`);
    return { status: "passed", exitCode: 0 };
  }
  if (gate === "identity") {
    // The toolchain preflight is the identity probe: it reports each required tool's
    // resolved, verified identity. Anything short of a clean run is not an identity.
    if (record?.exitCode !== 0) fail("PGE-OUTCOME", `identity probe did not pass (exitCode ${record?.exitCode})`);
    const results = Array.isArray(record.results) ? record.results : [];
    if (results.length === 0) fail("PGE-SOURCE", "identity probe reports no tool results");
    const unready = results.filter((entry) => entry?.status !== "ready" && entry?.status !== "not_required").map((entry) => entry?.tool);
    if (unready.length > 0) fail("PGE-OUTCOME", `identity probe has unready tools: ${unready.join(", ")}`);
    return { status: "passed", exitCode: 0 };
  }
  fail("PGE-GATE", `gate must be one of ${DERIVABLE_GATES.join(", ")}`);
}

export function deriveGateEvidence({ rootDir = process.cwd(), gate, sourcePath }) {
  if (!DERIVABLE_GATES.includes(gate)) fail("PGE-GATE", `gate must be one of ${DERIVABLE_GATES.join(", ")}`);
  const root = resolve(rootDir);
  const absolute = safeRepositoryFile(root, sourcePath, `${gate} source`);
  const bytes = readFileSync(absolute);
  let record;
  try { record = JSON.parse(bytes.toString("utf8")); } catch { fail("PGE-SOURCE", `${gate} source is not valid JSON`); }
  const candidate = sourceCandidate(record);
  const outcome = sourceOutcome(gate, record);
  return {
    evidence: { schema: PUBLICATION_GATE_EVIDENCE_SCHEMA, gate, candidate, status: outcome.status, exitCode: outcome.exitCode },
    source: { path: sourcePath, sha256: sha256(bytes) },
  };
}

export function writeGateEvidence({ rootDir = process.cwd(), gate, sourcePath, outPath }) {
  const derived = deriveGateEvidence({ rootDir, gate, sourcePath });
  const root = resolve(rootDir);
  if (typeof outPath !== "string" || outPath.length === 0 || isAbsolute(outPath)) fail("PGE-PATH", "out path must be repository-relative");
  const target = resolve(root, outPath);
  if (relative(root, target).startsWith(`..${sep}`) || target === root) fail("PGE-PATH", "out path escapes the repository");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(derived.evidence, null, 2)}\n`);
  return { ...derived, outPath };
}

function parseArgs(argv) {
  const value = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (!flag?.startsWith("--") || next === undefined || next.startsWith("--")) {
      fail("PGE-USAGE", "Usage: publication-gate-evidence.mjs --gate <identity|verify|security> --source <path> --out <path> [--root <repo>]");
    }
    value[flag] = next;
  }
  for (const required of ["--gate", "--source", "--out"]) {
    if (!value[required]) fail("PGE-USAGE", `${required} is required`);
  }
  return { rootDir: value["--root"] ?? process.cwd(), gate: value["--gate"], sourcePath: value["--source"], outPath: value["--out"] };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const written = writeGateEvidence(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ ...written.evidence, derivedFrom: written.source, writtenTo: written.outPath }, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof GateEvidenceError ? error.code : "PGE-ERROR";
    process.stderr.write(`publication-gate-evidence: ${code}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
