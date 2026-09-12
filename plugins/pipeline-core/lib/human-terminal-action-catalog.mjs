// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  PO_HUMAN_APPROVAL_SETUP_BOUNDARY,
  authorizeCriticalPushCommand,
  poHumanApprovalSetupCommand,
  readPoHumanApprovalAuthority,
} from "../scripts/po-human-approval.mjs";
import {
  INSTALLED_PLUGIN_ATTESTATION_SETUP_BOUNDARY,
  installedPluginAttestationSetupCommand,
  readInstalledPluginAttestationSetup,
} from "../scripts/installed-plugin-attestation-host.mjs";

export const HUMAN_TERMINAL_ACTION_CATALOG_SCHEMA = "pipeline.human-terminal-action-catalog.v1";
export const HUMAN_TERMINAL_ACTION_CATALOG_PATH = fileURLToPath(
  new URL("../templates/human-terminal-actions/catalog.json", import.meta.url),
);

const ID = /^[a-z][a-z0-9-]{0,95}$/u;
const ENTRY_KEYS = Object.freeze([
  "audience", "boundary", "builderId", "disposition", "expectedReadback", "id", "inventoryId",
  "mutation", "platforms", "producerRefs", "purpose", "requiresPoApproval", "revision", "runners",
  "slots", "templateId",
]);
const ROOT_KEYS = Object.freeze(["entries", "schema"]);
const BOUNDARY_KEYS = Object.freeze(["codexToolCallPermitted", "executionBoundary", "invocation"]);
const DISPOSITIONS = new Set(["registered", "legacy-renderer", "abstract-family", "excluded"]);
const EXECUTION_BOUNDARIES = new Set([
  "host",
  "external-terminal",
  "attended-external-terminal",
  "local-process",
  "attended-host-terminal",
  "host-authorized-wsl",
]);
const SLOT_KEYS = Object.freeze(["name", "type", "source", "required", "sensitivity", "prompt"]);
const SLOT_TYPES = new Set([
  "absolute-directory", "absolute-file", "repo-relative-path", "sha256", "git-oid", "safe-id",
  "human-name", "runner", "iso8601", "enum",
  "plugin-version",
]);
const SLOT_SOURCES = new Set(["tool-result", "repository-observation", "machine-plane", "human-input"]);
const RUNNERS = new Set(["claude", "codex", "antigravity"]);
const PLATFORMS = new Set(["posix", "windows"]);

// This builder currently returns rendering data only and has no structured
// boundary fields. Preserve that absence as null; Slice 1 must not invent a
// stronger producer contract. A later producer migration may add the exact
// tuple and update both authorities together.
const REGISTERED_BOUNDARIES = Object.freeze({
  "authorize-critical-push": null,
  "po-human-approval-setup": PO_HUMAN_APPROVAL_SETUP_BOUNDARY,
  "installed-plugin-attestation-setup": INSTALLED_PLUGIN_ATTESTATION_SETUP_BOUNDARY,
});

const BUILDERS = Object.freeze({
  "authorize-critical-push": Object.freeze({
    build: authorizeCriticalPushCommand,
    boundary: REGISTERED_BOUNDARIES["authorize-critical-push"],
    source: fileURLToPath(new URL("../scripts/po-human-approval.mjs", import.meta.url)),
  }),
  "po-human-approval-setup": Object.freeze({
    build: poHumanApprovalSetupCommand,
    readback: ({ values }) => readPoHumanApprovalAuthority(values),
    boundary: REGISTERED_BOUNDARIES["po-human-approval-setup"],
    source: fileURLToPath(new URL("../scripts/po-human-approval.mjs", import.meta.url)),
  }),
  "installed-plugin-attestation-setup": Object.freeze({
    build: installedPluginAttestationSetupCommand,
    readback: ({ values }) => readInstalledPluginAttestationSetup(values),
    boundary: REGISTERED_BOUNDARIES["installed-plugin-attestation-setup"],
    source: fileURLToPath(new URL("../scripts/installed-plugin-attestation-host.mjs", import.meta.url)),
  }),
});

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return plainObject(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function boundaryError(boundary) {
  if (!exactKeys(boundary, BOUNDARY_KEYS)) return "boundary must use the closed field set";
  if (!EXECUTION_BOUNDARIES.has(boundary.executionBoundary)) return "executionBoundary is unsupported";
  if (boundary.invocation !== "user-copy-only") return "invocation must be user-copy-only";
  if (boundary.codexToolCallPermitted !== false) return "codexToolCallPermitted must be false";
  return null;
}

function closedStringSetError(value, allowed) {
  return !Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== "string" || !allowed.has(item))
    || new Set(value).size !== value.length;
}

