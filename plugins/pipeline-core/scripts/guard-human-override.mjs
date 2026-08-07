#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  authorizeHumanGuardOverride,
  authorizeHumanGuardOverrideBySignature,
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
    "  guard-human-override.mjs plan --repo <absolute-root> --request-sha256 <64hex> [--author-source-root <absolute-root>]",
    "  guard-human-override.mjs prepare-authorization --repo <absolute-root> --request-sha256 <64hex> --plan-sha256 <64hex> --reason <text> [--author-source-root <absolute-root>]",
    "  guard-human-override.mjs authorize --repo <absolute-root> --request-sha256 <64hex> --plan-sha256 <64hex> --selection-sha256 <64hex> --reason <text> --reason-sha256 <64hex> [--author-source-root <absolute-root>] --activate",
    "  guard-human-override.mjs authorize-by-signature --repo <absolute-root> --request-sha256 <64hex> --plan-sha256 <64hex> --proof <external-public-json> [--authority <external-public-json>] [--author-source-root <absolute-root>]",
    "  guard-human-override.mjs verify-audit --repo <absolute-root>",
  ].join("\n");
}

/**
 * ADR-0059 Decision 1: `path` must be supplied OUTSIDE the repository -- genuinely
 * external, human-produced material -- mirroring guard-maintenance-window.mjs's own
 * `externalJson()` discipline for `--proof`/`--authority`. This CLI contains no
 * signer and accepts no private-key material; a proof is either genuine (produced by
 * an external signing step) or it fails verification, never fabricated here.
 */
function externalJson(repoRoot, path) {
  const root = resolve(repoRoot);
  const source = resolve(path);
  if (source === root || source.startsWith(`${root}/`)) {
    throw new Error("--proof and --authority must be supplied outside the repository");
  }
  return JSON.parse(readFileSync(source, "utf8"));
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

function exactFlagSet(value, required, optional = []) {
  if (!value || !required.every((key) => Object.hasOwn(value, key))) return false;
  const allowed = new Set([...required, ...optional]);
  return Object.keys(value).every((key) => allowed.has(key));
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
      if (!exactFlagSet(parsed, ["repo", "request-sha256"], ["author-source-root"])
        || typeof parsed.repo !== "string"
        || !SHA256.test(parsed["request-sha256"] ?? "")) throw new Error(usage());
      if (Object.hasOwn(parsed, "author-source-root") && typeof parsed["author-source-root"] !== "string") throw new Error(usage());
      write(`${JSON.stringify(planHumanGuardOverride({
        rootDir: parsed.repo,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: parsed["request-sha256"],
        scriptPath: SCRIPT,
        authorSourceRoot: parsed["author-source-root"] ?? null,
      }), null, 2)}\n`);
      return 0;
    }
    if (command === "prepare-authorization") {
      const parsed = flags(rest);
      if (!exactFlagSet(parsed, ["repo", "request-sha256", "plan-sha256", "reason"], ["author-source-root"])
        || typeof parsed.repo !== "string"
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
        authorSourceRoot: parsed["author-source-root"] ?? null,
      }), null, 2)}\n`);
      return 0;
    }
    if (command === "authorize") {
      if (rest.at(-1) !== "--activate") throw new Error(usage());
      const parsed = flags(rest.slice(0, -1));
      if (!exactFlagSet(parsed, [
        "repo", "request-sha256", "plan-sha256", "selection-sha256", "reason", "reason-sha256",
      ], ["author-source-root"]) || typeof parsed.repo !== "string"
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
        authorSourceRoot: parsed["author-source-root"] ?? null,
      }))}\n`);
      return 0;
    }
    if (command === "authorize-by-signature") {
      const parsed = flags(rest);
      if (!exactFlagSet(parsed, ["repo", "request-sha256", "plan-sha256", "proof"], ["author-source-root", "authority"])
        || typeof parsed.repo !== "string"
        || !SHA256.test(parsed["request-sha256"] ?? "")
        || !SHA256.test(parsed["plan-sha256"] ?? "")
        || typeof parsed.proof !== "string") throw new Error(usage());
      if (Object.hasOwn(parsed, "author-source-root") && typeof parsed["author-source-root"] !== "string") throw new Error(usage());
      if (Object.hasOwn(parsed, "authority") && typeof parsed.authority !== "string") throw new Error(usage());
      const proof = externalJson(parsed.repo, parsed.proof);
      const trustPolicy = Object.hasOwn(parsed, "authority") ? externalJson(parsed.repo, parsed.authority) : null;
      write(`${JSON.stringify(authorizeHumanGuardOverrideBySignature({
        rootDir: parsed.repo,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: parsed["request-sha256"],
        planSha256: parsed["plan-sha256"],
        proof,
        trustPolicy,
        scriptPath: SCRIPT,
        authorSourceRoot: parsed["author-source-root"] ?? null,
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
