#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Fail-closed retention check for active PRD/Spec authority.
 *
 * The inventory is deliberately public and path-only. It does not contain
 * private evidence or runtime receipts. Each active authority must still
 * exist, be byte-identical to its named archive copy, and be linked from the
 * public handover and next-session entry point before Close can succeed.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = new URL(".", import.meta.url);
export const DEFAULT_ROOT = resolve(fileURLToPath(new URL("../../../", HERE)));
export const INVENTORY_SCHEMA = "pipeline.spec-retention.v1";
export const ARCHIVE_SCHEMA = "pipeline.spec-retention-archive.v1";
const AUTHORITY_KEYS = ["prd", "spec", "acceptance", "design", "recovery", "platformSupport", "windowsBlockers"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function safePath(root, value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) return null;
  const candidate = resolve(root, value);
  const rel = relative(root, candidate);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? null : rel.replaceAll("\\", "/");
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson(root, path, findings, label) {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch {
    findings.push(`${label} is missing or invalid JSON`);
    return null;
  }
}

function readBytes(root, path, findings, label) {
  try {
    if (!statSync(join(root, path)).isFile()) throw new Error("not a regular file");
    return readFileSync(join(root, path));
  } catch {
    findings.push(`${label} is missing or unreadable`);
    return null;
  }
}

function checkLinks(root, entry, sourcePaths, findings) {
  for (const key of ["handoverPath", "nextSessionPath"]) {
    const path = safePath(root, entry[key]);
    if (!path) {
      findings.push(`${entry.id}.${key} must be a repository-relative path`);
      continue;
    }
    const bytes = readBytes(root, path, findings, `${entry.id}.${key}`);
    if (bytes === null) continue;
    const text = bytes.toString("utf8");
    for (const keyName of AUTHORITY_KEYS) {
      if (!text.includes(sourcePaths[keyName])) {
        findings.push(`${entry.id}.${key} must link ${sourcePaths[keyName]}`);
      }
    }
  }
}

export function checkSpecRetention(root = DEFAULT_ROOT, inventoryPath = "governance/spec-retention.json") {
  const findings = [];
  const inventoryRel = safePath(root, inventoryPath);
  if (!inventoryRel) return { ok: false, findings: ["spec-retention inventory path is invalid"] };
  const inventory = readJson(root, inventoryRel, findings, "spec-retention inventory");
  if (!inventory) return { ok: false, findings };
  if (!exactKeys(inventory, ["schema", "active"]) || inventory.schema !== INVENTORY_SCHEMA || !Array.isArray(inventory.active) || inventory.active.length === 0) {
    findings.push(`inventory must contain schema ${INVENTORY_SCHEMA} and at least one active authority`);
    return { ok: false, findings };
  }
  const ids = new Set();
  for (const entry of inventory.active) {
    if (!exactKeys(entry, ["id", "sourcePaths", "archiveManifest", "handoverPath", "nextSessionPath"])) {
      findings.push("each active retention entry has an invalid shape");
      continue;
    }
    if (typeof entry.id !== "string" || entry.id.length === 0 || ids.has(entry.id)) {
      findings.push(`active retention id is missing or duplicated: ${entry.id ?? "unknown"}`);
      continue;
    }
    ids.add(entry.id);
    if (!exactKeys(entry.sourcePaths, AUTHORITY_KEYS)) {
      findings.push(`${entry.id}.sourcePaths must declare ${AUTHORITY_KEYS.join(", ")}`);
      continue;
    }
    const sourcePaths = {};
    for (const key of AUTHORITY_KEYS) {
      sourcePaths[key] = safePath(root, entry.sourcePaths[key]);
      if (!sourcePaths[key]) findings.push(`${entry.id}.sourcePaths.${key} must be repository-relative`);
    }
    if (Object.values(sourcePaths).some((path) => path === null)) continue;
    const sourceDigests = {};
    for (const key of AUTHORITY_KEYS) {
      const bytes = readBytes(root, sourcePaths[key], findings, `${entry.id}.${key} authority`);
      if (bytes !== null) sourceDigests[key] = digest(bytes);
    }
    const manifestPath = safePath(root, entry.archiveManifest);
    if (!manifestPath) {
      findings.push(`${entry.id}.archiveManifest must be repository-relative`);
      continue;
    }
    const manifest = readJson(root, manifestPath, findings, `${entry.id} archive manifest`);
    if (!manifest) continue;
    if (!exactKeys(manifest, ["schema", "id", "sourcePaths", "archivePaths", "sha256"])
      || manifest.schema !== ARCHIVE_SCHEMA || manifest.id !== entry.id
      || !exactKeys(manifest.sourcePaths, AUTHORITY_KEYS)
      || !exactKeys(manifest.archivePaths, AUTHORITY_KEYS)
      || !exactKeys(manifest.sha256, AUTHORITY_KEYS)) {
      findings.push(`${entry.id} archive manifest shape or identity is invalid`);
      continue;
    }
    for (const key of AUTHORITY_KEYS) {
      if (manifest.sourcePaths[key] !== sourcePaths[key]) findings.push(`${entry.id} archive source path drift for ${key}`);
      const archivePath = safePath(root, manifest.archivePaths[key]);
      if (!archivePath) {
        findings.push(`${entry.id} archive path is invalid for ${key}`);
        continue;
      }
      const archiveBytes = readBytes(root, archivePath, findings, `${entry.id}.${key} archive`);
      if (archiveBytes !== null && sourceDigests[key] && digest(archiveBytes) !== sourceDigests[key]) {
        findings.push(`${entry.id} archive bytes differ from active ${key} authority`);
      }
      if (manifest.sha256[key] !== sourceDigests[key]) findings.push(`${entry.id} archive digest is stale for ${key}`);
    }
    checkLinks(root, entry, sourcePaths, findings);
  }
  return { ok: findings.length === 0, findings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const inventoryIndex = process.argv.indexOf("--inventory");
  const inventory = inventoryIndex >= 0 ? process.argv[inventoryIndex + 1] : "governance/spec-retention.json";
  const outcome = checkSpecRetention(DEFAULT_ROOT, inventory);
  if (!outcome.ok) {
    for (const finding of outcome.findings) console.error(`FAIL spec retention: ${finding}`);
    process.exit(2);
  }
  console.log("Spec retention authority and archive bindings are valid.");
}
