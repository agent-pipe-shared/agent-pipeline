#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readDispatchBudgetLaunchObservation } from "../lib/dispatch-budget-launch-observation.mjs";

import { CriticCorrectionInputBindingsError, PROJECT_STATE_CONVENTION_DIRECTORIES, PROJECT_STATE_CONVENTION_FILES, deriveCriticCorrectionInputBindings, historyPathsInBindings } from "../lib/critic-correction-input-bindings.mjs";

/**
 * Read-only admission for a path-only Critic dispatch.
 *
 * This intentionally does less than critic-packet-preflight: it never creates
 * a checkout, packet, child, or receipt.  Its only job is to prove that the
 * Elephant's proposed request is internally coherent before an independent
 * Critic is asked to spend a turn on it.  It does not probe or select a
 * runner, so a packet-ready result is deliberately not a spawn authorization.
 */
import { createHash, randomBytes } from "node:crypto";
import { CRITIC_DIAGNOSTIC_SCHEMA, inspectCriticVerifyDiagnostic, validateCriticDiagnostic } from "../lib/critic-diagnostic-evidence.mjs";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";
import { describeArchitectureCurrencyRefusal, inspectArchitecturePushCurrency } from "../lib/architecture-push-currency.mjs";
import { isSafeTaskId } from "../lib/dispatch-record.mjs";
import { evaluateReviewAdmission } from "../lib/review-admission-read.mjs";
import { criticCoverageAdvisory, listUncoveredCriticRecords, terminalAuthoredDelivery, walkDispatchRecordsForReview } from "../lib/review-admission-read.mjs";
import { criticDisposition } from "../lib/critic-skip-decision.mjs";
import { SAFE_ID, admitRequestPlaceholderPaths } from "../lib/session-critic-finalizer-read.mjs";
import { SPLIT_MAX_ENTRIES, buildCriticSplit } from "../lib/critic-split.mjs";
import { loadProjectRoutingRegistry } from "../lib/runner-profiles-v3.mjs";
import {
  CriticGuardrailDerivationError,
  deriveRequiredCriticGuardrails,
} from "../lib/critic-required-guardrails.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import {
  RequirementTraceabilityError,
  evaluateRequirementTraceability,
} from "../lib/requirement-traceability.mjs";
import { criticCourseParentDetail, criticCourseParentRepair, criticCourseRepair, deriveCriticCourseRegistrationCommit, readCriticCourseAdmission } from "../lib/critic-course-admission.mjs";
import { CRITIC_DISPATCH_LIMITS, sha256Canonical } from "../lib/review-economy.mjs";
import { criticRunnerFromEnv, describeCriticRouteAssurance } from "../lib/critic-route-assurance.mjs";

export const CRITIC_DISPATCH_PREFLIGHT_SCHEMA = "pipeline.critic-dispatch-preflight.v1";
export const EVIDENCE_SWEEP_SCHEMA = "pipeline.critic-dispatch-preflight-evidence-sweep.v1";

/**
 * The directory kinds ADR-0063 names as candidate homes for evidence: the
 * ignored, machine-regenerated repo-root directory, and the tracked, durable
 * citation-target directories (`backlog/evidence/` is fixed; `specs/*\/evidence/`
 * is one instance per feature package and is discovered at sweep time).
 */
const FIXED_EVIDENCE_LOCATIONS = [
  { dir: "evidence", locationClass: "machine-regenerated (ignored, repo-root evidence/)" },
  { dir: "backlog/evidence", locationClass: "durable citation target (tracked, backlog/evidence/)" },
];
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const PATH_MAX = 240;
const EVIDENCE_MAX_BYTES = 1024 * 1024;
const CANDIDATE_SOURCE_MAX_BYTES = 16 * 1024 * 1024;

export class CriticDispatchPreflightError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "CriticDispatchPreflightError";
    this.code = code;
    this.details = details;
  }
}

// Only failures created at this producer's own branches supply typed source codes.
// A foreign thrown value is rethrown unchanged and observed as CDP-UNEXPECTED.
const sourceFailureCodes = new WeakMap();
function fail(code, message, details = null) {
  const error = new CriticDispatchPreflightError(code, message, details);
  sourceFailureCodes.set(error, code);
  throw error;
}

/** Trusted synchronous callback; its return and failures cannot affect admission. */
function observeSource(observer, stage, outcome, code, candidate, specSha256) {
  if (typeof observer !== "function") return;
  try {
    observer({
      schema: "pipeline.critic-preflight-observation.v1",
      producer: "critic-dispatch-preflight",
      observationRevision: 1,
      stage, outcome, code,
      candidate: candidate === null ? null : { commit: candidate.commit, tree: candidate.tree },
      specSha256,
    });
  } catch {
    // Observation cannot replace the already chosen producer result/exception.
  }
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function normalizePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > PATH_MAX || value.trim() !== value
    || value.includes("\\") || value.includes("\0") || isAbsolute(value) || value.startsWith("./") || value.endsWith("/")) {
    fail("CDP-PATH", `${label} must be a bounded normalized repository-relative path: relative to the repository root, no leading "./" or "/", no trailing "/", no backslash, no ".." segment (for example "specs/<feature>/spec.md").`);
  }
  if (value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail("CDP-PATH", `${label} must be a bounded normalized repository-relative path: relative to the repository root, no leading "./" or "/", no trailing "/", no backslash, no ".." segment (for example "specs/<feature>/spec.md").`);
  }
  return value;
}

function uniquePaths(values, label) {
  if (!Array.isArray(values)) fail("CDP-PATHS", `${label} must be an array.`);
  const paths = values.map((path) => normalizePath(path, label)).sort(compare);
  if (new Set(paths).size !== paths.length) fail("CDP-DUPLICATE-PATH", `${label} contains a duplicate path.`);
  return paths;
}

function currentArtifactScope(value) {
  if (!isObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["kind", "paths"])) {
    fail("CDP-SCOPE", "Current-artifact review scope must be closed.");
  }
  if (value.kind !== "current-artifacts") fail("CDP-SCOPE", "Unsupported current-artifact review scope.");
  const paths = uniquePaths(value.paths, "current-artifact path");
  if (paths.length === 0 || paths.length > 128 || JSON.stringify(paths) !== JSON.stringify(value.paths)) {
    fail("CDP-SCOPE", "Current-artifact paths must be nonempty lexical unique paths.");
  }
  return { kind: "current-artifacts", paths };
}

function gitOrNull(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!isSuccessfulSpawn(result)) return null;
  return String(result.stdout).trim();
}

function git(root, args) {
  const value = gitOrNull(root, args);
  if (value === null) fail("CDP-GIT", `Git observation failed for ${args[0]}.`);
  return value;
}

/**
 * A root commit has no parent, so the base a caller offers it is the empty
 * tree -- and `^{commit}` peeling of the empty tree fails, because the empty
 * tree is not a commit. Diffing a commit against the empty tree is ordinary,
 * well-defined git; only the commit-peel of that one sentinel value is not.
 * Every other base ref still resolves exactly as before: this is one more
 * chance given only to a base that already failed commit-peeling, not a
 * relaxation of what counts as a valid base.
 */
function emptyTreeOid(root) {
  const result = spawnSync("git", ["-C", root, "hash-object", "-t", "tree", "--stdin"], {
    input: "",
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!isSuccessfulSpawn(result)) fail("CDP-GIT", "Git observation failed for hash-object.");
  return String(result.stdout).trim();
}

function resolveBase(root, base) {
  const baseCommit = gitOrNull(root, ["rev-parse", "--verify", `${base}^{commit}`]);
  if (baseCommit !== null) return { commit: baseCommit, tree: git(root, ["rev-parse", `${baseCommit}^{tree}`]) };
  const baseTree = gitOrNull(root, ["rev-parse", "--verify", `${base}^{tree}`]);
  if (baseTree !== null && baseTree === emptyTreeOid(root)) return { commit: null, tree: baseTree };
  fail("CDP-GIT", "Git observation failed for rev-parse.");
}

function candidateText(root, candidate, path) {
  const result = spawnSync("git", ["-C", root, "show", `${candidate}:${path}`], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000,
    maxBuffer: CANDIDATE_SOURCE_MAX_BYTES,
  });
  if (!isSuccessfulSpawn(result)) fail("CDP-CANDIDATE-READ", `Cannot read candidate path: ${path}`);
  return String(result.stdout);
}

