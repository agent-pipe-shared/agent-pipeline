// SPDX-License-Identifier: SUL-1.0
/**
 * Executable handoff for the existing design-course producers. This module
 * never synthesizes Advisor/readiness evidence or signs a package. It emits
 * one exact producer command, or runs that producer only after an explicit
 * --execute confirmation.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, linkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep, join } from "node:path";
import { fileURLToPath } from "node:url";

const RUNNERS = new Set(["claude", "codex", "antigravity"]);
const SOURCES = ["input", "prd", "spec", "design", "traceability"];
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const OID = /^[a-f0-9]{40}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const OWN_PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function cleanGitEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
}
function canonicalPluginRoot(value) {
  physicalDirectory(OWN_PLUGIN_ROOT, "DESIGN-COURSE-PLUGIN-ROOT-UNSAFE");
  if (value !== undefined && value !== OWN_PLUGIN_ROOT) fail("DESIGN-COURSE-PLUGIN-ROOT-MISMATCH");
  return OWN_PLUGIN_ROOT;
}
function safeAdvisorPath(value) {
  return typeof value === "string" && value.length <= 240 && !/[\\:\0]/u.test(value)
    && value.split("/").every((part) => part && part !== "." && part !== "..")
    && !value.split("/").some((part) => part.startsWith(".") || part === "scratch" || part === "node_modules");
}
function safePackagePath(value) {
  return typeof value === "string" && value.length <= 256 && /^[A-Za-z0-9._/@-]+$/u.test(value)
    && value.split("/").every((part) => part && !part.startsWith(".") && part !== "scratch" && part !== "node_modules");
}

function fail(code, message = code) { throw Object.assign(new Error(message), { code }); }
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}
function physicalDirectory(path, code) {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path) fail(code);
}
function repositoryFile(root, path, code) {
  if (!safeAdvisorPath(path)) fail(code);
  const target = resolve(root, ...path.split("/"));
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(code);
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(target) !== target) fail(code);
  return { target, bytes: readFileSync(target) };
}
function candidateAt(root, runGit) {
  const git = (args) => runGit("git", ["-C", root, ...args], { cwd: root, env: cleanGitEnv(), encoding: "utf8", timeout: 10_000,
    shell: false, stdio: ["ignore", "pipe", "pipe"] }).trim();
  const candidate = { commit: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) };
  if (!OID.test(candidate.commit) || !OID.test(candidate.tree)) fail("DESIGN-COURSE-CANDIDATE-INVALID");
  return candidate;
}
function assertCanonicalGitRoot(root, runGit) {
  if (!isAbsolute(root ?? "") || resolve(root) !== root) fail("DESIGN-COURSE-GIT-ROOT-INVALID");
  physicalDirectory(root, "DESIGN-COURSE-GIT-ROOT-INVALID");
  const result = runGit("git", ["-C", root, "rev-parse", "--show-toplevel"], { cwd: root,
    env: cleanGitEnv(), encoding: "utf8", timeout: 10_000, shell: false,
    stdio: ["ignore", "pipe", "pipe"] }).trim();
  let discovered;
  try { discovered = realpathSync(result); } catch { fail("DESIGN-COURSE-GIT-ROOT-INVALID"); }
  if (discovered !== root) fail("DESIGN-COURSE-GIT-ROOT-MISMATCH");
}
function verifySources(root, sources, candidate, runGit) {
  if (!exact(sources, SOURCES)) fail("DESIGN-COURSE-SOURCES-CLOSED");
  const paths = new Set();
  const verified = {};
  for (const name of SOURCES) {
    const ref = sources[name];
    if (!exact(ref, ["path", "sha256"]) || !safeAdvisorPath(ref.path) || !SHA.test(ref.sha256 ?? "") || paths.has(ref.path)) {
      fail("DESIGN-COURSE-SOURCE-REFERENCE");
    }
    paths.add(ref.path);
    const file = repositoryFile(root, ref.path, "DESIGN-COURSE-SOURCE-PHYSICAL");
    let committed;
    try {
      committed = Buffer.from(runGit("git", ["show", `${candidate.commit}:${ref.path}`], {
        cwd: root, env: cleanGitEnv(), encoding: "buffer", timeout: 10_000, shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      }));
    } catch { fail("DESIGN-COURSE-SOURCE-NOT-COMMITTED"); }
    if (sha(file.bytes) !== ref.sha256 || sha(committed) !== ref.sha256 || !file.bytes.equals(committed)) {
      fail("DESIGN-COURSE-SOURCE-DRIFT");
    }
    verified[name] = { path: ref.path, sha256: ref.sha256 };
  }
  return verified;
}

export function buildDesignCourseProducerAction({
  root, pluginRoot, runner, stage, featureId, authoringDispatchId, profile = "feature",
  candidate, sources, outputPrefix, readinessDispatchId, queueRevision = 0, receiptPath,
  preparationPath, sessionId, descriptorSha256,
} = {}) {
  pluginRoot = canonicalPluginRoot(pluginRoot);
  if (!isAbsolute(root ?? "") || resolve(root) !== root || !isAbsolute(pluginRoot ?? "") || resolve(pluginRoot) !== pluginRoot) {
    fail("DESIGN-COURSE-ROOT-UNSAFE");
  }
  if (!RUNNERS.has(runner) || !["advisor", "readiness"].includes(stage)) fail("DESIGN-COURSE-STAGE-INVALID");
  if (!exact(candidate, ["commit", "tree"]) || !OID.test(candidate.commit ?? "") || !OID.test(candidate.tree ?? "")) fail("DESIGN-COURSE-CANDIDATE-INVALID");
  if (!ID.test(featureId ?? "") || !ID.test(authoringDispatchId ?? "") || !["epic", "feature"].includes(profile)) fail("DESIGN-COURSE-IDENTITY-INVALID");
  if (!safeAdvisorPath(outputPrefix)) fail("DESIGN-COURSE-OUTPUT-PREFIX-INVALID");
  if (!exact(sources, SOURCES) || SOURCES.some((name) => !exact(sources[name], ["path", "sha256"])
    || !safeAdvisorPath(sources[name].path) || !SHA.test(sources[name].sha256 ?? ""))) fail("DESIGN-COURSE-SOURCES-CLOSED");
  if (new Set(SOURCES.map((name) => sources[name].path)).size !== SOURCES.length) fail("DESIGN-COURSE-SOURCES-CLOSED");
  const producer = stage === "advisor" ? "design-advisory-coordinator.mjs"
    : runner === "codex" ? "codex-design-readiness-bootstrap.mjs" : "runner-design-readiness-bootstrap.mjs";
  const script = join(pluginRoot, "scripts", producer);
  const scriptInfo = lstatSync(script);
  if (!scriptInfo.isFile() || scriptInfo.isSymbolicLink() || realpathSync(script) !== script) fail("DESIGN-COURSE-PRODUCER-UNSAFE");
  const argv = [];
  if (stage === "advisor") {
    argv.push("--runner", runner, "--repo-root", root, "--feature-id", featureId,
      "--authoring-dispatch-id", authoringDispatchId, "--profile", profile,
      "--expected-commit", candidate.commit, "--expected-tree", candidate.tree);
    for (const name of SOURCES) argv.push(`--${name}`, `${sources[name].path}:${sources[name].sha256}`);
    argv.push("--output-prefix", outputPrefix);
  } else {
    if (!ID.test(readinessDispatchId ?? "") || !safePackagePath(receiptPath)
      || !safePackagePath(preparationPath) || !Number.isSafeInteger(queueRevision) || queueRevision < 0) {
      fail("DESIGN-COURSE-READINESS-BINDING-REQUIRED");
    }
    argv.push(...(runner === "codex" ? [] : ["--runner", runner]), "--repo-root", root, "--dispatch-id", readinessDispatchId,
      "--queue-revision", String(queueRevision), "--receipt", receiptPath);
    for (const name of SOURCES) argv.push("--source", name, sources[name].path);
    argv.push("--advisor-preparation", preparationPath);
    if (runner === "codex") {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(sessionId ?? "") || !SHA.test(descriptorSha256 ?? "")) {
        fail("DESIGN-COURSE-CODEX-HOST-DESCRIPTOR-REQUIRED");
      }
      argv.push("--session-id", sessionId, "--expected-descriptor-sha256", descriptorSha256);
    } else if (runner === "claude" || runner === "antigravity") {
      // These producers select their real host route from committed runner policy.
    }
  }
  return { schema: "pipeline.design-course-producer-action.v1", runner, stage,
    pluginRoot, producer: script, executable: process.execPath, argv, cwd: root, shell: false,
    mutation: true, requiresConfirmation: true, implementationAuthority: false,
    expectedCandidate: candidate,
    expected: stage === "advisor"
      ? { statuses: ["answered", "unavailable-pending-final-approval"] }
      : { statuses: ["DESIGN-READINESS-RECEIPT-PUBLISHED"], receiptPath, dispatchId: readinessDispatchId } };
}

export function inspectDesignCourseSession(input, dependencies = {}) {
  const root = input?.root;
  let pluginRoot;
  if (!isAbsolute(root ?? "") || resolve(root) !== root) {
    fail("DESIGN-COURSE-ROOT-UNSAFE");
  }
  physicalDirectory(root, "DESIGN-COURSE-ROOT-UNSAFE");
  pluginRoot = canonicalPluginRoot(input?.pluginRoot);
  const runGit = dependencies.execFileSync ?? execFileSync;
  assertCanonicalGitRoot(root, runGit);
  const candidate = candidateAt(root, runGit);
  const supplied = input.candidate ?? candidate;
  if (!exact(supplied, ["commit", "tree"]) || supplied.commit !== candidate.commit || supplied.tree !== candidate.tree) {
    fail("DESIGN-COURSE-CANDIDATE-DRIFT");
  }
  const sources = verifySources(root, input.sources, candidate, runGit);
  if (input.stage === "advisor") {
    const action = buildDesignCourseProducerAction({ ...input, root, pluginRoot, candidate, sources });
    return { schema: "pipeline.design-course-session.v1", status: "producer-ready", candidate, sources,
      action, implementationAuthority: false, approvalCountBeforeFinalPackage: 0 };
  }
  if (input.stage === "readiness") {
    const action = buildDesignCourseProducerAction({ ...input, root, pluginRoot, candidate, sources });
    return { schema: "pipeline.design-course-session.v1", status: "producer-ready", candidate, sources,
      action, implementationAuthority: false, approvalCountBeforeFinalPackage: 0 };
  }
  return { schema: "pipeline.design-course-session.v1", status: "stage-required", candidate, sources,
    required: ["advisor", "readiness", "verified-v2-package", "final-po-review"],
    code: "DESIGN-COURSE-PACKAGE-ASSEMBLER-REQUIRED", implementationAuthority: false };
}

/** Derive the five producer inputs only from current pipeline authority and
 * the canonical promotion layout. Missing author-owned design files remain a
 * typed authoring step; no disposition, decision or receipt is synthesized. */
