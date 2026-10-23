// Purpose: run the Full Verify (candidate mode, no receipt reuse) in a clone with a private HOME and a SHORT private TMPDIR,
//          then print a concise summary of the run record. It exists because three environment effects of a private HOME
//          turned green steps red in the first dev-build Full Verify: (1) no `init.defaultBranch=main` in the private HOME,
//          (2) a long TMPDIR pushing a socket path over the 96-byte limit (wsl-ipc-compatibility-tests), (3) node resolved
//          through a per-shell fnm path that is not stable for child processes.
// Usage:   node scripts/full-verify.mjs <clone-dir> [<label>] [--reuse]
//          (run from any checkout; <clone-dir> must be a clean clone whose committed HEAD is the candidate; label defaults to "fv")
// Inputs:  git identity copied from `git config user.name/user.email` of the current directory; `--reuse` drops --no-reuse.
// Output:  verify's stdout+stderr in <clone-dir>/scratch/<label>-output.txt; on stdout the exit code, the duration, the output
//          path and the red step names read from <clone-dir>/evidence/verify-latest.json (the run record). Exit code = verify's.
// Data:    HOME and TMPDIR under <home>/.fv/<label>/ (recreated each run, outside every repository). The TMPDIR path must stay
//          under 30 characters; a longer one is refused with exit 2 rather than silently breaking socket-path tests.
// Read-only toward the source: it writes only the output file, the run record verify itself writes in the clone, and the temp dirs.
import { spawn, execFileSync } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_TMPDIR_CHARS = 29;

/** Pure: a private TMPDIR path is short enough to keep socket paths under the 96-byte limit. */
export function tmpDirIsShortEnough(path) {
  return typeof path === "string" && path.length > 0 && path.length <= MAX_TMPDIR_CHARS;
}

/** Pure: names of the steps that did not exit 0, read from a pipeline.verify-evidence record. */
export function redStepNames(record) {
  const steps = Array.isArray(record?.steps) ? record.steps : [];
  return steps.filter((step) => step && step.exitCode !== 0).map((step) => String(step.name));
}

/** Pure: the concise summary lines printed at the end of a run. */
export function summarize({ exitCode, seconds, outputPath, record }) {
  const red = record === null ? null : redStepNames(record);
  const total = Array.isArray(record?.steps) ? record.steps.length : 0;
  return [
    `verify exit ${exitCode} after ${seconds} s; output in ${outputPath}`,
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
  const [cloneArg, label = "fv"] = argv.filter((arg) => arg !== "--reuse");
  if (!cloneArg) { console.error("usage: full-verify.mjs <clone-dir> [<label>] [--reuse]"); return 2; }
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
  mkdirSync(join(clone, "scratch"), { recursive: true });
  const outputRel = `scratch/${label}-output.txt`;
  const out = createWriteStream(join(clone, outputRel));
  const started = Date.now();
  const args = ["harness/scripts/verify.mjs", "--mode", "candidate", ...(reuse ? [] : ["--no-reuse"])];
  const child = spawn(nodeBinary, args, { cwd: clone, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  child.on("close", (code) => {
    out.end();
    const recordPath = join(clone, "evidence", "verify-latest.json");
    let record = null;
    try { if (existsSync(recordPath)) record = JSON.parse(readFileSync(recordPath, "utf8")); } catch { record = null; }
    for (const line of summarize({ exitCode: code, seconds: Math.round((Date.now() - started) / 1000), outputPath: outputRel, record })) console.log(line);
    process.exit(code ?? 1);
  });
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const early = main(process.argv.slice(2));
  if (early !== null) process.exit(early);
}
