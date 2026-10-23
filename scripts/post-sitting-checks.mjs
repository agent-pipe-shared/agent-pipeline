// SPDX-License-Identifier: SUL-1.0
// Purpose: run the light end-state checks of the sitting ONE AFTER THE OTHER and print one table (check, verdict, exit code, seconds, one-line result).
// Usage:   node scripts/post-sitting-checks.mjs [--root <dir>] [--only <name>...] [--json <file>]
//          Run from the repository root. --root addresses another checkout (a clone); --only restricts the run to the named checks (see the list below);
//          --json writes the table as JSON, and the file must lie inside <root>/scratch/ (any other path is refused, exit 2).
// Checks:  suite-registration, case-completion, capability-inventory, observation-governance, reader-inputs, backlog-state, architecture-boundary,
//          doc-contracts-test, consumer-safe-paths-test, doc-contracts. Light checks only; the heavy suites belong to scripts/sitting-count-pass.mjs.
// Verdict: a check is GREEN at exit 0 plus its expected count where one is pinned (EXPECT below: 1093 registered suites, 76 and 9 test cases; update
//          the constants when a later commit moves them). backlog-state tolerates its known-accepted DRIFT lines (it exits 0 with them).
//          architecture-boundary exits 1 on the pre-existing unowned-path findings; it is GREEN at exit 0, or at exit 1 with only unowned-path findings,
//          and RED on any over-line-bound finding (or any other finding kind, or an exit other than 0 or 1).
// Inputs:  the scripts named above, read from <root>. Each child runs with cwd <root>, a private TMPDIR under <home>/pipeline-test-tmp/post-sitting-<n>
//          (mode 0700, outside every repository, removed after a GREEN check) and NODE_TEST_CONTEXT removed from its environment.
// Output:  the table on stdout (repository-relative text only), the optional JSON file. Exit 0 when every selected check is GREEN, 1 otherwise, 2 on bad usage.
//          Read-only toward tracked files: every check it runs only reads (sync-reader-inputs always runs with --check).
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { makeScrubber, parseCounts } from "./sitting-count-pass.mjs";

export const EXPECT = { registered: 1093, docContractsTests: 76, consumerSafeTests: 9 };
const TIMEOUT_MS = 600000;
const lastLine = (out) => out.trim().split("\n").filter((l) => l.trim() !== "").at(-1) ?? "(no output)";

// Each judge returns { ok, line } from { status, out }.
const exitOnly = (okLine) => ({ status, out }) => ({ ok: status === 0, line: okLine ? okLine(out) : lastLine(out) });
const testJudge = (expected) => ({ status, out }) => {
  const c = parseCounts(out);
  return { ok: status === 0 && c.fail === 0 && c.pass === expected, line: `pass ${c.pass ?? "?"} of ${c.tests ?? "?"}, fail ${c.fail ?? "?"} (expected ${expected})` };
};

export const CHECKS = [
  { name: "suite-registration", args: ["harness/scripts/check-verify-suite-registration.mjs"], judge: ({ status, out }) => {
    const n = /(\d+) registered/.exec(out);
    const count = n ? Number(n[1]) : null;
    return { ok: status === 0 && count === EXPECT.registered, line: status === 0 ? `${count ?? "?"} registered (expected ${EXPECT.registered})` : lastLine(out) };
  } },
  { name: "case-completion", args: ["harness/scripts/check-verify-case-completion.mjs"], judge: exitOnly() },
  { name: "capability-inventory", args: ["harness/scripts/check-product-capability-inventory.mjs"], judge: exitOnly() },
  { name: "observation-governance", args: ["harness/scripts/check-observation-governance.mjs"], judge: exitOnly() },
  { name: "reader-inputs", args: ["scripts/sync-reader-inputs.mjs", ".", "--check"], judge: ({ status, out }) => ({
    ok: status === 0, line: status === 0 ? "mirrors and pins equal their sources" : `${out.split("\n").filter((l) => l.startsWith("- ")).length} drift line(s), first: ${(out.split("\n").find((l) => l.startsWith("- ")) ?? lastLine(out)).replace(/^- /, "")}`,
  }) },
  { name: "backlog-state", args: ["plugins/pipeline-core/scripts/check-backlog-state.mjs"], judge: ({ status, out }) => {
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const drift = lines.filter((l) => l.startsWith("DRIFT")).length;
    return { ok: status === 0, line: `${lines.filter((l) => !l.startsWith("DRIFT")).at(-1) ?? "(no summary line)"} (${drift} tolerated DRIFT line(s))` };
  } },
  { name: "architecture-boundary", args: ["plugins/pipeline-core/scripts/architecture-boundary-check.mjs", "--root", "."], judge: ({ status, out }) => {
    const kinds = {};
    for (const m of out.matchAll(/^\s+- \[([a-z-]+)\]/gm)) kinds[m[1]] = (kinds[m[1]] ?? 0) + 1;
    const over = kinds["over-line-bound"] ?? 0;
    const other = Object.keys(kinds).filter((k) => k !== "over-line-bound" && k !== "unowned-path").length;
    const desc = Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(", ") || "no findings";
    return { ok: (status === 0 || status === 1) && over === 0 && other === 0, line: `exit ${status}: ${desc}` };
  } },
  { name: "doc-contracts-test", args: ["--test", "harness/scripts/check-doc-contracts.test.mjs"], judge: testJudge(EXPECT.docContractsTests) },
  { name: "consumer-safe-paths-test", args: ["--test", "harness/scripts/check-consumer-safe-paths.test.mjs"], judge: testJudge(EXPECT.consumerSafeTests) },
  { name: "doc-contracts", args: ["harness/scripts/check-doc-contracts.mjs"], judge: exitOnly() },
];

