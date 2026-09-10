#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".yaml", ".yml"]);
const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7})(?: .*)?$/mu;

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`CONSUMER-BASELINE-GIT-${args[0]}`);
  return result.stdout;
}

export function inspectConsumerBaseline(rootDir, deps = {}) {
  const root = resolve(rootDir);
  const runGit = deps.git ?? git;
  const read = deps.readFile ?? readFileSync;
  const spawn = deps.spawn ?? spawnSync;
  const tracked = runGit(root, ["ls-files", "-z"]).split("\0").filter(Boolean).sort();
  const findings = [];
  let jsonFiles = 0;
  let textFiles = 0;
  for (const relativePath of tracked) {
    if (!TEXT_EXTENSIONS.has(extname(relativePath).toLowerCase())) continue;
    let text;
    try { text = read(resolve(root, relativePath), "utf8"); }
    catch { findings.push({ code: "unreadable-tracked-text", path: relativePath }); continue; }
    textFiles += 1;
    if (CONFLICT_MARKER.test(text)) findings.push({ code: "merge-conflict-marker", path: relativePath });
    if (extname(relativePath).toLowerCase() === ".json") {
      jsonFiles += 1;
      try { JSON.parse(text); } catch { findings.push({ code: "invalid-json", path: relativePath }); }
    }
  }
  const diffCheck = spawn("git", ["-C", root, "diff", "--check", "HEAD"], { encoding: "utf8", shell: false });
  if (diffCheck.error || diffCheck.status !== 0) findings.push({ code: "git-diff-check", path: null });
  return Object.freeze({
    schema: "pipeline.consumer-baseline-result.v1",
    status: findings.length === 0 ? "passed" : "failed",
    checks: Object.freeze(["tracked-json-syntax", "tracked-merge-conflict-markers", "git-diff-check"]),
    inventory: Object.freeze({ trackedFiles: tracked.length, textFiles, jsonFiles }),
    findings: Object.freeze(findings),
  });
}
