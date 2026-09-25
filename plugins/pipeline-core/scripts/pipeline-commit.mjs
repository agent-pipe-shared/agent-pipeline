#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { commitPipeline } from "../lib/pipeline-commit.mjs";
function parse(argv) {
  const out = { root: process.cwd(), execute: false };
  const bodies = [];
  const single = new Set(["--root", "--type", "--scope", "--message", "--summary", "--dispatch-record", "--timeout-ms"]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--execute") {
      if (seen.has(key)) throw new Error("usage: duplicate --execute");
      seen.add(key);
      out.execute = true;
      continue;
    }
    if ((!single.has(key) && key !== "--body") || (key !== "--body" && seen.has(key))) throw new Error("usage: invalid or duplicate flag");
    const value = argv[++index];
    if (typeof value !== "string" || value === "" || value.startsWith("--") || /[\r\n\0]/u.test(value)) throw new Error("usage: values must be nonempty single-line argv entries");
    if (key === "--body") bodies.push(value);
    else {
      seen.add(key);
      out[key.slice(2).replace(/-([a-z])/gu, (_, c) => c.toUpperCase())] = value;
    }
  }
  if (seen.has("--message") && (seen.has("--summary") || bodies.length > 0)) throw new Error("usage: --message cannot be mixed with structured fields");
  if (seen.has("--summary")) {
    if (bodies.length === 0) throw new Error("usage: structured commits require a WHY body");
    out.message = `${out.summary}\n\n${bodies.join("\n\n")}`;
    delete out.summary;
  }
  if (seen.has("--timeout-ms")) {
    const timeout = Number(out.timeoutMs);
    if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 300_000) throw new Error("usage: timeout out of range");
    out.timeoutMs = timeout;
  }
  if (!out.type || !out.scope || !out.message || !out.dispatchRecord) throw new Error("usage: type, scope, message and dispatch record are required");
  return out;
}
export function runPipelineCommitCli(argv, { commit = commitPipeline, stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const result = commit(parse(argv));
    if (!["preview", "committed", "recovery-required"].includes(result?.status)) throw Object.assign(new Error("invalid commit result"), { code: "PC-RESULT" });
    stdout.write(`${JSON.stringify(result)}\n`);
    return result.status === "recovery-required" ? 3 : 0;
  } catch (error) {
    stderr.write(`pipeline-commit: ${error?.code ?? "PC-FAILED"}\n`);
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runPipelineCommitCli(process.argv.slice(2));
}
export { parse };
