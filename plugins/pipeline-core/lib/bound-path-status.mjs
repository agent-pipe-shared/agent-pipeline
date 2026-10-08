// SPDX-License-Identifier: SUL-1.0
//
// R7-3c -- status lister for the State fields that bind a file by digest (spec 22.3,
// ruling 60). Lists each tracked-required path with one of tracked | ignored |
// untracked | modified, and names the device-local (private-store) artifacts so the
// handover can say they never travel to a second device.

import { execFileSync } from "node:child_process";
import { BOUND_PATH_FIELD_CLASSIFICATION, classifyBoundPathReference } from "./bound-path-classification.mjs";

const FAILURE_CODES = Object.freeze({
  ignored: "DWP-BOUND-PATH-IGNORED",
  untracked: "DWP-BOUND-PATH-UNTRACKED",
  modified: "DWP-BOUND-PATH-MODIFIED",
});

const normalize = (value) => String(value).replaceAll("\\", "/").replace(/^\.\//u, "");

// Exit 0 -> true, exit 1 -> false; anything else is a real git failure and propagates.
function probe(repoRoot, args) {
  try {
    execFileSync("git", args, { cwd: repoRoot, shell: false, stdio: "ignore" });
    return true;
  } catch (error) {
    if (error?.status === 1) return false;
    throw error;
  }
}

function statusOf(repoRoot, path) {
  if (probe(repoRoot, ["ls-files", "--error-unmatch", "--", path])) {
    return probe(repoRoot, ["diff", "--quiet", "HEAD", "--", path]) ? "tracked" : "modified";
  }
  return probe(repoRoot, ["check-ignore", "-q", "--", path]) ? "ignored" : "untracked";
}

function walk(value, prefix, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, prefix, visit);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) walk(child, prefix ? `${prefix}.${key}` : key, visit);
  } else if (typeof value === "string" && value !== "") {
    visit(prefix, value);
  }
}

export function listBoundPathStatuses({ repoRoot, state, privateReferences = [] }) {
  const entries = [];
  const failures = [];
  const deviceLocal = [];
  const seen = new Set();
  const seenLocal = new Set();

  const addDeviceLocal = (raw) => {
    const path = normalize(raw);
    if (seenLocal.has(path)) return;
    seenLocal.add(path);
    deviceLocal.push({ path, kind: "device-local" });
  };

  walk(state ?? {}, "", (field, raw) => {
    const path = normalize(raw);
    const classification = BOUND_PATH_FIELD_CLASSIFICATION[field];
    if (classification === "tracked-required" && classifyBoundPathReference(path) === "device-local") {
      addDeviceLocal(path);
    } else if (classification === "tracked-required") {
      if (seen.has(path)) return;
      seen.add(path);
      const status = statusOf(repoRoot, path);
      entries.push({ field, path, status });
      if (status !== "tracked") failures.push({ code: FAILURE_CODES[status], path });
    } else if (classification === undefined && /Paths?$/u.test(field) && classifyBoundPathReference(path) === "device-local") {
      addDeviceLocal(path);
    }
  });

  for (const reference of privateReferences) {
    if (classifyBoundPathReference(reference) === "device-local") addDeviceLocal(reference);
  }

  return { ok: failures.length === 0, entries, failures, deviceLocal };
}

export function renderHandoverBoundPaths(result) {
  const lines = ["Bound paths (tracked-required):"];
  if (result.entries.length === 0) lines.push("  (none)");
  for (const entry of result.entries) lines.push(`  ${entry.path} -- ${entry.status} (${entry.field})`);
  for (const failure of result.failures) lines.push(`  FAIL ${failure.code}: ${failure.path}`);
  lines.push("Device-local artifacts (private store, do not travel to a second device):");
  if (result.deviceLocal.length === 0) lines.push("  (none)");
  for (const entry of result.deviceLocal) lines.push(`  ${entry.path} -- device-local`);
  return lines.join("\n");
}
