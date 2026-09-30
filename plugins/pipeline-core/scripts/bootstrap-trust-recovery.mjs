#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Attended first-anchor recovery when an agent's onboarding driver cannot run.
 * This is an external-terminal operation, not a human-guard override: it does
 * not mark a session ready or waive any signature gate. The existing bounded
 * first-anchor transaction remains the only writer of the key pointers and
 * public repository anchor.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { applyTrustAnchorBootstrap } from "./onboarding-init.mjs";

const SCHEMA = "pipeline.bootstrap-trust-recovery.v1";
const SCRIPT = fileURLToPath(import.meta.url);
const HEX = /^[a-f0-9]{64}$/u;
const FIELDS = new Set(["--root", "--mode", "--directory", "--human-name", "--existing-key", "--plan-sha256"]);

function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function fileSha(path) { try { return existsSync(path) ? sha(readFileSync(path)) : null; } catch { return null; } }
function refusal(code) { return { schema: SCHEMA, ok: false, code }; }
function physicalPath(path) {
  let cursor = path;
  const missing = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error("no existing path ancestor");
    missing.unshift(cursor.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
    cursor = parent;
  }
  return resolve(realpathSync(cursor), ...missing);
}
function outside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

function parse(argv) {
  const [operation, ...rest] = argv;
  if (!["plan", "apply"].includes(operation) || rest.length % 2 !== 0) return null;
  const values = new Map();
  for (let i = 0; i < rest.length; i += 2) {
    if (!FIELDS.has(rest[i]) || values.has(rest[i])) return null;
    values.set(rest[i], rest[i + 1]);
  }
  const required = ["--root", "--mode", "--directory", "--human-name", "--existing-key"];
  if (required.some((field) => !values.has(field)) || values.size !== required.length + (operation === "apply" ? 1 : 0)) return null;
  if (operation === "apply" && !HEX.test(values.get("--plan-sha256") ?? "")) return null;
  return { operation, values };
}

/** A plan binds the exact repository preimage and destination before prompting. */
export function planBootstrapTrustRecovery({ rootDir, mode, directory, humanName, existingKey, runGit = spawnSync } = {}) {
  if (!["existing", "new"].includes(mode) || ![rootDir, directory, humanName, existingKey].every((v) => typeof v === "string" && v.length > 0)) {
    return refusal("BTR-INPUT-INVALID");
  }
  if (!isAbsolute(rootDir) || !isAbsolute(directory) || (mode === "existing" && !isAbsolute(existingKey))
    || (mode === "new" && existingKey !== "none") || /[\r\n\0]/u.test(humanName)) return refusal("BTR-INPUT-INVALID");
  const root = resolve(rootDir);
  const target = resolve(directory);
  if (!outside(root, target)) return refusal("BTR-KEY-DIRECTORY-IN-REPOSITORY");
  try {
    if (!outside(physicalPath(root), physicalPath(target))) return refusal("BTR-KEY-DIRECTORY-IN-REPOSITORY");
  } catch { return refusal("BTR-PHYSICAL-PATH-UNAVAILABLE"); }
  if (!existsSync(join(root, "pipeline.user.yaml")) || !existsSync(join(root, "project", "critical-human-proof.json"))) {
    return refusal("BTR-ONBOARDING-PREIMAGE-MISSING");
  }
  const git = runGit("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", shell: false });
  if (git?.status !== 0 || typeof git.stdout !== "string" || !git.stdout.trim()) return refusal("BTR-GIT-UNAVAILABLE");
  const common = resolve(root, git.stdout.trim());
  const policyPath = join(root, "project", "critical-human-proof.json");
  const userPath = join(root, "pipeline.user.yaml");
  const intent = {
    schema: SCHEMA,
    root,
    common,
    mode,
    directory: target,
    humanName,
    existingKeyPathSha256: mode === "existing" ? sha(resolve(existingKey)) : null,
    existingKeySha256: mode === "existing" ? fileSha(resolve(existingKey)) : null,
    sourceSha256: fileSha(userPath),
    policySha256: fileSha(policyPath),
  };
  if (intent.sourceSha256 === null || intent.policySha256 === null) return refusal("BTR-ONBOARDING-PREIMAGE-UNREADABLE");
  if (mode === "existing" && intent.existingKeySha256 === null) return refusal("BTR-EXISTING-KEY-UNAVAILABLE");
  const planSha256 = sha(JSON.stringify(intent));
  return { schema: SCHEMA, ok: true, code: "BTR-PLAN-READY", intent, planSha256,
    applyAction: { kind: "external-operator", executable: process.execPath,
      argv: [SCRIPT, "apply", "--root", root, "--mode", mode, "--directory", target,
        "--human-name", humanName, "--existing-key", existingKey, "--plan-sha256", planSha256] },
    effect: "First public trust anchor and exact machine/repository key-directory pointers only; no lifecycle or gate override." };
}

