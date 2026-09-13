// SPDX-License-Identifier: SUL-1.0
/**
 * architecture-baseline.mjs -- Architecture Baseline Assessment & Evaluator.
 *
 * Implements the 5 deterministic significance axes from Issue #99 / WP-D1
 * and evaluates whether changes trigger an initial ADR requirement, are
 * covered by existing baseline ADRs, or represent routine implementation details.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

export const SCHEMA_BASELINE_RESULT = "pipeline.architecture-baseline-result.v1";
export const SCHEMA_DECISION = "pipeline.architecture-decision.v1";
export const SCHEMA_DECISION_SUMMARY = "pipeline.architecture-decisions-summary.v1";

export const STATUS_INITIAL_ADR_REQUIRED = "initial-adr-required";
export const STATUS_BASELINE_SUFFICIENT = "architecture-baseline-sufficient";
export const STATUS_NO_MATERIAL_DECISION = "no-material-architecture-decision";

/**
 * 5 Deterministic Significance Axes from Issue #99 & Spec §7.1.
 */
export const SIGNIFICANCE_AXES = Object.freeze([
  {
    id: "system-structure-or-boundaries",
    name: "System structure or component boundaries",
    description: "Changes to component layout, exported module boundaries, inter-module dependency graph, public APIs, or architecture profiles."
  },
  {
    id: "runtime-framework-dependency-storage-integration",
    name: "Runtime, framework, dependency, storage, or integration strategy",
    description: "Changes to language runtimes, package dependencies, storage persistence, database schemas/migrations, or integration adapters."
  },
  {
    id: "deployment-and-execution-environment",
    name: "Deployment and execution environment",
    description: "Changes to execution runners, host requirements, external adapters, container specifications, or CI/CD pipelines."
  },
  {
    id: "quality-attributes",
    name: "Quality attributes",
    description: "Changes impacting security, privacy, reliability, portability, or performance policies and infrastructure."
  },
  {
    id: "costly-risky-or-hard-to-reverse",
    name: "Choices that are costly, risky, or hard to reverse",
    description: "Changes involving public contract freezes, wire protocols, breaking schema migrations, licenses, or irreversible architectural commitments."
  }
]);

export function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isNonMaterialPath(filePath) {
  const normalized = normalizePath(filePath);
  // Tests, scratch, evidence, markdown docs outside ADRs/architecture
  if (
    normalized.startsWith("scratch/") ||
    normalized.startsWith("evidence/") ||
    normalized.startsWith("backlog/evidence/") ||
    /^(?:specs\/[^/]+\/evidence\/)/.test(normalized) ||
    normalized.endsWith(".test.mjs") ||
    normalized.endsWith(".test.js") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".spec.mjs") ||
    normalized.endsWith(".spec.js") ||
    normalized.endsWith(".spec.ts") ||
    normalized.includes("/fixtures/") ||
    normalized.startsWith("fixtures/")
  ) {
    return true;
  }
  // Markdown docs outside adr/architecture
  if (
    normalized.endsWith(".md") &&
    !normalized.startsWith("docs/adr/") &&
    !normalized.includes("architecture") &&
    !normalized.includes("contract") &&
    !normalized.includes("guardrail") &&
    !normalized.includes("policy")
  ) {
    return true;
  }
  return false;
}

/**
 * Evaluates which of the 5 significance axes match a given set of file paths.
 * @param {string[]} files
 * @param {object} [options]
 * @returns {{ axesEvaluated: Array, matches: Array }}
 */
