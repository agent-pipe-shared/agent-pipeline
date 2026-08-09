#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Differential: does a message-only change to `guard-lifecycle-ready.mjs` alter
 * what it ADMITS?
 *
 * GRAMMARHINT-1 improved what the closed-grammar refusal *says* — it now names
 * the rejected element and offers `git commit -F` for the newline-in-`-m` case.
 * A message change to this guard must never become a behaviour change: this is
 * the file that stops an agent weakening the gate authorizing it, so "nothing is
 * newly admitted" is the acceptance criterion that outranks the feature.
 *
 * How it proves that without a worktree: the baseline copy is materialized from
 * `git show <ref>:<path>` into a private temp directory, NOT into the guard
 * hooks directory — an abnormal termination there would leave an unreviewed,
 * executable guard copy in the directory the guard family loads from. The guard
 * resolves its siblings through `import.meta.url`, so a copy outside that
 * directory would not resolve them; the materializer therefore rewrites every
 * relative specifier and every `import.meta.url` to the live guard's absolute
 * location. Resolution is byte-identical to what a sibling copy saw, and no
 * residue under `plugins/pipeline-core/hooks/` is possible in any exit path.
 * Both copies then answer the same corpus and only the (blocked, code) pair is
 * compared — the message text is expected to differ, which is the point.
 *
 * Usage:
 *   node harness/scripts/guard-grammar-differential.mjs --base <git-ref> [--out <path>]
 *
 * `--base` is REQUIRED and must name a revision whose guard blob differs from
 * the working-tree guard. A guard compared against itself always reports
 * `identical-classification`, which proves nothing; that invocation is refused
 * rather than answered.
 *
 * Exit 0 = every command classified identically. Exit 1 = at least one changed,
 * and the offending shapes are listed in the output file and on stderr.
 * Exit 2 = the invocation could prove nothing; see the typed refusal on stderr.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOKS = join(REPO_ROOT, "plugins", "pipeline-core", "hooks");
const GUARD_REL = "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs";
const LIVE_GUARD = join(REPO_ROOT, GUARD_REL);
const LIVE_GUARD_URL = pathToFileURL(LIVE_GUARD).href;

/**
 * The corpus. Every shape the closed grammar has an opinion about, in both
 * directions -- admitted simple commands, the bounded read pipelines, the
 * operator/redirect refusals, and the newline case this change is about. A
 * differential over refusals alone would miss the failure that matters most
 * (something newly ADMITTED), so the admitted shapes are the larger half.
 */
const CORPUS = [
  ["git status --short"],
  ["git log --oneline -5"],
  ["git rev-parse HEAD"],
  ["node", "--version"],
  ["rg -n 'needle' file.txt"],
  ["rg -n 'needle' file.txt | head -20"],
  ["rg -n 'a' x | rg -n 'b'"],
  ["ls -1 docs"],
  ["cat README.md"],
  ["sha256sum a.txt b.txt"],
  ["git diff --stat"],
  ["git commit -m 'one line'"],
  ["git commit -m 'line one\n\nline two'"],
  ["git commit -m 'first' -m 'second'"],
  ["git commit -F msg.txt -- a.md"],
  ["git add -- a.md"],
  ["echo hi > out.txt"],
  ["cat a.txt 2>&1"],
  ["ls | tee out.txt"],
  ["git status && git log"],
  ["git status ; git log"],
  ["git status \\\n --short"],
  ["node script.mjs 2>/dev/null"],
  ["node script.mjs 2>NUL"],
  ["git push origin main"],
  ["rm -rf docs"],
  ["node -e 'require(\"fs\").writeFileSync(\"x\",\"y\")'"],
  ["git commit -m 'trailing newline\n'"],
  ["git commit --message 'line one\nline two'"],
  ["git tag -a v1 -m 'a\nb'"],
];

function readGuardAt(ref) {
  const shown = spawnSync("git", ["-C", REPO_ROOT, "show", `${ref}:${GUARD_REL}`], {
    encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024,
  });
  if (shown.status !== 0) {
    throw new Error(`could not read ${GUARD_REL} at ${ref}: ${(shown.stderr ?? "").trim()}`);
  }
  return shown.stdout;
}

/**
 * Rebind a guard copy to the live guard's location so it may live anywhere.
 * Three constructs decide where the guard looks for its siblings: static
 * relative specifiers, `new URL(<rel>, import.meta.url)` (every sibling script
 * path), and `fileURLToPath(import.meta.url)` (PLUGIN_ROOT). All three are
 * pointed at the live absolute location -- exactly what a copy placed next to
 * the live guard resolved to, so nothing the differential measures changes.
 *
 * The bare `import.meta.url` handed to `isDirectInvocation()` is deliberately
 * NOT rewritten: that one asks "was I executed directly?", and rebinding it to
 * a foreign path makes the copy answer no and exit silently -- which shows up
 * as a baseline that admits every shape. Anything else that reaches for
 * `import.meta.url` is an unknown resolution path, so it fails loudly here
 * rather than producing a quietly wrong differential.
 */
