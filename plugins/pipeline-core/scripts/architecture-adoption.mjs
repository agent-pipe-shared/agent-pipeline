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
import { loadBaseline } from "./architecture-fitness.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
const stateSchema = JSON.parse(fs.readFileSync(new URL("../schemas/pipeline.adoption-state.v1.json", import.meta.url), "utf8"));
import { inspectArchitectureDesign } from "../lib/architecture-design.mjs";
const proposalSchema = JSON.parse(fs.readFileSync(new URL("../schemas/pipeline.adoption-proposal.v1.json", import.meta.url), "utf8"));
import {
  buildAdoptionSubject,
  prepareAdoptionAuthority,
  verifyAdoptionAuthority,
  atomicWriteAdoptionState,
  scopeValue,
  loadAdoptionMap,
} from "../lib/architecture-adoption-authority.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(__dirname, "../../..");

export const SCHEMA_ADOPTION_STATE = "pipeline.adoption-state.v1";
export const SCHEMA_ADOPTION_PROPOSAL = "pipeline.adoption-proposal.v1";

export const STATE_ADOPTION_REQUIRED = "adoption-required";
export const STATE_APPROVED_SCOPED = "approved-scoped";
export const STATE_DEFERRED = "deferred";
export const STATE_PARTIAL = "partial";

function contractExists(rootDir, contractPath) {
  const directoryGlob = typeof contractPath === "string" && contractPath.endsWith("/**");
  const relativePath = directoryGlob ? contractPath.slice(0, -3) : contractPath;
  return fs.existsSync(path.join(rootDir, relativePath));
}

// Shipped validation: never depend on a source checkout's root schemas.
function validateState(state) {
  const validation = validateAgainstSchema(state, stateSchema);
  if (!validation.valid) throw new Error(`ADOPTION-STATE-INVALID: ${validation.errors.join("; ")}`);
  const keys = ["schema", "state", "scope", "decidedAt", "expiresAt", "reviewDate", "decisionRef", "rationale", "coverageClass", "confidence", "by", "authority"];
  if (!state || state.schema !== SCHEMA_ADOPTION_STATE || Object.keys(state).some(key => !keys.includes(key)) || ![STATE_APPROVED_SCOPED, STATE_DEFERRED, STATE_PARTIAL].includes(state.state) || typeof state.by !== "string" || !state.by.trim() || state.coverageClass !== "evaluated" || state.confidence !== "measured") throw new Error("ADOPTION-STATE-INVALID");
  scopeValue(state.scope);
}

/**
 * Resolves the current repository adoption state from architecture/adoption-state.json
 * or evaluates baseline presence. Returns 'adoption-required' if no baseline/decision exists.
 * Re-raises adoption-required if a deferred state has expired.
 */