export function evaluateSignificanceAxes(files, options = {}) {
  const matches = [];
  const triggeredAxisIds = new Set();

  for (const rawPath of files) {
    const p = normalizePath(rawPath);

    // Skip non-material paths
    if (isNonMaterialPath(p)) {
      continue;
    }

    // Axis 1: System structure or component boundaries
    if (
      p.startsWith("contracts/") ||
      p.startsWith("api/") ||
      p.startsWith("interfaces/") ||
      p.startsWith("schemas/") ||
      p.startsWith("project/architecture-") ||
      p.includes("architecture-profile") ||
      p.includes("module-inventory") ||
      p === "docs/adr/0063-repository-directory-contract.md" ||
      /(?:^|\/)index\.(?:mjs|js|ts|jsx|tsx)$/.test(p) ||
      (p === "package.json" && options.packageJsonBoundaryChange)
    ) {
      triggeredAxisIds.add("system-structure-or-boundaries");
      matches.push({
        axis: "system-structure-or-boundaries",
        path: p,
        reason: "Component boundary, public interface, module export, or architecture layout changed"
      });
    }

    // Axis 2: Runtime, framework, dependency, storage, or integration strategy
    if (
      p === "package.json" ||
      p === "package-lock.json" ||
      p === "pnpm-lock.yaml" ||
      p === "yarn.lock" ||
      p === "bun.lockb" ||
      p === "Cargo.toml" ||
      p === "Cargo.lock" ||
      p === "go.mod" ||
      p === "go.sum" ||
      p === "requirements.txt" ||
      p === "pyproject.toml" ||
      p === "Gemfile" ||
      p === "pom.xml" ||
      p === "build.gradle" ||
      p === ".nvmrc" ||
      p === ".node-version" ||
      p.startsWith("prisma/") ||
      p.startsWith("migrations/") ||
      p.startsWith("sql/") ||
      p.startsWith("db/") ||
      p.startsWith("orm/") ||
      p.endsWith(".sql") ||
      p.includes("/adapters/") ||
      p.startsWith("adapters/") ||
      p.startsWith("integrations/")
    ) {
      triggeredAxisIds.add("runtime-framework-dependency-storage-integration");
      matches.push({
        axis: "runtime-framework-dependency-storage-integration",
        path: p,
        reason: "Dependency manifest, storage persistence, runtime version, or integration adapter changed"
      });
    }

    // Axis 3: Deployment and execution environment
    if (
      p.startsWith(".github/") ||
      p === ".gitlab-ci.yml" ||
      p.startsWith(".circleci/") ||
      p === "Jenkinsfile" ||
      p.startsWith("Dockerfile") ||
      p.startsWith("Containerfile") ||
      p.startsWith("docker-compose") ||
      p.startsWith("k8s/") ||
      p.startsWith("helm/") ||
      p.startsWith("terraform/") ||
      p === "guard-config.json" ||
      p.startsWith("project/guard-config") ||
      p.startsWith(".agents/") ||
      p.startsWith(".claude/") ||
      p.startsWith("runners/") ||
      p === "hooks.json" ||
      p.endsWith("hooks.json")
    ) {
      triggeredAxisIds.add("deployment-and-execution-environment");
      matches.push({
        axis: "deployment-and-execution-environment",
        path: p,
        reason: "Deployment pipeline, container definition, runner configuration, or execution boundary changed"
      });
    }

    // Axis 4: Quality attributes
    if (
      p.startsWith("guardrails/") ||
      p.startsWith("policies/") ||
      p.startsWith("security/") ||
      p.startsWith("auth/") ||
      p.startsWith("crypto/") ||
      p.startsWith("telemetry/") ||
      p.startsWith("metrics/") ||
      p.startsWith("monitoring/")
    ) {
      triggeredAxisIds.add("quality-attributes");
      matches.push({
        axis: "quality-attributes",
        path: p,
        reason: "Security policy, guardrail, privacy control, crypto configuration, or telemetry metric changed"
      });
    }

    // Axis 5: Choices that are costly, risky, or hard to reverse
    if (
      p.startsWith("LICENSE") ||
      p.startsWith("COPYING") ||
      p.includes("contract-freeze") ||
      p.startsWith("freeze/") ||
      p.endsWith(".proto") ||
      p.endsWith(".thrift") ||
      p.endsWith(".avro") ||
      p.startsWith("idl/") ||
      p.includes("deprecation")
    ) {
      triggeredAxisIds.add("costly-risky-or-hard-to-reverse");
      matches.push({
        axis: "costly-risky-or-hard-to-reverse",
        path: p,
        reason: "License, public contract freeze, wire protocol IDL, or irreversible commitment changed"
      });
    }
  }

  const axesEvaluated = SIGNIFICANCE_AXES.map((axis) => ({
    id: axis.id,
    name: axis.name,
    triggered: triggeredAxisIds.has(axis.id)
  }));

  return { axesEvaluated, matches };
}

