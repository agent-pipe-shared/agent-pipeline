// SPDX-License-Identifier: SUL-1.0
// Read-only scratch-custody reporting. This module never writes, stages, or
// removes files. It emits paths, hashes and typed statuses only; artifact bytes
// and host-absolute paths never enter the report.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export const SCRATCH_CUSTODY_SCHEMA = "pipeline.scratch-custody.v1";
export const SCRATCH_CUSTODY_REPORT_SCHEMA = "pipeline.scratch-custody-report.v1";
export const MAX_CUSTODY_BYTES = 8 * 1024 * 1024;
const MAX_MARKDOWN_PATHS = 500;
const MAX_CUSTODY_ENTRIES = 1000;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const MANIFEST_PATH = "project/scratch-custody.v1.json";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBytes(root, spec) {
  try {
    const value = execFileSync("git", ["show", spec], {
      cwd: root, encoding: "buffer", stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000, maxBuffer: MAX_CUSTODY_BYTES + 1, windowsHide: true,
    });
    return value.length <= MAX_CUSTODY_BYTES ? value : null;
  } catch {
    return null;
  }
}

function gitMode(root, path, view) {
  if (typeof path !== "string" || !SAFE_PATH.test(path)) return null;
  try {
    const args = view === ":"
      ? ["ls-files", "--stage", "-z", "--", path]
      : ["ls-tree", "-z", view, "--", path];
    const output = execFileSync("git", args, {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000, maxBuffer: 16 * 1024, windowsHide: true,
    });
    // -z gives an unquoted path and a terminal NUL. One exact stage-zero
    // index entry is required: conflicts, aliases and extra records cannot
    // supply a regular-file mode for the requested path.
    const records = output.split("\0");
    if (records.length !== 2 || records[1] !== "" || records[0] === "") return null;
    const record = records[0];
    const match = view === ":"
      ? /^(100644|100755) ([0-9a-f]{40}|[0-9a-f]{64}) 0\t([^\0\t\r\n]+)$/u.exec(record)
      : /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})\t([^\0\t\r\n]+)$/u.exec(record);
    // Require the entire canonical record, including its exact path. Null
    // OIDs, nonregular modes and unresolved stages are held.
    if (!match || match[0] !== record || match[3] !== path || /^0+$/u.test(match[2])) return null;
    return match[1];
  } catch { return null; }
}

function safeRepoFile(root, rel) {
  if (typeof rel !== "string" || !SAFE_PATH.test(rel)) return { status: "invalid-path" };
  const absolute = resolve(root, rel);
  const fromRoot = relative(root, absolute);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || fromRoot.startsWith(sep)) {
    return { status: "invalid-path" };
  }
  let cursor = root;
  try {
    for (const part of rel.split("/")) {
      cursor = join(cursor, part);
      const info = lstatSync(cursor);
      if (info.isSymbolicLink()) return { status: "symlink" };
    }
    const info = lstatSync(absolute);
    if (!info.isFile()) return { status: "not-regular" };
    if (info.nlink !== 1) return { status: "multiply-linked" };
    if (info.size > MAX_CUSTODY_BYTES) return { status: "over-limit" };
    const bytes = readFileSync(absolute);
    return { status: "readable", bytes, sha256: digest(bytes), mode: (info.mode & 0o111) !== 0 ? "100755" : "100644" };
  } catch (error) {
    return { status: error?.code === "ENOENT" ? "missing" : "unreadable" };
  }
}

function listMarkdown(root) {
  const found = [];
  const base = join(root, "scratch");
  let stat;
  try { stat = lstatSync(base); } catch { return found; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return found;
  try {
    const physicalRoot = realpathSync(root);
    const rel = relative(physicalRoot, realpathSync(base));
    if (rel !== "scratch" && !rel.startsWith(`scratch${sep}`)) return found;
  } catch { return found; }
  const walk = (directory, prefix) => {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found.length > MAX_MARKDOWN_PATHS) return;
      if (entry.isSymbolicLink()) continue;
      const child = join(directory, entry.name);
      const rel = `${prefix}/${entry.name}`;
      let info;
      try { info = lstatSync(child); } catch { continue; }
      if (info.isDirectory()) walk(child, rel);
      else if (info.isFile() && /\.md$/iu.test(entry.name) && found.length <= MAX_MARKDOWN_PATHS) found.push(rel);
    }
  };
  walk(base, "scratch");
  return found.sort();
}

