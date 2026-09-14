#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * architecture-adoption.mjs -- Architecture Adoption Demand, Proposal Generator, and State Management.
 * (WP-D4, Issue #109, AC-9, AC-17, Spec §7.4, Doctrine §5 & §6)
 *
 * Provides:
 *   - resolveAdoptionState(rootDir): Resolves repository adoption state or evaluates baseline presence.
 *   - generateAdoptionProposal(rootDir): Produces staged, priced 4-stage adoption roadmap.
 *   - applyAdoptionDecision(options): Persists durable PO adoption decisions.
 *   - checkPlanningAdoptionDisposition(rootDir, taskScope): Asserts task scope has resolved architecture disposition (AC-17).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMapBundle } from "./module-inventory.mjs";
import { loadBaseline } from "./architecture-fitness.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(__dirname, "../../..");

export const SCHEMA_ADOPTION_STATE = "pipeline.adoption-state.v1";
export const SCHEMA_ADOPTION_PROPOSAL = "pipeline.adoption-proposal.v1";

export const STATE_ADOPTION_REQUIRED = "adoption-required";
export const STATE_APPROVED_SCOPED = "approved-scoped";
export const STATE_DEFERRED = "deferred";
export const STATE_PARTIAL = "partial";

const ADOPTION_STATE_SCHEMA_PATH = path.join(DEFAULT_ROOT, "schemas/pipeline.adoption-state.v1.json");
const ADOPTION_PROPOSAL_SCHEMA_PATH = path.join(DEFAULT_ROOT, "schemas/pipeline.adoption-proposal.v1.json");

