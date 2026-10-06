#!/usr/bin/env node
// REGADD reverse-order driver (adapted copy of scratch/REGPROOF/driver.mjs; the original is not modified).
// Applies the two staged packages to fresh exports of HEAD in BOTH orders and compares the end state:
//   registration-first (primary, scratch/REGADD/tree)      : registration package, then S2 package
//   s2-first           (comparison, scratch/REGADD/tree-s2first): S2 package, then registration package
// Run ONCE from the repository root:
//   node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/REGADD/run.log --label regproof-reverse -- node scratch/REGADD/driver.mjs
// Everything is spawnSync with shell:false. Host paths are replaced BEFORE anything is recorded
// (export dirs -> <tree> / <tree-s2first>, repository root -> <repo>).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, userInfo } from "node:os";
import { join, relative, resolve, sep } from "node:path";

const REPO = resolve(process.cwd());
const SCRATCH = join(REPO, "scratch", "REGADD");
const TREE = join(SCRATCH, "tree");
const TREE2 = join(SCRATCH, "tree-s2first");
const TAR = join(SCRATCH, "head.tar");
const OUT_REL = "specs/sprint-alfred-epic/evidence/night-2026-10-05/regproof-regadd-result.json";
const PRIOR_REL = "specs/sprint-alfred-epic/evidence/night-2026-10-05/regproof-result.json";
const OUT_JSON = join(REPO, ...OUT_REL.split("/"));
const TAIL = 40;
const LOG_CAP = 300;

const S2 = "specs/sprint-alfred-epic/design/s2-package-1";
const RP = "specs/sprint-alfred-epic/design/verify-registration-package-1";
const CHECK_SUITE = "harness/scripts/check-verify-suite-registration.mjs";
const CHECK_CASE = "harness/scripts/check-verify-case-completion.mjs";
const FACADE_DST = "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs";
const VERIFY_MJS = "harness/scripts/verify.mjs";
const SPLIT_TEST = "plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs";
// Every file either package writes (the facade copy plus the four files the patches name).
const TARGETS = [
  "plugins/pipeline-core/protected-baseline.json",
  FACADE_DST,
  VERIFY_MJS,
  "docs/product-capability-inventory.json",
  "harness/config/verify-case-completion.v1.json",
];

if (!existsSync(join(SCRATCH, "driver.mjs"))) {
  process.stderr.write("REGADD: run this driver from the repository root (scratch/REGADD/driver.mjs not found under cwd).\n");
  process.exit(1);
}

// ---------------------------------------------------------------- sanitising
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function pathVariants(p) {
  const forms = new Set([p]);
  try { forms.add(realpathSync.native(p)); } catch { /* not created yet */ }
  const out = new Set();
  for (const f of forms) {
    const fwd = f.replaceAll("\\", "/");
    out.add(f);
    out.add(fwd);
    out.add(f.replaceAll("\\", "\\\\"));
    if (/^[A-Za-z]:/.test(f)) out.add(`/${f[0].toLowerCase()}${fwd.slice(2)}`);
  }
  return [...out].filter((v) => v.length > 3).sort((a, b) => b.length - a.length);
}
const RESIDUAL = [
  /(?<![A-Za-z0-9_])[A-Za-z]:[\\/][^\s"'`)<>]*/g,
  /\/(?:home|Users)\/[^\s"'`)<>]*/g,
  /\/mnt\/[a-z]\/[^\s"'`)<>]*/g,
  /\\\\wsl[^\s"'`)<>]*/gi,
];
let fallbackRedactions = 0;
function sanitize(text) {
  if (typeof text !== "string" || text === "") return text;
  let t = text;
  // TREE2 must be replaced before TREE: TREE is a path prefix of TREE2's directory name.
  for (const [p, ph] of [[process.execPath, "<node>"], [TREE2, "<tree-s2first>"], [TREE, "<tree>"], [REPO, "<repo>"], [homedir(), "<home>"]]) {
    for (const v of pathVariants(p)) t = t.replace(new RegExp(escapeRe(v), "gi"), ph);
  }
  for (const re of RESIDUAL) {
    t = t.replace(re, () => { fallbackRedactions += 1; return "<host-path>"; });
  }
  return t;
}
function deepSanitize(v) {
  if (typeof v === "string") return sanitize(v);
  if (Array.isArray(v)) return v.map(deepSanitize);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepSanitize(x)]));
  return v;
}
function allStrings(v, acc = []) {
  if (typeof v === "string") acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, acc));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, acc));
  return acc;
}
function residualHits(obj) {
  let hits = 0;
  const literals = [];
  for (const p of [process.execPath, TREE2, TREE, REPO, homedir()]) literals.push(...pathVariants(p));
  let user = "";
  try { user = userInfo().username ?? ""; } catch { /* ignore */ }
  for (const s of allStrings(obj)) {
    for (const lit of literals) if (new RegExp(escapeRe(lit), "i").test(s)) hits += 1;
    for (const re of RESIDUAL) { re.lastIndex = 0; if (re.test(s)) hits += 1; re.lastIndex = 0; }
    if (user.length >= 4 && new RegExp(`\\b${escapeRe(user)}\\b`, "i").test(s)) hits += 1;
  }
  return hits;
}
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
function toLines(text) {
  const arr = sanitize(text ?? "").split(/\r?\n/);
  while (arr.length > 0 && arr[arr.length - 1] === "") arr.pop();
  return arr;
}
function out(s) { process.stdout.write(`${s}\n`); }

