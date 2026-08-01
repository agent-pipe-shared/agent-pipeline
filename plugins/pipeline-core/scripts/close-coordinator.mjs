#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, readFileSync, realpathSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import {
  dirname, isAbsolute, join, relative, resolve, sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import { resolveTrustedSystemExecutable } from "../lib/trusted-tool-resolution.mjs";
import {
  assertPrivateRegularFile,
  ensurePrivateDirectory,
} from "../lib/private-boundary.mjs";
import { assessWindowsPrivatePath } from "../lib/windows-private-state.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";
import {
  advanceCloseCoordinator,
  coordinatorCompletion,
  coordinatorNextPhases,
  COORDINATOR_PHASES,
  createCloseCoordinator,
  lifecycleDigest,
  publicationClosePaths,
  readCloseCoordinator,
  storeCloseCoordinator,
} from "./publication-close-journal.mjs";
import {
  PUBLICATION_EXECUTOR_RESULT_SCHEMA,
  validatePublicationExecutorResult,
} from "./publication-executor.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const STATE_WRITER = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ID = /^[A-Za-z0-9._-]{1,100}$/u;
const CLOSE_INTENTS = new Set(["durable-stop", "runtime-transfer"]);
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const planDigest = (value) => sha256(canonical(value));

function emit(value, code = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = code;
}
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function exactArgs(argv, valueNames, booleanNames = new Set()) {
  const values = {}; const booleans = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (typeof raw !== "string" || !raw.startsWith("--")) return null;
    const name = raw.slice(2);
    if (booleanNames.has(name)) {
      if (Object.hasOwn(booleans, name)) return null;
      booleans[name] = true;
      continue;
    }
    if (!valueNames.has(name) || Object.hasOwn(values, name)) return null;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) return null;
    values[name] = value;
    index += 1;
  }
  return { values, booleans };
}
function physicalRoot(input) {
  const root = resolve(input);
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(root) !== root) fail("CLOSE-ROOT", "root must be one physical directory");
  return root;
}
function safeFile(root, path, label) {
  if (typeof path !== "string" || !SAFE_RELATIVE.test(path)) fail("CLOSE-PATH", `${label} path is unsafe`);
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) fail("CLOSE-PATH", `${label} escaped root`);
  let cursor = root;
  for (const component of path.split("/")) {
    cursor = join(cursor, component);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) fail("CLOSE-PATH", `${label} contains a symbolic link`);
  }
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()) fail("CLOSE-PATH", `${label} is not a regular file`);
  return { path, absolute, bytes: readFileSync(absolute), sha256: sha256(readFileSync(absolute)) };
}
function readJsonFile(root, path, label) {
  const file = safeFile(root, path, label);
  let value;
  try { value = JSON.parse(file.bytes); } catch { fail("CLOSE-JSON", `${label} is not valid JSON`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CLOSE-JSON", `${label} is not one JSON object`);
  return { ...file, value };
}
function stateSnapshot(root) {
  const authority = resolveProjectAuthorityPaths({ rootDir: root });
  const statePath = authority.status === "ready"
    ? authority.state
    : (existsSync(join(root, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
  const file = readJsonFile(root, statePath, "Pipeline State");
  if (file.value.schema !== "pipeline.state.v0") fail("CLOSE-STATE", "Pipeline State schema is invalid");
  return { ...file, state: file.value };
}
function gitExecutable() {
  const resolved = resolveTrustedSystemExecutable("git");
  if (!resolved.ok) fail("CLOSE-GIT", `trusted Git is unavailable (${resolved.status})`);
  return resolved.path;
}
function git(root, args, { accept = [0] } = {}) {
  const executable = gitExecutable();
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: dirname(executable),
      LANG: "C",
      LC_ALL: "C",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  if (result.error || !accept.includes(result.status)) fail("CLOSE-GIT", `git ${args[0]} failed`);
  return String(result.stdout ?? "").trim();
}
function gitCommonDir(root) {
  const observed = git(root, ["rev-parse", "--git-common-dir"]);
  const common = realpathSync(resolve(root, observed));
  const info = lstatSync(common);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("CLOSE-GIT", "Git common directory is unsafe");
  return common;
}
function gitCandidate(root) {
  const oid = git(root, ["rev-parse", "HEAD"]);
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  if (!OID.test(oid) || !OID.test(tree)) fail("CLOSE-GIT", "candidate OID/tree are invalid");
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") fail("CLOSE-CANDIDATE-DRIFT", "tracked or untracked worktree drift blocks candidate freeze/readback");
  return { oid, tree };
}
function activeFeature(state) {
  const value = state.activeFeature;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !ID.test(value.id ?? "") || typeof value.planPath !== "string"
    || typeof value.phase !== "string" || value.phase === "") {
    fail("CLOSE-FEATURE", "active feature identity is unavailable");
  }
  return { id: value.id, planPath: value.planPath, phase: value.phase };
}
function authorityFromState(root, snapshot, { requireResult = false } = {}) {
  const feature = activeFeature(snapshot.state);
  const prd = safeFile(root, feature.planPath, "PRD/Plan");
  const approval = snapshot.state.planApproval?.poGateAuthority;
  const specPath = approval?.specPath ?? snapshot.state.continuity?.authority?.spec?.path;
  const spec = safeFile(root, specPath, "Spec");
  if (approval?.planSha256 !== prd.sha256 || approval?.specSha256 !== spec.sha256) {
    fail("CLOSE-AUTHORITY", "current PRD/Spec bytes are not the approved authority");
  }
  const resultPath = snapshot.state.continuity?.authority?.result?.path ?? null;
  const result = resultPath === null ? null : safeFile(root, resultPath, "Implementation Result");
  if (requireResult && result === null) fail("CLOSE-RESULT", "feature close requires a bound Implementation Result");
  return {
    feature,
    authority: {
      implementationResultSha256: result?.sha256 ?? null,
      pipelineStateSha256: snapshot.sha256,
      planSha256: approval.planSha256,
      prdSha256: prd.sha256,
      specSha256: spec.sha256,
    },
  };
}
function action(command, values, planSha256) {
  const argv = [
    SCRIPT, command,
    "--root", values.root,
    "--lifecycle", values.lifecycle,
    "--actor", values.actor,
  ];
  if (values.closeIntent) argv.push("--close-intent", values.closeIntent);
  if (values.phase) argv.push("--phase", values.phase);
  if (values.evidence) argv.push("--evidence", values.evidence);
  if (values.publication) argv.push("--publication", values.publication);
  if (values.continuityCloseRequest) {
    argv.push("--continuity-close-request", values.continuityCloseRequest);
  }
  if (values.authorized) argv.push("--authorized");
  argv.push("--plan-sha256", planSha256, "--activate");
  return {
    executable: process.execPath,
    argv,
    mutation: true,
    requiresConfirmation: true,
    expected: { schema: "pipeline.close-coordinator.apply.v1", statuses: ["applied", "replayed"] },
  };
}
function startPlan(values) {
  const root = physicalRoot(values.root);
  if (!ID.test(values.lifecycle ?? "") || typeof values.actor !== "string" || values.actor.trim() === "") fail("CLOSE-ARGS", "start identity is invalid");
  if (!CLOSE_INTENTS.has(values.closeIntent)) {
    fail("CLOSE-INTENT", "close coordinator requires --close-intent durable-stop or runtime-transfer; normal same-topic restarts are handover-only");
  }
  const snapshot = stateSnapshot(root);
  const observed = authorityFromState(root, snapshot);
  const coordinator = createCloseCoordinator({
    lifecycleId: values.lifecycle,
    featureId: observed.feature.id,
    activeFeature: observed.feature,
    authority: observed.authority,
  });
  const payload = {
    schema: "pipeline.close-coordinator.start-plan.v1",
    root,
    lifecycleId: values.lifecycle,
    actor: values.actor.trim(),
    closeIntent: values.closeIntent,
    stateSha256: snapshot.sha256,
    coordinator,
  };
  const digest = planDigest(payload);
  return { ...payload, planSha256: digest, nextAction: action("apply-start", { ...values, root }, digest) };
}
function privateEvidence(common, lifecycle, path, label) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    fail("CLOSE-EVIDENCE-PATH", `${label} must use the coordinator-private evidence directory`);
  }
  const directory = join(publicationClosePaths(common, lifecycle).directory, "evidence");
  const requested = resolve(path);
  if (dirname(requested) !== directory
    || !/^[A-Za-z0-9._-]{1,160}\.json$/u.test(requested.slice(directory.length + 1))) {
    fail("CLOSE-EVIDENCE-PATH", `${label} escaped the coordinator-private evidence directory`);
  }
  const directoryInfo = lstatSync(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()
    || realpathSync(directory) !== directory
    || (process.platform !== "win32" && (directoryInfo.mode & 0o077) !== 0)) {
    fail("CLOSE-EVIDENCE-PATH", `${label} private directory is unsafe`);
  }
  if (process.platform === "win32"
    && assessWindowsPrivatePath(directory).status !== "secure") {
    fail("CLOSE-EVIDENCE-PATH", `${label} Windows directory assurance is unavailable`);
  }
  assertPrivateRegularFile(requested, label);
  const info = lstatSync(requested);
  if (info.size < 2 || info.size > 1024 * 1024) {
    fail("CLOSE-EVIDENCE-PATH", `${label} size is invalid`);
  }
  return {
    path: requested,
    absolute: requested,
    bytes: readFileSync(requested),
    sha256: sha256(readFileSync(requested)),
  };
}
function evidence(root, common, lifecycle, path, schema, keys, { privateOnly = false } = {}) {
  if (!path) fail("CLOSE-EVIDENCE", `${schema} evidence is required`);
  const file = privateOnly
    ? privateEvidence(common, lifecycle, path, schema)
    : safeFile(root, path, schema);
  let value;
  try { value = JSON.parse(file.bytes); } catch { fail("CLOSE-JSON", `${schema} is not valid JSON`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("CLOSE-JSON", `${schema} is not one JSON object`);
  }
  const observed = { ...file, value };
  if (observed.value.schema !== schema || Object.keys(observed.value).sort().join("\0") !== [...keys].sort().join("\0")) {
    fail("CLOSE-EVIDENCE", `${schema} evidence shape is invalid`);
  }
  return observed;
}
function continuityCloseRequest(root, snapshot, path) {
  if (snapshot.state.continuity === undefined) {
    if (path !== undefined) fail("CLOSE-CONTINUITY", "continuity close request is unexpected");
    return null;
  }
  if (!path) fail("CLOSE-CONTINUITY", "active Continuity requires an exact close request");
  const request = readJsonFile(root, path, "Continuity close request");
  const value = request.value;
  const continuity = snapshot.state.continuity;
  const result = continuity?.authority?.result;
  if (Object.keys(value).sort().join("\0") !== [
    "closeEvidence", "expectedRevision", "featureId", "result", "schema",
  ].sort().join("\0")
    || value.schema !== "pipeline.continuity-close.v0"
    || value.featureId !== snapshot.state.activeFeature?.id
    || value.expectedRevision !== continuity?.revision
    || continuity?.queueHead?.nextAction !== "close"
    || continuity?.queueHead?.dispatch !== null
    || continuity?.blocker !== null
    || continuity?.decisionTxn !== null
    || result === null
    || canonical(value.result) !== canonical(result)
    || canonical(value.closeEvidence) === canonical(value.result)) {
    fail("CLOSE-CONTINUITY", "Continuity close request is not bound to the exact close-ready State");
  }
  for (const [label, binding] of [["Result", value.result], ["close evidence", value.closeEvidence]]) {
    if (!binding || Object.keys(binding).sort().join("\0") !== "path\0sha256"
      || !SHA256.test(binding.sha256 ?? "")) {
      fail("CLOSE-CONTINUITY", `${label} binding is invalid`);
    }
    const observed = safeFile(root, binding.path, label);
    if (observed.sha256 !== binding.sha256) fail("CLOSE-CONTINUITY", `${label} bytes drifted`);
  }
  return request;
}
function transitionPlan(values) {
  const root = physicalRoot(values.root);
  if (!ID.test(values.lifecycle ?? "") || !COORDINATOR_PHASES.includes(values.phase)
    || typeof values.actor !== "string" || values.actor.trim() === "") fail("CLOSE-ARGS", "transition identity is invalid");
  const common = gitCommonDir(root);
  const stored = readCloseCoordinator(common, values.lifecycle);
  if (!coordinatorNextPhases(stored.coordinator.phase).includes(values.phase)
    && !(stored.coordinator.phase === "cleanup-complete" && values.phase === "cleanup-complete")) {
    fail("CLOSE-ORDER", "transition is not reachable");
  }
  if (["closed-local", "delivered", "release-eligible", "promoted"].includes(values.phase)
    && stored.coordinator.cleanup.status !== "complete") {
    fail("CLOSE-CLEANUP", "a clean terminal/release transition requires confirmed cleanup");
  }
  if (values.phase === "delivered"
    && !SHA256.test(stored.coordinator.publication?.readbackReceiptDigest ?? "")) {
    fail("CLOSE-PUBLICATION", "delivery requires exact publication readback");
  }
  const advance = {
    expectedRevision: stored.coordinator.revision,
    expectedStateSha256: lifecycleDigest(stored.coordinator),
    phase: values.phase,
    inputDigest: null,
    observedDigest: null,
  };
  const snapshot = stateSnapshot(root);
  if (stored.coordinator.candidateOid !== null
    && values.phase !== "candidate-frozen") {
    const candidate = gitCandidate(root);
    if (candidate.oid !== stored.coordinator.candidateOid
      || candidate.tree !== stored.coordinator.candidateTree) {
      fail("CLOSE-CANDIDATE-DRIFT", "the frozen candidate changed before the requested transition");
    }
  }
  let boundEvidenceSha256 = null;
  if (values.phase === "checkpointed") {
    const feature = activeFeature(snapshot.state);
    if (feature.id !== stored.coordinator.featureId) fail("CLOSE-FEATURE", "checkpoint feature drifted");
    advance.inputDigest = snapshot.sha256;
    advance.observedDigest = snapshot.sha256;
  } else if (values.phase === "feature-close-prepared") {
    const observed = authorityFromState(root, snapshot, { requireResult: true });
    const closeRequest = continuityCloseRequest(root, snapshot, values.continuityCloseRequest);
    if (canonical(observed.feature) !== canonical(stored.coordinator.activeFeature)) fail("CLOSE-FEATURE", "feature-close identity drifted");
    advance.authority = observed.authority;
    advance.inputDigest = sha256(canonical({
      pipelineStateSha256: snapshot.sha256,
      continuityCloseRequestSha256: closeRequest?.sha256 ?? null,
    }));
    advance.observedDigest = observed.authority.implementationResultSha256;
  } else if (values.phase === "tracked-close-finalized") {
    const tracked = evidence(root, common, values.lifecycle, values.evidence, "pipeline.close-tracked-effects.v1", [
      "schema", "resultSha256", "backlogSha256", "handoverSha256", "historySha256",
      "telemetrySha256", "retrospectiveSha256", "pipelineStateSha256",
    ]);
    for (const [key, value] of Object.entries(tracked.value)) if (key !== "schema" && !SHA256.test(value ?? "")) fail("CLOSE-EVIDENCE", "tracked effect digest is invalid");
    const closed = snapshot.state.closedFeatures?.at(-1);
    if (snapshot.state.activeFeature !== undefined
      || closed?.id !== stored.coordinator.featureId
      || closed?.coordinatorClose?.lifecycleId !== stored.coordinator.lifecycleId
      || closed?.coordinatorClose?.stateSha256 !== lifecycleDigest(stored.coordinator)
      || tracked.value.pipelineStateSha256 !== snapshot.sha256
      || tracked.value.resultSha256 !== stored.coordinator.authority.implementationResultSha256) {
      fail("CLOSE-TRACKED", "tracked close postimage is incomplete or drifted");
    }
    boundEvidenceSha256 = tracked.sha256;
    advance.inputDigest = tracked.sha256;
    advance.observedDigest = snapshot.sha256;
  } else if (values.phase === "candidate-frozen") {
    const candidate = gitCandidate(root);
    advance.candidateOid = candidate.oid;
    advance.candidateTree = candidate.tree;
    advance.inputDigest = snapshot.sha256;
    advance.observedDigest = sha256(canonical(candidate));
  } else if (values.phase === "final-verify-green") {
    const verified = evidence(root, common, values.lifecycle, values.evidence, "pipeline.close-final-verification.v1", [
      "schema", "candidateOid", "candidateTree", "verifyStatus", "verifySha256",
      "securityStatus", "securitySha256",
    ], { privateOnly: true });
    if (verified.value.candidateOid !== stored.coordinator.candidateOid
      || verified.value.candidateTree !== stored.coordinator.candidateTree
      || verified.value.verifyStatus !== "green" || !SHA256.test(verified.value.verifySha256 ?? "")
      || verified.value.securityStatus !== "green" || !SHA256.test(verified.value.securitySha256 ?? "")) {
      fail("CLOSE-VERIFY", "final Verify/Security evidence is not green for the frozen candidate");
    }
    const candidate = gitCandidate(root);
    if (candidate.oid !== stored.coordinator.candidateOid || candidate.tree !== stored.coordinator.candidateTree) fail("CLOSE-CANDIDATE-DRIFT", "candidate changed after freeze");
    boundEvidenceSha256 = verified.sha256;
    advance.candidateOid = candidate.oid;
    advance.candidateTree = candidate.tree;
    advance.inputDigest = verified.sha256;
    advance.observedDigest = sha256(canonical(verified.value));
  } else if (values.phase === "publication-authorized") {
    if (!values.authorized) fail("CLOSE-AUTHORIZATION", "publication requires separate authorization");
    const authorization = evidence(root, common, values.lifecycle, values.evidence, "pipeline.close-publication-authorization.v1", [
      "schema", "candidateOid", "candidateTree", "channel", "destinationDigest", "authorizedBy", "authorizedAt",
    ], { privateOnly: true });
    if (authorization.value.candidateOid !== stored.coordinator.candidateOid
      || authorization.value.candidateTree !== stored.coordinator.candidateTree
      || !["private", "neutral-public"].includes(authorization.value.channel)
      || !SHA256.test(authorization.value.destinationDigest ?? "")
      || typeof authorization.value.authorizedBy !== "string" || authorization.value.authorizedBy === ""
      || typeof authorization.value.authorizedAt !== "string" || authorization.value.authorizedAt === "") {
      fail("CLOSE-AUTHORIZATION", "publication authorization is invalid");
    }
    boundEvidenceSha256 = authorization.sha256;
    advance.authorization = true;
    advance.publicationAuthorization = {
      channel: authorization.value.channel,
      destinationDigest: authorization.value.destinationDigest,
      evidenceSha256: authorization.sha256,
    };
    advance.inputDigest = authorization.sha256;
    advance.observedDigest = sha256(canonical(authorization.value));
  } else if (values.phase === "published" || values.phase === "readback-confirmed") {
    const keys = [
      "schema", "status", "code", "channel", "transactionId", "destinationDigest",
      "destinationRef", "candidateOid", "candidateTree", "authorityRawSha256",
      "publicationReceiptDigest", "executorSha256", "pushAttempted", "readback",
      "receiptSha256",
    ];
    const publication = evidence(root, common, values.lifecycle, values.publication, PUBLICATION_EXECUTOR_RESULT_SCHEMA, keys, { privateOnly: true });
    try { validatePublicationExecutorResult(publication.value); } catch {
      fail("CLOSE-PUBLICATION", "fixed publication executor receipt is invalid");
    }
    if (publication.value.status !== "closed"
      || publication.value.candidateOid !== stored.coordinator.candidateOid
      || publication.value.candidateTree !== stored.coordinator.candidateTree) {
      fail("CLOSE-PUBLICATION", "fixed publication executor did not close the frozen candidate");
    }
    if (values.phase === "published"
      && (publication.value.channel !== stored.coordinator.publicationAuthorization?.channel
        || publication.value.destinationDigest
          !== stored.coordinator.publicationAuthorization?.destinationDigest)) {
      fail("CLOSE-PUBLICATION", "publication does not match the durable authorization");
    }
    if (values.phase === "readback-confirmed"
      && (publication.value.channel !== stored.coordinator.publication?.channel
        || publication.value.destinationDigest !== stored.coordinator.publication?.destinationDigest
        || publication.value.destinationRef !== stored.coordinator.publication?.ref
        || publication.value.publicationReceiptDigest
          !== stored.coordinator.publication?.publicationReceiptDigest)) {
      fail("CLOSE-PUBLICATION", "readback does not match the durable publication");
    }
    advance.publication = {
      channel: publication.value.channel,
      destinationDigest: publication.value.destinationDigest,
      ref: publication.value.destinationRef,
      oid: publication.value.candidateOid,
      tree: publication.value.candidateTree,
      publicationReceiptDigest: publication.value.publicationReceiptDigest,
      readbackReceiptDigest: values.phase === "readback-confirmed" ? publication.value.receiptSha256 : null,
    };
    boundEvidenceSha256 = publication.sha256;
    advance.inputDigest = publication.sha256;
    advance.observedDigest = sha256(canonical(publication.value));
  } else if (values.phase === "cleanup-complete") {
    const cleanup = evidence(root, common, values.lifecycle, values.evidence, "pipeline.close-cleanup-receipt.v1", [
      "schema", "status", "evidenceDigest", "candidateOid", "candidateTree",
    ], { privateOnly: true });
    if (!["complete", "uncertain"].includes(cleanup.value.status)
      || !SHA256.test(cleanup.value.evidenceDigest ?? "")
      || cleanup.value.candidateOid !== stored.coordinator.candidateOid
      || cleanup.value.candidateTree !== stored.coordinator.candidateTree) fail("CLOSE-CLEANUP", "cleanup evidence is invalid");
    boundEvidenceSha256 = cleanup.sha256;
    advance.cleanupStatus = cleanup.value.status;
    advance.cleanupEvidenceDigest = cleanup.value.evidenceDigest;
    advance.inputDigest = cleanup.sha256;
    advance.observedDigest = cleanup.value.evidenceDigest;
  } else if (["release-eligible", "promoted"].includes(values.phase)) {
    if (!values.authorized) fail("CLOSE-AUTHORIZATION", `${values.phase} requires a separate authorization`);
    const gate = evidence(root, common, values.lifecycle, values.evidence, `pipeline.close-${values.phase}-authorization.v1`, [
      "schema", "candidateOid", "candidateTree", "authorizedBy", "authorizedAt", "authorizationDigest",
    ], { privateOnly: true });
    if (gate.value.candidateOid !== stored.coordinator.candidateOid || gate.value.candidateTree !== stored.coordinator.candidateTree
      || !SHA256.test(gate.value.authorizationDigest ?? "")) fail("CLOSE-AUTHORIZATION", `${values.phase} authorization is invalid`);
    boundEvidenceSha256 = gate.sha256;
    advance.authorization = true;
    advance.inputDigest = gate.sha256;
    advance.observedDigest = gate.value.authorizationDigest;
  } else {
    advance.inputDigest = lifecycleDigest(stored.coordinator);
    advance.observedDigest = snapshot.sha256;
  }
  if (!SHA256.test(advance.inputDigest ?? "") || !SHA256.test(advance.observedDigest ?? "")) fail("CLOSE-DIGEST", "transition digests are invalid");
  const payload = {
    schema: "pipeline.close-coordinator.transition-plan.v1",
    root,
    lifecycleId: values.lifecycle,
    actor: values.actor.trim(),
    expectedRevision: stored.coordinator.revision,
    expectedStateSha256: lifecycleDigest(stored.coordinator),
    expectedRawSha256: stored.rawDigest,
    phase: values.phase,
    evidenceSha256: boundEvidenceSha256,
    advance,
  };
  const digest = planDigest(payload);
  return { ...payload, planSha256: digest, nextAction: action("apply-transition", { ...values, root }, digest) };
}

function applyStart(values, suppliedDigest) {
  const plan = startPlan(values);
  if (plan.planSha256 !== suppliedDigest) fail("CLOSE-PLAN", "start plan digest drifted");
  const common = gitCommonDir(plan.root);
  if (existsSync(join(common, "agent-pipeline", "publication-close", plan.lifecycleId, "coordinator.json"))) {
    const prior = readCloseCoordinator(common, plan.lifecycleId);
    if (lifecycleDigest(prior.coordinator) === lifecycleDigest(plan.coordinator)) {
      const evidenceDirectory = ensurePrivateDirectory(join(publicationClosePaths(common, plan.lifecycleId).directory, "evidence"));
      const completion = coordinatorCompletion(prior.coordinator.phase);
      return {
        schema: "pipeline.close-coordinator.apply.v1",
        status: "replayed",
        phase: prior.coordinator.phase,
        completion,
        identity: { lifecycleId: prior.coordinator.lifecycleId, featureId: prior.coordinator.featureId },
        integrity: { coordinatorStateSha256: lifecycleDigest(prior.coordinator), persistedRecordSha256: prior.rawDigest },
        stateSha256: lifecycleDigest(prior.coordinator),
        rawSha256: prior.rawDigest,
        evidenceDirectory,
      };
    }
    fail("CLOSE-EXISTS", "a different coordinator already owns this lifecycle");
  }
  const stored = storeCloseCoordinator({ gitCommonDir: common, coordinator: plan.coordinator, expectedRawSha256: null });
  const evidenceDirectory = ensurePrivateDirectory(join(publicationClosePaths(common, plan.lifecycleId).directory, "evidence"));
  const completion = coordinatorCompletion(plan.coordinator.phase);
  return {
    schema: "pipeline.close-coordinator.apply.v1",
    status: "applied",
    phase: plan.coordinator.phase,
    completion,
    identity: { lifecycleId: plan.coordinator.lifecycleId, featureId: plan.coordinator.featureId },
    integrity: { coordinatorStateSha256: lifecycleDigest(plan.coordinator), persistedRecordSha256: stored.rawDigest },
    stateSha256: lifecycleDigest(plan.coordinator),
    rawSha256: stored.rawDigest,
    evidenceDirectory,
  };
}
function applyTransition(values, suppliedDigest) {
  const root = physicalRoot(values.root);
  const common = gitCommonDir(root);
  const prior = readCloseCoordinator(common, values.lifecycle);
  const priorEffect = prior.coordinator.effects.at(-1);
  if (prior.coordinator.phase === values.phase) {
    if (priorEffect?.operationSha256 === suppliedDigest) {
      const completion = coordinatorCompletion(prior.coordinator.phase);
      return {
        schema: "pipeline.close-coordinator.apply.v1",
        status: "replayed",
        phase: prior.coordinator.phase,
        completion,
        identity: { lifecycleId: prior.coordinator.lifecycleId, featureId: prior.coordinator.featureId },
        integrity: { coordinatorStateSha256: lifecycleDigest(prior.coordinator), persistedRecordSha256: prior.rawDigest },
        stateSha256: lifecycleDigest(prior.coordinator),
        rawSha256: prior.rawDigest,
      };
    }
    if (!(values.phase === "cleanup-complete"
      && prior.coordinator.cleanup.status === "uncertain")) {
      fail("CLOSE-REPLAY", "transition conflicts with the durable phase");
    }
  }
  const plan = transitionPlan(values);
  if (plan.planSha256 !== suppliedDigest) fail("CLOSE-PLAN", "transition plan digest drifted");
  const stored = readCloseCoordinator(common, plan.lifecycleId);
  if (stored.rawDigest !== plan.expectedRawSha256 || lifecycleDigest(stored.coordinator) !== plan.expectedStateSha256) fail("CLOSE-CAS", "coordinator changed after planning");
  const next = advanceCloseCoordinator(stored.coordinator, {
    ...plan.advance,
    operationSha256: suppliedDigest,
  });
  const saved = storeCloseCoordinator({ gitCommonDir: common, coordinator: next, expectedRawSha256: stored.rawDigest });
  const result = {
    schema: "pipeline.close-coordinator.apply.v1",
    status: saved.written ? "applied" : "replayed",
    phase: next.phase,
    completion: coordinatorCompletion(next.phase),
    identity: { lifecycleId: next.lifecycleId, featureId: next.featureId },
    integrity: { coordinatorStateSha256: lifecycleDigest(next), persistedRecordSha256: saved.rawDigest },
    stateSha256: lifecycleDigest(next),
    rawSha256: saved.rawDigest,
  };
  if (next.phase === "feature-close-prepared") {
    result.nextAction = {
      executable: process.execPath,
      argv: [
        STATE_WRITER,
        "close-feature",
        "--by", plan.actor,
        "--coordinator-lifecycle", next.lifecycleId,
        "--coordinator-sha256", lifecycleDigest(next),
      ],
      mutation: true,
      requiresConfirmation: true,
      expected: { exitCode: 0, coordinatorPhase: "feature-close-prepared" },
    };
    if (values.continuityCloseRequest !== undefined) {
      result.nextAction.argv.push(
        "--continuity-close-request",
        values.continuityCloseRequest,
      );
    }
  }
  return result;
}

const [command, ...argv] = process.argv.slice(2);
try {
  if (command === "next" && argv.length === 1 && COORDINATOR_PHASES.includes(argv[0])) {
    const completion = coordinatorCompletion(argv[0]);
    emit({
      schema: "pipeline.close-coordinator.next.v1",
      phase: argv[0],
      next: completion.next,
      terminal: completion.workflowTerminal,
      completion,
    });
  } else if (command === "inspect") {
    const parsed = exactArgs(argv, new Set(["root", "lifecycle"]));
    if (!parsed || !parsed.values.root || !ID.test(parsed.values.lifecycle ?? "")) fail("CLOSE-ARGS", "inspect arguments invalid");
    const root = physicalRoot(parsed.values.root);
    const common = gitCommonDir(root);
    const stored = readCloseCoordinator(common, parsed.values.lifecycle);
    emit({
      schema: "pipeline.close-coordinator.inspect.v1",
      coordinator: stored.coordinator,
      completion: coordinatorCompletion(stored.coordinator.phase),
      identity: { lifecycleId: stored.coordinator.lifecycleId, featureId: stored.coordinator.featureId },
      integrity: { coordinatorStateSha256: lifecycleDigest(stored.coordinator), persistedRecordSha256: stored.rawDigest },
      stateSha256: lifecycleDigest(stored.coordinator),
      rawSha256: stored.rawDigest,
      evidenceDirectory: join(publicationClosePaths(common, parsed.values.lifecycle).directory, "evidence"),
      next: coordinatorNextPhases(stored.coordinator.phase),
    });
  } else if (command === "plan-start" || command === "apply-start") {
    const parsed = exactArgs(argv, new Set(["root", "lifecycle", "actor", "close-intent", "plan-sha256"]), new Set(["activate"]));
    if (!parsed || !parsed.values.root || !parsed.values.lifecycle || !parsed.values.actor || !CLOSE_INTENTS.has(parsed.values["close-intent"])) fail("CLOSE-INTENT", `${command} requires --close-intent durable-stop or runtime-transfer`);
    const values = { root: parsed.values.root, lifecycle: parsed.values.lifecycle, actor: parsed.values.actor, closeIntent: parsed.values["close-intent"] };
    if (command === "plan-start") {
      if (parsed.values["plan-sha256"] || parsed.booleans.activate) fail("CLOSE-ARGS", "plan-start is read-only");
      emit(startPlan(values));
    } else {
      if (!parsed.booleans.activate || !SHA256.test(parsed.values["plan-sha256"] ?? "")) fail("CLOSE-ACTIVATE", "apply-start requires exact digest and activation");
      emit(applyStart(values, parsed.values["plan-sha256"]));
    }
  } else if (command === "plan-transition" || command === "apply-transition") {
    const parsed = exactArgs(argv, new Set([
      "root", "lifecycle", "actor", "phase", "evidence", "publication",
      "continuity-close-request", "plan-sha256",
    ]), new Set(["activate", "authorized"]));
    if (!parsed || !parsed.values.root || !parsed.values.lifecycle || !parsed.values.actor || !parsed.values.phase) fail("CLOSE-ARGS", `${command} arguments invalid`);
    const values = {
      root: parsed.values.root,
      lifecycle: parsed.values.lifecycle,
      actor: parsed.values.actor,
      phase: parsed.values.phase,
      evidence: parsed.values.evidence,
      publication: parsed.values.publication,
      continuityCloseRequest: parsed.values["continuity-close-request"],
      authorized: parsed.booleans.authorized === true,
    };
    if (command === "plan-transition") {
      if (parsed.values["plan-sha256"] || parsed.booleans.activate) fail("CLOSE-ARGS", "plan-transition is read-only");
      emit(transitionPlan(values));
    } else {
      if (!parsed.booleans.activate || !SHA256.test(parsed.values["plan-sha256"] ?? "")) fail("CLOSE-ACTIVATE", "apply-transition requires exact digest and activation");
      emit(applyTransition(values, parsed.values["plan-sha256"]));
    }
  } else {
    fail("CLOSE-COMMAND", "unsupported close-coordinator command");
  }
} catch (error) {
  emit({
    schema: "pipeline.close-coordinator.error.v1",
    status: "refused",
    code: error?.code ?? "CLOSE-FAILED",
    message: error instanceof Error ? error.message : "close coordinator failed",
  }, 2);
}
