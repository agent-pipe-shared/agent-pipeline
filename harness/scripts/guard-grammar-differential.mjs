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
 * `git show <ref>:<path>` into a SIBLING of the live guard, so its relative
 * imports resolve identically, and removed again in every exit path. Both copies
 * then answer the same corpus and only the (blocked, code) pair is compared —
 * the message text is expected to differ, which is the point.
 *
 * Usage:
 *   node harness/scripts/guard-grammar-differential.mjs [--base <git-ref>] [--out <path>]
 *
 * Exit 0 = every command classified identically. Exit 1 = at least one changed,
 * and the offending shapes are listed in the output file and on stderr.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOKS = join(REPO_ROOT, "plugins", "pipeline-core", "hooks");
const GUARD_REL = "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs";
const LIVE_GUARD = join(REPO_ROOT, GUARD_REL);
const BASELINE_GUARD = join(HOOKS, "guard-lifecycle-ready.baseline-differential.mjs");

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

function materializeBaseline(ref) {
  const shown = spawnSync("git", ["-C", REPO_ROOT, "show", `${ref}:${GUARD_REL}`], {
    encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024,
  });
  if (shown.status !== 0) {
    throw new Error(`could not read ${GUARD_REL} at ${ref}: ${(shown.stderr ?? "").trim()}`);
  }
  writeFileSync(BASELINE_GUARD, shown.stdout, "utf8");
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
const baseRef = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : "HEAD";
const outPath = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : join(REPO_ROOT, "evidence", "grammarhint-1-differential.json");

let root = null;
let report;
try {
  materializeBaseline(baseRef);
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
  rmSync(BASELINE_GUARD, { force: true });
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
