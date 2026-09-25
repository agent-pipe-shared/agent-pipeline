// SPDX-License-Identifier: SUL-1.0

import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { StringDecoder } from "node:string_decoder";

import {
  ROLE_DISPATCH_PREFLIGHT_SCHEMA,
  preflightRoleDispatch,
} from "./role-dispatch-preflight.mjs";

export const AGY_ERROR_TAXONOMY = {
  NOT_INSTALLED: "AGY-NOT-INSTALLED",
  AUTH_REQUIRED: "AGY-AUTH-REQUIRED",
  PERMISSION_REQUIRED: "AGY-PERMISSION-REQUIRED",
  TIMEOUT: "AGY-TIMEOUT",
  NONZERO_EXIT: "AGY-NONZERO-EXIT",
  OUTPUT_MALFORMED: "AGY-OUTPUT-MALFORMED",
  OUTPUT_TOO_LARGE: "AGY-OUTPUT-TOO-LARGE",
  MODEL_MISMATCH: "AGY-MODEL-MISMATCH",
  REPORTED_FAILURE: "AGY-REPORTED-FAILURE",
  CANCELLED: "AGY-CANCELLED",
};

// Child process output is parser input, never a durable host-result field.
// Keep enough to parse the normal JSON envelope, but fail closed before a
// hostile or accidental stream can become an unbounded in-memory diagnostic.
export const AGY_MAX_OUTPUT_BYTES = 64 * 1024;
export const AGY_MAX_STREAM_BYTES = 8 * 1024 * 1024;

function streamError(code) {
  const error = new Error("Antigravity stream is invalid");
  error.code = code;
  return error;
}

