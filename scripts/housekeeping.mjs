// Purpose: housekeeping for growing runtime state of a git checkout. First collector: `hook-runtime-snapshots` - the
//          generated git hooks (pre-commit, commit-msg, pre-push) each keep one `runtime-<64 hex>` snapshot directory per
//          install under `<git common dir>/agent-pipeline/<hook>-hook/`; only the one named in that directory's impl.mjs is live.
//          The script plans which older snapshots can be moved aside and, on request, moves them. It NEVER deletes anything.
// Usage:   node scripts/housekeeping.mjs plan  [--root <repo>] [--keep-newest <n>]
//          node scripts/housekeeping.mjs apply --plan-sha256 <digest> --aside <dir> [--root <repo>] [--keep-newest <n>] [--stamp <name>]
//          (default root: the current directory; default keep-newest: 1, so the previous snapshot survives a rollback)
// Inputs:  the repository's git common dir (`git rev-parse --git-common-dir`). Not a git repository: status `unavailable`, nothing planned.
// Output:  plan -> one JSON document {schema:"pipeline.housekeeping-plan.v1", collectors, planSha256}; paths are relative to the git
//          common dir, never absolute. apply -> the plan plus per-item moved/failed, also written to <aside>/<stamp>/manifest.json.
//          Exit 0 ok; 1 when a move failed (the snapshot stays in place); 2 on a refusal or bad usage (code on stderr).
// Safety:  plan writes nothing. apply recomputes the plan and refuses a different digest (HK-PLAN-DRIFT); refuses a missing aside
//          directory (HK-ASIDE-MISSING) or one inside the git common dir or the repository root (HK-ASIDE-INSIDE-REPO). It moves
//          with fs.renameSync into <aside>/<UTC stamp>/<hook dir>/<name>; a rename that fails (for example across file systems) is
//          reported failed and left in place - never copy-then-delete. Only real directories (lstat) are planned; links are never
//          followed; impl.mjs, install-marker.json and every other entry are never touched. Hooks and guards never run this.
// Add a collector: append one { id, owns, plan(context) } entry to COLLECTORS; plan(context) returns { status, hookDirs, count, bytes }
//          where every hookDir lists planned items as { name, bytes } and the apply step moves them from context.stateDir.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HOOK_DIRS = ["pre-commit-hook", "commit-msg-hook", "pre-push-hook"];
const SNAPSHOT = /^runtime-[0-9a-f]{64}$/;
const SNAPSHOT_IN_TEXT = /runtime-[0-9a-f]{64}/g;

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// total size of regular files below dir, links counted by their own lstat size, never followed
function dirBytes(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += dirBytes(p);
    else total += lstatSync(p).size;
  }
  return total;
}

function planHookDir(stateDir, hook, keepNewest) {
  const dir = join(stateDir, hook);
  const entry = { dir: hook, live: null, status: "ok", planned: [], retained: [] };
  let st;
  try { st = lstatSync(dir); } catch { return { ...entry, status: "absent", reason: "hook directory does not exist" }; }
  if (!st.isDirectory()) return { ...entry, status: "unreadable", reason: "hook path is not a directory" };
  const unreadable = (reason) => ({ ...entry, status: "unreadable", reason });
  let impl;
  try {
    const ist = lstatSync(join(dir, "impl.mjs"));
    if (!ist.isFile()) return unreadable("impl.mjs is not a regular file");
    impl = readFileSync(join(dir, "impl.mjs"), "utf8");
  } catch { return unreadable("impl.mjs is missing or unreadable"); }
  const named = [...new Set(impl.match(SNAPSHOT_IN_TEXT) ?? [])];
  if (named.length === 0) return unreadable("impl.mjs names no runtime snapshot");
  if (named.length > 1) return unreadable("impl.mjs names more than one runtime snapshot");
  const live = named[0];
  let liveStat;
  try { liveStat = lstatSync(join(dir, live)); } catch { liveStat = null; }
  if (!liveStat || !liveStat.isDirectory()) return unreadable("the snapshot impl.mjs names does not exist as a directory");
  entry.live = live;
  const others = [];
  for (const e of readdirSync(dir)) {
    if (!SNAPSHOT.test(e) || e === live) continue;
    const s = lstatSync(join(dir, e));
    if (!s.isDirectory()) continue; // symlink or plain file: never planned
    others.push({ name: e, mtimeMs: s.mtimeMs });
  }
  others.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  const kept = others.slice(0, keepNewest);
  const doomed = others.slice(keepNewest);
  entry.retained = kept.map((k) => ({ name: k.name })).sort((a, b) => a.name.localeCompare(b.name));
  entry.planned = doomed.map((d) => ({ name: d.name, bytes: dirBytes(join(dir, d.name)) })).sort((a, b) => a.name.localeCompare(b.name));
  return entry;
}

export const COLLECTORS = [
  {
    id: "hook-runtime-snapshots",
    owns: "agent-pipeline/{pre-commit,commit-msg,pre-push}-hook/runtime-<sha256> snapshot directories that no impl.mjs names",
    plan(context) {
      if (!context.stateDir) return { status: "unavailable", hookDirs: [], count: 0, bytes: 0 };
      const hookDirs = HOOK_DIRS.map((h) => planHookDir(context.stateDir, h, context.keepNewest));
      return {
        status: "ok",
        hookDirs,
        count: hookDirs.reduce((n, h) => n + h.planned.length, 0),
        bytes: hookDirs.reduce((n, h) => n + h.planned.reduce((m, p) => m + p.bytes, 0), 0),
      };
    },
  },
];