export function resolveAdoptionState(rootDir = DEFAULT_ROOT, now = new Date()) {
  const design = inspectArchitectureDesign(rootDir);
  if (design.ok && design.status === "materialized") return {
    schema: SCHEMA_ADOPTION_STATE, state: STATE_APPROVED_SCOPED, scope: design.scope,
    decidedAt: null, expiresAt: null, reviewDate: null,
    decisionRef: "approved-design-package:" + design.receipt.designSha256,
    rationale: design.input.disposition.rationale, coverageClass: "evaluated", confidence: "measured",
  };
  const statePath = path.join(rootDir, "architecture/adoption-state.json");
  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
      if (parsed.state !== STATE_ADOPTION_REQUIRED) {
        validateState(parsed);
        const authority = parsed.authority;
        if (!authority || !authority.request || !authority.request.subject) {
          return { schema: SCHEMA_ADOPTION_STATE, state: STATE_ADOPTION_REQUIRED, scope: null, rationale: "Adoption authority proof is missing", coverageClass: "unavailable", confidence: "estimated", authorityError: "ADOPTION-AUTHORITY-MISSING" };
        }
        const subject = authority.request.subject;
        const expected = { decision: parsed.state, scope: parsed.scope, rationale: parsed.rationale, decidedAt: parsed.decidedAt, expiresAt: parsed.expiresAt, reviewDate: parsed.reviewDate, decisionRef: parsed.decisionRef };
        if (subject.decision !== expected.decision || JSON.stringify(subject.scope) !== JSON.stringify(Array.isArray(expected.scope) ? expected.scope : [expected.scope]) || subject.rationale !== expected.rationale || subject.decidedAt !== expected.decidedAt || subject.expiresAt !== expected.expiresAt || subject.reviewDate !== expected.reviewDate || subject.decisionRef !== expected.decisionRef) {
          return { schema: SCHEMA_ADOPTION_STATE, state: STATE_ADOPTION_REQUIRED, scope: null, rationale: "Adoption authority subject does not match persisted decision", coverageClass: "unavailable", confidence: "estimated", authorityError: "ADOPTION-AUTHORITY-SUBJECT-MISMATCH" };
        }
        const checked = verifyAdoptionAuthority({ rootDir, request: authority.request, proof: authority.proof, chatApproval: authority.humanApproval });
        if (!checked.ok || authority.mode !== checked.mode) return { schema: SCHEMA_ADOPTION_STATE, state: STATE_ADOPTION_REQUIRED, scope: null, rationale: `Adoption authority is not valid: ${checked.code}`, coverageClass: "unavailable", confidence: "estimated", authorityError: checked.code };
      }
      // Check if deferred and expired
      if (parsed.expiresAt || parsed.reviewDate) {
        const nowDate = now instanceof Date ? now : new Date(now);
        const expDate = new Date([parsed.expiresAt, parsed.reviewDate].filter(Boolean).sort()[0]);
        if (!Number.isFinite(nowDate.getTime()) || nowDate.getTime() >= expDate.getTime()) {
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
  const currentDecision = resolveAdoptionState(rootDir);
  const mapBundle = loadAdoptionMap(rootDir);
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
        status: contractExists(rootDir, c) ? "available" : "pending"
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
      primaryDeliverables: allContracts.map((c) => c.path),
      effort: stage2Effort,
      coverageClass: mapExists ? "evaluated" : "unknown",
      confidence: "estimated",
      contracts: allContracts.map((c) => ({ path: c.path, priority: c.priority, status: c.status }))
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
        ".github/workflows/verify.yml",
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
      moduleCount,
      candidateModules,
      uncoveredPaths: [],
      coverageGaps: [],
      unknownCoverageShare: mapExists ? 0.0 : 1.0
    },
    stages,
    whatIsNotProposed: [
      "No architectural restructuring",
      "No all-at-once migration",
      "No retroactive ADR mass backfill",
      "No prompt-based pass claims",
      ...(currentDecision.state === STATE_ADOPTION_REQUIRED ? [] : ["No repeat adoption decision: retain the existing durable disposition"])
    ],
    estimatedTotalEffort: {
      units: 24,
      status: "estimated"
    },
    decisionOptions: currentDecision.state === STATE_ADOPTION_REQUIRED
      ? [STATE_APPROVED_SCOPED, STATE_DEFERRED, STATE_PARTIAL]
      : [],
    deterministicPassSafe: true
  };

  {
    const val = validateAgainstSchema(proposal, proposalSchema);
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
  scope,
  rationale,
  expiresAt = null,
  reviewDate = null,
  decisionRef = null,
  by = "PO",
  approvalRequest = null,
  proof = null,
  chatApproval = null
} = {}) {
  const validDecisions = [STATE_APPROVED_SCOPED, STATE_DEFERRED, STATE_PARTIAL];
  if (!decision || !validDecisions.includes(decision)) {
    throw new Error(`Invalid adoption decision "${decision}". Must be one of: ${validDecisions.join(", ")}`);
  }
  if (!rationale || typeof rationale !== "string" || rationale.trim() === "") {
    throw new Error("Adoption decision requires a non-empty rationale");
  }

  const finalExpiresAt = expiresAt;
  const finalReviewDate = reviewDate;
  const decidedAt = approvalRequest?.subject?.decidedAt;
  const canonicalScope = scopeValueForState(scope);
  const request = approvalRequest;
  const checked = verifyAdoptionAuthority({ rootDir, request, proof, chatApproval, requireCurrent: true });
  if (!checked.ok) throw new Error(`Adoption authority rejected: ${checked.code}`);
  const expected = buildAdoptionSubject({ rootDir, decision, scope: canonicalScope, rationale, decidedAt, expiresAt, reviewDate, decisionRef });
  if (expected.subjectSha256 !== request.subjectSha256) throw new Error("ADOPTION-AUTHORITY-SUBJECT-MISMATCH");
  const adoptionState = {
    schema: SCHEMA_ADOPTION_STATE,
    state: decision,
    scope: canonicalScope,
    decidedAt,
    expiresAt: finalExpiresAt || null,
    reviewDate: finalReviewDate,
    decisionRef,
    rationale: rationale.trim(),
    coverageClass: "evaluated",
    confidence: "measured",
    by: by || "PO",
    authority: {
      mode: checked.mode,
      request,
      ...(checked.proof ? { proof: checked.proof } : {}),
      ...(checked.humanApproval ? { humanApproval: checked.humanApproval } : {}),
      ...(checked.signer ? { signer: checked.signer } : {})
    }
  };

  validateState(adoptionState);

  const stateDir = path.join(rootDir, "architecture");
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  const statePath = path.join(stateDir, "adoption-state.json");
  atomicWriteAdoptionState(statePath, adoptionState);

  return adoptionState;
}

