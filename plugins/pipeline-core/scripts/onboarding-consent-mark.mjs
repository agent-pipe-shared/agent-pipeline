#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

import {
  ONBOARDING_CONSENT_COVERED_STEPS,
  ONBOARDING_CONSENT_MARK_SCHEMA_V1,
  ONBOARDING_CONSENT_MARK_SCHEMA_V2,
  ONBOARDING_CONSENT_NOT_COVERED,
  ONBOARDING_CONSENT_QUOTE_MAX,
} from "../lib/onboarding-consent-scope.mjs";

// G20-45: the record is schema v2 -- it additionally carries the scope the question named and a bounded verbatim quote of
// the user's answer. A v1 record (no scope) stays readable (lib/onboarding-consent-scope.mjs) but covers nothing.
export const ONBOARDING_CONSENT_MARK_SCHEMA = ONBOARDING_CONSENT_MARK_SCHEMA_V2;
export { ONBOARDING_CONSENT_MARK_SCHEMA_V1 };

export function onboardingConsentMarkerPath(rootDir, sessionId) {
  if (typeof rootDir !== "string" || typeof sessionId !== "string" || sessionId === "") {
    throw new Error("rootDir and a non-empty sessionId are required");
  }
  return join(resolve(rootDir), ".claude", `.pipeline-install-consent-${sessionId}.json`);
}

function writeAtomic(path, bytes) {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}

function boundedQuote(quote) {
  if (typeof quote !== "string") return null;
  const flat = quote.replace(/[\u0000-\u001f\u007f]+/gu, " ").trim();
  return flat === "" ? null : Array.from(flat).slice(0, ONBOARDING_CONSENT_QUOTE_MAX).join("");
}

export function recordOnboardingConsent(rootDir, sessionId, answer, now = new Date().toISOString(), quote = null) {
  if (answer !== "yes" && answer !== "no") throw new Error("answer must be yes or no");
  const markerPath = onboardingConsentMarkerPath(rootDir, sessionId);
  const record = {
    schema: ONBOARDING_CONSENT_MARK_SCHEMA,
    sessionId,
    answer,
    recordedAt: now,
    // A "no" covers nothing; a "yes" covers exactly the steps the question named.
    scope: answer === "yes" ? ONBOARDING_CONSENT_COVERED_STEPS.map((step) => step.id) : [],
    notCovered: answer === "yes" ? ONBOARDING_CONSENT_NOT_COVERED.map((step) => step.id) : [],
    quote: boundedQuote(quote),
  };
  writeAtomic(markerPath, `${JSON.stringify(record)}\n`);
  return { markerPath, record };
}

function parseArgs(argv) {
  if (argv[0] !== "record") throw new Error("usage: record --root <root> --session-id <id> --answer yes|no [--quote <the user's answer, verbatim>]");
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("invalid arguments");
    values[key.slice(2)] = value;
  }
  if (!values.root || !values["session-id"] || !values.answer) throw new Error("missing required argument");
  return values;
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = recordOnboardingConsent(args.root, args["session-id"], args.answer, undefined, args.quote);
    process.stdout.write(`${JSON.stringify(result.record)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