/**
 * Checks whether baseline ADRs exist in the repository covering architectural decisions.
 * @param {string} root
 * @returns {{ hasBaseline: boolean, count: number, acceptedCount: number, adrs: Array }}
 */
export function checkBaselineAdrs(root) {
  const adrDir = path.join(root, "docs", "adr");
  if (!fs.existsSync(adrDir)) {
    return { hasBaseline: false, count: 0, acceptedCount: 0, adrs: [] };
  }

  let entries = [];
  try {
    entries = fs.readdirSync(adrDir);
  } catch {
    return { hasBaseline: false, count: 0, acceptedCount: 0, adrs: [] };
  }

  const adrs = [];
  for (const entry of entries) {
    if (entry.endsWith(".md") || entry.endsWith(".json")) {
      const fullPath = path.join(adrDir, entry);
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        let status = "unknown";
        let id = entry.replace(/\.(?:md|json)$/, "");

        if (entry.endsWith(".json")) {
          try {
            const parsed = JSON.parse(content);
            if (parsed.status) status = parsed.status;
            if (parsed.id) id = parsed.id;
          } catch {
            // ignore malformed json
          }
        } else {
          const statusMatch = /\b(?:status|Status)\b[\s:*]+["']?([a-z]+)["']?/i.exec(content);
          if (statusMatch) {
            status = statusMatch[1].toLowerCase();
          }
        }

        adrs.push({ id, file: entry, status });
      } catch {
        // ignore unreadable file
      }
    }
  }

  const acceptedCount = adrs.filter((a) => a.status === "accepted").length;
  const hasBaseline = acceptedCount > 0;

  return {
    hasBaseline,
    count: adrs.length,
    acceptedCount,
    adrs
  };
}

/**
 * Retrieves changed files using git diff inside root.
 */
export function getChangedFilesFromGit(root, options = {}) {
  const { diff, from, through } = options;
  const execOptions = { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };

  try {
    if (from && through) {
      const out = execFileSync("git", ["diff", "--name-only", from + ".." + through], execOptions);
      return out.split("\n").map((s) => s.trim()).filter(Boolean);
    }
    if (diff) {
      const out = execFileSync("git", ["diff", "--name-only", diff], execOptions);
      return out.split("\n").map((s) => s.trim()).filter(Boolean);
    }

    const diffHead = execFileSync("git", ["diff", "--name-only", "HEAD"], execOptions);
    const untracked = execFileSync("git", ["status", "--porcelain"], execOptions);
    const files = new Set(diffHead.split("\n").map((s) => s.trim()).filter(Boolean));

    for (const line of untracked.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        const p = trimmed.slice(3).trim();
        if (p) files.add(p);
      }
    }

    return Array.from(files);
  } catch {
    return [];
  }
}

/**
 * Evaluates architecture baseline assessment against a repo root and changed files.
 * @param {object} options
 * @param {string} [options.root]
 * @param {string} [options.diff]
 * @param {string} [options.from]
 * @param {string} [options.through]
 * @param {string[]} [options.files]
 * @returns {object} pipeline.architecture-baseline-result.v1
 */
