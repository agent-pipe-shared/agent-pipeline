#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Closed Verify registration for the PO-approved Windows-assurance evidence.
 * This is deliberately not a reusable registry, discovery mechanism, or mutation API.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const WINDOWS_ASSURANCE_VERIFY_REGISTRATION_SCHEMA = "pipeline.windows-assurance-verify-registration.v1";
export const WINDOWS_ASSURANCE_VERIFY_REGISTRATION_TASK_ID = "pipeline.windows-assurance-verify-binding";
export const WINDOWS_ASSURANCE_VERIFY_REGISTRATION_AUTHORITY_PATH = "specs/2026-07-19-sprint-sentinel-epic/windows-trusted-tool-resolution-ac-matrix.md";
export const WINDOWS_ASSURANCE_VERIFY_REGISTRATION_AUTHORITY_SHA256 = "0b1a6c9256b7a517e95f401d6d86a75e5ce6d6ff87a61ded012ec7e672cf3a2e";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SHA256 = /^[a-f0-9]{64}$/u;
const WINDOWS_ASSURANCE_SUITES = Object.freeze([
  Object.freeze({
    name: "trusted-tool-resolution-tests",
    file: "plugins/pipeline-core/lib/trusted-tool-resolution.test.mjs",
  }),
  Object.freeze({
    name: "advisory-receipt-assurance-tests",
    file: "plugins/pipeline-core/lib/advisory-receipt-assurance.test.mjs",
  }),
  Object.freeze({
    name: "toolchain-preflight-tests",
    file: "plugins/pipeline-core/scripts/toolchain-preflight.test.mjs",
  }),
]);

function exactKeys(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function safeRelativeFile(path) {
  if (typeof path !== "string" || path === "" || isAbsolute(path) || path.includes("\\")) return null;
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  const absolute = resolve(ROOT, ...parts);
  const rel = relative(ROOT, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) return null;
  return absolute;
}

function rejected(code) { return { ok: false, code }; }

/** Validate the exact PO-approved Windows-assurance Verify registration. */
export function validateWindowsAssuranceVerifyRegistration(entry) {
  if (!exactKeys(entry, ["schema", "taskId", "authority", "suites"])) return rejected("WAVR-SCHEMA");
  if (entry.schema !== WINDOWS_ASSURANCE_VERIFY_REGISTRATION_SCHEMA) return rejected("WAVR-SCHEMA");
  if (entry.taskId !== WINDOWS_ASSURANCE_VERIFY_REGISTRATION_TASK_ID) return rejected("WAVR-TASK");
  if (!exactKeys(entry.authority, ["matrix"]) || !exactKeys(entry.authority.matrix, ["path", "sha256"])) return rejected("WAVR-AUTHORITY");
  const matrix = entry.authority.matrix;
  if (matrix.path !== WINDOWS_ASSURANCE_VERIFY_REGISTRATION_AUTHORITY_PATH || !SHA256.test(matrix.sha256)
    || matrix.sha256 !== WINDOWS_ASSURANCE_VERIFY_REGISTRATION_AUTHORITY_SHA256) return rejected("WAVR-AUTHORITY-BINDING");
  const authorityFile = safeRelativeFile(matrix.path);
  if (!authorityFile) return rejected("WAVR-AUTHORITY-PATH");
  try {
    if (!lstatSync(authorityFile).isFile()) return rejected("WAVR-AUTHORITY-FILE");
    if (createHash("sha256").update(readFileSync(authorityFile)).digest("hex") !== matrix.sha256) return rejected("WAVR-AUTHORITY-DRIFT");
  } catch {
    return rejected("WAVR-AUTHORITY-FILE");
  }
  if (!Array.isArray(entry.suites) || entry.suites.length !== WINDOWS_ASSURANCE_SUITES.length) return rejected("WAVR-SUITES");
  for (const [index, suite] of entry.suites.entries()) {
    const expected = WINDOWS_ASSURANCE_SUITES[index];
    if (!exactKeys(suite, ["name", "file"]) || suite.name !== expected.name || suite.file !== expected.file) {
      return rejected("WAVR-SUITE-BINDING");
    }
    const target = safeRelativeFile(suite.file);
    if (!target) return rejected("WAVR-SUITE-PATH");
    try {
      if (!lstatSync(target).isFile()) return rejected("WAVR-SUITE-FILE");
    } catch {
      return rejected("WAVR-SUITE-FILE");
    }
  }
  return Object.freeze({ ok: true });
}
