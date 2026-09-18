#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only browser-evidence capability check.
 *
 * This deliberately probes a locally installed Playwright package and its
 * Chromium executable without running a product test, installing packages, or
 * downloading a browser.  A browser test failure belongs to the consumer's
 * Verify receipt; this preflight reports only whether that class of evidence
 * was available before the test began.  A declared fallback remains a
 * non-zero degraded result: an ordinary CI step must not silently turn it
 * into a successful browser-E2E claim.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const BROWSER_EVIDENCE_PREFLIGHT_SCHEMA = "pipeline.browser-evidence-preflight.v1";
export const BROWSER_EVIDENCE_CLASSES = Object.freeze(["static", "offline-behaviour", "browser-e2e"]);

const PLAYWRIGHT_PROBE = String.raw`
const fs = require("node:fs");
try {
  let playwright = null;
  for (const packageName of ["@playwright/test", "playwright"]) {
    try {
      playwright = require(packageName);
      break;
    } catch (error) {
      if (!error || error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  if (playwright === null) {
    process.stdout.write(JSON.stringify({ state: "package-missing" }));
  } else {
    const executablePath = playwright.chromium?.executablePath?.();
    if (typeof executablePath !== "string" || executablePath.length === 0) {
      process.stdout.write(JSON.stringify({ state: "probe-invalid" }));
    } else {
      process.stdout.write(JSON.stringify({ state: fs.existsSync(executablePath) ? "ready" : "browser-missing", executablePath }));
    }
  }
} catch {
  process.stdout.write(JSON.stringify({ state: "probe-error" }));
}
`;

function unavailable(code, detail, { requiredEvidence, fallbackEvidence } = {}) {
  return Object.freeze({
    schema: BROWSER_EVIDENCE_PREFLIGHT_SCHEMA,
    status: "unavailable",
    code,
    requiredEvidence,
    fallbackEvidence,
    observedEvidence: "browser-e2e",
    selectedEvidence: null,
    testExecuted: false,
    installAttempted: false,
    detail,
    exitCode: 2,
  });
}

function probePlaywrightBrowser(rootDir, { spawnFn = spawnSync } = {}) {
  let result;
  try {
    result = spawnFn(process.execPath, ["-e", PLAYWRIGHT_PROBE], {
      cwd: rootDir,
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
    });
  } catch {
    return { state: "probe-error" };
  }
  if (result?.status !== 0 || result?.error) return { state: "probe-error" };
  try {
    const parsed = JSON.parse(String(result.stdout ?? ""));
    return parsed && typeof parsed === "object" && typeof parsed.state === "string"
      ? parsed
      : { state: "probe-error" };
  } catch {
    return { state: "probe-error" };
  }
}

function validRequiredEvidenceClass(value) {
  return BROWSER_EVIDENCE_CLASSES.includes(value);
}

function validFallbackEvidenceClass(value) {
  return value === null || BROWSER_EVIDENCE_CLASSES.includes(value);
}

/**
 * Evaluate the declared browser-evidence requirement without launching tests.
 * A declared weaker fallback is visible as `degraded`, rather than allowing a
 * caller to represent unavailable browser proof as a successful browser run.
 */
export function preflightBrowserEvidence({ rootDir = process.cwd(), requiredEvidence = "browser-e2e", fallbackEvidence = null } = {}, deps = {}) {
  if (typeof rootDir !== "string" || rootDir.trim() === "" || !validRequiredEvidenceClass(requiredEvidence) || !validFallbackEvidenceClass(fallbackEvidence)) {
    return unavailable("BEP-INPUT-INVALID", "root and evidence classes must be valid", { requiredEvidence, fallbackEvidence });
  }
  if (fallbackEvidence === "browser-e2e") {
    return unavailable("BEP-FALLBACK-INVALID", "a fallback must be weaker than browser-e2e", { requiredEvidence, fallbackEvidence });
  }
  if (requiredEvidence !== "browser-e2e") {
    if (fallbackEvidence !== null) {
      return unavailable("BEP-FALLBACK-UNUSED", "a fallback is valid only when browser-e2e is required", { requiredEvidence, fallbackEvidence });
    }
    return Object.freeze({
      schema: BROWSER_EVIDENCE_PREFLIGHT_SCHEMA,
      status: "ready",
      code: "BEP-DECLARED-NON-BROWSER",
      requiredEvidence,
      fallbackEvidence,
      observedEvidence: null,
      selectedEvidence: requiredEvidence,
      testExecuted: false,
      installAttempted: false,
      detail: "The declared evidence class does not require a browser capability probe.",
      exitCode: 0,
    });
  }

  const observed = probePlaywrightBrowser(resolve(rootDir), deps);
  if (observed.state === "ready") {
    return Object.freeze({
      schema: BROWSER_EVIDENCE_PREFLIGHT_SCHEMA,
      status: "ready",
      code: "BEP-BROWSER-E2E-READY",
      requiredEvidence,
      fallbackEvidence,
      observedEvidence: "browser-e2e",
      selectedEvidence: "browser-e2e",
      testExecuted: false,
      installAttempted: false,
      detail: "Playwright and its Chromium executable are locally available; no browser test was run by this preflight.",
      exitCode: 0,
    });
  }
  if (fallbackEvidence !== null) {
    return Object.freeze({
      schema: BROWSER_EVIDENCE_PREFLIGHT_SCHEMA,
      status: "degraded",
      code: "BEP-BROWSER-E2E-UNAVAILABLE-FALLBACK-DECLARED",
      requiredEvidence,
      fallbackEvidence,
      observedEvidence: null,
      selectedEvidence: fallbackEvidence,
      testExecuted: false,
      installAttempted: false,
      detail: `Browser E2E is unavailable (${observed.state}); the caller explicitly selected ${fallbackEvidence} evidence instead.`,
      exitCode: 2,
    });
  }
  const code = observed.state === "package-missing"
    ? "BEP-PLAYWRIGHT-PACKAGE-UNAVAILABLE"
    : observed.state === "browser-missing"
      ? "BEP-CHROMIUM-UNAVAILABLE"
      : "BEP-BROWSER-PROBE-FAILED";
  return Object.freeze({
    ...unavailable(code, `Browser E2E is unavailable before any test ran (${observed.state}).`, { requiredEvidence, fallbackEvidence }),
    exitCode: 1,
  });
}

export function parseBrowserEvidencePreflightArgs(argv) {
  const values = { rootDir: process.cwd(), requiredEvidence: "browser-e2e", fallbackEvidence: null };
  if (argv.length % 2 !== 0) return null;
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || seen.has(flag)) return null;
    seen.add(flag);
    if (flag === "--root") values.rootDir = value;
    else if (flag === "--required-evidence") values.requiredEvidence = value;
    else if (flag === "--fallback-evidence") values.fallbackEvidence = value;
    else return null;
  }
  return values;
}

export function main(argv = process.argv.slice(2)) {
  const parsed = parseBrowserEvidencePreflightArgs(argv);
  const result = parsed === null
    ? unavailable("BEP-INPUT-INVALID", "arguments must be complete, unique flag/value pairs")
    : preflightBrowserEvidence(parsed);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.exitCode;
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main();
