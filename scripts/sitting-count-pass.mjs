// SPDX-License-Identifier: SUL-1.0
// Purpose: run a list of suites ONE AFTER THE OTHER on a real tree, each with a private TMPDIR outside every repository, and write the counted results the delivery matrix reads.
// Usage:   node scripts/sitting-count-pass.mjs --list <suites.json> --out <evidence.md> [--root <dir>] [--only <id>...] [--resume] [--timeout-ms N]
//          Run from the repository root. --root addresses another checkout (a clone); the suite files in the list are relative to it.
// Inputs:  --list  JSON (an array, or { "suites": [...] }) of { id, items, command, expect, heavy, why, unresolved? }. command is the argument
//          list after "node" (["--test", "<repo-relative file>"] or a check script and its arguments); command null = unresolved, never run.
//          expect { minPass } makes a run GREEN only when pass >= minPass. An optional timeoutMs per entry replaces the default cap.
//          --only restricts the run to the named ids; --resume skips ids already finished in the state file; --timeout-ms is the per-suite cap (default 1800000).
// Output:  <evidence.md> (header with HEAD, date, host, node, runner note; one table row per suite; Red and Skipped typed sections) and the
//          JSONL state file <evidence.md>.state.jsonl next to it. One line per suite on stdout. Exit 0 when every suite that ran is GREEN, 1 otherwise, 2 on bad usage.
// Data:    private TMPDIRs live under <home>/pipeline-test-tmp/count-pass-<run>/<n> (mode 0700) and are removed after a GREEN suite. The written evidence
//          holds repository-relative paths only. Read-only toward tracked files (the suites themselves write under their own TMPDIR).
import { spawn as nodeSpawn, execFileSync } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, release, arch, platform } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_TIMEOUT_MS = 1800000;
const OUTPUT_CAP = 128 * 1024 * 1024;

// Default spawn: serial child in its own process group so a timeout also stops the grandchildren that `node --test` starts.
export function defaultSpawn(command, args, options) {
  return new Promise((resolvePromise) => {
    const detached = process.platform !== "win32";
    const child = nodeSpawn(command, args, { cwd: options.cwd, env: options.env, detached, stdio: ["ignore", "pipe", "pipe"] });
    let chunks = [];
    let size = 0;
    let timedOut = false;
    const take = (c) => {
      chunks.push(c);
      size += c.length;
      while (size > OUTPUT_CAP && chunks.length > 1) size -= chunks.shift().length;
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    const killTree = () => {
      try {
        if (detached) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
      }
    };
    const timer = setTimeout(() => { timedOut = true; killTree(); }, options.timeout);
    child.on("error", (error) => { clearTimeout(timer); resolvePromise({ status: null, signal: null, error, stdout: Buffer.concat(chunks).toString("utf8"), stderr: "" }); });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      if (detached) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* group already empty */ } }
      const result = { status, signal, stdout: Buffer.concat(chunks).toString("utf8"), stderr: "" };
      if (timedOut) result.error = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
      resolvePromise(result);
    });
  });
}

// Counts from the node test runner summary lines; falls back to the two custom summaries some suites print.
export function parseCounts(out) {
  const num = (k) => {
    const m = new RegExp(`^ℹ ${k} (\\d+)`, "m").exec(out);
    return m ? Number(m[1]) : null;
  };
  let counts = { tests: num("tests"), pass: num("pass"), fail: num("fail"), skipped: num("skipped"), todo: num("todo"), custom: false };
  if (counts.tests === null) {
    const slash = /(\d+)\/(\d+) cases passed/.exec(out);
    const word = /(\d+) passed, (\d+) failed/.exec(out);
    if (slash) counts = { tests: Number(slash[2]), pass: Number(slash[1]), fail: Number(slash[2]) - Number(slash[1]), skipped: 0, todo: 0, custom: true };
    else if (word) counts = { tests: Number(word[1]) + Number(word[2]), pass: Number(word[1]), fail: Number(word[2]), skipped: 0, todo: 0, custom: true };
  }
  return counts;
}