function scopeValueForState(scope) {
  return scopeValue(scope);
}

/**
 * Asserts task scope has a resolved architecture disposition ('approved-scoped' or 'deferred')
 * before implementation authority per AC-17.
 */
export function checkPlanningAdoptionDisposition(rootDir = DEFAULT_ROOT, taskScope = null, now = new Date()) {
  const design = inspectArchitectureDesign(rootDir, taskScope);
  if (design.ok && design.status === "materialized") return {
    ok: true, disposition: design.disposition, scope: design.scope, authority: design.authority,
  };
  if (fs.existsSync(path.join(rootDir, "architecture/design-materialization.json")) && !design.ok) return {
    ok: false, disposition: "design-authority-stale", error: design.code,
  };
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

  if (stateObj.state === STATE_DEFERRED && !taskScope) {
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

  if ([STATE_APPROVED_SCOPED, STATE_PARTIAL, STATE_DEFERRED].includes(stateObj.state)) {
    if (!taskScope) {
      return {
        ok: true,
        disposition: stateObj.state,
        scope: stateObj.scope
      };
    }

    let normTask;
    try { normTask = scopeValue(taskScope)[0]; } catch { return { ok: false, disposition: stateObj.state, error: "Invalid task scope" }; }
    const scopes = Array.isArray(stateObj.scope) ? stateObj.scope : [stateObj.scope];

    const matches = scopes.some((sc) => {
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

const SCRATCH_OUT_REFUSAL = "--out must name a regular file inside this root's own scratch/ directory (never outside scratch/, never through a symlink)";

function outsideScratch(rel) {
  return rel === "" || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || path.isAbsolute(rel);
}

/**
 * ADOPT-SIGN-F: the lexical half of the `prepare --out` boundary. A relative value resolves
 * against --root, so the check does not depend on the working directory. Returns the absolute
 * target, or null when the target is not strictly inside `<root>/scratch/`. Touches nothing.
 */
function scratchOutTarget(rootDir, out) {
  const target = path.resolve(rootDir, out);
  return outsideScratch(path.relative(path.resolve(rootDir, "scratch"), target)) ? null : target;
}

/**
 * ADOPT-SIGN-F: the filesystem half. Writes `bytes` to `target` only after the real parent
 * directory is confirmed inside the real `<root>/scratch/` and the target is absent or an
 * unlinked regular file, mirroring the guard `sign-intent` applies to its own scratch mirror
 * writes. Returns false (having written nothing) when any of that does not hold.
 */
function writeScratchOut(rootDir, target, bytes) {
  const scratchRoot = path.resolve(rootDir, "scratch");
  try {
    if (fs.existsSync(scratchRoot) && fs.lstatSync(scratchRoot).isSymbolicLink()) return false;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (outsideScratch(path.relative(fs.realpathSync(scratchRoot), fs.realpathSync(path.dirname(target)))) && fs.realpathSync(path.dirname(target)) !== fs.realpathSync(scratchRoot)) return false;
    try {
      const existing = fs.lstatSync(target);
      if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink > 1) return false;
    } catch (error) {
      if (error?.code !== "ENOENT") return false;
    }
    fs.writeFileSync(target, bytes);
    return true;
  } catch {
    return false;
  }
}

// CLI handler
function runCli() {
  const args = process.argv.slice(2);
  let rootDir = process.cwd();
  let command = "status";
  let decision = null;
  let scope = null;
  let expires = null;
  let reviewDate = null;
  let decisionRef = null;
  let decidedAt = null;
  let approvalRequest = null;
  let proof = null;
  let chatApproval = null;
  let by = "PO";
  let rationale = "Architecture adoption decision applied via CLI";
  let json = false;
  let taskScope = null;
  let out = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" && args[i + 1]) {
      rootDir = path.resolve(args[++i]);
    } else if (arg === "--decision" && args[i + 1]) {
      decision = args[++i];
    } else if (arg === "--scope" && args[i + 1]) {
      const suppliedScope = args[++i];
      scope = scope === null ? suppliedScope : [...(Array.isArray(scope) ? scope : [scope]), suppliedScope];
      taskScope = suppliedScope;
    } else if (arg === "--expires" && args[i + 1]) {
      expires = args[++i];
    } else if (arg === "--review-date" && args[i + 1]) {
      reviewDate = args[++i];
    } else if (arg === "--decision-ref" && args[i + 1]) {
      decisionRef = args[++i];
    } else if (arg === "--decided-at" && args[i + 1]) {
      decidedAt = args[++i];
    } else if (arg === "--request" && args[i + 1]) {
      approvalRequest = JSON.parse(fs.readFileSync(args[++i], "utf8"));
    } else if (arg === "--proof" && args[i + 1]) {
      proof = JSON.parse(fs.readFileSync(args[++i], "utf8"));
    } else if (arg === "--chat-approval" && args[i + 1]) {
      chatApproval = JSON.parse(fs.readFileSync(args[++i], "utf8"));
    } else if (arg === "--by" && args[i + 1]) {
      by = args[++i];
    } else if (arg === "--rationale" && args[i + 1]) {
      rationale = args[++i];
    } else if (arg === "--out" && args[i + 1]) {
      out = args[++i];
    } else if (arg === "--json") {
      json = true;
    } else if (!arg.startsWith("--")) {
      command = arg;
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}`);
    }
  }

  if (out !== null && command !== "prepare") {
    console.error("Error: --out is only valid with the 'prepare' command");
    process.exit(1);
  }

  switch (command) {
    case "prepare": {
      // ADOPT-SIGN-F: the closed shell grammar admits no redirect, so the request file the PO signs is
      // written by `prepare` itself. The boundary is checked BEFORE the request is built and before
      // anything is written, so a refused --out leaves no file behind.
      let outTarget = null;
      if (out !== null) {
        outTarget = scratchOutTarget(rootDir, out);
        if (outTarget === null) {
          console.error(`Error: ${SCRATCH_OUT_REFUSAL}`);
          process.exit(1);
        }
      }
      const request = prepareAdoptionAuthority({ rootDir, decision, scope, rationale, expiresAt: expires, reviewDate, decidedAt, decisionRef });
      // One byte string feeds both sinks, so the file is byte-identical to the stdout form by construction.
      const bytes = `${JSON.stringify(request, null, 2)}\n`;
      if (outTarget !== null) {
        if (!writeScratchOut(rootDir, outTarget, bytes)) {
          console.error(`Error: ${SCRATCH_OUT_REFUSAL}`);
          process.exit(1);
        }
        console.error(`adoption request written: ${path.relative(rootDir, outTarget).split(path.sep).join("/")}`);
      }
      process.stdout.write(bytes);
      break;
    }
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
        reviewDate,
        decisionRef,
        by,
        approvalRequest,
        proof,
        chatApproval
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
      console.error(`Unknown command "${command}". Valid commands: status | propose | prepare | apply | check`);
      process.exit(1);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
