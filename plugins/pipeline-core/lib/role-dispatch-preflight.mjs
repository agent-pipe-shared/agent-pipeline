// SPDX-License-Identifier: SUL-1.0

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { dispatchFindings } from "./dispatch-policy.mjs";

export const ROLE_DISPATCH_REQUEST_SCHEMA = "pipeline.role-dispatch-request.v1";
export const ROLE_DISPATCH_PREFLIGHT_SCHEMA = "pipeline.role-dispatch-preflight.v1";
export const ROLE_DISPATCH_BATCH_SCHEMA = "pipeline.role-dispatch-batch.v1";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const TRANSPORTS = new Set(["direct", "workflow", "antigravity", "codex"]);
const PACKET_KEYS = ["candidate", "dispatchId", "prompt", "requiredPaths", "resultPath", "role", "schema", "transport"];

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
  let realResultRoot;
  try {
    const lexicalResultRoot = resolve(resultRoot);
    const lexicalResultStat = lstatSync(lexicalResultRoot);
    realResultRoot = realpathSync(lexicalResultRoot);
    if (!lexicalResultStat.isDirectory() || lexicalResultStat.isSymbolicLink()
      || lexicalResultRoot !== realResultRoot) return rejected("RDP-RESULT-ROOT", "resultRoot");
  } catch { return rejected("RDP-RESULT-ROOT", "resultRoot"); }
  if (!exactKeys(packet, PACKET_KEYS) || packet.schema !== ROLE_DISPATCH_REQUEST_SCHEMA) {
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
  if (!normalizedPath(packet.resultPath)) return rejected("RDP-RESULT-PATH", "resultPath");

  const policy = dispatchFindings({ subagentType: packet.role, prompt: packet.prompt, transport: packet.transport });
  if (policy.findings.length > 0) return rejected(policy.findings[0].code, "role");

  const commit = git(realRoot, ["rev-parse", "--verify", `${packet.candidate.commit}^{commit}`]);
  if (commit !== packet.candidate.commit) return rejected("RDP-CANDIDATE-COMMIT", "candidate.commit");
  const tree = git(realRoot, ["rev-parse", `${commit}^{tree}`]);
  if (tree !== packet.candidate.tree) return rejected("RDP-CANDIDATE-TREE", "candidate.tree");
  for (const path of packet.requiredPaths) {
    const row = git(realRoot, ["--literal-pathspecs", "ls-tree", "-z", commit, "--", path]);
    if (row === null || !/^(?:100644|100755) blob (?:[a-f0-9]{40}|[a-f0-9]{64})\t/u.test(row)) {
      return rejected("RDP-REQUIRED-PATH", `requiredPaths:${path}`);
    }
  }
  if (!resultParentIsSafe(realResultRoot, packet.resultPath)) return rejected("RDP-RESULT-DESTINATION", "resultPath");
  if (realRoot === realResultRoot && packet.requiredPaths.includes(packet.resultPath)) return rejected("RDP-RESULT-ALIASES-INPUT", "resultPath");

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

export function prepareRoleDispatchBatch({ root, packets } = {}) {
  if (!Array.isArray(packets) || packets.length === 0 || packets.length > 64) {
    return { schema: ROLE_DISPATCH_BATCH_SCHEMA, status: "rejected", code: "RDB-PACKETS", preparations: [], modelCalls: 0, launcherCalls: 0 };
  }
  const preparations = packets.map((packet) => preflightRoleDispatch({ root, packet }));
  const ids = packets.map((packet) => packet?.dispatchId);
  const destinations = packets.map((packet) => packet?.resultPath);
  const duplicate = new Set(ids).size !== ids.length || new Set(destinations).size !== destinations.length;
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

export async function runRoleDispatchBatch({ root, packets, launch } = {}) {
  const prepared = prepareRoleDispatchBatch({ root, packets });
  if (prepared.status !== "prepared") return prepared;
  if (typeof launch !== "function") {
    return { ...prepared, status: "rejected", code: "RDB-LAUNCHER", launcherCalls: 0 };
  }
  const results = [];
  for (const preparation of prepared.preparations) results.push(await launch(structuredClone(preparation.packet)));
  return { ...prepared, status: "completed", code: "RDB-COMPLETED", results, launcherCalls: prepared.preparations.length };
}
