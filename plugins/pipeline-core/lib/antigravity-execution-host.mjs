// SPDX-License-Identifier: SUL-1.0

import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const AGY_ERROR_TAXONOMY = {
  NOT_INSTALLED: "AGY-NOT-INSTALLED",
  AUTH_REQUIRED: "AGY-AUTH-REQUIRED",
  TIMEOUT: "AGY-TIMEOUT",
  NONZERO_EXIT: "AGY-NONZERO-EXIT",
  OUTPUT_MALFORMED: "AGY-OUTPUT-MALFORMED",
  MODEL_MISMATCH: "AGY-MODEL-MISMATCH",
};

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

export async function invokeAgy({ agyPath, prompt, model, effort, cwd, timeoutMs = 300000, env = process.env }) {
  if (!agyPath || !existsSync(agyPath)) {
    return { ok: false, code: AGY_ERROR_TAXONOMY.NOT_INSTALLED, message: "agy binary not found" };
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
    
    let stdoutData = "";
    let stderrData = "";
    
    let timeoutId = setTimeout(() => {
      child.kill();
      resolve({ ok: false, code: AGY_ERROR_TAXONOMY.TIMEOUT, message: "Execution timed out" });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdoutData += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderrData += chunk.toString("utf8"); });
    
    child.on("error", (err) => {
      clearTimeout(timeoutId);
      resolve({ ok: false, code: AGY_ERROR_TAXONOMY.NONZERO_EXIT, message: err.message });
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        if (stderrData.toLowerCase().includes("auth") || stderrData.toLowerCase().includes("login")) {
          resolve({ ok: false, code: AGY_ERROR_TAXONOMY.AUTH_REQUIRED, message: "Authentication required", stderr: stderrData });
        } else {
          resolve({ ok: false, code: AGY_ERROR_TAXONOMY.NONZERO_EXIT, message: `Exited with code ${code}`, stderr: stderrData });
        }
        return;
      }

      try {
        const payload = parseAgyOutput(stdoutData);
        const observedModel = payload.model || payload.modelIdentity || "unknown";
        if (model && observedModel !== "unknown" && observedModel !== model) {
          resolve({ ok: false, code: AGY_ERROR_TAXONOMY.MODEL_MISMATCH, message: `Model mismatch: requested ${model}, observed ${observedModel}` });
          return;
        }
        resolve({ ok: true, payload, stdout: stdoutData, observedModel });
      } catch (err) {
        resolve({ ok: false, code: AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED, message: "Failed to parse JSON output", stdout: stdoutData });
      }
    });
  });
}
