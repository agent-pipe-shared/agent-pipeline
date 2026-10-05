// SPDX-License-Identifier: SUL-1.0
/**
 * windows-hide-scan.mjs -- static inventory of child-process spawn sites that a full Verify can
 * reach on native Windows, and the guard that fails when a spawn the windowsHide preload
 * (windows-hide-preload.mjs) cannot reach appears (WINVERIFY).
 *
 * What the preload covers: every Node process the Verify spawner starts gets the preload through
 * NODE_OPTIONS (and so does every Node grandchild whose `env` is inherited or hand-built -- the
 * preload's wrapper adds the entry to an explicit `env`), and the Verify ROOT process loads the
 * preload as a side effect of importing verify-journal.mjs. Inside any such process a spawn-family
 * call without `windowsHide` receives `windowsHide: true`.
 *
 * What it cannot cover, and this scan reports as findings: an explicit `windowsHide: false` (the
 * wrapper respects an explicit value), a `new ChildProcess(` / `process.binding(` / `internalBinding(`
 * call that bypasses the wrapped functions, `--allow-child-process` (the data: URL gate skips the
 * preload under the permission model), a spawner that is not node:child_process, and code that
 * deletes or rewrites NODE_OPTIONS on `process.env` itself.
 *
 * The scan is a line-and-parenthesis heuristic, not a parser: it is a guard against drift, and the
 * runtime tests in verify-journal.test.mjs pin the behaviour it assumes. Builtins only.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const SPAWN_NAMES = ["spawnSync", "spawn", "execFileSync", "execFile", "execSync", "exec", "fork"];
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "scratch", "evidence"]);
const SOURCE_EXTENSION = /\.(?:mjs|cjs|js)$/u;
const MEMBER_PREFIXES = "cp|childProcess|child_process|nodeChildProcess";

/** `{ file, rule }` pairs that are intentional: preload-test fixtures that spell the forbidden text on purpose. */
export const WINDOWS_HIDE_SCAN_ALLOWLIST = Object.freeze([
  Object.freeze({ file: "plugins/pipeline-core/lib/windows-hide-scan.mjs", rule: "opt-out", reason: "this scanner names the forbidden text in its own tables" }),
  Object.freeze({ file: "plugins/pipeline-core/lib/windows-hide-scan.mjs", rule: "allow-child-process", reason: "this scanner names the forbidden text in its own tables" }),
  Object.freeze({ file: "plugins/pipeline-core/scripts/verify-journal.test.mjs", rule: "opt-out", reason: "preload test fixtures state windowsHide: false on purpose" }),
  Object.freeze({ file: "plugins/pipeline-core/scripts/verify-journal.test.mjs", rule: "constructor", reason: "guard-test fixture" }),
  Object.freeze({ file: "plugins/pipeline-core/scripts/verify-journal.test.mjs", rule: "internal-binding", reason: "guard-test fixture" }),
  Object.freeze({ file: "plugins/pipeline-core/scripts/verify-journal.test.mjs", rule: "allow-child-process", reason: "guard-test fixture" }),
  Object.freeze({ file: "plugins/pipeline-core/scripts/verify-journal.test.mjs", rule: "foreign-spawner", reason: "guard-test fixture" }),
  Object.freeze({ file: "plugins/pipeline-core/scripts/verify-journal.test.mjs", rule: "node-options-mutation", reason: "guard-test fixture" }),
]);

function isCommentLine(line) {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

/** Spawn-family names this file may call: the builtin names plus `import { spawn as alias }` aliases. */
function spawnNamesFor(source) {
  const names = new Set(SPAWN_NAMES);
  for (const importBlock of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](?:node:)?child_process["']/gu)) {
    for (const specifier of importBlock[1].split(",")) {
      const alias = /^\s*(\w+)\s+as\s+(\w+)\s*$/u.exec(specifier);
      if (alias !== null && SPAWN_NAMES.includes(alias[1])) names.add(alias[2]);
    }
  }
  return [...names];
}

function balancedWindow(source, openIndex) {
  let depth = 0;
  const limit = Math.min(source.length, openIndex + 2500);
  for (let index = openIndex; index < limit; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, index + 1);
    }
  }
  return source.slice(openIndex, limit);
}