export function failingCases(out) {
  const names = [...out.matchAll(/^\s*✖ (.+?) \(\d/gm)].map((m) => m[1]).filter((t) => t !== "failing tests:");
  return [...new Set(names)];
}

// Evidence must hold repository-relative text only: scrub the root, the home directory, the user name and any /home/<x> or C:\Users\<x> shape.
export function makeScrubber({ root, home, user }) {
  const literals = [resolve(root), home, user].filter((s) => typeof s === "string" && s.length > 2).sort((a, b) => b.length - a.length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (text) => {
    let t = String(text);
    for (const lit of literals) t = t.replace(new RegExp(esc(lit), "g"), lit === user ? "<user>" : "<path>");
    return t.replace(/\/(?:home|Users)\/[^\s/'"`)]+/g, "<path>").replace(/[A-Za-z]:\\Users\\[^\s\\'"`)]+/g, "<path>");
  };
}

const isRetryable = (r, out) => !(r.error && r.error.code === "ETIMEDOUT") && (r.status === null || r.signal != null || /null !== 0/.test(out));

function classify(r, counts, entry, timedOut) {
  if (timedOut) return "TIMEOUT";
  if (r.status !== 0) return "RED";
  if (entry.expect && typeof entry.expect.minPass === "number" && (counts.pass ?? 0) < entry.expect.minPass) return "RED";
  return "GREEN";
}

async function runOne({ entry, index, root, tmpBase, timeoutMs, spawn, execPath, log }) {
  const tmp = join(tmpBase, String(index));
  const prepare = () => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true, mode: 0o700 });
    chmodSync(tmp, 0o700);
  };
  const attempt = async () => {
    prepare();
    const env = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
    delete env.NODE_TEST_CONTEXT;
    const t0 = Date.now();
    const r = await spawn(execPath, entry.command, { cwd: root, env, timeout: timeoutMs });
    const secs = Math.round((Date.now() - t0) / 1000);
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const timedOut = !!(r.error && r.error.code === "ETIMEDOUT");
    const counts = parseCounts(out);
    return { r, out, secs, timedOut, counts, result: classify(r, counts, entry, timedOut) };
  };
  let a = await attempt();
  let retried = false;
  let firstAttempt = null;
  if (a.result !== "GREEN" && isRetryable(a.r, a.out)) {
    retried = true;
    firstAttempt = `${a.result} (${a.r.signal ? `killed by ${a.r.signal}` : a.r.status === null ? "child killed" : `exit ${a.r.status}, null !== 0`})`;
    log(`   retrying once: ${entry.id} first attempt ${firstAttempt}`);
    a = await attempt();
  }
  if (a.result === "GREEN") rmSync(tmp, { recursive: true, force: true });
  return {
    id: entry.id, result: a.result, tests: a.counts.tests, pass: a.counts.pass, fail: a.counts.fail, skipped: a.counts.skipped, todo: a.counts.todo,
    custom: a.counts.custom, seconds: a.secs, exit: a.r.status, signal: a.r.signal ?? null, retried, firstAttempt,
    failing: a.result === "GREEN" ? [] : failingCases(a.out).slice(0, 8),
    tail: a.counts.tests === null && a.result !== "GREEN" ? a.out.trim().split("\n").slice(-4).join(" | ").slice(0, 400) : "",
    at: new Date().toISOString(),
  };
}

const cell = (v) => (v === null || v === undefined ? "?" : String(v));
const mdText = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderEvidence({ suites, records, head, date, host, nodeVersion, timeoutMs, scrub }) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const ran = suites.filter((s) => byId.has(s.id));
  const unresolved = suites.filter((s) => s.command === null || s.command === undefined);
  const pending = suites.filter((s) => s.command && !byId.has(s.id));
  const count = (res) => ran.filter((s) => byId.get(s.id).result === res).length;
  const file = (s) => (s.command ? s.command.filter((a) => !a.startsWith("--")).join(" ") : "-");
  const lines = [];
  lines.push(`# Counted results, ${date} (count pass)`, "");
  lines.push(`Measured on commit \`${head}\`. Host: ${host}; node ${nodeVersion}. Runner: \`scripts/sitting-count-pass.mjs\`, one suite after the other (never two at the same time), each with its own private TMPDIR outside every repository, \`NODE_TEST_CONTEXT\` removed, a ${Math.round(timeoutMs / 60000)} minute default cap per suite, and one retry for a killed child or a \`null !== 0\` process failure (marked in the Result column). Counts are copied from the node summary line of each run; a suite with its own summary is marked \`custom\`.`, "");
  lines.push(`Summary: ${ran.length} suites run. ${count("GREEN")} green, ${count("RED")} red, ${count("TIMEOUT")} timeout. ${unresolved.length} unresolved (no suite identified, not run). ${pending.length} pending (not run yet).`, "");
  lines.push("A skipped or todo case is not a pass. A green row with skips or todos is counted green for the cases that ran.", "");
  const red = ran.filter((s) => byId.get(s.id).result !== "GREEN");
  lines.push(`## Red (${red.length})`, "");
  if (red.length === 0) lines.push("None.", "");
  else {
    lines.push("| Suite | Result | Cases | Pass | Fail | First failing cases | Note |", "|---|---|---|---|---|---|---|");
    for (const s of red) {
      const r = byId.get(s.id);
      const note = [r.retried ? `retried once, first attempt ${r.firstAttempt}` : "", r.tail ? `no summary line, tail: ${r.tail}` : "", r.result === "TIMEOUT" ? "cap reached" : ""].filter(Boolean).join("; ");
      lines.push(`| \`${s.id}\` (\`${file(s)}\`) | ${r.result} | ${cell(r.tests)} | ${cell(r.pass)} | ${cell(r.fail)} | ${mdText(scrub(r.failing.slice(0, 3).join("; ") || "-"))} | ${mdText(scrub(note || "-"))} |`);
    }
    lines.push("");
  }
  lines.push("## Counted suites", "", "| Id | File | Tests | Pass | Fail | Skip | Todo | Seconds | Result |", "|---|---|---|---|---|---|---|---|---|");
  for (const s of ran) {
    const r = byId.get(s.id);
    const result = `${r.result}${r.retried ? " (retried)" : ""}${r.custom ? " (custom)" : ""}`;
    lines.push(`| \`${s.id}\` | \`${file(s)}\` | ${cell(r.tests)} | ${cell(r.pass)} | ${cell(r.fail)} | ${cell(r.skipped)} | ${cell(r.todo)} | ${r.seconds} | ${result} |`);
  }
  lines.push("", "## Skipped typed", "");
  const typed = ran.filter((s) => (byId.get(s.id).skipped ?? 0) > 0 || (byId.get(s.id).todo ?? 0) > 0);
  if (typed.length === 0) lines.push("None.");
  else {
    lines.push("| Id | Skip | Todo | Pass |", "|---|---|---|---|");
    for (const s of typed) { const r = byId.get(s.id); lines.push(`| \`${s.id}\` | ${cell(r.skipped)} | ${cell(r.todo)} | ${cell(r.pass)} |`); }
  }
  if (unresolved.length > 0) {
    lines.push("", "## Unresolved (not run)", "");
    for (const s of unresolved) lines.push(`- \`${s.id}\`: ${mdText(scrub(s.unresolved ?? "no suite identified"))}`);
  }
  if (pending.length > 0) {
    lines.push("", "## Pending (not run yet)", "");
    for (const s of pending) lines.push(`- \`${s.id}\``);
  }
  return `${lines.join("\n")}\n`;
}

