#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const INPUT_SCHEMA = Object.freeze({
  schema: "pipeline.capture-observation-input.v1",
  requiredKeys: Object.freeze([
    "schema",
    "title",
    "area",
    "actual",
    "expected",
    "reproduction",
    "frequency",
    "environment",
    "evidence",
    "sourceBacklogLinks",
    "securityAssessment",
    "availableLabels",
  ]),
  environmentKeys: Object.freeze([
    "runner",
    "pluginVersion",
    "pipelineVersion",
    "candidate",
    "os",
    "capability",
  ]),
  areas: Object.freeze([
    "advisory",
    "afk",
    "bootstrap",
    "docs",
    "guardrails",
    "lifecycle",
    "review",
    "routing",
    "runners",
    "sandbox",
    "telemetry",
    "tooling",
    "verify",
    "other",
  ]),
  frequencies: Object.freeze(["always", "frequent", "intermittent", "once", "unknown"]),
  runners: Object.freeze(["claude-code", "codex", "other", "unknown"]),
  operatingSystems: Object.freeze(["linux", "macos", "windows", "wsl", "other", "unknown"]),
  securityAssessments: Object.freeze(["cleared", "possible-vulnerability"]),
});

const UNKNOWN = "unknown";
const OMITTED = "omitted";
const PUBLIC_VERSION = /^(?:unknown|[A-Za-z0-9][A-Za-z0-9._+-]{0,79})$/;
const PUBLIC_CAPABILITY = /^(?:unknown|[A-Za-z0-9][A-Za-z0-9 ._:/+-]{0,119})$/;
const CANDIDATE = /^(?:unknown|[0-9a-f]{7,40})$/;
const SOURCE_LINK = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:blob|issues|pull)\/.+$/;

const SECRET_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/,
  /\b(?:Authorization:\s*)?Bearer\s+\S+/i,
  /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/i,
]);

const FORBIDDEN_TRANSCRIPT_PATTERNS = Object.freeze([
  /<\/?system>/i,
  /\bsystem prompt\b/i,
  /\bchat history\b/i,
  /\bconversation transcript\b/i,
  /\braw logs?\b/i,
  /^\s*(?:stdout|stderr)\s*:/im,
  /^\s*Traceback \(most recent call last\)/m,
  /^\s*at\s+\S+\s+\(.+:\d+:\d+\)/m,
  /^\s*\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/m,
]);

function result(status, extra = {}) {
  return { schema: "pipeline.capture-observation-result.v1", status, ...extra };
}

