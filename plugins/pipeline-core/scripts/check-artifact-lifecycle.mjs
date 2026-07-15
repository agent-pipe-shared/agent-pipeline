#!/usr/bin/env node
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
  if (machinePath) {
    const text = readUtf8(join(root, machinePath), findings, "machine pipeline state");
    try {
      const machine = JSON.parse(text);
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
          if (!artifact || !bound || bound.path !== artifact.path || bound.sha256 !== sha256File(root, artifact.path)) {
            findings.push(`machine state artifactAuthority.${kind} must bind the active ${kind} path and digest`);
          }
        }
      }
    } catch {
      findings.push("machine pipeline state is not parseable JSON");
    }
  }
  if (!Array.isArray(status.humanRequiredText) || status.humanRequiredText.length === 0) {
    findings.push("artifactLifecycle.status.humanRequiredText must carry bounded status markers");
  } else if (humanPath) {
    const human = readUtf8(join(root, humanPath), findings, "human state") ?? "";
    for (const marker of status.humanRequiredText) {
      if (typeof marker !== "string" || marker.length === 0 || !human.includes(marker)) findings.push("human state does not contain a required status marker");
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