function candidateBytes(root, candidate, path) {
  const result = spawnSync("git", ["-C", root, "show", `${candidate}:${path}`], {
    encoding: null,
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000,
    maxBuffer: CANDIDATE_SOURCE_MAX_BYTES,
  });
  if (!isSuccessfulSpawn(result)) fail("CDP-CANDIDATE-READ", `Cannot read candidate path: ${path}`);
  return result.stdout;
}

const CCI_COMMAND_HINT = "Run critic-correction-input-bindings.mjs derive --base <base> --head <candidate> and pass its file as correctionInputBindings";
function checkCorrectionInputBindings(root, baseCommit, candidateCommit, reference, hint = CCI_COMMAND_HINT) {
  let derived;
  try {
    try { derived = deriveCriticCorrectionInputBindings({ repoRoot: root, base: baseCommit, head: candidateCommit }); }
    catch (error) {
      // A repository without a readable project calibration has no project-state class; retained results still count.
      if (error instanceof CriticCorrectionInputBindingsError && error.code === "CCI-CALIBRATION") {
        derived = deriveCriticCorrectionInputBindings({ repoRoot: root, base: baseCommit, head: candidateCommit, projectStateOptional: true });
      } else throw error;
    }
  } catch (error) {
    const code = error instanceof CriticCorrectionInputBindingsError ? error.code : "CCI-UNEXPECTED";
    const detail = error instanceof CriticCorrectionInputBindingsError ? `: ${error.detail}` : "";
    fail("CDP-CORRECTION-INPUT-REFUSED", `Fix the range and rerun the preflight; the bindings derivation refused it with ${code}${detail}.`);
  }
  // N41: a block-history-shaped file in the range collides with the Critic's reference boundary (CR-01a); refuse here, before anything is reserved.
  const historyPaths = historyPathsInBindings(derived);
  if (historyPaths.length > 0) {
    const reason = `The range changes block-history-shaped file(s) that are neither a built-in project-state record (${[...PROJECT_STATE_CONVENTION_FILES, ...PROJECT_STATE_CONVENTION_DIRECTORIES].join(", ")}) nor listed in criticFindingRecordPaths: ${historyPaths.join(", ")}. The Critic may not read history, so the review would stop after its packet was reserved.`;
    const repair = `Add ${historyPaths.map((path) => JSON.stringify(path)).join(", ")} to criticFindingRecordPaths in project/pipeline.json AND to its byte-equal mirror .claude/pipeline.json (each a PO-signed step), commit both, rebuild the candidate and rerun the preflight; or keep the file out of the reviewed range.`;
    fail("CDP-HISTORY-IN-RANGE", reason, { reason, paths: historyPaths, repair });
  }
  if (reference === null || reference === undefined) {
    // D223 (slice 3): no bindings file given, so the preflight uses its own in-memory derivation (the same function the derive verb calls)
    // and reports it, so the Critic packet and the evidence carry it. A given file is still compared below and never silently replaced.
    if (derived.exclusions.length === 0) return null;
    return { path: null, derived: true, digestSha256: derived.digestSha256, bindings: derived };
  }
  const path = normalizePath(reference, "correction input bindings path");
  if (!path.startsWith("scratch/")) fail("CDP-PATH", "correction input bindings path must be under scratch/.");
  let given;
  try { given = JSON.parse(localEvidence(root, path)); } catch { given = null; }
  if (!isObject(given) || given.digestSha256 !== derived.digestSha256 || sha256Canonical(given) !== sha256Canonical(derived)) {
    fail("CDP-CORRECTION-INPUT-STALE", `${hint}; the given bindings file is unreadable or does not match this range.`);
  }
  return { path, digestSha256: derived.digestSha256 };
}

function currentArtifactCoverage(root, candidate, byPath, scope) {
  return scope.paths.map((path) => {
    const file = byPath.get(path);
    if (!file || !file.readable) fail("CDP-SCOPE-PATH", `Current artifact is absent or unreadable in the candidate: ${path}`);
    const row = git(root, ["ls-tree", "-z", candidate, "--", path]);
    const match = row.match(/^(\d{6}) blob ([a-f0-9]+)\t/s);
    if (!match || !OID.test(match[2]) || !["100644", "100755"].includes(match[1])) {
      fail("CDP-SCOPE-MODE", `Current artifact is not a supported regular candidate file: ${path}`);
    }
    const bytes = candidateBytes(root, candidate, path);
    return { path, blobOid: match[2], sha256: sha256(bytes), mode: match[1] };
  });
}

function localEvidence(root, path) {
  const realRoot = realpathSync(root);
  const absolute = resolve(realRoot, path);
  const rel = relative(realRoot, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("CDP-EVIDENCE-PATH", "Evidence path escapes the repository root.");
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > EVIDENCE_MAX_BYTES) fail("CDP-EVIDENCE-FILE", `Evidence is not a bounded regular file: ${path}`);
  return readFileSync(absolute);
}

function matchingCandidateEvidence(bytes, candidateCommit, candidateTree, path, root, spec, guardrails, diagnosticBase = null) {
  let value;
  try { value = JSON.parse(bytes); } catch { fail("CDP-EVIDENCE-JSON", `Evidence is not JSON: ${path}`); }
  // Verify evidence uses the candidate at its root, whereas Security and gate
  // evidence nest it below `candidate` with additional observation metadata.
  // Both forms are valid only when they bind this exact frozen commit/tree.
  const nested = value?.candidate;
  const binding = isObject(nested) && typeof nested.commit === "string" && typeof nested.tree === "string"
    ? nested
    : value;
  if (!isObject(binding) || binding.commit !== candidateCommit || binding.tree !== candidateTree) {
    fail("CDP-EVIDENCE-BINDING", `Evidence is missing or stale for the exact candidate: ${path}`);
  }
  let diagnostic;
  try {
    const candidate = { commit: candidateCommit, tree: candidateTree };
    if (value?.schema === "pipeline.verify-evidence.v0") diagnostic = inspectCriticVerifyDiagnostic(value, candidate);
    else if (value?.schema === CRITIC_DIAGNOSTIC_SCHEMA) diagnostic = validateCriticDiagnostic(value, { root, candidate, spec, guardrails });
    else {
      const reason = `${path} carries schema ${JSON.stringify(typeof value?.schema === "string" ? value.schema : null)}; security evidence is not admitted here. The admitted evidence schemas are pipeline.verify-evidence.v0 (Verify evidence of mode critic) and ${CRITIC_DIAGNOSTIC_SCHEMA} (scripts/critic-diagnostic-evidence.mjs)`;
      fail("CDP-EVIDENCE-SCHEMA", `Unsupported evidence schema: ${path}`, { reason, admittedSchemas: ["pipeline.verify-evidence.v0", CRITIC_DIAGNOSTIC_SCHEMA] });
    }
  } catch (error) {
    if (error instanceof CriticDispatchPreflightError) throw error;
    const diagnosticCode = error.code ?? "CDI-INVALID";
    if (diagnosticCode === "CDI-GUARDRAILS") {
      const requiredGuardrailPaths = guardrails.map((entry) => entry.path);
      // N43: a changed calibration makes `.claude/pipeline.json` required, and the shell guard refuses any command that names that protected path, so the
      // route is the producer's own derivation (`--base`), never a typed `--guardrail`. The exact base is the one this preflight derived the list over.
      const reason = diagnosticBase === null
        ? `${path} lacks required guardrails (${requiredGuardrailPaths.join(", ")}); this review has no commit base to derive them over, so re-produce the diagnostic with one --guardrail per listed path that is not a protected calibration path`
        : `${path} lacks required guardrails (${requiredGuardrailPaths.join(", ")}). Re-produce the diagnostic so the producer derives the required guardrails itself: node \${PIPELINE_PLUGIN_ROOT}/scripts/critic-diagnostic-evidence.mjs --root <root> --spec <spec> --log <evidence log> --out <evidence file> --candidate ${candidateCommit} --base ${diagnosticBase} -- <command>; with --base it adds every required guardrail on its own, so never pass a protected calibration path by --guardrail (the shell guard refuses that command). Keep --base exactly as printed (this preflight's base; a base equal to the candidate derives an empty set). Produce it while HEAD is still the candidate and the tree is clean (CDI-DIRTY-CANDIDATE after any follow-up commit); a second diagnostic for the same candidate gives CCA-DELTA-BINDING until the delta request is registered again`;
      fail("CDP-EVIDENCE-MODE", `Invalid Critic diagnostic evidence: ${path}; the diagnostic lacks required guardrails: ${requiredGuardrailPaths.join(", ")}`, { diagnosticCode, requiredGuardrailPaths, diagnosticBase, reason });
    }
    const reason = value?.schema === "pipeline.verify-evidence.v0"
      ? `A Verify evidence of mode critic is required (${diagnosticCode}); ${path} is not one. Produce it for the exact candidate: node \${PIPELINE_PLUGIN_ROOT}/scripts/verify-evidence-producer.mjs --root <root> --mode critic --out <evidence file>`
      : `${path} is not a valid Critic diagnostic evidence (${diagnosticCode}); produce one with node \${PIPELINE_PLUGIN_ROOT}/scripts/critic-diagnostic-evidence.mjs, or pass a Verify evidence of mode critic (verify-evidence-producer.mjs --root <root> --mode critic --out <evidence file>)`;
    fail("CDP-EVIDENCE-MODE", `Invalid Critic diagnostic evidence: ${path}`, { diagnosticCode, reason });
  }
  return { path, sha256: sha256(bytes), candidate: { commit: candidateCommit, tree: candidateTree }, diagnostic };
}

