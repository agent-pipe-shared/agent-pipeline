// SPDX-License-Identifier: SUL-1.0

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { dispatchFindings } from "./dispatch-policy.mjs";

export const ROLE_DISPATCH_REQUEST_SCHEMA = "pipeline.role-dispatch-request.v1";
export const ROLE_DISPATCH_PREFLIGHT_SCHEMA = "pipeline.role-dispatch-preflight.v1";
export const ROLE_DISPATCH_BATCH_SCHEMA = "pipeline.role-dispatch-batch.v1";
export const ROLE_DISPATCH_BATCH_EVENT_SCHEMA = "pipeline.role-dispatch-batch-event.v1";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const TRANSPORTS = new Set(["direct", "workflow", "antigravity", "codex"]);
const PACKET_KEYS = ["candidate", "dispatchId", "prompt", "requiredPathSha256", "requiredPaths", "resultPath", "role", "schema", "transport"];
const EXPLICIT_DESTINATION_PACKET_KEYS = ["candidate", "dispatchId", "prompt", "requiredPathSha256", "requiredPaths", "resultDestination", "role", "schema", "transport"];
const SHA256 = /^[a-f0-9]{64}$/u;

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function rejected(code, field) {
  return {
    schema: ROLE_DISPATCH_PREFLIGHT_SCHEMA,
    status: "rejected",
    code,
    field,
    modelCalls: 0,
    launcherCalls: 0,
  };
}

function normalizedPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && value.trim() === value && !value.includes("\\") && !/[\u0000-\u001f\u007f]/u.test(value)
    && !isAbsolute(value) && !value.startsWith("./") && !value.endsWith("/")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout).trim();
}