export async function inspectDesignCourseSubmission({ root, runner, pluginRoot } = {}, dependencies = {}) {
  try {
    if (!isAbsolute(root ?? "") || resolve(root) !== root || !RUNNERS.has(runner)) fail("DESIGN-COURSE-INSPECT-INPUT");
    physicalDirectory(root, "DESIGN-COURSE-ROOT-UNSAFE");
    const selectedPluginRoot = canonicalPluginRoot(pluginRoot);
    const runGit = dependencies.execFileSync ?? execFileSync;
    assertCanonicalGitRoot(root, runGit);
    const readState = dependencies.readState ?? (await import("./pipeline-state.mjs")).readState;
    const observed = readState(root);
    if (!observed || observed.status !== "ok" || !observed.state || typeof observed.state !== "object") {
      return { schema: "pipeline.design-course-inspection.v1", ok: false, status: "pipeline-state-unavailable",
        code: observed?.status === "malformed" ? "DESIGN-COURSE-PIPELINE-STATE-MALFORMED" : "DESIGN-COURSE-PIPELINE-STATE-UNAVAILABLE",
        implementationAuthority: false };
    }
    const state = observed.state;
    const submission = state.planSubmission;
    const featureId = state.activeFeature?.id;
    if (!submission || !["epic", "feature"].includes(submission.profile)
      || !ID.test(featureId ?? "") || submission.featureId !== featureId
      || !safeAdvisorPath(submission.planPath) || !SHA.test(submission.planSha256 ?? "")
      || !safeAdvisorPath(submission.specPath) || !SHA.test(submission.specSha256 ?? "")) {
      return { schema: "pipeline.design-course-inspection.v1", ok: false, status: "submission-required",
        code: "DESIGN-COURSE-SUBMISSION-BINDING-REQUIRED", implementationAuthority: false };
    }
    const directory = dirname(submission.specPath).split(sep).join("/");
    const joinRelative = (base, name) => `${base}/${name}`;
    const designInputPath = joinRelative(directory, "design-input.md");
    const designPath = joinRelative(directory, "design.md");
    const traceabilityPath = joinRelative(directory, "traceability.md");
    const authoringDispatchId = state.continuity?.queueHead?.dispatch?.dispatchId
      ?? state.continuity?.queueHead?.dispatchId ?? state.continuity?.queueHead?.dispatch?.id;
    if (!ID.test(authoringDispatchId ?? "")) {
      return { schema: "pipeline.design-course-inspection.v1", ok: true, status: "authoring-dispatch-required",
        code: "DESIGN-COURSE-AUTHORING-DISPATCH-REQUIRED", featureId, profile: submission.profile,
        plan: { path: submission.planPath, sha256: submission.planSha256 },
        spec: { path: submission.specPath, sha256: submission.specSha256 },
        nextAction: { kind: "agent-owned-coordination", requiredEvidence: "recorded-stage0-native-authoring-dispatch",
          input: "authoringDispatchId", mutation: false, requiresConfirmation: false,
          implementationAuthority: false }, implementationAuthority: false };
    }
    const inputRef = { path: designInputPath, sha256: "" };
    let inputFile;
    try { inputFile = repositoryFile(root, inputRef.path, "DESIGN-COURSE-INPUT-PHYSICAL"); }
    catch (error) {
      return { schema: "pipeline.design-course-inspection.v1", ok: false, status: "design-input-required",
        code: error?.code ?? "DESIGN-COURSE-INPUT-UNAVAILABLE", expectedPath: designInputPath,
        implementationAuthority: false };
    }
    const candidate = candidateAt(root, runGit);
    const plannedSources = {
      input: { path: designInputPath, sha256: sha(inputFile.bytes) },
      prd: { path: submission.planPath, sha256: submission.planSha256 },
      spec: { path: submission.specPath, sha256: submission.specSha256 },
      design: { path: designPath },
      traceability: { path: traceabilityPath },
    };
    const authoringRequired = [];
    for (const name of ["design", "traceability"]) {
      try {
        const observedFile = repositoryFile(root, plannedSources[name].path, `DESIGN-COURSE-${name.toUpperCase()}-PHYSICAL`);
        plannedSources[name].sha256 = sha(observedFile.bytes);
      } catch (error) {
        if (error?.code !== "ENOENT") return { schema: "pipeline.design-course-inspection.v1", ok: false,
          status: "source-unsafe", code: error?.code ?? "DESIGN-COURSE-AUTHORING-SOURCE-UNSAFE", implementationAuthority: false };
        authoringRequired.push({ name, path: plannedSources[name].path });
      }
    }
    if (authoringRequired.length) {
      return { schema: "pipeline.design-course-inspection.v1", ok: true, status: "authoring-required", candidate,
        featureId, profile: submission.profile, authoringDispatchId,
        boundSources: { input: plannedSources.input, prd: plannedSources.prd, spec: plannedSources.spec },
        nextAction: { kind: "agent-owned-authoring", mutation: true, requiresConfirmation: false,
          implementationAuthority: false, files: authoringRequired,
          instruction: "Author the requested design and traceability files from the bound design input, current PRD and Spec. Do not create Advisor/readiness receipts or approval decisions." },
        implementationAuthority: false };
    }
    const sources = verifySources(root, plannedSources, candidate, runGit);
    const producerAction = buildDesignCourseProducerAction({ root, pluginRoot: selectedPluginRoot, runner, stage: "advisor",
      featureId, authoringDispatchId, profile: submission.profile, candidate, sources,
      outputPrefix: `evidence/design-course/${featureId}/${runner}` });
    const scriptPath = fileURLToPath(import.meta.url);
    const argv = [scriptPath, "--root", root, "--runner", runner, "--stage", "advisor",
      "--feature-id", featureId, "--authoring-dispatch-id", authoringDispatchId,
      "--profile", submission.profile, "--output-prefix", `evidence/design-course/${featureId}/${runner}`];
    for (const name of SOURCES) argv.push("--source", name, sources[name].path, sources[name].sha256);
    argv.push("--execute");
    const nextAction = { kind: "command", executable: process.execPath,
      argv, cwd: root, shell: false,
      mutation: true, requiresConfirmation: true, implementationAuthority: false,
      schema: "pipeline.design-course-producer-action.v1", runner, stage: "advisor",
      expectedCandidate: producerAction.expectedCandidate, sources,
      expected: producerAction.expected };
    return { schema: "pipeline.design-course-inspection.v1", ok: true, status: "advisor-ready", candidate,
      featureId, profile: submission.profile, authoringDispatchId, sources, nextAction,
      implementationAuthority: false };
  } catch (error) {
    return { schema: "pipeline.design-course-inspection.v1", ok: false, status: "inspection-refused",
      code: error?.code ?? "DESIGN-COURSE-INSPECTION-FAILED", implementationAuthority: false };
  }
}

