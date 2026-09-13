// SPDX-License-Identifier: SUL-1.0
/**
 * rigor-floor.mjs -- Deterministic Minimum Rigor Floor Derivation.
 *
 * Implements pure derivation of minimum lifecycle rigor floor from change surface,
 * reversibility, and observable inputs (WP-B1, Issue #105, AC-7, Spec §5.1).
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

export const SCHEMA_RIGOR_DERIVATION = "pipeline.rigor-derivation.v1";
export const DEFAULT_DERIVATION_REVISION = "b1-r1";

export const PROFILES = Object.freeze(["mini", "feature", "epic"]);
export const PROFILE_RANKS = Object.freeze({
  mini: 0,
  feature: 1,
  epic: 2
});

export const BASE_EVIDENCE_CLASSES = Object.freeze({
  mini: ["verify"],
  feature: ["verify", "critic"],
  epic: ["verify", "critic", "security"]
});

export const KNOWN_DIMENSIONS = Object.freeze([
  "plannedPaths",
  "actualPaths",
  "protectedTouches",
  "contractDeltas",
  "reversibility",
  "diffStats",
  "selectedProfile"
]);

/**
 * Known protected baseline patterns (A3 / TP paths).
 */
export const PROTECTED_PATTERNS = Object.freeze([
  /^plugins\/pipeline-core\/hooks\/guard-git\.test\.mjs$/,
  /^plugins\/pipeline-core\/hooks\/guard-testpath\.test\.mjs$/,
  /^harness\/scripts\/verify\.mjs$/,
  /^plugins\/pipeline-core\/hooks\/hooks\.json$/,
  /^(?:plugins\/pipeline-core\/hooks\/guard-push(?:-v2)?|harness\/scripts\/pipeline-state)\.test\.mjs$/,
  /^plugins\/pipeline-core\/hooks\/guard-gate-strength\.test\.mjs$/,
  /^plugins\/pipeline-core\/hooks\/guard-testpath-override\.test\.mjs$/,
  /^plugins\/pipeline-core\/lib\/entrypoint\.test\.mjs$/,
  /^plugins\/pipeline-core\/lib\/critical-human-proof-policy\.test\.mjs$/,
  /^plugins\/pipeline-core\/hooks\/notebook-write-coverage\.test\.mjs$/,
  /^plugins\/pipeline-core\/lib\/public-core-origin-allowlist\.test\.mjs$/,
  /^plugins\/pipeline-core\/lib\/self-application-attestation-gate\.test\.mjs$/,
  /^plugins\/pipeline-core\/hooks\//,
  /^plugins\/pipeline-core\/lib\/protected-baseline\.mjs$/,
  /^plugins\/pipeline-core\/protected-baseline\.json$/,
  /^project\/guard-config\.json$/,
  /^\.claude\/settings(?:\.json)?$/
]);

/**
 * Public contracts, schemas, core dependencies, and storage patterns.
 */
export const CONTRACT_PATTERNS = Object.freeze([
  /^schemas\//,
  /^policies\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^pipeline-manifest\.schema\.json$/,
  /^pipeline\.user\.schema\.json$/,
  /^specs\/.*\/design\/contract-freeze\.json$/
]);

export function normalizePath(filePath) {
  if (typeof filePath !== "string") return "";
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

export function isProtectedPath(filePath) {
  const norm = normalizePath(filePath);
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(norm));
}

export function isContractPath(filePath) {
  const norm = normalizePath(filePath);
  return CONTRACT_PATTERNS.some((pattern) => pattern.test(norm));
}

/**
 * Canonical JSON serialization with recursively sorted object keys.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
}

/**
 * Calculate SHA-256 digest from canonical JSON of normalized inputs.
 */