function rebindToLiveLocation(source) {
  if (/\b(?:import|require)\(\s*["'`]\.{1,2}\//u.test(source)) {
    throw new Error("baseline guard uses a dynamic relative import; rebinding cannot be proven safe");
  }
  const liveUrlLiteral = JSON.stringify(LIVE_GUARD_URL);
  const rebound = source
    .replace(/(new URL\(\s*(?:"[^"]*"|'[^']*')\s*,\s*)import\.meta\.url/gu, `$1${liveUrlLiteral}`)
    .replace(/fileURLToPath\(\s*import\.meta\.url\s*\)/gu, `fileURLToPath(${liveUrlLiteral})`)
    .replace(/(\bfrom\s*")(\.{1,2}\/[^"]*)(")/gu,
      (_match, head, spec, tail) => `${head}${pathToFileURL(resolve(HOOKS, spec)).href}${tail}`);
  const leftover = rebound.replace(/isDirectInvocation\(\s*import\.meta\.url\s*\)/gu, "");
  if (leftover.includes("import.meta.url")) {
    throw new Error("baseline guard uses import.meta.url in an unrecognized position; rebinding cannot be proven safe");
  }
  return rebound;
}

/** Materialize the baseline OUTSIDE the hooks directory; residue there is impossible. */
function materializeBaseline(source, dir) {
  const target = join(dir, "guard-lifecycle-ready.baseline-differential.mjs");
  writeFileSync(target, rebindToLiveLocation(source), "utf8");
  return target;
}

function refuse(code, message) {
  process.stderr.write(`${code}: ${message}\n`);
  process.exit(2);
}

/** Ask one guard copy about one command. Only (blocked, code) is compared. */
function ask(guardPath, root, command) {
  const result = spawnSync(process.execPath, [guardPath, "--runner", "claude"], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  const stderr = result.stderr ?? "";
  const code = /\b(GUARD-[A-Z0-9-]+|HGO-[A-Z0-9-]+)\b/u.exec(stderr)?.[1] ?? null;
  return { blocked: result.status !== 0, code };
}

function governedRoot() {
  const base = mkdtempSync(join(tmpdir(), "grammar-diff-"));
  writeFileSync(join(base, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  writeFileSync(join(base, "README.md"), "# fixture\n");
  return base;
}

const argv = process.argv.slice(2);
const baseRef = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : null;
const outPath = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : join(REPO_ROOT, "evidence", "grammarhint-1-differential.json");

// A base is required, and it must actually differ from the working-tree guard.
// Both refusals exist for one reason: a differential of the guard against itself
// reports `identical-classification` no matter what the guard does, and a green
// verdict that cannot go red is worse than no verdict at all.
if (baseRef === null || baseRef === undefined || baseRef.startsWith("--")) {
  refuse("DIFFERENTIAL-BASE-MISSING",
    "--base <git-ref> is required; there is no default. A default base of HEAD compares the "
    + "working-tree guard against itself, which reports identical-classification unconditionally.");
}
const baselineSource = readGuardAt(baseRef);
if (baselineSource === readFileSync(LIVE_GUARD, "utf8")) {
  refuse("DIFFERENTIAL-BASE-IDENTICAL",
    `${GUARD_REL} at ${baseRef} is byte-identical to the working tree, so this run would compare the `
    + "guard against itself and prove nothing. Name the revision from BEFORE the change under review.");
}

let root = null;
let baselineDir = null;
let report;
try {
  baselineDir = mkdtempSync(join(tmpdir(), "grammar-diff-baseline-"));
  const BASELINE_GUARD = materializeBaseline(baselineSource, baselineDir);
  root = governedRoot();
  const rows = CORPUS.map(([command]) => {
    const before = ask(BASELINE_GUARD, root, command);
    const after = ask(LIVE_GUARD, root, command);
    return {
      // The command is a shape, not a secret, and carries no absolute path by
      // construction -- the corpus above is all repo-relative.
      command,
      before,
      after,
      changed: before.blocked !== after.blocked || before.code !== after.code,
    };
  });
  const changed = rows.filter((row) => row.changed);
  report = {
    schema: "pipeline.guard-grammar-differential.v1",
    baseRef,
    guard: GUARD_REL,
    compared: rows.length,
    admittedBefore: rows.filter((row) => !row.before.blocked).length,
    admittedAfter: rows.filter((row) => !row.after.blocked).length,
    changed: changed.length,
    changedRows: changed,
    verdict: changed.length === 0 ? "identical-classification" : "classification-changed",
  };
} finally {
  if (baselineDir) rmSync(baselineDir, { recursive: true, force: true });
  if (root) rmSync(root, { recursive: true, force: true });
}

writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${report.compared} shapes compared against ${baseRef}; admitted ${report.admittedBefore} -> ${report.admittedAfter}; changed ${report.changed}\n`);
process.stdout.write(`verdict: ${report.verdict}\nwritten: ${relative(REPO_ROOT, outPath).split("\\").join("/")}\n`);
if (report.changed > 0) {
  for (const row of report.changedRows) {
    process.stderr.write(`CHANGED ${JSON.stringify(row.command)}: ${JSON.stringify(row.before)} -> ${JSON.stringify(row.after)}\n`);
  }
  process.exitCode = 1;
}
