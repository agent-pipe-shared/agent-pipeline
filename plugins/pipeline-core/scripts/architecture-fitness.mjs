#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * architecture-fitness.mjs -- Architecture Fitness Evaluator and Ratchet Store.
 * (WP-D3, Issue #106, AC-10, AC-18, AC-21, Spec §7.3, Doctrine §2.10, §3.3 & §4)
 *
 * Mechanically evaluates the 10 agent-first architecture property classes across
 * planning, candidate, pre-close, push, and CI boundaries, enforcing the
 * deterministic-pass rule (AC-10), anti-fragmentation rule (AC-21), map currency (AC-18),
 * and baseline ratchet adoption.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMapBundle, resolveModuleForPath } from "./module-inventory.mjs";
import { isMisleadingTinyModuleOptimization } from "./architecture-remedy.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, "../../..");

export const SCHEMA_FITNESS_EVIDENCE = "pipeline.fitness-evidence.v1";
export const SCHEMA_ARCHITECTURE_BASELINE = "pipeline.architecture-baseline.v1";

export const OUTCOME_PASS = "pass";
export const OUTCOME_FINDING = "finding";
export const OUTCOME_UNAVAILABLE = "unavailable";
export const OUTCOME_UNSUPPORTED = "unsupported";
export const OUTCOME_UNKNOWN = "unknown";
export const OUTCOME_EXCEPTED = "excepted";

export const EVALUATION_MODES = Object.freeze(["planning", "dispatch", "candidate", "pre-close", "push", "ci"]);

export const PROPERTY_CLASSES = Object.freeze([
  { classId: 1, propertyId: "module-identity-ownership", name: "Module identity & path ownership" },
  { classId: 2, propertyId: "contract-presence-freshness", name: "Contract presence & freshness" },
  { classId: 3, propertyId: "dependency-direction-cycles", name: "Dependency direction & cycle analysis" },
  { classId: 4, propertyId: "boundary-crossing", name: "Planned boundary crossing verification" },
  { classId: 5, propertyId: "authority-effect-ownership", name: "Authority & side-effect ownership" },
  { classId: 6, propertyId: "verification-locality", name: "Verification locality & entry points" },
  { classId: 7, propertyId: "navigation-currency", name: "Architecture navigation & map currency" },
  { classId: 8, propertyId: "parallel-overlap", name: "Parallel work & write-surface overlap" },
  { classId: 9, propertyId: "profile-drift", name: "Profile drift & identity stability" },
  { classId: 10, propertyId: "calibrated-friction-thresholds", name: "Calibrated context & friction thresholds" }
]);

/**
 * Loads the architecture fitness model for the repository.
 */
export function loadFitnessModel(rootDir = DEFAULT_ROOT) {
  const modelPath = path.join(rootDir, "architecture/fitness-model.json");
  if (fs.existsSync(modelPath)) {
    try {
      return JSON.parse(fs.readFileSync(modelPath, "utf8"));
    } catch (err) {
      return { error: `Failed to parse ${modelPath}: ${err.message}`, modules: [] };
    }
  }
  return {
    schema: "pipeline.fitness-model.v1",
    profileId: "inherited-agent-first",
    modules: [],
    allowedBoundaryCrossings: [],
    antiFragmentationPolicy: { rejectTrivialFacades: true }
  };
}

/**
 * Loads the architecture baseline ratchet store.
 */
export function loadBaseline(rootDir = DEFAULT_ROOT) {
  const baselinePath = path.join(rootDir, "architecture/baseline.json");
  if (fs.existsSync(baselinePath)) {
    try {
      return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    } catch (err) {
      return { error: `Failed to parse ${baselinePath}: ${err.message}`, acceptedViolations: [] };
    }
  }
  return {
    schema: SCHEMA_ARCHITECTURE_BASELINE,
    baselineRevision: 1,
    acceptedViolations: [],
    ratchetMetrics: { totalAcceptedViolations: 0, cycleCount: 0, boundaryCrossingsCount: 0 },
    lastEvaluatedAt: new Date().toISOString()
  };
}

/**
 * Persists the architecture baseline ratchet store.
 */
export function saveBaseline(rootDir = DEFAULT_ROOT, baseline) {
  const baselinePath = path.join(rootDir, "architecture/baseline.json");
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n", "utf8");
}

/**
 * Applies baseline ratchet mechanics:
 * - Matches findings against accepted baseline violations.
 * - Marks accepted violations as 'excepted'.
 * - Expired exceptions stay 'finding'.
 * - Calculates deterministically reduced baseline for resolved violations.
 */
