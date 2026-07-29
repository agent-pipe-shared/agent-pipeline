#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Typed, confirmation-bound repair for a missing or stale local PO profile receipt. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  LEGACY_MANIFEST,
  NEUTRAL_MANIFEST,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";
import {
  validatePoGateLanguageProjection,
  validatePoGateProfileForRepository,
} from "../lib/po-gate-authority.mjs";
import { publishPoGateProfileReceipt } from "../lib/po-gate-profile-publisher.mjs";

const PLAN_SCHEMA = "pipeline.po-gate-profile-repair-plan.v1";
const APPLY_SCHEMA = "pipeline.po-gate-profile-repair-apply.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const SCRIPT = fileURLToPath(import.meta.url);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function canonical(value) {
  return JSON.stringify(stable(value));
}

function physicalRoot(value) {
  const requested = resolve(value);
  const info = lstatSync(requested);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(requested) !== requested) {
    throw new Error("root is not a physical directory");
  }
  return requested;
}

function physicalRead(root, relativePath) {
  const target = resolve(root, relativePath);
  const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("authority path escapes the repository");
  }
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(target) !== target) {
    throw new Error("authority path is not a physical regular file");
  }
  return readFileSync(target, "utf8");
}

function buildPlan(rootDir) {
  const root = physicalRoot(rootDir);
  const authority = resolveProjectAuthorityPaths({ rootDir: root });
  const manifest = authority.status === "ready"
    ? authority.manifest
    : (lstatSync(join(root, NEUTRAL_MANIFEST), { throwIfNoEntry: false })
      ? NEUTRAL_MANIFEST
      : LEGACY_MANIFEST);
  const source = physicalRead(root, "pipeline.user.yaml");
  const runtime = physicalRead(root, manifest);
  const projection = validatePoGateLanguageProjection(source, runtime);
  if (!projection.ok) throw new Error(projection.code);
  const current = validatePoGateProfileForRepository({ repoRoot: root });
  const payload = {
    schema: PLAN_SCHEMA,
    status: "ready",
    root,
    source: { path: "pipeline.user.yaml", sha256: sha256(source) },
    runtime: { path: manifest, sha256: sha256(runtime) },
    profile: {
      currentStatus: current.ok ? "current" : "repair-required",
      currentCode: current.code,
      humanFacing: projection.humanFacing,
    },
  };
  const planSha256 = sha256(canonical(payload));
  return {
    payload,
    planSha256,
    source,
    runtime,
    action: {
      executable: process.execPath,
      argv: [
        SCRIPT,
        "apply",
        "--root",
        root,
        "--plan-sha256",
        planSha256,
        "--activate",
      ],
      mutation: true,
      requiresConfirmation: true,
      requiresHostBoundary: true,
    },
  };
}

function parse(argv) {
  if (!["plan", "apply"].includes(argv[0])) return null;
  const result = { command: argv[0], activate: false };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root" && argv[index + 1]) result.root = argv[++index];
    else if (token === "--plan-sha256" && argv[index + 1]) result.planSha256 = argv[++index];
    else if (token === "--activate") result.activate = true;
    else return null;
  }
  if (!result.root) return null;
  if (result.command === "plan" && (result.planSha256 || result.activate)) return null;
  if (result.command === "apply"
    && (!SHA256.test(result.planSha256 ?? "") || result.activate !== true)) return null;
  return result;
}

export function main(argv = process.argv.slice(2), write = process.stdout.write.bind(process.stdout)) {
  const options = parse(argv);
  if (!options) {
    write("usage: <plan|apply> --root <project-root> [--plan-sha256 <sha256> --activate]\n");
    return 64;
  }
  let plan;
  try {
    plan = buildPlan(options.root);
  } catch (error) {
    write(`${JSON.stringify({ schema: PLAN_SCHEMA, status: "unavailable", code: error.message })}\n`);
    return 2;
  }
  if (options.command === "plan") {
    write(`${JSON.stringify({ ...plan.payload, planSha256: plan.planSha256, applyAction: plan.action }, null, 2)}\n`);
    return 0;
  }
  if (options.planSha256 !== plan.planSha256) {
    write(`${JSON.stringify({ schema: APPLY_SCHEMA, status: "rejected", code: "PO-PROFILE-REPAIR-PLAN-STALE" })}\n`);
    return 2;
  }
  const published = publishPoGateProfileReceipt({
    rootDir: plan.payload.root,
    userYamlText: plan.source,
    runtimeYamlText: plan.runtime,
  });
  const readback = published.ok
    ? validatePoGateProfileForRepository({ repoRoot: plan.payload.root })
    : null;
  const applied = published.ok && readback?.ok === true;
  write(`${JSON.stringify({
    schema: APPLY_SCHEMA,
    status: applied ? "applied" : "unavailable",
    code: applied ? "PO-PROFILE-REPAIR-APPLIED" : published.code,
    planSha256: plan.planSha256,
  }, null, 2)}\n`);
  return applied ? 0 : 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
