#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Digest-bound B1-I CLI.
 *
 * `plan` and `inspect` are read-only. `run`, `cancel`, and `cleanup` require
 * both the exact digest and `--activate`. Provider-backed Codex execution
 * additionally requires `--allow-provider-execution`.
 */
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  cancelLocalWorkerSupervisor,
  cleanupLocalWorkerSupervisor,
  inspectLocalWorkerSupervisor,
  planLocalWorkerSupervisor,
  runLocalWorkerSupervisor,
} from "../lib/local-worker-supervisor.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const MAX_REQUEST_BYTES = 65_536;
const SHA256 = /^[a-f0-9]{64}$/u;

function parseFlags(argv) {
  const command = argv[0];
  if (!["plan", "run", "cancel", "inspect", "cleanup"].includes(command)) throw new Error("usage");
  const flags = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error("usage");
    const key = token.slice(2);
    if (["activate", "allow-provider-execution"].includes(key)) {
      if (Object.hasOwn(flags, key)) throw new Error("usage");
      flags[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--") || Object.hasOwn(flags, key)) throw new Error("usage");
    flags[key] = value;
    index += 1;
  }
  return { command, flags };
}

function loadRequest(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) throw new Error("request");
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_REQUEST_BYTES) throw new Error("request");
  return JSON.parse(readFileSync(path, "utf8"));
}

function stateRoot(value) {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value) throw new Error("state-root");
  return value;
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export async function run(argv = process.argv.slice(2)) {
  let parsed;
  try { parsed = parseFlags(argv); }
  catch {
    write({ schema: "pipeline.local-worker-supervisor-cli.v1", ok: false, code: "LWS-USAGE" });
    return 2;
  }
  try {
    const root = stateRoot(parsed.flags["state-root"]);
    if (parsed.command === "inspect") {
      if (Object.keys(parsed.flags).sort().join(",") !== "state-root") throw new Error("usage");
      const result = inspectLocalWorkerSupervisor({ stateRoot: root });
      write({ schema: "pipeline.local-worker-supervisor-cli.v1", ...result });
      return result.ok ? 0 : 2;
    }
    if (["cancel", "cleanup"].includes(parsed.command)) {
      const allowed = ["activate", "record-sha256", "state-root"];
      if (Object.keys(parsed.flags).sort().join(",") !== allowed.sort().join(",")
        || !SHA256.test(parsed.flags["record-sha256"] ?? "")) throw new Error("usage");
      const operation = parsed.command === "cancel"
        ? cancelLocalWorkerSupervisor
        : cleanupLocalWorkerSupervisor;
      const result = operation({
        stateRoot: root,
        expectedRecordSha256: parsed.flags["record-sha256"],
        activate: parsed.flags.activate === true,
      });
      write({ schema: "pipeline.local-worker-supervisor-cli.v1", ...result });
      return result.ok ? 0 : 2;
    }
    const request = loadRequest(parsed.flags.request);
    if (parsed.command === "plan") {
      if (Object.keys(parsed.flags).sort().join(",") !== ["request", "state-root"].sort().join(",")) throw new Error("usage");
      const result = planLocalWorkerSupervisor({ request, stateRoot: root });
      write({ schema: "pipeline.local-worker-supervisor-cli.v1", ...result });
      return result.ok ? 0 : 2;
    }
    const allowed = ["activate", "allow-provider-execution", "plan-sha256", "request", "state-root"];
    const supplied = Object.keys(parsed.flags);
    if (!supplied.every((key) => allowed.includes(key))
      || !["activate", "plan-sha256", "request", "state-root"].every((key) => supplied.includes(key))
      || !SHA256.test(parsed.flags["plan-sha256"] ?? "")) throw new Error("usage");
    const result = await runLocalWorkerSupervisor({
      request,
      stateRoot: root,
      expectedPlanSha256: parsed.flags["plan-sha256"],
      activate: parsed.flags.activate === true,
      allowProviderExecution: parsed.flags["allow-provider-execution"] === true,
    });
    write({ schema: "pipeline.local-worker-supervisor-cli.v1", ...result });
    return result.ok ? 0 : 2;
  } catch {
    write({ schema: "pipeline.local-worker-supervisor-cli.v1", ok: false, code: "LWS-UNAVAILABLE" });
    return 2;
  }
}

if (isDirectInvocation(import.meta.url)) {
  process.exitCode = await run();
}