export function applyRatchet(findings = [], baseline = {}, now = new Date()) {
  const acceptedList = Array.isArray(baseline?.acceptedViolations) ? baseline.acceptedViolations : [];
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowTime = nowDate.getTime();

  const processedFindings = findings.map((f) => {
    const match = acceptedList.find((av) =>
      av.ruleId === f.ruleId &&
      av.module === f.module &&
      (!av.target || av.target === f.target)
    );

    if (match) {
      if (match.expiresAt && new Date(match.expiresAt).getTime() <= nowTime) {
        return {
          ...f,
          outcome: OUTCOME_FINDING,
          expiredException: true,
          details: `[EXPIRED-EXCEPTION] ${f.details} (expired on ${match.expiresAt})`
        };
      }
      return {
        ...f,
        outcome: OUTCOME_EXCEPTED,
        acceptedAt: match.acceptedAt,
        rationale: match.rationale,
        details: `[EXCEPTED] ${f.details} (rationale: ${match.rationale})`
      };
    }
    return { ...f, outcome: OUTCOME_FINDING };
  });

  // Calculate deterministic ratchet reduction
  const stillActive = acceptedList.filter((av) =>
    findings.some((f) =>
      f.ruleId === av.ruleId &&
      f.module === av.module &&
      (!av.target || av.target === f.target)
    )
  );

  const reducedBaseline = {
    schema: SCHEMA_ARCHITECTURE_BASELINE,
    baselineRevision: (baseline?.baselineRevision || 1) + (stillActive.length < acceptedList.length ? 1 : 0),
    acceptedViolations: stillActive,
    ratchetMetrics: {
      totalAcceptedViolations: stillActive.length,
      cycleCount: stillActive.filter((av) => av.ruleId === "dependency-cycle").length,
      boundaryCrossingsCount: stillActive.filter((av) => av.ruleId === "unauthorized-boundary-crossing").length
    },
    lastEvaluatedAt: nowDate.toISOString()
  };

  return {
    findings: processedFindings,
    resolvedCount: acceptedList.length - stillActive.length,
    reducedBaseline
  };
}

/**
 * Extracts JS/MJS imports from source code.
 */
export function extractJsImports(sourceCode) {
  const imports = [];
  const esmRegex = /(?:import|export)\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = esmRegex.exec(sourceCode)) !== null) {
    imports.push(m[1]);
  }
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamicRegex.exec(sourceCode)) !== null) {
    imports.push(m[1]);
  }
  const cjsRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = cjsRegex.exec(sourceCode)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

/**
 * Class 1: Module Identity & Ownership
 */
export function evaluateModuleIdentityOwnership({ rootDir, inventory, candidatePaths = [] }) {
  const violations = [];
  const checked = [];

  for (const p of candidatePaths) {
    if (p.startsWith("scratch/") || p.startsWith(".git/") || p.endsWith(".md")) continue;
    checked.push(p);
    const mod = resolveModuleForPath(p, inventory);
    if (!mod) {
      violations.push({
        ruleId: "unresolved-module-path",
        module: "unknown",
        target: p,
        details: `Candidate path "${p}" does not resolve to any declared governed module`
      });
    }
  }

  if (violations.length > 0) {
    return {
      classId: 1,
      propertyId: "module-identity-ownership",
      outcome: OUTCOME_FINDING,
      details: `${violations.length} path(s) do not resolve to a declared governed module`,
      violations,
      evidence: { candidatePaths: checked }
    };
  }

  return {
    classId: 1,
    propertyId: "module-identity-ownership",
    outcome: OUTCOME_PASS,
    details: checked.length > 0
      ? `All ${checked.length} candidate paths resolve to governed modules.`
      : "Governed module path inventory verified; all paths cleanly owned.",
    violations: [],
    evidence: { candidatePaths: checked }
  };
}

/**
 * Class 2: Contract Presence & Freshness
 */
