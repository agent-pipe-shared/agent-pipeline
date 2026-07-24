#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { publishPoGateProfileReceipt } from "../lib/po-gate-profile-publisher.mjs";
import { readPrivateOverlayBootstrapStatus } from "../lib/private-overlay-bootstrap-status.mjs";
import { validatePrivateOverlayActivation } from "../lib/private-overlay-activation.mjs";
import {
  activatePrivateOverlayRuntimeProjection,
  planPrivateOverlayRuntimeProjection,
} from "../lib/private-overlay-runtime-projection.mjs";
import { observeCodexPublicCoreIdentity, observePublicCoreIdentity } from "../lib/public-core-observation.mjs";

const EVIDENCE_SCHEMA = "pipeline.private-overlay-activation-evidence.v1";
const PLAN_SCHEMA = "pipeline.private-overlay-runtime-projection-plan.v1";
const APPLY_SCHEMA = "pipeline.private-overlay-runtime-projection-activation.v1";
const RESULT_SCHEMA = "pipeline.private-overlay-activation-result.v1";
const STATUS_SCHEMA = "pipeline.private-overlay-bootstrap-status.v1";
const CONTEXT_SCHEMA = "pipeline.private-overlay-operational-context.v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SAFE_CODE = /^(?:SNT-A2?|PO)-[A-Z0-9-]{1,88}$/u;
const USAGE = "Usage: private-overlay-activation.mjs <inspect|plan|status|load-context> --project-root <absolute-path> --source-plugin-root <absolute-path>\n       private-overlay-activation.mjs activate --project-root <absolute-path> --source-plugin-root <absolute-path> --expected-plan-sha256 <64hex>\n";
const PREVIEW_FD = 2;
const MAX_PREVIEW_BYTES = 64 * 1024;
const MAX_CONTEXT_FILES = 128;
const MAX_CONTEXT_FILE_BYTES = 32 * 1024;
const MAX_CONTEXT_TOTAL_BYTES = 128 * 1024;
const MAX_CONTEXT_ENVELOPE_BYTES = 192 * 1024;
const PRIVATE_CLASSES = Object.freeze(["policies", "guidelines", "templates", "extensions"]);
const SCRIPT_PATH = realpathSync(fileURLToPath(import.meta.url));
const PRODUCTION_PLUGIN_ROOT = dirname(dirname(SCRIPT_PATH));
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function canonicalLine(value) {
  return `${JSON.stringify(stable(value))}\n`;
}

function rejectionSchema(command) {
  if (command === "inspect") return EVIDENCE_SCHEMA;
  if (command === "plan") return PLAN_SCHEMA;
  if (command === "status") return STATUS_SCHEMA;
  if (command === "load-context") return CONTEXT_SCHEMA;
  return APPLY_SCHEMA;
}

