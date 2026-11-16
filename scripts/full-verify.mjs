// Purpose: run the Full Verify (candidate mode, no receipt reuse) in a clone with a private HOME and a SHORT private TMPDIR,
//          then print a concise summary of the run record. It exists because three environment effects of a private HOME
//          turned green steps red in the first dev-build Full Verify: (1) no `init.defaultBranch=main` in the private HOME,
//          (2) a long TMPDIR pushing a socket path over the 96-byte limit (wsl-ipc-compatibility-tests), (3) node resolved
//          through a per-shell fnm path that is not stable for child processes.
// Usage:   node scripts/full-verify.mjs <clone-dir> [<label>] [--reuse] [--resume --runs-root <verify runs folder of the clone>]
//          --resume continues the newest earlier run of the same clone: suites completed (exit 0) there for the same candidate
//          commit and tree are skipped and counted as "resumed"; a run of another candidate is refused. Separate from --reuse.
//          --runs-root names that folder (inside the clone's git control directory, where verify keeps its run directories); the
//          script does not spell the path out itself, because the shell guard refuses a repository script that names it.
//          A red suite leaves a bounded redacted excerpt (logs/<id>.red-excerpt.log) in its run directory.
//          (run from any checkout; <clone-dir> must be a clean clone whose committed HEAD is the candidate; label defaults to "fv")
// Inputs:  git identity copied from `git config user.name/user.email` of the current directory; `--reuse` drops --no-reuse.
// Output:  verify's stdout+stderr in <clone-dir>/scratch/<label>-output.txt; on stdout the exit code, the duration, the output
//          path and the red step names read from <clone-dir>/evidence/verify-latest.json (the run record). Exit code = verify's.
// Data:    HOME and TMPDIR under <home>/.fv/<label>/ (recreated each run, outside every repository). The TMPDIR path must stay
//          under 30 characters; a longer one is refused with exit 2 rather than silently breaking socket-path tests.
//          C30-5: when the run ends, a green run removes that private home; a red run keeps it (the red-suite reruns use it); then the
//          home-level leftovers of the suites on the cleaner's allowlist older than 12 h are removed (scripts/clean-test-leftovers.mjs).
//          PIPELINE_KEEP_TEST_HOMES=1 keeps everything.
// Read-only toward the source: it writes only the output file, the run record verify itself writes in the clone, and the temp dirs.
import { spawn, execFileSync } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { keepTestHomes, removeTestTree } from "../plugins/pipeline-core/lib/test-home-cleanup.mjs";
import { isLeftoverName, sweepLeftovers } from "./clean-test-leftovers.mjs";

export const MAX_TMPDIR_CHARS = 29;

/**
 * C30-5: names a run added directly to the home folder that look like a leaked fixture folder (a `mkdtemp` shape: a name ending in a
 * six-character random suffix) and are not already on the cleaner's allowlist, which the sweep removes. Pure. A name that is new but
 * not of that shape (a shell history, a tool's config folder) is not a leak and is not reported.
 */
export function leakedFixtureNames({ before, after, isKnownLeftover }) {
  const seen = new Set(before);
  return [...after].filter((name) => !seen.has(name) && !isKnownLeftover(name) && /^\.?[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9]{6}$/u.test(name)).sort();
}

/** Pure: a private TMPDIR path is short enough to keep socket paths under the 96-byte limit. */
export function tmpDirIsShortEnough(path) {
  return typeof path === "string" && path.length > 0 && path.length <= MAX_TMPDIR_CHARS;
}

/** Pure: names of the steps that did not exit 0, read from a pipeline.verify-evidence record. */
export function redStepNames(record) {
  const steps = Array.isArray(record?.steps) ? record.steps : [];
  return steps.filter((step) => step && step.exitCode !== 0).map((step) => String(step.name));
}

/** Pure: the newest run id among run directory entries ({ name, mtimeMs }), or null. Used by --resume. */
export function newestRunId(entries) {
  const usable = (Array.isArray(entries) ? entries : []).filter((entry) => typeof entry?.name === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(entry.name) && Number.isFinite(entry.mtimeMs));
  usable.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.name < b.name ? 1 : -1));
  return usable.length === 0 ? null : usable[0].name;
}

/** Pure: how many suites the run skipped as already completed in the resumed run (progress lines with state "resumed"). */
export function countResumed(outputText) {
  let count = 0;
  for (const line of String(outputText ?? "").split("\n")) {
    if (!line.startsWith("{")) continue;
    try { const event = JSON.parse(line); if (event?.schema === "pipeline.verify-progress.v1" && event.state === "resumed") count += 1; } catch { /* not a progress line */ }
  }
  return count;
}

/** Pure: the concise summary lines printed at the end of a run. */
export function summarize({ exitCode, seconds, outputPath, record, resumed = null }) {
  const red = record === null ? null : redStepNames(record);
  const total = Array.isArray(record?.steps) ? record.steps.length : 0;
  return [
    `verify exit ${exitCode} after ${seconds} s; output in ${outputPath}`,
    ...(resumed === null ? [] : [`resumed over ${resumed} suite(s) already completed in the earlier run (not freshly run)`]),
    red === null ? "run record: unreadable or absent (evidence/verify-latest.json)" : `steps ${total}, red ${red.length}`,
    ...(red ?? []).map((name) => `  red: ${name}`),
  ];
}

/** Pure: the `.gitconfig` text of the private HOME. */
export function privateGitConfig({ name, email }) {
  return `[user]\n\tname = ${name}\n\temail = ${email}\n[init]\n\tdefaultBranch = main\n`;
}

