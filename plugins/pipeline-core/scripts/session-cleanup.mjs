#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import {
  KickoffError,
  applyOnboardingSessionCleanupPrivatization,
  bindOnboardingSessionCleanup,
  planOnboardingSessionCleanupPrivatization,
  readOnboardingSessionCleanupBinding,
  releaseOnboardingSessionCleanup,
} from "../lib/onboarding-continuity.mjs";
import {
  SessionCleanupRecoveryError,
  applySessionCleanupRecovery,
  planSessionCleanupRecovery,
} from "../lib/session-cleanup-recovery.mjs";
import {
  WorktreeLifecycleError,
  canonicalJson,
  checkSessionHygiene,
  cleanupSession,
  finalizeTemporaryResource,
  inspectSessionClosure,
  inspectSessionOwnerRuntime,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
  registerTemporaryIntent,
  retireSessionDescriptor,
  sealTemporaryResource,
  startSessionDescriptor,
} from "../lib/worktree-lifecycle.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";

const USAGE = `Usage:
  session-cleanup.mjs start --repo <checkout> [--session <safe-id>]
  session-cleanup.mjs status --repo <checkout>
  session-cleanup.mjs release-binding --repo <checkout>
  session-cleanup.mjs plan-privatization --repo <checkout>
  session-cleanup.mjs apply-privatization --repo <checkout> --plan-sha256 <sha256> --activate
  session-cleanup.mjs plan-recovery --repo <checkout>
  session-cleanup.mjs apply-recovery --repo <checkout> --plan-sha256 <sha256> --activate
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
  if (!new Set([
    "start", "status", "release-binding", "plan-privatization", "apply-privatization",
    "plan-recovery", "apply-recovery",
    "register-intent", "finalize", "seal", "cleanup", "hygiene",
  ]).has(command)) throw new Error(USAGE);
  const flags = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    if (key === "--activate") {
      if (flags.activate === true) throw new Error("Duplicate option: --activate");
      flags.activate = true;
      index -= 1;
      continue;
    }
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(USAGE);
    const name = key.slice(2);
    if (name in flags) throw new Error(`Duplicate option: ${key}`);
    flags[name] = value;
  }
  const common = new Set(["repo", "session", "session-descriptor", "expected-descriptor-sha256", "owner-nonce-file"]);
  const extra = command === "register-intent" ? ["resource-id", "type", "path", "content-class", "policy"]
    : new Set(["finalize", "seal"]).has(command) ? ["resource-id", "canary"] : [];
  const allowed = command === "start" ? new Set(["repo", "session"])
    : new Set(["status", "release-binding"]).has(command) ? new Set(["repo"])
      : new Set(["plan-recovery", "plan-privatization"]).has(command) ? new Set(["repo"])
        : new Set(["apply-recovery", "apply-privatization"]).has(command) ? new Set(["repo", "plan-sha256", "activate"])
      : new Set([...common, ...extra]);
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

export function main(argv = process.argv.slice(2), env = process.env, dependencies = {}) {
  const { command, flags } = parseArgs(argv);
  const repo = required(flags, "repo");
  const requireReady = dependencies.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady;
  const startDescriptor = dependencies.startSessionDescriptorFn ?? startSessionDescriptor;
  const checkHygiene = dependencies.checkSessionHygieneFn ?? checkSessionHygiene;
  const write = dependencies.writeFn ?? ((value) => process.stdout.write(value));
  let output;
  let exitCode = 0;
  if (command === "status") {
    const listDescriptors = dependencies.listActiveSessionDescriptorsFn
      ?? listActiveSessionDescriptors;
    const inspectOwnerRuntime = dependencies.inspectSessionOwnerRuntimeFn
      ?? inspectSessionOwnerRuntime;
    const descriptors = listDescriptors(repo).map((descriptor) => {
      const observed = inspectOwnerRuntime(repo, descriptor.sessionId, {
        expectedDescriptorSha256: descriptor.descriptorSha256,
      });
      if (!observed || typeof observed !== "object" || Array.isArray(observed)
        || observed.schema !== "pipeline.session-owner-status.v1"
        || observed.sessionId !== descriptor.sessionId
        || observed.descriptorSha256 !== descriptor.descriptorSha256
        || !new Set(["live", "not-live", "reused", "unavailable", "unobserved"]).has(observed.status)) {
        throw new WorktreeLifecycleError("WT-SESSION-OWNER-STATUS", "session owner status readback is invalid");
      }
      return {
        sessionId: observed.sessionId,
        descriptorSha256: observed.descriptorSha256,
        status: observed.status,
      };
    });
    output = {
      schema: "pipeline.session-cleanup-status.v1",
      status: "observed",
      descriptors,
    };
  } else if (command === "plan-recovery") {
    output = planSessionCleanupRecovery({ rootDir: repo });
  } else if (command === "apply-recovery") {
    output = applySessionCleanupRecovery({
      rootDir: repo,
      expectedPlanSha256: required(flags, "plan-sha256"),
      activate: flags.activate === true,
    });
  } else if (command === "plan-privatization") {
    const planPrivatization = dependencies.planOnboardingSessionCleanupPrivatizationFn
      ?? planOnboardingSessionCleanupPrivatization;
    output = planPrivatization({ rootDir: repo });
  } else if (command === "apply-privatization") {
    const applyPrivatization = dependencies.applyOnboardingSessionCleanupPrivatizationFn
      ?? applyOnboardingSessionCleanupPrivatization;
    output = applyPrivatization({
      rootDir: repo,
      expectedPlanSha256: required(flags, "plan-sha256"),
      activate: flags.activate === true,
    });
  } else if (command === "start") {
    requireReady({ rootDir: repo, intent: "session" });
    const readBinding = dependencies.readOnboardingSessionCleanupBindingFn
      ?? readOnboardingSessionCleanupBinding;
    const bindCleanup = dependencies.bindOnboardingSessionCleanupFn
      ?? bindOnboardingSessionCleanup;
    const listDescriptors = dependencies.listActiveSessionDescriptorsFn
      ?? listActiveSessionDescriptors;
    const loadDescriptor = dependencies.loadSessionDescriptorFn
      ?? loadSessionDescriptor;
    const retireDescriptor = dependencies.retireSessionDescriptorFn
      ?? retireSessionDescriptor;
    const binding = readBinding({ rootDir: repo });
    if (new Set(["closed-unbound", "design-unbound", "released"]).has(binding.status)) {
      const activeDescriptors = listDescriptors(repo);
      if (activeDescriptors.length !== 0) {
        throw new WorktreeLifecycleError(
          "WT-SESSION-UNBOUND-DESCRIPTOR",
          "an active cleanup descriptor exists outside a bindable continuity state",
        );
      }
      output = {
        ok: true,
        code: "WT-SESSION-NOT-REQUIRED",
        bindingStatus: binding.status,
      };
    } else if (binding.status === "closed-bound") {
      throw new WorktreeLifecycleError(
        "WT-SESSION-RECOVERY-REQUIRED",
        "the closed cleanup binding must complete its typed recovery before a new session starts",
      );
    } else if (binding.status === "bound") {
      if (flags.session && flags.session !== binding.sessionCleanup.sessionId) {
        throw new WorktreeLifecycleError(
          "WT-SESSION-BINDING",
          "requested session ID conflicts with the persisted cleanup descriptor",
        );
      }
      const reused = loadDescriptor(repo, binding.sessionCleanup.sessionId, {
        expectedDescriptorSha256: binding.sessionCleanup.descriptorSha256,
      });
      output = {
        ok: true,
        code: "WT-SESSION-REUSED",
        sessionId: reused.sessionId,
        descriptorSha256: reused.descriptorSha256,
      };
    } else {
      const activeDescriptors = listDescriptors(repo);
      if (activeDescriptors.length !== 0) {
        throw new WorktreeLifecycleError(
          "WT-SESSION-UNBOUND-DESCRIPTOR",
          "an active cleanup descriptor exists without a continuity binding",
        );
      }
      const started = startDescriptor(repo, { sessionId: flags.session });
      let persisted;
      try {
        persisted = bindCleanup({
          rootDir: repo,
          expectedStateSha256: binding.stateSha256,
          expectedRevision: binding.revision,
          sessionCleanup: {
            sessionId: started.sessionId,
            descriptorSha256: started.descriptorSha256,
          },
        });
      } catch (error) {
        try {
          retireDescriptor(repo, started);
        } catch {
          throw new WorktreeLifecycleError(
            "WT-SESSION-BIND-ROLLBACK",
            "cleanup binding failed and the new descriptor could not be retired",
          );
        }
        throw error;
      }
      output = {
        ok: true,
        code: persisted.mutated === false ? "WT-SESSION-REUSED" : "WT-SESSION-STARTED",
        sessionId: persisted.sessionCleanup.sessionId,
        descriptorSha256: persisted.sessionCleanup.descriptorSha256,
      };
    }
  } else if (command === "release-binding") {
    // This is a narrow, exact post-cleanup CAS release.  Requiring general
    // onboarding readiness here creates a cycle when a legacy authority's
    // migration is blocked solely by the stale cleanup tuple that this command
    // is designed to release.  The closure receipt and persisted tuple below
    // remain the complete mutation authority.
    const readBinding = dependencies.readOnboardingSessionCleanupBindingFn
      ?? readOnboardingSessionCleanupBinding;
    const inspectClosure = dependencies.inspectSessionClosureFn
      ?? inspectSessionClosure;
    const releaseCleanup = dependencies.releaseOnboardingSessionCleanupFn
      ?? releaseOnboardingSessionCleanup;
    const binding = readBinding({ rootDir: repo });
    if (binding.status !== "bound") {
      output = { ok: true, code: "WT-SESSION-BINDING-ALREADY-RELEASED" };
    } else {
      const closure = inspectClosure(repo, binding.sessionCleanup.sessionId, {
        expectedDescriptorSha256: binding.sessionCleanup.descriptorSha256,
      });
      if (closure.status !== "closed") {
        throw new WorktreeLifecycleError(
          "WT-SESSION-CLOSURE-REQUIRED",
          "cleanup binding cannot be released without a completed closure receipt",
        );
      }
      releaseCleanup({
        rootDir: repo,
        expectedStateSha256: binding.stateSha256,
        expectedRevision: binding.revision,
        sessionCleanup: binding.sessionCleanup,
      });
      output = { ok: true, code: "WT-SESSION-BINDING-RELEASED" };
    }
  } else if (command === "hygiene") {
    const session = flags["session-descriptor"] ? sessionOwner(repo, flags, env) : { sessionId: required(flags, "session") };
    output = checkHygiene(repo, { sessionId: session.sessionId });
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
      let cleanupBinding = null;
      if (command === "cleanup") {
        drainSessionPower(repo, session);
        const authority = resolveProjectAuthorityPaths({ rootDir: repo });
        const statePath = authority.status === "ready"
          ? authority.state
          : (existsSync(join(repo, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
        if (existsSync(join(repo, statePath))) {
          const readBinding = dependencies.readOnboardingSessionCleanupBindingFn
            ?? readOnboardingSessionCleanupBinding;
          const observed = readBinding({ rootDir: repo });
          if (observed.status === "bound") {
            if (observed.sessionCleanup.sessionId !== session.sessionId
              || observed.sessionCleanup.descriptorSha256 !== session.descriptorSha256) {
              throw new WorktreeLifecycleError(
                "WT-SESSION-BINDING",
                "cleanup descriptor does not match the persisted continuity binding",
              );
            }
            cleanupBinding = observed;
          }
        }
      }
      const cleanup = cleanupSession(repo, { sessionId: ownedSessionId, ownerNonce: nonce }, { allowAbsent: session.descriptorSha256 !== null });
      output = cleanup.receipt;
      if (cleanup.ok && session.descriptorSha256) {
        retireSessionDescriptor(repo, { sessionId: ownedSessionId, ownerNonce: nonce, descriptorSha256: session.descriptorSha256 });
        if (cleanupBinding !== null) {
          const inspectClosure = dependencies.inspectSessionClosureFn
            ?? inspectSessionClosure;
          const closure = inspectClosure(repo, session.sessionId, {
            expectedDescriptorSha256: session.descriptorSha256,
          });
          if (closure.status !== "closed") {
            throw new WorktreeLifecycleError(
              "WT-SESSION-CLOSURE-REQUIRED",
              "cleanup descriptor retired without a completed closure receipt",
            );
          }
          const releaseCleanup = dependencies.releaseOnboardingSessionCleanupFn
            ?? releaseOnboardingSessionCleanup;
          releaseCleanup({
            rootDir: repo,
            expectedStateSha256: cleanupBinding.stateSha256,
            expectedRevision: cleanupBinding.revision,
            sessionCleanup: cleanupBinding.sessionCleanup,
          });
        }
      }
      if (!cleanup.ok) exitCode = 2;
    }
  }
  write(canonicalJson(output));
  return exitCode || (output.ok === false ? 2 : 0);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    const code = error instanceof WorktreeLifecycleError
      || error instanceof ProjectOnboardingReadyError
      || error instanceof KickoffError
      || error instanceof SessionCleanupRecoveryError
      ? error.code
      : "WT-ARGUMENT";
    const detail = error instanceof ProjectOnboardingReadyError
      ? "project onboarding readiness denied session creation"
      : error.message;
    process.stderr.write(`${code}: ${detail}\n`);
    process.exitCode = 2;
  }
}