export function executeDesignCourseProducer(action, dependencies = {}) {
  const keys = ["schema", "runner", "stage", "pluginRoot", "producer", "executable", "argv", "cwd", "shell",
    "mutation", "requiresConfirmation", "expectedCandidate", "expected", "implementationAuthority"];
  const expectedProducer = action?.stage === "advisor" ? "design-advisory-coordinator.mjs"
    : action?.runner === "codex" ? "codex-design-readiness-bootstrap.mjs" : "runner-design-readiness-bootstrap.mjs";
  if (!exact(action, keys) || action.schema !== "pipeline.design-course-producer-action.v1" || action.requiresConfirmation !== true
    || action.mutation !== true || action.implementationAuthority !== false || action.shell !== false
    || !RUNNERS.has(action.runner) || !["advisor", "readiness"].includes(action.stage)
    || action.executable !== process.execPath || !Array.isArray(action.argv) || action.argv.some((value) => typeof value !== "string")
    || typeof action.cwd !== "string" || !isAbsolute(action.pluginRoot ?? "")
    || action.producer !== join(action.pluginRoot, "scripts", expectedProducer)) {
    fail("DESIGN-COURSE-ACTION-INVALID");
  }
  canonicalPluginRoot(action.pluginRoot);
  assertCanonicalGitRoot(action.cwd, dependencies.execFileSync ?? execFileSync);
  const producerInfo = lstatSync(action.producer);
  if (!producerInfo.isFile() || producerInfo.isSymbolicLink() || realpathSync(action.producer) !== action.producer) fail("DESIGN-COURSE-PRODUCER-UNSAFE");
  const before = (dependencies.readCandidate ?? candidateAt)(action.cwd, dependencies.execFileSync ?? execFileSync);
  if (before.commit !== action.expectedCandidate.commit || before.tree !== action.expectedCandidate.tree) fail("DESIGN-COURSE-CANDIDATE-DRIFT");
  const child = (dependencies.spawnSync ?? spawnSync)(action.executable, [action.producer, ...action.argv], {
    cwd: action.cwd, shell: false, encoding: "utf8", timeout: 600_000, maxBuffer: 8 * 1024 * 1024,
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const after = (dependencies.readCandidate ?? candidateAt)(action.cwd, dependencies.execFileSync ?? execFileSync);
  if (after.commit !== before.commit || after.tree !== before.tree) fail("DESIGN-COURSE-CANDIDATE-CHANGED-DURING-PRODUCER");
  let producerResult = null;
  try { producerResult = JSON.parse(String(child.stdout ?? "")); }
  catch { return { schema: "pipeline.design-course-producer-result.v1", runner: action.runner, stage: action.stage,
    status: "producer-output-invalid", exitCode: child.status ?? null, signal: child.signal ?? null,
    errorCode: child.error?.code ?? null, outputBytes: Buffer.byteLength(String(child.stdout ?? "")),
    stderrBytes: Buffer.byteLength(String(child.stderr ?? "")),
    candidate: after, implementationAuthority: false }; }
  let outcome = "producer-failed";
  if (action.stage === "advisor" && child.status === 0 && !child.error && child.signal == null
    && producerResult.status === "answered" && producerResult.ok === true && producerResult.implementationAuthority === false) outcome = "advisor-answered";
  if (action.stage === "advisor" && child.status === 2 && !child.error && child.signal == null && action.runner !== "codex"
    && producerResult.status === "unavailable-pending-final-approval"
    && producerResult.code === "native-initial-answer-provenance-unavailable" && producerResult.implementationAuthority === false
    && producerResult.runner === action.runner && producerResult.route?.candidateCommit === action.expectedCandidate.commit) {
    const failureRef = producerResult.artifacts?.failure;
    if (!failureRef || !safeAdvisorPath(failureRef.path) || !SHA.test(failureRef.sha256 ?? "")) fail("DESIGN-COURSE-UNAVAILABLE-EVIDENCE-MISSING");
    const failureFile = repositoryFile(action.cwd, failureRef.path, "DESIGN-COURSE-UNAVAILABLE-EVIDENCE-UNSAFE");
    if (sha(failureFile.bytes) !== failureRef.sha256) fail("DESIGN-COURSE-UNAVAILABLE-EVIDENCE-DRIFT");
    let evidence;
    try { evidence = JSON.parse(failureFile.bytes.toString("utf8")); } catch { fail("DESIGN-COURSE-UNAVAILABLE-EVIDENCE-MALFORMED"); }
    if (evidence.schema !== "pipeline.design-advisor-failure.v1" || evidence.code !== producerResult.code
      || evidence.childStarted !== false || evidence.inputSubmitted !== false || evidence.attemptCount !== 0) {
      fail("DESIGN-COURSE-UNAVAILABLE-EVIDENCE-BINDING");
    }
    outcome = "advisor-unavailable-no-child";
  }
  if (action.stage === "readiness" && child.status === 0 && !child.error && child.signal == null && producerResult.ok === true
    && producerResult.code === (action.runner === "codex" ? "CODEX-READINESS-RECEIPT-PUBLISHED" : "DESIGN-READINESS-RECEIPT-PUBLISHED")
    && producerResult.runner === action.runner && producerResult.candidate?.commit === before.commit
    && producerResult.candidate?.tree === before.tree && producerResult.path === action.expected.receiptPath
    && producerResult.dispatchId === action.expected.dispatchId) outcome = "readiness-published";
  const expectedOutcomes = action.stage === "advisor" ? ["advisor-answered", "advisor-unavailable-no-child"] : ["readiness-published"];
  return { schema: "pipeline.design-course-producer-result.v1", runner: action.runner, stage: action.stage,
    status: expectedOutcomes.includes(outcome) ? outcome : "producer-failed",
    exitCode: child.status ?? null, signal: child.signal ?? null, errorCode: child.error?.code ?? null,
    producerResult, stderrBytes: Buffer.byteLength(String(child.stderr ?? "")), candidate: after,
    implementationAuthority: false };
}

function sourceReferencesFromProducerResult(producerResult, runner) {
  if (!producerResult || typeof producerResult !== "object" || producerResult.implementationAuthority !== false
    || !["answered", "unavailable-pending-final-approval"].includes(producerResult.status)) fail("DESIGN-COURSE-ADVISOR-RESULT-INVALID");
  const refs = producerResult.artifacts;
  if (!refs || !exact(refs.initial, ["path", "sha256"]) || !SHA.test(refs.initial.sha256 ?? "")) fail("DESIGN-COURSE-ADVISOR-ARTIFACTS-INCOMPLETE");
  if (producerResult.status === "answered") {
    if (runner !== "codex" || !exact(refs.receipt, ["path", "sha256"]) || !exact(refs.report, ["path", "sha256"])
      || !exact(refs.consultation, ["path", "sha256"]) || !producerResult.consultation || !producerResult.hostReceipt) {
      fail("DESIGN-COURSE-ANSWERED-ADVISOR-BINDING");
    }
  } else if (!exact(refs.failure, ["path", "sha256"]) || !SHA.test(refs.failure.sha256 ?? "")
    || producerResult.code !== "native-initial-answer-provenance-unavailable") fail("DESIGN-COURSE-UNAVAILABLE-ADVISOR-BINDING");
  for (const ref of Object.values(refs)) {
    if (!ref || !exact(ref, ["path", "sha256"]) || !safeAdvisorPath(ref.path) || !SHA.test(ref.sha256 ?? "")) {
      fail("DESIGN-COURSE-ADVISOR-ARTIFACTS-INCOMPLETE");
    }
  }
  return refs;
}

/** Build and publish only the v2 preparation envelope around actual producer
 * output. Canonical verification rereads all Advisor artifacts before the
 * path becomes visible; caller-supplied disposition/exception content stays
 * explicit and is never inferred. */
export async function writeVerifiedReadinessPreparation({
  repoRoot, preparationPath, runner, profile, featureId, authoringDispatchId,
  candidate, sources, producerResult, disposition = null, revisions = [], proposedExceptionRationale,
} = {}, dependencies = {}) {
  try {
    if (!isAbsolute(repoRoot ?? "") || resolve(repoRoot) !== repoRoot || !RUNNERS.has(runner)
      || !["epic", "feature"].includes(profile) || !ID.test(featureId ?? "") || !ID.test(authoringDispatchId ?? "")
      || !safePackagePath(preparationPath) || !exact(candidate, ["commit", "tree"])) return { ok: false, code: "DESIGN-COURSE-PREPARATION-INPUT" };
    const runGit = dependencies.execFileSync ?? execFileSync;
    const actualCandidate = candidateAt(repoRoot, runGit);
    if (actualCandidate.commit !== candidate.commit || actualCandidate.tree !== candidate.tree) return { ok: false, code: "DESIGN-COURSE-CANDIDATE-DRIFT" };
    const checkedSources = verifySources(repoRoot, sources, candidate, runGit);
    const refs = sourceReferencesFromProducerResult(producerResult, runner);
    const initial = repositoryFile(repoRoot, refs.initial.path, "DESIGN-COURSE-ADVISOR-ARTIFACT-UNSAFE");
    if (sha(initial.bytes) !== refs.initial.sha256) return { ok: false, code: "DESIGN-COURSE-ADVISOR-ARTIFACT-DRIFT" };
    const initialValue = JSON.parse(initial.bytes.toString("utf8"));
    const courseBinding = producerResult.courseBinding ?? initialValue.courseBinding;
    if (!courseBinding || initialValue.featureId !== featureId || initialValue.authoringDispatchId !== authoringDispatchId
      || !exact(initialValue.initialCandidate, ["commit", "tree"]) || !OID.test(initialValue.initialCandidate.commit ?? "")
      || !OID.test(initialValue.initialCandidate.tree ?? "") || !exact(initialValue.sources, SOURCES)
      || initialValue.sources.input?.path !== checkedSources.input.path
      || initialValue.sources.input?.sha256 !== checkedSources.input.sha256) {
      return { ok: false, code: "DESIGN-COURSE-INITIAL-CONTEXT-BINDING" };
    }
    const nativeUnavailable = producerResult.status === "unavailable-pending-final-approval";
    let advisor;
    if (nativeUnavailable) {
      const failure = repositoryFile(repoRoot, refs.failure.path, "DESIGN-COURSE-FAILURE-ARTIFACT-UNSAFE");
      if (sha(failure.bytes) !== refs.failure.sha256) return { ok: false, code: "DESIGN-COURSE-FAILURE-ARTIFACT-DRIFT" };
      const failureValue = JSON.parse(failure.bytes.toString("utf8"));
      if (failureValue.schema !== "pipeline.design-advisor-failure.v1" || failureValue.childStarted !== false
        || failureValue.inputSubmitted !== false || failureValue.attemptCount !== 0
        || failureValue.code !== "native-initial-answer-provenance-unavailable") return { ok: false, code: "DESIGN-COURSE-NATIVE-FAILURE-BINDING" };
      if (typeof proposedExceptionRationale !== "string" || proposedExceptionRationale.trim().length === 0
        || Buffer.byteLength(proposedExceptionRationale, "utf8") > 4096) return { ok: false, code: "DESIGN-COURSE-EXCEPTION-RATIONALE-REQUIRED" };
      advisor = { status: "unavailable", runner, profile, route: producerResult.route, initialContext: refs.initial,
        courseBinding, consultation: null, hostReceipt: producerResult.hostReceipt ?? null, receipt: refs.receipt ?? null,
        report: null, disposition: null, revisions,
        failureEvidence: refs.failure,
        proposedException: { kind: "advisor-unavailable", approval: "final", oneTime: true, rationale: proposedExceptionRationale } };
    } else {
      if (!disposition || typeof disposition !== "object" || !Array.isArray(revisions)) return { ok: false, code: "DESIGN-COURSE-DISPOSITION-REQUIRED" };
      let route;
      if (dependencies.resolveAdvisorRoute) route = dependencies.resolveAdvisorRoute({ repoRoot, candidate, runner });
      else {
        const routeModule = await import("../lib/critic-route-v3.mjs");
        const selected = routeModule.resolveV3DutyRoute({ rootDir: repoRoot, dutyId: "advisory", runner,
          candidateCommit: initialValue.initialCandidate.commit });
        route = Object.fromEntries(["model", "effort", "sourceSha256", "candidateCommit"].map((key) => [key, selected[key]]));
      }
      advisor = { status: "answered", runner, profile, route, initialContext: refs.initial, courseBinding,
        consultation: producerResult.consultation, hostReceipt: producerResult.hostReceipt,
        receipt: refs.receipt, report: refs.report, disposition, revisions };
    }
    const preparation = { schema: "pipeline.design-readiness-preparation.v2", featureId, authoringDispatchId,
      candidate, sources: checkedSources, advisor, createdAt: new Date().toISOString() };
    const canonicalJson = dependencies.canonicalJson
      ?? (await import("../lib/codex-sandbox-compatibility.mjs")).canonicalJson;
    const bytes = Buffer.from(canonicalJson(preparation), "utf8");
    const target = resolve(repoRoot, ...preparationPath.split("/"));
    const rel = relative(repoRoot, target);
    if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return { ok: false, code: "DESIGN-COURSE-PREPARATION-PATH" };
    const parentInfo = lstatSync(dirname(target));
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || realpathSync(dirname(target)) !== dirname(target)) return { ok: false, code: "DESIGN-COURSE-PREPARATION-PARENT" };
    try {
      runGit("git", ["check-ignore", "--quiet", "--", preparationPath], { cwd: repoRoot, timeout: 10_000,
        shell: false, stdio: ["ignore", "ignore", "ignore"] });
    } catch { return { ok: false, code: "DESIGN-COURSE-PREPARATION-MUST-BE-IGNORED" }; }
    try { lstatSync(target); return { ok: false, code: "DESIGN-COURSE-PREPARATION-EXISTS" }; }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    const temporary = join(dirname(target), `design-preparation-tmp-${randomUUID()}.json`);
    let descriptor; let linked = false; let identity;
    try {
      descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
        | (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0)), 0o600);
      writeFileSync(descriptor, bytes); fsyncSync(descriptor);
      identity = lstatSync(temporary, { bigint: true }); closeSync(descriptor); descriptor = undefined;
      const verify = dependencies.readPreparation ?? (async (options) => {
        const module = await import("../lib/design-workflow-package-v2.mjs");
        return module.readDesignReadinessPreparationFromRepository(options);
      });
      const temporaryRel = relative(repoRoot, temporary).split(sep).join("/");
      const checked = await verify({ repoRoot, packagePath: temporaryRel });
      if (!checked?.ok || checked.advisorObservation?.candidate?.commit !== candidate.commit
        || SOURCES.some((name) => JSON.stringify(checked.advisorObservation?.sources?.[name]) !== JSON.stringify(checkedSources[name]))) {
        fail(checked?.code ?? "DESIGN-COURSE-PREPARATION-VERIFY");
      }
      linkSync(temporary, target); linked = true; unlinkSync(temporary);
      const published = readFileSync(target);
      if (!published.equals(bytes) || sha(published) !== sha(bytes)) fail("DESIGN-COURSE-PREPARATION-READBACK");
      const finalRef = relative(repoRoot, target).split(sep).join("/");
      const finalCheck = await verify({ repoRoot, packagePath: finalRef });
      if (!finalCheck?.ok || finalCheck.advisorObservation?.candidate?.commit !== candidate.commit) {
        fail(finalCheck?.code ?? "DESIGN-COURSE-PREPARATION-READBACK");
      }
      return { ok: true, code: "DESIGN-COURSE-PREPARATION-VERIFIED", packagePath: finalRef,
        packageSha256: sha(bytes), candidate, advisorStatus: advisor.status,
        advisorExceptionRequired: nativeUnavailable, implementationAuthority: false };
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      if (linked) {
        try { const current = lstatSync(target, { bigint: true }); if (current.dev === identity.dev && current.ino === identity.ino && readFileSync(target).equals(bytes)) unlinkSync(target); }
        catch { /* retain uncertain target for explicit recovery */ }
      }
      return { ok: false, code: error?.code ?? "DESIGN-COURSE-PREPARATION-WRITE" };
    } finally {
      try {
        const current = lstatSync(temporary, { bigint: true });
        if (identity && current.dev === identity.dev && current.ino === identity.ino && readFileSync(temporary).equals(bytes)) unlinkSync(temporary);
      } catch { /* absent or changed; preserve uncertain path */ }
    }
  } catch (error) { return { ok: false, code: error?.code ?? "DESIGN-COURSE-PREPARATION-FAILED" }; }
}