export function computeInputDigest(normalizedInputs) {
  const canonical = canonicalJson(normalizedInputs);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Normalize raw input object into canonical dimensions.
 * Each dimension is guaranteed to be { value, status, sourceContract }.
 */
export function normalizeInputs(rawInputs = {}) {
  const src = (rawInputs && typeof rawInputs === "object" && !Array.isArray(rawInputs))
    ? rawInputs
    : {};

  const normalized = {};

  for (const dim of KNOWN_DIMENSIONS) {
    const rawDim = src[dim];

    let value = null;
    let status = "unavailable";
    let sourceContract = "unspecified";

    if (rawDim !== undefined && rawDim !== null) {
      if (typeof rawDim === "object" && !Array.isArray(rawDim) && Object.hasOwn(rawDim, "value")) {
        value = rawDim.value;
        status = typeof rawDim.status === "string" ? rawDim.status.toLowerCase().trim() : (value !== null && value !== undefined ? "available" : "unavailable");
        sourceContract = typeof rawDim.sourceContract === "string" ? rawDim.sourceContract : "unspecified";
      } else {
        // Direct value passed without wrapping object
        value = rawDim;
        status = "available";
        sourceContract = "inferred";
      }
    }

    if (!["available", "unavailable", "unknown"].includes(status)) {
      status = "unknown";
    }

    // Value normalization per dimension
    if (status === "available" && value !== null && value !== undefined) {
      if (dim === "plannedPaths" || dim === "actualPaths") {
        if (Array.isArray(value)) {
          const uniquePaths = Array.from(new Set(value.map(normalizePath).filter(Boolean))).sort();
          value = uniquePaths;
        } else if (typeof value === "string") {
          value = [normalizePath(value)].filter(Boolean);
        } else {
          value = [];
        }
      } else if (dim === "protectedTouches") {
        if (Array.isArray(value)) {
          value = Array.from(new Set(value.map(normalizePath).filter(Boolean))).sort();
        } else if (typeof value === "boolean") {
          value = Boolean(value);
        } else if (typeof value === "object" && value !== null) {
          const normObj = {};
          for (const k of Object.keys(value).sort()) {
            normObj[k] = value[k];
          }
          value = normObj;
        } else {
          value = Boolean(value);
        }
      } else if (dim === "contractDeltas") {
        if (Array.isArray(value)) {
          value = Array.from(new Set(value.map(normalizePath).filter(Boolean))).sort();
        } else if (typeof value === "boolean") {
          value = Boolean(value);
        } else if (typeof value === "object" && value !== null) {
          const normObj = {};
          for (const k of Object.keys(value).sort()) {
            normObj[k] = value[k];
          }
          value = normObj;
        } else {
          value = Boolean(value);
        }
      } else if (dim === "reversibility") {
        value = typeof value === "string" ? value.toLowerCase().trim() : "unknown";
      } else if (dim === "diffStats") {
        if (typeof value === "object" && value !== null) {
          const files = Number.isSafeInteger(value.files) ? value.files : (Number.isSafeInteger(value.filesChanged) ? value.filesChanged : 0);
          const lines = Number.isSafeInteger(value.lines) ? value.lines : (Number.isSafeInteger(value.totalLines) ? value.totalLines : ((value.linesAdded || 0) + (value.linesDeleted || 0)));
          value = { files, lines };
        } else {
          value = { files: 0, lines: 0 };
        }
      } else if (dim === "selectedProfile") {
        value = typeof value === "string" ? value.toLowerCase().trim() : null;
      }
    } else if (status !== "available") {
      value = null;
    }

    normalized[dim] = {
      value,
      status,
      sourceContract
    };
  }

  return normalized;
}

/**
 * Load policy file from path or root directory.
 */
export function loadPolicy(rootOrPath) {
  let candidate = rootOrPath;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    candidate = path.join(candidate, "policies", "rigor-derivation.v1.json");
  }
  if (!fs.existsSync(candidate)) {
    // Fallback relative to import.meta.url
    const fallback = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../policies/rigor-derivation.v1.json");
    if (fs.existsSync(fallback)) candidate = fallback;
  }
  if (fs.existsSync(candidate)) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch {
      // ignore parse error, return null
    }
  }
  return null;
}

/**
 * Pure function: deriveMinimumRigor(inputs, policy)
 *
 * Evaluates minimum rigor floor deterministically.
 */