function slotError(slot) {
  const expectedKeys = slot?.type === "enum" ? [...SLOT_KEYS, "enum"] : SLOT_KEYS;
  if (!exactKeys(slot, expectedKeys)) return "closed slot fields required";
  if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(slot.name ?? "")) return "invalid slot name";
  if (!SLOT_TYPES.has(slot.type)) return "unsupported slot type";
  if (!SLOT_SOURCES.has(slot.source)) return "unsupported slot source";
  if (typeof slot.required !== "boolean") return "required must be boolean";
  if (!["public", "machine-private"].includes(slot.sensitivity)) return "unsupported sensitivity";
  if (typeof slot.prompt !== "string" || slot.prompt.length === 0 || slot.prompt.length > 160) return "invalid prompt";
  if (slot.type === "enum" && (!Array.isArray(slot.enum) || slot.enum.length === 0
    || slot.enum.some((item) => typeof item !== "string" || item.length === 0)
    || new Set(slot.enum).size !== slot.enum.length)) return "invalid enum values";
  return null;
}

function readbackError(readback) {
  if (!exactKeys(readback, ["schema", "code", "command"])) return "closed readback fields required";
  if (readback.schema !== null && (typeof readback.schema !== "string" || readback.schema.length === 0)) return "invalid readback schema";
  if (typeof readback.code !== "string" || readback.code.length === 0) return "invalid readback code";
  if (typeof readback.command !== "string" || readback.command.length === 0) return "invalid readback command";
  return null;
}

export function registeredHumanTerminalActionBuilderIds() {
  return Object.keys(BUILDERS).sort();
}

export function validateHumanTerminalActionCatalog(value) {
  const findings = [];
  if (!exactKeys(value, ROOT_KEYS)) return { valid: false, findings: ["HTA-CATALOG-SHAPE: closed root fields required"] };
  if (value.schema !== HUMAN_TERMINAL_ACTION_CATALOG_SCHEMA) findings.push("HTA-CATALOG-SCHEMA: unsupported schema");
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    findings.push("HTA-CATALOG-ENTRIES: one or more entries required");
    return { valid: false, findings };
  }
  const ids = new Set();
  const inventoryIds = new Set();
  const templateIds = new Set();
  const usedBuilders = new Set();
  value.entries.forEach((entry, index) => {
    const at = `HTA-CATALOG-ENTRY[${index}]`;
    if (!exactKeys(entry, ENTRY_KEYS)) {
      findings.push(`${at}-SHAPE: closed entry fields required`);
      return;
    }
    for (const field of ["id", "inventoryId"]) {
      if (!ID.test(entry[field] ?? "")) findings.push(`${at}-${field}: invalid id`);
    }
    if (!Number.isSafeInteger(entry.revision) || entry.revision < 1) findings.push(`${at}-REVISION: positive integer required`);
    if (typeof entry.purpose !== "string" || entry.purpose.length === 0 || entry.purpose.length > 240) findings.push(`${at}-PURPOSE: bounded text required`);
    if (!["user", "developer"].includes(entry.audience)) findings.push(`${at}-AUDIENCE: unsupported audience`);
    if (ids.has(entry.id)) findings.push(`${at}-DUPLICATE-ID: ${entry.id}`);
    ids.add(entry.id);
    if (inventoryIds.has(entry.inventoryId)) findings.push(`${at}-DUPLICATE-INVENTORY-ID: ${entry.inventoryId}`);
    inventoryIds.add(entry.inventoryId);
    if (!DISPOSITIONS.has(entry.disposition)) findings.push(`${at}-DISPOSITION: unsupported disposition`);
    if (!Array.isArray(entry.producerRefs) || entry.producerRefs.length === 0
      || entry.producerRefs.some((item) => typeof item !== "string" || item.length === 0 || item.length > 240)) {
      findings.push(`${at}-PRODUCER-REFS: non-empty bounded strings required`);
    }
    if (entry.disposition === "registered") {
      if (!ID.test(entry.templateId ?? "")) findings.push(`${at}-TEMPLATE-ID: registered entry requires an id`);
      if (!ID.test(entry.builderId ?? "")) findings.push(`${at}-BUILDER-ID: registered entry requires an id`);
      if (templateIds.has(entry.templateId)) findings.push(`${at}-DUPLICATE-TEMPLATE-ID: ${entry.templateId}`);
      templateIds.add(entry.templateId);
      if (typeof entry.mutation !== "boolean") findings.push(`${at}-MUTATION: registered entry requires boolean`);
      if (typeof entry.requiresPoApproval !== "boolean") findings.push(`${at}-PO-APPROVAL: registered entry requires boolean`);
      if (!Array.isArray(entry.slots)) findings.push(`${at}-SLOTS: registered entry requires an ordered array`);
      else {
        const slotNames = new Set();
        entry.slots.forEach((slot, slotIndex) => {
          const error = slotError(slot);
          if (error) findings.push(`${at}-SLOT[${slotIndex}]: ${error}`);
          if (slotNames.has(slot?.name)) findings.push(`${at}-DUPLICATE-SLOT: ${slot?.name}`);
          slotNames.add(slot?.name);
        });
      }
      const expectedError = readbackError(entry.expectedReadback);
      if (expectedError) findings.push(`${at}-READBACK: ${expectedError}`);
      if (closedStringSetError(entry.runners, RUNNERS)) findings.push(`${at}-RUNNERS: non-empty unique supported runners required`);
      if (closedStringSetError(entry.platforms, PLATFORMS)) findings.push(`${at}-PLATFORMS: non-empty unique supported platforms required`);
      const registered = BUILDERS[entry.builderId];
      if (!registered) findings.push(`${at}-UNKNOWN-BUILDER: ${entry.builderId}`);
      else {
        if (usedBuilders.has(entry.builderId)) findings.push(`${at}-DUPLICATE-BUILDER-ID: ${entry.builderId}`);
        usedBuilders.add(entry.builderId);
        const error = entry.boundary === null ? null : boundaryError(entry.boundary);
        if (error) findings.push(`${at}-BOUNDARY: ${error}`);
        else if (JSON.stringify(entry.boundary) !== JSON.stringify(registered.boundary)) {
          findings.push(`${at}-BOUNDARY-DRIFT: ${entry.builderId}`);
        }
      }
    } else if (entry.templateId !== null || entry.builderId !== null || entry.boundary !== null
      || entry.mutation !== null || entry.requiresPoApproval !== null || entry.slots !== null
      || entry.expectedReadback !== null || entry.runners !== null || entry.platforms !== null) {
      findings.push(`${at}-INACTIVE-FIELDS: non-registered contract fields must be null`);
    }
  });
  for (const builderId of Object.keys(BUILDERS)) {
    if (!usedBuilders.has(builderId)) findings.push(`HTA-CATALOG-UNUSED-BUILDER: ${builderId}`);
  }
  return { valid: findings.length === 0, findings: findings.sort() };
}