function gitCommonDir(root) {
  try {
    const out = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out ? resolve(root, out) : null;
  } catch { return null; }
}

export function buildPlan({ root, keepNewest = 1 }) {
  const commonDir = gitCommonDir(root);
  const stateDir = commonDir ? join(commonDir, "agent-pipeline") : null;
  const context = { stateDir, keepNewest };
  const collectors = COLLECTORS.map((c) => ({ id: c.id, ...c.plan(context) }));
  const body = { schema: "pipeline.housekeeping-plan.v1", collectors };
  return { doc: { ...body, planSha256: sha256(canonical(body)) }, commonDir, stateDir };
}

// real path of the deepest existing ancestor plus the not-yet-existing remainder
function realish(p) {
  let cur = resolve(p);
  const rest = [];
  while (!existsSync(cur)) { rest.unshift(cur.slice(dirname(cur).length + 1)); const up = dirname(cur); if (up === cur) break; cur = up; }
  return join(realpathSync(cur), ...rest);
}
const inside = (base, p) => { const r = relative(base, p); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

class Refusal extends Error { constructor(code, msg) { super(`${code}: ${msg}`); this.code = code; } }

function parse(argv) {
  const [verb, ...rest] = argv;
  const opts = { verb, root: ".", keepNewest: 1, planSha256: null, aside: null, stamp: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const v = () => { if (i + 1 >= rest.length) throw new Refusal("HK-USAGE", `${a} needs a value`); return rest[++i]; };
    if (a === "--root") opts.root = v();
    else if (a === "--keep-newest") { const n = v(); if (!/^\d+$/.test(n)) throw new Refusal("HK-USAGE", "--keep-newest needs a non-negative integer"); opts.keepNewest = Number(n); }
    else if (a === "--plan-sha256") opts.planSha256 = v();
    else if (a === "--aside") opts.aside = v();
    else if (a === "--stamp") opts.stamp = v();
    else throw new Refusal("HK-USAGE", `unknown argument ${a}`);
  }
  if (verb !== "plan" && verb !== "apply") throw new Refusal("HK-USAGE", "usage: housekeeping.mjs plan|apply [options] (see the header)");
  return opts;
}

function apply(opts) {
  const root = resolve(opts.root);
  const { doc, commonDir, stateDir } = buildPlan({ root, keepNewest: opts.keepNewest });
  if (!opts.planSha256 || opts.planSha256 !== doc.planSha256) throw new Refusal("HK-PLAN-DRIFT", "the plan digest does not match the current plan; run plan again");
  if (!opts.aside) throw new Refusal("HK-ASIDE-MISSING", "--aside <dir> is required");
  const aside = realish(opts.aside);
  const guards = [realish(root), ...(commonDir ? [realish(commonDir)] : [])];
  if (guards.some((g) => inside(g, aside))) throw new Refusal("HK-ASIDE-INSIDE-REPO", "the aside directory must be outside the repository and its git directory");
  if (existsSync(aside) && !lstatSync(aside).isDirectory()) throw new Refusal("HK-ASIDE-NOT-DIRECTORY", "the aside path exists and is not a directory");
  const stamp = opts.stamp ?? new Date().toISOString().replace(/[:.]/g, "-");
  const stampDir = join(aside, stamp);
  let stampStat = null;
  try { stampStat = lstatSync(stampDir); } catch { /* new */ }
  if (stampStat?.isDirectory()) throw new Refusal("HK-ASIDE-COLLISION", "the stamped directory already exists in the aside directory");
  const items = [];
  let stampError = null;
  try { mkdirSync(stampDir, { recursive: true }); } catch (e) { stampError = e.code ?? String(e.message); }
  for (const c of doc.collectors) {
    for (const h of c.hookDirs) {
      for (const p of h.planned) {
        const item = { collector: c.id, dir: h.dir, name: p.name, bytes: p.bytes, result: "failed" };
        try {
          if (stampError) throw Object.assign(new Error(stampError), { code: stampError });
          const src = join(stateDir, h.dir, p.name);
          if (!lstatSync(src).isDirectory()) throw new Error("not a real directory any more");
          const destParent = join(stampDir, h.dir);
          mkdirSync(destParent, { recursive: true });
          renameSync(src, join(destParent, p.name));
          item.result = "moved";
        } catch (e) { item.error = e.code ?? String(e.message); }
        items.push(item);
      }
    }
  }
  const report = { schema: "pipeline.housekeeping-apply.v1", stamp, plan: doc, items };
  if (!stampError) {
    try { writeFileSync(join(stampDir, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`); } catch { report.manifestWritten = false; }
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return items.some((i) => i.result === "failed") ? 1 : 0;
}

function main(argv) {
  try {
    const opts = parse(argv);
    if (opts.verb === "plan") {
      process.stdout.write(`${JSON.stringify(buildPlan({ root: resolve(opts.root), keepNewest: opts.keepNewest }).doc, null, 2)}\n`);
      return 0;
    }
    return apply(opts);
  } catch (e) {
    if (e instanceof Refusal) { process.stderr.write(`${e.message}\n`); return 2; }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
