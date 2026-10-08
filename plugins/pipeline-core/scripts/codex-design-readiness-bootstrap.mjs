#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only Codex readiness producer for one already-authored design package.
 * It never approves the package: it publishes only the exact independent
 * readiness receipt which the later package review must bind.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync,
  realpathSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { advisoryEvidenceBundleSha256, buildAdvisoryEvidenceBundle } from "../lib/advisory-lifecycle-v2.mjs";
import { derivePoGateRepositoryFingerprint, resolvePoGateRepositoryTopology } from "../lib/po-gate-authority.mjs";
import { ProjectOnboardingReadyError, requireProjectOnboardingReady } from "../lib/project-onboarding-ready-gate.mjs";
import { validatePipelineUserV3 } from "../lib/runner-profiles-v3.mjs";
import { canonicalJson } from "../lib/codex-sandbox-compatibility.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { parseYaml } from "../lib/yaml-lite.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { fsyncDirectoryDurable } from "../lib/fs-durability.mjs";
import { resolveSystemExecutable } from "./tool-identity.mjs";
import { runCodexDesignReadinessHost } from "./codex-design-readiness-host.mjs";
import { readCurrentReadinessAdvisorObservation } from "../lib/codex-readiness-finalization.mjs";
import { readDesignReadinessPreparationFromRepository } from "../lib/design-workflow-package-v2.mjs";

const NAMES = Object.freeze(["input", "prd", "spec", "design", "traceability"]);
const OID = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PATH = /^(?!\/)(?!.*\\)(?!.*:)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/@-]+$/u;
const USAGE = "usage: codex-design-readiness-bootstrap.mjs --repo-root <absolute-path> --dispatch-id <id> --queue-revision <n> --session-id <id> --expected-descriptor-sha256 <sha256> --receipt <repo-path> --source <input|prd|spec|design|traceability> <repo-path> (repeat --source five times) [--advisor-preparation <pipeline.design-readiness-preparation.v2 repo-path> | --advisor-receipt <repo-path> --advisor-route <repo-path>]";
const READINESS_SCHEMA = JSON.parse(readFileSync(new URL("../schemas/pipeline.design-readiness-receipt.v1.json", import.meta.url), "utf8"));