function readList(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const suites = Array.isArray(data) ? data : data.suites;
  if (!Array.isArray(suites)) throw new Error(`${path}: expected an array or { "suites": [...] }`);
  const seen = new Set();
  for (const s of suites) {
    if (typeof s.id !== "string" || s.id === "") throw new Error(`${path}: an entry has no id`);
    if (seen.has(s.id)) throw new Error(`${path}: duplicate id ${s.id}`);
    seen.add(s.id);
    if (s.command !== null && s.command !== undefined && (!Array.isArray(s.command) || s.command.length === 0)) throw new Error(`${path}: ${s.id}: command must be a non-empty array or null`);
  }
  return suites;
}

function readState(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
}

// Programmatic entry point (the unit test uses it with an injected spawn and home).
export async function runCountPass(options) {
  const { list, out, root = ".", only = [], resume = false, timeoutMs, spawn = defaultSpawn, home = homedir(), log = console.log, execPath = process.execPath, now = () => new Date() } = options;
  const suites = readList(list);
  const statePath = `${out}.state.jsonl`;
  const absRoot = resolve(root);
  let records = readState(statePath);
  if (records.length > 0 && !resume) {
    throw Object.assign(new Error(`${statePath} already holds ${records.length} finished suite(s); pass --resume to continue that pass or delete the state file to start a new one`), { usage: true });
  }
  for (const id of only) if (!suites.some((s) => s.id === id)) throw Object.assign(new Error(`--only names an id that is not in the list: ${id}`), { usage: true });
  mkdirSync(resolve(out, ".."), { recursive: true });
  let head = "unknown";
  try { head = execFileSync("git", ["-C", absRoot, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not a repository */ }
  const wsl = /microsoft/i.test(release()) ? " (WSL)" : "";
  const host = `${platform()} ${arch()}${wsl}`;
  let user = "";
  try { user = process.env.USER || process.env.USERNAME || ""; } catch { /* unknown */ }
  const scrub = makeScrubber({ root: absRoot, home, user });
  const runLabel = basename(out).replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]/g, "-");
  const tmpBase = join(home, "pipeline-test-tmp", `count-pass-${runLabel}`);
  const write = () => writeFileSync(out, renderEvidence({ suites, records, head, date: now().toISOString().slice(0, 10), host, nodeVersion: process.version, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS, scrub }));
  const finished = new Set(records.map((r) => r.id));
  const todo = suites.map((s, index) => ({ s, index })).filter(({ s }) => s.command && (only.length === 0 || only.includes(s.id)));
  let n = 0;
  for (const { s, index } of todo) {
    n += 1;
    if (finished.has(s.id)) { log(`SKIP-DONE ${s.id} (already in the state file)`); continue; }
    const rec = await runOne({ entry: s, index, root: absRoot, tmpBase, timeoutMs: timeoutMs ?? s.timeoutMs ?? DEFAULT_TIMEOUT_MS, spawn, execPath, log });
    rec.at = now().toISOString();
    records.push(rec);
    appendFileSync(statePath, `${JSON.stringify(rec)}\n`);
    write();
    log(`${rec.result} [${n}/${todo.length}] ${s.id} tests ${cell(rec.tests)} pass ${cell(rec.pass)} fail ${cell(rec.fail)} skip ${cell(rec.skipped)} todo ${cell(rec.todo)} secs ${rec.seconds}${rec.retried ? " (retried)" : ""}`);
    for (const f of rec.failing.slice(0, 3)) log(`   FAILING: ${scrub(f).slice(0, 200)}`);
    if (rec.tail) log(`   tail: ${scrub(rec.tail)}`);
  }
  write();
  const selected = new Set(todo.map(({ s }) => s.id));
  const considered = records.filter((r) => selected.has(r.id));
  return { records, ok: considered.every((r) => r.result === "GREEN"), unresolved: suites.filter((s) => !s.command).map((s) => s.id) };
}