export function evaluateArchitectureBaseline(options = {}) {
  const root = options.root ? path.resolve(options.root) : process.cwd();
  const files = options.files ?? getChangedFilesFromGit(root, options);

  const { axesEvaluated, matches } = evaluateSignificanceAxes(files, options);

  let status = STATUS_NO_MATERIAL_DECISION;
  let recommendation = STATUS_NO_MATERIAL_DECISION;

  if (matches.length > 0) {
    const baselineInfo = checkBaselineAdrs(root);
    if (baselineInfo.hasBaseline) {
      status = STATUS_BASELINE_SUFFICIENT;
      recommendation = STATUS_BASELINE_SUFFICIENT;
    } else {
      status = STATUS_INITIAL_ADR_REQUIRED;
      recommendation = STATUS_INITIAL_ADR_REQUIRED;
    }
  }

  return {
    schema: SCHEMA_BASELINE_RESULT,
    status,
    axesEvaluated,
    matches,
    recommendation
  };
}

/**
 * Compiles a living decision summary from docs/adr/ into project/architecture-decisions.compiled.json.
 * @param {string} root
 * @param {object} [options]
 * @returns {object} compiled summary payload
 */
export function compileDecisionSummary(root, options = {}) {
  const adrDir = path.join(root, "docs", "adr");
  const summaryFile = options.outputPath || path.join(root, "project", "architecture-decisions.compiled.json");

  const decisions = [];
  const activeExceptions = [];

  if (fs.existsSync(adrDir)) {
    const entries = fs.readdirSync(adrDir).sort();
    for (const entry of entries) {
      if (entry.endsWith(".json")) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(adrDir, entry), "utf8"));
          if (raw.schema === SCHEMA_DECISION || raw.id) {
            decisions.push({
              id: raw.id,
              title: raw.title || entry,
              status: raw.status || "accepted",
              scope: raw.scope || "project",
              digest: raw.digest || null,
              supersedes: raw.supersedes || null,
              exception: raw.exception || null
            });
            if (raw.status === "waived" && raw.exception) {
              activeExceptions.push({
                decisionId: raw.id,
                ...raw.exception
              });
            }
          }
        } catch {
          // ignore malformed
        }
      } else if (entry.endsWith(".md")) {
        const id = entry.replace(/\.md$/, "");
        const content = fs.readFileSync(path.join(adrDir, entry), "utf8");
        const statusMatch = /\b(?:status|Status)\b[\s:*]+["']?([a-z]+)["']?/i.exec(content);
        const status = statusMatch ? statusMatch[1].toLowerCase() : "accepted";
        const titleMatch = /^#\s+(.+)$/m.exec(content);
        const title = titleMatch ? titleMatch[1].trim() : id;

        const sidecarPath = path.join(adrDir, entry.replace(/\.md$/, ".json"));
        if (!fs.existsSync(sidecarPath)) {
          decisions.push({
            id,
            title,
            status,
            scope: "project",
            digest: createHash("sha256").update(content, "utf8").digest("hex"),
            supersedes: null,
            exception: null
          });
        }
      }
    }
  }

  const payload = {
    schema: SCHEMA_DECISION_SUMMARY,
    compiledAt: new Date().toISOString(),
    count: decisions.length,
    decisions,
    activeExceptions
  };

  if (options.write !== false) {
    const dir = path.dirname(summaryFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(summaryFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }

  return payload;
}

/**
 * Validates a decision record object against schema pipeline.architecture-decision.v1.
 * @param {object} record
 * @param {object} [schema]
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateArchitectureDecision(record, schema) {
  let activeSchema = schema;
  if (!activeSchema) {
    const defaultSchemaPath = path.join(
      path.dirname(import.meta.url.replace(/^file:\/\//, "")),
      "../../..",
      "schemas",
      "pipeline.architecture-decision.v1.json"
    );
    if (fs.existsSync(defaultSchemaPath)) {
      try {
        activeSchema = JSON.parse(fs.readFileSync(defaultSchemaPath, "utf8"));
      } catch {
        // fallback
      }
    }
  }

  const baseResult = activeSchema
    ? validateAgainstSchema(record, activeSchema)
    : { valid: true, errors: [] };
  const errors = [...baseResult.errors];

  if (!record || typeof record !== "object") {
    if (errors.length === 0) errors.push("Decision record must be an object");
    return { valid: false, errors };
  }

  if (record.schema && record.schema !== SCHEMA_DECISION) {
    errors.push("schema must be " + SCHEMA_DECISION);
  }
  if (record.digest !== undefined && (typeof record.digest !== "string" || !/^[a-f0-9]{64}$/u.test(record.digest))) {
    errors.push("$.digest: digest must be a 64-character lowercase SHA-256 hex string");
  }
  if (record.id !== undefined && (typeof record.id !== "string" || !/^[A-Za-z0-9._-]+$/u.test(record.id))) {
    errors.push("$.id: id must match pattern ^[A-Za-z0-9._-]+$");
  }

  return { valid: errors.length === 0, errors };
}

function parseArgs(args) {
  const options = {
    format: "text",
    root: process.cwd()
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" && i + 1 < args.length) {
      options.root = args[++i];
    } else if (arg === "--diff" && i + 1 < args.length) {
      options.diff = args[++i];
    } else if (arg === "--from" && i + 1 < args.length) {
      options.from = args[++i];
    } else if (arg === "--through" && i + 1 < args.length) {
      options.through = args[++i];
    } else if (arg === "--format" && i + 1 < args.length) {
      options.format = args[++i];
    } else if (arg === "--compile-summary") {
      options.compileSummary = true;
    } else if (arg === "--validate" && i + 1 < args.length) {
      options.validatePath = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log([
    "architecture-baseline.mjs -- Architecture Baseline Assessment",
    "",
    "Usage:",
    "  architecture-baseline.mjs --root <path> [--diff <ref> | --from <sha> --through <sha>] [--format json|text]",
    "  architecture-baseline.mjs --root <path> --compile-summary",
    "  architecture-baseline.mjs --validate <adr-path>",
    "",
    "Options:",
    "  --root <path>              Repository root path (default: current directory)",
    "  --diff <ref>               Git ref or commit to diff against",
    "  --from <sha> --through <sha> Diff range between two commit SHAs",
    "  --format <json|text>       Output format (default: text)",
    "  --compile-summary          Compile ADR estate into project/architecture-decisions.compiled.json",
    "  --validate <file>          Validate an architecture decision record against schema",
    "  --help                     Show this help text"
  ].join("\n"));
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.compileSummary) {
    const summary = compileDecisionSummary(options.root);
    if (options.format === "json") {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log("Compiled " + summary.count + " decisions into project/architecture-decisions.compiled.json");
    }
    process.exit(0);
  }

  if (options.validatePath) {
    try {
      const record = JSON.parse(fs.readFileSync(options.validatePath, "utf8"));
      const result = validateArchitectureDecision(record);
      if (result.valid) {
        console.log("Validation PASSED: " + options.validatePath);
        process.exit(0);
      } else {
        console.error("Validation FAILED: " + options.validatePath);
        result.errors.forEach((err) => console.error("  - " + err));
        process.exit(1);
      }
    } catch (err) {
      console.error("Error reading file for validation: " + err.message);
      process.exit(1);
    }
  }

  const result = evaluateArchitectureBaseline(options);

  if (options.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("Architecture Baseline Assessment");
    console.log("================================");
    console.log("Status:         " + result.status);
    console.log("Recommendation: " + result.recommendation);
    console.log("");
    console.log("Significance Axes Evaluated:");
    for (const axis of result.axesEvaluated) {
      const mark = axis.triggered ? "[TRIGGERED]" : "[CLEAR]";
      console.log("  " + mark.padEnd(12) + " " + axis.name);
    }
    if (result.matches.length > 0) {
      console.log("");
      console.log("Matches (" + result.matches.length + " triggers):");
      for (const m of result.matches) {
        console.log("  - [" + m.axis + "] " + m.path + ": " + m.reason);
      }
    } else {
      console.log("");
      console.log("No material architectural axes were triggered by the evaluated changes.");
    }
  }

  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace(/^file:\/\//, ""));
if (isMain) {
  main();
}