function requiredCandidateReadback(root, candidate, byPath, paths, label) {
  return paths.map((path) => {
    const file = byPath.get(path);
    if (!file || !file.readable) fail("CDP-CANDIDATE-PATH", `${label} is absent or unreadable in the candidate: ${path}`);
    const text = candidateText(root, candidate, path);
    return { path, blobOid: file.blobOid, sha256: sha256(text) };
  });
}

/**
 * Validate a complete Critic request without creating any durable or external
 * state. Evidence is a local, bounded JSON observation that binds the frozen
 * candidate; Spec and guardrails are always read from that candidate tree.
 */
export function preflightCriticDispatch({ root, base = null, candidate, specPath, guardrailPaths, evidencePaths, priorCriticEvidencePath = null, reviewScope = null, courseContext = null, correctionInputBindings = null, taskId = null }, observer = null) {
  let stage = "request", sourceCandidate = null, sourceSpecSha256 = null;
  try {
  if (typeof root !== "string" || root.length === 0 || typeof candidate !== "string") {
    const missing = [...(typeof root !== "string" || root.length === 0 ? ["--root"] : []), ...(typeof candidate !== "string" ? ["--candidate"] : [])];
    const reason = missing.length === 1 ? `${missing[0]} is required` : `${missing.join(" and ")} are required`;
    fail("CDP-INPUT", reason, { reason, missingFlags: missing });
  }
  const realRoot = realpathSync(root);
  stage = "paths";
  const scope = reviewScope === null ? null : currentArtifactScope(reviewScope);
  if (scope === null && typeof base !== "string") fail("CDP-INPUT", "base is required for an exact-range review.", { reason: "--base is required for an exact-range review (a current-artifact review gives a review scope instead)", missingFlags: ["--base"] });
  if (scope !== null && base !== null) fail("CDP-SCOPE-MIXED", "Current-artifact scope cannot include a review base.");
  stage = "candidate";
  const rangeBase = scope === null ? resolveBase(realRoot, base) : null;
  const baseCommit = rangeBase?.commit ?? null;
  const baseTree = rangeBase?.tree ?? null;
  const candidateCommit = git(realRoot, ["rev-parse", "--verify", `${candidate}^{commit}`]);
  const candidateTree = git(realRoot, ["rev-parse", `${candidateCommit}^{tree}`]);
  if (![candidateCommit, candidateTree, ...(scope === null ? [baseTree] : [])].every((value) => OID.test(value))) fail("CDP-REF", "Git returned an invalid candidate binding.");
  if (baseCommit !== null && !OID.test(baseCommit)) fail("CDP-REF", "Git returned an invalid candidate binding.");
  sourceCandidate = { commit: candidateCommit, tree: candidateTree };
  if (scope === null && baseCommit === candidateCommit) fail("CDP-RANGE", "Critic base and candidate must be different commits.");
  let correctionInputEcho = null;
  let deferredBindingsRefusal = null;
  if (scope === null && baseCommit !== null) {
    try { correctionInputEcho = checkCorrectionInputBindings(realRoot, baseCommit, candidateCommit, correctionInputBindings); }
    catch (error) {
      // D204: a delta request may be admitted as an effective FULL round, which reviews the course genesis base .. candidate; its
      // bindings must cover that range, so a stale or missing file over the correction range is judged after the admission.
      const deferrable = courseContext?.deltaRequestPath != null && ["CDP-CORRECTION-INPUT-STALE", "CDP-CORRECTION-INPUT-REQUIRED"].includes(error?.code);
      if (!deferrable) throw error;
      deferredBindingsRefusal = error;
    }
  }

  stage = "paths";
  const spec = normalizePath(specPath, "spec path");
  const guardrails = uniquePaths(guardrailPaths, "guardrail path");
  const evidence = uniquePaths(evidencePaths, "evidence path");
  if (evidence.length === 0) {
    // Candidate 17 (Toolbox): the refusal carried no reason; name what is admitted, the exact producers and the flag that passes it.
    const reason = `No --evidence was given. Produce evidence for the exact candidate ${candidateCommit}, then pass it with --evidence <file> (repeatable): either a Verify evidence of mode critic (node \${PIPELINE_PLUGIN_ROOT}/scripts/verify-evidence-producer.mjs --root <root> --mode critic --base <base> --commit ${candidateCommit} --out <evidence file>) or a Critic diagnostic evidence (node \${PIPELINE_PLUGIN_ROOT}/scripts/critic-diagnostic-evidence.mjs, see its --help). Security evidence is not admitted here. Produce it while HEAD is the candidate and the tree is clean.`;
    fail("CDP-EVIDENCE-REQUIRED", "At least one fresh candidate-evidence artifact is required.", { reason });
  }
  const prior = priorCriticEvidencePath === null ? null : normalizePath(priorCriticEvidencePath, "prior Critic evidence path");
  if (prior !== null && evidence.includes(prior)) fail("CDP-PRIOR-ALIASED", "Prior Critic evidence cannot satisfy fresh candidate evidence.");

  // The required-guardrail derivation lives in one shared module; the
  // requirement-map evaluation stays here and runs inside it, after governance.
  let requirementTraceability;
  let derived;
  try {
    derived = deriveRequiredCriticGuardrails({
      root: realRoot,
      candidate: candidateCommit,
      base: baseCommit ?? baseTree,
      changedPaths: scope === null ? null : scope.paths,
      explicitGuardrails: guardrails,
      onStage: (next) => { stage = next; },
      requirementPaths: ({ byPath }) => {
        try {
          requirementTraceability = evaluateRequirementTraceability({
            specPath: spec,
            candidate: { commit: candidateCommit, tree: candidateTree },
            candidateFiles: byPath,
            readCandidateFile: (path) => candidateBytes(realRoot, candidateCommit, path),
          });
        } catch (error) {
          if (error instanceof RequirementTraceabilityError) {
            fail("CDP-REQUIREMENT-MAP", `${error.code}: ${error.message}`);
          }
          throw error;
        }
        if (requirementTraceability.missingCriteria.length > 0) {
          const names = requirementTraceability.missingCriteria.map(({ id }) => id).join(", ");
          fail("CDP-REQUIREMENT-ABSENT", `Candidate is missing named requirements: ${names}`, {
            missingCriteria: requirementTraceability.missingCriteria,
          });
        }
        return requirementTraceability.mode === "declared" ? [requirementTraceability.map.path] : [];
      },
    });
  } catch (error) {
    if (error instanceof CriticGuardrailDerivationError) fail(error.code, error.message);
    throw error;
  }
  const { byPath, governance } = derived;
  const allGuardrails = derived.paths;
  stage = "candidate-files";
  const specReadback = requiredCandidateReadback(realRoot, candidateCommit, byPath, [spec], "Spec")[0];
  sourceSpecSha256 = specReadback.sha256;
  const guardrailReadback = requiredCandidateReadback(realRoot, candidateCommit, byPath, allGuardrails, "guardrail");
  // N25 / D208: guard-push refuses a final candidate whose declared public contracts changed after their concept
  // map, but only after Critic, Verify and the signatures were spent on it. Ask the same function here, before
  // evidence is read and long before any packet exists. No relief: the map must be committed and the candidate
  // rebuilt before review. It sits after the inventory/manifest/governance/spec readbacks so the Git-operation
  // order those stages are pinned on is unchanged. Only the STALE verdict refuses, as in push-init; a structurally
  // unverifiable map (`ok: false`) stays the final guard's refusal (the D208 decision names the stale map).
  const architectureCurrency = inspectArchitecturePushCurrency({ projectDir: realRoot, commit: candidateCommit });
  if (architectureCurrency.ok && architectureCurrency.stale) {
    const refusal = describeArchitectureCurrencyRefusal(architectureCurrency);
    fail("CDP-ARCHITECTURE-MAP-STALE",
      `The candidate needs a current architecture map before a Critic review. ${refusal.lines.join(" ")}`,
      { reason: refusal.lines.join("\n"), staleContracts: refusal.staleContracts, repair: refusal.remedy });
  }
  stage = "evidence";
  const evidenceReadback =evidence.map((path) => matchingCandidateEvidence(localEvidence(realRoot, path), candidateCommit, candidateTree, path, realRoot, specReadback, guardrailReadback, baseCommit));
  stage = "prior-evidence";
  const priorReadback = prior === null ? null : { path: prior, sha256: sha256(localEvidence(realRoot, prior)) };
  const sourceCoverage = scope === null ? null : currentArtifactCoverage(realRoot, candidateCommit, byPath, scope);

  // A feature package's retained immutable Critic lineage, not a caller's
  // declared round number, controls whether another model invocation is due.
  // Keep this read-only: the later session gate still owns packet/launch.
  let courseAdmission = null;
  let reviewBase = { commit: baseCommit, tree: baseTree };
  const featureMatch = /^specs\/([^/]+)\//u.exec(spec);
  const featureId = featureMatch?.[1] ?? null;
  if (featureId !== null && byPath.has(`specs/${featureId}/lifecycle.json`)) {
    stage = "critic-course";
    if (scope !== null) fail("CDP-COURSE-SCOPE", "A versioned feature Critic review requires an exact base-to-candidate range.");
    if (courseContext !== null && (!isObject(courseContext)
      || Object.keys(courseContext).sort().join() !== ["acceptedReference", "criterionLocator", "deltaRequestPath", "featureId", "registrationCommit"].join()
      || typeof courseContext.featureId !== "string" || !OID.test(courseContext.registrationCommit ?? ""))) {
      fail("CDP-COURSE-CONTEXT", "Critic course context must be closed.");
    }
    const context = courseContext ?? { featureId, registrationCommit: candidateCommit,
      acceptedReference: null, criterionLocator: null, deltaRequestPath: null };
    const admission = readCriticCourseAdmission({ repoRoot: realRoot, featureId: context.featureId,
      baseCommit: baseCommit ?? baseTree, candidateCommit, registrationCommit: context.registrationCommit,
      requestedMode: context.deltaRequestPath === null ? "full" : "delta",
      acceptedReference: context.acceptedReference, criterionLocator: context.criterionLocator,
      deltaRequestPath: context.deltaRequestPath });
    if (admission?.decision?.status !== "admitted") {
      observeSource(observer, stage, "rejected", admission?.decision?.code ?? "CDP-COURSE-UNAVAILABLE", sourceCandidate, sourceSpecSha256);
      let repair = criticCourseRepair(admission?.decision?.code);
      // CCA-PARENT: name the last registered round and the base this preflight accepts, and the route that admits from here.
      const parentDetail = admission?.decision?.code === "CCA-PARENT"
        ? criticCourseParentDetail({ repoRoot: realRoot, featureId, candidateCommit, givenBase: baseCommit ?? baseTree }) : null;
      if (parentDetail !== null) repair = criticCourseParentRepair({ detail: parentDetail, candidate: candidateCommit, specPath: spec });
      // A generic-batch refusal carries its own repair text; without this the caller sees only the bare code.
      if (repair === null && admission?.decision?.code?.startsWith("CGB-") && typeof admission.decision.reason === "string") repair = admission.decision.reason;
      return Object.freeze({ schema: CRITIC_DISPATCH_PREFLIGHT_SCHEMA,
        status: admission?.decision?.status ?? "unavailable", code: admission?.decision?.code ?? "CDP-COURSE-UNAVAILABLE",
        ...(parentDetail === null ? {} : { detail: parentDetail }),
        ...(repair === null ? {} : { repair }),
        // CGR-02: the ready release of each open packet of an old round that holds this review unit (exact request, command and cost).
        ...(Array.isArray(admission?.decision?.releaseActions) ? { releaseActions: admission.decision.releaseActions } : {}),
        dispatch: { childCreated: false, packetCreated: false, stateMutated: false, spawnAuthorized: false } });
    }
    // Defense at the actual packet preflight: history may remain readable in
    // the historical four-round format, and the current policy (D190: one full review, then correction-DIFF reviews until PASS or a
    // PO decision, no round count) can produce a packet-ready result for this registered batch.
    const round = admission.budgets?.reviewRound;
    // D204: a round > 1 is requested as a delta; the admission may turn it into an effective FULL round (RE-DELTA-FALLBACK-FULL) when the
    // registered delta request moves a trust boundary or is impact-ambiguous. That is the only full round accepted after round 1.
    const fallbackFull = Number.isSafeInteger(round) && round > 1 && context.deltaRequestPath !== null
      && admission.decision.mode === "full" && admission.decision.code === "RE-DELTA-FALLBACK-FULL";
    const expectedMode = round === 1 ? "full" : Number.isSafeInteger(round) && round > 1 ? "delta" : null;
    // D190: no round count refuses a diff round; the mode must still match the round.
    if (expectedMode === null
      || admission.budgets.maxReviewRounds !== CRITIC_DISPATCH_LIMITS.criticRounds
      || (admission.decision.mode !== expectedMode && !fallbackFull)
      || (context.deltaRequestPath === null ? "full" : "delta") !== expectedMode) {
      // The code string stays CDP-COURSE-BUDGET (it is the typed key consumers match); it no longer means a spent budget (D190).
      const MODE_MISMATCH_NEXT_STEP = "No review count refuses a correction-DIFF round, and no Critic round is spent. Ask for the mode the round needs: round 1 is a full review (no delta request); every later round is a correction-DIFF review requested with a delta request over the range from the immediately previous reviewed candidate to the new candidate (a delta that moves a trust boundary or is impact-ambiguous is admitted as an effective full round). If the request already matches, the admission limits differ from the dispatch limits: report that defect instead of retrying.";
      fail("CDP-COURSE-BUDGET", `The requested review mode does not match the round of this registered batch: round 1 is a full review, every later round is a correction-DIFF review from the immediately previous reviewed candidate, and the admission limits must equal the dispatch limits. ${MODE_MISMATCH_NEXT_STEP}`,
        { nextStep: MODE_MISMATCH_NEXT_STEP });
    }
    if (admission.source?.reviewUnit?.specPath !== spec) {
      fail("CDP-COURSE-CONTEXT", "The registered review unit must bind the requested feature Spec.");
    }
    if (admission.courseIdentity.originalFeatureId !== featureId && context.featureId !== featureId) {
      fail("CDP-COURSE-CONTEXT", "Course identity does not bind the requested feature Spec.");
    }
    const { decision, ...subject } = admission;
    courseAdmission = Object.freeze({ featureId: context.featureId, registrationCommit: context.registrationCommit,
      sourceSha256: sha256Canonical(subject), decisionSha256: sha256Canonical(decision),
      round: admission.budgets.reviewRound, correctionCommits: admission.budgets.correctionCommitCount,
      ...(fallbackFull ? { fallbackFull: true, reason: admission.decision.reason ?? null, courseBase: baseCommit ?? baseTree } : {}) });
    // D204: the effective full round reviews the WHOLE feature range, course genesis base .. candidate (not the correction range).
    if (fallbackFull) {
      const genesisBase = admission.courseIdentity.genesisCandidate.base;
      reviewBase = { commit: genesisBase, tree: git(realRoot, ["rev-parse", `${genesisBase}^{tree}`]) };
    }
  }

  if (courseContext !== null && courseAdmission === null) fail("CDP-COURSE-CONTEXT", "Course context requires a registered feature package.");

  if (courseAdmission?.fallbackFull === true && scope === null && baseCommit !== null) {
    stage = "candidate";
    const genesis = reviewBase.commit;
    correctionInputEcho = checkCorrectionInputBindings(realRoot, genesis, candidateCommit, correctionInputBindings,
      `${CCI_COMMAND_HINT.replace("<base>", genesis)} (this round is an effective FULL round: its bindings cover the course genesis base ${genesis} to the candidate, not the correction range)`);
  } else if (deferredBindingsRefusal !== null) {
    stage = "candidate";
    throw deferredBindingsRefusal;
  }

  // N13: the dispatch record admission `session-critic-finalizer admit` applies later, asked now, so this tool no longer
  // says packet-ready for a task id that admit will refuse. Optional: without --task-id nothing changes.
  let reviewAdmission = null;
  if (taskId !== null) {
    if (scope !== null) fail("CDP-ARGUMENT", "--task-id needs an exact base-to-candidate range, not a review scope.");
    const admission = evaluateReviewAdmission({ root: realRoot, taskId, baseCommit, candidateCommit });
    if (!admission.ok) {
      fail("CDP-REVIEW-ADMISSION", `Critic review admission would refuse task id ${taskId}: ${(admission.readFindings ?? []).join("; ")}`);
    }
    reviewAdmission = { taskId, mode: admission.admittedByDescendant ? "descendant" : "exact" };
  }

  const result = {
    schema: CRITIC_DISPATCH_PREFLIGHT_SCHEMA,
    // This remains read-only. The ordinary session orchestrator is the next
    // authority: it launches one fresh Critic and then hands the closed result
    // to the runner-neutral durable finalizer. Native transports are optional.
    status: "packet-ready",
    ...(scope === null ? { base: { commit: reviewBase.commit, tree: reviewBase.tree } } : { reviewScope: scope, sourceCoverage }),
    candidate: { commit: candidateCommit, tree: candidateTree },
    ...(reviewAdmission === null ? {} : { reviewAdmission }),
    ...(correctionInputEcho === null ? {} : { correctionInputBindings: correctionInputEcho }),
    spec: specReadback,
    guardrails: guardrailReadback,
    governance,
    requirementTraceability,
    evidence: evidenceReadback,
    coordinatorOnly: { priorCriticEvidence: priorReadback, courseAdmission },
    dispatch: {
      mode: "path-only", childCreated: false, packetCreated: false, stateMutated: false,
      spawnAuthorized: false, requiredNextGate: "session-critic-dispatch",
      reviewerInput: {
        ...(scope === null ? { baseCommit: reviewBase.commit } : { reviewScope: scope }),
        candidateCommit,
        candidateTree,
        rulesetSha: candidateCommit,
        specPath: specReadback.path,
        governanceConstraintPaths: governance.governance === null
          ? []
          : [governance.governance.guidelinesPath, governance.governance.policiesPath],
        guardrailPaths: guardrailReadback.map(({ path }) => path),
        evidencePaths: evidenceReadback.map(({ path }) => path),
      },
    },
  };
  observeSource(observer, "complete", "packet-ready", null, sourceCandidate, sourceSpecSha256);
  return result;
  } catch (error) {
    observeSource(observer, stage, "rejected", sourceFailureCodes.get(error) ?? "CDP-UNEXPECTED", sourceCandidate, sourceSpecSha256);
    throw error;
  }
}

