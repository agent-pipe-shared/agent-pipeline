#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * license-check.mjs -- security-scan adapter for third-party license allowlisting,
 * AP1-P4 "FUNDIN". PURE NODE, NO BINARY (no `isInstalled` PATH/env resolution needed --
 * always reports installed; the two things it needs are FILES, checked inside `run()`).
 *
 * NEW FILE. Dependency-free (node:fs/path only). Same `{name, isInstalled, run}` shape as
 * its binary-backed siblings for uniform runner treatment.
 *
 * INPUT FILES (both resolved to absolute paths by the runner and handed in via `config`,
 * per the briefing's "path from config" clause -- see harness/scripts/security-scan.mjs
 * header for exactly how these two paths are derived from the manifest):
 *   - `config.allowlistPath` -- `<governance.policies_path>/license-allowlist.json`,
 *     shape `{ "allow": ["MIT", "Apache-2.0", ...], "deny": ["GPL-3.0", ...] }`.
 *   - `config.declaredPath` -- project-declared `third-party-licenses.json`, always resolved
 *     by the runner to `<rootDir>/third-party-licenses.json` (repo root). A manifest-driven
 *     override (mirroring `semgrep.rules_dir`) was considered and dropped: the manifest
 *     schema's `security.scanners.<key>` value shape is `additionalProperties: false` with
 *     only `enabled`/`rules_dir` declared, so an undeclared `declared_path` key there would
 *     invalidate the WHOLE manifest -- see harness/scripts/security-scan.mjs header for the
 *     full rationale. Flagged as an open item, not implemented.
 *     SHAPE DEFINED HERE (no external standard governs this file -- it is this pipeline's
 *     own declaration format, not a third-party tool's output):
 *     `{ "dependencies": [ { "name": "somepkg", "version": "1.2.3", "license": "MIT" },
 *     ... ] }`. `version` is optional (used only to make a finding's `path` more specific).
 *
 * BEHAVIOR: either file absent -> SKIPPED (with a reason naming which path is missing and
 * where). Either file present but not valid JSON -> ERROR (never silently treated as "no
 * dependencies"). Otherwise: for every declared dependency whose `license` is NOT in
 * `allow` (or IS explicitly in `deny`), emit one finding, severity fixed "high" (briefing:
 * "license-check violations -> high"). No violations -> PASS.
 */
import { existsSync, readFileSync } from "node:fs";

export const name = "license-check";

/** No external binary -- always installed. `env` param kept for interface uniformity. */
export function isInstalled(_env = process.env) {
  return { installed: true };
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validAllowlist(value) {
  return isRecord(value) && isStringArray(value.allow) && isStringArray(value.deny);
}

function validDeclaration(value) {
  return isRecord(value)
    && Array.isArray(value.dependencies)
    && value.dependencies.every((dependency) => isRecord(dependency)
      && typeof dependency.name === "string" && dependency.name.trim().length > 0
      && typeof dependency.license === "string" && dependency.license.trim().length > 0
      && (dependency.version === undefined || typeof dependency.version === "string"));
}

export async function run({ config = {} } = {}) {
  const allowlistPath = config.allowlistPath;
  const declaredPath = config.declaredPath;

  if (!allowlistPath || !existsSync(allowlistPath)) {
    return { status: "SKIPPED", findings: [], raw: null, reason: `license allowlist not found: ${allowlistPath ?? "(no path configured)"}` };
  }
  if (!declaredPath || !existsSync(declaredPath)) {
    return {
      status: "SKIPPED",
      findings: [],
      raw: null,
      reason: `no declared third-party-licenses.json found: ${declaredPath ?? "(no path configured)"}`,
    };
  }

  let allowlist;
  try {
    allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  } catch (err) {
    return { status: "ERROR", classification: "scanner_error", findings: [], raw: null, reason: `malformed license-allowlist.json (${allowlistPath}): ${err.message}` };
  }

  let declared;
  try {
    declared = JSON.parse(readFileSync(declaredPath, "utf8"));
  } catch (err) {
    return { status: "ERROR", classification: "scanner_error", findings: [], raw: null, reason: `malformed third-party-licenses.json (${declaredPath}): ${err.message}` };
  }

  if (!validAllowlist(allowlist)) {
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: { allowlist, declared },
      reason: "unexpected license-allowlist.json shape (expected allow[] and deny[] of non-empty strings)",
    };
  }
  if (!validDeclaration(declared)) {
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: { allowlist, declared },
      reason: "unexpected third-party-licenses.json shape (expected dependencies[] with name and license strings)",
    };
  }

  const allow = new Set(allowlist.allow);
  const deny = new Set(allowlist.deny);
  const { dependencies } = declared;

  const findings = [];
  for (const dep of dependencies) {
    const license = dep?.license;
    const depName = dep?.name ?? "unknown-dependency";
    const depLabel = dep?.version ? `${depName}@${dep.version}` : depName;
    const isDenied = typeof license === "string" && deny.has(license);
    const isAllowed = typeof license === "string" && allow.has(license);
    if (isDenied || !isAllowed) {
      findings.push({
        tool: name,
        severity: "high", // briefing: "license-check violations -> high"
        rule: "license-not-allowed",
        path: depLabel,
        line: null,
        msg: isDenied
          ? `License "${license}" for ${depLabel} is explicitly denied`
          : `License "${license ?? "(missing)"}" for ${depLabel} is not in the allowlist`,
      });
    }
  }

  return { status: findings.length > 0 ? "FINDINGS" : "PASS", findings, raw: { allowlist, declared } };
}