function readManifest(root, view) {
  if (view === "worktree") {
    try {
      execFileSync("git", ["ls-files", "--error-unmatch", "--", MANIFEST_PATH], {
        cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000, maxBuffer: 16 * 1024, windowsHide: true,
      });
    } catch { return { status: "manifest-untracked", entries: [] }; }
  }
  const bytes = view === "worktree" ? safeRepoFile(root, MANIFEST_PATH).bytes
    : gitBytes(root, view === ":" ? `:${MANIFEST_PATH}` : `${view}:${MANIFEST_PATH}`);
  if (!bytes) return { status: "manifest-unavailable", entries: [] };
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { return { status: "manifest-malformed", entries: [] }; }
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(",") !== "entries,schema"
    || value.schema !== SCRATCH_CUSTODY_SCHEMA || !Array.isArray(value.entries)) {
    return { status: "manifest-malformed", entries: [] };
  }
  if (value.entries.length > MAX_CUSTODY_ENTRIES) return { status: "manifest-over-entry-limit", entries: [] };
  const seen = new Set();
  for (const entry of value.entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join(",") !== "counterpartPath,disposition,path,reason,sha256"
      || typeof entry.path !== "string" || !entry.path.startsWith("scratch/")
      || !SAFE_PATH.test(entry.path) || !SHA256.test(entry.sha256)
      || (entry.disposition !== "durable" && entry.disposition !== "not-durable")
      || (entry.disposition === "durable" && (typeof entry.counterpartPath !== "string"
        || !SAFE_PATH.test(entry.counterpartPath) || entry.counterpartPath.startsWith("scratch/") || entry.reason !== null))
      || (entry.disposition === "not-durable" && (entry.counterpartPath !== null
        || typeof entry.reason !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(entry.reason)))) {
      return { status: "manifest-malformed", entries: [] };
    }
    const key = entry.path.normalize("NFC").toLowerCase();
    if (seen.has(key)) return { status: "manifest-duplicate", entries: [] };
    seen.add(key);
  }
  return { status: "ok", entries: value.entries };
}

function observedBytes(root, path, view) {
  if (view === "worktree") return safeRepoFile(root, path);
  const bytes = gitBytes(root, view === ":" ? `:${path}` : `${view}:${path}`);
  const mode = gitMode(root, path, view);
  return bytes && mode ? { status: "readable", bytes, sha256: digest(bytes), mode } : { status: "missing-or-unreadable" };
}

function gitPathAbsent(root, path, view) {
  try {
    const args = view === ":" ? ["ls-files", "--stage", "-z", "--", path]
      : ["ls-tree", "-z", view, "--", path];
    const output = execFileSync("git", args, {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000, maxBuffer: 16 * 1024, windowsHide: true,
    });
    // An invalid mode, conflicted entry, unreadable view or transport failure
    // is not absence and cannot enable the physical-source fallback.
    return output === "";
  } catch { return false; }
}

function ignoredScratchSource(root, path) {
  try {
    execFileSync("git", ["check-ignore", "--quiet", "--", path], {
      cwd: root, stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000, maxBuffer: 16 * 1024, windowsHide: true,
    });
    return true;
  } catch { return false; }
}

