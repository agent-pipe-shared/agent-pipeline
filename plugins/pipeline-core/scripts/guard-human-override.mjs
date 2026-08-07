#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { readFileSync } from "node:fs";
import { dirname, posix as posixPath, resolve, win32 as win32Path } from "node:path";
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
    "  guard-human-override.mjs authorize-by-signature --repo <absolute-root> --request-sha256 <64hex> --plan-sha256 <64hex> --proof <external-public-json> [--author-source-root <absolute-root>]",
    "  guard-human-override.mjs verify-audit --repo <absolute-root>",
  ].join("\n");
}

/**
 * ADR-0059 Decision 1: `path` must be supplied OUTSIDE the repository -- genuinely
 * external, human-produced material -- mirroring guard-maintenance-window.mjs's own
 * `externalJson()` discipline for `--proof`. This CLI contains no signer and accepts
 * no private-key material; a proof is either genuine (produced by an external signing
 * step) or it fails verification, never fabricated here.
 *
 * WHY THE SEPARATOR IS NOT HARD-CODED. The previous test was
 * `source === root || source.startsWith(`${root}/`)`, which is inert on win32:
 * `resolve()` returns backslash-separated paths there, so only exact equality with the
 * root was ever caught and any in-repository path -- including an agent-writable one --
 * was accepted as "external". ADR-0051/ADR-0057 make native Windows a hard
 * implementation obligation, so a POSIX-only separator here is a defect, not a nuance.
 * `relative()` is the separator-correct test on both flavours and additionally folds
 * case on win32, where `C:\Repo` and `c:\repo` are the same directory and a
 * `startsWith` comparison is bypassable by retyping the drive letter. Same shape as
 * lib/human-guard-override.mjs's `safePath()`, which already normalizes this way.
 *
 * `platform` is injected rather than read from `process.platform` so the win32
 * behaviour is provable on either host, exactly as the sibling guard suites drive
 * their own `{ platform: "win32" }` option.
 */
function externalJson(repoRoot, path, platform = process.platform) {
  const api = platform === "win32" ? win32Path : posixPath;
  const root = api.resolve(repoRoot);
  const source = api.resolve(path);
  const rel = api.relative(root, source).split("\\").join("/");
  const outside = rel === ".." || rel.startsWith("../") || api.isAbsolute(rel);
  if (!outside) throw new Error("--proof must be supplied outside the repository");
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

export function main(argv = process.argv.slice(2), io = {}, options = {}) {
  const write = io.write ?? process.stdout.write.bind(process.stdout);
  const writeError = io.writeError ?? process.stderr.write.bind(process.stderr);
  const platform = options.platform ?? process.platform;
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
    // ADR-0059 Decision 1 fixes the trust anchor at the project's own COMMITTED
    // `project/critical-human-proof.json`, and calls this subcommand agent-safe because it
    // "cannot succeed without a genuine signature it is structurally incapable of
    // producing". A `--authority` flag contradicted exactly that: the only thing the
    // caller could not fabricate was a signature under the committed key, and the flag let
    // the caller replace the committed key with one it had just generated -- a full HGO
    // bypass, not a partial one, which is the risk ADR-0059's own Consequences section
    // names. It is therefore not accepted at all; `trustPolicy` is left unset so
    // authorizeHumanGuardOverrideBySignature() resolves the committed anchor itself and
    // fails closed (HGO-TRUST-ANCHOR-MISSING) when the project has none.
    //
    // Removed rather than "kept but required to match the committed anchor": a flag whose
    // only admissible value is the value already used by default carries no capability,
    // while keeping it would leave a caller-supplied-trust-anchor code path alive and would
    // force guard-lifecycle-ready.mjs to admit a second arbitrary path word in a
    // GUARD-LIFECYCLE-NOT-READY session. No in-tree caller supplied it (the sole one was a
    // test asserting the defect). guard-maintenance-window.mjs's own `--authority` is
    // untouched: it is pre-existing, scoped to one time-boxed window over an explicit rule
    // set, and out of this change's scope.
    if (command === "authorize-by-signature") {
      const parsed = flags(rest);
      if (!exactFlagSet(parsed, ["repo", "request-sha256", "plan-sha256", "proof"], ["author-source-root"])
        || typeof parsed.repo !== "string"
        || !SHA256.test(parsed["request-sha256"] ?? "")
        || !SHA256.test(parsed["plan-sha256"] ?? "")
        || typeof parsed.proof !== "string") throw new Error(usage());
      if (Object.hasOwn(parsed, "author-source-root") && typeof parsed["author-source-root"] !== "string") throw new Error(usage());
      const proof = externalJson(parsed.repo, parsed.proof, platform);
      write(`${JSON.stringify(authorizeHumanGuardOverrideBySignature({
        rootDir: parsed.repo,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: parsed["request-sha256"],
        planSha256: parsed["plan-sha256"],
        proof,
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
