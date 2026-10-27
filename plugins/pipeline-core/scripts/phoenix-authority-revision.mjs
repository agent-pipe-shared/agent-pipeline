#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Proof-gated wrapper around the existing continuity authority revision writer. */
import { run as approve } from "./phoenix-authority-approval.mjs";
import { run as pipelineState } from "./pipeline-state.mjs";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// D166-PH: `plan` may also write its (read-only) plan JSON to --out, a path under scratch/; UTF-8, no BOM.
const OUT_PATH = /^scratch\/[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/u;
function planWithOut(values, deps) {
  const args = ["continuity-authority-revision-plan", "--proposal-file", values.proposalFile];
  if (values.out === undefined) return pipelineState(args, deps);
  if (!OUT_PATH.test(values.out) || values.out.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error("invalid --out");
  const lines = []; const original = console.log;
  console.log = (...parts) => { lines.push(parts.join(" ")); };
  let code;
  try { code = pipelineState(args, deps); } finally { console.log = original; }
  if (code === 0) { const target = resolve(values.repoRoot, values.out); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, `${lines.join("\n")}\n`, "utf8"); }
  for (const line of lines) console.log(line);
  return code;
}
import { fileURLToPath } from "node:url";

function parse(argv) {
  const [command, ...rest] = argv; const values = { command };
  for (let index = 0; index < rest.length; index += 2) { if (!rest[index]?.startsWith("--") || !rest[index + 1]) throw new Error("invalid arguments"); values[rest[index].slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = rest[index + 1]; }
  if (!new Set(["plan", "apply"]).has(command) || !values.repoRoot || !values.directory || !values.proposalFile) throw new Error("Usage: phoenix-authority-revision.mjs plan|apply --repo-root <repo> --directory <external-dir> --proposal-file <repo-file> [--out <scratch/file> (plan only)] [--request-file <repo-file> --request-sha256 <sha> --lock-token <8-128 chars>]");
  return values;
}
export function run(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const verified = approve(["verify", "--repo-root", values.repoRoot, "--directory", values.directory, "--proposal", values.proposalFile]);
  if (!verified.ok) return 2;
  const deps = { dir: values.repoRoot, authorityRevisionApproval: ({ repoRoot, ...approval }) => JSON.stringify(approval) === JSON.stringify(verified.approval) ? { ok: true, value: approval } : { ok: false, code: "PHOENIX-AUTHORITY-PROOF-MISMATCH" } };
  return values.command === "plan"
    ? planWithOut(values, deps)
    : pipelineState(["continuity-authority-revision-apply", "--request-file", values.requestFile, "--request-sha256", values.requestSha256, "--lock-token", values.lockToken], deps);
}
function isMainModule() {
  if (typeof process.argv[1] !== "string" || process.argv[1].length === 0) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
if (isMainModule()) process.exitCode = run();