function checkEntry(root, entry, view) {
  // Local scratch may deliberately remain ignored. The selected Git manifest
  // supplies the expected digest; durability comes from its regular public
  // counterpart in that SAME view, never from publishing the scratch source.
  // Preserve existing tracked-source historical views when they are present.
  let source = observedBytes(root, entry.path, view);
  if (view !== "worktree" && view !== ":" && source.status === "missing-or-unreadable"
    && gitPathAbsent(root, entry.path, view) && ignoredScratchSource(root, entry.path)
    && gitMode(root, MANIFEST_PATH, view) !== null) {
    source = safeRepoFile(root, entry.path);
  }
  if (source.status !== "readable") return { path: entry.path, disposition: entry.disposition, status: source.status };
  if (source.sha256 !== entry.sha256) return { path: entry.path, disposition: entry.disposition, status: "source-mismatch", sourceSha256: source.sha256, sourceMode: source.mode };
  if (entry.disposition === "not-durable") {
    return { path: entry.path, disposition: "not-durable", status: "not-durable", reason: entry.reason, sourceSha256: source.sha256, sourceMode: source.mode };
  }
  const counterpart = observedBytes(root, entry.counterpartPath, view);
  if (counterpart.status !== "readable") return { path: entry.path, disposition: "durable", counterpartPath: entry.counterpartPath, status: counterpart.status, sourceSha256: source.sha256, sourceMode: source.mode };
  if (counterpart.sha256 !== entry.sha256) return { path: entry.path, disposition: "durable", counterpartPath: entry.counterpartPath, status: "counterpart-mismatch", sourceSha256: source.sha256, counterpartSha256: counterpart.sha256, sourceMode: source.mode, counterpartMode: counterpart.mode };
  if (counterpart.mode !== source.mode) return { path: entry.path, disposition: "durable", counterpartPath: entry.counterpartPath, status: "counterpart-mode-mismatch", sourceSha256: source.sha256, counterpartSha256: counterpart.sha256, sourceMode: source.mode, counterpartMode: counterpart.mode };
  const status = view === "worktree" ? "scratch-only"
    : view === ":" ? "staged-only"
      : view === "HEAD" ? "durable" : "durable-for-push";
  return { path: entry.path, disposition: "durable", counterpartPath: entry.counterpartPath, status, sourceSha256: source.sha256, counterpartSha256: counterpart.sha256, sourceMode: source.mode, counterpartMode: counterpart.mode };
}

/** Bounded report over worktree, index, HEAD, and an optional exact push commit. */
export function reportScratchCustody({ root, pushCommit = null } = {}) {
  const canonicalRoot = resolve(root);
  const markdown = listMarkdown(canonicalRoot);
  const markdownTruncated = markdown.length > MAX_MARKDOWN_PATHS;
  const visibleMarkdown = markdown.slice(0, MAX_MARKDOWN_PATHS);
  const views = ["worktree", ":", "HEAD", ...(pushCommit ? [pushCommit] : [])];
  const viewNames = ["scratch-only", "staged", "HEAD", ...(pushCommit ? ["pushed"] : [])];
  const results = views.map((view, index) => {
    const manifest = readManifest(canonicalRoot, view);
    if (manifest.status !== "ok") return { view: viewNames[index], status: manifest.status, entries: [], unclassifiedMarkdown: visibleMarkdown };
    const paths = new Set(manifest.entries.map((entry) => entry.path.normalize("NFC").toLowerCase()));
    return {
      view: viewNames[index], status: "checked",
      entries: manifest.entries.map((entry) => checkEntry(canonicalRoot, entry, view)),
      unclassifiedMarkdown: visibleMarkdown.filter((path) => !paths.has(path.normalize("NFC").toLowerCase())),
    };
  });
  if (!pushCommit) results.push({ view: "pushed", status: "candidate-unavailable", entries: [], unclassifiedMarkdown: [] });
  const warnings = [];
  for (const result of results) {
    if (result.status !== "checked") warnings.push({ code: result.status, view: result.view });
    if (result.unclassifiedMarkdown.length) warnings.push({ code: "unclassified-markdown", view: result.view, paths: result.unclassifiedMarkdown });
    for (const entry of result.entries) {
      const durableForView = result.view === "HEAD" ? "durable" : result.view === "pushed" ? "durable-for-push" : null;
      if (entry.status !== durableForView) warnings.push({ code: `custody-${entry.status}`, view: result.view, path: entry.path });
    }
  }
  if (markdownTruncated) warnings.push({ code: "unclassified-markdown-scan-truncated", maximumPaths: MAX_MARKDOWN_PATHS });
  return { schema: SCRATCH_CUSTODY_REPORT_SCHEMA, mode: "report-only", warnings, views: results };
}
