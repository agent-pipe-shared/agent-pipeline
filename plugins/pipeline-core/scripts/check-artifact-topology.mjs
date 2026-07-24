#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFeatureTopology } from "../lib/feature-package-topology.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
export const TOPOLOGY_SCHEMA = "pipeline.artifact-topology.v1";
export const TOPOLOGY_STATES = Object.freeze(["draft", "awaiting-approval", "approved", "implementing", "verifying", "completed", "superseded", "abandoned", "retained"]);
export const TOPOLOGY_CLASSES = Object.freeze(["prd", "spec", "design", "plan", "acceptance", "result", "candidate-evidence", "adr", "release", "backlog", "state", "handover", "retention", "supply-chain", "private-local"]);

function inside(root, target) { const rel = relative(root, target); return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)); }
function shape(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** Validate one topology declaration without inferring lifecycle from filenames. */
export function checkArtifactTopology(root = DEFAULT_ROOT, path = "governance/artifact-topology.json") {
  const findings = [];
  const absolute = resolve(root, path);
  if (!inside(root, absolute)) return { ok: false, status: "invalid", findings: ["topology path escapes repository root"] };
  let raw;
  try {
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) findings.push("topology declaration must be a regular non-symlink file");
    raw = readFileSync(absolute, "utf8");
  } catch { return { ok: false, status: "missing", findings: ["topology declaration is missing"] }; }
  let topology;
  try { topology = JSON.parse(raw); } catch { return { ok: false, status: "invalid", findings: [...findings, "topology declaration is not JSON"] }; }
  if (!shape(topology) || topology.schema !== TOPOLOGY_SCHEMA) findings.push(`schema must equal ${TOPOLOGY_SCHEMA}`);
  if (!new Set(["compatibility", "enforced"]).has(topology?.mode)) findings.push("mode must be compatibility or enforced");
  if (topology?.packageRoot !== "specs/<feature-id>") findings.push("packageRoot must be specs/<feature-id>");
  if (!Array.isArray(topology?.states) || topology.states.join("\0") !== TOPOLOGY_STATES.join("\0")) findings.push("states must equal the closed topology state order");
  if (!Array.isArray(topology?.classes) || topology.classes.join("\0") !== TOPOLOGY_CLASSES.join("\0")) findings.push("classes must equal the closed topology class order");
  const packages = validateFeatureTopology(root);
  findings.push(...packages.findings);
  return { ok: findings.length === 0, status: findings.length === 0 ? "valid" : "invalid", findings, mode: topology?.mode ?? null, packages: { inventory: packages.inventory, receipts: packages.receipts } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkArtifactTopology(process.cwd());
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 2;
}
