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

export const ONBOARDING_CONSENT_MARK_SCHEMA = "pipeline.onboarding-consent-mark.v1";

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

export function recordOnboardingConsent(rootDir, sessionId, answer, now = new Date().toISOString()) {
  if (answer !== "yes" && answer !== "no") throw new Error("answer must be yes or no");
  const markerPath = onboardingConsentMarkerPath(rootDir, sessionId);
  const record = {
    schema: ONBOARDING_CONSENT_MARK_SCHEMA,
    sessionId,
    answer,
    recordedAt: now,
  };
  writeAtomic(markerPath, `${JSON.stringify(record)}\n`);
  return { markerPath, record };
}

function parseArgs(argv) {
  if (argv[0] !== "record") throw new Error("usage: record --root <root> --session-id <id> --answer yes|no");
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

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = recordOnboardingConsent(args.root, args["session-id"], args.answer);
    process.stdout.write(`${JSON.stringify(result.record)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
