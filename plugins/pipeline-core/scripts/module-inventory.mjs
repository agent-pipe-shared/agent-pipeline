#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * module-inventory.mjs -- Governed module inventory loader, validator, and path resolver.
 * (WP-D2, Issue #104, AC-8, AC-22, AC-23, Spec §7.2, Doctrine §3)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml, YamlLiteError } from "../lib/yaml-lite.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas/pipeline.module-inventory.v1.json");

let cachedSchema = null;
export function getModuleInventorySchema() {
  if (!cachedSchema) {
    if (fs.existsSync(SCHEMA_PATH)) {
      cachedSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
    } else {
      throw new Error(`Module inventory schema not found at ${SCHEMA_PATH}`);
    }
  }
  return cachedSchema;
}

/**
 * Extracts YAML frontmatter and body from markdown content.
 */
export function extractFrontmatter(content) {
  if (!content.startsWith("---")) {
    return { frontmatterText: null, bodyText: content, hasFrontmatter: false };
  }
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatterText: null, bodyText: content, hasFrontmatter: false };
  }
  return { frontmatterText: match[1], bodyText: match[2], hasFrontmatter: true };
}

/**
 * Loads and parses a single concept file, validating its frontmatter.
 */
export function loadConceptFile(filePath, schema = getModuleInventorySchema()) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, module: null, errors: [`File not found: ${filePath}`] };
  }
  const content = fs.readFileSync(filePath, "utf8");
  const { frontmatterText, hasFrontmatter } = extractFrontmatter(content);
  if (!hasFrontmatter || !frontmatterText) {
    return {
      ok: false,
      module: null,
      errors: [`${filePath}: missing YAML frontmatter (must start and end with '---')`]
    };
  }

  let parsedFrontmatter;
  try {
    parsedFrontmatter = parseYaml(frontmatterText);
  } catch (err) {
    const message = err instanceof YamlLiteError ? err.message : String(err);
    return {
      ok: false,
      module: null,
      errors: [`${filePath}: YAML frontmatter parse error: ${message}`]
    };
  }

  if (!parsedFrontmatter || typeof parsedFrontmatter !== "object" || Array.isArray(parsedFrontmatter)) {
    return {
      ok: false,
      module: null,
      errors: [`${filePath}: YAML frontmatter must be a key-value mapping`]
    };
  }

  // Validate frontmatter against schema
  const validation = validateAgainstSchema(parsedFrontmatter, schema);
  if (!validation.valid) {
    return {
      ok: false,
      module: parsedFrontmatter,
      errors: validation.errors.map((e) => `${filePath}: ${e}`)
    };
  }

  const moduleRow = {
    id: parsedFrontmatter.id,
    responsibility: parsedFrontmatter.responsibility,
    nonResponsibilities: parsedFrontmatter.nonResponsibilities || [],
    ownedPaths: parsedFrontmatter.ownedPaths || [],
    publicContracts: parsedFrontmatter.publicContracts || [],
    allowedDependencies: parsedFrontmatter.allowedDependencies || [],
    authorityEffects: parsedFrontmatter.authorityEffects || [],
    verificationEntryPoints: parsedFrontmatter.verificationEntryPoints || [],
    adrReferences: parsedFrontmatter.adrReferences || [],
    profileSource: parsedFrontmatter.profileSource || "inherited-agent-first",
    provisional: Boolean(parsedFrontmatter.provisional),
    candidateBinding: parsedFrontmatter.candidateBinding || null,
    conceptFilePath: filePath
  };

  return { ok: true, module: moduleRow, errors: [] };
}

/**
 * Loads all concept files from architecture/map in the specified root directory.
 */
