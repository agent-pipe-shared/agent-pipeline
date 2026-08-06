#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import {
  HELPER_PATH,
  TICKET_SCHEMA,
  canonicalJson,
  failLaunchTicket,
  issueLaunchTicket,
} from "../lib/codex-onboarding-runtime.mjs";
import { READBACK_STATUS_SCHEMA } from "./codex-project-runtime-readback-host.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const READBACK_TIMEOUT_MS = 35_000;
const READBACK_MAX_BUFFER = 128 * 1024;
const FAILURE_CODE = /^[a-z][a-z0-9-]{0,63}$/u;

function parse(argv) {
  if (argv.length !== 5 || argv[0] !== "--root" || argv[2] !== "--barrier-sha256" || argv[4] !== "--activate"
    || !/^[a-f0-9]{64}$/u.test(argv[3])) throw new Error("Usage: codex-onboarding-launch.mjs --root <project-root> --barrier-sha256 <sha256> --activate");
  return { rootDir: argv[1], barrierSha256: argv[3] };
}
export function main(argv = process.argv.slice(2), {
  spawn = spawnSync,
  write = process.stdout.write.bind(process.stdout),
  env = process.env,
  cwd = process.cwd(),
  realpath = realpathSync,
} = {}) {
  let issued;
  let readbackProduced = false;
  let options;
  const reportFailure = (fallbackCode, readback = null) => {
    let code = fallbackCode;
    try {
      const observed = JSON.parse(String(readback?.stdout ?? ""));
      if (observed?.schema === READBACK_STATUS_SCHEMA
        && observed.status === "unavailable"
        && FAILURE_CODE.test(observed.code ?? "")) code = observed.code;
    } catch {}
    let retryAllowed = false;
    if (issued && options) {
      try {
        retryAllowed = failLaunchTicket({
          rootDir: options.rootDir,
          barrierSha256: options.barrierSha256,
          ticketId: issued.ticketId,
          token: issued.token,
          failureCode: code,
        }).retryAllowed === true;
      } catch {}
    }
    write(`${canonicalJson({
      schema: TICKET_SCHEMA,
      status: "readback-unavailable",
      code,
      ...(issued ? {
        ticketId: issued.ticketId,
        retryAllowed,
        ...(retryAllowed ? {} : { retryAfterEpochMs: issued.expiresAtEpochMs }),
      } : {}),
    })}\n`);
    return 2;
  };
  try {
    options = parse(argv);
    // The launch command is deliberately rooted at the attended terminal's
    // current physical directory.  A digest binds runtime state to a project,
    // but it must never turn a different --root into an implicit workspace
    // migration.  This still supports legitimate /tmp workspaces: invoke the
    // command from that already-attested workspace, with --root .
    const workspaceRoot = realpath(resolve(cwd));
    if (realpath(resolve(workspaceRoot, options.rootDir)) !== workspaceRoot) {
      write(`${canonicalJson({
        schema: TICKET_SCHEMA,
        status: "workspace-root-mismatch",
      })}\n`);
      return 2;
    }
    options = { ...options, rootDir: workspaceRoot };
    if (typeof env.CODEX_THREAD_ID === "string" && env.CODEX_THREAD_ID !== "") {
      write(`${canonicalJson({ schema: TICKET_SCHEMA, status: "external-launch-required" })}\n`);
      return 2;
    }
    issued = issueLaunchTicket(options);
    const ticketEnvironment = {
      ...env,
      PIPELINE_CODEX_ONBOARDING_TICKET_ID: issued.ticketId,
      PIPELINE_CODEX_ONBOARDING_TOKEN: issued.token.toString("hex"),
    };
    const readback = spawn(process.execPath, [HELPER_PATH, "--root", options.rootDir], {
      cwd: options.rootDir,
      encoding: "utf8",
      env: ticketEnvironment,
      maxBuffer: READBACK_MAX_BUFFER,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: READBACK_TIMEOUT_MS,
    });
    const expectedReadback = `${canonicalJson({
      schema: READBACK_STATUS_SCHEMA,
      status: "produced",
    })}\n`;
    if (readback?.status !== 0
      || (readback?.signal !== null && readback?.signal !== undefined)
      || readback?.error !== undefined
      || readback?.stdout !== expectedReadback
      || readback?.stderr !== "") {
      return reportFailure("runtime-readback-unavailable", readback);
    }
    readbackProduced = true;
    const cleanEnvironment = { ...env };
    delete cleanEnvironment.PIPELINE_CODEX_ONBOARDING_TICKET_ID;
    delete cleanEnvironment.PIPELINE_CODEX_ONBOARDING_TOKEN;
    const result = spawn(issued.executable, ["-C", options.rootDir, "pipeline-core:pipeline-start"], {
      cwd: options.rootDir, shell: false, stdio: "inherit",
      env: cleanEnvironment,
    });
    write(`${canonicalJson({
      schema: TICKET_SCHEMA,
      status: result?.status === 0 ? "launched" : "readback-produced",
      ticketId: issued.ticketId,
    })}\n`);
    return 0;
  } catch {
    if (issued && !readbackProduced) return reportFailure("transport-unavailable");
    write(`${canonicalJson({
      schema: TICKET_SCHEMA,
      status: readbackProduced ? "readback-produced" : "launch-unavailable",
      ...(issued ? {
        ticketId: issued.ticketId,
        ...(readbackProduced ? {} : { retryAfterEpochMs: issued.expiresAtEpochMs }),
      } : {}),
    })}\n`);
    return readbackProduced ? 0 : 2;
  }
}
if (isDirectInvocation(import.meta.url)) process.exitCode = main();
