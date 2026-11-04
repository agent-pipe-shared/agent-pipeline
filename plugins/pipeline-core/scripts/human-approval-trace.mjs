#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Read-only operator command: trace every human approval a gate consumed for a candidate commit back to the human's
 * detached proof (Q3, AC-108). Prints a table and a typed verdict (`traced`, `attribution-only`, `untraceable`).
 *   node human-approval-trace.mjs --repo <root> [--commit <oid>] [--format table|json] [--out <repo-relative path>]
 * Exit 0 for `traced` and `attribution-only`, 1 for `untraceable`, 2 for a command error. `--out` writes the JSON report
 * create-only inside the repository (for the audit bundle to carry); nothing else is ever written.
 */
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeJson } from "../lib/governance-event.mjs";
import { formatHumanApprovalTrace, traceHumanApprovals } from "../lib/human-approval-trace.mjs";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function parse(argv) {
  if (argv.length % 2 !== 0) fail("HAT-ARGUMENT", "Usage: human-approval-trace.mjs --repo <root> [--commit <oid>] [--format table|json] [--out <path>]");
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!["--repo", "--commit", "--format", "--out"].includes(key) || flags.has(key) || value === undefined || value.startsWith("--")) fail("HAT-ARGUMENT", "Human approval trace arguments are invalid.");
    flags.set(key, value);
  }
  if (!flags.has("--repo")) fail("HAT-ARGUMENT", "--repo is required.");
  const format = flags.get("--format") ?? "table";
  if (!["table", "json"].includes(format)) fail("HAT-ARGUMENT", "--format must be table or json.");
  return { repo: flags.get("--repo"), commit: flags.get("--commit") ?? null, format, out: flags.get("--out") ?? null };
}
function git(root, args) { const out = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10000, shell: false }); return out.status === 0 ? out.stdout.trim() : null; }
function reportPath(root, out) {
  if (isAbsolute(out) || out.includes("\\") || out.split("/").some((part) => part === "" || part === "." || part === "..")) fail("HAT-OUT", "--out must be a plain repository-relative path.");
  const target = resolve(root, out); const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("HAT-OUT", "--out must stay inside the repository.");
  return target;
}

export function main(argv = process.argv.slice(2), deps = {}) {
  const options = parse(argv); const root = realpathSync(resolve(options.repo));
  let candidate;
  if (options.commit !== null) {
    const commit = /^[a-f0-9]{40,64}$/u.test(options.commit) ? git(root, ["rev-parse", "--verify", `${options.commit}^{commit}`]) : null;
    const tree = commit === null ? null : git(root, ["rev-parse", `${commit}^{tree}`]);
    if (commit === null || tree === null) fail("HAT-CANDIDATE", "--commit must name a commit of this repository by its full object id.");
    candidate = { commit, tree };
  }
  const result = (deps.trace ?? traceHumanApprovals)({ repositoryRoot: root, ...(candidate ? { candidate } : {}), ...(deps.machinePlaneDeps ? { machinePlaneDeps: deps.machinePlaneDeps } : {}) });
  if (options.out !== null) {
    const target = reportPath(root, options.out); mkdirSync(dirname(target), { recursive: true });
    const fd = openSync(target, "wx", 0o644); try { writeFileSync(fd, `${canonicalizeJson(result)}\n`); } finally { closeSync(fd); }
  }
  return { result, text: options.format === "json" ? `${JSON.stringify(result)}\n` : formatHumanApprovalTrace(result) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const { result, text } = main(); process.stdout.write(text); if (result.status === "untraceable") process.exitCode = 1; }
  catch (error) { process.stderr.write(`${error.code ?? "HAT-FAILED"}: ${error.message}\n`); process.exitCode = 2; }
}