export function deriveMinimumRigor(inputs, policy = null) {
  const normalized = normalizeInputs(inputs);
  const inputDigest = computeInputDigest(normalized);

  const derivationRevision = policy?.derivationRevision || DEFAULT_DERIVATION_REVISION;
  const maxChangedFiles = policy?.diffThresholds?.maxChangedFiles ?? 5;
  const maxChangedLines = policy?.diffThresholds?.maxChangedLines ?? 150;

  const escalationTriggers = [];
  const triggerReasons = [];
  let currentRank = PROFILE_RANKS.mini; // baseline floor is mini

  const requiredEvidenceSet = new Set(BASE_EVIDENCE_CLASSES.mini);

  function escalate(targetProfile, trigger, reason, extraEvidence = []) {
    const targetRank = PROFILE_RANKS[targetProfile] ?? PROFILE_RANKS.mini;
    if (targetRank > currentRank) {
      currentRank = targetRank;
    }
    if (!escalationTriggers.includes(trigger)) {
      escalationTriggers.push(trigger);
    }
    triggerReasons.push(reason);
    for (const ev of (policy?.profileEvidenceClasses?.[targetProfile] ?? BASE_EVIDENCE_CLASSES[targetProfile] ?? [])) {
      requiredEvidenceSet.add(ev);
    }
    for (const ev of extraEvidence) {
      requiredEvidenceSet.add(ev);
    }
  }

  // 1. Evaluate protectedTouches
  const pt = normalized.protectedTouches;
  if (pt.status === "unavailable" || pt.status === "unknown") {
    escalate("feature", "UNAVAILABLE_OR_UNKNOWN_INPUT:protectedTouches", "Protected surface touches status is " + pt.status);
  } else if (pt.status === "available") {
    let hasProtectedTouch = false;
    if (Array.isArray(pt.value) && pt.value.length > 0) {
      hasProtectedTouch = true;
    } else if (typeof pt.value === "boolean" && pt.value === true) {
      hasProtectedTouch = true;
    } else if (typeof pt.value === "object" && pt.value !== null && Object.values(pt.value).some(Boolean)) {
      hasProtectedTouch = true;
    }
    if (hasProtectedTouch) {
      escalate("epic", "TOUCHES_PROTECTED_BASELINE", "Touches protected baseline surface", ["security"]);
    }
  }

  // Check actualPaths for protected touches directly (anti-tampering invariant)
  const ap = normalized.actualPaths;
  if (ap.status === "available" && Array.isArray(ap.value)) {
    const protectedMatches = ap.value.filter(isProtectedPath);
    if (protectedMatches.length > 0) {
      escalate("epic", "TOUCHES_PROTECTED_BASELINE", "Actual paths include protected baseline files: " + protectedMatches.slice(0, 3).join(", "), ["security"]);
    }
  }

  // 2. Evaluate reversibility
  const rev = normalized.reversibility;
  if (rev.status === "unavailable" || rev.status === "unknown") {
    escalate("feature", "UNAVAILABLE_OR_UNKNOWN_INPUT:reversibility", "Reversibility status is " + rev.status);
  } else if (rev.status === "available") {
    if (rev.value === "low" || rev.value === "irreversible") {
      escalate("epic", "IRREVERSIBLE_OR_LOW_REVERSIBILITY", "Change reversibility is " + rev.value, ["security"]);
    } else if (rev.value === "medium") {
      escalate("feature", "MEDIUM_REVERSIBILITY", "Change reversibility is medium");
    }
  }

  // 3. Evaluate contractDeltas
  const cd = normalized.contractDeltas;
  if (cd.status === "unavailable" || cd.status === "unknown") {
    escalate("feature", "UNAVAILABLE_OR_UNKNOWN_INPUT:contractDeltas", "Public contract deltas status is " + cd.status);
  } else if (cd.status === "available") {
    let hasContractDelta = false;
    if (Array.isArray(cd.value) && cd.value.length > 0) {
      hasContractDelta = true;
    } else if (typeof cd.value === "boolean" && cd.value === true) {
      hasContractDelta = true;
    } else if (typeof cd.value === "object" && cd.value !== null && Object.values(cd.value).some(Boolean)) {
      hasContractDelta = true;
    }
    if (hasContractDelta) {
      escalate("feature", "CONTRACT_OR_SCHEMA_DELTA", "Touches public contracts, schemas, or dependencies");
    }
  }

  // Check actualPaths for contract deltas directly
  if (ap.status === "available" && Array.isArray(ap.value)) {
    const contractMatches = ap.value.filter(isContractPath);
    if (contractMatches.length > 0) {
      escalate("feature", "CONTRACT_OR_SCHEMA_DELTA", "Actual paths include public contract or schema files: " + contractMatches.slice(0, 3).join(", "));
    }
  }

  // 4. Evaluate plannedPaths vs actualPaths (Surface Expansion Asymmetry)
  const pp = normalized.plannedPaths;
  if (pp.status === "available" && Array.isArray(pp.value) && ap.status === "available" && Array.isArray(ap.value)) {
    const plannedSet = new Set(pp.value);
    const expandedPaths = ap.value.filter((p) => !plannedSet.has(p));
    if (expandedPaths.length > 0) {
      escalate("feature", "SURFACE_EXPANSION", "Actual surface expanded beyond planned paths: " + expandedPaths.slice(0, 3).join(", "));
    }
  } else if (pp.status === "unavailable" || pp.status === "unknown") {
    // Missing planned paths cannot lower rigor; preserves or raises floor
    if (ap.status === "available" && Array.isArray(ap.value) && ap.value.length > 0) {
      escalate("feature", "UNAVAILABLE_OR_UNKNOWN_INPUT:plannedPaths", "Planned surface unavailable while actual surface has changes");
    }
  }

  // 5. Evaluate diffStats
  const ds = normalized.diffStats;
  if (ds.status === "unavailable" || ds.status === "unknown") {
    escalate("feature", "UNAVAILABLE_OR_UNKNOWN_INPUT:diffStats", "Diff stats status is " + ds.status);
  } else if (ds.status === "available" && ds.value) {
    const files = ds.value.files || 0;
    const lines = ds.value.lines || 0;
    if (files > maxChangedFiles || lines > maxChangedLines) {
      escalate("feature", "DIFF_SIZE_EXCEEDED_THRESHOLD", "Diff stats exceeded mini threshold (files: " + files + " > " + maxChangedFiles + " or lines: " + lines + " > " + maxChangedLines + ")");
    }
  }

  // Also check actualPaths count against maxChangedFiles
  if (ap.status === "available" && Array.isArray(ap.value) && ap.value.length > maxChangedFiles) {
    escalate("feature", "DIFF_SIZE_EXCEEDED_THRESHOLD", "Actual file count " + ap.value.length + " exceeds mini threshold " + maxChangedFiles);
  }

  // Determine minProfile
  const minProfile = PROFILES[currentRank];

  // Sync requiredEvidenceClasses with final minProfile
  for (const ev of (policy?.profileEvidenceClasses?.[minProfile] ?? BASE_EVIDENCE_CLASSES[minProfile] ?? [])) {
    requiredEvidenceSet.add(ev);
  }
  const requiredEvidenceClasses = Array.from(requiredEvidenceSet).sort();

  // 6. Explanation formulation
  let explanation = "";
  if (escalationTriggers.length === 0) {
    explanation = "Routine change qualifies for mini profile: no protected surface touches, high reversibility, no public contract deltas, and diff within threshold.";
  } else {
    explanation = "Derived minimum rigor floor is " + minProfile + " due to triggers: " + escalationTriggers.join(", ") + ". " + triggerReasons.join("; ") + ".";
  }

  // 7. Disagreement detection (selectedProfile vs minProfile)
  let disagreementLog = undefined;
  const sp = normalized.selectedProfile;
  if (sp.status === "available" && typeof sp.value === "string" && PROFILE_RANKS[sp.value] !== undefined) {
    const selectedRank = PROFILE_RANKS[sp.value];
    if (selectedRank < currentRank) {
      disagreementLog = {
        selected: sp.value,
        derived: minProfile,
        reason: "Selected profile '" + sp.value + "' is below derived minimum rigor floor '" + minProfile + "'. Escalation triggers: " + escalationTriggers.join(", ")
      };
      explanation += " Disagreement detected: selected profile '" + sp.value + "' is below derived floor '" + minProfile + "'.";
    } else if (selectedRank > currentRank) {
      explanation += " Human-selected profile '" + sp.value + "' is higher than derived floor '" + minProfile + "' and is respected beside the floor.";
    }
  }

  const result = {
    schema: SCHEMA_RIGOR_DERIVATION,
    minProfile,
    requiredEvidenceClasses,
    escalationTriggers,
    derivationRevision,
    inputDigest,
    explanation
  };

  if (disagreementLog) {
    result.disagreementLog = disagreementLog;
  }

  return result;
}

