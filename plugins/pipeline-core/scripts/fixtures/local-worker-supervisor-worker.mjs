#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Deterministic B1-I integration fixture.
 *
 * This is a real operating-system child process and may edit one exact relative
 * path in its isolated temporary clone. It never invokes a model, provider,
 * network, broker, credential, Git mutation, or nested worker.
 */
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_PATH = /^[A-Za-z0-9._/-]{1,512}$/u;

function parse(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || Object.hasOwn(result, key.slice(2))) throw new Error("fixture arguments invalid");
    result[key.slice(2)] = value;
  }
  const keys = Object.keys(result).sort();
  if (keys.join(",") !== ["delay-ms", "exit-code", "subject-sha256", "task-id", "write", "write-path"].sort().join(",")) throw new Error("fixture arguments incomplete");
  return result;
}

async function main() {
  const input = parse(process.argv.slice(2));
  const delayMs = Number(input["delay-ms"]);
  const exitCode = Number(input["exit-code"]);
  const write = input.write === "true";
  const writePath = input["write-path"];
  if (!ID.test(input["task-id"]) || !SHA256.test(input["subject-sha256"])
    || !SAFE_PATH.test(writePath) || writePath.startsWith("/") || writePath.includes("\\")
    || writePath.split("/").some((part) => !part || part === "." || part === "..")
    || !Number.isSafeInteger(delayMs) || delayMs < 100 || delayMs > 30_000
    || !Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 125
    || !["true", "false"].includes(input.write)
    || !/^[a-f0-9]{32}$/u.test(process.env.PIPELINE_LOCAL_WORKER_NONCE ?? "")) {
    throw new Error("fixture contract invalid");
  }
  const root = resolve(process.cwd());
  const target = resolve(join(root, writePath));
  if (relative(root, target).split(sep).includes("..") || target === root) throw new Error("fixture path escaped");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
  if (write) {
    const line = `\nfixture:${input["task-id"]}:${input["subject-sha256"].slice(0, 12)}\n`;
    if (existsSync(target)) {
      const info = lstatSync(target);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("fixture target unsafe");
      appendFileSync(target, line, "utf8");
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, line, { encoding: "utf8", mode: 0o600, flag: "wx" });
    }
  }
  process.stdout.write(`${JSON.stringify({
    schema: "pipeline.local-worker-supervisor-fixture-result.v1",
    taskId: input["task-id"],
    subjectSha256: input["subject-sha256"],
    wrote: write,
  })}\n`);
  process.exitCode = exitCode;
}

main().catch((error) => {
  process.stderr.write(`fixture-error:${error.message}\n`);
  process.exitCode = 2;
});