function fail(message) { throw new Error(message); }
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function isPhysicalDirectory(path) {
  const info = lstatSync(path);
  return info.isDirectory() && !info.isSymbolicLink() && realpathSync(path) === path;
}
function parseArgs(argv) {
  const values = { sources: {} };
  const seen = new Set();
  for (let index = 0; index < argv.length;) {
    const key = argv[index++];
    if (key === "--source") {
      const name = argv[index++]; const path = argv[index++];
      if (!NAMES.includes(name) || typeof path !== "string" || Object.hasOwn(values.sources, name)) fail(USAGE);
      values.sources[name] = path;
      continue;
    }
    const value = argv[index++];
    if (value === undefined || seen.has(key)) fail(USAGE);
    const field = {
      "--repo-root": "repoRoot", "--dispatch-id": "dispatchId", "--queue-revision": "queueRevision",
      "--advisor-receipt": "advisorReceiptPath", "--advisor-route": "advisorRoutePath",
      "--advisor-preparation": "advisorPreparationPath",
      "--session-id": "sessionId", "--expected-descriptor-sha256": "descriptorSha256", "--receipt": "receiptPath",
    }[key];
    if (!field) fail(USAGE);
    seen.add(key);
    values[field] = value;
  }
  values.queueRevision = Number(values.queueRevision);
  if (typeof values.repoRoot !== "string" || !isAbsolute(values.repoRoot) || resolve(values.repoRoot) !== values.repoRoot
    || !ID.test(values.dispatchId ?? "") || !Number.isSafeInteger(values.queueRevision) || values.queueRevision < 0
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(values.sessionId ?? "") || !SHA256.test(values.descriptorSha256 ?? "")
    || !PATH.test(values.receiptPath ?? "") || JSON.stringify(Object.keys(values.sources).sort()) !== JSON.stringify([...NAMES].sort())
    || Object.values(values.sources).some((path) => !PATH.test(path))) fail(USAGE);
  if (new Set([...Object.values(values.sources), values.receiptPath]).size !== NAMES.length + 1) fail("readiness paths must be unique");
  if ((values.advisorReceiptPath === undefined) !== (values.advisorRoutePath === undefined)
    || (values.advisorReceiptPath !== undefined && (!PATH.test(values.advisorReceiptPath) || !PATH.test(values.advisorRoutePath) || new Set([...Object.values(values.sources),values.receiptPath,values.advisorReceiptPath,values.advisorRoutePath]).size !== 8))) fail(USAGE);
  if(values.advisorPreparationPath!==undefined&&(!PATH.test(values.advisorPreparationPath)||values.advisorReceiptPath!==undefined||new Set([...Object.values(values.sources),values.receiptPath,values.advisorPreparationPath]).size!==7))fail(USAGE);
  return values;
}
function candidateAtHead(root, execFile = execFileSync) {
  const run = (args) => execFile(args[0], args.slice(1), { cwd: root, encoding: "utf8", timeout: 10_000, shell: false, stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = run(["git", "rev-parse", "HEAD"]);
  const tree = run(["git", "rev-parse", "HEAD^{tree}"]);
  if (!OID.test(commit) || !OID.test(tree)) fail("current Git candidate identity is invalid");
  return { commit, tree };
}
function committedBytes(root, path, execFile = execFileSync) {
  try {
    return Buffer.from(execFile("git", ["show", `HEAD:${path}`], {
      cwd: root, encoding: "buffer", timeout: 10_000, shell: false, stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch { fail(`readiness source ${path} is not present in the current Git candidate`); }
}
function targetPath(root, repoPath) {
  const target = resolve(root, ...repoPath.split("/"));
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("readiness receipt path escapes repository");
  const parent = dirname(target);
  if (!isPhysicalDirectory(parent)) fail("readiness receipt parent must be a physical directory");
  try { lstatSync(target); fail("refusing to overwrite an existing readiness receipt"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  return target;
}
function publishExclusive(target, value) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const temporary = join(dirname(target), `.${randomUUID()}.readiness.tmp`);
  let linked = false;
  let temporaryIdentity = null;
  try {
    const descriptor = openSync(temporary, "wx", 0o644);
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
      temporaryIdentity = fstatSync(descriptor, { bigint: true });
    } finally { closeSync(descriptor); }
    linkSync(temporary, target);
    linked = true;
    unlinkSync(temporary);
    let directoryDurability = "confirmed";
    try {
      fsyncDirectoryDurable(dirname(target));
    } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EINVAL", "EISDIR", "ENOTSUP"].includes(error?.code)) directoryDurability = "unsupported";
      else directoryDurability = "unknown";
    }
    const before = lstatSync(target, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.dev !== temporaryIdentity.dev || before.ino !== temporaryIdentity.ino) fail("readiness receipt publication target changed");
    const targetDescriptor = openSync(target, constants.O_RDONLY | (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0)));
    try {
      const opened = fstatSync(targetDescriptor, { bigint: true });
      const content = readFileSync(targetDescriptor);
      const afterDescriptor = fstatSync(targetDescriptor, { bigint: true });
      const afterPath = lstatSync(target, { bigint: true });
      if (!opened.isFile() || opened.dev !== temporaryIdentity.dev || opened.ino !== temporaryIdentity.ino
        || afterDescriptor.dev !== opened.dev || afterDescriptor.ino !== opened.ino
        || afterPath.dev !== opened.dev || afterPath.ino !== opened.ino
        || afterPath.isSymbolicLink() || afterPath.nlink !== 1n || !content.equals(bytes)) {
        fail("readiness receipt publication readback failed");
      }
    } finally { closeSync(targetDescriptor); }
    return { sha256: sha(bytes), bytes: bytes.length, directoryDurability };
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* cleaned up or not created */ }
    if (linked) error.message = `readiness receipt was published but durability/readback failed: ${error.message}`;
    throw error;
  }
}
function readSources(root, paths, candidate, deps) {
  const bundle = buildAdvisoryEvidenceBundle(root, NAMES.map((name) => paths[name]).sort());
  const references = Object.fromEntries(bundle.references.map(({ path, sha256 }) => [path, sha256]));
  const sources = Object.fromEntries(NAMES.map((name) => {
    const path = paths[name];
    const contentSha = references[path];
    if (typeof contentSha !== "string" || sha(committedBytes(root, path, deps.execFileSyncFn)) !== contentSha) {
      fail(`readiness source ${name} differs from the selected Git candidate`);
    }
    return [name, { path, sha256: contentSha }];
  }));
  return {
    sources,
    references: NAMES.map((name) => sources[name].path).sort(),
    evidenceSha256: advisoryEvidenceBundleSha256(bundle),
    candidate,
  };
}

/** Run one separately dispatched, exact-candidate Codex readiness review. */
export async function runCodexDesignReadinessBootstrap(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const rootInfo = lstatSync(args.repoRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || realpathSync(args.repoRoot) !== args.repoRoot) fail("repository root must be a physical absolute directory");
  const config = parseYaml(readFileSync(join(args.repoRoot, "pipeline.user.yaml"), "utf8"));
  const configCheck = validatePipelineUserV3(config, { source: "pipeline.user.yaml" });
  if (!configCheck.ok || configCheck.advisoryExport?.consent === "declined") fail("Codex readiness dispatch is not enabled by pipeline.user.yaml");
  (deps.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady)({ rootDir: args.repoRoot, intent: "dispatch", runner: "codex" });
  const executable = (deps.resolveExecutableFn ?? resolveSystemExecutable)("codex");
  if (typeof executable !== "string" || !isAbsolute(executable)) fail("Codex executable is unavailable");
  const codexPath = realpathSync(executable);
  const codexInfo = lstatSync(codexPath);
  if (!codexInfo.isFile() || codexInfo.isSymbolicLink()) fail("Codex executable is not a physical file");
  const topology = (deps.resolveTopologyFn ?? resolvePoGateRepositoryTopology)(args.repoRoot);
  const repoFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: topology.gitCommonDir, primaryRoot: topology.primaryRoot });
  const candidate = (deps.readCandidateFn ?? ((root) => candidateAtHead(root, deps.execFileSyncFn)))(args.repoRoot);
  const sourceSnapshot = readSources(args.repoRoot, args.sources, candidate, deps);
  const prepare=()=>{const value=readDesignReadinessPreparationFromRepository({repoRoot:args.repoRoot,packagePath:args.advisorPreparationPath});if(!value.ok||canonicalJson(value.advisorObservation.candidate)!==canonicalJson(candidate)||canonicalJson(value.advisorObservation.sources)!==canonicalJson(sourceSnapshot.sources))fail('Advisor readiness preparation is not current and verified');return value.advisorObservation;};
  const observation = args.advisorPreparationPath!==undefined?prepare():args.advisorReceiptPath === undefined ? null : readCurrentReadinessAdvisorObservation({repoRoot:args.repoRoot,candidate,sources:sourceSnapshot.sources,receiptPath:args.advisorReceiptPath,routePath:args.advisorRoutePath});
  const advisorObservationRefs = observation === null||args.advisorPreparationPath!==undefined ? null : {receiptRef:observation.receiptRef,routeRef:observation.routeRef};
  const output = targetPath(args.repoRoot, args.receiptPath);
  const helperCandidate = join(dirname(dirname(codexPath)), "codex-resources", "bwrap");
  let observedHelperPath = null;
  try { const helper = lstatSync(helperCandidate); if (helper.isFile() && !helper.isSymbolicLink()) observedHelperPath = realpathSync(helperCandidate); } catch { /* diagnostic-only helper observation is optional */ }
  const result = await (deps.runReadinessHostFn ?? runCodexDesignReadinessHost)({
    repoRoot: args.repoRoot,
    repoFingerprint,
    dispatchId: args.dispatchId,
    dispatch: {
      queueRevision: args.queueRevision,
      candidateCommit: candidate.commit,
      candidateTree: candidate.tree,
      referenceSetSha256: sourceSnapshot.evidenceSha256,
    },
    sources: sourceSnapshot.sources,
    advisorObservationRefs,
    advisorObservation:args.advisorPreparationPath===undefined?null:observation,
    sandboxRuntime: {
      schema: "pipeline.codex-sandbox-runtime.v1",
      repoRoot: args.repoRoot,
      codexPath,
      observedHelperPath,
      sessionCleanup: { sessionId: args.sessionId, descriptorSha256: args.descriptorSha256 },
    },
  }, deps.readinessHostDependencies);
  if (result?.status !== "reviewed" || !result.readinessReceipt) {
    return { ok: false, code: "CODEX-READINESS-UNAVAILABLE", hostCode: /^[A-Z][A-Z0-9-]{1,80}$/.test(result?.code ?? "") ? result.code : "CODEX-READINESS-HOST-UNAVAILABLE", childStarted: result?.childStarted ?? null };
  }
  const receipt = result.readinessReceipt;
  const schemaCheck = validateAgainstSchema(receipt, READINESS_SCHEMA);
  if (!schemaCheck.valid || receipt.runner !== "codex" || receipt.dispatchId !== args.dispatchId
    || receipt.candidate.commit !== candidate.commit || receipt.candidate.tree !== candidate.tree
    || JSON.stringify(receipt.sources) !== JSON.stringify(sourceSnapshot.sources)) fail("Codex readiness receipt does not bind the prepared candidate and sources");
  const currentCandidate = (deps.readCandidateFn ?? ((root) => candidateAtHead(root, deps.execFileSyncFn)))(args.repoRoot);
  const currentSnapshot = readSources(args.repoRoot, args.sources, currentCandidate, deps);
  if (JSON.stringify(currentCandidate) !== JSON.stringify(candidate)
    || currentSnapshot.evidenceSha256 !== sourceSnapshot.evidenceSha256) fail("candidate or readiness source changed while the review was running; receipt was not published");
  if (observation !== null && canonicalJson(args.advisorPreparationPath!==undefined?prepare():readCurrentReadinessAdvisorObservation({repoRoot:args.repoRoot,candidate:currentCandidate,sources:currentSnapshot.sources,...advisorObservationRefs})) !== canonicalJson(observation)) fail("Advisor runtime observation changed while readiness was running; receipt was not published");
  const published = publishExclusive(output, receipt);
  return {
    ok: true,
    code: "CODEX-READINESS-RECEIPT-PUBLISHED",
    path: args.receiptPath,
    sha256: published.sha256,
    bytes: published.bytes,
    directoryDurability: published.directoryDurability,
    dispatchId: args.dispatchId,
    candidate,
    outcome: receipt.outcome,
    runner: receipt.runner,
  };
}

if (isDirectInvocation(import.meta.url)) {
  runCodexDesignReadinessBootstrap().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ok) process.exitCode = 2;
  }, (error) => {
    const code = error instanceof ProjectOnboardingReadyError ? error.code : "CODEX-READINESS-BOOTSTRAP-FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = error.message === USAGE ? 64 : 2;
  });
}
