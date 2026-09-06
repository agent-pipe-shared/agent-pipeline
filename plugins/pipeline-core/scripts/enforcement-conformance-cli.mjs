#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Offline A1 evidence plumbing. No native runner adapter is installed here.
 * emit --root <repo> --runner <name> --runner-version <actual-version>
 * check --root <repo> --runner <name> --runner-version <actual-version> --record <file>
 * --record accepts raw JSON or an exit-0 capture-evidence envelope containing it.
 * Exit 0 means emitted/current binding, never native enforcement qualification;
 * 2 = arguments, 3 = source/Git unavailable or dirty, 4 = invalid record,
 * 5 = stale/mismatched binding, 6 = unexpected internal failure.
 */
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_PATH = "plugins/pipeline-core/scripts/enforcement-conformance-cli.mjs";
const CORE_PATH = "plugins/pipeline-core/scripts/enforcement-conformance.mjs";
const MANIFEST_PATH = "plugins/pipeline-core/.claude-plugin/plugin.json";
export const ARTIFACT_PATHS = Object.freeze([CORE_PATH, CLI_PATH, MANIFEST_PATH]);
const LIMIT = 1024 * 1024;
const executingDirectory = dirname(fileURLToPath(import.meta.url));
const executingBytes = new Map();
let startupFailed = false;
let checkCandidateBinding, createRecordId, digestArtifactPreimage;
let runProbeMatrix, sanitizeRecord, sanitizeValue, validateRecord;
try {
  executingBytes.set(CLI_PATH, readFileSync(join(executingDirectory, "enforcement-conformance-cli.mjs")));
  executingBytes.set(CORE_PATH, readFileSync(join(executingDirectory, "enforcement-conformance.mjs")));
  ({ checkCandidateBinding, createRecordId, digestArtifactPreimage,
    runProbeMatrix, sanitizeRecord, sanitizeValue, validateRecord } = await import("./enforcement-conformance.mjs"));
} catch { startupFailed = true; }

class EvidenceError extends Error {
  constructor(code, exitCode) { super(code); this.code = code; this.exitCode = exitCode; }
}
function fail(code, exitCode) { throw new EvidenceError(code, exitCode); }
function safeVersion(value, exitCode) {
  if (typeof value !== "string" || !/^[0-9][A-Za-z0-9.+_-]{0,79}$/u.test(value) || sanitizeValue(value) !== value) {
    fail("invalid-version", exitCode);
  }
  return value;
}
function git(root, args) {
  // Ambient Git selectors must not redirect an explicitly selected source root.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const result = spawnSync("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "-C", root, ...args], {
    env: { ...env, GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: LIMIT, timeout: 10000,
  });
  if (result.error || result.status !== 0) fail("git-metadata-unavailable", 3);
  return result.stdout;
}
function sourceFile(root, path) {
  let selected = root;
  for (const segment of path.split("/")) {
    selected = join(selected, segment);
    if (lstatSync(selected).isSymbolicLink()) fail("source-symlink-refused", 3);
  }
  const stat = lstatSync(selected);
  if (!stat.isFile() || stat.size > LIMIT) fail("source-unavailable", 3);
  return readFileSync(selected);
}

/** Reads committed blobs and checks exact working bytes, twice across each operation.
 * The digest uses the existing framed UTF-8 artifact preimage in ARTIFACT_PATHS order.
 * Generated records never enter that preimage. Unrelated working files are immaterial.
 */
export function readCurrentSource(selectedRoot) {
  try {
    const root = realpathSync(resolve(selectedRoot));
    const top = realpathSync(git(root, ["rev-parse", "--show-toplevel"]).toString("utf8").trim());
    if (root !== top) fail("root-must-be-repository-top", 3);
    const commit = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]).toString("utf8").trim();
    const tree = git(root, ["rev-parse", "--verify", `${commit}^{tree}`]).toString("utf8").trim();
    const artifacts = ARTIFACT_PATHS.map((path) => {
      const bytes = sourceFile(root, path);
      const committed = git(root, ["show", `${commit}:${path}`]);
      if (!bytes.equals(committed)) fail("dirty-implementation-source", 3);
      if (executingBytes.has(path) && !bytes.equals(executingBytes.get(path))) fail("executing-source-mismatch", 3);
      const utf8 = bytes.toString("utf8");
      if (!Buffer.from(utf8, "utf8").equals(bytes)) fail("source-not-utf8", 3);
      return { path, bytes: utf8 };
    });
    const manifest = JSON.parse(artifacts.find(({ path }) => path === MANIFEST_PATH).bytes);
    const pluginVersion = safeVersion(manifest.version, 3);
    // A staged source change is dirty even when working bytes still match HEAD.
    if (git(root, ["diff", "--no-ext-diff", "--no-textconv", "--cached", "--name-only", commit, "--", ...ARTIFACT_PATHS]).length) fail("dirty-implementation-source", 3);
    for (const artifact of artifacts) {
      if (!sourceFile(root, artifact.path).equals(Buffer.from(artifact.bytes, "utf8"))) fail("source-changed-during-read", 3);
    }
    if (git(root, ["rev-parse", "--verify", "HEAD^{commit}"]).toString("utf8").trim() !== commit) fail("source-changed-during-read", 3);
    return { candidate: { commit, tree, artifactSha256: digestArtifactPreimage(artifacts) }, pluginVersion };
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    fail("source-unavailable", 3);
  }
}

