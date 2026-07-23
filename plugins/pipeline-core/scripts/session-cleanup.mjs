#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  WorktreeLifecycleError,
  canonicalJson,
  checkSessionHygiene,
  cleanupSession,
  finalizeTemporaryResource,
  loadSessionDescriptor,
  registerTemporaryIntent,
  retireSessionDescriptor,
  sealTemporaryResource,
  startSessionDescriptor,
} from "../lib/worktree-lifecycle.mjs";

const USAGE = `Usage:
  session-cleanup.mjs start --repo <checkout> [--session <safe-id>]
  session-cleanup.mjs register-intent --repo <checkout> (--session <id> | --session-descriptor <id> --expected-descriptor-sha256 <sha256>) --resource-id <id> --type <scratch-file|scratch-directory> --path <absolute> --content-class <scratch|disposable-control|generated-output> --policy <unlink-file|remove-directory>
  session-cleanup.mjs finalize --repo <checkout> (--session <id> | --session-descriptor <id> --expected-descriptor-sha256 <sha256>) --resource-id <id> [--canary <relative-file>]
  session-cleanup.mjs seal --repo <checkout> (--session <id> | --session-descriptor <id> --expected-descriptor-sha256 <sha256>) --resource-id <id>
  session-cleanup.mjs cleanup --repo <checkout> (--session <id> | --session-descriptor <id> --expected-descriptor-sha256 <sha256>)
  session-cleanup.mjs hygiene --repo <checkout> (--session <id> | --session-descriptor <id> --expected-descriptor-sha256 <sha256>)

Mutating commands require a local --session-descriptor or
PIPELINE_SESSION_OWNER_NONCE/--owner-nonce-file <0600-file>. Cleanup validates
the complete manifest before removing any target. Hygiene is read-only and emits
a redacted receipt.
`;
const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION_POWER_SCRIPT = join(HERE, "session-power.mjs");
const POWER_RESULT_KEYS = new Set(["schema", "operation", "sessionId", "status", "revision", "failureClass", "observedAt"]);

/**
 * The descriptor-bound cleanup command is the one narrow close pathway that
 * already owns this session's lifecycle.  Drain power here, before deleting
 * any temporary resource or retiring its descriptor.  It invokes only the
 * shipped CLI with the persisted descriptor tuple; unbound legacy cleanup
 * sessions deliberately have no authority to address a power record.
 */
function sessionPowerCommand(repo, session, operation) {
  if (!session.descriptorSha256) return { status: "disabled" };
  const result = spawnSync(process.execPath, [SESSION_POWER_SCRIPT, operation,
    "--session-id", session.sessionId,
    "--expected-descriptor-sha256", session.descriptorSha256], {
    cwd: repo,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024,
  });
  if (result.error || ![0, 3].includes(result.status)) {
    throw new WorktreeLifecycleError("WT-SESSION-POWER", "session-power command did not return a typed result");
  }
  let output;
  try { output = JSON.parse(String(result.stdout).trim()); } catch {
    throw new WorktreeLifecycleError("WT-SESSION-POWER", "session-power command returned malformed output");
  }
  if (!output || typeof output !== "object" || Array.isArray(output)
    || Object.keys(output).length !== POWER_RESULT_KEYS.size || Object.keys(output).some((key) => !POWER_RESULT_KEYS.has(key))
    || output.schema !== "pipeline.session-power-command-result.v1" || output.operation !== operation
    || output.sessionId !== session.sessionId
    || !new Set(["disabled", "unavailable", "starting", "active", "cleanup-pending", "stopped"]).has(output.status)
    || !Number.isSafeInteger(output.revision) || output.revision < 0
    || !(output.failureClass === null || typeof output.failureClass === "string")
    || typeof output.observedAt !== "string" || Number.isNaN(Date.parse(output.observedAt))) {
    throw new WorktreeLifecycleError("WT-SESSION-POWER", "session-power command returned an invalid result");
  }
  return output;
}

function drainSessionPower(repo, session) {
  if (!session.descriptorSha256) return;
  const recovered = sessionPowerCommand(repo, session, "recover");
  if (recovered.status === "cleanup-pending") {
    throw new WorktreeLifecycleError("WT-SESSION-POWER", "session-power recovery requires manual cleanup before session cleanup");
  }
  const stopped = sessionPowerCommand(repo, session, "stop");
  if (stopped.status === "cleanup-pending" || new Set(["starting", "active"]).has(stopped.status)) {
    throw new WorktreeLifecycleError("WT-SESSION-POWER", "session-power did not reach a closable state");
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!new Set(["start", "register-intent", "finalize", "seal", "cleanup", "hygiene"]).has(command)) throw new Error(USAGE);
  const flags = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(USAGE);
    const name = key.slice(2);
    if (name in flags) throw new Error(`Duplicate option: ${key}`);
    flags[name] = value;
  }
  const common = new Set(["repo", "session", "session-descriptor", "expected-descriptor-sha256", "owner-nonce-file"]);
  const extra = command === "register-intent" ? ["resource-id", "type", "path", "content-class", "policy"]
    : new Set(["finalize", "seal"]).has(command) ? ["resource-id", "canary"] : [];
  const allowed = command === "start" ? new Set(["repo", "session"]) : new Set([...common, ...extra]);
  for (const name of Object.keys(flags)) if (!allowed.has(name)) throw new Error(`Unknown option: --${name}`);
  return { command, flags };
}