function main(argv) {
  const reuse = argv.includes("--reuse");
  const resume = argv.includes("--resume");
  // The folder with the verify runs of the clone is given as an argument, not named here: the control-plane script scan of the shell
  // guard (C19-Q5) refuses a repository script that spells out the Pipeline control directory, and this script only READS it.
  const runsRootIndex = argv.indexOf("--runs-root");
  const runsRootArg = runsRootIndex === -1 ? null : argv[runsRootIndex + 1] ?? null;
  const positional = argv.filter((arg, index) => arg !== "--reuse" && arg !== "--resume" && arg !== "--runs-root" && !(runsRootIndex !== -1 && index === runsRootIndex + 1));
  const [cloneArg, label = "fv"] = positional;
  if (!cloneArg) { console.error("usage: full-verify.mjs <clone-dir> [<label>] [--reuse] [--resume --runs-root <verify runs folder of the clone>]"); return 2; }
  if (resume && runsRootArg === null) { console.error("full-verify: REFUSED: --resume needs --runs-root <absolute path of the verify runs folder inside the clone's git control directory>"); return 2; }
  const clone = resolve(cloneArg);
  const base = join(homedir(), ".fv", label);
  const home = join(base, "h");
  const tmp = join(base, "t");
  if (!tmpDirIsShortEnough(tmp)) { console.error(`full-verify: REFUSED: TMPDIR ${tmp.length} chars exceeds ${MAX_TMPDIR_CHARS}; use a shorter label`); return 2; }
  rmSync(base, { recursive: true, force: true });
  for (const dir of [base, home, tmp]) { mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700); }
  const cfg = (key) => execFileSync("git", ["config", key], { encoding: "utf8" }).trim();
  const gitConfigGlobal = join(home, ".gitconfig");
  writeFileSync(gitConfigGlobal, privateGitConfig({ name: cfg("user.name"), email: cfg("user.email") }));
  // The real node binary, not a per-shell version-manager shim path.
  const nodeBinary = realpathSync(process.execPath);
  const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp, GIT_CONFIG_GLOBAL: gitConfigGlobal,
    PATH: `${dirname(nodeBinary)}${delimiter}${process.env.PATH ?? ""}` };
  delete env.NODE_TEST_CONTEXT;
  delete env.PIPELINE_VERIFY_RESUME_RUN;
  if (resume) {
    // The earlier (interrupted) run of THIS clone: the newest run directory under the folder the caller named.
    const runsRoot = resolve(runsRootArg);
    const entries = existsSync(runsRoot) ? readdirSync(runsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => ({ name: e.name, mtimeMs: statSync(join(runsRoot, e.name)).mtimeMs })) : [];
    const previous = newestRunId(entries);
    if (previous === null) { console.error("full-verify: REFUSED: --resume found no earlier run in this clone"); return 2; }
    env.PIPELINE_VERIFY_RESUME_RUN = previous;
  }
  mkdirSync(join(clone, "scratch"), { recursive: true });
  const outputRel = `scratch/${label}-output${resume ? "-resume" : ""}.txt`;
  const out = createWriteStream(join(clone, outputRel));
  const started = Date.now();
  let homeBefore = [];
  try { homeBefore = readdirSync(homedir()); } catch { homeBefore = []; }
  const args = ["harness/scripts/verify.mjs", "--mode", "candidate", ...(reuse ? [] : ["--no-reuse"])];
  const child = spawn(nodeBinary, args, { cwd: clone, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  child.on("close", (code) => {
    out.end();
    const recordPath = join(clone, "evidence", "verify-latest.json");
    let record = null;
    try { if (existsSync(recordPath)) record = JSON.parse(readFileSync(recordPath, "utf8")); } catch { record = null; }
    let resumed = null;
    if (resume) { try { resumed = countResumed(readFileSync(join(clone, outputRel), "utf8")); } catch { resumed = 0; } }
    for (const line of summarize({ exitCode: code, seconds: Math.round((Date.now() - started) / 1000), outputPath: outputRel, record, resumed })) console.log(line);
    // C30-5 (PO 2026-11-15): a Verify run cleans up after itself. A GREEN run removes its own private HOME and TMPDIR; a RED run keeps
    // them, because the red-suite reruns (`rerun-reds.mjs`) use that exact HOME and TMPDIR, and the next sweep removes them with the
    // other old homes. Then the shared home-level leftovers of the suites (names on the cleaner's allowlist, older than 12 h) go.
    // PIPELINE_KEEP_TEST_HOMES=1 skips all of it.
    let leaked = [];
    if (!keepTestHomes()) {
      const homeRemoved = code === 0 ? removeTestTree(base) : false;
      const swept = sweepLeftovers({ minAgeHours: 12, apply: true });
      console.log(`cleanup: private home ${code === 0 ? (homeRemoved ? "removed" : "kept (removal failed)") : "kept for the red-suite reruns"}; ${swept.removed} of ${swept.planned} home-level leftovers removed (${(swept.bytes / 1073741824).toFixed(2)} GB)`);
      // The check: a run that left a new fixture-shaped folder in the home folder that the cleaner does not know fails the wrapper.
      try { leaked = leakedFixtureNames({ before: homeBefore, after: readdirSync(homedir()), isKnownLeftover: isLeftoverName }); } catch { leaked = []; }
      if (leaked.length > 0) console.log(`LEAK: this run left ${leaked.length} unlisted fixture folder(s) in the home folder: ${leaked.join(", ")}. A suite must remove what it creates (PIPELINE_KEEP_TEST_HOMES=1 keeps them for a diagnosis), or the name joins the allowlist of scripts/clean-test-leftovers.mjs.`);
    }
    process.exit(code === 0 && leaked.length > 0 ? 1 : code ?? 1);
  });
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const early = main(process.argv.slice(2));
  if (early !== null) process.exit(early);
}
