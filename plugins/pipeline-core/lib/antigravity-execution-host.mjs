// SPDX-License-Identifier: SUL-1.0

import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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
  CANCELLED: "AGY-CANCELLED",
};

// Child process output is parser input, never a durable host-result field.
// Keep enough to parse the normal JSON envelope, but fail closed before a
// hostile or accidental stream can become an unbounded in-memory diagnostic.
export const AGY_MAX_OUTPUT_BYTES = 64 * 1024;

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
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed) return parsed;
    } catch (e) {
      continue;
    }
  }
  const error = new Error("Output malformed");
  error.code = AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED;
  throw error;
}

async function invokeAgyProcess({ agyPath, prompt, model, effort, cwd, timeoutMs = 300000, env = process.env, signal }) {
  if (!agyPath || !existsSync(agyPath)) {
    return { ok: false, code: AGY_ERROR_TAXONOMY.NOT_INSTALLED, message: "agy binary not found" };
  }
  if (signal?.aborted) {
    return { ok: false, code: AGY_ERROR_TAXONOMY.CANCELLED, message: "Execution cancelled before launch" };
  }

  const args = [
    "--prompt", prompt,
    "--output-format", "json",
    "--sandbox"
  ];
  if (model) args.push("--model", model);
  if (effort) args.push("--effort", effort);

  return new Promise((resolve) => {
    const child = spawn(agyPath, args, { cwd, env });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", cancel);
      resolve(value);
    };
    let stdoutData = "";
    let stderrData = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const timeoutId = setTimeout(() => {
      child.kill();
      finish({ ok: false, code: AGY_ERROR_TAXONOMY.TIMEOUT, message: "Execution timed out" });
    }, timeoutMs);
    const cancel = () => {
      child.kill();
      finish({ ok: false, code: AGY_ERROR_TAXONOMY.CANCELLED, message: "Execution cancelled" });
    };
    signal?.addEventListener("abort", cancel, { once: true });

    const appendBounded = (lane, chunk) => {
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
        const payload = parseAgyOutput(stdoutData);
        const observedModel = payload.model || payload.modelIdentity || "unknown";
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
  });
  if (result.code === AGY_ERROR_TAXONOMY.NOT_INSTALLED) {
    return { ...result, launcherCalls: 0, modelCalls: 0 };
  }
  return { ...result, launcherCalls: 1, modelCalls: 1 };
}