function internalRejection(command) {
  return {
    schema: rejectionSchema(command),
    status: "rejected",
    reasonCodes: ["SNT-A-CLI-INTERNAL"],
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, keys) {
  return isObject(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function sanitizedRejection(value, schema) {
  return isObject(value)
    && Object.keys(value).sort().join("\0") === ["reasonCodes", "schema", "status"].sort().join("\0")
    && value.schema === schema
    && value.status === "rejected"
    && Array.isArray(value.reasonCodes)
    && value.reasonCodes.length === 1
    && typeof value.reasonCodes[0] === "string"
    && /^[A-Z0-9-]{1,100}$/u.test(value.reasonCodes[0]);
}

function sanitizedBootstrapSummary(value) {
  const countKeys = ["policies", "guidelines", "templates", "extensions", "total"];
  return exactObject(value.candidate, ["repositorySha256", "branchSha256", "commit", "tree"])
    && SHA256.test(value.candidate.repositorySha256)
    && SHA256.test(value.candidate.branchSha256)
    && OID.test(value.candidate.commit)
    && OID.test(value.candidate.tree)
    && exactObject(value.plugin, ["name", "version", "manifestSha256", "contentSha256"])
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value.plugin.name)
    && /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u.test(value.plugin.version)
    && SHA256.test(value.plugin.manifestSha256)
    && SHA256.test(value.plugin.contentSha256)
    && exactObject(value.inputs, ["sourceSha256", "lockSha256", "admittedSetSha256", "admittedFileSha256"])
    && SHA256.test(value.inputs.sourceSha256)
    && SHA256.test(value.inputs.lockSha256)
    && SHA256.test(value.inputs.admittedSetSha256)
    && Array.isArray(value.inputs.admittedFileSha256)
    && value.inputs.admittedFileSha256.every((digest) => typeof digest === "string" && SHA256.test(digest))
    && exactObject(value.admittedCounts, countKeys)
    && countKeys.every((key) => Number.isSafeInteger(value.admittedCounts[key]) && value.admittedCounts[key] >= 0)
    && value.admittedCounts.total === countKeys.slice(0, -1).reduce((sum, key) => sum + value.admittedCounts[key], 0)
    && value.admittedCounts.total === value.inputs.admittedFileSha256.length;
}

function sanitizedBootstrapStatus(value) {
  if (sanitizedRejection(value, STATUS_SCHEMA)) return true;
  if (!isObject(value)
    || value.schema !== STATUS_SCHEMA
    || !["activation-required", "activated"].includes(value.status)
    || !Array.isArray(value.reasonCodes)
    || value.reasonCodes.length !== 1
    || typeof value.reasonCodes[0] !== "string"
    || !SAFE_CODE.test(value.reasonCodes[0])
    || typeof value.planSha256 !== "string"
    || !SHA256.test(value.planSha256)) return false;
  const baseKeys = ["schema", "status", "reasonCodes", "planSha256", "candidate", "plugin", "inputs", "admittedCounts"];
  const keys = Object.hasOwn(value, "profile") ? [...baseKeys, "profile"] : baseKeys;
  if (!exactObject(value, keys) || !sanitizedBootstrapSummary(value)) return false;
  if (value.status === "activated") {
    return exactObject(value.profile, ["humanFacing", "sourceSha256", "runtimeSha256", "receiptSha256", "repositoryFingerprint"])
      && ["de", "en"].includes(value.profile.humanFacing)
      && ["sourceSha256", "runtimeSha256", "receiptSha256", "repositoryFingerprint"].every((key) => SHA256.test(value.profile[key]))
      && value.profile.sourceSha256 === value.inputs.sourceSha256;
  }
  return value.profile === undefined
    || (exactObject(value.profile, ["status", "code"])
      && value.profile.status === "invalid"
      && typeof value.profile.code === "string"
      && SAFE_CODE.test(value.profile.code));
}

function consumePrivateInputs(batch) {
  if (!Array.isArray(batch) || !Object.isFrozen(batch)) throw new TypeError("invalid private input batch");
  for (const entry of batch) {
    if (!exactObject(entry, ["className", "privateName", "text"])
      || !Object.isFrozen(entry)
      || !PRIVATE_CLASSES.includes(entry.className)
      || typeof entry.privateName !== "string"
      || entry.privateName.length === 0
      || typeof entry.text !== "string") throw new TypeError("invalid private input");
    Buffer.byteLength(entry.text, "utf8");
  }
}

function privateContextConsumer() {
  let entries;
  return {
    consume(batch) {
      if (!Array.isArray(batch) || !Object.isFrozen(batch) || batch.length > MAX_CONTEXT_FILES) {
        throw new TypeError("invalid private context batch");
      }
      const selected = [];
      let totalBytes = 0;
      let previousClass = -1;
      for (const entry of batch) {
        if (!exactObject(entry, ["className", "privateName", "text"])
          || !Object.isFrozen(entry)
          || typeof entry.privateName !== "string"
          || entry.privateName.length === 0
          || typeof entry.text !== "string") throw new TypeError("invalid private context entry");
        const classIndex = PRIVATE_CLASSES.indexOf(entry.className);
        if (classIndex < previousClass || classIndex < 0) throw new TypeError("invalid private context order");
        previousClass = classIndex;
        const byteLength = Buffer.byteLength(entry.text, "utf8");
        if (byteLength > MAX_CONTEXT_FILE_BYTES) throw new TypeError("private context file too large");
        totalBytes += byteLength;
        if (totalBytes > MAX_CONTEXT_TOTAL_BYTES) throw new TypeError("private context too large");
        selected.push({ className: entry.className, text: entry.text });
      }
      entries = selected;
    },
    envelope(readback) {
      if (entries === undefined) throw new TypeError("private context was not consumed");
      const output = {
        schema: CONTEXT_SCHEMA,
        status: "context-loaded",
        reasonCodes: ["SNT-A-PRIVATE-CONTEXT-LOADED"],
        classification: "private-operational-context",
        machineEvidence: false,
        handling: "do-not-persist-or-export",
        planSha256: readback.planSha256,
        entries,
      };
      if (Buffer.byteLength(canonicalLine(output), "utf8") > MAX_CONTEXT_ENVELOPE_BYTES) {
        throw new TypeError("private context envelope too large");
      }
      entries = undefined;
      return output;
    },
    discard() { entries = undefined; },
  };
}

function contextRejection(code = "SNT-A-CONTEXT-LOAD-REJECTED") {
  return { schema: CONTEXT_SCHEMA, status: "rejected", reasonCodes: [code] };
}

function resolveDependencies(deps) {
  if (!isObject(deps)) throw new TypeError("invalid dependencies");
  const allowed = new Set([
    "observe", "validate", "planProjection", "activateProjection", "publishReceipt",
    "readProjectionInputs", "readBootstrapStatus", "consumeInputs", "pluginRoot", "write", "writeError", "previewWriteSync", "spawnSync", "resolveExecutable",
  ]);
  if (Object.keys(deps).some((key) => !allowed.has(key))) throw new TypeError("invalid dependencies");
  const selected = {
    observe: deps.observe ?? observePublicCoreIdentity,
    validate: deps.validate ?? validatePrivateOverlayActivation,
    planProjection: deps.planProjection ?? planPrivateOverlayRuntimeProjection,
    activateProjection: deps.activateProjection ?? activatePrivateOverlayRuntimeProjection,
    publishReceipt: deps.publishReceipt ?? publishPoGateProfileReceipt,
    readProjectionInputs: deps.readProjectionInputs ?? readProjectionInputs,
    readBootstrapStatus: deps.readBootstrapStatus ?? readPrivateOverlayBootstrapStatus,
    consumeInputs: deps.consumeInputs ?? consumePrivateInputs,
    pluginRoot: deps.pluginRoot ?? PRODUCTION_PLUGIN_ROOT,
    write: deps.write ?? process.stdout.write.bind(process.stdout),
    writeError: deps.writeError ?? process.stderr.write.bind(process.stderr),
    previewWriteSync: deps.previewWriteSync ?? writeSync,
    spawnSync: deps.spawnSync ?? nodeSpawnSync,
  };
  for (const key of ["observe", "validate", "planProjection", "activateProjection", "publishReceipt", "readProjectionInputs", "readBootstrapStatus", "consumeInputs", "write", "writeError", "previewWriteSync", "spawnSync"]) {
    if (typeof selected[key] !== "function") throw new TypeError("invalid dependency");
  }
  if (typeof selected.pluginRoot !== "string") throw new TypeError("invalid plugin root");
  return selected;
}

function invocation(argv) {
  if (!Array.isArray(argv) || !["inspect", "plan", "status", "load-context", "activate"].includes(argv[0])) return undefined;
  const parsed = { command: argv[0] };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--project-root" && parsed.projectRoot === undefined && typeof value === "string" && !value.startsWith("--")) {
      parsed.projectRoot = value;
      index += 1;
    } else if (flag === "--source-plugin-root" && parsed.sourcePluginRoot === undefined && typeof value === "string" && !value.startsWith("--")) {
      parsed.sourcePluginRoot = value;
      index += 1;
    } else if (flag === "--expected-plan-sha256" && parsed.expectedPlanSha256 === undefined && typeof value === "string" && !value.startsWith("--")) {
      parsed.expectedPlanSha256 = value;
      index += 1;
    } else return undefined;
  }
  if (typeof parsed.projectRoot !== "string" || !isAbsolute(parsed.projectRoot)
    || typeof parsed.sourcePluginRoot !== "string" || !isAbsolute(parsed.sourcePluginRoot)) return undefined;
  if (parsed.command === "activate") {
    if (typeof parsed.expectedPlanSha256 !== "string" || !SHA256.test(parsed.expectedPlanSha256)) return undefined;
  } else if (parsed.expectedPlanSha256 !== undefined) return undefined;
  return parsed;
}