// ---------------------------------------------------------------- step machinery
const steps = [];
let stoppedAt = null;

function skipped(id, stage, description) {
  steps.push({ id, stage, description, status: "skipped", reason: `stopped at ${stoppedAt}` });
  out(`[${id}] SKIPPED (stopped at ${stoppedAt})`);
}

function proc(id, stage, description, cmd, args, opts = {}) {
  const { cwd = REPO, stopOnFail = false, timeoutMs = 300000, highlight = null } = opts;
  if (stoppedAt) { skipped(id, stage, description); return null; }
  const started = Date.now();
  const res = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, input: "" });
  const stdoutLines = toLines(res.stdout);
  const stderrLines = toLines(res.stderr);
  const failed = Boolean(res.error) || res.status !== 0;
  const entry = {
    id,
    stage,
    description,
    status: failed ? "non-zero-or-error" : "ok",
    argv: [cmd === process.execPath ? "node" : cmd, ...args].map(sanitize),
    cwd: "<repo>",
    exitCode: res.error ? null : res.status,
    signal: res.signal ?? null,
    error: res.error ? sanitize(`${res.error.code ?? "ERR"}: ${res.error.message}`) : null,
    durationMs: Date.now() - started,
    stdoutLineCount: stdoutLines.length,
    stderrLineCount: stderrLines.length,
    stdoutSha256: sha256(stdoutLines.join("\n")),
    stderrSha256: sha256(stderrLines.join("\n")),
    stdoutTail: stdoutLines.slice(-TAIL),
    stderrTail: stderrLines.slice(-TAIL),
  };
  if (highlight) entry.highlightLines = stdoutLines.filter((l) => highlight.test(l)).slice(0, 200);
  steps.push(entry);
  out(`[${id}] exit=${entry.exitCode}${entry.error ? ` error=${entry.error}` : ""}  :: ${entry.argv.join(" ")}`);
  for (const [label, arr] of [["stdout", stdoutLines], ["stderr", stderrLines]]) {
    if (arr.length === 0) continue;
    out(`  --- ${label} (${arr.length} line(s)${arr.length > LOG_CAP ? `, showing last ${LOG_CAP}` : ""}) ---`);
    for (const l of arr.slice(-LOG_CAP)) out(`  ${l}`);
  }
  if (failed && stopOnFail) stoppedAt = id;
  return { entry, stdout: res.stdout ?? "", stderr: res.stderr ?? "", stdoutLines, stderrLines, exitCode: entry.exitCode };
}