/** Rebuild and verify the exact final v2 package, then derive the one unsigned
 * PO request through the canonical approval API. This function never invokes
 * the signer or persists an approval. */
export async function buildFinalDesignReviewRequest({
  repoRoot, packagePath, preparationPath, readinessPath, readinessDispatchId,
  featureId, authoringDispatchId, expectedCandidate, expectedSources,
  trustedAdvisorExecutablePath, verifyReadinessExecution,
} = {}, dependencies = {}) {
  try {
    if (!isAbsolute(repoRoot ?? "") || resolve(repoRoot) !== repoRoot
      || !safePackagePath(packagePath) || !safePackagePath(preparationPath) || !safePackagePath(readinessPath)
      || !ID.test(readinessDispatchId ?? "") || !ID.test(featureId ?? "") || !ID.test(authoringDispatchId ?? "")
      || !exact(expectedCandidate, ["commit", "tree"]) || !OID.test(expectedCandidate.commit ?? "")
      || !OID.test(expectedCandidate.tree ?? "") || !exact(expectedSources, SOURCES)) return { ok: false, code: "DESIGN-COURSE-FINAL-INPUT" };
    const runGit = dependencies.execFileSync ?? execFileSync;
    const readCandidate = () => candidateAt(repoRoot, runGit);
    const before = readCandidate();
    if (before.commit !== expectedCandidate.commit || before.tree !== expectedCandidate.tree) return { ok: false, code: "DESIGN-COURSE-CANDIDATE-DRIFT" };
    const sources = verifySources(repoRoot, expectedSources, before, runGit);
    const builder = dependencies.buildPackageV2 ?? (await import("../lib/design-workflow-package-builder.mjs")).buildDesignWorkflowPackageV2;
    const built = await builder({ repoRoot, packagePath, preparationPath, readinessPath, readinessDispatchId,
      featureId, authoringDispatchId, expectedCandidate: before, expectedSources: sources,
      trustedAdvisorExecutablePath, verifyReadinessExecution });
    if (!built?.ok || built.code !== "DWP2-PACKAGE-BUILT" || built.candidate?.commit !== before.commit
      || built.candidate?.tree !== before.tree || built.packagePath !== packagePath || !SHA.test(built.packageSha256 ?? "")
      || built.packageRead?.implementationAuthority !== false) return { ok: false, code: built?.code ?? "DESIGN-COURSE-PACKAGE-BUILD-FAILED" };
    const after = readCandidate();
    if (after.commit !== before.commit || after.tree !== before.tree) return { ok: false, code: "DESIGN-COURSE-CANDIDATE-DRIFT" };
    const { createDesignWorkflowPackageApprovalRequest } = dependencies.approvalModule
      ?? await import("../lib/design-workflow-approval.mjs");
    const approval = createDesignWorkflowPackageApprovalRequest({ repoRoot, packagePath, featureId,
      planPath: sources.prd.path, planSha256: sources.prd.sha256,
      specPath: sources.spec.path, specSha256: sources.spec.sha256, readCandidate,
      ...(verifyReadinessExecution ? { verifyReadinessExecution } : {}), trustedAdvisorExecutablePath });
    if (!approval?.ok || approval.packageRead?.implementationAuthority !== false
      || approval.packageRead?.packageSha256 !== built.packageSha256
      || approval.request?.packageSha256 !== built.packageSha256
      || approval.request?.approvalIntent?.value?.decision !== "approve") {
      return { ok: false, code: approval?.code ?? "DESIGN-COURSE-FINAL-REQUEST-FAILED" };
    }
    const finalCandidate = readCandidate();
    if (finalCandidate.commit !== before.commit || finalCandidate.tree !== before.tree) return { ok: false, code: "DESIGN-COURSE-CANDIDATE-DRIFT" };
    return { ok: true, code: "DESIGN-COURSE-FINAL-PO-REQUEST-READY", packagePath, packageSha256: built.packageSha256,
      intentSha256: approval.request.approvalIntent.sha256, request: approval.request,
      advisorStatus: built.advisorStatus, advisorExceptionRequired: built.advisorExceptionRequired,
      implementationAuthority: false, approvalCountBeforeFinalPackage: 0,
      nextAction: { kind: "present-final-design-workflow-package-to-po", mutation: false,
        requiresConfirmation: true, request: approval.request } };
  } catch (error) { return { ok: false, code: error?.code ?? "DESIGN-COURSE-FINAL-REQUEST-FAILED" }; }
}

