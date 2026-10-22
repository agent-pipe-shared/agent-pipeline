// SPDX-License-Identifier: SUL-1.0
// Purpose: replay the commits <base>..<tip> into the CURRENT checkout; a file whose version here differs from the commit's parent is 3-way merged (git merge-file; parent = base, here = ours, commit = theirs) and refused only on a conflict.
// Usage:   node scripts/import-held.mjs <base> <tip> [--skip <sha>...] [--dry] [--exclude=<file>] [--theirs=<file>]
//          (run inside the checkout that receives the commits; the commits must already be fetched there). Normally driven by scripts/rehearse-held.mjs.
// Inputs:  the commit range; git identity of the receiving checkout. --dry replays into a temporary directory only and reports.
// Output:  one line per commit ("imported <sha> <subject>", "already present", "dry ok"); exit 2 on a refused file.
// Data:    writes the files of each commit into the working tree, commits them (message from scratch/import-msg.txt, Co-Authored-By and Claude-Session lines dropped). NOT read-only without --dry.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const theirsFiles = args.filter((a) => a.startsWith("--theirs=")).map((a) => a.slice(9));
const excludeFiles = args.filter((a) => a.startsWith("--exclude=")).map((a) => a.slice(10));
const skipAt = args.indexOf("--skip");
const skip = skipAt >= 0 ? args.slice(skipAt + 1).filter((a) => !a.startsWith("--")) : [];
const [base, tip] = args.filter((a) => !a.startsWith("--") && !skip.includes(a));
if (!base || !tip) { console.error("usage: import-held.mjs <base> <tip> [--skip <sha>...] [--dry] [--exclude=<file>] [--theirs=<file>]"); process.exit(2); }
const git = (...a) => execFileSync("git", a, { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
const text = (...a) => git(...a).toString("utf8");
const shas = text("rev-list", "--reverse", `${base}..${tip}`).split("\n").filter(Boolean).filter((s) => !skip.some((k) => s.startsWith(k)));
const scratchDir = dry ? mkdtempSync(join(tmpdir(), "import-held-")) : null;
for (const sha of shas) {
  const changes = text("diff-tree", "--no-commit-id", "--name-status", "-r", "--no-renames", sha).split("\n").filter(Boolean).map((l) => l.split("\t")).filter(([, f]) => !excludeFiles.includes(f));
  const plan = [];
  for (const [status, file] of changes) {
    if (theirsFiles.includes(file) && status !== "D") { plan.push({ file, bytes: git("show", `${sha}:${file}`) }); continue; }
    const mainBytes = existsSync(file) ? readFileSync(file) : null;
    const parent = status === "A" ? null : git("show", `${sha}^:${file}`);
    const theirs = status === "D" ? null : git("show", `${sha}:${file}`);
    if (status === "D") { if (mainBytes === null || (parent && mainBytes.equals(parent))) { plan.push({ file, remove: true }); continue; } console.error(`REFUSED ${sha.slice(0, 9)} ${file}: deleted by the commit but changed in main`); process.exit(2); }
    if (parent === null ? mainBytes === null : (mainBytes !== null && mainBytes.equals(parent))) { plan.push({ file, bytes: theirs }); continue; }
    if (parent === null || mainBytes === null) { console.error(`REFUSED ${sha.slice(0, 9)} ${file}: main differs and no merge base`); process.exit(2); }
    const dir = mkdtempSync(join(tmpdir(), "merge-"));
    writeFileSync(join(dir, "ours"), mainBytes); writeFileSync(join(dir, "base"), parent); writeFileSync(join(dir, "theirs"), theirs);
    const r = spawnSync("git", ["merge-file", "-p", join(dir, "ours"), join(dir, "base"), join(dir, "theirs")], { maxBuffer: 256 * 1024 * 1024 });
    rmSync(dir, { recursive: true, force: true });
    if (r.status !== 0) { console.error(`REFUSED ${sha.slice(0, 9)} ${file}: 3-way merge conflict (${r.status})`); process.exit(2); }
    plan.push({ file, bytes: r.stdout, merged: true });
  }
  if (dry) { console.log(`dry ok ${sha.slice(0, 9)} (${plan.length} files${plan.some((p) => p.merged) ? ", merged: " + plan.filter((p) => p.merged).map((p) => p.file).join(",") : ""})`); continue; }
  for (const p of plan) {
    if (p.remove) { if (existsSync(p.file)) rmSync(p.file); continue; }
    mkdirSync(dirname(p.file), { recursive: true });
    writeFileSync(p.file, p.bytes);
  }
  const files = plan.map((p) => p.file);
  git("add", "--", ...files);
  if (spawnSync("git", ["diff", "--cached", "--quiet", "--", ...files]).status === 0) { console.log(`already present ${sha.slice(0, 9)}`); continue; }
  const message = text("log", "-1", "--format=%B", sha).split("\n").filter((l) => !/^(Co-Authored-By|Claude-Session):/iu.test(l)).join("\n").replace(/\n{3,}/gu, "\n\n").trimEnd() + "\n";
  mkdirSync("scratch", { recursive: true });
  writeFileSync("scratch/import-msg.txt", message);
  git("commit", "-q", "-F", "scratch/import-msg.txt", "--", ...files);
  console.log(`imported ${sha.slice(0, 9)} ${message.split("\n")[0]}`);
}
void scratchDir;
