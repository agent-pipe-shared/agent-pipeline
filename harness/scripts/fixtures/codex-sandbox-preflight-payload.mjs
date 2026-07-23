#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Fixed, public, model-free payload for the Codex sandbox A/B preflight. */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";

const SCHEMA = "pipeline.codex-sandbox-preflight-payload.v1";
const DENIAL_CODES = new Set(["EACCES", "EPERM", "EROFS"]);

function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function classify(operation) {
  try { return { status: "success", value: operation() }; }
  catch (error) { return { status: DENIAL_CODES.has(error?.code) ? "denied" : "error" }; }
}
function readProbe(path) { return classify(() => readFileSync(path, "utf8")); }
function writeProbe(path, value) { return classify(() => { writeFileSync(path, value, { flag: "wx", mode: 0o600 }); return true; }); }
function networkProbe(host, port) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status) => { if (settled) return; settled = true; socket.destroy(); resolve({ status }); };
    const socket = connect({ host, port });
    socket.setTimeout(2_000);
    socket.once("connect", () => finish("success"));
    socket.once("timeout", () => finish("denied"));
    socket.once("error", () => finish("denied"));
  });
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function appServerInitProbe(codexPath, codexHomePath) {
  if (typeof codexPath !== "string" || !codexPath.startsWith("/") || typeof codexHomePath !== "string" || !codexHomePath.startsWith("/")) {
    return { initialized: false, boundedStopObserved: false, errorClass: "request-invalid" };
  }
  const child = spawn(codexPath, ["app-server", "--stdio", "--strict-config"], {
    env: {
      HOME: codexHomePath,
      CODEX_HOME: codexHomePath,
      CODEX_SQLITE_HOME: codexHomePath,
      PATH: process.env.PATH || "/usr/bin:/bin",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
    },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let initialized = false;
  let overflow = false;
  let spawnError = null;
  const close = new Promise((resolve) => {
    child.once("error", (error) => { spawnError = error?.code || "spawn-error"; resolve({ code: null, signal: null }); });
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    if (Buffer.byteLength(stdout) > 65_536) { overflow = true; child.kill("SIGTERM"); return; }
    for (const line of stdout.split("\n").filter(Boolean)) {
      try {
        const value = JSON.parse(line);
        if (value?.id === 1 && value?.result?.codexHome === codexHomePath
          && typeof value.result.userAgent === "string" && typeof value.result.platformFamily === "string") initialized = true;
      } catch { /* wait for a complete line */ }
    }
  });
  child.stdin.end(`${JSON.stringify({ method: "initialize", id: 1, params: { clientInfo: { name: "pipeline-preflight", title: null, version: "1" }, capabilities: { experimentalApi: false, requestAttestation: false } } })}\n${JSON.stringify({ method: "initialized" })}\n`);
  const handshake = await Promise.race([close.then(() => "closed"), (async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) { if (initialized || overflow || spawnError) break; await wait(10); }
    return initialized ? "initialized" : "timeout";
  })()]);
  if (handshake !== "closed") child.kill("SIGTERM");
  let stopped = await Promise.race([close.then(() => true), wait(2_000).then(() => false)]);
  if (!stopped) { child.kill("SIGKILL"); stopped = await Promise.race([close.then(() => true), wait(2_000).then(() => false)]); }
  return {
    initialized: initialized && !overflow && !spawnError,
    boundedStopObserved: stopped,
    errorClass: initialized && stopped && !overflow && !spawnError ? null : overflow ? "output-truncated" : spawnError || (handshake === "timeout" ? "timeout" : "initialization-error"),
  };
}

let request;
try {
  request = JSON.parse(Buffer.from(process.argv[2] || "", "base64url").toString("utf8"));
} catch {
  process.exitCode = 64;
  emit({ schema: SCHEMA, type: "error", errorClass: "request-invalid" });
  process.exit();
}

emit({ schema: SCHEMA, type: "started" });
const input = await new Promise((resolve) => {
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
});

const child = spawnSync(process.execPath, ["-e", "process.stdout.write('OUT');process.stderr.write('ERR');process.exit(7)"], {
  encoding: "utf8",
  shell: false,
  timeout: 10_000,
});
const appServer = await appServerInitProbe(request.codexPath, request.codexHomePath);
const result = {
  schema: SCHEMA,
  type: "result",
  stdin: input.toString("base64"),
  eof: true,
  child: {
    status: child.status,
    stdout: child.stdout || "",
    stderr: child.stderr || "",
    errorClass: child.error ? DENIAL_CODES.has(child.error.code) ? "permission-denial" : child.error.code === "ETIMEDOUT" ? "timeout" : "spawn-error" : null,
  },
  appServer,
  probes: {
    allowedRead: readProbe(request.allowedReadPath).status,
    externalRead: readProbe(request.externalReadPath).status,
    sensitiveRead: readProbe(request.sensitiveReadPath).status,
    deniedWrite: writeProbe(request.deniedWritePath, "DENIED-WRITE-PROBE\n").status,
    scratchWrite: writeProbe(request.scratchWritePath, "SCRATCH-WRITE-PROBE\n").status,
    network: (await networkProbe(request.networkHost, request.networkPort)).status,
  },
};
emit(result);
