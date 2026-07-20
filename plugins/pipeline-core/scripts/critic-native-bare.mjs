// SPDX-License-Identifier: Apache-2.0

/** Exact-executable `claude --bare` preflight and execution primitive. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { spawnSync as nodeSpawnSync } from "node:child_process";

import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
export class NativeBareError extends Error {
  constructor(code, message, { preVerdict = true, outputBytes = 0 } = {}) {
    super(message); this.name = "NativeBareError"; this.code = code; this.preVerdict = preVerdict; this.outputBytes = outputBytes;
  }
}
function fail(code, message, details) { throw new NativeBareError(code, message, details); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function strictFile(path, label) {
  let lexical;
  try { lexical = lstatSync(path); } catch (error) {
    if (error?.code === "ENOENT" && label === "Claude executable") fail("CLH-BINARY-MISSING", "Claude executable is missing.");
    fail("CLH-SANDBOX-SETUP", `${label} is not readable.`);
  }
  if (lexical.isSymbolicLink() || !lexical.isFile()) fail("CLH-SANDBOX-SETUP", `${label} must be a regular non-symlink file.`);
  return realpathSync(path);
}
function identity(path) {
  const realPath = strictFile(path, "Claude executable");
  const info = statSync(realPath, { bigint: true });
  return {
    realPath,
    device: info.dev.toString(),
    inode: info.ino.toString(),
    size: Number(info.size),
    mtimeNs: info.mtimeNs.toString(),
    sha256: hash(readFileSync(realPath)),
  };
}
function closedEnv(env = process.env) {
  const result = { LANG: "C", LC_ALL: "C" };
  for (const key of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME"]) {
    if (typeof env[key] === "string" && env[key] !== "") result[key] = env[key];
  }
  return result;
}
export function buildNativeBareArgv({ prompt, checkoutRoot, schemaText, model, effort, contractPath }) {
  if (![prompt, checkoutRoot, schemaText, model, effort, contractPath].every((value) => typeof value === "string" && value.length > 0)) {
    fail("CLH-ARGUMENT", "Native bare argv requires prompt, checkout, schema, model, effort and contract.");
  }
  return [
    "-p", prompt,
    "--bare",
    "--add-dir", checkoutRoot,
    "--output-format", "stream-json",
    "--json-schema", schemaText,
    "--model", model,
    "--effort", effort,
    "--tools", "Read,Grep,Glob",
    "--system-prompt-file", contractPath,
  ];
}
function parseResult(stdout, schema, { preflight = false } = {}) {
  const text = String(stdout ?? "");
  const events = [];
  for (const line of text.split(/\r?\n/).filter((entry) => entry.trim() !== "")) {
    try { events.push(JSON.parse(line)); } catch { fail("CLH-RESULT-MALFORMED", "Claude stream contains malformed JSON.", { preVerdict: false, outputBytes: Buffer.byteLength(text) }); }
  }
  const results = events.filter((event) => event?.type === "result");
  if (results.length !== 1 || typeof results[0].result !== "string") {
    fail(results.length > 1 ? "CLH-RESULT-DUPLICATE" : "CLH-RESULT-MISSING", "Claude stream must contain exactly one result.", { preVerdict: results.length === 0 && text.length === 0, outputBytes: Buffer.byteLength(text) });
  }
  let verdict;
  try { verdict = JSON.parse(results[0].result); } catch { fail("CLH-RESULT-MALFORMED", "Claude result is not JSON.", { preVerdict: false, outputBytes: Buffer.byteLength(text) }); }
  const valid = validateAgainstSchema(verdict, schema);
  if (!valid.valid) fail("CLH-RESULT-SCHEMA", `${preflight ? "Preflight" : "Critic"} result schema invalid: ${valid.errors.join("; ")}`, { preVerdict: false, outputBytes: Buffer.byteLength(text) });
  return { verdict, outputSha256: hash(text), outputBytes: Buffer.byteLength(text) };
}
function execute(handle, args, { spawnFn = nodeSpawnSync, timeoutMs = 5000, env = process.env } = {}) {
  const observed = identity(handle.executable.realPath);
  if (JSON.stringify(observed) !== JSON.stringify(handle.executable)) fail("CLH-EXECUTABLE-DRIFT", "Claude executable identity changed.");
  let result;
  try {
    result = spawnFn(handle.executable.realPath, args, { cwd: handle.neutralCwd, encoding: "utf8", env: closedEnv(env), input: "", timeout: timeoutMs, shell: false, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const code = error?.code === "ENOENT" ? "CLH-BINARY-MISSING" : error?.code === "EACCES" || error?.code === "EPERM" ? "CLH-SANDBOX-SETUP" : "CLH-SPAWN";
    fail(code, `Claude child failed to start: ${error?.message ?? "unknown"}`);
  }
  const outputBytes = Buffer.byteLength(String(result.stdout ?? "")) + Buffer.byteLength(String(result.stderr ?? ""));
  if (result.error?.code === "ETIMEDOUT") fail("CLH-TIMEOUT", "Claude child timed out.", { preVerdict: false, outputBytes });
  if (result.error) {
    const code = result.error.code === "ENOENT" ? "CLH-BINARY-MISSING" : result.error.code === "EACCES" || result.error.code === "EPERM" ? "CLH-SANDBOX-SETUP" : "CLH-CHILD-STDIO";
    fail(code, `Claude child execution error: ${result.error.message}`, { preVerdict: outputBytes === 0, outputBytes });
  }
  if (result.status !== 0) {
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const auth = /auth|login|credential/i.test(combined);
    fail(auth ? "CLH-AUTH-UNAVAILABLE" : "CLH-CHILD-EXIT", `Claude child exited ${result.status}.`, { preVerdict: outputBytes === 0 || auth, outputBytes });
  }
  return result;
}

export function preflightNativeBare(options, deps = {}) {
  const executable = identity(options.executablePath);
  const contractPath = strictFile(options.contractPath, "Critic contract");
  const schemaPath = strictFile(options.schemaPath, "Critic schema");
  const schemaText = readFileSync(schemaPath, "utf8");
  let schema;
  try { schema = JSON.parse(schemaText); } catch { fail("CLH-SANDBOX-SETUP", "Critic schema is invalid JSON."); }
  const handle = {
    schema: "pipeline.claude-native-handle.v1",
    executable,
    contract: { realPath: contractPath, sha256: hash(readFileSync(contractPath)) },
    verdictSchema: { realPath: schemaPath, sha256: hash(schemaText) },
    routeDigest: options.routeDigest,
    model: options.model,
    effort: options.effort,
    neutralCwd: realpathSync(options.neutralCwd),
    probedAt: (deps.now ?? new Date()).toISOString(),
  };
  if (!SHA256.test(handle.routeDigest)) fail("CLH-ROUTE", "Native handle lacks a route digest.");
  const args = buildNativeBareArgv({ prompt: "Return the schema-valid fixture verdict only.", checkoutRoot: realpathSync(options.checkoutRoot), schemaText, model: options.model, effort: options.effort, contractPath });
  const result = execute(handle, args, { ...deps, timeoutMs: 5000 });
  parseResult(result.stdout, schema, { preflight: true });
  return { ...handle, handleDigest: hash(JSON.stringify(handle)), argvShapeSha256: hash(JSON.stringify(args.map((value, index) => index === 1 ? "<prompt>" : value))) };
}

export function runNativeBare(handle, { checkoutRoot, prompt, timeoutMs = 480_000 } = {}, deps = {}) {
  if (!handle || handle.schema !== "pipeline.claude-native-handle.v1") {
    fail("CLH-HANDLE", "Invalid native handle.");
  }
  const { handleDigest, argvShapeSha256, ...bound } = handle;
  if (!SHA256.test(handleDigest) || !SHA256.test(argvShapeSha256) || hash(JSON.stringify(bound)) !== handleDigest) {
    fail("CLH-HANDLE", "Native handle digest mismatch.");
  }
  if (hash(readFileSync(handle.contract.realPath)) !== handle.contract.sha256 || hash(readFileSync(handle.verdictSchema.realPath, "utf8")) !== handle.verdictSchema.sha256) {
    fail("CLH-EXECUTABLE-DRIFT", "Contract or schema binding changed.");
  }
  const schemaText = readFileSync(handle.verdictSchema.realPath, "utf8");
  const args = buildNativeBareArgv({ prompt, checkoutRoot: realpathSync(checkoutRoot), schemaText, model: handle.model, effort: handle.effort, contractPath: handle.contract.realPath });
  const result = execute(handle, args, { ...deps, timeoutMs });
  return parseResult(result.stdout, JSON.parse(schemaText));
}

export const __test = Object.freeze({ closedEnv, identity, parseResult });