function insideString(textBeforeOnLine) {
  for (const quote of ['"', "'", "`"]) {
    let count = 0;
    for (let index = 0; index < textBeforeOnLine.length; index += 1) {
      if (textBeforeOnLine[index] === "\\") { index += 1; continue; }
      if (textBeforeOnLine[index] === quote) count += 1;
    }
    if (count % 2 === 1) return true;
  }
  return false;
}

/**
 * Scan one source text. Returns `{ sites, findings }`.
 * A site: `{ file, line, call, className, envEscape, nodeChild, inString }` where className is
 * `explicit-hide` (the call states windowsHide: true), `opt-out` (windowsHide: false -- NOT covered)
 * or `preload` (no statement: the preload wrapper supplies it). `envEscape` marks a call that
 * hand-builds the child's `env` without NODE_OPTIONS: before WINVERIFY a Node child started that
 * way ran without the preload.
 */
export function scanSource(source, file) {
  const sites = [];
  const findings = [];
  const lines = source.split("\n");
  const lineStarts = [];
  let offset = 0;
  for (const line of lines) { lineStarts.push(offset); offset += line.length + 1; }
  const lineOf = (index) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= index) low = mid; else high = mid - 1;
    }
    return low;
  };

  const pattern = (regex) => new RegExp(regex.source, regex.flags);
  const addFinding = (index, rule, text) => {
    const lineIndex = lineOf(index);
    if (isCommentLine(lines[lineIndex])) return;
    findings.push({ file, line: lineIndex + 1, rule, text: text.trim().slice(0, 120) });
  };
  for (const [rule, regex] of [
    ["opt-out", /windowsHide\s*:\s*false/gu],
    ["constructor", /\bnew\s+ChildProcess\s*\(/gu],
    ["internal-binding", /\b(?:process\.binding|internalBinding)\s*\(/gu],
    ["allow-child-process", /--allow-child-process/gu],
    ["foreign-spawner", /(?:from\s+|require\(\s*)["'](?:execa|cross-spawn|node-pty|shelljs|zx|child-process-promise)["']/gu],
    ["node-options-mutation", /\bdelete\s+process\.env\.NODE_OPTIONS|process\.env\.NODE_OPTIONS\s*=(?!=)/gu],
  ]) {
    for (const match of source.matchAll(pattern(regex))) addFinding(match.index, rule, lines[lineOf(match.index)]);
  }

  if (!/child_process/u.test(source)) return { sites, findings };
  const names = spawnNamesFor(source);
  const call = new RegExp(`(?<![\\w$.])(?:(?:${MEMBER_PREFIXES})\\.)?(${names.join("|")})\\s*\\(`, "gu");
  const promisified = /promisify\(\s*(?:\w+\.)?(execFile|exec)\s*\)/gu;
  const candidates = [
    ...[...source.matchAll(call)].map((match) => ({ match, openIndex: match.index + match[0].length - 1 })),
    ...[...source.matchAll(promisified)].map((match) => ({ match, openIndex: match.index })),
  ].sort((a, b) => a.match.index - b.match.index);

  for (const { match, openIndex } of candidates) {
    const lineIndex = lineOf(match.index);
    const line = lines[lineIndex];
    if (isCommentLine(line)) continue;
    const before = line.slice(0, match.index - lineStarts[lineIndex]);
    if (/\b(?:function|async)\s+$/u.test(before) || /^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*\{\s*$/u.test(line) && before.trim() === "") continue;
    const window = match[0].startsWith("promisify") ? match[0] : balancedWindow(source, openIndex);
    let className = "preload";
    if (/windowsHide\s*:\s*true/u.test(window)) className = "explicit-hide";
    if (/windowsHide\s*:\s*false/u.test(window)) className = "opt-out";
    const envEscape = /\benv\s*(?::|,|\})/u.test(window) && !/NODE_OPTIONS/u.test(window);
    // The child is (probably) a Node program: it can only run the preload if NODE_OPTIONS reaches it.
    const nodeChild = /process\.execPath|\bexecPath\b|\bnode(?:Path|Bin|Exe)\b|["'`]node(?:\.exe)?["'`]/u.test(window);
    sites.push({ file, line: lineIndex + 1, call: match[1], className, envEscape, nodeChild, inString: insideString(before) });
  }
  return { sites, findings };
}

function listSourceFiles(directory, accumulator = []) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return accumulator; }
  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, accumulator);
    else if (SOURCE_EXTENSION.test(entry.name)) accumulator.push(full);
  }
  return accumulator;
}

const toPosix = (path) => path.split(sep).join("/");

/** Scan every source file under `roots` (repo-relative). Allowlisted `{file, rule}` findings are dropped. */
export function scanTree({ repoRoot, roots = ["harness", "plugins"], allowlist = WINDOWS_HIDE_SCAN_ALLOWLIST } = {}) {
  const sites = [];
  const findings = [];
  const files = [];
  for (const root of roots) {
    for (const absolute of listSourceFiles(join(repoRoot, root)).sort()) {
      const file = toPosix(relative(repoRoot, absolute));
      files.push(file);
      const scanned = scanSource(readFileSync(absolute, "utf8"), file);
      sites.push(...scanned.sites);
      for (const finding of scanned.findings) {
        if (!allowlist.some((entry) => entry.file === finding.file && entry.rule === finding.rule)) findings.push(finding);
      }
    }
  }
  return { files, sites, findings };
}

/** Absolute paths statically reachable from `entry` through relative `import`/`export ... from` specifiers. */
export function staticImportGraph(entry, readSource = (path) => readFileSync(path, "utf8")) {
  const seen = new Set();
  const pending = [resolve(entry)];
  while (pending.length > 0) {
    const current = pending.pop();
    if (seen.has(current) || !existsSync(current)) continue;
    seen.add(current);
    let source;
    try { source = readSource(current); } catch { continue; }
    for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^"'`;]*?["'](\.{1,2}\/[^"']+)["']|(?:^|\n)\s*import\s*["'](\.{1,2}\/[^"']+)["']/gu)) {
      pending.push(resolve(dirname(current), match[1] ?? match[2]));
    }
  }
  return seen;
}