/** Retain only same-invocation init/result facts, never step payloads. */
export function createAgyStreamCollector(expectedModel) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let totalBytes = 0;
  let events = 0;
  let init = null;
  let result = null;
  function line(text) {
    if (text.trim() === "") return;
    if (Buffer.byteLength(text, "utf8") > AGY_MAX_OUTPUT_BYTES || ++events > 8192) throw streamError(AGY_ERROR_TAXONOMY.OUTPUT_TOO_LARGE);
    let event;
    try { event = JSON.parse(text); } catch { throw streamError(AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED); }
    if (event === null || typeof event !== "object" || Array.isArray(event) || result !== null) throw streamError(AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);
    if (event.event === "init") {
      if (init !== null || typeof event.conversation_id !== "string" || event.conversation_id.length === 0
        || event.init === null || typeof event.init !== "object" || Array.isArray(event.init)
        || typeof event.init.model !== "string" || event.init.model.length === 0) throw streamError(AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);
      if (expectedModel && event.init.model !== expectedModel) throw streamError(AGY_ERROR_TAXONOMY.MODEL_MISMATCH);
      init = { conversationId: event.conversation_id, model: event.init.model };
    } else if (event.event === "step_update") {
      if (init === null) throw streamError(AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);
    } else if (event.event === "result") {
      if (init === null || event.result === null || typeof event.result !== "object" || Array.isArray(event.result)
        || event.result.conversation_id !== init.conversationId) throw streamError(AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);
      result = event.result;
    } else {
      throw streamError(AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);
    }
  }
  return {
    sawResult() { return result !== null; },
    write(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
      if (bytes.length > AGY_MAX_STREAM_BYTES - totalBytes) throw streamError(AGY_ERROR_TAXONOMY.OUTPUT_TOO_LARGE);
      totalBytes += bytes.length;
      pending += decoder.write(bytes);
      let newline;
      while ((newline = pending.indexOf("\n")) !== -1) {
        line(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
      if (Buffer.byteLength(pending, "utf8") > AGY_MAX_OUTPUT_BYTES) throw streamError(AGY_ERROR_TAXONOMY.OUTPUT_TOO_LARGE);
    },
    finish() {
      pending += decoder.end();
      if (pending.trim() !== "") line(pending);
      if (init === null || result === null) throw streamError(AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);
      return { payload: result, observedModel: init.model };
    },
  };
}

export function discoverAgyPath(env = process.env) {
  if (env.AGY_PATH && existsSync(env.AGY_PATH)) return env.AGY_PATH;
  const localBin = join(homedir(), ".local", "bin", "agy");
  if (existsSync(localBin)) return localBin;
  try {
    const which = spawnSync("which", ["agy"], { encoding: "utf8" });
    if (which.status === 0 && which.stdout.trim()) {
      return which.stdout.trim();
    }
  } catch (e) {
    // ignore
  }
  return null;
}

export function parseAgyOutput(stdout) {
  if (Buffer.byteLength(stdout ?? "", "utf8") > AGY_MAX_OUTPUT_BYTES) {
    const error = new Error("Output exceeds bounded parser input");
    error.code = AGY_ERROR_TAXONOMY.OUTPUT_TOO_LARGE;
    throw error;
  }
  if (!stdout) {
    const error = new Error("Output empty");
    error.code = AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED;
    throw error;
  }
  const lines = stdout.split('\n').filter(l => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch (e) {
      continue;
    }
    // The last syntactically valid JSON line is the claimed transport
    // envelope. Never fall back to an earlier progress event after a final
    // scalar or array: neither can attest model identity or a result.
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    break;
  }
  const error = new Error("Output malformed");
  error.code = AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED;
  throw error;
}

async function invokeAgyProcess({ agyPath, prompt, model, effort, cwd, timeoutMs = 300000, env = process.env, signal, streamJson = false, jsonSchema = null }) {
  if (!agyPath || !existsSync(agyPath)) {
    return { ok: false, code: AGY_ERROR_TAXONOMY.NOT_INSTALLED, message: "agy binary not found" };
  }
  if (signal?.aborted) {
    return { ok: false, code: AGY_ERROR_TAXONOMY.CANCELLED, message: "Execution cancelled before launch" };
  }

  // Agy's print parser consumes the next argv token as its prompt unless the
  // value is attached with '='. A separate `--print`, followed by another
  // option, silently misclassifies that option as the prompt. Keep every
  // option first and bind the prompt to the final --print=<text> argument.
  const args = [
    "--output-format", streamJson ? "stream-json" : "json",
    "--sandbox"
  ];
  if (model) args.push("--model", model);
  if (effort) args.push("--effort", effort);
  if (jsonSchema !== null) args.push("--json-schema", JSON.stringify(jsonSchema));
  args.push(`--print=${prompt}`);

  return new Promise((resolve) => {
    const child = spawn(agyPath, args, { cwd, env });
    let settled = false;
    let processStarted = false;
    let processClosed = false;
    let forcedStop = null;
    let terminationTimer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      clearTimeout(terminationTimer);
      signal?.removeEventListener("abort", cancel);
      resolve({ ...value, processStarted, processClosed,
        transportResultObserved: stream?.sawResult() === true });
    };
    let stdoutData = "";
    let stderrData = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stream = streamJson ? createAgyStreamCollector(model) : null;
    const stop = (code, message) => {
      if (settled || forcedStop !== null) return;
      forcedStop = { ok: false, code, message };
      child.kill();
      // A timeout/cancel cannot claim a complete transport observation until
      // close drains stdout. If close never arrives, the caller sees an
      // explicitly unclosed process and must require recovery.
      terminationTimer = setTimeout(() => finish(forcedStop), 1000);
    };
    const timeoutId = setTimeout(() => stop(AGY_ERROR_TAXONOMY.TIMEOUT, "Execution timed out"), timeoutMs);
    const cancel = () => stop(AGY_ERROR_TAXONOMY.CANCELLED, "Execution cancelled");
    signal?.addEventListener("abort", cancel, { once: true });
    child.on("spawn", () => { processStarted = true; });
    if (signal?.aborted) cancel();

    const appendBounded = (lane, chunk) => {
      if (lane === "stdout" && stream !== null) {
        try { stream.write(chunk); } catch (error) {
          child.kill();
          finish({ ok: false, code: error?.code ?? AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED, message: "Antigravity stream is invalid" });
        }
        return;
      }
      const bytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), "utf8");
      const current = lane === "stdout" ? stdoutBytes : stderrBytes;
      if (bytes > AGY_MAX_OUTPUT_BYTES - current) {
        child.kill();
        finish({ ok: false, code: AGY_ERROR_TAXONOMY.OUTPUT_TOO_LARGE, message: "Antigravity output exceeds the bounded parser limit" });
        return;
      }
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (lane === "stdout") { stdoutBytes += bytes; stdoutData += text; }
      else { stderrBytes += bytes; stderrData += text; }
    };
    child.stdout.on("data", (chunk) => appendBounded("stdout", chunk));
    child.stderr.on("data", (chunk) => appendBounded("stderr", chunk));
    
    child.on("error", (err) => {
      finish({ ok: false, code: AGY_ERROR_TAXONOMY.NONZERO_EXIT, message: "Antigravity process failed" });
    });

    child.on("close", (code) => {
      if (settled) return;
      processClosed = true;
      if (forcedStop !== null) { finish(forcedStop); return; }
      if (code !== 0) {
        const stderrLower = stderrData.toLowerCase();
        if (stderrLower.includes('a tool required the "command" permission') && stderrLower.includes("auto-denied")) {
          finish({ ok: false, code: AGY_ERROR_TAXONOMY.PERMISSION_REQUIRED, message: "Antigravity requires attended command permission" });
        } else if (stderrLower.includes("auth") || stderrLower.includes("login")) {
          finish({ ok: false, code: AGY_ERROR_TAXONOMY.AUTH_REQUIRED, message: "Authentication required" });
        } else {
          finish({ ok: false, code: AGY_ERROR_TAXONOMY.NONZERO_EXIT, message: `Antigravity exited with code ${code}` });
        }
        return;
      }

      try {
        const streamed = stream?.finish();
        const payload = streamed?.payload ?? parseAgyOutput(stdoutData);
        if (payload.status !== "SUCCESS") {
          finish({ ok: false, code: typeof payload.status === "string" ? AGY_ERROR_TAXONOMY.REPORTED_FAILURE : AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED, message: "Antigravity did not report a successful headless result" });
          return;
        }
        if (typeof payload.response !== "string") {
          finish({ ok: false, code: AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED, message: "Antigravity headless result has no response" });
          return;
        }
        const observedModel = streamed?.observedModel ?? payload.model ?? payload.modelIdentity ?? "unknown";
        if (model && observedModel !== "unknown" && observedModel !== model) {
          finish({ ok: false, code: AGY_ERROR_TAXONOMY.MODEL_MISMATCH, message: "Observed model does not match the requested model" });
          return;
        }
        finish({ ok: true, payload, observedModel });
      } catch (err) {
        finish({ ok: false, code: err?.code === AGY_ERROR_TAXONOMY.OUTPUT_TOO_LARGE ? AGY_ERROR_TAXONOMY.OUTPUT_TOO_LARGE : AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED, message: "Failed to parse Antigravity JSON output" });
      }
    });
  });
}