function candidateBlobSha256(root, oid) {
  const result = spawnSync("git", ["-C", root, "cat-file", "blob", oid], {
    encoding: null,
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 5_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) return null;
  return createHash("sha256").update(result.stdout).digest("hex");
}

function resultParentIsSafe(root, resultPath) {
  const absolute = resolve(root, resultPath);
  const rel = relative(root, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  if (existsSync(absolute)) return false;
  const parent = dirname(absolute);
  try {
    const parentStat = lstatSync(parent);
    const realParent = realpathSync(parent);
    const parentRel = relative(root, realParent);
    return parentStat.isDirectory() && !parentStat.isSymbolicLink()
      && (parentRel === "" || (parentRel !== ".." && !parentRel.startsWith(`..${sep}`) && !isAbsolute(parentRel)));
  } catch {
    return false;
  }
}

export function preflightRoleDispatch({ root, resultRoot = root, packet } = {}) {
  if (typeof root !== "string" || root.length === 0) return rejected("RDP-ROOT", "root");
  let realRoot;
  try { realRoot = realpathSync(root); } catch { return rejected("RDP-ROOT", "root"); }
  const legacyPacket = exactKeys(packet, PACKET_KEYS);
  const explicitPacket = exactKeys(packet, EXPLICIT_DESTINATION_PACKET_KEYS);
  if ((!legacyPacket && !explicitPacket) || packet.schema !== ROLE_DISPATCH_REQUEST_SCHEMA) {
    return rejected("RDP-PACKET-SHAPE", "packet");
  }
  if (!ID.test(packet.dispatchId)) return rejected("RDP-DISPATCH-ID", "dispatchId");
  if (!TRANSPORTS.has(packet.transport)) return rejected("RDP-TRANSPORT", "transport");
  if (typeof packet.role !== "string" || packet.role.trim() === "") return rejected("RDP-ROLE", "role");
  if (typeof packet.prompt !== "string" || packet.prompt.trim() === "") return rejected("RDP-PROMPT", "prompt");
  if (!exactKeys(packet.candidate, ["commit", "tree"]) || !OID.test(packet.candidate.commit) || !OID.test(packet.candidate.tree)) {
    return rejected("RDP-CANDIDATE-SHAPE", "candidate");
  }
  if (!Array.isArray(packet.requiredPaths) || packet.requiredPaths.length === 0 || packet.requiredPaths.length > 128
    || packet.requiredPaths.some((path) => !normalizedPath(path))
    || new Set(packet.requiredPaths).size !== packet.requiredPaths.length
    || JSON.stringify([...packet.requiredPaths].sort()) !== JSON.stringify(packet.requiredPaths)) {
    return rejected("RDP-REQUIRED-PATHS", "requiredPaths");
  }
  if (!exactKeys(packet.requiredPathSha256, packet.requiredPaths)
    || packet.requiredPaths.some((path) => !SHA256.test(packet.requiredPathSha256[path]))) {
    return rejected("RDP-REQUIRED-DIGESTS", "requiredPathSha256");
  }
  let destination;
  if (legacyPacket) {
    if (!normalizedPath(packet.resultPath)) return rejected("RDP-RESULT-PATH", "resultPath");
    destination = { kind: "file", path: packet.resultPath };
  } else if (exactKeys(packet.resultDestination, ["kind", "path"])
    && packet.resultDestination.kind === "file") {
    if (!normalizedPath(packet.resultDestination.path)) return rejected("RDP-RESULT-PATH", "resultDestination.path");
    destination = packet.resultDestination;
  } else if (exactKeys(packet.resultDestination, ["kind"])
    && (packet.resultDestination.kind === "return" || packet.resultDestination.kind === "stream")) {
    destination = packet.resultDestination;
  } else {
    return rejected("RDP-RESULT-DESTINATION", "resultDestination");
  }

  const policy = dispatchFindings({ subagentType: packet.role, prompt: packet.prompt, transport: packet.transport });
  if (policy.findings.length > 0) return rejected(policy.findings[0].code, "role");

  const commit = git(realRoot, ["rev-parse", "--verify", `${packet.candidate.commit}^{commit}`]);
  if (commit !== packet.candidate.commit) return rejected("RDP-CANDIDATE-COMMIT", "candidate.commit");
  const tree = git(realRoot, ["rev-parse", `${commit}^{tree}`]);
  if (tree !== packet.candidate.tree) return rejected("RDP-CANDIDATE-TREE", "candidate.tree");
  for (const path of packet.requiredPaths) {
    const row = git(realRoot, ["--literal-pathspecs", "ls-tree", "-z", commit, "--", path]);
    const match = /^(?:100644|100755) blob ((?:[a-f0-9]{40}|[a-f0-9]{64}))\t/u.exec(row ?? "");
    if (match === null) {
      return rejected("RDP-REQUIRED-PATH", `requiredPaths:${path}`);
    }
    if (candidateBlobSha256(realRoot, match[1]) !== packet.requiredPathSha256[path]) {
      return rejected("RDP-REQUIRED-BLOB", `requiredPaths:${path}`);
    }
    const physicalPath = resolve(realRoot, path);
    try {
      const physical = lstatSync(physicalPath);
      if (!physical.isFile() || physical.isSymbolicLink() || realpathSync(physicalPath) !== physicalPath) {
        return rejected("RDP-REQUIRED-PATH", `requiredPaths:${path}`);
      }
    } catch { return rejected("RDP-REQUIRED-PATH", `requiredPaths:${path}`); }
    const physicalBlob = git(realRoot, ["--literal-pathspecs", "hash-object", "--no-filters", "--", path]);
    if (physicalBlob !== match[1]) return rejected("RDP-REQUIRED-PATH-DRIFT", `requiredPaths:${path}`);
  }
  if (destination.kind === "file") {
    let realResultRoot;
    try {
      const lexicalResultRoot = resolve(resultRoot);
      const lexicalResultStat = lstatSync(lexicalResultRoot);
      realResultRoot = realpathSync(lexicalResultRoot);
      // Inspect the coordinator-supplied directory before resolving it. This
      // catches a symlinked destination without rejecting platform-standard
      // ancestors such as macOS /var -> /private/var.
      if (!lexicalResultStat.isDirectory() || lexicalResultStat.isSymbolicLink()) {
        return rejected("RDP-RESULT-ROOT", "resultRoot");
      }
    } catch { return rejected("RDP-RESULT-ROOT", "resultRoot"); }
    if (!resultParentIsSafe(realResultRoot, destination.path)) {
      return rejected("RDP-RESULT-DESTINATION", explicitPacket ? "resultDestination.path" : "resultPath");
    }
    if (realRoot === realResultRoot && packet.requiredPaths.includes(destination.path)) {
      return rejected("RDP-RESULT-ALIASES-INPUT", explicitPacket ? "resultDestination.path" : "resultPath");
    }
  }

  return {
    schema: ROLE_DISPATCH_PREFLIGHT_SCHEMA,
    status: "prepared",
    code: "RDP-PREPARED",
    packet: structuredClone(packet),
    candidate: { commit, tree },
    modelCalls: 0,
    launcherCalls: 0,
  };
}

export function prepareRoleDispatchBatch({ root, resultRoot = root, packets } = {}) {
  if (!Array.isArray(packets) || packets.length === 0 || packets.length > 64) {
    return { schema: ROLE_DISPATCH_BATCH_SCHEMA, status: "rejected", code: "RDB-PACKETS", preparations: [], modelCalls: 0, launcherCalls: 0 };
  }
  const preparations = packets.map((packet) => preflightRoleDispatch({ root, resultRoot, packet }));
  const ids = packets.map((packet) => packet?.dispatchId);
  const fileDestinations = packets.flatMap((packet) => {
    if (typeof packet?.resultPath === "string") return [packet.resultPath];
    return packet?.resultDestination?.kind === "file" && typeof packet.resultDestination.path === "string"
      ? [packet.resultDestination.path]
      : [];
  });
  const duplicate = new Set(ids).size !== ids.length || new Set(fileDestinations).size !== fileDestinations.length;
  if (duplicate || preparations.some(({ status }) => status !== "prepared")) {
    return {
      schema: ROLE_DISPATCH_BATCH_SCHEMA,
      status: "rejected",
      code: duplicate ? "RDB-DUPLICATE-BINDING" : "RDB-PREPARATION-FAILED",
      preparations,
      modelCalls: 0,
      launcherCalls: 0,
    };
  }
  return { schema: ROLE_DISPATCH_BATCH_SCHEMA, status: "prepared", code: "RDB-PREPARED", preparations, modelCalls: 0, launcherCalls: 0 };
}

function batchEvent(phase, index, packet, status, code) {
  return Object.freeze({
    schema: ROLE_DISPATCH_BATCH_EVENT_SCHEMA,
    phase,
    index,
    dispatchId: ID.test(packet?.dispatchId ?? "") ? packet.dispatchId : null,
    status,
    code,
  });
}

function reportBatchEvent(onEvent, event) {
  if (onEvent === undefined) return true;
  if (typeof onEvent !== "function") return false;
  try {
    const reported = onEvent(event);
    if (reported && typeof reported.then === "function") {
      Promise.resolve(reported).catch(() => {});
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function runRoleDispatchBatch({ root, resultRoot = root, packets, launch, onEvent } = {}) {
  const prepared = prepareRoleDispatchBatch({ root, resultRoot, packets });
  let reportingReady = onEvent === undefined || typeof onEvent === "function";
  for (const [index, preparation] of prepared.preparations.entries()) {
    const event = batchEvent("PREPARE", index, packets[index], preparation.status, preparation.code);
    if (!reportBatchEvent(onEvent, event)) reportingReady = false;
  }
  if (!reportingReady) {
    return { ...prepared, status: "rejected", code: "RDB-EVENT-SINK", launcherCalls: 0 };
  }
  if (prepared.status !== "prepared") return prepared;
  if (typeof launch !== "function") {
    return { ...prepared, status: "rejected", code: "RDB-LAUNCHER", launcherCalls: 0 };
  }
  const results = [];
  for (const preparation of prepared.preparations) {
    const current = preflightRoleDispatch({ root, resultRoot, packet: preparation.packet });
    if (current.status !== "prepared") {
      const refusal = batchEvent("REFUSE", results.length, preparation.packet, "rejected", current.code);
      if (!reportBatchEvent(onEvent, refusal)) {
        return {
          ...prepared,
          status: "rejected",
          code: "RDB-EVENT-SINK",
          failedPreparation: current,
          results,
          launcherCalls: results.length,
        };
      }
      return {
        ...prepared,
        status: "rejected",
        code: "RDB-PREPARATION-STALE",
        failedPreparation: current,
        results,
        launcherCalls: results.length,
      };
    }
    const start = batchEvent("START", results.length, current.packet, "starting", "RDB-START");
    if (!reportBatchEvent(onEvent, start)) {
      return {
        ...prepared,
        status: "rejected",
        code: "RDB-EVENT-SINK",
        results,
        launcherCalls: results.length,
      };
    }
    results.push(await launch(structuredClone(current.packet)));
  }
  return { ...prepared, status: "completed", code: "RDB-COMPLETED", results, launcherCalls: prepared.preparations.length };
}
