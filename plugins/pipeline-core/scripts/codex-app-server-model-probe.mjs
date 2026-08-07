#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Bounded App Server model-start probe.
 *
 * Daemon version health does not prove that Codex can resolve the requested
 * model.  This performs no turn and supplies no repository content: it only
 * initializes a disposable App Server process and starts one ephemeral,
 * read-only thread for the fixed review model.
 */
import { spawn } from "node:child_process";

const MODEL = "gpt-5.6-sol";
const PROVIDER = "openai";
const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 60_000;

function result(status, code, detail = null) {
  process.stdout.write(`${JSON.stringify({ schema: "pipeline.codex-app-server-model-probe.v1", status, code, detail })}\n`);
}

function fail(code, detail = null) {
  result("unavailable", code, detail);
  process.exitCode = 2;
}

const codexPath = process.argv[2];
if (typeof codexPath !== "string" || !codexPath.startsWith("/")) {
  fail("CAS-MODEL-PROBE-INPUT");
} else {
  const child = spawn(codexPath, ["app-server", "--stdio", "--strict-config"], {
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  let bytes = 0;
  let initialized = false;
  let completed = false;
  let settled = false;
  const finish = (code, detail = null) => {
    if (settled) return;
    settled = true;
    child.stdin.end();
    if (code === "CAS-MODEL-READY") result("ready", code, detail);
    else fail(code, detail);
  };
  const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
  const timer = setTimeout(() => finish("CAS-MODEL-PROBE-TIMEOUT"), TIMEOUT_MS);
  child.once("error", (error) => finish("CAS-MODEL-PROBE-EXECUTION", error?.code ?? "spawn-error"));
  child.once("close", (code, signal) => {
    clearTimeout(timer);
    if (!settled) finish("CAS-MODEL-PROBE-EXIT", signal ?? `exit-${code}`);
  });
  child.stderr.on("data", () => {});
  child.stdout.on("data", (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) { finish("CAS-MODEL-PROBE-OUTPUT"); return; }
    buffer += chunk.toString("utf8");
    let newline;
    while (!settled && (newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { finish("CAS-MODEL-PROBE-PROTOCOL"); return; }
      if (message?.id === 1) {
        if (initialized || message.error || !message.result) { finish("CAS-MODEL-PROBE-INITIALIZE"); return; }
        initialized = true;
        send({ method: "initialized" });
        send({ id: 2, method: "thread/start", params: {
          cwd: process.cwd(), model: MODEL, allowProviderModelFallback: false,
          ephemeral: true, approvalPolicy: "never", sandbox: "read-only",
          developerInstructions: "Model readiness probe only. Do not start a turn or access repository content.",
        } });
      } else if (message?.id === 2) {
        const thread = message.result?.thread;
        if (message.error || message.result?.model !== MODEL || message.result?.modelProvider !== PROVIDER || typeof thread?.id !== "string") {
          finish("CAS-MODEL-PROBE-UNAVAILABLE"); return;
        }
        completed = true;
        finish("CAS-MODEL-READY");
      }
    }
  });
  send({ id: 1, method: "initialize", params: { clientInfo: { name: "agent-pipeline-model-probe", title: null, version: "1" }, capabilities: { experimentalApi: false, requestAttestation: false } } });
}