/**
 * Infer inputs from working tree if no inputs file is supplied.
 */
export function inferInputsFromRepo(root) {
  let actualPaths = [];
  let filesCount = 0;
  let linesCount = 0;

  try {
    const diffNames = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
    const untracked = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" });
    const paths = diffNames.split("\n").map(normalizePath).filter(Boolean);
    for (const line of untracked.split("\n")) {
      if (line.startsWith("?? ")) {
        paths.push(normalizePath(line.slice(3)));
      }
    }
    actualPaths = Array.from(new Set(paths)).sort();
    filesCount = actualPaths.length;
  } catch {
    actualPaths = [];
  }

  try {
    const diffStat = execFileSync("git", ["diff", "--shortstat", "HEAD"], { cwd: root, encoding: "utf8" });
    const match = diffStat.match(/(\d+)\s+insertions?\(\+\)(?:,\s+(\d+)\s+deletions?\(-\))?/);
    if (match) {
      linesCount = (parseInt(match[1], 10) || 0) + (parseInt(match[2], 10) || 0);
    }
  } catch {
    linesCount = 0;
  }

  return {
    plannedPaths: {
      value: actualPaths,
      status: "available",
      sourceContract: "git.working-tree"
    },
    actualPaths: {
      value: actualPaths,
      status: "available",
      sourceContract: "git.working-tree"
    },
    protectedTouches: {
      value: actualPaths.some(isProtectedPath),
      status: "available",
      sourceContract: "pipeline.protected-baseline.v1"
    },
    contractDeltas: {
      value: actualPaths.some(isContractPath),
      status: "available",
      sourceContract: "pipeline.contract-freeze.v1"
    },
    reversibility: {
      value: "high",
      status: "available",
      sourceContract: "pipeline.reversibility-assessment.v1"
    },
    diffStats: {
      value: { files: filesCount, lines: linesCount },
      status: "available",
      sourceContract: "git.diff-stat"
    },
    selectedProfile: {
      value: "mini",
      status: "available",
      sourceContract: "human.plan-selection"
    }
  };
}