/** Run the existing two producers in sequence, publish a canonically verified
 * preparation and final package, and return the unsigned final PO request.
 * Execution is impossible without the caller's explicit confirmation bit. */
export async function runDesignCourseV2(input = {}, dependencies = {}) {
  if (input.confirmProducerExecution !== true) {
    return { ok: false, status: "producer-confirmation-required", code: "DESIGN-COURSE-EXECUTION-EXPLICIT-CONFIRMATION-REQUIRED",
      implementationAuthority: false };
  }
  try {
    const root = input.root;
    const pluginRoot = canonicalPluginRoot(input.pluginRoot);
    const resumed = input.advisorProducerResult !== undefined;
    if (!isAbsolute(root ?? "") || resolve(root) !== root || !isAbsolute(pluginRoot ?? "") || resolve(pluginRoot) !== pluginRoot
      || (!resumed && !safeAdvisorPath(input.outputPrefix)) || !safePackagePath(input.preparationPath)
      || !safePackagePath(input.readinessPath) || !safePackagePath(input.packagePath)) {
      return { ok: false, code: "DESIGN-COURSE-FLOW-INPUT" };
    }
    assertCanonicalGitRoot(root, dependencies.execFileSync ?? execFileSync);
    if (new Set([input.preparationPath, input.readinessPath, input.packagePath]).size !== 3
      || (!resumed && [input.preparationPath, input.readinessPath, input.packagePath].some((path) => path === input.outputPrefix
        || path.startsWith(`${input.outputPrefix}.`)))) return { ok: false, code: "DESIGN-COURSE-OUTPUT-COLLISION" };
    const runGit = dependencies.execFileSync ?? execFileSync;
    const candidate = candidateAt(root, runGit);
    const sources = verifySources(root, input.sources, candidate, runGit);
    const execute = dependencies.executeProducer ?? executeDesignCourseProducer;
    let advisorExecution = null;
    let advisorResult = input.advisorProducerResult ?? null;
    if (!resumed) {
      const action = buildDesignCourseProducerAction({ ...input, root, pluginRoot, candidate, sources, stage: "advisor" });
      advisorExecution = await execute(action, dependencies);
      if (!advisorExecution || !["advisor-answered", "advisor-unavailable-no-child"].includes(advisorExecution.status)) {
        return { ok: false, status: "advisor-stage-failed", code: advisorExecution?.producerResult?.code
          ?? advisorExecution?.errorCode ?? advisorExecution?.status ?? "DESIGN-COURSE-ADVISOR-FAILED",
          advisorExecution, implementationAuthority: false };
      }
      advisorResult = advisorExecution.producerResult;
    }
    const preparation = await writeVerifiedReadinessPreparation({ repoRoot: root,
      preparationPath: input.preparationPath, runner: input.runner, profile: input.profile ?? "feature",
      featureId: input.featureId, authoringDispatchId: input.authoringDispatchId, candidate, sources,
      producerResult: advisorResult, disposition: input.disposition ?? null, revisions: input.revisions ?? [],
      proposedExceptionRationale: input.proposedExceptionRationale }, dependencies);
    if (!preparation.ok) return { ok: false, status: "preparation-refused", code: preparation.code,
      advisorExecution, preparation, implementationAuthority: false };
    const readinessAction = buildDesignCourseProducerAction({ ...input, root, pluginRoot, runner: input.runner,
      stage: "readiness", candidate, sources, readinessDispatchId: input.readinessDispatchId,
      queueRevision: input.queueRevision ?? 0, receiptPath: input.readinessPath, preparationPath: preparation.packagePath });
    const readinessExecution = await execute(readinessAction, dependencies);
    if (!readinessExecution || readinessExecution.status !== "readiness-published") {
      return { ok: false, status: "readiness-stage-failed", code: readinessExecution?.producerResult?.code
        ?? readinessExecution?.errorCode ?? readinessExecution?.status ?? "DESIGN-COURSE-READINESS-FAILED",
        advisorExecution, preparation, readinessExecution, implementationAuthority: false };
    }
    const readinessResult = readinessExecution.producerResult;
    const final = await buildFinalDesignReviewRequest({ repoRoot: root, packagePath: input.packagePath,
      preparationPath: preparation.packagePath, readinessPath: readinessResult.path,
      readinessDispatchId: readinessResult.dispatchId, featureId: input.featureId,
      authoringDispatchId: input.authoringDispatchId, expectedCandidate: candidate, expectedSources: sources,
      trustedAdvisorExecutablePath: input.trustedAdvisorExecutablePath,
      verifyReadinessExecution: input.verifyReadinessExecution }, dependencies);
    if (!final.ok) return { ok: false, status: "final-package-refused", code: final.code,
      advisorExecution, preparation, readinessExecution, final, implementationAuthority: false };
    return { ...final, status: "final-po-review-ready", advisorExecution, preparation,
      readinessExecution, implementationAuthority: false };
  } catch (error) {
    return { ok: false, status: "course-failed", code: error?.code ?? "DESIGN-COURSE-FAILED", implementationAuthority: false };
  }
}