function loadSchema(schemaPath) {
  if (fs.existsSync(schemaPath)) {
    try {
      return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Resolves the current repository adoption state from architecture/adoption-state.json
 * or evaluates baseline presence. Returns 'adoption-required' if no baseline/decision exists.
 * Re-raises adoption-required if a deferred state has expired.
 */
export function resolveAdoptionState(rootDir = DEFAULT_ROOT, now = new Date()) {
  const statePath = path.join(rootDir, "architecture/adoption-state.json");
  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
      // Check if deferred and expired
      if (parsed.state === STATE_DEFERRED && parsed.expiresAt) {
        const nowDate = now instanceof Date ? now : new Date(now);
        const expDate = new Date(parsed.expiresAt);
        if (nowDate.getTime() > expDate.getTime()) {
          return {
            schema: SCHEMA_ADOPTION_STATE,
            state: STATE_ADOPTION_REQUIRED,
            scope: parsed.scope ?? null,
            decidedAt: parsed.decidedAt ?? null,
            expiresAt: parsed.expiresAt,
            reviewDate: parsed.reviewDate ?? null,
            decisionRef: parsed.decisionRef ?? null,
            rationale: `Adoption deferral expired on ${parsed.expiresAt}: re-raising adoption demand`,
            coverageClass: parsed.coverageClass ?? "unavailable",
            confidence: parsed.confidence ?? "estimated",
            expired: true
          };
        }
      }
      return parsed;
    } catch (err) {
      return {
        schema: SCHEMA_ADOPTION_STATE,
        state: STATE_ADOPTION_REQUIRED,
        scope: null,
        decidedAt: null,
        expiresAt: null,
        reviewDate: null,
        decisionRef: null,
        rationale: `Failed to parse adoption-state.json: ${err.message}`,
        coverageClass: "unavailable",
        confidence: "estimated",
        error: err.message
      };
    }
  }

  return {
    schema: SCHEMA_ADOPTION_STATE,
    state: STATE_ADOPTION_REQUIRED,
    scope: null,
    decidedAt: null,
    expiresAt: null,
    reviewDate: null,
    decisionRef: null,
    rationale: "No architecture baseline or adoption decision exists for this repository",
    coverageClass: "unavailable",
    confidence: "estimated"
  };
}

/**
 * Produces a staged, priced adoption proposal.
 * Invariant: Generated artifacts carry { coverageClass, confidence } and cannot pass (deterministic-pass rule).
 */
export function generateAdoptionProposal(rootDir = DEFAULT_ROOT) {
  const mapBundle = loadMapBundle(rootDir);
  const baseline = loadBaseline(rootDir);

  const modules = mapBundle.ok ? mapBundle.modules : [];
  const moduleCount = modules.length;
  const candidateModules = modules.map((m) => m.id);

  // Harvest public contracts
  const allContracts = [];
  for (const m of modules) {
    for (const c of m.publicContracts || []) {
      const isHottest = c.includes("preflight") || c.includes("inventory") || c.includes("fitness");
      allContracts.push({
        path: c,
        module: m.id,
        priority: isHottest ? "high" : "normal",
        status: fs.existsSync(path.join(rootDir, c)) ? "available" : "pending"
      });
    }
  }

  const mapIndexFile = path.join(rootDir, "architecture/map/index.md");
  const mapExists = mapBundle.ok && fs.existsSync(mapIndexFile);
  const baselineFile = path.join(rootDir, "architecture/baseline.json");
  const baselineExists = fs.existsSync(baselineFile);
  const fitnessFile = path.join(rootDir, "architecture/fitness-model.json");
  const fitnessExists = fs.existsSync(fitnessFile);

  const stage1Effort = mapExists ? { units: 5, status: "measured" } : { units: 5, status: "estimated" };
  const stage2Effort = { units: 8, status: "estimated" };
  const stage3Effort = (baselineExists && fitnessExists) ? { units: 5, status: "measured" } : { units: 5, status: "estimated" };
  const stage4Effort = { units: 6, status: "estimated" };

  const stages = [
    {
      stage: 1,
      name: "Navigation map bundle (map first, #109 §5)",
      description: "Deploy machine-readable OKF v0.1 navigation map bundle: AGENTS.md entry pointer, architecture/map/index.md root index, and governed module concept files.",
      primaryDeliverables: [
        "AGENTS.md",
        "architecture/map/index.md",
        "architecture/map/<module>.md"
      ],
      effort: stage1Effort,
      coverageClass: mapExists ? "evaluated" : "unknown",
      confidence: mapExists ? "measured" : "estimated"
    },
    {
      stage: 2,
      name: "Core contracts by traversal frequency / priority",
      description: "Formalize public interface contracts for hottest modules by traversal frequency and preflight authority dependency.",
      primaryDeliverables: allContracts.length > 0
        ? allContracts.map((c) => c.path)
        : [
            "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs",
            "plugins/pipeline-core/scripts/module-inventory.mjs",
            "plugins/pipeline-core/scripts/architecture-fitness.mjs"
          ],
      effort: stage2Effort,
      coverageClass: "evaluated",
      confidence: "estimated",
      contracts: allContracts.length > 0
        ? allContracts.map((c) => ({ path: c.path, priority: c.priority, status: c.status }))
        : [
            { path: "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs", priority: "high", status: "available" },
            { path: "plugins/pipeline-core/scripts/module-inventory.mjs", priority: "high", status: "available" },
            { path: "plugins/pipeline-core/scripts/architecture-fitness.mjs", priority: "high", status: "available" }
          ]
    },
    {
      stage: 3,
      name: "Fitness model and baseline ratchet",
      description: "Establish architecture fitness model and baseline ratchet store inventorying accepted debt without retroactive fabrication.",
      primaryDeliverables: [
        "architecture/fitness-model.json",
        "architecture/baseline.json"
      ],
      effort: stage3Effort,
      coverageClass: (baselineExists && fitnessExists) ? "evaluated" : "unknown",
      confidence: (baselineExists && fitnessExists) ? "measured" : "estimated"
    },
    {
      stage: 4,
      name: "Continuous enforcement and receipts",
      description: "Enforce architecture properties at planning, candidate, push, and CI boundaries, recording module interaction receipts.",
      primaryDeliverables: [
        "hooks/guard-push.mjs",
        "harness/scripts/verify.mjs",
        "schemas/pipeline.module-interaction-receipt.v1.json"
      ],
      effort: stage4Effort,
      coverageClass: "evaluated",
      confidence: "estimated"
    }
  ];

  const proposal = {
    schema: SCHEMA_ADOPTION_PROPOSAL,
    generatedAt: new Date().toISOString(),
    coverageClass: mapExists ? "evaluated" : "unknown",
    confidence: "estimated",
    inventorySummary: {
      moduleCount: moduleCount || 4,
      candidateModules: candidateModules.length > 0 ? candidateModules : ["pipeline-core", "harness", "schemas", "backlog"],
      uncoveredPaths: [],
      coverageGaps: [],
      unknownCoverageShare: mapExists ? 0.0 : 1.0
    },
    stages,
    whatIsNotProposed: [
      "No architectural restructuring",
      "No all-at-once migration",
      "No retroactive ADR mass backfill",
      "No prompt-based pass claims"
    ],
    estimatedTotalEffort: {
      units: 24,
      status: "estimated"
    },
    decisionOptions: [
      STATE_APPROVED_SCOPED,
      STATE_DEFERRED,
      STATE_PARTIAL
    ],
    deterministicPassSafe: true
  };

  const schema = loadSchema(ADOPTION_PROPOSAL_SCHEMA_PATH);
  if (schema) {
    const val = validateAgainstSchema(proposal, schema);
    if (!val.valid) {
      throw new Error(`Adoption proposal violates schema: ${val.errors.join("; ")}`);
    }
  }

  return proposal;
}

/**
 * Persists a durable PO architecture adoption decision to architecture/adoption-state.json.
 */
export function applyAdoptionDecision({
  rootDir = DEFAULT_ROOT,
  decision,
  scope = "architecture/map/",
  rationale,
  expiresAt = null,
  reviewDate = null,
  decisionRef = null,
  by = "PO"
} = {}) {
  const validDecisions = [STATE_APPROVED_SCOPED, STATE_DEFERRED, STATE_PARTIAL];
  if (!decision || !validDecisions.includes(decision)) {
    throw new Error(`Invalid adoption decision "${decision}". Must be one of: ${validDecisions.join(", ")}`);
  }
  if (!rationale || typeof rationale !== "string" || rationale.trim() === "") {
    throw new Error("Adoption decision requires a non-empty rationale");
  }

  let finalExpiresAt = expiresAt;
  let finalReviewDate = reviewDate;
  if (decision === STATE_DEFERRED && !finalExpiresAt && !finalReviewDate) {
    const defaultExp = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    finalExpiresAt = defaultExp;
    finalReviewDate = defaultExp;
  }

  const adoptionState = {
    schema: SCHEMA_ADOPTION_STATE,
    state: decision,
    scope: scope || "architecture/map/",
    decidedAt: new Date().toISOString(),
    expiresAt: finalExpiresAt || null,
    reviewDate: finalReviewDate || finalExpiresAt || null,
    decisionRef: decisionRef || `PO-DECISION-${decision.toUpperCase().replace(/-/g, "_")}`,
    rationale: rationale.trim(),
    coverageClass: "evaluated",
    confidence: "measured",
    by: by || "PO"
  };

  const schema = loadSchema(ADOPTION_STATE_SCHEMA_PATH);
  if (schema) {
    const val = validateAgainstSchema(adoptionState, schema);
    if (!val.valid) {
      throw new Error(`Adoption state violates schema: ${val.errors.join("; ")}`);
    }
  }

  const stateDir = path.join(rootDir, "architecture");
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  const statePath = path.join(stateDir, "adoption-state.json");
  fs.writeFileSync(statePath, JSON.stringify(adoptionState, null, 2) + "\n", "utf8");

  return adoptionState;
}

/**
 * Asserts task scope has a resolved architecture disposition ('approved-scoped' or 'deferred')
 * before implementation authority per AC-17.
 */
export function checkPlanningAdoptionDisposition(rootDir = DEFAULT_ROOT, taskScope = null, now = new Date()) {
  const stateObj = resolveAdoptionState(rootDir, now);

  if (stateObj.expired) {
    return {
      ok: false,
      disposition: "expired-deferral",
      error: `Architecture adoption deferral expired on ${stateObj.expiresAt}: adoption decision required before implementation authority per AC-17.`
    };
  }

  if (stateObj.state === STATE_ADOPTION_REQUIRED) {
    return {
      ok: false,
      disposition: STATE_ADOPTION_REQUIRED,
      error: `Architecture adoption disposition is unresolved (${STATE_ADOPTION_REQUIRED}). PO decision (${STATE_APPROVED_SCOPED} or ${STATE_DEFERRED}) required before implementation authority per AC-17.`
    };
  }

  if (stateObj.state === STATE_DEFERRED) {
    if (stateObj.expired) {
      return {
        ok: false,
        disposition: "expired-deferral",
        error: `Architecture adoption deferral expired on ${stateObj.expiresAt}: adoption decision required before implementation authority per AC-17.`
      };
    }
    return {
      ok: true,
      disposition: STATE_DEFERRED,
      expiresAt: stateObj.expiresAt,
      reviewDate: stateObj.reviewDate
    };
  }

  if (stateObj.state === STATE_APPROVED_SCOPED || stateObj.state === STATE_PARTIAL) {
    if (!taskScope) {
      return {
        ok: true,
        disposition: stateObj.state,
        scope: stateObj.scope
      };
    }

    const normTask = taskScope.replace(/\\/g, "/");
    const scopes = Array.isArray(stateObj.scope) ? stateObj.scope : [stateObj.scope];

    const matches = scopes.some((sc) => {
      if (!sc || sc === "*") return true;
      const normSc = sc.replace(/\\/g, "/");
      if (normSc.endsWith("/")) {
        return normTask === normSc.slice(0, -1) || normTask.startsWith(normSc);
      }
      return normTask === normSc || normTask.startsWith(normSc + "/");
    });

    if (matches) {
      return {
        ok: true,
        disposition: stateObj.state,
        scope: stateObj.scope
      };
    }

    return {
      ok: false,
      disposition: stateObj.state,
      error: `Task scope "${taskScope}" is outside approved architecture adoption scope "${Array.isArray(stateObj.scope) ? stateObj.scope.join(", ") : stateObj.scope}".`
    };
  }

  return {
    ok: false,
    disposition: stateObj.state,
    error: `Unknown architecture adoption state "${stateObj.state}".`
  };
}

// CLI handler
function runCli() {
  const args = process.argv.slice(2);
  let rootDir = process.cwd();
  let command = "status";
  let decision = null;
  let scope = "architecture/map/";
  let expires = null;
  let by = "PO";
  let rationale = "Architecture adoption decision applied via CLI";
  let json = false;
  let taskScope = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" && args[i + 1]) {
      rootDir = path.resolve(args[++i]);
    } else if (arg === "--decision" && args[i + 1]) {
      decision = args[++i];
    } else if (arg === "--scope" && args[i + 1]) {
      scope = args[++i];
      taskScope = scope;
    } else if (arg === "--expires" && args[i + 1]) {
      expires = args[++i];
    } else if (arg === "--by" && args[i + 1]) {
      by = args[++i];
    } else if (arg === "--rationale" && args[i + 1]) {
      rationale = args[++i];
    } else if (arg === "--json") {
      json = true;
    } else if (!arg.startsWith("--")) {
      command = arg;
    }
  }

  switch (command) {
    case "status": {
      const state = resolveAdoptionState(rootDir);
      if (json) {
        console.log(JSON.stringify(state, null, 2));
      } else {
        console.log(`Adoption State: ${state.state}`);
        console.log(`Scope: ${state.scope || "(unconfigured)"}`);
        console.log(`CoverageClass: ${state.coverageClass} (confidence: ${state.confidence})`);
        if (state.rationale) console.log(`Rationale: ${state.rationale}`);
        if (state.expiresAt) console.log(`ExpiresAt: ${state.expiresAt}`);
      }
      process.exit(state.state === STATE_ADOPTION_REQUIRED ? 1 : 0);
      break;
    }
    case "propose": {
      const proposal = generateAdoptionProposal(rootDir);
      if (json) {
        console.log(JSON.stringify(proposal, null, 2));
      } else {
        console.log("=== Architecture Adoption Staged Proposal ===");
        console.log(`GeneratedAt: ${proposal.generatedAt}`);
        console.log(`CoverageClass: ${proposal.coverageClass} (confidence: ${proposal.confidence})`);
        console.log(`Total Estimated Units: ${proposal.estimatedTotalEffort.units} (${proposal.estimatedTotalEffort.status})`);
        console.log("\nStages:");
        for (const st of proposal.stages) {
          console.log(`  Stage ${st.stage}: ${st.name} [${st.effort.units} units, ${st.effort.status}]`);
          console.log(`    ${st.description}`);
        }
        console.log("\nWhat is NOT proposed:");
        for (const item of proposal.whatIsNotProposed) {
          console.log(`  - ${item}`);
        }
      }
      process.exit(0);
      break;
    }
    case "apply": {
      if (!decision) {
        console.error("Error: --decision is required for 'apply' (approved-scoped | deferred | partial)");
        process.exit(1);
      }
      const applied = applyAdoptionDecision({
        rootDir,
        decision,
        scope,
        rationale,
        expiresAt: expires,
        by
      });
      if (json) {
        console.log(JSON.stringify(applied, null, 2));
      } else {
        console.log(`Applied adoption decision: ${applied.state}`);
        console.log(`Scope: ${applied.scope}`);
        console.log(`DecisionRef: ${applied.decisionRef}`);
        console.log(`Rationale: ${applied.rationale}`);
      }
      process.exit(0);
      break;
    }
    case "check": {
      const check = checkPlanningAdoptionDisposition(rootDir, taskScope);
      if (json) {
        console.log(JSON.stringify(check, null, 2));
      } else {
        if (check.ok) {
          console.log(`Planning disposition check PASSED: ${check.disposition}`);
          if (check.scope) console.log(`Scope: ${check.scope}`);
          if (check.expiresAt) console.log(`ExpiresAt: ${check.expiresAt}`);
        } else {
          console.error(`Planning disposition check FAILED: ${check.error}`);
        }
      }
      process.exit(check.ok ? 0 : 1);
      break;
    }
    default: {
      console.error(`Unknown command "${command}". Valid commands: status | propose | apply | check`);
      process.exit(1);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
