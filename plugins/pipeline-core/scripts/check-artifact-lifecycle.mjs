#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Opt-in lifecycle authority checker.
 *
 * A rigor-1/2 feature opts in by placing one `artifactLifecycle` object with
 * schema `pipeline.artifact-lifecycle.v1` inside the Result's single
 * `pipeline-result` block, then running this checker with `--result <path>`.
 * No argument deliberately means no opt-in: consumer repositories retain their
 * existing lifecycle instead of being guessed into Phase-2.6 rules.
 */
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
export const LIFECYCLE_SCHEMA = "pipeline.artifact-lifecycle.v1";
export const CANONICAL_HUMAN_STATE_PATH = "docs/state.md";
export const CANONICAL_MACHINE_STATE_PATH = ".claude/pipeline-state.json";
export const CLOSE_LIFECYCLE_STATUS = Object.freeze({
  intent: "close-intent",
  "state-cas": "close-cas",
  verified: "close-verified",
  delivered: "close-delivered",
  readback: "close-readback",
  closed: "closed",
});

const OWNERSHIP = Object.freeze({
  prd: "product-intent",
  spec: "implementation-contract",
  result: "execution-evidence",
  pipelineState: "active-queue-gate-blocker-resume-only",
  humanState: "bounded-operational-projection",
  backlog: "unresolved-future-work-not-active-status",
  changelog: "released-user-visible-delta-not-work-in-progress",
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(root, value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) return null;
  const candidate = resolve(root, value);
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)) ? rel.replaceAll("\\", "/") : null;
}

function readUtf8(path, findings, label) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    findings.push(`${label} is missing or unreadable`);
    return null;
  }
}

function readableFile(root, relPath, findings, label) {
  const safe = safeRelativePath(root, relPath);
  if (!safe) {
    findings.push(`${label} must be a repository-relative path`);
    return null;
  }
  try {
    if (!statSync(join(root, safe)).isFile()) {
      findings.push(`${label} must name a regular file`);
      return null;
    }
  } catch {
    findings.push(`${label} is missing`);
    return null;
  }
  return safe;
}

function sha256File(root, relPath) {
  return createHash("sha256").update(readFileSync(join(root, relPath))).digest("hex");
}

/** Parse exactly one Result JSON code block without accepting a second authority block. */
export function parsePipelineResult(text) {
  const matches = [...text.matchAll(/^```pipeline-result\s*\n([\s\S]*?)^```\s*$/gm)];
  if (matches.length !== 1) return { ok: false, reason: `expected exactly one pipeline-result block, found ${matches.length}` };
  try {
    const value = JSON.parse(matches[0][1]);
    return isObject(value) ? { ok: true, value } : { ok: false, reason: "pipeline-result block must contain a JSON object" };
  } catch (error) {
    return { ok: false, reason: `pipeline-result block is not parseable JSON (${error.message})` };
  }
}

export function loadLifecycleMetadata(root = DEFAULT_ROOT, resultPath) {
  const findings = [];
  const resultRel = readableFile(root, resultPath, findings, "Result path");
  if (!resultRel) return { ok: false, findings, result: null, metadata: null, resultPath: null };
  const parsed = parsePipelineResult(readUtf8(join(root, resultRel), findings, "Result") ?? "");
  if (!parsed.ok) findings.push(parsed.reason);
  const metadata = parsed.ok && isObject(parsed.value.artifactLifecycle) ? parsed.value.artifactLifecycle : null;
  if (!metadata) findings.push("Result must declare artifactLifecycle metadata");
  return { ok: findings.length === 0, findings, result: parsed.ok ? parsed.value : null, metadata, resultPath: resultRel };
}

function activeByKind(artifacts, kind) {
  return artifacts.filter((artifact) => artifact?.kind === kind && artifact?.state === "active");
}

function sha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function oid(value) {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
}

function closedKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isObject(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

const CLOSE_KEYS = ["intentId", "expectedRevision", "authorityDigests", "graphSha256", "packageBindingsSha256", "resultDigest", "receiptId", "receiptSha256", "candidateCommit", "candidateTree", "stage1Verify", "phase", "finalVerify", "delivery"];
const RESULT_INTENT_KEYS = ["intentId", "expectedRevision", "authorityDigests", "graphSha256", "packageBindingsSha256", "receiptId", "receiptSha256", "candidateCommit", "candidateTree", "stage1Verify", "phase", "finalVerify", "delivery"];
const VERIFY_KEYS = ["commandSha256", "resultSha256", "candidateCommit", "candidateTree"];
const DELIVERY_KEYS = ["pushedOid", "fetchedOid"];
const HUMAN_LIFECYCLE_MARKERS = Object.freeze([
  "implementation-active", "close-intent", "close-cas", "close-verified",
  "close-delivered", "close-readback", "closed", "candidate-handoff",
  "pending-candidate-handoff", "handoff", "phase-close", "PO-closed",
]);

function validVerify(value, transition, exactCandidate) {
  return closedKeys(value, VERIFY_KEYS)
    && sha256(value.commandSha256) && sha256(value.resultSha256)
    && oid(value.candidateCommit) && oid(value.candidateTree)
    && (!exactCandidate || (value.commandSha256 === transition.stage1Verify.commandSha256
      && value.candidateCommit === transition.candidateCommit && value.candidateTree === transition.candidateTree));
}

function validIntentFields(value) {
  return isObject(value)
    && typeof value.intentId === "string" && value.intentId.length > 0
    && Number.isSafeInteger(value.expectedRevision) && value.expectedRevision >= 0
    && closedKeys(value.authorityDigests, ["prdSha256", "specSha256", "resultSha256"])
    && sha256(value.authorityDigests.prdSha256) && sha256(value.authorityDigests.specSha256)
    && (value.authorityDigests.resultSha256 === null || sha256(value.authorityDigests.resultSha256))
    && sha256(value.graphSha256) && sha256(value.packageBindingsSha256)
    && typeof value.receiptId === "string" && value.receiptId.length > 0 && sha256(value.receiptSha256)
    && oid(value.candidateCommit) && oid(value.candidateTree)
    && validVerify(value.stage1Verify, value, false);
}

function validResultIntentProjection(value) {
  return closedKeys(value, RESULT_INTENT_KEYS)
    && validIntentFields(value)
    && value.phase === "intent"
    && value.finalVerify === null
    && value.delivery === null;
}

function validCloseProjection(value) {
  if (!closedKeys(value, CLOSE_KEYS) || !validIntentFields(value) || !sha256(value.resultDigest)
    || value.phase === "intent") return false;
  if (value.phase === "state-cas") return value.finalVerify === null && value.delivery === null;
  if (!validVerify(value.finalVerify, value, true)) return false;
  if (value.phase === "verified") return value.delivery === null;
  if (!closedKeys(value.delivery, DELIVERY_KEYS) || !oid(value.delivery.pushedOid)
    || !(value.delivery.fetchedOid === null || oid(value.delivery.fetchedOid))) return false;
  if (value.delivery.pushedOid !== value.candidateCommit) return false;
  if (value.phase === "delivered") return value.delivery.fetchedOid === null;
  return value.delivery.fetchedOid === value.delivery.pushedOid;
}

/** Derive the single status instead of accepting competing status prose. */
export function deriveCloseLifecycleStatus(resultTransition, machineTransition) {
  const hasResultTransition = resultTransition !== undefined && resultTransition !== null;
  const hasMachineTransition = machineTransition !== undefined && machineTransition !== null;
  if (!hasResultTransition && !hasMachineTransition) return { ok: true, status: "implementation-active" };
  if (!hasResultTransition) return { ok: false, reason: "machine closeTransition has no Result counterpart" };
  if (!validResultIntentProjection(resultTransition)) return { ok: false, reason: "Result closeTransition must be an immutable valid intent" };
  if (!hasMachineTransition) return { ok: true, status: CLOSE_LIFECYCLE_STATUS.intent };
  if (!validCloseProjection(machineTransition)) return { ok: false, reason: "machine closeTransition is missing or invalid" };
  const immutableKeys = ["intentId", "expectedRevision", "authorityDigests", "graphSha256", "packageBindingsSha256", "receiptId", "receiptSha256", "candidateCommit", "candidateTree", "stage1Verify"];
  if (immutableKeys.some((key) => canonicalJson(resultTransition[key]) !== canonicalJson(machineTransition[key]))) {
    return { ok: false, reason: "Result intent and machine close transition differ" };
  }
  return { ok: true, status: CLOSE_LIFECYCLE_STATUS[machineTransition.phase] };
}

/** Return bounded lifecycle-projection findings suitable for the CLI and tests. */
export function validateCloseLifecycleProjection(resultTransition, machineTransition, status, resultStatus, machinePhase) {
  const derived = deriveCloseLifecycleStatus(resultTransition, machineTransition);
  if (!derived.ok) return [derived.reason];
  const findings = [];
  if (status?.lifecycleStatus !== derived.status) findings.push("artifactLifecycle.status.lifecycleStatus does not match the derived close lifecycle status");
  if (status?.phase !== derived.status) findings.push("artifactLifecycle.status.phase does not match the derived close lifecycle status");
  if (status?.resultStatus !== derived.status || resultStatus !== derived.status) findings.push("Result status does not match the derived close lifecycle status");
  if (machinePhase !== derived.status) findings.push("machine state activeFeature.phase does not match the derived close lifecycle status");
  return findings;
}

function resultIntentBindsActiveAuthorities(transition, activeDigests) {
  return isObject(transition)
    && isObject(transition.authorityDigests)
    && transition.authorityDigests.prdSha256 === activeDigests.prdSha256
    && transition.authorityDigests.specSha256 === activeDigests.specSha256;
}

function machineTransitionBindsResultEvidence(transition, activeDigests) {
  return resultIntentBindsActiveAuthorities(transition, activeDigests)
    && transition.resultDigest === activeDigests.resultSha256;
}

/**
 * Validate the closed artifact inventory and its bounded status projection.
 * The inventory is deliberately explicit: old files elsewhere in a repository
 * are not inferred to be part of a new feature merely because their filenames
 * contain PRD/Spec/Result-like words.
 */
export function checkArtifactLifecycle(root = DEFAULT_ROOT, resultPath) {
  const loaded = loadLifecycleMetadata(root, resultPath);
  const findings = [...loaded.findings];
  if (!loaded.metadata || !loaded.result || !loaded.resultPath) return { ok: false, findings };
  const { metadata, result, resultPath: actualResultPath } = loaded;

  if (metadata.schema !== LIFECYCLE_SCHEMA) findings.push(`artifactLifecycle.schema must equal ${LIFECYCLE_SCHEMA}`);
  if (typeof metadata.featureId !== "string" || metadata.featureId.length === 0) findings.push("artifactLifecycle.featureId is required");
  if (!Array.isArray(metadata.artifacts)) findings.push("artifactLifecycle.artifacts must be an array");
  const artifacts = Array.isArray(metadata.artifacts) ? metadata.artifacts : [];
  const seenPaths = new Set();
  const allowedKinds = new Set(["prd", "spec", "result", "receipt", "amendment", "archive"]);

  for (const [index, artifact] of artifacts.entries()) {
    const label = `artifactLifecycle.artifacts[${index}]`;
    if (!isObject(artifact)) {
      findings.push(`${label} must be an object`);
      continue;
    }
    if (!allowedKinds.has(artifact.kind)) findings.push(`${label}.kind is not recognized`);
    const path = readableFile(root, artifact.path, findings, `${label}.path`);
    if (path && seenPaths.has(path)) findings.push(`${label}.path duplicates another artifact path`);
    if (path) seenPaths.add(path);
    if (!["active", "historical", "folded"].includes(artifact.state)) findings.push(`${label}.state must be active, historical, or folded`);
    if (typeof artifact.authority !== "boolean") findings.push(`${label}.authority must be explicit boolean`);
    if (artifact.state === "active" && artifact.authority !== true) findings.push(`${label} is active and must explicitly set authority=true`);
    if (artifact.state !== "active" && artifact.authority !== false) findings.push(`${label} is historical/folded and must explicitly set authority=false`);
    if ((artifact.kind === "receipt" || artifact.kind === "archive") && artifact.authority !== false) {
      findings.push(`${label} is evidence/history and must explicitly set authority=false`);
    }
    if (artifact.kind === "amendment") {
      if (artifact.state === "active") findings.push(`${label} is an active standalone amendment`);
      if (["historical", "folded"].includes(artifact.state) && typeof artifact.supersededBy !== "string") {
        findings.push(`${label} must bind supersededBy when historical or folded`);
      }
    }
  }

  for (const kind of ["prd", "spec"]) {
    const active = activeByKind(artifacts, kind);
    if (active.length !== 1) findings.push(`exactly one active ${kind.toUpperCase()} is required (found ${active.length})`);
  }
  const activeResults = activeByKind(artifacts, "result");
  if (activeResults.length > 1) findings.push(`at most one active Result is allowed (found ${activeResults.length})`);
  if (activeResults.length !== 1) findings.push("an opted-in lifecycle Result must itself be the one active Result");

  const activePrd = activeByKind(artifacts, "prd")[0];
  const activeSpec = activeByKind(artifacts, "spec")[0];
  const activeResult = activeResults[0];
  if (activeResult && safeRelativePath(root, activeResult.path) !== actualResultPath) {
    findings.push("active Result path must be the Result that carries artifactLifecycle metadata");
  }

  const activeAuthorityPaths = new Set([activePrd?.path, activeSpec?.path, activeResult?.path].filter(Boolean));
  for (const [index, artifact] of artifacts.entries()) {
    if (artifact?.kind === "amendment" && ["historical", "folded"].includes(artifact.state)) {
      if (!activeAuthorityPaths.has(artifact.supersededBy)) {
        findings.push(`artifactLifecycle.artifacts[${index}].supersededBy must name an active PRD or Spec`);
      }
    }
  }

  if (!isObject(result.authorities)) {
    findings.push("pipeline-result authorities object is required");
  } else {
    for (const [kind, artifact] of [["prd", activePrd], ["spec", activeSpec], ["result", activeResult]]) {
      if (artifact && result.authorities[kind] !== artifact.path) findings.push(`pipeline-result authorities.${kind} must equal the active ${kind} path`);
    }
  }

  if (!isObject(metadata.ownership) || Object.keys(OWNERSHIP).some((key) => metadata.ownership[key] !== OWNERSHIP[key])) {
    findings.push("artifactLifecycle.ownership must declare the closed PRD/Spec/Result/state/backlog/changelog ownership map");
  }

  const status = metadata.status;
  if (!isObject(status)) {
    findings.push("artifactLifecycle.status is required");
    return { ok: false, findings };
  }
  if (status.machineStatePath !== CANONICAL_MACHINE_STATE_PATH) findings.push(`artifactLifecycle.status.machineStatePath must equal ${CANONICAL_MACHINE_STATE_PATH}`);
  if (status.humanStatePath !== CANONICAL_HUMAN_STATE_PATH) findings.push(`artifactLifecycle.status.humanStatePath must equal ${CANONICAL_HUMAN_STATE_PATH}`);
  const machinePath = readableFile(root, CANONICAL_MACHINE_STATE_PATH, findings, "canonical machine pipeline state");
  const humanPath = readableFile(root, CANONICAL_HUMAN_STATE_PATH, findings, "canonical human state");
  if (typeof status.phase !== "string" || status.phase.length === 0 || typeof status.resultStatus !== "string" || status.resultStatus.length === 0) {
    findings.push("artifactLifecycle.status must bind phase and resultStatus");
  }
  if (result.status !== status.resultStatus) findings.push("Result status does not match artifactLifecycle.status.resultStatus");
  let machine = null;
  if (machinePath) {
    const text = readUtf8(join(root, machinePath), findings, "machine pipeline state");
    try {
      machine = JSON.parse(text);
      if (machine?.activeFeature?.id !== metadata.featureId) findings.push("machine state activeFeature.id does not match artifactLifecycle.featureId");
      if (machine?.activeFeature?.phase !== status.phase) findings.push("machine state activeFeature.phase does not match artifactLifecycle.status.phase");
      if (machine?.activeFeature?.planPath !== activePrd?.path) findings.push("machine state activeFeature.planPath does not match the active PRD path");
      // The control plane need not already have the Phase-2.6 continuity
      // writer installed.  The stable machine-side binding is deliberately an
      // additive data-only map: old writers preserve it and new writers may
      // carry it forward, while this gate still binds all three documents to
      // the actual machine state rather than trusting Result metadata alone.
      const authority = machine?.artifactAuthority;
      if (!authority || typeof authority !== "object") {
        findings.push("machine state artifactAuthority is required to bind the active PRD/Spec/Result");
      } else {
        for (const [kind, artifact] of [["prd", activePrd], ["spec", activeSpec], ["result", activeResult]]) {
          const bound = authority[kind];
          const resultFirstIntent = kind === "result" && metadata.closeTransition?.phase === "intent"
            && bound?.sha256 === metadata.closeTransition.authorityDigests?.resultSha256;
          if (!artifact || !bound || bound.path !== artifact.path
            || (bound.sha256 !== sha256File(root, artifact.path) && !resultFirstIntent)) {
            findings.push(`machine state artifactAuthority.${kind} must bind the active ${kind} path and digest`);
          }
        }
      }
    } catch {
      findings.push("machine pipeline state is not parseable JSON");
    }
  }
  // P3 is additive: legacy opted-in lifecycle Results retain their existing
  // bounded projection until they declare a close transition. Once declared,
  // Result intent and Continuity State are reconciled as one lifecycle.
  const hasResultTransition = metadata.closeTransition !== undefined && metadata.closeTransition !== null;
  const hasMachineTransition = machine?.closeTransition !== undefined && machine?.closeTransition !== null;
  const transitionDeclared = hasResultTransition || hasMachineTransition;
  const resultTransition = hasResultTransition ? metadata.closeTransition : undefined;
  const machineTransition = hasMachineTransition ? machine.closeTransition : undefined;
  const derivedClose = transitionDeclared
    ? deriveCloseLifecycleStatus(resultTransition, machineTransition)
    : null;
  if (transitionDeclared) {
    for (const finding of validateCloseLifecycleProjection(
      resultTransition,
      machineTransition,
      status,
      result.status,
      machine?.activeFeature?.phase,
    )) findings.push(finding);
    const activeDigests = {
      prdSha256: activePrd ? sha256File(root, activePrd.path) : null,
      specSha256: activeSpec ? sha256File(root, activeSpec.path) : null,
      resultSha256: activeResult ? sha256File(root, activeResult.path) : null,
    };
    if (hasResultTransition && !resultIntentBindsActiveAuthorities(resultTransition, activeDigests)) {
      findings.push("Result closeTransition must bind the active PRD/Spec digests; its Result digest is the pre-append input binding");
    }
    if (hasMachineTransition && !machineTransitionBindsResultEvidence(machineTransition, activeDigests)) {
      findings.push("machine closeTransition must bind active PRD/Spec digests and the active Result digest through resultDigest");
    }
  }

  let human = null;
  if (!Array.isArray(status.humanRequiredText) || status.humanRequiredText.length === 0) {
    findings.push("artifactLifecycle.status.humanRequiredText must carry bounded status markers");
  } else if (humanPath) {
    human = readUtf8(join(root, humanPath), findings, "human state") ?? "";
    for (const marker of status.humanRequiredText) {
      if (typeof marker !== "string" || marker.length === 0 || !human.includes(marker)) findings.push("human state does not contain a required status marker");
    }
  }
  if (transitionDeclared && derivedClose?.ok) {
    const expected = derivedClose.status;
    if (!Array.isArray(status.humanRequiredText) || status.humanRequiredText.length !== 1
      || status.humanRequiredText[0] !== expected) {
      findings.push("artifactLifecycle.status.humanRequiredText must contain exactly the derived lifecycle marker");
    }
    if (human !== null) {
      const present = HUMAN_LIFECYCLE_MARKERS.filter((marker) => human.includes(marker));
      if (!present.includes(expected)) findings.push("human state does not contain the derived lifecycle marker");
      if (present.some((marker) => marker !== expected)) findings.push("human state contains contradictory lifecycle markers");
    }
  }

  const backlogPath = readableFile(root, status.backlogPath, findings, "artifactLifecycle.status.backlogPath");
  const changelogPath = readableFile(root, status.changelogPath, findings, "artifactLifecycle.status.changelogPath");
  if (backlogPath && !(readUtf8(join(root, backlogPath), findings, "Backlog") ?? "").includes("Backlog owns unresolved future work, not active task status.")) {
    findings.push("Backlog does not declare its non-active-status ownership boundary");
  }
  if (changelogPath && !(readUtf8(join(root, changelogPath), findings, "Changelog") ?? "").includes("Changelog owns released user-visible delta, not work-in-progress completion.")) {
    findings.push("Changelog does not declare its work-in-progress ownership boundary");
  }
  return { ok: findings.length === 0, findings };
}

function cliArgs(argv) {
  const index = argv.indexOf("--result");
  return index === -1 ? null : argv[index + 1] ?? null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const resultPath = cliArgs(process.argv.slice(2));
  if (!resultPath) {
    console.log("SKIP artifact lifecycle: no --result metadata supplied (explicit rigor-1/2 opt-in only).");
    process.exit(0);
  }
  const checked = checkArtifactLifecycle(DEFAULT_ROOT, resultPath);
  if (!checked.ok) {
    for (const finding of checked.findings) console.error(`FAIL artifact lifecycle: ${finding}`);
    process.exit(2);
  }
  console.log("Artifact lifecycle authority and bounded status projection are valid.");
}