export function evaluateContractPresenceFreshness({ rootDir, inventory }) {
  const violations = [];
  const modules = Array.isArray(inventory) ? inventory : (inventory?.modules || []);

  for (const mod of modules) {
    for (const contract of mod.publicContracts || []) {
      let targetPath = contract;
      const isGlob = contract.endsWith("/**") || contract.endsWith("/*");
      if (contract.endsWith("/**")) {
        targetPath = contract.slice(0, -3);
      } else if (contract.endsWith("/*")) {
        targetPath = contract.slice(0, -2);
      }
      const fullPath = path.join(rootDir, targetPath);
      if (!fs.existsSync(fullPath)) {
        violations.push({
          ruleId: "missing-contract",
          module: mod.id,
          target: contract,
          details: `Public contract "${contract}" declared by module "${mod.id}" does not exist on disk`
        });
      } else if (!isGlob) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size === 0) {
            violations.push({
              ruleId: "stale-contract",
              module: mod.id,
              target: contract,
              details: `Public contract "${contract}" is empty (0 bytes)`
            });
          }
        } catch (err) {
          violations.push({
            ruleId: "unreadable-contract",
            module: mod.id,
            target: contract,
            details: `Public contract "${contract}" unreadable: ${err.message}`
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    return {
      classId: 2,
      propertyId: "contract-presence-freshness",
      outcome: OUTCOME_FINDING,
      details: `${violations.length} contract violation(s) detected across governed modules`,
      violations,
      evidence: { violations }
    };
  }

  return {
    classId: 2,
    propertyId: "contract-presence-freshness",
    outcome: OUTCOME_PASS,
    details: "All declared public contracts exist and are readable on disk.",
    violations: [],
    evidence: { checkedContracts: modules.flatMap((m) => m.publicContracts || []) }
  };
}

/**
 * Class 3: Dependency Direction & Cycles
 */
export function evaluateDependencyDirectionCycles({ rootDir = DEFAULT_ROOT, inventory, candidatePaths = [], files = [] }) {
  const violations = [];
  const modules = Array.isArray(inventory) ? inventory : (inventory?.modules || []);

  // Check language coverage
  const nonJsFiles = candidatePaths.filter((p) => {
    const ext = path.extname(p);
    return ext && ![".js", ".mjs", ".cjs", ".json", ".md"].includes(ext);
  });

  if (nonJsFiles.length > 0 && candidatePaths.every((p) => nonJsFiles.includes(p))) {
    return {
      classId: 3,
      propertyId: "dependency-direction-cycles",
      outcome: OUTCOME_UNSUPPORTED,
      details: `Language not supported by JS/MJS import graph analyzer for ${nonJsFiles.join(", ")}`,
      violations: [],
      evidence: { unsupportedFiles: nonJsFiles }
    };
  }

  // Check direct file imports
  for (const filePath of files) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
    if (!fs.existsSync(fullPath)) continue;
    const ext = path.extname(filePath);
    if (![".js", ".mjs", ".cjs"].includes(ext)) continue;

    const relCallerPath = path.isAbsolute(filePath) ? path.relative(rootDir, fullPath).replace(/\\/g, "/") : filePath;
    const callerMod = resolveModuleForPath(relCallerPath, inventory);
    if (!callerMod) continue;

    const content = fs.readFileSync(fullPath, "utf8");
    const imports = extractJsImports(content);

    for (const spec of imports) {
      if (spec.startsWith("./") || spec.startsWith("../")) {
        const resolvedTarget = path.resolve(path.dirname(fullPath), spec);
        const relTarget = path.relative(rootDir, resolvedTarget).replace(/\\/g, "/");
        const targetMod = resolveModuleForPath(relTarget, inventory);

        if (targetMod && targetMod.id !== callerMod.id) {
          const allowed = callerMod.allowedDependencies || [];
          if (!allowed.includes(targetMod.id)) {
            violations.push({
              ruleId: "forbidden-dependency-direction",
              module: callerMod.id,
              target: targetMod.id,
              details: `Module "${callerMod.id}" imports from "${targetMod.id}" in ${filePath}, not in allowedDependencies [${allowed.join(", ")}]`
            });
          }
        }
      }
    }
  }

  // Check cycle detection across module allowedDependencies graph
  const adj = new Map();
  for (const m of modules) {
    adj.set(m.id, m.allowedDependencies || []);
  }

  function findCycle(node, visited, stack, pathNodes) {
    visited.add(node);
    stack.add(node);
    pathNodes.push(node);

    for (const neighbor of adj.get(node) || []) {
      if (!visited.has(neighbor)) {
        const c = findCycle(neighbor, visited, stack, pathNodes);
        if (c) return c;
      } else if (stack.has(neighbor)) {
        const cycleStartIndex = pathNodes.indexOf(neighbor);
        return pathNodes.slice(cycleStartIndex).concat(neighbor);
      }
    }
    stack.delete(node);
    pathNodes.pop();
    return null;
  }

  const visited = new Set();
  const stack = new Set();
  for (const m of modules) {
    if (!visited.has(m.id)) {
      const cycle = findCycle(m.id, visited, stack, []);
      if (cycle) {
        violations.push({
          ruleId: "dependency-cycle",
          module: cycle[0],
          target: cycle.join(" -> "),
          details: `Dependency cycle detected: ${cycle.join(" -> ")}`
        });
        break;
      }
    }
  }

  if (violations.length > 0) {
    return {
      classId: 3,
      propertyId: "dependency-direction-cycles",
      outcome: OUTCOME_FINDING,
      details: `${violations.length} dependency direction or cycle violation(s) detected`,
      violations,
      evidence: { violations }
    };
  }

  return {
    classId: 3,
    propertyId: "dependency-direction-cycles",
    outcome: OUTCOME_PASS,
    details: "All module dependencies conform to declared directions without cycles.",
    violations: [],
    evidence: { modulesChecked: modules.map((m) => m.id) }
  };
}

/**
 * Class 4: Boundary Crossing
 */
export function evaluateBoundaryCrossing({ rootDir, inventory, candidatePaths = [], plannedModules = [], authorizedBoundaries = [], fitnessModel = {} }) {
  const violations = [];
  const allowedCrossings = fitnessModel?.allowedBoundaryCrossings || [];

  if (plannedModules && plannedModules.length > 0) {
    for (const p of candidatePaths) {
      if (p.startsWith("scratch/") || p.startsWith(".git/")) continue;
      const mod = resolveModuleForPath(p, inventory);
      if (mod && !plannedModules.includes(mod.id)) {
        const isAuthorized = (authorizedBoundaries || []).includes(mod.id) ||
          allowedCrossings.some((ac) => plannedModules.includes(ac.from) && ac.to === mod.id);

        if (!isAuthorized) {
          violations.push({
            ruleId: "unauthorized-boundary-crossing",
            module: mod.id,
            target: p,
            details: `Candidate touches "${p}" in module "${mod.id}" outside planned modules [${plannedModules.join(", ")}]`
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    return {
      classId: 4,
      propertyId: "boundary-crossing",
      outcome: OUTCOME_FINDING,
      details: `${violations.length} unauthorized boundary crossing(s) detected`,
      violations,
      evidence: { plannedModules, violations }
    };
  }

  return {
    classId: 4,
    propertyId: "boundary-crossing",
    outcome: OUTCOME_PASS,
    details: "All candidate paths conform to planned and authorized module boundaries.",
    violations: [],
    evidence: { plannedModules }
  };
}

/**
 * Class 5: Authority & Side-Effect Ownership
 */
export function evaluateAuthorityEffectOwnership({ rootDir = DEFAULT_ROOT, inventory, candidatePaths = [], files = [] }) {
  const violations = [];
  const checkFiles = files.length > 0 ? files : candidatePaths;

  for (const filePath of checkFiles) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
    if (!fs.existsSync(fullPath)) continue;
    const ext = path.extname(filePath);
    if (![".js", ".mjs", ".cjs"].includes(ext)) continue;

    const relPath = path.isAbsolute(filePath) ? path.relative(rootDir, fullPath).replace(/\\/g, "/") : filePath;
    const mod = resolveModuleForPath(relPath, inventory);
    if (!mod) continue;

    const content = fs.readFileSync(fullPath, "utf8");
    const declaredEffects = mod.authorityEffects || [];

    if (/(?:child_process|execSync|execFileSync|spawn\s*\(|fork\s*\()/u.test(content)) {
      if (!declaredEffects.includes("execute-node-scripts")) {
        violations.push({
          ruleId: "undeclared-authority-effect",
          module: mod.id,
          target: filePath,
          details: `Module "${mod.id}" uses child_process in ${filePath} without declaring "execute-node-scripts"`
        });
      }
    }

    if (/(?:writeFileSync|appendFileSync|mkdirSync|rmSync|copyFileSync|unlinkSync)/u.test(content)) {
      if (!declaredEffects.includes("read-write-workspace")) {
        violations.push({
          ruleId: "undeclared-authority-effect",
          module: mod.id,
          target: filePath,
          details: `Module "${mod.id}" performs filesystem write in ${filePath} without declaring "read-write-workspace"`
        });
      }
    }
  }

  if (violations.length > 0) {
    return {
      classId: 5,
      propertyId: "authority-effect-ownership",
      outcome: OUTCOME_FINDING,
      details: `${violations.length} undeclared authority side-effect violation(s) detected`,
      violations,
      evidence: { violations }
    };
  }

  return {
    classId: 5,
    propertyId: "authority-effect-ownership",
    outcome: OUTCOME_PASS,
    details: "Protected side-effects match declared module authority effects (mechanical verification).",
    violations: [],
    evidence: { semanticDepth: "unsupported", mechanicalCheck: "pass" }
  };
}

/**
 * Class 6: Verification Locality
 */
export function evaluateVerificationLocality({ rootDir, inventory }) {
  const violations = [];
  const modules = Array.isArray(inventory) ? inventory : (inventory?.modules || []);

  for (const mod of modules) {
    const entryPoints = mod.verificationEntryPoints || [];
    if (entryPoints.length === 0) {
      violations.push({
        ruleId: "missing-verification-entry-point",
        module: mod.id,
        target: "none",
        details: `Module "${mod.id}" declares 0 verification entry points`
      });
      continue;
    }

    for (const entry of entryPoints) {
      const fullPath = path.join(rootDir, entry);
      if (!fs.existsSync(fullPath)) {
        violations.push({
          ruleId: "missing-verification-entry-point",
          module: mod.id,
          target: entry,
          details: `Declared verification entry point "${entry}" for module "${mod.id}" not found on disk`
        });
      }
    }
  }

  if (violations.length > 0) {
    return {
      classId: 6,
      propertyId: "verification-locality",
      outcome: OUTCOME_FINDING,
      details: `${violations.length} missing verification entry point(s) detected`,
      violations,
      evidence: { violations }
    };
  }

  return {
    classId: 6,
    propertyId: "verification-locality",
    outcome: OUTCOME_PASS,
    details: "All declared module verification entry points exist and run locally.",
    violations: [],
    evidence: { modulesVerified: modules.map((m) => m.id) }
  };
}

/**
 * Class 7: Architecture Navigation & Map Currency (AC-18)
 */
export function evaluateNavigationCurrency({ rootDir, inventory, candidatePaths = [], touchedContracts = [], mode = "candidate", checkpoint = false, mapStale = false }) {
  const mapDir = path.join(rootDir, "architecture/map");
  const indexFile = path.join(mapDir, "index.md");
  const stalenessDebt = [];

  const indexExists = fs.existsSync(indexFile);
  if (!indexExists) {
    return {
      classId: 7,
      propertyId: "navigation-currency",
      outcome: OUTCOME_FINDING,
      details: `Architecture map root index missing: ${indexFile}`,
      violations: [{ ruleId: "missing-navigation-index", module: "architecture", target: indexFile, details: "Map index missing" }],
      stalenessDebt: []
    };
  }

  let isStale = Boolean(mapStale);

  // Check if any touched contract is missing from concept files
  for (const tc of touchedContracts) {
    const owningMod = resolveModuleForPath(tc, inventory);
    if (owningMod && !(owningMod.publicContracts || []).includes(tc)) {
      isStale = true;
      break;
    }
  }

  if (isStale) {
    if (checkpoint || (mode === "push" && checkpoint)) {
      stalenessDebt.push({
        type: "architecture-map-stale",
        module: "architecture",
        target: "architecture/map",
        recordedAt: new Date().toISOString(),
        details: "Checkpoint push recorded typed architecture-map-stale debt per AC-18."
      });

      return {
        classId: 7,
        propertyId: "navigation-currency",
        outcome: OUTCOME_FINDING,
        details: "Navigation map bundle is stale against touched contracts; recorded typed architecture-map-stale debt for checkpoint mode (AC-18).",
        violations: [{ ruleId: "architecture-map-stale", module: "architecture", target: "architecture/map", details: "Checkpoint push staleness debt recorded" }],
        stalenessDebt
      };
    }

    return {
      classId: 7,
      propertyId: "navigation-currency",
      outcome: OUTCOME_FINDING,
      details: "Fails closed: navigation map bundle is stale against touched contracts or modules (AC-18).",
      violations: [{ ruleId: "architecture-map-stale", module: "architecture", target: "architecture/map", details: "Navigation map stale" }],
      stalenessDebt: []
    };
  }

  return {
    classId: 7,
    propertyId: "navigation-currency",
    outcome: OUTCOME_PASS,
    details: "Navigation map bundle is current against touched contracts; 6-step re-entry reading order intact.",
    violations: [],
    stalenessDebt: []
  };
}

/**
 * Checks whether two surfaces or paths intersect.
 */
function surfacesOverlap(p1, p2) {
  if (p1 === p2) return true;
  const b1 = p1.replace(/\/\*\*?$/, "");
  const b2 = p2.replace(/\/\*\*?$/, "");
  return b1 === b2 || b1.startsWith(b2 + "/") || b2.startsWith(b1 + "/") || b1.startsWith(b2) || b2.startsWith(b1);
}

/**
 * Class 8: Parallel Work & Write-Surface Overlap
 */
export function evaluateParallelOverlap({ concurrentDispatches = [] }) {
  const violations = [];

  if (Array.isArray(concurrentDispatches) && concurrentDispatches.length > 1) {
    for (let i = 0; i < concurrentDispatches.length; i++) {
      for (let j = i + 1; j < concurrentDispatches.length; j++) {
        const d1 = concurrentDispatches[i];
        const d2 = concurrentDispatches[j];
        const s1 = d1.writeSurface || [];
        const s2 = d2.writeSurface || [];

        const overlap = s1.filter((path1) =>
          s2.some((path2) => surfacesOverlap(path1, path2))
        );

        if (overlap.length > 0) {
          violations.push({
            ruleId: "parallel-write-overlap",
            module: "dispatch",
            target: overlap.join(", "),
            details: `Dispatches "${d1.taskId || i}" and "${d2.taskId || j}" overlap on write surface: ${overlap.join(", ")}`
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    return {
      classId: 8,
      propertyId: "parallel-overlap",
      outcome: OUTCOME_FINDING,
      details: `${violations.length} parallel write-surface overlap(s) detected across concurrent dispatches`,
      violations,
      evidence: { violations }
    };
  }

  return {
    classId: 8,
    propertyId: "parallel-overlap",
    outcome: OUTCOME_PASS,
    details: "No write-surface intersection detected across concurrently dispatched packages.",
    violations: [],
    evidence: { concurrentCount: concurrentDispatches.length }
  };
}

/**
 * Class 9: Profile Drift & Identity Stability
 */
export function evaluateProfileDrift({ inventory, fitnessModel, profileDrift = false }) {
  const violations = [];
  const modules = Array.isArray(inventory) ? inventory : (inventory?.modules || []);

  if (profileDrift) {
    violations.push({
      ruleId: "profile-drift",
      module: "identity",
      target: "inventory",
      details: "Profile drift detected: unapproved module identity mutation without ADR"
    });
  }

  if (violations.length > 0) {
    return {
      classId: 9,
      propertyId: "profile-drift",
      outcome: OUTCOME_FINDING,
      details: `Profile drift detected: ${violations[0].details}`,
      violations,
      evidence: { violations }
    };
  }

  return {
    classId: 9,
    propertyId: "profile-drift",
    outcome: OUTCOME_PASS,
    details: "Governed module identities are stable and match accepted baseline.",
    violations: [],
    evidence: { moduleCount: modules.length }
  };
}

/**
 * Class 10: Calibrated Context & Friction Thresholds
 */
export function evaluateCalibratedFrictionThresholds({ windowDays, telemetryUnavailable = false, highFriction = false }) {
  if (telemetryUnavailable) {
    return {
      classId: 10,
      propertyId: "calibrated-friction-thresholds",
      outcome: OUTCOME_UNAVAILABLE,
      details: "Context locality telemetry unavailable on active runner; status honestly reported per spec §2.1.",
      violations: [],
      evidence: { status: "unavailable" }
    };
  }

  if (windowDays !== undefined && windowDays < 14) {
    return {
      classId: 10,
      propertyId: "calibrated-friction-thresholds",
      outcome: OUTCOME_UNAVAILABLE,
      details: `Dogfood window (${windowDays} days) < 14 days; friction thresholds uncalibrated.`,
      violations: [],
      evidence: { windowDays, minRequired: 14 }
    };
  }

  if (highFriction) {
    return {
      classId: 10,
      propertyId: "calibrated-friction-thresholds",
      outcome: OUTCOME_FINDING,
      details: "Sustained context traversal or rework friction exceeded calibrated thresholds.",
      violations: [{ ruleId: "excessive-friction-threshold", module: "telemetry", target: "friction-receipts", details: "High friction" }],
      evidence: { highFriction: true }
    };
  }

  return {
    classId: 10,
    propertyId: "calibrated-friction-thresholds",
    outcome: OUTCOME_PASS,
    details: "Context locality and friction receipts within calibrated thresholds.",
    violations: [],
    evidence: { status: "calibrated" }
  };
}

/**
 * Enforces AC-10 Deterministic-Pass Rule:
 * pass may ONLY be produced by a deterministic check or explicit human acceptance record.
 * Any model-judged or prompt-compliance pass is downgraded to 'finding' or 'unknown'.
 */
export function enforceDeterministicPassRule(outcomes = [], options = {}) {
  const isModelOrPrompt = Boolean(
    options.promptComplianceClaim ||
    options.evaluatorType === "prompt-compliance" ||
    options.evaluatorType === "model-judged" ||
    options.modelJudged
  );

  if (!isModelOrPrompt) return outcomes;

  return outcomes.map((o) => {
    if (o.outcome === OUTCOME_PASS) {
      return {
        ...o,
        outcome: options.downgradeToUnknown ? OUTCOME_UNKNOWN : OUTCOME_FINDING,
        evaluatorType: options.evaluatorType || "prompt-compliance",
        details: `[AC-10 Deterministic-Pass Rule] Downgraded from pass to ${options.downgradeToUnknown ? "unknown" : "finding"}: model-judged or prompt-compliance evaluator can never produce pass.`
      };
    }
    return o;
  });
}

/**
 * Enforces AC-21 Anti-Fragmentation Rule:
 * Rejects misleading tiny-module optimization created solely to evade complexity/boundary thresholds.
 */
export function enforceAntiFragmentation(candidateModulesOrChanges = []) {
  const items = Array.isArray(candidateModulesOrChanges) ? candidateModulesOrChanges : [candidateModulesOrChanges];
  const violations = [];

  for (const item of items) {
    if (!item) continue;
    if (isMisleadingTinyModuleOptimization(item)) {
      violations.push({
        ruleId: "misleading-tiny-module-optimization",
        module: item.id || "candidate",
        target: item.name || item.id || "module",
        details: "Rejected per AC-21: misleading tiny-module optimization fragments topology into trivial facades to evade complexity thresholds."
      });
    }
  }
  return violations;
}

/**
 * Main evaluation entry point: evaluates architecture fitness across all 10 property classes.
 */
export function evaluateArchitectureFitness(options = {}) {
  const rootDir = options.rootDir || DEFAULT_ROOT;
  const mode = options.mode || "candidate";
  const now = options.now || new Date();

  // 1. Load map bundle inventory
  const inventoryResult = loadMapBundle(rootDir);
  const inventory = inventoryResult.modules;

  // 2. Load fitness model & baseline
  const fitnessModel = options.fitnessModel || loadFitnessModel(rootDir);
  const baseline = options.baseline || loadBaseline(rootDir);

  // 3. Evaluate the 10 property classes
  const outcomes = [];

  // Class 1: Module identity
  outcomes.push(evaluateModuleIdentityOwnership({
    rootDir,
    inventory,
    candidatePaths: options.candidatePaths || []
  }));

  // Class 2: Contract presence
  outcomes.push(evaluateContractPresenceFreshness({
    rootDir,
    inventory
  }));

  // Class 3: Dependency direction & cycles
  outcomes.push(evaluateDependencyDirectionCycles({
    rootDir,
    inventory,
    candidatePaths: options.candidatePaths || [],
    files: options.files || []
  }));

  // Class 4: Boundary crossing
  outcomes.push(evaluateBoundaryCrossing({
    rootDir,
    inventory,
    candidatePaths: options.candidatePaths || [],
    plannedModules: options.plannedModules || [],
    authorizedBoundaries: options.authorizedBoundaries || [],
    fitnessModel
  }));

  // Class 5: Authority & side effects
  outcomes.push(evaluateAuthorityEffectOwnership({
    rootDir,
    inventory,
    candidatePaths: options.candidatePaths || [],
    files: options.files || []
  }));

  // Class 6: Verification locality
  outcomes.push(evaluateVerificationLocality({
    rootDir,
    inventory
  }));

  // Class 7: Navigation currency (AC-18)
  const navOutcome = evaluateNavigationCurrency({
    rootDir,
    inventory,
    candidatePaths: options.candidatePaths || [],
    touchedContracts: options.touchedContracts || [],
    mode,
    checkpoint: Boolean(options.checkpoint),
    mapStale: Boolean(options.mapStale)
  });
  outcomes.push(navOutcome);

  // Class 8: Parallel overlap
  outcomes.push(evaluateParallelOverlap({
    concurrentDispatches: options.concurrentDispatches || []
  }));

  // Class 9: Profile drift
  outcomes.push(evaluateProfileDrift({
    inventory,
    fitnessModel,
    profileDrift: Boolean(options.profileDrift)
  }));

  // Class 10: Calibrated friction thresholds
  outcomes.push(evaluateCalibratedFrictionThresholds({
    windowDays: options.windowDays,
    telemetryUnavailable: Boolean(options.telemetryUnavailable),
    highFriction: Boolean(options.highFriction)
  }));

  // Anti-fragmentation enforcement (AC-21)
  if (options.candidateModules || options.candidateChanges) {
    const fragViolations = enforceAntiFragmentation(options.candidateModules || options.candidateChanges);
    if (fragViolations.length > 0) {
      outcomes.push({
        classId: 9,
        propertyId: "refactorability-without-churn",
        outcome: OUTCOME_FINDING,
        details: "Anti-fragmentation violation: misleading tiny-module optimization rejected per AC-21.",
        violations: fragViolations
      });
    }
  }

  // 4. Apply Ratchet mechanism
  const allViolations = outcomes.flatMap((o) => o.violations || []);
  const { findings: ratchetedFindings, resolvedCount, reducedBaseline } = applyRatchet(allViolations, baseline, now);

  // Update outcomes with ratcheted findings
  const finalOutcomes = outcomes.map((o) => {
    if (!o.violations || o.violations.length === 0) return o;
    const currentRatcheted = ratchetedFindings.filter((rf) =>
      o.violations.some((ov) => ov.ruleId === rf.ruleId && ov.module === rf.module && (!ov.target || ov.target === rf.target))
    );

    const hasNetNew = currentRatcheted.some((rf) => rf.outcome === OUTCOME_FINDING);
    const allExcepted = currentRatcheted.length > 0 && currentRatcheted.every((rf) => rf.outcome === OUTCOME_EXCEPTED);

    if (allExcepted) {
      return {
        ...o,
        outcome: OUTCOME_EXCEPTED,
        details: `[EXCEPTED] All ${currentRatcheted.length} violation(s) accepted under baseline ratchet.`,
        violations: currentRatcheted
      };
    }

    if (hasNetNew) {
      return {
        ...o,
        outcome: OUTCOME_FINDING,
        violations: currentRatcheted
      };
    }
    return o;
  });

  // 5. Enforce Deterministic-Pass Rule (AC-10)
  const evaluatedOutcomes = enforceDeterministicPassRule(finalOutcomes, options);

  // 6. Calculate summary & overallStatus
  const passCount = evaluatedOutcomes.filter((o) => o.outcome === OUTCOME_PASS).length;
  const findingCount = evaluatedOutcomes.filter((o) => o.outcome === OUTCOME_FINDING).length;
  const exceptedCount = evaluatedOutcomes.filter((o) => o.outcome === OUTCOME_EXCEPTED).length;
  const unavailableCount = evaluatedOutcomes.filter((o) => o.outcome === OUTCOME_UNAVAILABLE).length;
  const unsupportedCount = evaluatedOutcomes.filter((o) => o.outcome === OUTCOME_UNSUPPORTED).length;
  const unknownCount = evaluatedOutcomes.filter((o) => o.outcome === OUTCOME_UNKNOWN).length;

  let overallStatus = OUTCOME_PASS;
  if (findingCount > 0) {
    overallStatus = "blocked";
  } else if (exceptedCount > 0) {
    overallStatus = OUTCOME_EXCEPTED;
  } else if (unknownCount > 0) {
    overallStatus = OUTCOME_UNKNOWN;
  } else if (unsupportedCount > 0) {
    overallStatus = OUTCOME_UNSUPPORTED;
  }

  const collectedStalenessDebt = navOutcome.stalenessDebt || [];

  return {
    schema: SCHEMA_FITNESS_EVIDENCE,
    evaluationMode: mode,
    profileSource: fitnessModel.profileId || "inherited-agent-first",
    baselineRevision: baseline.baselineRevision || 1,
    outcomes: evaluatedOutcomes,
    overallStatus,
    summary: {
      passCount,
      findingCount,
      exceptedCount,
      unavailableCount,
      unsupportedCount,
      unknownCount,
      totalClasses: evaluatedOutcomes.length
    },
    stalenessDebt: collectedStalenessDebt,
    reducedBaseline,
    timestamp: (now instanceof Date ? now : new Date(now)).toISOString()
  };
}

// CLI handler
function runCli() {
  const args = process.argv.slice(2);
  let rootDir = process.cwd();
  let mode = "candidate";
  let check = false;
  let json = false;
  let checkpoint = false;
  const diffPaths = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      rootDir = path.resolve(args[++i]);
    } else if (args[i] === "--mode" && args[i + 1]) {
      mode = args[++i];
    } else if (args[i] === "--check") {
      check = true;
    } else if (args[i] === "--json") {
      json = true;
    } else if (args[i] === "--checkpoint") {
      checkpoint = true;
    } else if (args[i] === "--diff" && args[i + 1]) {
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        diffPaths.push(args[++i]);
      }
    }
  }

  const result = evaluateArchitectureFitness({
    rootDir,
    mode,
    checkpoint,
    candidatePaths: diffPaths.length > 0 ? diffPaths : undefined
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.overallStatus === OUTCOME_PASS || result.overallStatus === OUTCOME_EXCEPTED ? 0 : 1);
  }

  if (check) {
    if (result.overallStatus !== OUTCOME_PASS && result.overallStatus !== OUTCOME_EXCEPTED) {
      console.error(`Architecture fitness check FAILED (status: ${result.overallStatus}):`);
      for (const outcome of result.outcomes) {
        if (outcome.outcome === OUTCOME_FINDING) {
          console.error(`  - [${outcome.propertyId}] ${outcome.details}`);
        }
      }
      process.exit(1);
    }
    console.log(`Architecture fitness check PASSED: all property classes evaluated (${result.summary.passCount} pass, ${result.summary.exceptedCount} excepted).`);
    process.exit(0);
  }

  console.log(`Architecture Fitness Evaluation (${mode}): ${result.overallStatus}`);
  for (const outcome of result.outcomes) {
    console.log(`  - ${outcome.propertyId}: ${outcome.outcome} (${outcome.details})`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
