// Scratch: run node --test on files inside a scratch clone (cwd = clone, short private TMPDIR) and print failing lines plus the summary.
// usage: node scratch/agent-out/test-in.mjs <clone-dir> <test file relative to clone>... [--name <pattern>]
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const clone = resolve(args.shift());
const nameAt = args.indexOf("--name");
const nameArgs = nameAt >= 0 ? ["--test-name-pattern", args.splice(nameAt, 2)[1]] : [];
const tmp = "/tmp/tin1";
rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
const env = { ...process.env, TMPDIR: tmp }; delete env.NODE_TEST_CONTEXT;
const r = spawnSync(process.execPath, ["--test", ...nameArgs, ...args], { cwd: clone, encoding: "utf8", maxBuffer: 1 << 28, env });
const lines = (r.stdout + r.stderr).split("\n");
console.log(lines.filter((l) => /^\s*(✖|not ok)/u.test(l)).join("\n"));
if (r.status !== 0) console.log(lines.filter((l) => /(AssertionError|Error:|expected|actual|\+ |- )/u.test(l)).slice(0, 40).join("\n"));
console.log(lines.filter((l) => /^ℹ (tests|pass|fail|skipped)/u.test(l)).join("\n"));
console.log("exit", r.status);