function auditReceipt(plan, result) {
  const common = plan.intent.common;
  if (!lstatSync(common).isDirectory() || lstatSync(common).isSymbolicLink()) throw new Error("unsafe git common directory");
  const directory = join(plan.intent.common, "agent-pipeline", "bootstrap-trust-recovery");
  const parent = dirname(directory);
  if (existsSync(parent) && (!lstatSync(parent).isDirectory() || lstatSync(parent).isSymbolicLink())) throw new Error("unsafe audit parent");
  if (existsSync(directory) && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()
    || (process.platform !== "win32" && (lstatSync(directory).mode & 0o022) !== 0))) throw new Error("unsafe audit directory");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${plan.planSha256}.json`);
  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("unsafe audit file");
    const prior = JSON.parse(readFileSync(path, "utf8"));
    if (prior?.schema !== SCHEMA || prior.planSha256 !== plan.planSha256 || prior.resultCode !== result.code) throw new Error("audit collision");
    return path;
  }
  const body = `${JSON.stringify({ schema: SCHEMA, planSha256: plan.planSha256, root: plan.intent.root,
    mode: plan.intent.mode, resultCode: result.code, recordedAt: new Date().toISOString(),
    basis: "external-terminal-confirmed-unattested" }, null, 2)}\n`;
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, body); fsyncSync(fd); }
  finally { closeSync(fd); }
  return path;
}

/** Confirmation is deliberately injected in tests; production reads an attached TTY. */
export async function applyBootstrapTrustRecovery(options, { confirm, apply = applyTrustAnchorBootstrap, audit = auditReceipt } = {}) {
  const plan = planBootstrapTrustRecovery(options);
  if (!plan.ok) return plan;
  if (options.planSha256 !== plan.planSha256) return refusal("BTR-PLAN-DRIFT");
  if (typeof confirm !== "function" || await confirm(plan) !== plan.planSha256) return refusal("BTR-NOT-CONFIRMED");
  const result = apply({ rootDir: plan.intent.root, mode: plan.intent.mode, directory: plan.intent.directory,
    humanName: plan.intent.humanName, existingKey: options.existingKey });
  if (!result?.ok) return { schema: SCHEMA, ok: false, code: result?.code ?? "BTR-SETUP-FAILED" };
  try {
    const auditPath = audit(plan, result);
    return { schema: SCHEMA, ok: true, code: "BTR-RECOVERED", planSha256: plan.planSha256, auditPath,
      basis: "external-terminal-confirmed-unattested", anchorCode: result.code };
  } catch {
    return { schema: SCHEMA, ok: false, code: "BTR-SOURCE-COMPLETE-AUDIT-UNAVAILABLE", planSha256: plan.planSha256 };
  }
}

export async function main(argv = process.argv.slice(2), io = process) {
  const parsed = parse(argv);
  if (!parsed) {
    io.stderr.write("Usage: bootstrap-trust-recovery.mjs plan|apply --root ABS --mode existing|new --directory ABS --human-name NAME --existing-key ABS|none [--plan-sha256 HEX for apply]\n");
    return 2;
  }
  const values = parsed.values;
  const options = { rootDir: values.get("--root"), mode: values.get("--mode"), directory: values.get("--directory"),
    humanName: values.get("--human-name"), existingKey: values.get("--existing-key"), planSha256: values.get("--plan-sha256") };
  if (parsed.operation === "plan") {
    const result = planBootstrapTrustRecovery(options);
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }
  if (!io.stdin.isTTY || !io.stdout.isTTY) {
    io.stderr.write(`${JSON.stringify(refusal("BTR-EXTERNAL-TTY-REQUIRED"))}\n`);
    return 2;
  }
  const result = await applyBootstrapTrustRecovery(options, { confirm: async (plan) => {
    const terminal = createInterface({ input: io.stdin, output: io.stdout });
    try {
      io.stdout.write(`First-anchor recovery for ${plan.intent.root}. This does not waive any approval gate.\nType the plan digest ${plan.planSha256} to continue: `);
      return (await terminal.question("")).trim();
    } finally { terminal.close(); }
  } });
  io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) process.exit(await main());
