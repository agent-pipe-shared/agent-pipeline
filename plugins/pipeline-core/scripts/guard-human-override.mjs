#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  authorizeHumanGuardOverride,
  HumanGuardOverrideError,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  verifyHumanGuardOverrideAudit,
} from "../lib/human-guard-override.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const PLUGIN_ROOT = resolve(dirname(SCRIPT), "..");
const SHA256 = /^[a-f0-9]{64}$/u;

function usage() {
  return [
    "Usage:",
    "  guard-human-override.mjs plan --repo <absolute-root> --request-sha256 <64hex>",
    "  guard-human-override.mjs prepare-authorization --repo <absolute-root> --request-sha256 <64hex> --plan-sha256 <64hex> --reason <text>",
    "  guard-human-override.mjs authorize --repo <absolute-root> --request-sha256 <64hex> --plan-sha256 <64hex> --selection-sha256 <64hex> --reason <text> --reason-sha256 <64hex> --activate",
    "  guard-human-override.mjs verify-audit --repo <absolute-root>",
  ].join("\n");
}

function flags(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--") || index + 1 >= argv.length || Object.hasOwn(result, key.slice(2))) return null;
    result[key.slice(2)] = argv[index + 1];
  }
  return result;
}

export function main(argv = process.argv.slice(2), io = {}) {
  const write = io.write ?? process.stdout.write.bind(process.stdout);
  const writeError = io.writeError ?? process.stderr.write.bind(process.stderr);
  const [command, ...rest] = argv;
  try {
    if (command === "verify-audit") {
      const parsed = flags(rest);
      if (!parsed || Object.keys(parsed).length !== 1 || typeof parsed.repo !== "string") throw new Error(usage());
      write(`${JSON.stringify(verifyHumanGuardOverrideAudit({ rootDir: parsed.repo }))}\n`);
      return 0;
    }
    if (command === "plan") {
      const parsed = flags(rest);
      if (!parsed || Object.keys(parsed).length !== 2 || typeof parsed.repo !== "string"
        || !SHA256.test(parsed["request-sha256"] ?? "")) throw new Error(usage());
      write(`${JSON.stringify(planHumanGuardOverride({
        rootDir: parsed.repo,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: parsed["request-sha256"],
        scriptPath: SCRIPT,
      }), null, 2)}\n`);
      return 0;
    }
    if (command === "prepare-authorization") {
      const parsed = flags(rest);
      if (!parsed || Object.keys(parsed).length !== 4 || typeof parsed.repo !== "string"
        || !SHA256.test(parsed["request-sha256"] ?? "")
        || !SHA256.test(parsed["plan-sha256"] ?? "")
        || typeof parsed.reason !== "string" || parsed.reason.trim() === "") throw new Error(usage());
      write(`${JSON.stringify(prepareHumanGuardOverrideAuthorization({
        rootDir: parsed.repo,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: parsed["request-sha256"],
        planSha256: parsed["plan-sha256"],
        reason: parsed.reason,
        scriptPath: SCRIPT,
      }), null, 2)}\n`);
      return 0;
    }
    if (command === "authorize") {
      if (rest.at(-1) !== "--activate") throw new Error(usage());
      const parsed = flags(rest.slice(0, -1));
      if (!parsed || Object.keys(parsed).length !== 6 || typeof parsed.repo !== "string"
        || !SHA256.test(parsed["request-sha256"] ?? "")
        || !SHA256.test(parsed["plan-sha256"] ?? "")
        || !SHA256.test(parsed["selection-sha256"] ?? "")
        || !SHA256.test(parsed["reason-sha256"] ?? "")
        || typeof parsed.reason !== "string" || parsed.reason.trim() === "") throw new Error(usage());
      write(`${JSON.stringify(authorizeHumanGuardOverride({
        rootDir: parsed.repo,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: parsed["request-sha256"],
        planSha256: parsed["plan-sha256"],
        selectionSha256: parsed["selection-sha256"],
        reason: parsed.reason,
        reasonSha256: parsed["reason-sha256"],
        activate: true,
        scriptPath: SCRIPT,
      }))}\n`);
      return 0;
    }
    throw new Error(usage());
  } catch (error) {
    const code = error instanceof HumanGuardOverrideError ? error.code : "HGO-USAGE";
    writeError(`${code}: ${error.message}\n`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT) {
  process.exitCode = main();
}