export function parseHumanTerminalActionCatalog(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`HTA-CATALOG-JSON: ${error.message}`);
  }
  const checked = validateHumanTerminalActionCatalog(value);
  if (!checked.valid) throw new Error(checked.findings.join("; "));
  return deepFreeze(value);
}

export function loadHumanTerminalActionCatalog(path = HUMAN_TERMINAL_ACTION_CATALOG_PATH) {
  return parseHumanTerminalActionCatalog(readFileSync(path, "utf8"));
}

export function humanTerminalActionCatalogEntry(templateId, catalog = loadHumanTerminalActionCatalog()) {
  const entry = catalog.entries.find((candidate) => candidate.templateId === templateId);
  if (!entry || entry.disposition !== "registered") throw new Error(`HTA-TEMPLATE-UNKNOWN: ${templateId}`);
  return entry;
}

export function registeredHumanTerminalActionBuilderIdentity(builderId) {
  const registered = BUILDERS[builderId];
  if (!registered) throw new Error(`HTA-BUILDER-UNKNOWN: ${builderId}`);
  return Object.freeze({
    sourceSha256: createHash("sha256").update(readFileSync(registered.source)).digest("hex"),
  });
}

export function buildRegisteredHumanTerminalAction(builderId, input) {
  const registered = BUILDERS[builderId];
  if (!registered) throw new Error(`HTA-BUILDER-UNKNOWN: ${builderId}`);
  return deepFreeze({
    output: registered.build(input),
    boundary: structuredClone(registered.boundary),
  });
}

export function readbackRegisteredHumanTerminalAction(builderId, input) {
  const registered = BUILDERS[builderId];
  if (!registered) throw new Error(`HTA-BUILDER-UNKNOWN: ${builderId}`);
  if (typeof registered.readback !== "function") throw new Error(`HTA-READBACK-UNAVAILABLE: ${builderId}`);
  return registered.readback(input);
}

export function hasRegisteredHumanTerminalActionReadback(builderId) {
  return typeof BUILDERS[builderId]?.readback === "function";
}