function required(flags, name) {
  if (!flags[name]) throw new Error(`Missing --${name}\n${USAGE}`);
  return flags[name];
}

function ownerNonce(flags, env) {
  if (flags["owner-nonce-file"] && env.PIPELINE_SESSION_OWNER_NONCE) {
    throw new Error("Use either --owner-nonce-file or PIPELINE_SESSION_OWNER_NONCE, not both");
  }
  if (flags["owner-nonce-file"]) {
    const stat = lstatSync(flags["owner-nonce-file"]);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) {
      throw new Error("--owner-nonce-file must be a mode-0600 single-link regular file");
    }
    return readFileSync(flags["owner-nonce-file"], "utf8").trimEnd();
  }
  if (env.PIPELINE_SESSION_OWNER_NONCE) return env.PIPELINE_SESSION_OWNER_NONCE;
  throw new Error("Command requires --owner-nonce-file or PIPELINE_SESSION_OWNER_NONCE");
}

function sessionOwner(repo, flags, env) {
  const descriptorId = flags["session-descriptor"];
  if (descriptorId) {
    if (flags.session || flags["owner-nonce-file"] || env.PIPELINE_SESSION_OWNER_NONCE) {
      throw new Error("--session-descriptor cannot be combined with --session or an external owner nonce");
    }
    if (!flags["expected-descriptor-sha256"]) throw new Error("--session-descriptor requires --expected-descriptor-sha256");
    return loadSessionDescriptor(repo, descriptorId, { expectedDescriptorSha256: flags["expected-descriptor-sha256"] });
  }
  if (flags["expected-descriptor-sha256"]) throw new Error("--expected-descriptor-sha256 requires --session-descriptor");
  return { sessionId: required(flags, "session"), ownerNonce: ownerNonce(flags, env), descriptorSha256: null };
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const { command, flags } = parseArgs(argv);
  const repo = required(flags, "repo");
  let output;
  let exitCode = 0;
  if (command === "start") {
    const started = startSessionDescriptor(repo, { sessionId: flags.session });
    output = { ok: true, code: "WT-SESSION-STARTED", sessionId: started.sessionId, descriptorSha256: started.descriptorSha256 };
  } else if (command === "hygiene") {
    const session = flags["session-descriptor"] ? sessionOwner(repo, flags, env) : { sessionId: required(flags, "session") };
    output = checkSessionHygiene(repo, { sessionId: session.sessionId });
  } else {
    const session = sessionOwner(repo, flags, env);
    const nonce = session.ownerNonce;
    const ownedSessionId = session.sessionId;
    if (command === "register-intent") {
      const registered = registerTemporaryIntent(repo, {
        sessionId: ownedSessionId,
        ownerNonce: nonce,
        resourceId: required(flags, "resource-id"),
        type: required(flags, "type"),
        path: required(flags, "path"),
        contentClass: required(flags, "content-class"),
        soleCopy: false,
        cleanupPolicy: required(flags, "policy"),
      });
      output = { ok: true, code: "WT-TEMP-INTENT-REGISTERED", revision: registered.manifest.revision };
    } else if (command === "finalize") {
      const finalized = finalizeTemporaryResource(repo, {
        sessionId: ownedSessionId,
        ownerNonce: nonce,
        resourceId: required(flags, "resource-id"),
        canaryRelative: flags.canary,
      });
      output = { ok: true, code: "WT-TEMP-READY", revision: finalized.manifest.revision };
    } else if (command === "seal") {
      const sealed = sealTemporaryResource(repo, {
        sessionId: ownedSessionId,
        ownerNonce: nonce,
        resourceId: required(flags, "resource-id"),
      });
      output = { ok: true, code: "WT-TEMP-SEALED", revision: sealed.manifest.revision };
    } else {
      // Close's established descriptor-bound cleanup path drains the bounded
      // inhibitor first.  `cleanup-pending` aborts before touching manifest
      // resources or retiring the descriptor.
      if (command === "cleanup") drainSessionPower(repo, session);
      const cleanup = cleanupSession(repo, { sessionId: ownedSessionId, ownerNonce: nonce }, { allowAbsent: session.descriptorSha256 !== null });
      output = cleanup.receipt;
      if (cleanup.ok && session.descriptorSha256) {
        retireSessionDescriptor(repo, { sessionId: ownedSessionId, ownerNonce: nonce, descriptorSha256: session.descriptorSha256 });
      }
      if (!cleanup.ok) exitCode = 2;
    }
  }
  process.stdout.write(canonicalJson(output));
  return exitCode || (output.ok === false ? 2 : 0);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    const code = error instanceof WorktreeLifecycleError ? error.code : "WT-ARGUMENT";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
