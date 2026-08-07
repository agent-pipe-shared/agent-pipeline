#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { inspectObservationGovernanceBootstrap } from "../lib/observation-governance-bootstrap.mjs";

const args = process.argv.slice(2);
const index = args.indexOf("--root");
if (args.length !== 2 || index !== 0) { process.stderr.write("usage: observation-governance-bootstrap.mjs --root <project>\n"); process.exitCode = 64; }
else {
  const root = resolve(args[1]); const observed = inspectObservationGovernanceBootstrap({ rootDir: root });
  if (observed.status !== "required") { process.stdout.write(`${JSON.stringify(observed)}\n`); process.exitCode = observed.status === "failed" ? 1 : 0; }
  else {
    const result = spawnSync(process.execPath, [resolve(root, observed.checker), "--root", root], { cwd: root, encoding: "utf8", shell: false });
    const status = result.status === 0 ? "passed" : "failed";
    process.stdout.write(`${JSON.stringify({ ...observed, status, code: status === "passed" ? null : "OGB-CHECK-FAILED" })}\n`);
    process.exitCode = status === "passed" ? 0 : 1;
  }
}