function internal(id, stage, description, argv, fn, stopOnFail = true) {
  if (stoppedAt) { skipped(id, stage, description); return null; }
  const started = Date.now();
  let exitCode = 0;
  let error = null;
  let detail = null;
  try { detail = fn() ?? null; } catch (e) { exitCode = 1; error = sanitize(`${e.code ?? "ERR"}: ${e.message}`); }
  const entry = { id, stage, description, status: exitCode === 0 ? "ok" : "non-zero-or-error", argv: argv.map(sanitize), cwd: "<repo>", exitCode, signal: null, error, durationMs: Date.now() - started, detail };
  steps.push(entry);
  out(`[${id}] exit=${exitCode}${error ? ` error=${error}` : ""}  :: ${entry.argv.join(" ")}${detail ? `  ${JSON.stringify(deepSanitize(detail))}` : ""}`);
  if (exitCode !== 0 && stopOnFail) stoppedAt = id;
  return entry;
}

function applyPatch(id, stage, rel, tree) {
  const r = proc(id, stage, `apply ${rel} (patch -p1)`, "patch", ["-p1", "-d", tree, "-i", join(REPO, rel)], { stopOnFail: true });
  if (!r) return;
  r.entry.offsetOrFuzzLines = toLines(r.stdout).filter((l) => /offset|fuzz/i.test(l));
  if (stoppedAt === id) {
    const rejects = [];
    for (const m of r.stdout.matchAll(/saving rejects to file (.+)/g)) {
      const file = m[1].trim();
      let tail = null;
      try { tail = toLines(readFileSync(join(tree, file), "utf8")).slice(-TAIL); } catch (e) { tail = [`(reject file unreadable: ${sanitize(e.message)})`]; }
      rejects.push({ file: sanitize(file), tail });
    }
    r.entry.rejects = rejects;
  }
}

function applyS2(tag, tree) {
  applyPatch(`${tag}-s2-protected-baseline`, "S2 package", `${S2}/protected-baseline.patch`, tree);
  internal(`${tag}-s2-facade-copy`, "S2 package", "copy the facade over the guard-lifecycle-ready hook in the export", ["fs.copyFileSync", `${S2}/guard-lifecycle-ready.facade.mjs`, `<tree>/${FACADE_DST}`], () => {
    const dst = join(tree, FACADE_DST);
    const existedBefore = existsSync(dst);
    const beforeBytes = existedBefore ? readFileSync(dst).length : null;
    copyFileSync(join(REPO, S2, "guard-lifecycle-ready.facade.mjs"), dst);
    const after = readFileSync(dst, "utf8");
    return { targetExistedBefore: existedBefore, beforeBytes, afterBytes: Buffer.byteLength(after), afterLineCount: after.split(/\r?\n/).length - (after.endsWith("\n") ? 1 : 0), afterSha256: sha256(after) };
  });
  applyPatch(`${tag}-s2-verify-registration`, "S2 package", `${S2}/verify-registration.patch`, tree);
  applyPatch(`${tag}-s2-inventory-surfaces`, "S2 package", `${S2}/inventory-surfaces.patch`, tree);
}

function applyRP(tag, tree) {
  applyPatch(`${tag}-rp-test-registrations`, "registration package", `${RP}/test-registrations.patch`, tree);
  applyPatch(`${tag}-rp-case-completion-dispositions`, "registration package", `${RP}/case-completion-dispositions.patch`, tree);
  applyPatch(`${tag}-rp-inventory-surfaces`, "registration package", `${RP}/inventory-surfaces.patch`, tree);
}

const stagesByTag = { rf: {}, sf: {} };
function runCheckers(tag, tree, stageKey, stageLabel) {
  const a = proc(`${tag}-${stageKey}-suite-registration`, stageLabel, "check-verify-suite-registration against the export", process.execPath, [CHECK_SUITE, "--root", tree]);
  const b = proc(`${tag}-${stageKey}-case-completion`, stageLabel, "check-verify-case-completion against the export", process.execPath, [CHECK_CASE, "--root", tree]);
  const rec = { suiteRegistration: a ? a.exitCode : "skipped", caseCompletion: b ? b.exitCode : "skipped" };
  if (a) {
    rec.suiteRegistrationUnregistered = a.stderrLines.map((l) => /^UNREGISTERED (\S+)/.exec(l)?.[1]).filter(Boolean);
    rec.suiteRegistrationSummary = a.stderrLines.filter((l) => /^Verify suite registration/.test(l)).concat(a.stdoutLines.filter((l) => /^Verify suite registration/.test(l))).pop() ?? null;
  }
  if (b) rec.caseCompletionSummary = b.stdoutLines.concat(b.stderrLines).filter((l) => /^Verify case-completion/.test(l)).pop() ?? null;
  // Count the finding kinds from the FULL output (the step entries keep only a tail), so "0 uncategorized, 0 duplicate" is measured.
  const kinds = (lines) => { const k = {}; for (const l of lines) { const m = /^([A-Z][A-Z0-9_-]{3,})\b/.exec(l); if (m) k[m[1]] = (k[m[1]] ?? 0) + 1; } return k; };
  if (a) rec.suiteRegistrationFindingKinds = kinds(a.stderrLines.concat(a.stdoutLines));
  if (b) rec.caseCompletionFindingKinds = kinds(b.stderrLines.concat(b.stdoutLines));
  stagesByTag[tag][stageKey] = rec;
}