function parseCli(argv) {
  const result = { sources: {} };
  for (let index = 0; index < argv.length;) {
    const flag = argv[index++];
    if (flag === "--source") {
      const name = argv[index++]; const path = argv[index++]; const digest = argv[index++];
      if (!SOURCES.includes(name) || Object.hasOwn(result.sources, name)) fail("DESIGN-COURSE-CLI-USAGE");
      result.sources[name] = { path, sha256: digest }; continue;
    }
    if (flag === "--execute") { result.execute = true; continue; }
    if (flag === "--run-v2") { result.runV2 = true; continue; }
    if (flag === "--inspect") { result.inspect = true; continue; }
    if (["--disposition", "--revisions", "--exception-rationale", "--advisor-result"].includes(flag)) {
      const path = argv[index++]; const digest = argv[index++];
      const field = { "--disposition": "dispositionRef", "--revisions": "revisionsRef",
        "--exception-rationale": "exceptionRationaleRef", "--advisor-result": "advisorResultRef" }[flag];
      if (!path || !SHA.test(digest ?? "") || Object.hasOwn(result, field)) fail("DESIGN-COURSE-CLI-USAGE");
      result[field] = { path, sha256: digest }; continue;
    }
    const keyMap = { "--root": "root", "--plugin-root": "pluginRoot", "--runner": "runner", "--stage": "stage",
      "--feature-id": "featureId", "--authoring-dispatch-id": "authoringDispatchId", "--profile": "profile",
      "--output-prefix": "outputPrefix", "--readiness-dispatch-id": "readinessDispatchId",
      "--queue-revision": "queueRevision", "--receipt": "receiptPath", "--preparation": "preparationPath",
      "--package": "packagePath", "--session-id": "sessionId", "--descriptor-sha256": "descriptorSha256" };
    const key = keyMap[flag]; const value = argv[index++];
    if (!key || value === undefined || Object.hasOwn(result, key)) fail("DESIGN-COURSE-CLI-USAGE");
    result[key] = key === "queueRevision" ? Number(value) : value;
  }
  return result;
}