function readRecord(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > LIMIT) fail("invalid-record", 4);
    let text = readFileSync(path, "utf8");
    if (text.startsWith("command: ")) {
      const match = /^command: [^\r\n]+\nlabel: [^\r\n]+\nexitCode: 0\n--- stdout ---\n([\s\S]*)\n--- stderr ---\n$/u.exec(text);
      if (!match) fail("invalid-capture-envelope", 4);
      text = match[1];
    }
    const record = JSON.parse(text);
    validateRecord(record);
    if (JSON.stringify(sanitizeRecord(record)) !== JSON.stringify(record)) fail("unsafe-record", 4);
    return record;
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    fail("invalid-record", 4);
  }
}

function parseArgs(argv) {
  const [operation, ...args] = argv;
  if (!["emit", "check"].includes(operation)) fail("expected-emit-or-check", 2);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!["--root", "--runner", "--runner-version", "--record"].includes(key) || key in options || !value || value.startsWith("--")) fail("invalid-arguments", 2);
    options[key] = value;
  }
  if (!options["--root"] || !options["--runner"] || !options["--runner-version"]) fail("root-runner-and-actual-version-required", 2);
  if ((operation === "check") !== Boolean(options["--record"])) fail("record-required-only-for-check", 2);
  const name = options["--runner"];
  if (name.length > 80 || sanitizeValue(name) !== name) fail("invalid-runner", 2);
  try { createRecordId(name, "runner-hook"); } catch { fail("invalid-runner", 2); }
  safeVersion(options["--runner-version"], 2);
  return { operation, root: options["--root"], name, version: options["--runner-version"], recordPath: options["--record"] };
}

export async function runEvidenceCli(argv) {
  try {
    if (startupFailed) fail("executing-source-unavailable", 3);
    const options = parseArgs(argv);
    const source = readCurrentSource(options.root);
    const runner = { name: options.name, version: options.version, pluginVersion: source.pluginVersion };
    let record;
    if (options.operation === "emit") {
      record = await runProbeMatrix({ evidenceScope: "native", adapters: {
        runnerMetadata: { read: () => runner },
        gitBinding: { read: () => source.candidate },
        clock: { now: () => new Date().toISOString() },
        execution: { execute: () => ({ status: "unavailable", exitCode: null }) },
        observationMarkers: { read: () => ({ status: "unavailable", markerSha256: null }) },
        scratch: { allocate: () => null },
      } });
    } else record = readRecord(options.recordPath);
    const finalSource = readCurrentSource(options.root);
    if (JSON.stringify(source) !== JSON.stringify(finalSource)) fail("source-changed-during-operation", 3);
    if (options.operation === "emit") return { exitCode: 0, output: record };
    const mismatch = ["commit", "tree", "artifactSha256"].find((key) => record.candidate[key] !== source.candidate[key]);
    const reason = mismatch ? `candidate.${mismatch}-mismatch`
      : ["name", "version", "pluginVersion"].some((key) => record.runner[key] !== runner[key]) ? "runner-or-plugin-version-mismatch"
      : record.staleness.status !== "current" ? "stale-record"
      : record.provenance.sourceSha256 !== source.candidate.artifactSha256 ? "source-provenance-mismatch" : null;
    const qualification = reason === null
      ? checkCandidateBinding(record, { ...source.candidate, runnerVersion: runner.version, pluginVersion: runner.pluginVersion })
      : { qualifies: false, reason };
    // Public hashes and a claimed pass are not authenticated native receipts.
    if (qualification.qualifies) Object.assign(qualification, { qualifies: false, reason: "native-measurement-not-verified" });
    return { exitCode: reason === null ? 0 : 5, output: {
      schema: "pipeline.enforcement-conformance-readback.v1",
      binding: { matches: reason === null, reason },
      candidate: source.candidate, runner,
      evaluatorOutcome: record.evaluator.outcome, qualification,
      nativeMeasurementVerified: false,
    } };
  } catch (error) {
    return { exitCode: error instanceof EvidenceError ? error.exitCode : 6,
      output: { schema: "pipeline.enforcement-conformance-cli-error.v1", error: error instanceof EvidenceError ? error.code : "internal-error" } };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runEvidenceCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.output)}\n`);
  process.exitCode = result.exitCode;
}