function toolVersion(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: REPO, encoding: "utf8", shell: false, windowsHide: true, input: "" });
  if (r.error) return `unavailable: ${r.error.code ?? "ERR"}`;
  return (toLines(r.stdout)[0] ?? toLines(r.stderr)[0] ?? "").slice(0, 200);
}

// ---------------------------------------------------------------- end state (target hashes + whole-tree digest)
function walkHashes(root) {
  const map = new Map();
  let nonFile = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, d.name);
      if (d.isDirectory()) stack.push(abs);
      else if (d.isFile()) map.set(relative(root, abs).split(sep).join("/"), sha256(readFileSync(abs)));
      else nonFile += 1;
    }
  }
  return { map, nonFile };
}
function treeDigest(map) {
  const h = createHash("sha256");
  for (const k of [...map.keys()].sort()) h.update(`${k}\0${map.get(k)}\n`);
  return h.digest("hex");
}
function endStateOf(tree) {
  const targets = TARGETS.map((p) => {
    const abs = join(tree, p);
    if (!existsSync(abs)) throw new Error(`end-state target missing: ${p}`);
    const buf = readFileSync(abs);
    return { path: p, sha256: sha256(buf), bytes: buf.length };
  });
  const { map, nonFile } = walkHashes(tree);
  return { targets, wholeTree: { fileCount: map.size, nonFileEntries: nonFile, digestSha256: treeDigest(map) }, map };
}
const endStates = { rf: null, sf: null };
function recordEndState(tag, tree, stage) {
  internal(`${tag}-end-state`, stage, "sha256 of every patched target plus a whole-tree digest of the export", ["fs.readFileSync+sha256", "<tree>", `${TARGETS.length} targets + whole tree`], () => {
    const es = endStateOf(tree);
    endStates[tag] = es;
    return { targets: es.targets, wholeTree: es.wholeTree };
  });
}

// ---------------------------------------------------------------- the run
const toolVersions = { git: toolVersion("git", ["--version"]), tar: toolVersion("tar", ["--version"]), patch: toolVersion("patch", ["--version"]) };
out(`REGADD reverse driver start; node ${process.version}; platform ${process.platform}`);
out(`tools: ${JSON.stringify(toolVersions)}`);

const inputs = [];
for (const rel of [
  `${S2}/protected-baseline.patch`, `${S2}/guard-lifecycle-ready.facade.mjs`, `${S2}/verify-registration.patch`, `${S2}/inventory-surfaces.patch`,
  `${RP}/test-registrations.patch`, `${RP}/case-completion-dispositions.patch`, `${RP}/inventory-surfaces.patch`,
]) {
  try { inputs.push({ path: rel, sha256: sha256(readFileSync(join(REPO, rel))) }); } catch (e) { inputs.push({ path: rel, sha256: null, error: sanitize(e.message) }); }
}

const sha = proc("head-sha", "setup", "record the HEAD commit that is exported", "git", ["rev-parse", "HEAD"], { stopOnFail: true });
const headSha = sha ? sha.stdout.trim() : null;