/**
 * D212 (N33 D) early detection for the ready result that is PRINTED to a person or script: the Critic-required dispatch records whose
 * commit lies in the reviewed range (base, candidate] and that no Critic evidence covers yet, so the Critic dispatch can include them
 * and the addendum command is known before the feature close. Additive and advisory: the status stays packet-ready, nothing new
 * refuses, and `preflightCriticDispatch` itself is untouched. That separation is deliberate: the session finalizer binds the library
 * result by digest at admit and again at finalize, so a field that changes while a review runs (a record or an addendum written in
 * between) would turn this notice into a refusal there. The coverage rule is the shared evaluation; this only supplies the range.
 */
export function preflightCriticDispatchWithCoverage(input, observer = null) {
  const result = preflightCriticDispatch(input, observer);
  if (result?.status !== "packet-ready" || result.reviewScope !== undefined || typeof result.candidate?.commit !== "string") return result;
  const advisory = criticCoverageAdvisory(listUncoveredCriticRecords({ root: input.root, range: { base: result.base?.commit ?? null, head: result.candidate.commit } }));
  return advisory === null ? result : { ...result, criticCoverageAdvisory: advisory };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// G20-69 / G20-71 (candidate 20e, AC-108). Measured in a greenfield run: after `packet-ready` the coordinator spent about 15 tool calls reading the
// session finalizer's source to hand-build the request file `admit` takes (a closed key set, a lower-case project id, a 32-hex packet id, then the
// task id of the last slice's dispatch record), and a default-route (Opus) Critic dispatch was refused for lacking the MP-07 prompt lines.
// The PRINTED result now carries both. They live in this wrapper and not in `preflightCriticDispatch` for the same reason the coverage advisory does:
// the finalizer binds the library result by digest at admit and again at finalize, and a fresh packet id inside it would change that digest on every
// call. Everything stays read-only (no packet, no file, no state); the coordinator writes the request file itself.
// ---------------------------------------------------------------------------------------------------------------------------------------
const ADMIT_REQUEST_FILE = "scratch/session-critic-finalization-request.json";
const ADMIT_SCRIPT = "${PIPELINE_PLUGIN_ROOT}/scripts/session-critic-finalizer.mjs";
const ADMIT_REQUEST_V2 = "pipeline.session-critic-finalization-request.v2";
const ADMIT_REQUEST_V3 = "pipeline.session-critic-finalization-request.v3";
const TASK_ID_CANDIDATE_LIMIT = 25;
const fillPlaceholder = (path, hint) => `<FILL ${path}: ${hint}>`;

/** The calibration project name in the form admit accepts (SAFE_ID, lower case), or null. Read-only. */
// Read here rather than through repository-freshness.mjs, whose imports would take this preflight out of its write-free closure (CDPF086). The first readable calibration decides, as in calibrationProjectId.
function calibrationRepositoryMode(root) {
  for (const relativePath of ["project/pipeline.json", ".claude/pipeline.json"]) {
    try { return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"))?.repositoryMode ?? null; } catch { /* no readable calibration at this path */ }
  }
  return null;
}

function calibrationProjectId(root) {
  for (const relativePath of ["project/pipeline.json", ".claude/pipeline.json"]) {
    try {
      const project = JSON.parse(readFileSync(resolve(root, relativePath), "utf8"))?.project;
      if (typeof project === "string" && SAFE_ID.test(project.toLowerCase())) return project.toLowerCase();
    } catch { /* no readable calibration at this path */ }
  }
  return null;
}

/**
 * The task ids the review admission would accept for this candidate: `matching` pass the same admission `--task-id` asks for (skipped when the
 * caller gave one). `appliedRows` maps each Critic-required record's task id to its applied Critic row, which is the trigger admit should carry.
 */
function reviewAdmissionTaskIds({ root, baseCommit, candidateCommit, given = null }) {
  let scan;
  try { scan = walkDispatchRecordsForReview(root, []); } catch { return { matching: [], considered: [], appliedRows: new Map() }; }
  const exactIds = [], laterIds = [], appliedRows = new Map();
  for (const { record } of scan.records) {
    if (typeof record?.taskId !== "string" || !isSafeTaskId(record.taskId)) continue;
    let required = false;
    try { required = criticDisposition(record) === "required"; } catch { required = false; }
    if (!required) continue;
    appliedRows.set(record.taskId, record.criticRequired?.appliedRow);
    if (record.candidateCommit === candidateCommit) exactIds.push(record.taskId);
    else if (terminalAuthoredDelivery(record)) laterIds.push(record.taskId);
  }
  const considered = [...new Set([...exactIds, ...laterIds.slice(-TASK_ID_CANDIDATE_LIMIT)])].sort(compare);
  const matching = given !== null ? [] : considered.filter((taskId) => {
    try { return evaluateReviewAdmission({ root, taskId, baseCommit, candidateCommit }).ok === true; } catch { return false; }
  });
  return { matching, considered, appliedRows };
}

/** The feature package's rigor at the candidate (the close rule reads the same field), or null when there is no readable package. Read-only. */
function featureRigor(root, candidateCommit, specPath) {
  const match = /^specs\/([^/]+)\//u.exec(specPath ?? "");
  if (match === null) return null;
  try { const value = JSON.parse(candidateText(root, candidateCommit, `specs/${match[1]}/lifecycle.json`))?.feature?.rigor; return Number.isInteger(value) && value >= 0 ? value : null; } catch { return null; }
}

/** MP-07 prompt lines for a Critic route that resolves to an Opus model; null for any other route. T1 and T2 select the high-risk Critic duty (as admit does). */
function opusCriticPromptLines({ root, result, env, registry, trigger }) {
  const runner = env.CODEX_SESSION_ID !== undefined || env.CODEX_THREAD_ID !== undefined ? "codex" : "claude";
  const duty = trigger === "T1" || trigger === "T2" ? "critic_high_risk" : "critic_normal";
  let cell;
  // C23: the Critic route of the PROJECT (its pipeline.user.yaml), not the shipped registry. This CLI's stderr protocol is closed
  // (a complete packet-ready result prints nothing there), so a fallback to the registry is not announced here; the line below only
  // quotes the route it found.
  try { cell = (registry ?? loadProjectRoutingRegistry(root, { warn: () => {} })).duties?.[duty]?.[runner]; } catch { return null; }
  if (!isObject(cell) || cell.state === "unavailable" || !isObject(cell.selector) || typeof cell.selector.value !== "string" || !/opus/iu.test(cell.selector.value)) return null;
  const base = result.base.commit ?? result.base.tree, head = result.candidate.commit;
  const names = gitOrNull(root, ["diff", "--name-only", base, head]);
  const files = names === null ? [] : names.split("\n").filter((line) => line !== "");
  const modules = new Set(files.map((file) => file.split("/")[0]));
  const counts = names === null ? "" : ` (${files.length} changed file${files.length === 1 ? "" : "s"} in ${modules.size} top-level path${modules.size === 1 ? "" : "s"})`;
  return [
    `Batch scope (MP-07): the reviewed range ${base.slice(0, 12)}..${head.slice(0, 12)}${counts}, one batch.`,
    // CGR-20: the cell is what the route REQUESTS. Nothing at this point observes the effort that is applied, and the project calibration is
    // a different value that this line neither reads nor overwrites, so the line says "requests" and states the missing observation.
    `Rationale (MP-07): the registered Critic route duty.${duty} requests ${cell.selector.value} at effort ${cell.effort}; it is used for critical architecture or security review of this one batch only. The applied effort is not observed by this packet: report the requested effort as requested, and name an applied effort only where a dispatch receipt shows it.`,
  ];
}

/**
 * The printed packet-ready result: the coverage result plus `admitRequest` (the complete closed request for `session-critic-finalizer.mjs admit`),
 * `admitCommand` (argv), `nextStep`, `taskIdResolution` when the task id could not be resolved, and `criticDispatchPromptLines` for an Opus route.
 * Only values the caller alone owns stay `<FILL path: hint>` placeholders, which admit refuses by name. A current-artifact review scope (admit
 * takes an exact range only) and every refusal are returned as they are. `deps` ({ env, registry, randomBytesFn }) is for tests.
 */
export function preflightCriticDispatchWithAdmitRequest(input, deps = {}) {
  const result = preflightCriticDispatchWithCoverage(input);
  if (result?.status !== "packet-ready" || result.reviewScope !== undefined || typeof result.candidate?.commit !== "string") return result;
  const root = realpathSync(input.root);
  const course = result.coordinatorOnly.courseAdmission;
  // admit re-runs the preflight over the range the CALLER gave; an effective full round reports the course genesis as its base instead.
  const requestBase = course?.fallbackFull === true ? course.courseBase : (result.base.commit ?? result.base.tree);
  const reviewer = result.dispatch.reviewerInput;
  let taskId = result.reviewAdmission?.taskId ?? null;
  let taskIdResolution = null;
  const found = reviewAdmissionTaskIds({ root, baseCommit: course?.fallbackFull === true ? course.courseBase : result.base.commit, candidateCommit: result.candidate.commit, given: taskId });
  if (taskId === null) {
    if (found.matching.length === 1) taskId = found.matching[0];
    else {
      const candidateTaskIds = found.matching.length > 1 ? found.matching : found.considered;
      taskIdResolution = { status: "unresolved", candidateTaskIds,
        reason: `${found.matching.length > 1 ? "several dispatch records match" : "no single dispatch record matches"} this review candidate; rerun this preflight with --task-id <id> (the review admission is then checked here, before admit) or fill taskId; candidate task ids: ${candidateTaskIds.length === 0 ? "none found" : candidateTaskIds.join(", ")}` };
    }
  }
  // The trigger is the matched record's applied Critic row where admit has that trigger (T1 to T3); otherwise the strictest row, which admit itself
  // defaults to and which selects the high-risk Critic duty, so it can never lower a check.
  const appliedRow = taskId === null ? undefined : found.appliedRows.get(taskId);
  const trigger = ["T1", "T2", "T3"].includes(appliedRow) ? appliedRow : "T1";
  const request = {
    schema: course ? ADMIT_REQUEST_V2 : ADMIT_REQUEST_V3,
    taskId: taskId ?? fillPlaceholder("taskId", "the dispatch record task id, see taskIdResolution"),
    projectId: calibrationProjectId(root) ?? fillPlaceholder("projectId", "a lower-case project id, for example the calibration project name"),
    sessionId: fillPlaceholder("sessionId", "id of the fresh Critic session, lower case [a-z0-9._-]"),
    packetId: (deps.randomBytesFn ?? randomBytes)(16).toString("hex"),
    trigger,
    route: Object.fromEntries([["routeId", "route id of the Critic route, for example session-critic"], ["runner", "claude, codex or antigravity"], ["adapter", "route adapter of the runner"],
      ["provider", "model provider"], ["modelTier", "model tier of the Critic route"], ["effortTier", "effort tier of the Critic route"]].map(([key, hint]) => [key, fillPlaceholder(`route.${key}`, hint)])),
    review: {
      base: requestBase,
      candidate: result.candidate.commit,
      specPath: reviewer.specPath,
      guardrailPaths: reviewer.guardrailPaths,
      evidencePaths: reviewer.evidencePaths,
      priorCriticEvidencePath: result.coordinatorOnly.priorCriticEvidence?.path ?? null,
      ...(course
        ? { courseContext: input.courseContext ?? null }
        : { genericBatchRef: Object.fromEntries([["batchId", "batchRef.batchId printed by register-batch"], ["registrationSha256", "batchRef.registrationSha256 printed by register-batch"], ["memberSha256", "memberSha256 printed by register-batch"]]
          .map(([key, hint]) => [key, fillPlaceholder(`review.genericBatchRef.${key}`, hint)])) }),
      ...(typeof result.correctionInputBindings?.path === "string" ? { correctionInputBindings: result.correctionInputBindings.path } : {}),
    },
    verdictPath: fillPlaceholder("verdictPath", "repository-relative path of the JSON verdict the fresh Critic returns"),
    event: fillPlaceholder("event", "null, or an object with eventOutPath and featureId"),
  };
  const promptLines = opusCriticPromptLines({ root, result, env: deps.env ?? process.env, registry: deps.registry, trigger });
  // C22 (CGF-03, CGF-20): what the planned route will really deliver and whether the close will need its own acknowledgement, stated now (printed only, like the fields above).
  const routeAssurance = describeCriticRouteAssurance({ runner: criticRunnerFromEnv(deps.env ?? process.env), trigger, rigor: featureRigor(root, result.candidate.commit, reviewer.specPath), packetId: request.packetId, launchRoute: deps.criticLaunchRoute ?? null });
  // G20-72: a range above the one named bound is split per module; `admit` rebuilds the identical object and binds its digest.
  const split = buildCriticSplit({ root, result });
  if (split !== null && split.entries.length > SPLIT_MAX_ENTRIES) {
    const reason = `This range needs ${split.entries.length} split entries, above the bound of ${SPLIT_MAX_ENTRIES} for one review round (${split.changedFileCount} changed files).`;
    fail("CDP-SPLIT-TOO-LARGE", reason, { reason, repair: "Review a narrower exact range (a later --base), or review the range in several delivery units." });
  }
  // 2026-11 greenfield report: all six Antigravity Critics lost their first read to "path is not absolute", because a Critic briefing carries repository-relative paths only. One generated line names the root; the paths themselves stay as they are.
  const runnerPromptLines = criticRunnerFromEnv(deps.env ?? process.env) === "antigravity"
    ? [`Repository root: ${root}. This runner's native file tools take absolute paths only: join every repository-relative path in this briefing with that root before the first read.`]
    : null;
  // R9: the last moment a calibration commit is free: it then sits inside the reviewed range. After the last Critic round it ends the push's Critic carry (CVL-CARRY-CONTENT-CHANGED).
  const remotes = calibrationRepositoryMode(root) === "local-only" ? String(gitOrNull(root, ["remote"]) ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) : [];
  const nextStep = [
    ...(remotes.length === 0 ? [] : [`This project's calibration says repositoryMode local-only, but it has a remote (${remotes.join(", ")}). If the project is meant to be published, correct that BEFORE this Critic round, so the commit is inside the reviewed range: node \${PIPELINE_PLUGIN_ROOT}/scripts/repository-mode-promote.mjs --root <repo> --to remote-tracked, commit the paths it prints, then run this preflight again with the new candidate. After the last Critic round that commit would end the push's Critic carry.`]),
    ...(runnerPromptLines === null ? [] : ["Put criticRunnerPromptLines into the Critic dispatch prompt: without the repository root every first read of an Antigravity child fails."]),
    `Write admitRequest verbatim as ${ADMIT_REQUEST_FILE} (JSON), replace only its placeholders (${admitRequestPlaceholderPaths(request).join(", ")}), then run admitCommand; admit refuses an unfilled placeholder by name.`,
    `trigger ${trigger} is ${trigger === appliedRow ? "the applied Critic row of the matched dispatch record" : "the strictest default (no matched record row of T1 to T3)"}; change it only if your Critic-required decision says otherwise.`,
    ...(taskIdResolution === null ? [] : [`taskId: ${taskIdResolution.reason}.`]),
    ...(course ? [] : ["This review is no feature package, so it needs a registered generic batch: run session-critic-finalizer.mjs register-batch first and copy its batchRef and memberSha256 into review.genericBatchRef."]),
    ...(promptLines === null ? [] : ["The Critic route is Opus: put criticDispatchPromptLines into the Critic dispatch prompt (MP-07), or the dispatch policy refuses it."]),
    ...(split === null ? [] : [`SPLIT: this range has ${split.changedFileCount} changed files, above the bound of ${split.maxChangedFiles} one Critic can read, so it is split (split.entries, ${split.entries.length} entries, plan ${split.plan.status}; bound exclusions and the delivery records named in the review protocol §2.2 are in no entry). Dispatch one Critic per split entry from the template, each with its entry's reviewerInput, its entry's batchScopeLine as the Batch scope (MP-07) line${promptLines === null ? "" : " (in place of criticDispatchPromptLines[0]; keep the rationale line)"} and the instruction to begin trajectory_evidence with its scopeMarker; run each entry's Critic once (a second run for an entry makes finalize refuse the round). When every child has returned, merge them without copying any verdict: node \${PIPELINE_PLUGIN_ROOT}/scripts/critic-split-merge.mjs --root <repo> --packet <packetId> --out <merged verdict file>; only for a child without a Source return, save split as a JSON file under scratch/ and pass --split <split file> and --child <entryId>=<verdict file> (one per entry) instead of --packet; admit binds the split, finalize takes the merged verdict as verdictPath and labels it source-issued only when every child returned through the Critic stop.`]),
  ].join(" ");
  return { ...result, admitRequest: request, admitCommand: ["node", ADMIT_SCRIPT, "admit", "--root", input.root, "--request", ADMIT_REQUEST_FILE], nextStep,
    ...(taskIdResolution === null ? {} : { taskIdResolution }), ...(promptLines === null ? {} : { criticDispatchPromptLines: promptLines }), ...(runnerPromptLines === null ? {} : { criticRunnerPromptLines: runnerPromptLines }), ...(split === null ? {} : { split }),
    routeAssurance };
}

/**
 * Advisory, non-failing enumeration of evidence-shaped artifacts for a given
 * task id, across every location ADR-0063 names as an evidence home. This is
 * NOT part of `preflightCriticDispatch()` and never affects its pass/fail
 * outcome: `matchingCandidateEvidence()` still refuses anything that does not
 * bind the exact candidate, unchanged. This function only answers "what
 * exists", so a dispatcher can cite it instead of asserting an absence.
 *
 * Matching is case-insensitive substring matching of the task id against each
 * candidate file's basename. Substring matching -- rather than an exact or
 * anchored match -- is deliberate: the regression case that motivated this
 * (2026-09-06, NVA-B-DENIALCODE-1) is a file named
 * `2026-09-06-nva-b-denialcode-1-red.txt`, which carries a date prefix before
 * the task id and a role suffix after it. Lower-casing both sides absorbs the
 * case difference; substring containment absorbs the surrounding text. A
 * task id is never treated as a regular expression.
 */
export function enumerateEvidenceArtifacts({ root, taskId }) {
  if (typeof root !== "string" || root.length === 0) fail("CDP-SWEEP-INPUT", "root is required.");
  if (typeof taskId !== "string" || taskId.length === 0) fail("CDP-SWEEP-INPUT", "taskId is required.");
  const realRoot = realpathSync(root);
  const needle = taskId.toLowerCase();

  const locations = [...FIXED_EVIDENCE_LOCATIONS];
  const specsDir = resolve(realRoot, "specs");
  let specEntries = [];
  try { specEntries = readdirSync(specsDir, { withFileTypes: true }); } catch { specEntries = []; }
  for (const entry of specEntries) {
    if (!entry.isDirectory()) continue;
    const dir = `specs/${entry.name}/evidence`;
    locations.push({ dir, locationClass: `durable citation target (tracked, ${dir}/)` });
  }

  const matches = [];
  for (const { dir, locationClass } of locations) {
    let entries = [];
    try { entries = readdirSync(resolve(realRoot, dir), { withFileTypes: true }); } catch { entries = []; }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().includes(needle)) continue;
      matches.push({ path: `${dir}/${entry.name}`, locationClass });
    }
  }
  matches.sort((left, right) => compare(left.path, right.path));

  return { schema: EVIDENCE_SWEEP_SCHEMA, taskId, matches };
}

