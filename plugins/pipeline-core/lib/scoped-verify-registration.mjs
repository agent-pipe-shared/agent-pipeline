#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Bounded validation for Sentinel's one static Verify extension.
 * This is deliberately not a reusable registry or mutation API.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const SCOPED_VERIFY_REGISTRATION_SCHEMA = "pipeline.scoped-verify-registration.v1";
export const SCOPED_VERIFY_REGISTRATION_TASK_ID = "pipeline.verify-gate-scoped-registration";
export const SCOPED_VERIFY_REGISTRATION_PRD_PATH = "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md";
export const SCOPED_VERIFY_REGISTRATION_PRD_SHA256 = "2b4c722de508cb9424b3fb83c6308602dd20e7e67ce240740c51deeb58541136";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SHA256 = /^[a-f0-9]{64}$/u;
const SCOPED_SUITE_NAME = "scoped-verify-registration-tests";
const SCOPED_SUITE_FILE = "plugins/pipeline-core/lib/scoped-verify-registration.test.mjs";

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

/** Validate the exact declarative SNT-7 Verify registration. */
export function validateScopedVerifyRegistration(entry) {
  if (!exactKeys(entry, ["schema", "taskId", "authority", "suites"])) return rejected("SVR-SCHEMA");
  if (entry.schema !== SCOPED_VERIFY_REGISTRATION_SCHEMA) return rejected("SVR-SCHEMA");
  if (entry.taskId !== SCOPED_VERIFY_REGISTRATION_TASK_ID) return rejected("SVR-TASK");
  if (!exactKeys(entry.authority, ["prd"]) || !exactKeys(entry.authority.prd, ["path", "sha256"])) return rejected("SVR-AUTHORITY");
  const prd = entry.authority.prd;
  if (prd.path !== SCOPED_VERIFY_REGISTRATION_PRD_PATH || !SHA256.test(prd.sha256)
    || prd.sha256 !== SCOPED_VERIFY_REGISTRATION_PRD_SHA256) return rejected("SVR-PRD-BINDING");
  const prdFile = safeRelativeFile(prd.path);
  if (!prdFile) return rejected("SVR-PRD-PATH");
  try {
    if (!lstatSync(prdFile).isFile()) return rejected("SVR-PRD-FILE");
    if (createHash("sha256").update(readFileSync(prdFile)).digest("hex") !== prd.sha256) return rejected("SVR-PRD-DRIFT");
  } catch {
    return rejected("SVR-PRD-FILE");
  }
  if (!Array.isArray(entry.suites) || entry.suites.length !== 1) return rejected("SVR-SUITES");
  const [suite] = entry.suites;
  if (!exactKeys(suite, ["name", "file"]) || suite.name !== SCOPED_SUITE_NAME || suite.file !== SCOPED_SUITE_FILE) {
    return rejected("SVR-SUITE-BINDING");
  }
  const target = safeRelativeFile(suite.file);
  if (!target) return rejected("SVR-SUITE-PATH");
  try {
    if (!lstatSync(target).isFile()) return rejected("SVR-SUITE-FILE");
  } catch {
    return rejected("SVR-SUITE-FILE");
  }
  return Object.freeze({ ok: true });
}