/**
 * The only exported Antigravity model-launch boundary.
 *
 * The raw process helper deliberately remains module-private: callers must
 * supply the complete runner-neutral dispatch packet, and the immutable
 * candidate/input/result bindings are checked immediately before `agy` is
 * spawned. `root` is also the child working directory, so a caller cannot
 * validate one checkout and execute in another.
 */
export async function invokeAgy({
  root,
  resultRoot = root,
  packet,
  agyPath,
  model,
  effort,
  timeoutMs = 300000,
  env = process.env,
  signal,
  streamJson = false,
  jsonSchema = null,
} = {}) {
  const current = preflightRoleDispatch({ root, resultRoot, packet });
  if (current.status !== "prepared") return current;
  if (current.packet.transport !== "antigravity") {
    return {
      schema: ROLE_DISPATCH_PREFLIGHT_SCHEMA,
      status: "rejected",
      code: "AGY-DISPATCH-TRANSPORT",
      field: "transport",
      modelCalls: 0,
      launcherCalls: 0,
    };
  }

  const result = await invokeAgyProcess({
    agyPath,
    prompt: current.packet.prompt,
    model,
    effort,
    cwd: root,
    timeoutMs,
    env,
    signal,
    streamJson,
    jsonSchema,
  });
  if (result.code === AGY_ERROR_TAXONOMY.NOT_INSTALLED) {
    return { ...result, launcherCalls: 0, modelCalls: 0 };
  }
  return { ...result, launcherCalls: 1, modelCalls: 1 };
}
