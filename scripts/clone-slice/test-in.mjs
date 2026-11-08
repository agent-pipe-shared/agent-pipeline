// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool test-in.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Scratch: run node --test on files inside a scratch clone (cwd = clone, short private TMPDIR) and print failing lines plus the summary.
// usage: node scratch/agent-out/test-in.mjs <clone-dir> <test file relative to clone>... [--name <pattern>] [--full] [--private-tmp]
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const clone = resolve(args.shift());
const fullAt = args.indexOf("--full"); const fullOut = fullAt >= 0; if (fullOut) args.splice(fullAt, 1);
const nameAt = args.indexOf("--name");
const nameArgs = nameAt >= 0 ? ["--test-name-pattern", args.splice(nameAt, 2)[1]] : [];
// --private-tmp: an owner-only TMPDIR under $HOME/.cache instead of /tmp (cases that refuse a world-writable ancestor, e.g. SDC domain-ancestor-unsafe).
const privAt = args.indexOf("--private-tmp"); const privateTmp = privAt >= 0; if (privateTmp) args.splice(privAt, 1);
// One fresh TMPDIR per RUN (2026-11-07: a fixed per-clone directory was wiped by a second run in the same clone and broke the first one).
const tmpBase = privateTmp ? `${process.env.HOME}/.cache` : "/tmp";
mkdirSync(tmpBase, { recursive: true });
const tmp = mkdtempSync(`${tmpBase}/tin-${clone.split("/").pop()}-`);
const env = { ...process.env, TMPDIR: tmp }; delete env.NODE_TEST_CONTEXT;
const r = spawnSync(process.execPath, ["--test", ...nameArgs, ...args], { cwd: clone, encoding: "utf8", maxBuffer: 1 << 28, env });
const lines = (r.stdout + r.stderr).split("\n");
console.log(lines.filter((l) => /^\s*(✖|not ok)/u.test(l)).join("\n"));
if (r.status !== 0) console.log(lines.filter((l) => /(AssertionError|Error:|expected|actual|\+ |- )/u.test(l)).slice(0, 40).join("\n"));
console.log(lines.filter((l) => /^ℹ (tests|pass|fail|skipped)/u.test(l)).join("\n"));
if (fullOut && r.status !== 0) console.log(lines.slice(0, 200).join("\n"));
console.log("exit", r.status);
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