export function runChecks({ root = ".", only = [], home = homedir(), log = console.log, execPath = process.execPath } = {}) {
  const absRoot = resolve(root);
  for (const n of only) if (!CHECKS.some((c) => c.name === n)) throw Object.assign(new Error(`--only names a check that does not exist: ${n} (known: ${CHECKS.map((c) => c.name).join(", ")})`), { usage: true });
  if (!existsSync(join(absRoot, "harness", "scripts"))) throw Object.assign(new Error(`--root ${root} is not a repository checkout (no harness/scripts)`), { usage: true });
  const scrub = makeScrubber({ root: absRoot, home, user: process.env.USER || process.env.USERNAME || "" });
  const tmpBase = join(home, "pipeline-test-tmp", `post-sitting-${process.pid}`);
  const rows = [];
  CHECKS.filter((c) => only.length === 0 || only.includes(c.name)).forEach((c, i) => {
    const tmp = join(tmpBase, String(i));
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true, mode: 0o700 });
    chmodSync(tmp, 0o700);
    const env = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
    delete env.NODE_TEST_CONTEXT;
    const args = c.args;
    const t0 = Date.now();
    const r = spawnSync(execPath, args, { cwd: absRoot, env, encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const timedOut = !!(r.error && r.error.code === "ETIMEDOUT");
    const verdict = timedOut ? { ok: false, line: "timed out" } : c.judge({ status: r.status, out });
    if (verdict.ok) rmSync(tmp, { recursive: true, force: true });
    const row = { check: c.name, command: `node ${args.join(" ")}`, verdict: verdict.ok ? "GREEN" : "RED", exit: r.status, seconds, result: scrub(verdict.line).slice(0, 200) };
    rows.push(row);
    log(`${row.verdict.padEnd(5)} ${c.name.padEnd(24)} exit ${String(row.exit).padEnd(4)} ${String(seconds).padStart(5)} s  ${row.result}`);
  });
  return { rows, ok: rows.every((r) => r.verdict === "GREEN") };
}

function parseArgs(argv) {
  const o = { only: [], root: "." };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root" || a === "--json") {
      if (i + 1 >= argv.length) throw Object.assign(new Error(`${a} needs a value`), { usage: true });
      o[a.slice(2)] = argv[++i];
    } else if (a === "--only") {
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) o.only.push(argv[++i]);
      if (o.only.length === 0) throw Object.assign(new Error("--only needs at least one check name"), { usage: true });
    } else throw Object.assign(new Error(`unknown argument ${a}`), { usage: true });
  }
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const o = parseArgs(process.argv.slice(2));
    let jsonPath = null;
    if (o.json) {
      jsonPath = resolve(o.json);
      const rel = relative(join(resolve(o.root), "scratch"), jsonPath);
      if (rel === "" || rel.split(sep)[0] === ".." || isAbsolute(rel)) throw Object.assign(new Error(`--json ${o.json} must be a file inside <root>/scratch/`), { usage: true });
    }
    console.log("check                    verdict/exit/seconds/result");
    const result = runChecks({ root: o.root, only: o.only });
    console.log(`${result.rows.filter((r) => r.verdict === "GREEN").length} of ${result.rows.length} checks GREEN`);
    if (jsonPath) {
      mkdirSync(resolve(jsonPath, ".."), { recursive: true });
      writeFileSync(jsonPath, `${JSON.stringify({ schema: "pipeline.post-sitting-checks.v1", rows: result.rows, ok: result.ok }, null, 2)}\n`);
      console.log(`table written: ${o.json}`);
    }
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    console.error(`${e.message}\nusage: node scripts/post-sitting-checks.mjs [--root <dir>] [--only <name>...] [--json <file inside <root>/scratch/>]`);
    process.exit(e.usage ? 2 : 1);
  }
}
