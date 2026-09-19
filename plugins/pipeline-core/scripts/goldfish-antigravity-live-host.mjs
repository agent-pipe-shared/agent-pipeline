#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Explicit live AGY implementation host.  This is intentionally separate from
 * the E3 fixture host: it discovers the already-installed local CLI, while the
 * session-dispatch library owns consent, candidate binding and result safety.
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverAgyPath } from "../lib/antigravity-execution-host.mjs";
import { dispatchAgySession } from "../lib/agy-session-dispatch.mjs";

export const LIVE_REQUEST_SCHEMA = "pipeline.agy-session-live-request.v1";

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function readRequest(path) {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(absolute) !== absolute || stat.size > 2 * 1024 * 1024) throw new Error("request is not a bounded physical file");
  return JSON.parse(readFileSync(absolute, "utf8"));
}

export async function runGoldfishAntigravityLiveHost(request, dependencies = {}) {
  const keys = ["schema", "root", "resultRoot", "resultPath", "packet", "session", "consent", "requestedModel", "effort", "scope", "inputSha256", "timeoutMs"];
  if (!exact(request, keys) || request.schema !== LIVE_REQUEST_SCHEMA) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-LIVE-REQUEST-SHAPE", modelCalls: 0, launcherCalls: 0 };
  const agyPath = dependencies.agyPath ?? discoverAgyPath(dependencies.env ?? process.env);
  if (!agyPath) return { schema: LIVE_REQUEST_SCHEMA, status: "unavailable", code: "AGY-NOT-INSTALLED", modelCalls: 0, launcherCalls: 0 };
  return dispatchAgySession({ ...request, agyPath, env: dependencies.env ?? process.env, nowEpochMs: dependencies.nowEpochMs ?? Date.now(), signal: dependencies.signal });
}

export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== "--request" || typeof argv[1] !== "string" || argv[1].trim() === "") throw new Error("usage: goldfish-antigravity-live-host.mjs --request <sealed-request.json>");
  return argv[1];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runGoldfishAntigravityLiveHost(readRequest(parseArgs(process.argv.slice(2))));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "succeeded" ? 0 : 1;
  } catch {
    process.stderr.write("goldfish-antigravity-live-host: request refused\n");
    process.exitCode = 64;
  }
}