export function parseCriticDispatchPreflightArgs(argv) {
  const values = { guardrailPaths: [], evidencePaths: [], priorCriticEvidencePath: null, sweepEvidenceTaskId: null };
  const selectors = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (["--root", "--base", "--candidate", "--spec", "--guardrail", "--evidence", "--prior-critic", "--sweep-evidence", "--registration-commit", "--accepted-contract", "--criterion-locator", "--delta-request", "--correction-input-bindings", "--task-id"].includes(flag) && value === undefined) fail("CDP-ARGUMENT", `${flag} requires a value.`);
    if (flag === "--correction-input-bindings") values.correctionInputBindings = value;
    else if (flag === "--task-id") {
      if (Object.hasOwn(values, "taskId")) fail("CDP-ARGUMENT", "Duplicate --task-id.");
      if (!isSafeTaskId(value)) fail("CDP-ARGUMENT", "--task-id is not a safe task id.");
      values.taskId = value;
    }
    else if (flag === "--root") values.root = value;
    else if (flag === "--base") values.base = value;
    else if (flag === "--candidate") values.candidate = value;
    else if (flag === "--spec") values.specPath = value;
    else if (flag === "--guardrail") values.guardrailPaths.push(value);
    else if (flag === "--evidence") values.evidencePaths.push(value);
    else if (flag === "--prior-critic") values.priorCriticEvidencePath = value;
    else if (flag === "--sweep-evidence") values.sweepEvidenceTaskId = value;
    else if (["--registration-commit", "--accepted-contract", "--criterion-locator", "--delta-request"].includes(flag)) {
      if (Object.hasOwn(selectors, flag)) fail("CDP-ARGUMENT", "Duplicate course selector.");
      selectors[flag] = value;
    }
    else fail("CDP-ARGUMENT", `Unknown argument: ${flag}; the preflight takes --root, --base, --candidate, --spec, --guardrail, --evidence, --prior-critic, --sweep-evidence, --task-id, --registration-commit, --accepted-contract, --criterion-locator, --delta-request and --correction-input-bindings, each with a value${flag === "--range" ? "; there is no --range: pass the exact range as --base <base commit> --candidate <candidate commit>" : ""}.`);
    index += 1;
  }
  // D223 (slice 3): no --registration-commit given. The registration commit is the ONE commit after the candidate (an evidence-only chain, as
  // the admission's own transport check requires) at which the existing course admission admits the request; derived here, at parse time, so
  // every later step (admit, finalize, the reservation) sees the same explicit commit. None qualifying keeps today's behaviour; more than one
  // is refused, nothing is guessed. A caller-given commit (or --accepted-contract, hashed at that commit) is never replaced.
  if (selectors["--registration-commit"] === undefined && selectors["--accepted-contract"] === undefined && values.sweepEvidenceTaskId === null
    && typeof values.root === "string" && typeof values.base === "string" && typeof values.candidate === "string") {
    const featureMatch = /^specs\/([^/]+)\//u.exec(values.specPath ?? "");
    const baseCommit = featureMatch === null ? null : gitOrNull(values.root, ["rev-parse", "--verify", `${values.base}^{commit}`]);
    const candidateCommit = baseCommit === null ? null : gitOrNull(values.root, ["rev-parse", "--verify", `${values.candidate}^{commit}`]);
    if (candidateCommit !== null) {
      const derivation = deriveCriticCourseRegistrationCommit({ repoRoot: values.root, featureId: featureMatch[1], baseCommit, candidateCommit,
        deltaRequestPath: selectors["--delta-request"] === undefined ? null : normalizePath(selectors["--delta-request"], "delta request") });
      if (derivation.status === "derived") selectors["--registration-commit"] = derivation.commit;
      else if (derivation.status === "ambiguous") {
        const reason = `An exact registration commit is required: ${derivation.commits.length} commits qualify (${derivation.commits.join(", ")}); the preflight never picks one. Pass --registration-commit with the commit that registered the evidence of this round.`;
        fail("CDP-ARGUMENT", "An exact registration commit is required.", { reason, registrationCommitDerivation: { status: "ambiguous", commits: derivation.commits } });
      }
    }
  }
  if (Object.keys(selectors).length !== 0) {
    if (values.sweepEvidenceTaskId !== null) fail("CDP-ARGUMENT", "Course selectors cannot be mixed with evidence sweep.");
    if (!OID.test(selectors["--registration-commit"] ?? "")) fail("CDP-ARGUMENT", selectors["--registration-commit"] === undefined
      ? "An exact registration commit is required: --registration-commit <full 40-hex commit id>."
      : "--registration-commit takes an exact commit id, not a short or symbolic one: pass the full 40-hex commit id (git rev-parse <ref> prints it).");
    const match = /^specs\/([^/]+)\//u.exec(values.specPath ?? "");
    if (!match) fail("CDP-ARGUMENT", "Course selectors require a feature Spec.");
    const acceptedPath = selectors["--accepted-contract"] === undefined ? null : normalizePath(selectors["--accepted-contract"], "accepted contract");
    const locatorPath = selectors["--criterion-locator"] === undefined ? null : normalizePath(selectors["--criterion-locator"], "criterion locator");
    let criterionLocator = null;
    if (locatorPath !== null) {
      try { criterionLocator = JSON.parse(localEvidence(values.root, locatorPath)); }
      catch { fail("CDP-ARGUMENT", "Criterion locator is unavailable."); }
      if (!isObject(criterionLocator) || Object.keys(criterionLocator).sort().join() !== ["criterionId", "endByte", "excerptSha256", "schema", "sourcePath", "sourceSha256", "startByte"].join()) fail("CDP-ARGUMENT", "Criterion locator must be closed.");
    }
    values.courseContext = { featureId: match[1], registrationCommit: selectors["--registration-commit"],
      acceptedReference: acceptedPath === null ? null : { schema: "pipeline.accepted-delivery-contract-reference.v1", path: acceptedPath,
        sha256: sha256(candidateBytes(values.root, selectors["--registration-commit"], acceptedPath)) },
      criterionLocator, deltaRequestPath: selectors["--delta-request"] === undefined ? null : normalizePath(selectors["--delta-request"], "delta request") };
  }
  return values;
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  try {
    const args = parseCriticDispatchPreflightArgs(argv);
    if (args.sweepEvidenceTaskId !== null) {
      const result = enumerateEvidenceArtifacts({ root: args.root, taskId: args.sweepEvidenceTaskId });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      const result = preflightCriticDispatchWithAdmitRequest(args);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (result.status !== "packet-ready") process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(criticDispatchPreflightRefusalLine(error, { sweep: argv.includes("--sweep-evidence") }));
    process.exitCode = 1;
  }
}