export const CLI_INPUT_FAILURE = Object.freeze(result("invalid-input", {
  code: "CO-INPUT-UNREADABLE-OR-MALFORMED",
}));

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function exactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const actual = sorted(Object.keys(value));
  const wanted = sorted(expected);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${path} keys must be exactly: ${wanted.join(", ")}`);
  }
}

function boundedString(value, path, { min = 1, max = 4000, singleLine = false } = {}) {
  if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new TypeError(`${path} length must be ${min}-${max}`);
  }
  if (singleLine && /[\r\n]/.test(normalized)) throw new TypeError(`${path} must be one line`);
  return normalized;
}

function enumValue(value, choices, path) {
  if (!choices.includes(value)) throw new TypeError(`${path} must be one of: ${choices.join(", ")}`);
  return value;
}

function allStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

function rejectionReason(input) {
  const strings = allStrings(input);
  if (strings.some((value) => SECRET_PATTERNS.some((pattern) => pattern.test(value)))) {
    return "secret-like-content";
  }
  if (strings.some((value) => FORBIDDEN_TRANSCRIPT_PATTERNS.some((pattern) => pattern.test(value)))) {
    return "prompt-chat-or-raw-log-content";
  }
  if (input.evidence.length > 2000 || input.evidence.split(/\r?\n/).length > 20) {
    return "evidence-exceeds-sanitized-boundary";
  }
  return null;
}

function redact(value, field, redactions) {
  let output = value;
  const replacements = [
    { code: "private-remote", pattern: /\b(?:git@[^\s:]+:[^\s]+|ssh:\/\/\S+)\b/g, replacement: "<redacted-private-remote>" },
    { code: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "<redacted-email>" },
    { code: "posix-home", pattern: /\/(?:home|Users)\/[^/\s]+/g, replacement: "/home/<redacted>" },
    { code: "windows-home", pattern: /[A-Za-z]:\\Users\\[^\\\s]+/g, replacement: "C:\\Users\\<redacted>" },
    { code: "private-network", pattern: /\b(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d+)?\b/gi, replacement: "<redacted-private-network>" },
    { code: "hostname", pattern: /\b(hostname|host)\s*[:=]\s*[^\s,;]+/gi, replacement: "$1=<redacted-host>" },
    { code: "username", pattern: /\b(user(?:name)?)\s*[:=]\s*[^\s,;]+/gi, replacement: "$1=<redacted-user>" },
  ];
  for (const entry of replacements) {
    const next = output.replace(entry.pattern, entry.replacement);
    if (next !== output) redactions.push(`${field}:${entry.code}`);
    output = next;
  }
  return output;
}

export function requiredInitialLabels(area) {
  enumValue(area, INPUT_SCHEMA.areas, "area");
  return ["kind:observation", "triage:needs-review", `area:${area}`];
}

export function evaluateInitialLabels(area, availableLabels) {
  if (!Array.isArray(availableLabels) || availableLabels.some((label) => typeof label !== "string")) {
    throw new TypeError("availableLabels must be an array of strings");
  }
  const requiredLabels = requiredInitialLabels(area);
  const available = new Set(availableLabels);
  const missingLabels = requiredLabels.filter((label) => !available.has(label));
  return missingLabels.length
    ? result("setup-required", { requiredLabels, missingLabels })
    : result("ready", { requiredLabels, missingLabels: [] });
}

export function validateInput(input) {
  exactKeys(input, INPUT_SCHEMA.requiredKeys, "input");
  if (input.schema !== INPUT_SCHEMA.schema) throw new TypeError(`schema must be ${INPUT_SCHEMA.schema}`);
  boundedString(input.title, "title", { min: 8, max: 160, singleLine: true });
  enumValue(input.area, INPUT_SCHEMA.areas, "area");
  boundedString(input.actual, "actual");
  boundedString(input.expected, "expected");
  boundedString(input.reproduction, "reproduction");
  enumValue(input.frequency, INPUT_SCHEMA.frequencies, "frequency");
  exactKeys(input.environment, INPUT_SCHEMA.environmentKeys, "environment");
  enumValue(input.environment.runner, INPUT_SCHEMA.runners, "environment.runner");
  enumValue(input.environment.os, INPUT_SCHEMA.operatingSystems, "environment.os");
  for (const key of ["pluginVersion", "pipelineVersion"]) {
    if (typeof input.environment[key] !== "string" || !PUBLIC_VERSION.test(input.environment[key])) {
      throw new TypeError(`environment.${key} must be unknown or a public-safe version token`);
    }
  }
  if (typeof input.environment.candidate !== "string" || !CANDIDATE.test(input.environment.candidate)) {
    throw new TypeError("environment.candidate must be unknown or a 7-40 character lowercase Git SHA");
  }
  if (typeof input.environment.capability !== "string" || !PUBLIC_CAPABILITY.test(input.environment.capability)) {
    throw new TypeError("environment.capability must be unknown or a public-safe typed status");
  }
  boundedString(input.evidence, "evidence", { max: 10000 });
  if (!Array.isArray(input.sourceBacklogLinks) || input.sourceBacklogLinks.length > 10) {
    throw new TypeError("sourceBacklogLinks must be an array with at most 10 entries");
  }
  for (const link of input.sourceBacklogLinks) {
    if (typeof link !== "string" || !SOURCE_LINK.test(link)) {
      throw new TypeError("sourceBacklogLinks entries must be public GitHub blob, issue, or pull URLs");
    }
  }
  enumValue(input.securityAssessment, INPUT_SCHEMA.securityAssessments, "securityAssessment");
  if (!Array.isArray(input.availableLabels) || input.availableLabels.some((label) => typeof label !== "string")) {
    throw new TypeError("availableLabels must be an array of strings");
  }
  return input;
}

function environmentLines(environment) {
  return [
    `- Runner: ${environment.runner}`,
    `- Plugin version: ${environment.pluginVersion}`,
    `- Pipeline version: ${environment.pipelineVersion}`,
    `- Candidate: ${environment.candidate}`,
    `- OS: ${environment.os}`,
    `- Capability: ${environment.capability}`,
  ];
}

export function renderCanonicalBody(input) {
  const sourceLinks = input.sourceBacklogLinks.length
    ? input.sourceBacklogLinks.map((link) => `- ${link}`)
    : ["- None identified."];
  return [
    "## Area",
    "",
    input.area,
    "",
    "## Actual behavior",
    "",
    input.actual,
    "",
    "## Expected behavior",
    "",
    input.expected,
    "",
    "## Reproduction",
    "",
    input.reproduction,
    "",
    "## Frequency",
    "",
    input.frequency,
    "",
    "## Observed environment",
    "",
    ...environmentLines(input.environment),
    "",
    "## Sanitized evidence",
    "",
    input.evidence,
    "",
    "## Source backlog links",
    "",
    ...sourceLinks,
    "",
  ].join("\n");
}

export function prepareObservation(untrustedInput) {
  let input;
  try {
    input = validateInput(untrustedInput);
  } catch (error) {
    return result("invalid-input", { reason: error.message });
  }

  if (input.securityAssessment === "possible-vulnerability") {
    return result("private-routing-required", { reason: "possible-vulnerability" });
  }

  const rejection = rejectionReason(input);
  if (rejection) return result("privacy-rejected", { reason: rejection });

  const labelStatus = evaluateInitialLabels(input.area, input.availableLabels);
  if (labelStatus.status !== "ready") return labelStatus;

  const redactions = [];
  const sanitized = {
    ...input,
    title: redact(input.title, "title", redactions),
    actual: redact(input.actual, "actual", redactions),
    expected: redact(input.expected, "expected", redactions),
    reproduction: redact(input.reproduction, "reproduction", redactions),
    evidence: redact(input.evidence, "evidence", redactions),
    environment: Object.fromEntries(Object.entries(input.environment).map(([key, value]) => [key, redact(value, `environment.${key}`, redactions)])),
  };

  return result("ready", {
    title: sanitized.title,
    body: renderCanonicalBody(sanitized),
    labels: labelStatus.requiredLabels,
    redactions: [...new Set(redactions)].sort(),
  });
}

async function readInput(argv, readFileFn) {
  if (argv.length === 1 && argv[0] === "--schema") return { printSchema: true };
  if (argv.length > 1) throw new TypeError("usage: observation-intake.mjs [INPUT.json] | --schema");
  const bytes = argv[0] ? await readFileFn(argv[0], "utf8") : await readFileFn(0, "utf8");
  return { input: JSON.parse(bytes) };
}

export async function runCli(argv, {
  readFileFn = readFile,
  writeStdout = (value) => process.stdout.write(value),
} = {}) {
  try {
    const command = await readInput(argv, readFileFn);
    if (command.printSchema) {
      writeStdout(serialized(INPUT_SCHEMA));
      return 0;
    }
    const output = prepareObservation(command.input);
    writeStdout(serialized(output));
    return output.status === "ready" ? 0 : 2;
  } catch {
    writeStdout(serialized(CLI_INPUT_FAILURE));
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}

export const SENTINELS = Object.freeze({ UNKNOWN, OMITTED });
