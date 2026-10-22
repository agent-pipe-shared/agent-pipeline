// Purpose: run test files on isolated Linux workers at once, one disposable clone + private HOME + private TMPDIR per worker.
// Usage:   node scripts/run-parallel.mjs <workers> <label> [--src <dir>] [--allow-dirty] <test-file>...
//          (run from the repository root; use at most 3 workers; test paths are relative to the repository root)
// Inputs:  --src <dir> = the repository whose COMMITTED HEAD the workers run (default: the current checkout).
//          Git identity is copied from `git config user.name/user.email` of the current checkout.
// Output:  one header line "run-parallel: src=<dir> commit=<sha> workers=<n>", then per file, in input order:
//          GREEN/RED, exit code, tests/pass/fail/skip/todo counts, the file and the worker, plus failing case names.
//          Exit 0 only when every file exits 0; exit 2 on a usage error or a dirty source (see below).
// Data:    worker clones scratch/clones/pw-<label>-<n> (untracked, reused between runs); worker HOME/TMPDIR under
//          <home>/pipeline-test-tmp/par-<label> (removed and recreated each run, outside every repository).
// Not read-only: it writes only the worker clones and temp dirs, never the source checkout.
// Staleness fix (K53): a worker clone ran whatever commit it last saw. It is now force-checked-out to the source's
// exact HEAD (fetch + detached checkout + clean) on every run, the commit is printed, and a source with uncommitted
// changes is refused (the workers can only see the COMMITTED state, so a newly added case in the working tree was
// silently missing: 8 cases instead of 9, GREEN for a file whose new case fails). --allow-dirty runs anyway and says so.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, chmodSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
const argv = process.argv.slice(2);
const allowDirty = argv.includes("--allow-dirty");
const [nArg, label, ...rest0] = argv.filter((a) => a !== "--allow-dirty");
// optional `--src <dir>` right after the label: the repository to clone for the workers (default: this checkout).
const rest = rest0;
const srcIdx = rest[0] === "--src" ? 1 : -1;
const srcDir = srcIdx > 0 ? resolve(rest[1]) : resolve(".");
const files = srcIdx > 0 ? rest.slice(2) : rest;
const workers = Math.max(1, Number(nArg));
if (!workers || !label || files.length === 0) { console.error("usage: run-parallel.mjs <workers> <label> [--src <dir>] [--allow-dirty] <test-file>..."); process.exit(2); }
const cfg = (k) => execFileSync("git", ["config", k], { encoding: "utf8" }).trim();
const gitIn = (dir, ...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const name = cfg("user.name"); const email = cfg("user.email");
const srcCommit = gitIn(srcDir, "rev-parse", "HEAD");
const dirty = gitIn(srcDir, "status", "--porcelain").split("\n").filter(Boolean);
if (dirty.length > 0 && !allowDirty) {
  console.error(`run-parallel: REFUSED: ${srcDir} has ${dirty.length} uncommitted path(s); workers run only the committed HEAD ${srcCommit.slice(0, 9)}, so those changes (e.g. a newly added test case) would be silently missing. Commit first, or pass --allow-dirty.`);
  for (const d of dirty.slice(0, 10)) console.error(`  ${d}`);
  process.exit(2);
}
const base = join(homedir(), "pipeline-test-tmp", `par-${label}`);
rmSync(base, { recursive: true, force: true });
mkdirSync(base, { recursive: true, mode: 0o700 });
const syncClone = (clone) => {
  gitIn(clone, "fetch", "--quiet", srcDir, "HEAD");
  gitIn(clone, "checkout", "--quiet", "--force", "--detach", "FETCH_HEAD");
  gitIn(clone, "clean", "-fdq");
};
const lanes = Array.from({ length: workers }, (_, n) => {
  const clone = resolve("scratch/clones", `pw-${label}-${n}`);
  try {
    if (!existsSync(clone)) execFileSync("git", ["clone", "--local", "--quiet", srcDir, clone]);
    syncClone(clone);
  } catch {
    // a stale or foreign clone (different history, broken checkout): rebuild it from the source.
    rmSync(clone, { recursive: true, force: true });
    execFileSync("git", ["clone", "--local", "--quiet", srcDir, clone]);
    syncClone(clone);
  }
  const got = gitIn(clone, "rev-parse", "HEAD");
  if (got !== srcCommit) { console.error(`run-parallel: worker ${n} is at ${got} but the source HEAD is ${srcCommit}`); process.exit(2); }
  const home = join(base, `home-${n}`); const tmp = join(base, `tmp-${n}`);
  for (const d of [home, tmp]) { mkdirSync(d, { recursive: true, mode: 0o700 }); chmodSync(d, 0o700); }
  writeFileSync(join(home, ".gitconfig"), `[user]\n\tname = ${name}\n\temail = ${email}\n`);
  return { n, clone, home, tmp, queue: [] };
});
console.log(`run-parallel: src=${srcDir} commit=${srcCommit} workers=${workers}${dirty.length > 0 ? ` DIRTY-ALLOWED(${dirty.length} uncommitted path(s) NOT included)` : ""}`);
files.forEach((f, i) => lanes[i % workers].queue.push({ f, i }));
const results = new Array(files.length);
const num = (out, k) => (new RegExp(`^ℹ ${k} (\\d+)`, "m").exec(out) ?? [])[1] ?? "?";
const runLane = async (lane) => {
  for (const { f, i } of lane.queue) {
    const env = { ...process.env, HOME: lane.home, USERPROFILE: lane.home, TMPDIR: lane.tmp, TMP: lane.tmp, TEMP: lane.tmp };
    delete env.NODE_TEST_CONTEXT;
    const out = await new Promise((done) => {
      let buf = "";
      const child = spawn(process.execPath, [f], { cwd: lane.clone, env });
      const timer = setTimeout(() => child.kill("SIGKILL"), 3600000);
      child.stdout.on("data", (d) => { buf += d; }); child.stderr.on("data", (d) => { buf += d; });
      child.on("close", (code) => { clearTimeout(timer); done({ code, buf }); });
    });
    const failing = [...new Set([...out.buf.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]).filter((t) => t !== "failing tests:"))];
    let line = `${out.code === 0 ? "GREEN" : "RED  "} exit ${out.code} tests ${num(out.buf, "tests")} pass ${num(out.buf, "pass")} fail ${num(out.buf, "fail")} skip ${num(out.buf, "skipped")} todo ${num(out.buf, "todo")}  ${f}  [worker ${lane.n}]`;
    for (const x of failing) line += `\n   ✖ ${x.slice(0, 160)}`;
    if (num(out.buf, "tests") === "?") line += `\n   (no summary) tail: ${out.buf.trim().split("\n").slice(-3).join(" | ").slice(0, 400)}`;
    results[i] = { line, code: out.code };
  }
};
await Promise.all(lanes.map(runLane));
for (const r of results) console.log(r.line);
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
