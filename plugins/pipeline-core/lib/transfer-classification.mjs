#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Typed Public/Private transfer-time classification for active PRD/Spec
 * authority (backlog: pipeline.spec-retention-on-close, criterion 2).
 *
 * `checkSpecRetention` (`../scripts/check-spec-retention.mjs`, wired into
 * `verify.mjs`) enforces retention as a post-hoc Verify-time gate: it fails
 * when an active authority has already gone missing. This module answers a
 * narrower, earlier question, asked at the moment of a Public/Private
 * transfer itself (close-block's `runtime-transfer` intent) rather than only
 * afterwards at Verify: for each active authority named in
 * `governance/spec-retention.json`, would THIS transfer omit it, and if so,
 * is the omission covered by BOTH a durable archive destination (the same
 * archive-manifest binding `checkSpecRetention` verifies) AND an explicit,
 * separately recorded PO disposition (`governance/transfer-dispositions.json`)?
 * Fail closed: an omission covered by fewer than both stays `blocked`. A
 * present (non-omitted) authority is never blocked, regardless of archive or
 * disposition state.
 */
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { isDirectInvocation } from "./entrypoint.mjs";
import {
  ARCHIVE_SCHEMA,
  DEFAULT_ROOT,
  INVENTORY_SCHEMA,
  LEGACY_ARCHIVE_SCHEMA,
  LEGACY_INVENTORY_SCHEMA,
} from "../scripts/check-spec-retention.mjs";

export const DISPOSITION_SCHEMA = "pipeline.transfer-disposition.v1";
export const DEFAULT_DISPOSITIONS_PATH = "governance/transfer-dispositions.json";

export { DEFAULT_ROOT };

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safePath(root, value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) return null;
  const candidate = resolve(root, value);
  const rel = relative(root, candidate);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? null : rel.replaceAll("\\", "/");
}

function readJsonQuiet(root, path) {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch {
    return null;
  }
}

function isReadableFile(root, path) {
  try {
    return statSync(join(root, path)).isFile();
  } catch {
    return false;
  }
}

/**
 * A durable archive destination for `entry.sourcePaths[key]`: the entry's
 * own `archiveManifest` exists, is well-formed, is bound to this exact
 * entry id and source path for `key`, and the archived copy it names is
 * present on disk. It deliberately does NOT recompute a digest against the
 * (by construction, already-omitted) live source -- there is nothing left to
 * compare it against at transfer time.
 */
function hasDurableArchiveDestination(root, entry, key) {
  const manifestPath = safePath(root, entry.archiveManifest);
  if (!manifestPath) return false;
  const manifest = readJsonQuiet(root, manifestPath);
  if (!isObject(manifest)) return false;
  if (![ARCHIVE_SCHEMA, LEGACY_ARCHIVE_SCHEMA].includes(manifest.schema)) return false;
  if (manifest.id !== entry.id) return false;
  if (!isObject(manifest.sourcePaths) || !isObject(manifest.archivePaths)) return false;
  const expectedSource = safePath(root, entry.sourcePaths[key]);
  if (!expectedSource || manifest.sourcePaths[key] !== expectedSource) return false;
  const archivePath = safePath(root, manifest.archivePaths[key]);
  if (!archivePath) return false;
  return isReadableFile(root, archivePath);
}

function hasRecordedDisposition(dispositions, entryId, key) {
  return dispositions.some((disposition) => isObject(disposition)
    && disposition.id === entryId
    && disposition.key === key
    && typeof disposition.approvedBy === "string" && disposition.approvedBy.length > 0
    && typeof disposition.approvedAt === "string" && disposition.approvedAt.length > 0
    && typeof disposition.reason === "string" && disposition.reason.length > 0);
}

function loadDispositions(root, dispositionsPath, findings) {
  const rel = safePath(root, dispositionsPath);
  if (!rel) {
    findings.push("transfer dispositions path is invalid");
    return [];
  }
  if (!isReadableFile(root, rel)) return []; // absence just means no disposition has been recorded yet
  const parsed = readJsonQuiet(root, rel);
  if (!isObject(parsed) || parsed.schema !== DISPOSITION_SCHEMA || !Array.isArray(parsed.dispositions)) {
    findings.push("transfer dispositions file is present but malformed -- treating recorded dispositions as empty");
    return [];
  }
  return parsed.dispositions;
}

/**
 * @param {string} root repository root
 * @param {string} inventoryPath repository-relative path to the spec-retention inventory
 * @param {string} dispositionsPath repository-relative path to recorded PO transfer dispositions
 * @returns {{status: "clear"|"blocked", findings: string[], entries: Array<{id: string, key: string, status: "present"|"omitted-covered"|"blocked"}>}}
 */
export function classifyTransfer(root = DEFAULT_ROOT, inventoryPath = "governance/spec-retention.json", dispositionsPath = DEFAULT_DISPOSITIONS_PATH) {
  const findings = [];
  const inventoryRel = safePath(root, inventoryPath);
  if (!inventoryRel) return { status: "blocked", findings: ["spec-retention inventory path is invalid"], entries: [] };
  const inventory = readJsonQuiet(root, inventoryRel);
  if (!isObject(inventory)) {
    return { status: "blocked", findings: ["spec-retention inventory is missing or invalid JSON"], entries: [] };
  }
  if (![INVENTORY_SCHEMA, LEGACY_INVENTORY_SCHEMA].includes(inventory.schema) || !Array.isArray(inventory.active) || inventory.active.length === 0) {
    return { status: "blocked", findings: [`inventory must contain schema ${INVENTORY_SCHEMA} or ${LEGACY_INVENTORY_SCHEMA} and at least one active authority`], entries: [] };
  }

  const dispositions = loadDispositions(root, dispositionsPath, findings);

  const entries = [];
  for (const entry of inventory.active) {
    if (!isObject(entry) || typeof entry.id !== "string" || entry.id.length === 0) {
      findings.push("active retention entry is missing a valid id");
      continue;
    }
    if (!isObject(entry.sourcePaths)) {
      findings.push(`${entry.id}.sourcePaths must be an object`);
      continue;
    }
    for (const key of Object.keys(entry.sourcePaths)) {
      const sourceRel = safePath(root, entry.sourcePaths[key]);
      if (!sourceRel) {
        findings.push(`${entry.id}.sourcePaths.${key} must be repository-relative`);
        continue;
      }
      if (isReadableFile(root, sourceRel)) {
        entries.push({ id: entry.id, key, status: "present" });
        continue;
      }
      const archived = hasDurableArchiveDestination(root, entry, key);
      const disposed = hasRecordedDisposition(dispositions, entry.id, key);
      if (archived && disposed) {
        entries.push({ id: entry.id, key, status: "omitted-covered" });
        continue;
      }
      findings.push(`${entry.id}.${key} would be omitted from the transfer without both a durable archive destination and a recorded PO disposition`);
      entries.push({ id: entry.id, key, status: "blocked" });
    }
  }

  return findings.length === 0
    ? { status: "clear", findings: [], entries }
    : { status: "blocked", findings, entries };
}

if (isDirectInvocation(import.meta.url)) {
  const outcome = classifyTransfer();
  if (outcome.status === "blocked") {
    for (const finding of outcome.findings) console.error(`BLOCKED transfer classification: ${finding}`);
    process.exit(2);
  }
  console.log("Transfer classification: clear -- every active PRD/Spec/acceptance-matrix authority is present, or its omission is covered by a durable archive destination and a recorded PO disposition.");
}