function parseArgs(argv) {
  const o = { only: [], resume: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--resume") o.resume = true;
    else if (a === "--list" || a === "--out" || a === "--root" || a === "--timeout-ms") {
      if (i + 1 >= argv.length) throw Object.assign(new Error(`${a} needs a value`), { usage: true });
      const v = argv[++i];
      if (a === "--timeout-ms") { o.timeoutMs = Number(v); if (!Number.isFinite(o.timeoutMs) || o.timeoutMs <= 0) throw Object.assign(new Error("--timeout-ms needs a positive number"), { usage: true }); }
      else o[a.slice(2)] = v;
    } else if (a === "--only") {
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) o.only.push(argv[++i]);
      if (o.only.length === 0) throw Object.assign(new Error("--only needs at least one id"), { usage: true });
    } else throw Object.assign(new Error(`unknown argument ${a}`), { usage: true });
  }
  if (!o.list || !o.out) throw Object.assign(new Error("--list and --out are required"), { usage: true });
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const result = await runCountPass(o);
    console.log(`evidence written: ${o.out} (${result.records.length} suites recorded, ${result.unresolved.length} unresolved)`);
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    console.error(`${e.message}\nusage: node scripts/sitting-count-pass.mjs --list <suites.json> --out <evidence.md> [--root <dir>] [--only <id>...] [--resume] [--timeout-ms N]`);
    process.exit(e.usage ? 2 : 1);
  }
}