internal("clean-scratch", "setup", "remove stale exports and tar from a previous attempt (scratch/REGADD only)", ["fs.rmSync", "<repo>/scratch/REGADD/tree", "<repo>/scratch/REGADD/tree-s2first", "<repo>/scratch/REGADD/head.tar"], () => {
  for (const p of [TREE, TREE2, TAR]) if (!p.startsWith(SCRATCH + sep)) throw new Error("refusing to clean outside scratch/REGADD");
  rmSync(TREE, { recursive: true, force: true });
  rmSync(TREE2, { recursive: true, force: true });
  rmSync(TAR, { force: true });
});
proc("git-archive", "setup", "export HEAD as a tar", "git", ["archive", "--format=tar", "--output=scratch/REGADD/head.tar", "HEAD"], { stopOnFail: true });
internal("mkdir-trees", "setup", "create the two export directories", ["fs.mkdirSync", "<tree>", "<tree-s2first>", "{recursive:true}"], () => { mkdirSync(TREE, { recursive: true }); mkdirSync(TREE2, { recursive: true }); });
proc("tar-extract-rf", "setup", "extract the export for the registration-first order", "tar", ["-xf", "scratch/REGADD/head.tar", "-C", "scratch/REGADD/tree"], { stopOnFail: true });
proc("tar-extract-sf", "setup", "extract the export for the s2-first order", "tar", ["-xf", "scratch/REGADD/head.tar", "-C", "scratch/REGADD/tree-s2first"], { stopOnFail: true });
internal("tree-sanity", "setup", "both exports hold the files the later steps use", ["fs.existsSync", "<tree>|<tree-s2first>", VERIFY_MJS, FACADE_DST, SPLIT_TEST], () => {
  const need = [VERIFY_MJS, FACADE_DST, SPLIT_TEST, "harness/verify-suites.json"];
  const missing = [];
  for (const t of [TREE, TREE2]) for (const p of need) if (!existsSync(join(t, p))) missing.push(`${t === TREE ? "<tree>" : "<tree-s2first>"}/${p}`);
  if (missing.length > 0) throw new Error(`export is missing: ${missing.join(", ")}`);
  return { checked: need };
});

// ---- order 1 (primary): registration package first, then S2 package
runCheckers("rf", TREE, "baseline", "baseline (unpatched export of HEAD)");
applyRP("rf", TREE);
runCheckers("rf", TREE, "afterRegistration", "after the registration package (registration-first)");
applyS2("rf", TREE);
runCheckers("rf", TREE, "afterBoth", "after both packages (registration-first, end state)");
proc("rf-check-verify-mjs", "extra (registration-first end state)", "node --check on the patched Verify entry point", process.execPath, ["--check", join(TREE, VERIFY_MJS)]);
proc("rf-check-guard-lifecycle-ready", "extra (registration-first end state)", "node --check on the facade", process.execPath, ["--check", join(TREE, FACADE_DST)]);
recordEndState("rf", TREE, "end state (registration-first)");

// ---- order 2 (comparison): S2 package first, then registration package (the order REGPROOF measured)
applyS2("sf", TREE2);
runCheckers("sf", TREE2, "afterS2", "after the S2 package (s2-first)");
applyRP("sf", TREE2);
runCheckers("sf", TREE2, "afterBoth", "after both packages (s2-first, end state)");
proc("sf-check-verify-mjs", "extra (s2-first end state)", "node --check on the patched Verify entry point", process.execPath, ["--check", join(TREE2, VERIFY_MJS)]);
proc("sf-check-guard-lifecycle-ready", "extra (s2-first end state)", "node --check on the facade", process.execPath, ["--check", join(TREE2, FACADE_DST)]);
recordEndState("sf", TREE2, "end state (s2-first)");

// ---------------------------------------------------------------- comparison
let identicalEndState = null;
let comparison = { status: "not-determined", reason: stoppedAt ? `stopped at ${stoppedAt}` : "end state not recorded" };
if (endStates.rf && endStates.sf) {
  const diffTargets = TARGETS.filter((p) => endStates.rf.targets.find((t) => t.path === p).sha256 !== endStates.sf.targets.find((t) => t.path === p).sha256);
  const allPaths = new Set([...endStates.rf.map.keys(), ...endStates.sf.map.keys()]);
  const diffPaths = [...allPaths].filter((p) => endStates.rf.map.get(p) !== endStates.sf.map.get(p)).sort();
  const wholeTreeIdentical = endStates.rf.wholeTree.digestSha256 === endStates.sf.wholeTree.digestSha256;
  identicalEndState = diffTargets.length === 0 && diffPaths.length === 0 && wholeTreeIdentical;
  comparison = {
    status: "determined",
    registrationFirstTargets: endStates.rf.targets,
    s2FirstTargets: endStates.sf.targets,
    differingTargets: diffTargets,
    targetsIdentical: diffTargets.length === 0,
    wholeTreeFileCount: { registrationFirst: endStates.rf.wholeTree.fileCount, s2First: endStates.sf.wholeTree.fileCount },
    wholeTreeDigestSha256: { registrationFirst: endStates.rf.wholeTree.digestSha256, s2First: endStates.sf.wholeTree.digestSha256 },
    wholeTreeIdentical,
    differingPathsAllPatchBackups: diffPaths.every((p) => p.endsWith(".orig")),
    differingPathCount: diffPaths.length,
    differingPaths: diffPaths.slice(0, 50),
  };
}