function readBootstrapStatus(parsed, dependencies, consumeInputs = dependencies.consumeInputs) {
  let callbackCalls = 0;
  const result = dependencies.readBootstrapStatus({
    overlayRoot: parsed.projectRoot,
    sourcePluginRoot: parsed.sourcePluginRoot,
    installedPluginRoot: dependencies.pluginRoot,
    consumeInputs(batch) {
      callbackCalls += 1;
      if (callbackCalls !== 1) throw new TypeError("consumer called more than once");
      return consumeInputs(batch);
    },
  }, { observe: dependencies.observe });
  if (!sanitizedBootstrapStatus(result)
    || callbackCalls > 1
    || (result.status === "activated" && callbackCalls !== 1)
    || (result.status === "activation-required" && callbackCalls !== 0)) {
    throw new TypeError("invalid bootstrap status");
  }
  return result;
}

function sameFile(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function physicalRoot(projectRoot) {
  if (typeof projectRoot !== "string" || !isAbsolute(projectRoot) || projectRoot.includes("\0")) throw new Error("unsafe root");
  const requested = resolve(projectRoot);
  const info = lstatSync(requested, { bigint: true });
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(requested) !== requested) throw new Error("unsafe root");
  return { path: requested, identity: info };
}

function stableProjectFile(root, rootIdentity, relativePath) {
  const components = relativePath.split("/");
  let path = root;
  const parents = [{ path: root, identity: rootIdentity }];
  for (const [index, component] of components.entries()) {
    if (!component || component === "." || component === ".." || component.includes("\\") || component.includes("\0")) throw new Error("unsafe path");
    path = resolve(path, component);
    if (!path.startsWith(`${root}${sep}`)) throw new Error("escaped path");
    const info = lstatSync(path, { bigint: true });
    if (info.isSymbolicLink() || (index < components.length - 1 && !info.isDirectory())) throw new Error("unsafe component");
    if (index < components.length - 1) parents.push({ path, identity: info });
  }
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || realpathSync(path) !== path) throw new Error("unsafe file");
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || !sameFile(before, opened)) throw new Error("changed file");
    const bytes = readFileSync(descriptor);
    const afterDescriptor = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (!sameFile(opened, afterDescriptor)
      || !sameFile(afterDescriptor, afterPath)
      || afterDescriptor.size !== BigInt(bytes.length)
      || realpathSync(path) !== path) throw new Error("changed file");
    for (const parent of parents) {
      const current = lstatSync(parent.path, { bigint: true });
      if (!current.isDirectory() || current.isSymbolicLink() || !sameFile(parent.identity, current) || realpathSync(parent.path) !== parent.path) {
        throw new Error("changed parent");
      }
    }
    return UTF8.decode(bytes);
  } finally {
    closeSync(descriptor);
  }
}

