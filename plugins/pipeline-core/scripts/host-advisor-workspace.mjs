// SPDX-License-Identifier: SUL-1.0

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const digest = b => createHash("sha256").update(b).digest("hex");
const deepFreeze = v => { if (v && typeof v === "object") { Object.freeze(v); Object.values(v).forEach(deepFreeze); } return v; };
const oid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const rel = p => typeof p === "string" && p.length > 0 && !p.startsWith("/") && !p.includes("\\") && !p.split("/").some(x => !x || x === "." || x === "..");

function gitDefault(args, cwd) { return execFileSync("git", args, { cwd, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }); }
function text(buf) { const s = Buffer.from(buf).toString("utf8"); if (!Buffer.from(s, "utf8").equals(Buffer.from(buf))) throw new Error("invalid utf8"); return s; }
function snapshot(root, git) {
  const top = text(git(["rev-parse", "--show-toplevel"], root)).trim();
  if (fs.realpathSync(top) !== fs.realpathSync(root)) throw new Error("governed root mismatch");
  const commit = text(git(["rev-parse", "HEAD"], root)).trim();
  const tree = text(git(["rev-parse", "HEAD^{tree}"], root)).trim();
  if (!oid.test(commit) || !oid.test(tree)) throw new Error("invalid head");
  return { commit, tree };
}
function nul(buf) { return text(buf).split("\0").filter(Boolean); }
function stages(root, git) {
  const map = new Map();
  const raw = Buffer.from(git(["ls-files", "--stage", "-z"], root));
  for (const row of nul(raw)) {
    const m = /^(\d{6}) ([0-9a-f]{40,64}) (\d)\t(.+)$/u.exec(row);
    if (!m || !rel(m[4]) || !oid.test(m[2]) || map.has(m[4])) throw new Error("malformed stage row");
    map.set(m[4], { indexMode: m[1], indexOid: m[2] });
  }
  return map;
}
function observeEntry(root, p, index) {
  const absolute = path.resolve(root, p);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("escape");
  let st; try { st = fs.lstatSync(absolute); } catch (e) { if (e.code === "ENOENT") st = null; else throw e; }
  let worktreeKind = "missing", worktreeMode = null, contentSha256 = null;
  if (st?.isFile()) { worktreeKind = "regular"; worktreeMode = (st.mode & 0o111) ? "100755" : "100644"; contentSha256 = digest(fs.readFileSync(absolute)); }
  else if (st?.isSymbolicLink()) {
    worktreeKind = "symlink"; worktreeMode = "120000";
    const targetBytes = fs.readlinkSync(absolute, { encoding: "buffer" }); const target = targetBytes.toString("utf8"); if (!Buffer.from(target, "utf8").equals(targetBytes)) throw new Error("invalid symlink utf8"); const resolved = fs.realpathSync(path.dirname(absolute) + path.sep + target);
    if (!(resolved === root || resolved.startsWith(`${root}${path.sep}`))) throw new Error("symlink escape");
    contentSha256 = digest(targetBytes);
  } else if (st) throw new Error("unsupported worktree kind");
  return { path: p, indexMode: index?.indexMode ?? null, indexOid: index?.indexOid ?? null, worktreeKind, worktreeMode, contentSha256 };
}

export function observeHostAdvisorWorkspace(governedRoot, deps = {}) {
  const root = fs.realpathSync(path.resolve(governedRoot));
  const git = deps.git ?? gitDefault;
  const before = snapshot(root, git);
  const names = nul(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], root));
  if (new Set(names).size !== names.length || names.some(p => !rel(p))) throw new Error("invalid paths");
  const stage = stages(root, git);
  const paths = [...new Set([...names, ...stage.keys()])].sort((a,b) => Buffer.from(a).compare(Buffer.from(b)));
  const entries = paths.map(p => observeEntry(root, p, stage.get(p)));
  const after = snapshot(root, git);
  if (before.commit !== after.commit || before.tree !== after.tree) throw new Error("HEAD changed during observation");
  const manifest = { headCommit: before.commit, headTree: before.tree, entries };
  const workspaceSha256 = digest(Buffer.from(`pipeline.host-advisor-workspace.v1\0${canonicalJson(manifest)}`, "utf8"));
  return deepFreeze({ manifest, workspaceSha256 });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { const root = process.argv[2]; if (!root) throw new Error("governed root required"); process.stdout.write(JSON.stringify(observeHostAdvisorWorkspace(root)) + "\n"); }
  catch (e) { process.stderr.write(JSON.stringify({ error: "workspace-observation-failed" }) + "\n"); process.exitCode = 1; }
}