export function loadMapBundle(rootDir = process.cwd(), schema = getModuleInventorySchema()) {
  const mapDir = path.join(rootDir, "architecture/map");
  const errors = [];
  const modules = [];

  if (!fs.existsSync(mapDir)) {
    return {
      ok: false,
      modules: [],
      errors: [`Map bundle directory not found: ${mapDir}`],
      indexFileExists: false
    };
  }

  const indexFile = path.join(mapDir, "index.md");
  const indexFileExists = fs.existsSync(indexFile);
  if (!indexFileExists) {
    errors.push(`Root map index missing: ${indexFile}`);
  }

  const entries = fs.readdirSync(mapDir, { withFileTypes: true });
  const moduleFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
    .map((e) => path.join(mapDir, e.name));

  const seenIds = new Set();

  for (const file of moduleFiles) {
    const result = loadConceptFile(file, schema);
    if (!result.ok) {
      errors.push(...result.errors);
    } else {
      const mod = result.module;
      if (seenIds.has(mod.id)) {
        errors.push(`Duplicate module ID "${mod.id}" in ${file}`);
      } else {
        seenIds.add(mod.id);
        modules.push(mod);
      }
    }
  }

  // Validate allowedDependencies point to known module IDs
  for (const mod of modules) {
    for (const dep of mod.allowedDependencies) {
      if (!seenIds.has(dep)) {
        errors.push(`Module "${mod.id}" declares unknown allowedDependency "${dep}"`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    modules,
    errors,
    indexFileExists
  };
}

/**
 * Matches a relative file path against a pattern like 'plugins/pipeline-core/**'
 */
function pathMatchesPattern(relPath, pattern) {
  const normalizedPath = relPath.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/");

  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(prefix + "/");
  }

  if (normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.slice(0, -2);
    if (!normalizedPath.startsWith(prefix + "/")) return false;
    const remainder = normalizedPath.slice(prefix.length + 1);
    return !remainder.includes("/");
  }

  return normalizedPath === normalizedPattern;
}

/**
 * Resolves a file path to its owning governed module.
 */
export function resolveModuleForPath(filePath, inventory) {
  const moduleList = Array.isArray(inventory) ? inventory : (inventory?.modules || []);
  if (!filePath || moduleList.length === 0) return null;

  // Normalize path relative to cwd/root if needed
  let normalizedPath = filePath.replace(/\\/g, "/");
  if (path.isAbsolute(normalizedPath)) {
    const rootPosix = REPO_ROOT.replace(/\\/g, "/");
    if (normalizedPath.startsWith(rootPosix + "/")) {
      normalizedPath = normalizedPath.slice(rootPosix.length + 1);
    }
  }
  if (normalizedPath.startsWith("./")) {
    normalizedPath = normalizedPath.slice(2);
  }

  let bestMatch = null;
  let bestMatchLength = -1;

  for (const mod of moduleList) {
    for (const pattern of mod.ownedPaths || []) {
      if (pathMatchesPattern(normalizedPath, pattern)) {
        const patternLength = pattern.length;
        if (patternLength > bestMatchLength) {
          bestMatch = mod;
          bestMatchLength = patternLength;
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Returns the 6-step re-entry reading order for a task touching given module IDs.
 */
export function getReentryReadingOrder(rootDir = process.cwd(), touchedModuleIds = []) {
  const mapDir = path.join(rootDir, "architecture/map");
  const touchedFiles = (touchedModuleIds || []).map((id) =>
    path.join(mapDir, `${id}.md`)
  );

  return [
    {
      step: 1,
      name: "AGENTS.md entry point",
      path: path.join(rootDir, "AGENTS.md"),
      description: "Universal entry point, conventions, and pointer to architecture map."
    },
    {
      step: 2,
      name: "Root map index",
      path: path.join(mapDir, "index.md"),
      description: "Root concept map index and inventory overview."
    },
    {
      step: 3,
      name: "Touched module concept files",
      paths: touchedFiles,
      description: "Concept file(s) for exactly the modules touched by the task."
    },
    {
      step: 4,
      name: "Compiled decision summary",
      path: path.join(rootDir, "project/architecture-decisions.compiled.json"),
      description: "Living ADR summaries filtered by task applicability."
    },
    {
      step: 5,
      name: "Lifecycle state & bootstrap",
      command: "pipeline-core:pipeline-start",
      description: "Sanctioned next actions via runtime bootstrap."
    },
    {
      step: 6,
      name: "Owned implementation surface",
      description: "Targeted source files owned by the authorized module(s)."
    }
  ];
}

// CLI handler
function runCli() {
  const args = process.argv.slice(2);
  let rootDir = process.cwd();
  let check = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      rootDir = path.resolve(args[++i]);
    } else if (args[i] === "--check") {
      check = true;
    } else if (args[i] === "--json") {
      json = true;
    }
  }

  const result = loadMapBundle(rootDir);

  if (json) {
    const output = {
      schema: "pipeline.module-inventory.v1",
      mapBundlePath: "architecture/map",
      modules: result.modules
    };
    console.log(JSON.stringify(output, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (check) {
    if (!result.ok) {
      console.error("Module inventory check FAILED:");
      result.errors.forEach((err) => console.error(`  - ${err}`));
      process.exit(1);
    }
    console.log(`Module inventory check PASSED: ${result.modules.length} governed modules validated.`);
    process.exit(0);
  }

  console.log(`Governed modules (${result.modules.length}):`);
  for (const mod of result.modules) {
    console.log(`  - ${mod.id}: ${mod.responsibility}`);
    console.log(`    ownedPaths: ${mod.ownedPaths.join(", ")}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