function readProjectionInputs(projectRoot) {
  const selected = physicalRoot(projectRoot);
  const userYamlText = stableProjectFile(selected.path, selected.identity, "pipeline.user.yaml");
  const runtimeYamlText = stableProjectFile(selected.path, selected.identity, ".claude/pipeline.yaml");
  const after = physicalRoot(projectRoot);
  if (after.path !== selected.path || !sameFile(after.identity, selected.identity)) throw new Error("changed root");
  return { userYamlText, runtimeYamlText };
}

function writePreviewFully(chunk, syncWrite) {
  const bytes = Buffer.from(String(chunk), "utf8");
  if (bytes.length === 0 || bytes.length > MAX_PREVIEW_BYTES) throw new Error("invalid preview length");
  let offset = 0;
  for (let attempt = 0; offset < bytes.length && attempt < bytes.length; attempt += 1) {
    const remaining = bytes.length - offset;
    const written = syncWrite(PREVIEW_FD, bytes, offset, remaining);
    if (!Number.isInteger(written) || written <= 0 || written > remaining) throw new Error("invalid preview progress");
    offset += written;
  }
  if (offset !== bytes.length) throw new Error("incomplete preview");
}

function freshAdmission(projectRoot, sourcePluginRoot, dependencies) {
  const observation = dependencies.observe({
    sourcePluginRoot,
    installedPluginRoot: dependencies.pluginRoot,
  });
  if (observation?.status === "rejected") {
    if (!sanitizedRejection(observation, "pipeline.public-core-observation.v1")) throw new TypeError("invalid observation rejection");
    return { output: observation };
  }
  if (observation?.status !== "ready") throw new TypeError("invalid observation");
  const evidence = dependencies.validate({
    overlayRoot: projectRoot,
    selectedCandidate: observation.candidate,
    installedPlugin: observation.plugin,
  });
  if (!isObject(evidence)) throw new TypeError("invalid evidence");
  return evidence.status === "ready" ? { evidence } : { output: evidence };
}