function readBoundInput(root, ref, kind) {
  if (!ref) return null;
  if (!safeAdvisorPath(ref.path) || !SHA.test(ref.sha256 ?? "")) fail(`DESIGN-COURSE-${kind}-REFERENCE`);
  const file = repositoryFile(root, ref.path, `DESIGN-COURSE-${kind}-UNSAFE`);
  if (sha(file.bytes) !== ref.sha256) fail(`DESIGN-COURSE-${kind}-DRIFT`);
  if (kind === "EXCEPTION-RATIONALE") {
    const value = file.bytes.toString("utf8");
    if (!value.trim() || value.includes("\u0000") || Buffer.byteLength(value, "utf8") > 4096) fail("DESIGN-COURSE-EXCEPTION-RATIONALE-INVALID");
    return value;
  }
  try { return JSON.parse(file.bytes.toString("utf8")); }
  catch { fail(`DESIGN-COURSE-${kind}-MALFORMED`); }
}

export async function main(argv = process.argv.slice(2), io = process, dependencies = {}) {
  const input = parseCli(argv);
  if (input.inspect) {
    if (input.runV2 || input.execute || input.stage !== undefined || input.sources && Object.keys(input.sources).length
      || input.pluginRoot !== undefined
      || Object.keys(input).some((key) => !["sources", "inspect", "root", "runner"].includes(key))) {
      fail("DESIGN-COURSE-CLI-USAGE");
    }
    const result = await inspectDesignCourseSubmission(input, dependencies);
    io.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.ok !== true) io.exitCode = 2;
    return result;
  }
  if (input.runV2) {
    if (input.stage !== undefined) fail("DESIGN-COURSE-CLI-USAGE");
    // The receipt flag is shared with standalone readiness, whose producer
    // accepts receiptPath. The v2 course consumes it as readinessPath.
    input.readinessPath = input.receiptPath;
    input.disposition = readBoundInput(input.root, input.dispositionRef, "DISPOSITION");
    input.revisions = readBoundInput(input.root, input.revisionsRef, "REVISIONS") ?? [];
    input.proposedExceptionRationale = readBoundInput(input.root, input.exceptionRationaleRef, "EXCEPTION-RATIONALE");
    input.advisorProducerResult = readBoundInput(input.root, input.advisorResultRef, "ADVISOR-RESULT") ?? undefined;
    input.confirmProducerExecution = input.execute === true;
    const result = await runDesignCourseV2(input, dependencies);
    io.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.ok !== true) io.exitCode = 2;
    return result;
  }
  const result = inspectDesignCourseSession(input, dependencies);
  if (input.execute) {
    if (!result.action) fail("DESIGN-COURSE-NO-EXECUTABLE-STAGE");
    result.execution = executeDesignCourseProducer(result.action, dependencies);
    result.status = result.execution.status;
    if (input.stage === "advisor" && result.execution.producerResult?.status === "answered") {
      result.nextAction = { kind: "agent-owned-curation", mutation: true, requiresConfirmation: false,
        implementationAuthority: false, advisorResult: result.execution.producerResult,
        required: ["explicit-disposition", "explicit-revisions", "readiness-dispatch-binding"] };
    } else if (input.stage === "advisor" && result.execution.status === "advisor-unavailable-no-child") {
      result.nextAction = { kind: "agent-authored-unavailability-rationale", mutation: true, requiresConfirmation: false,
        implementationAuthority: false, advisorResult: result.execution.producerResult,
        required: ["actual-no-child-evidence", "specific-one-time-rationale-for-final-po-review"] };
    }
  }
  io.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.ok === false) io.exitCode = 2;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await main(); if (result?.ok === false) process.exitCode = 2; }
  catch (error) { process.stderr.write(`${error.code ?? "DESIGN-COURSE-FAILED"}\n`); process.exitCode = 2; }
}