// ---------------------------------------------------------------- cross-check against the earlier S2-first measurement
let regproofFile = { path: PRIOR_REL, readable: false };
try {
  const raw = readFileSync(join(REPO, ...PRIOR_REL.split("/")));
  const prior = JSON.parse(raw.toString("utf8"));
  const priorInputs = new Map((prior.inputs ?? []).map((i) => [i.path, i.sha256]));
  const inputMismatches = inputs.filter((i) => priorInputs.get(i.path) !== i.sha256).map((i) => i.path);
  const facadeStep = (prior.steps ?? []).find((s) => s.id === "s2-facade-copy");
  const sfStages = stagesByTag.sf;
  const exitsOf = (s) => (s ? { suiteRegistration: s.suiteRegistration, caseCompletion: s.caseCompletion } : null);
  const sameExits = (a, b) => Boolean(a && b) && a.suiteRegistration === b.suiteRegistration && a.caseCompletion === b.caseCompletion;
  regproofFile = {
    path: PRIOR_REL,
    readable: true,
    fileSha256: sha256(raw),
    schema: prior.schema ?? null,
    headSha: prior.headSha ?? null,
    recordsEndStateTargetHashes: Boolean(prior.endState),
    recordedTargetHashes: facadeStep?.detail?.afterSha256 ? { [FACADE_DST]: facadeStep.detail.afterSha256 } : {},
    inputsEqualCurrent: inputMismatches.length === 0,
    inputMismatches,
    stagesAfterS2EqualS2FirstRun: sameExits(exitsOf(prior.stages?.afterS2), exitsOf(sfStages.afterS2)),
    stagesAfterBothEqualS2FirstRun: sameExits(exitsOf(prior.stages?.afterBoth), exitsOf(sfStages.afterBoth)),
    facadeHashEqualsS2FirstRun: Boolean(facadeStep?.detail?.afterSha256) && endStates.sf !== null && facadeStep.detail.afterSha256 === endStates.sf.targets.find((t) => t.path === FACADE_DST).sha256,
    note: "the earlier file records only the facade's after-copy sha256, not the end-state hashes of all targets, so the S2-first order was re-run inside this driver",
  };
} catch (e) {
  regproofFile = { path: PRIOR_REL, readable: false, error: sanitize(`${e.code ?? "ERR"}: ${e.message}`) };
}