function completeResult(projection, publication, readback) {
  return {
    schema: RESULT_SCHEMA,
    status: "activated",
    reasonCodes: ["SNT-A-ACTIVATION-COMPLETE"],
    planSha256: projection.planSha256,
    projectionStatus: projection.status,
    receipt: {
      code: publication.code,
      humanFacing: publication.humanFacing,
      receiptSha256: publication.receiptSha256,
    },
    readback,
  };
}

function partialResult(projection, reasonCode) {
  return {
    schema: RESULT_SCHEMA,
    status: "partial",
    reasonCodes: [reasonCode],
    planSha256: projection.planSha256,
    projectionStatus: projection.status,
    rollbackClaimed: false,
  };
}

/** Run one private-overlay inspection, projection plan, status/context readback, or activation. */
function run(argv, dependencyOverrides = {}) {
  const parsed = invocation(argv);
  if (parsed === undefined) {
    const writeError = typeof dependencyOverrides?.writeError === "function"
      ? dependencyOverrides.writeError
      : process.stderr.write.bind(process.stderr);
    writeError(USAGE);
    return 64;
  }

  let dependencies;
  let output;
  try {
    dependencies = resolveDependencies(dependencyOverrides);
    if (parsed.command === "status") output = readBootstrapStatus(parsed, dependencies);
    else if (parsed.command === "load-context") {
      const context = privateContextConsumer();
      let readback;
      try { readback = readBootstrapStatus(parsed, dependencies, context.consume); }
      catch {
        context.discard();
        throw new TypeError("private context readback failed");
      }
      if (readback.status === "activated") {
        try { output = context.envelope(readback); }
        catch {
          context.discard();
          output = contextRejection();
        }
      } else {
        context.discard();
        output = contextRejection();
      }
    } else {
      const admission = freshAdmission(parsed.projectRoot, parsed.sourcePluginRoot, dependencies);
      if (admission.output) output = admission.output;
      else if (parsed.command === "inspect") output = admission.evidence;
      else {
        const review = dependencies.planProjection({
          overlayRoot: parsed.projectRoot,
          activationEvidence: admission.evidence,
        });
        if (!isObject(review)) throw new TypeError("invalid projection review");
        if (parsed.command === "plan" || !["ready", "noop"].includes(review.status)) output = review;
        else if (review.planSha256 !== parsed.expectedPlanSha256) {
          output = { schema: APPLY_SCHEMA, status: "rejected", reasonCodes: ["SNT-A-PROJECTION-DIGEST-MISMATCH"] };
        } else {
          try { writePreviewFully(canonicalLine(review), dependencies.previewWriteSync); }
          catch {
            output = { schema: APPLY_SCHEMA, status: "rejected", reasonCodes: ["SNT-A-PROJECTION-PREVIEW-FAILED"] };
          }
          if (!output) {
            const projection = dependencies.activateProjection(review, {
              overlayRoot: parsed.projectRoot,
              activate: true,
              expectedPlanSha256: parsed.expectedPlanSha256,
            });
            if (!isObject(projection)) throw new TypeError("invalid projection result");
            if (!["applied", "noop"].includes(projection.status)) output = projection;
            else {
              let inputs;
              try { inputs = dependencies.readProjectionInputs(parsed.projectRoot); }
              catch { output = partialResult(projection, "SNT-A-ACTIVATED-INPUT-READ-FAILED"); }
              if (!output) {
                let publication;
                try {
                  publication = dependencies.publishReceipt({
                    rootDir: parsed.projectRoot,
                    userYamlText: inputs.userYamlText,
                    runtimeYamlText: inputs.runtimeYamlText,
                  });
                } catch {
                  publication = null;
                }
                if (publication?.ok === true
                  && publication.code === "PO-PROFILE-RECEIPT-PUBLISHED"
                  && ["de", "en"].includes(publication.humanFacing)
                  && typeof publication.receiptSha256 === "string"
                && SHA256.test(publication.receiptSha256)) {
                  const readback = readBootstrapStatus(parsed, dependencies);
                  if (readback.status === "activated"
                    && readback.profile.receiptSha256 === publication.receiptSha256) {
                    output = completeResult(projection, publication, readback);
                  } else output = partialResult(projection, "SNT-A-ACTIVATED-STATUS-READBACK-FAILED");
                } else output = partialResult(projection, "SNT-A-ACTIVATED-RECEIPT-PUBLISH-FAILED");
              }
            }
          }
        }
      }
    }
  } catch {
    output = internalRejection(parsed.command);
  }
  const outputWrite = dependencies?.write
    ?? (typeof dependencyOverrides?.write === "function" ? dependencyOverrides.write : process.stdout.write.bind(process.stdout));
  try { outputWrite(canonicalLine(output)); }
  catch { return 2; }
  if (parsed.command === "inspect") return output?.status === "ready" ? 0 : 2;
  if (parsed.command === "plan") return ["ready", "noop"].includes(output?.status) ? 0 : 2;
  if (parsed.command === "status") return output?.status === "activated" ? 0 : 2;
  if (parsed.command === "load-context") return output?.status === "context-loaded" ? 0 : 2;
  return output?.status === "activated" ? 0 : 2;
}

/** Standard CLI entrypoint: no host plugin-list attestation is available. */
export function main(argv, dependencyOverrides = {}) {
  return run(argv, dependencyOverrides);
}

/**
 * Codex bridge entrypoint. It selects an observer which re-reads the fixed
 * host plugin-list command itself; no caller can supply a plugin version.
 */
export function mainCodexHost(argv, dependencyOverrides = {}) {
  if (!isObject(dependencyOverrides)) return run(argv, dependencyOverrides);
  const { observe: _ignored, ...safeOverrides } = dependencyOverrides;
  return run(argv, { ...safeOverrides, observe(input) {
    return observeCodexPublicCoreIdentity(input, {
      spawnSync: safeOverrides.spawnSync ?? nodeSpawnSync,
      ...(typeof safeOverrides.resolveExecutable === "function" ? { resolveExecutable: safeOverrides.resolveExecutable } : {}),
    });
  } });
}

if (process.argv[1] !== undefined && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
