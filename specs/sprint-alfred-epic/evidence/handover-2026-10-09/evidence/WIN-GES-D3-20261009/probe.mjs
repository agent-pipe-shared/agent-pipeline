// WIN-GES-D3 probe (diagnosis only; no production edit). Run natively: node scratch/dispatch/win-ges-d3-a1/probe.mjs
// Every emitted string is scrubbed of host paths, user name, host name and e-mail-shaped text.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const evidenceDir = path.join(repoRoot, "evidence", "WIN-GES-D3-20261009");
mkdirSync(evidenceDir, { recursive: true });
try { copyFileSync(fileURLToPath(import.meta.url), path.join(evidenceDir, "probe.mjs")); } catch { /* best effort */ }

const labelled = [
  [repoRoot, "<repo-root>"], [os.tmpdir(), "<tmp>"], [os.homedir(), "<home>"],
  [os.userInfo().username, "<user>"], [os.hostname(), "<host>"],
].filter(([s]) => typeof s === "string" && s.length > 1).sort((a, b) => b[0].length - a[0].length);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
function scrub(input) {
  let out = String(input);
  for (const [secret, label] of labelled) {
    out = out.replace(new RegExp(esc(secret), "giu"), label);
    out = out.replace(new RegExp(esc(secret.replaceAll("\\", "/")), "giu"), label);
  }
  out = out.replace(/[A-Za-z]:[\\/][^\s"'<>|]*/gu, "<abs-path>");
  return out.replace(/[^\s"'\\]+@[^\s"'\\]+/gu, "<email>");
}
function clean(value) {
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  return value;
}
const emit = (o) => console.log(JSON.stringify(clean(o)));

let spawnCount = 0;
function makeRun(tag) {
  return (exe, argv, opts) => {
    const script = String(argv[argv.length - 1]);
    const purpose = script.includes("Set-Acl") ? "harden-script" : script.includes("Get-Acl") ? "observe-script" : "other-script";
    const t0 = process.hrtime.bigint();
    const r = spawnSync(exe, argv, opts);
    const ms = Number((process.hrtime.bigint() - t0) / 1_000_000n);
    spawnCount += 1;
    emit({
      ev: "spawn", tag, n: spawnCount, purpose, windowsHide: opts?.windowsHide === true, status: r.status, signal: r.signal ?? null,
      errorCode: r.error?.code ?? null, errorMessage: r.error?.message ?? null, ms,
      stdout: String(r.stdout ?? "").slice(0, 500), stderr: String(r.stderr ?? "").slice(0, 700),
    });
    return r;
  };
}

const made = [];
const mk = (label) => { const d = mkdtempSync(path.join(os.tmpdir(), `ges-d3-${label}-`)); made.push(d); return d; };
const brief = (call, r, before) => emit({ ev: "result", call, status: r?.status ?? null, reason: r?.reason ?? null, spawnsInCall: spawnCount - before });
async function attempt(call, fn) {
  const before = spawnCount;
  try { const r = await fn(); emit({ ev: "result", call, returned: typeof r === "string" ? "root-path" : "ok", spawnsInCall: spawnCount - before }); }
  catch (e) { emit({ ev: "result", call, threw: true, code: e?.code ?? null, message: e?.message ?? String(e), spawnsInCall: spawnCount - before }); }
}

try {
  emit({ ev: "env", platform: process.platform, node: process.version });
  const lib = (n) => import(pathToFileURL(path.join(repoRoot, "plugins", "pipeline-core", "lib", n)).href);
  const wps = await lib("windows-private-state.mjs");
  const store = await lib("governance-event-store.mjs");

  // Experiment A: the hardener three times on ONE fresh directory, then the assessor.
  const dirA = mk("a");
  for (let i = 1; i <= 3; i += 1) {
    const before = spawnCount;
    brief(`A.harden#${i}`, wps.hardenWindowsPrivateDirectory(dirA, { run: makeRun(`A.harden#${i}`) }), before);
  }
  { const before = spawnCount; brief("A.assess", wps.assessWindowsPrivatePath(dirA, { run: makeRun("A.assess") }), before); }

  // Experiment C: store-like state (children present) between two hardens.
  const dirC = mk("c");
  { const before = spawnCount; brief("C.harden#1", wps.hardenWindowsPrivateDirectory(dirC, { run: makeRun("C.harden#1") }), before); }
  mkdirSync(path.join(dirC, "records"));
  writeFileSync(path.join(dirC, "records", "x.json"), "{}\n");
  { const before = spawnCount; brief("C.harden#2 (children present)", wps.hardenWindowsPrivateDirectory(dirC, { run: makeRun("C.harden#2") }), before); }
  { const before = spawnCount; brief("C.assess", wps.assessWindowsPrivatePath(dirC, { run: makeRun("C.assess") }), before); }

  // Experiment B: the store route, instrumented through the production io seam (real functions, spied spawn).
  const repoStandIn = mk("repo");
  const rootB = path.join(mk("bparent"), "restricted");
  const ioB = (tag) => ({
    harden: (p) => { const before = spawnCount; const r = wps.hardenWindowsPrivateDirectory(p, { run: makeRun(`${tag}.io.harden`) }); brief(`${tag}.io.harden`, r, before); return r; },
    assess: (p) => { const before = spawnCount; const r = wps.assessWindowsPrivatePath(p, { run: makeRun(`${tag}.io.assess`) }); brief(`${tag}.io.assess`, r, before); return r; },
  });
  await attempt("B1 assertRestrictedRoot create:true (fixture)", () => store.assertRestrictedRoot(repoStandIn, rootB, { create: true }, ioB("B1")));
  await attempt("B2 assertRestrictedRoot create:false (plan)", () => store.assertRestrictedRoot(repoStandIn, rootB, {}, ioB("B2")));
  await attempt("B3 assertRestrictedRoot create:true (first put)", () => store.assertRestrictedRoot(repoStandIn, rootB, { create: true }, ioB("B3")));
  await attempt("B4 assertRestrictedRoot create:true (second put)", () => store.assertRestrictedRoot(repoStandIn, rootB, { create: true }, ioB("B4")));

  // Experiment D: the same store route with the DEFAULT io (no spy in the path at all).
  const rootD = path.join(mk("dparent"), "restricted");
  await attempt("D1 assertRestrictedRoot create:true default io", () => store.assertRestrictedRoot(repoStandIn, rootD, { create: true }));
  await attempt("D2 assertRestrictedRoot create:false default io", () => store.assertRestrictedRoot(repoStandIn, rootD, {}));
  await attempt("D3 assertRestrictedRoot create:true default io", () => store.assertRestrictedRoot(repoStandIn, rootD, { create: true }));
  await attempt("D4 assertRestrictedRoot create:true default io", () => store.assertRestrictedRoot(repoStandIn, rootD, { create: true }));
  emit({ ev: "done", totalSpawns: spawnCount });
} catch (e) {
  emit({ ev: "probe-fault", message: e?.message ?? String(e), stack: String(e?.stack ?? "").split("\n").slice(0, 4).join(" | ") });
  process.exitCode = 2;
} finally {
  for (const d of made) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
}