/**
 * The one stderr line of a refused preflight, shared by the direct CLI and the observed controller so the two can never print different bytes
 * for the same refusal (the observed controller used to rebuild a bare line and dropped every reason and detail the producer carries).
 */
export function criticDispatchPreflightRefusalLine(error, { sweep = false } = {}) {
  const typed = error instanceof CriticDispatchPreflightError;
  const code = typed ? error.code : "CDP-UNEXPECTED";
  const details = typed ? error.details : null;
  return `${JSON.stringify({
    schema: sweep ? EVIDENCE_SWEEP_SCHEMA : CRITIC_DISPATCH_PREFLIGHT_SCHEMA,
    status: "rejected",
    code,
    // C18-8 (AC-239): a CDP-ARGUMENT refusal used to reach the caller as a bare code. Its human reason now rides on the same stderr line;
    // a reason a refusal already carries in its details is kept as it is.
    ...((code === "CDP-ARGUMENT" || code === "CDP-CORRECTION-INPUT-REFUSED") && typed ? { reason: error.message } : {}),
    ...(!sweep && details !== null ? details : {}),
  })}\n`;
}

/** Explicit opaque launch-context entry; no observer or authority injection. */
export function preflightCriticDispatchWithLaunchContext(input, options) {
  if (options === undefined || (isObject(options) && Object.keys(options).length === 0)
    || (isObject(options) && Object.keys(options).length === 1
      && Object.hasOwn(options, "hostDispatchContext") && options.hostDispatchContext === undefined)) {
    throw new CriticDispatchPreflightError("DBLO-CURRENT-HOST-UNAVAILABLE", "Launch observation refused.");
  }
  if (!isObject(options) || Object.keys(options).length !== 1 || !Object.hasOwn(options, "hostDispatchContext")) {
    throw new CriticDispatchPreflightError("DBLO-HANDLE-INVALID", "Launch observation refused.");
  }
  const observed = readDispatchBudgetLaunchObservation({ rootDir: input?.root,
    hostDispatchContext: options.hostDispatchContext });
  if (!observed.ok) throw new CriticDispatchPreflightError(observed.code, "Launch observation refused.");
  if (observed.value.status !== "working" && observed.value.status !== "not-applicable") {
    throw new CriticDispatchPreflightError(observed.value.code, "Launch observation refused.");
  }
  return preflightCriticDispatch(input);
}