export function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    inputsPath: null,
    format: "text"
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root" && i + 1 < argv.length) {
      options.root = path.resolve(argv[++i]);
    } else if (arg === "--inputs" && i + 1 < argv.length) {
      options.inputsPath = path.resolve(argv[++i]);
    } else if (arg === "--format" && i + 1 < argv.length) {
      options.format = argv[++i];
    }
  }

  return options;
}

export function main() {
  const options = parseArgs(process.argv);
  const policy = loadPolicy(options.root);

  let rawInputs = null;
  if (options.inputsPath) {
    try {
      rawInputs = JSON.parse(fs.readFileSync(options.inputsPath, "utf8"));
    } catch (err) {
      console.error("Failed to read inputs file: " + err.message);
      process.exit(1);
    }
  } else {
    rawInputs = inferInputsFromRepo(options.root);
  }

  const result = deriveMinimumRigor(rawInputs, policy);

  if (options.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("Minimum Rigor Floor Derivation");
    console.log("===============================");
    console.log("minProfile:              " + result.minProfile);
    console.log("derivationRevision:      " + result.derivationRevision);
    console.log("inputDigest:             " + result.inputDigest);
    console.log("requiredEvidenceClasses: " + result.requiredEvidenceClasses.join(", "));
    console.log("escalationTriggers:      " + (result.escalationTriggers.length > 0 ? result.escalationTriggers.join(", ") : "none"));
    if (result.disagreementLog) {
      console.log("");
      console.log("DISAGREEMENT LOG:");
      console.log("  Selected: " + result.disagreementLog.selected);
      console.log("  Derived:  " + result.disagreementLog.derived);
      console.log("  Reason:   " + result.disagreementLog.reason);
    }
    console.log("");
    console.log("Explanation: " + result.explanation);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main();
}
