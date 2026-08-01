#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync, renameSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import {
  RECOVERY_BRIDGE_DECISION_SCHEMA,
  RECOVERY_BRIDGE_ISSUANCE_CUTOFF,
  recoveryBridgeDecisionDigest,
  run,
  validateRecoveryBridgeDecision,
} from "./pipeline-state.mjs";

const ROOT = realpathSync(resolve(dirname(new URL(import.meta.url).pathname), "..", ".."));
const OUTPUT = resolve(ROOT, "evidence/phoenix-recovery-bridge-decision.json");
const REQUEST_OUTPUT = resolve(ROOT, "evidence/phoenix-recovery-bridge-request.json");
const TARGETS = Object.freeze({
  manifest: "specs/sprint-phoenix-epic/lifecycle.json",
  recovery: "specs/sprint-phoenix-epic/RECOVERY.md",
  prd: "specs/sprint-phoenix-epic/prd_phoenix-epic.md",
  spec: "specs/sprint-phoenix-epic/spec.md",
});
const APPROVAL = Object.freeze({
  what: "Reconcile the current RECOVERY.md digest in the Phoenix lifecycle manifest.",
  why: "The Recovery record changed after its prior digest was recorded, so verification needs the manifest to bind the current reviewed bytes.",
  scope: "Only the lifecycle manifest digest entry and the sanctioned writer receipt may change.",
  notAuthorized: "This does not authorize product implementation, a new dispatch, edits to RECOVERY.md, remote actions, or a completion claim.",
});

function fail(message) { throw new Error(message); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function readRegular(relativePath) {
  if (typeof relativePath !== "string" || isAbsolute(relativePath) || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")) fail("unsafe target path");
  const path = resolve(ROOT, relativePath);
  if (relative(ROOT, path).startsWith("..")) fail("target escaped repository root");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`target is not a physical regular file: ${relativePath}`);
  return readFileSync(path);
}
function issueArgs(argv) {
  if (argv.length !== 3 || argv[0] !== "issue" || argv[1] !== "--ttl-minutes" || !/^[1-9][0-9]{0,2}$/.test(argv[2])) {
    fail("usage: node harness/scripts/phoenix-recovery-bridge-decision-helper.mjs issue --ttl-minutes <1-999>");
  }
  return Number(argv[2]);
}
function exactAction(argv, action) {
  if (argv.length !== 0) fail(`usage: node harness/scripts/phoenix-recovery-bridge-decision-helper.mjs ${action}`);
}
function iso(value) { return new Date(value).toISOString(); }
function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, value, { encoding: "utf8", flag: "wx", mode: 0o600 });
  renameSync(temporary, path);
}

try {
  if (realpathSync(process.cwd()) !== ROOT) fail(`run from the repository root: ${ROOT}`);
  const [action, ...argv] = process.argv.slice(2);
  if (action === "preview") {
    exactAction(argv, "preview");
    console.log(JSON.stringify({
      status: "preview",
      approval: APPROVAL,
      command: "node harness/scripts/phoenix-recovery-bridge-decision-helper.mjs issue --ttl-minutes 30",
    }, null, 2));
  } else if (action === "issue") {
    const ttlMinutes = issueArgs([action, ...argv]);
    if (lstatSync(OUTPUT, { throwIfNoEntry: false }) !== undefined) fail(`refusing to overwrite existing decision: ${OUTPUT}`);
    const approvedAt = iso(Date.now());
    const expiresAt = iso(Date.parse(approvedAt) + ttlMinutes * 60_000);
    if (Date.parse(expiresAt) > Date.parse(RECOVERY_BRIDGE_ISSUANCE_CUTOFF)) fail("requested expiry exceeds the fixed issuance cutoff");
    const decision = {
      schema: RECOVERY_BRIDGE_DECISION_SCHEMA,
      decisionId: `rb-${randomBytes(16).toString("hex")}`,
      decisionSha256: "0".repeat(64),
      featureId: "sprint-phoenix-epic",
      operation: "reconcile-mutable-design",
      manifest: TARGETS.manifest,
      artifactPath: TARGETS.recovery,
      assurance: "operator-local-attested",
      manifestPreimageSha256: digest(readRegular(TARGETS.manifest)),
      recoveryPostimageSha256: digest(readRegular(TARGETS.recovery)),
      prdSha256: digest(readRegular(TARGETS.prd)),
      specSha256: digest(readRegular(TARGETS.spec)),
      approvedBy: "PO",
      approvedAt,
      expiresAt,
      approval: APPROVAL,
      status: "issued",
    };
    decision.decisionSha256 = recoveryBridgeDecisionDigest(decision);
    if (!validateRecoveryBridgeDecision(decision, { now: approvedAt }).ok) fail("generated decision failed validation");
    atomicWrite(OUTPUT, `${JSON.stringify(decision, null, 2)}\n`);
    const written = JSON.parse(readFileSync(OUTPUT, "utf8"));
    if (written.decisionSha256 !== decision.decisionSha256 || !validateRecoveryBridgeDecision(written, { now: approvedAt }).ok) fail("decision readback failed");
    console.log(JSON.stringify({ status: "issued", decisionFile: "evidence/phoenix-recovery-bridge-decision.json", decisionId: decision.decisionId, decisionSha256: decision.decisionSha256, approvedAt, expiresAt, approval: APPROVAL }));
  } else if (action === "plan") {
    exactAction(argv, "plan");
    if (lstatSync(REQUEST_OUTPUT, { throwIfNoEntry: false }) !== undefined) fail(`refusing to overwrite existing request: ${REQUEST_OUTPUT}`);
    readRegular("evidence/phoenix-recovery-bridge-decision.json");
    const logs = [];
    const originalLog = console.log;
    console.log = (value) => logs.push(String(value));
    let code;
    try { code = run(["recovery-bridge-plan", "--decision-file", "evidence/phoenix-recovery-bridge-decision.json"], { dir: ROOT }); }
    finally { console.log = originalLog; }
    if (code !== 0 || logs.length !== 1) fail("bridge planner did not produce one exact request");
    const planned = JSON.parse(logs[0]);
    if (planned?.schema !== "pipeline.recovery-bridge-plan.v1" || planned.status !== "ready" || typeof planned.requestSha256 !== "string" || !planned.request) fail("bridge planner output is invalid");
    atomicWrite(REQUEST_OUTPUT, `${JSON.stringify(planned.request, null, 2)}\n`);
    const written = JSON.parse(readFileSync(REQUEST_OUTPUT, "utf8"));
    if (JSON.stringify(written) !== JSON.stringify(planned.request)) fail("request readback failed");
    console.log(JSON.stringify({ status: "planned", requestFile: "evidence/phoenix-recovery-bridge-request.json", requestSha256: planned.requestSha256, decisionSha256: planned.request.authority.decision.decisionSha256, expiresAt: planned.request.expiresAt, approval: planned.request.authority.decision.approval ?? null }));
  } else fail("usage: node harness/scripts/phoenix-recovery-bridge-decision-helper.mjs <preview|issue|plan> ...");
} catch (error) {
  console.error(`phoenix-recovery-bridge-decision-helper: ${error.message}`);
  process.exit(2);
}