/** Counts by class for the report: `{ total, byClass, envEscape, inString, findings }`. */
export function summarizeScan({ sites, findings }) {
  const byClass = { "explicit-hide": 0, preload: 0, "opt-out": 0 };
  for (const site of sites) byClass[site.className] += 1;
  return {
    total: sites.length,
    byClass,
    envEscape: sites.filter((site) => site.envEscape).length,
    envEscapeNodeChild: sites.filter((site) => site.envEscape && site.nodeChild).length,
    inString: sites.filter((site) => site.inString).length,
    findings: findings.length,
  };
}

/** Markdown table rows (one per site) for the inventory document. */
export function renderSiteRows(sites) {
  const rows = ["| Site | Call | Class | Note |", "|---|---|---|---|"];
  for (const site of sites) {
    const notes = [];
    if (site.envEscape) notes.push(`hand-built \`env\`${site.nodeChild ? ", Node child" : ""} (needs the wrapper's NODE_OPTIONS injection)`);
    if (site.inString) notes.push("inside a string: spawn in generated child source");
    rows.push(`| \`${site.file}:${site.line}\` | \`${site.call}\` | ${site.className} | ${notes.join("; ")} |`);
  }
  return rows;
}

// Read-only CLI. `node plugins/pipeline-core/lib/windows-hide-scan.mjs` prints the summary (exit 1 when
// there are findings); `--sites` prints the full per-site Markdown table (redirect it in your shell to keep it).
if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const scan = scanTree({ repoRoot: resolve(import.meta.dirname, "..", "..", "..") });
  if (process.argv.includes("--sites")) console.log(renderSiteRows(scan.sites).join("\n"));
  else {
    const testFile = /\.test\.mjs$/u;
    console.log(JSON.stringify({
      files: scan.files.length,
      ...summarizeScan(scan),
      nonTest: summarizeScan({ sites: scan.sites.filter((site) => !testFile.test(site.file)), findings: [] }),
      keyFiles: scan.sites.filter((site) => ["harness/scripts/verify.mjs", "plugins/pipeline-core/scripts/verify-journal.mjs", "plugins/pipeline-core/scripts/verify-evidence-producer.mjs"].includes(site.file)).map((site) => `${site.file}:${site.line} ${site.className}`),
    }, null, 1));
  }
  process.exitCode = scan.findings.length === 0 ? 0 : 1;
}