// ---------------------------------------------------------------- machine-evaluated acceptance checks (REGADD)
const Q11_PAIR = ["plugins/pipeline-core/lib/hardened-private-directory.install.test.mjs", "plugins/pipeline-core/scripts/gitleaks-repair-ignore.cli.test.mjs"];
const VALUE_BINDING_FILE = "plugins/pipeline-core/scripts/gitleaks-repair-ignore.value-binding.test.mjs";
const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
const entryCount = (s) => { const m = /(\d+)\s+entr/i.exec(s ?? ""); return m ? Number(m[1]) : null; };
const patchSteps = steps.filter((s) => Array.isArray(s.argv) && s.argv[0] === "patch");
const endStageChecks = (tag) => {
  const end = stagesByTag[tag].afterBoth;
  const base = stagesByTag[tag].baseline;
  return end ? {
    suiteRegistrationExit: end.suiteRegistration,
    unregisteredAfterBoth: end.suiteRegistrationUnregistered ?? null,
    unregisteredIsExactlyQ11Pair: sameSet(end.suiteRegistrationUnregistered, Q11_PAIR),
    valueBindingFileStillUnregistered: (end.suiteRegistrationUnregistered ?? []).includes(VALUE_BINDING_FILE),
    suiteRegistrationFindingKinds: end.suiteRegistrationFindingKinds ?? null,
    zeroUncategorizedAndDuplicate: Object.keys(end.suiteRegistrationFindingKinds ?? {}).every((k) => k === "UNREGISTERED"),
    caseCompletionExit: end.caseCompletion,
    caseCompletionFindingKinds: end.caseCompletionFindingKinds ?? null,
    caseCompletionEntriesBefore: entryCount(base?.caseCompletionSummary),
    caseCompletionEntriesAfter: entryCount(end.caseCompletionSummary),
    caseCompletionSummaryBefore: base?.caseCompletionSummary ?? null,
    caseCompletionSummaryAfter: end.caseCompletionSummary ?? null,
    baselineUnregisteredCount: (base?.suiteRegistrationUnregistered ?? []).length,
    baselineContainsValueBindingFile: (base?.suiteRegistrationUnregistered ?? []).includes(VALUE_BINDING_FILE),
  } : null;
};
const assertions = {
  patchStepCount: patchSteps.length,
  allPatchStepsExitZero: patchSteps.length === 12 && patchSteps.every((s) => s.exitCode === 0),
  registrationFirstAfterBoth: endStageChecks("rf"),
  s2FirstAfterBoth: endStageChecks("sf"),
  targetsIdenticalInBothOrders: comparison.targetsIdentical ?? null,
  differingPathsOnlyPatchBackups: comparison.differingPathsAllPatchBackups ?? null,
};
assertions.allPass = Boolean(
  assertions.allPatchStepsExitZero && assertions.targetsIdenticalInBothOrders && assertions.differingPathsOnlyPatchBackups &&
  [assertions.registrationFirstAfterBoth, assertions.s2FirstAfterBoth].every((c) => c && c.suiteRegistrationExit === 2 && c.unregisteredIsExactlyQ11Pair && c.zeroUncategorizedAndDuplicate && c.caseCompletionExit === 0),
);
out(`assertions: ${JSON.stringify(assertions)}`);

// ---------------------------------------------------------------- the result file
const result = {
  schema: "pipeline.alfred.regproof.v1",
  order: "registration-first",
  assertions,
  headSha,
  nodeVersion: process.version,
  platform: process.platform,
  generatedAt: new Date().toISOString(),
  placeholders: { tree: "<tree>", treeS2First: "<tree-s2first>", repo: "<repo>", node: "<node>", home: "<home>", host: "<host-path>" },
  tailLimit: TAIL,
  toolVersions,
  inputs,
  stoppedAt,
  stages: stagesByTag.rf,
  endState: endStates.rf ? { targets: endStates.rf.targets, wholeTree: endStates.rf.wholeTree } : null,
  s2FirstOrder: {
    order: "s2-first",
    stages: stagesByTag.sf,
    endState: endStates.sf ? { targets: endStates.sf.targets, wholeTree: endStates.sf.wholeTree } : null,
  },
  identicalEndState,
  comparison,
  regproofResultFile: regproofFile,
  steps,
};
const clean = deepSanitize(result);
clean.fallbackRedactions = fallbackRedactions;
const hits = residualHits(clean);
clean.residualHostPathCheck = { hits };
if (hits > 0) {
  process.stderr.write(`REGADD: ${hits} residual host-path hit(s) in the result; refusing to write regproof-regadd-result.json.\n`);
  process.exit(1);
}
mkdirSync(join(REPO, "specs", "sprint-alfred-epic", "evidence", "night-2026-10-05"), { recursive: true });
writeFileSync(OUT_JSON, `${JSON.stringify(clean, null, 2)}\n`, "utf8");
out(`REGADD result written: ${OUT_REL} (steps=${steps.length}, stoppedAt=${stoppedAt}, fallbackRedactions=${fallbackRedactions}, residualHits=${hits})`);
out(`registration-first stage exit codes: ${JSON.stringify(stagesByTag.rf)}`);
out(`s2-first stage exit codes: ${JSON.stringify(stagesByTag.sf)}`);
out(`identicalEndState: ${identicalEndState}`);
process.exit(stoppedAt ? 1 : 0);
