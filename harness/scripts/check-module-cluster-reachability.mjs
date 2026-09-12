#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Runner-neutral, static module-cluster reachability audit.
 *
 * This complements (and deliberately does not replace) the narrower product-capability
 * entry-point check. It follows module load edges and the Node child-process idioms used
 * by this repository, then reports unreachable connected clusters instead of inflating one
 * missing entry point into one finding per implementation module.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SUBJECT_DIRS = ["plugins/pipeline-core/hooks", "plugins/pipeline-core/lib", "plugins/pipeline-core/scripts"];
const CHILD_CALLS = new Set(["spawn", "spawnSync", "execFile", "execFileSync", "fork"]);
const MAX_CLUSTERS = 64;
const MAX_PATHS_PER_CLUSTER = 24;
const MAX_EDGES_PER_CLUSTER = 48;
const MAX_REPORTED_ROOTS = 128;

function compare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function posix(path) {
  return path.split(sep).join("/");
}

function walk(root, start) {
  const absolute = join(root, start);
  if (!existsSync(absolute)) return [];
  const result = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) result.push(posix(relative(root, full)));
    }
  };
  visit(absolute);
  return result.sort(compare);
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

function decodeString(expression) {
  const match = /^\s*(["'`])([^\n]*?)\1\s*$/.exec(expression);
  if (!match || (match[1] === "`" && match[2].includes("${"))) return null;
  try {
    return JSON.parse(`"${match[2].replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  } catch {
    return match[2];
  }
}

function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escape = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function callBodies(source, bindings) {
  const calls = [];
  if (bindings.size === 0) return calls;
  const alternatives = [...bindings.keys()].sort((a, b) => b.length - a.length || compare(a, b)).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\w$.])(${alternatives.join("|")})\\s*\\(`, "g");
  for (const match of source.matchAll(pattern)) {
    const open = match.index + match[0].lastIndexOf("(");
    let depth = 1;
    let quote = null;
    let escape = false;
    for (let index = open + 1; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (escape) escape = false;
        else if (char === "\\") escape = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      if (depth === 0) {
        calls.push({ name: bindings.get(match[1]), args: splitTopLevel(source.slice(open + 1, index)) });
        break;
      }
    }
  }
  return calls;
}

function childProcessBindings(source) {
  const bindings = new Map();
  const addNamed = (list) => {
    for (const part of splitTopLevel(list)) {
      const match = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(part.trim());
      if (match && CHILD_CALLS.has(match[1])) bindings.set(match[2] ?? match[1], match[1]);
    }
  };
  for (const match of source.matchAll(/\bimport\s*{([^}]*)}\s*from\s*["']node:child_process["']/g)) addNamed(match[1]);
  for (const match of source.matchAll(/\bconst\s*{([^}]*)}\s*=\s*require\s*\(\s*["']node:child_process["']\s*\)/g)) {
    addNamed(match[1].replace(/\s*:\s*/g, " as "));
  }
  const namespaces = [];
  for (const match of source.matchAll(/\bimport\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*["']node:child_process["']/g)) namespaces.push(match[1]);
  for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*["']node:child_process["']\s*\)/g)) namespaces.push(match[1]);
  for (const namespace of namespaces) for (const operation of CHILD_CALLS) bindings.set(`${namespace}.${operation}`, operation);
  return bindings;
}

function localChildProcessWrappers(source, directBindings) {
  const wrappers = new Map();
  for (const match of source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g)) {
    const parameters = splitTopLevel(match[2]);
    if (parameters.length < 2) continue;
    const open = match.index + match[0].lastIndexOf("{");
    let depth = 1;
    let quote = null;
    let escape = false;
    for (let index = open + 1; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (escape) escape = false;
        else if (char === "\\") escape = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      if (depth !== 0) continue;
      const body = source.slice(open + 1, index);
      const delegated = callBodies(body, directBindings).find((call) => call.args[0] === parameters[0] && call.args[1] === parameters[1]);
      if (delegated) wrappers.set(match[1], delegated.name);
      break;
    }
  }
  return wrappers;
}

function constants(source) {
  const result = new Map();
  for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+(?:\([^;\n]*\))?)\s*;/g)) {
    result.set(match[1], match[2].trim());
  }
  return result;
}

function finiteLoopPathCandidates(source, importer) {
  const candidates = new Map();
  for (const loop of source.matchAll(/\bfor\s*\(\s*const\s+([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$]*)\s*\)/g)) {
    const declaration = new RegExp(`\\bconst\\s+${escapeRegExp(loop[2])}\\s*=([\\s\\S]*?);`).exec(source);
    if (!declaration) continue;
    const values = [...declaration[1].matchAll(/(["'])([^"'\n]+\.mjs)\1/g)].map((match) => match[2]);
    if (values.length === 0) continue;
    for (const binding of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*fileURLToPath\s*\(\s*new\s+URL\s*\(\s*`([^`$]*)\$\{([A-Za-z_$][\w$]*)\}([^`]*)`\s*,\s*import\.meta\.url\s*\)\s*\)\s*;/g)) {
      if (binding[3] !== loop[1]) continue;
      const resolved = values.map((value) => posix(normalize(join(dirname(importer), `${binding[2]}${value}${binding[4]}`))));
      candidates.set(binding[1], [...new Set(resolved)].sort(compare));
    }
  }
  return candidates;
}

function evaluatePath(expression, importer, declarations, seen = new Set()) {
  if (!expression) return null;
  const literal = decodeString(expression);
  if (literal !== null) return literal;
  const value = expression.trim().replace(/^new\s+/, "");
  if (/^[A-Za-z_$][\w$]*$/.test(value)) {
    if (value === "__dirname") return dirname(importer);
    if (seen.has(value) || !declarations.has(value)) return null;
    seen.add(value);
    return evaluatePath(declarations.get(value), importer, declarations, seen);
  }
  if (/^fileURLToPath\s*\(\s*import\.meta\.url\s*\)$/.test(value)) return importer;
  if (/^dirname\s*\(\s*fileURLToPath\s*\(\s*import\.meta\.url\s*\)\s*\)$/.test(value)) return dirname(importer);
  const wrapped = /^(?:fileURLToPath\s*\(\s*)?(?:new\s+)?URL\s*\((.*)\)\s*\)?$/.exec(value);
  if (wrapped) {
    const args = splitTopLevel(wrapped[1]);
    const fragment = evaluatePath(args[0], importer, declarations, new Set(seen));
    if (fragment === null || !/import\.meta\.url/.test(args[1] ?? "")) return null;
    return posix(normalize(join(dirname(importer), fragment)));
  }
  const joined = /^(?:join|resolve|path\.join|path\.resolve)\s*\((.*)\)$/.exec(value);
  if (joined) {
    const parts = splitTopLevel(joined[1]).map((part) => evaluatePath(part, importer, declarations, new Set(seen)));
    if (parts.some((part) => part === null)) return null;
    return posix(normalize(join(...parts)));
  }
  return null;
}

function resolveSubject(specifier, importer, subjects) {
  if (typeof specifier !== "string" || specifier === "" || isAbsolute(specifier)) return null;
  const candidate = posix(normalize(specifier.startsWith(".") ? join(dirname(importer), specifier) : specifier));
  for (const path of [candidate, `${candidate}.mjs`, join(candidate, "index.mjs")].map(posix)) {
    if (subjects.has(path)) return path;
  }
  return null;
}

export function extractModuleEdges({ path, source, subjects }) {
  const clean = stripComments(source);
  const declarations = constants(clean);
  const dynamicCandidates = finiteLoopPathCandidates(clean, path);
  const edges = [];
  const add = (target, type, operation) => {
    const resolved = resolveSubject(target, path, subjects);
    if (resolved) edges.push({ from: path, to: resolved, type, operation });
  };
  for (const match of clean.matchAll(/\b(?:import\s+(?:[^"']*?\s+from\s+)?|export\s+[^"']*?\s+from\s+|require\s*\()(["'])([^"']+)\1/g)) {
    add(match[2], "module-load", match[0].trim().startsWith("require") ? "require" : "import");
  }
  for (const match of clean.matchAll(/\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g)) add(match[2], "module-load", "dynamic-import");

  // Generated consumer adapters cannot be followed through ordinary syntax: the checked-in
  // module exports both adapter source (`await import(dispatcher)`) and the exact URL later
  // supplied as that adapter's dispatcher argv. Treat only this closed pair as an edge. A
  // bare URL constant or an unbound generated import is deliberately insufficient.
  if (/\b(?:await\s+)?import\s*\(\s*dispatcher\s*\)/.test(source)
      && /(?:^|\n|\\n)\s*const\s*\[\s*dispatcher\b/.test(source)) {
    for (const match of source.matchAll(/\bexport\s+const\s+[A-Za-z_$][\w$]*DISPATCHER[A-Za-z_$\w]*\s*=\s*new\s+URL\s*\(\s*(["'])([^"']+\.mjs)\1\s*,\s*import\.meta\.url\s*\)\.href\s*;/g)) {
      add(match[2], "generated-dynamic-import", "url-dispatcher");
    }
  }

  const directBindings = childProcessBindings(clean);
  const bindings = new Map([...directBindings, ...localChildProcessWrappers(clean, directBindings)]);
  for (const call of callBodies(clean, bindings)) {
    const pathExpression = call.name === "fork"
      ? call.args[0]
      : (/^(?:process\.execPath|["'](?:node|nodejs)["'])$/.test(call.args[0] ?? "")
          ? /^\[([\s\S]*)\]$/.exec(call.args[1] ?? "")?.[1] && splitTopLevel(/^\[([\s\S]*)\]$/.exec(call.args[1])[1])[0]
          : call.args[0]);
    const target = evaluatePath(pathExpression, path, declarations);
    const targets = target === null && /^[A-Za-z_$][\w$]*$/.test(pathExpression ?? "")
      ? dynamicCandidates.get(pathExpression) ?? []
      : target === null ? [] : [target];
    for (const candidate of targets) add(candidate, "child-process", call.name);
  }
  return edges.sort((a, b) => compare(`${a.from}\0${a.to}\0${a.type}\0${a.operation}`, `${b.from}\0${b.to}\0${b.type}\0${b.operation}`));
}

function namedCommandRoots(root, subjects) {
  const roots = new Set();
  const files = ["SETUP.md"];
  for (const start of [
    "docs",
    "plugins/pipeline-core/skills",
    "plugins/pipeline-core/agents",
    "templates/prompts",
    "plugins/pipeline-core/templates/prompts",
  ]) {
    files.push(...walk(root, start).filter((path) => path.endsWith(".md") && !path.startsWith("docs/adr/") && !path.startsWith("docs/state-archive/") && !path.startsWith("docs/spec-archive/")));
  }
  for (const path of files.filter((item) => existsSync(join(root, item))).sort(compare)) {
    const text = readFileSync(join(root, path), "utf8");
    const lines = text.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (!/\b(?:node|nodejs)\b/.test(line)) continue;
      // Markdown may wrap one backticked command after `node`; inspect only the current
      // line and its next three physical lines, never the whole surrounding document.
      const command = lines.slice(lineIndex, lineIndex + 4).join(" ");
      for (const subject of subjects) {
        const basename = subject.slice(subject.lastIndexOf("/") + 1);
        const full = new RegExp(`(^|[^A-Za-z0-9_./-])${escapeRegExp(subject)}($|[^A-Za-z0-9_.-])`);
        const short = new RegExp(`(^|[^A-Za-z0-9_.-])${escapeRegExp(basename)}($|[^A-Za-z0-9_.-])`);
        if (full.test(command) || short.test(command)) roots.add(subject);
      }
    }
  }
  return roots;
}

function discoverRoots(root, subjects, graphNodes = subjects) {
  const roots = namedCommandRoots(root, subjects);
  for (const manifest of ["plugins/pipeline-core/hooks/hooks.json", "plugins/pipeline-core/hooks/codex-hooks.json"]) {
    if (!existsSync(join(root, manifest))) continue;
    const document = JSON.parse(readFileSync(join(root, manifest), "utf8"));
    const commands = [];
    const visit = (value) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          if (key === "command" && typeof child === "string") commands.push(child);
          else visit(child);
        }
      }
    };
    visit(document);
    for (const subject of subjects) {
      if (commands.some((command) => command.includes(subject) || command.includes(subject.slice("plugins/pipeline-core/".length)))) roots.add(subject);
    }
  }
  const verify = join(root, "harness/scripts/verify.mjs");
  if (existsSync(verify)) {
    const text = readFileSync(verify, "utf8");
    const directoryByVariable = {
      hooksDir: "plugins/pipeline-core/hooks",
      libDir: "plugins/pipeline-core/lib",
      scriptDir: "harness/scripts",
      pluginScriptsDir: "plugins/pipeline-core/scripts",
    };
    for (const match of text.matchAll(/\bfile:\s*join\(\s*([A-Za-z_$][\w$]*)\s*,\s*(["'])([^"']+\.mjs)\2\s*\)/g)) {
      if (match[3].endsWith(".test.mjs")) continue;
      const directory = directoryByVariable[match[1]];
      if (!directory) continue;
      const candidate = posix(join(directory, match[3]));
      if (graphNodes.has(candidate)) roots.add(candidate);
    }
  }
  return [...roots].sort(compare);
}

function deferredNativePath(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (/^codex-.*app-server.*\.mjs$/i.test(name)) return true;
  if (/^codex-wsl-ipc.*\.mjs$/i.test(name)) return true;
  if (/^run-codex-(?:critic-(?:isolation|probe-split)|isolation-control-decomposition).*\.mjs$/i.test(name)) return true;
  return new Set([
    "codex-critic-isolation.mjs",
    "codex-critic-probe-split.mjs",
    "codex-critic-selected-host.mjs",
    "codex-native-critic-host.mjs",
    "codex-native-critic-preflight.mjs",
    "codex-sandbox-preflight.mjs",
    "codex-sandbox-runtime.mjs",
    "codex-wsl-ipc-compatibility.mjs",
  ]).has(name);
}

function clustersOf(unreachable, edges) {
  const adjacent = new Map([...unreachable].map((path) => [path, new Set()]));
  for (const edge of edges) {
    if (unreachable.has(edge.from) && unreachable.has(edge.to)) {
      adjacent.get(edge.from).add(edge.to);
      adjacent.get(edge.to).add(edge.from);
    }
  }
  const unseen = new Set(unreachable);
  const clusters = [];
  while (unseen.size > 0) {
    const first = [...unseen].sort(compare)[0];
    unseen.delete(first);
    const queue = [first];
    const paths = [];
    while (queue.length) {
      const path = queue.shift();
      paths.push(path);
      for (const next of [...adjacent.get(path)].sort(compare)) if (unseen.delete(next)) queue.push(next);
    }
    clusters.push(paths.sort(compare));
  }
  return clusters.sort((a, b) => compare(a[0], b[0]));
}

export function auditModuleClusterReachability({ root, roots: suppliedRoots } = {}) {
  const absoluteRoot = resolve(root ?? process.cwd());
  const subjectPaths = SUBJECT_DIRS.flatMap((dir) => walk(absoluteRoot, dir))
    .filter((path) => path.endsWith(".mjs") && !path.endsWith(".test.mjs") && !path.includes("/fixtures/"))
    .sort(compare);
  const subjects = new Set(subjectPaths);
  // Harness modules are graph frontier nodes, never subjects and never roots merely by
  // existing. Only a non-test executable registration in verify.mjs can seed one; normal
  // import propagation may then continue through another harness helper into plugin code.
  const frontierPaths = walk(absoluteRoot, "harness/scripts")
    .filter((path) => path.endsWith(".mjs") && !path.endsWith(".test.mjs") && !path.includes("/fixtures/"))
    .sort(compare);
  const graphPaths = [...new Set([...subjectPaths, ...frontierPaths])].sort(compare);
  const graphNodes = new Set(graphPaths);
  const edges = graphPaths.flatMap((path) => extractModuleEdges({ path, source: readFileSync(join(absoluteRoot, path), "utf8"), subjects: graphNodes }));
  const roots = [...new Set(suppliedRoots ?? discoverRoots(absoluteRoot, subjects, graphNodes))].filter((path) => graphNodes.has(path)).sort(compare);
  const reachable = new Set(roots);
  const queue = [...roots];
  const outgoing = new Map(graphPaths.map((path) => [path, []]));
  for (const edge of edges) outgoing.get(edge.from).push(edge.to);
  while (queue.length) {
    for (const target of outgoing.get(queue.shift()) ?? []) if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
  }
  const unreachable = new Set(subjectPaths.filter((path) => !reachable.has(path)));
  // Split deferred native runtime nodes before cluster formation. Otherwise one shared
  // helper import can pull an unrelated advisory or runner-neutral subsystem into a large
  // weak component and incorrectly suppress a real readiness finding.
  const deferredPaths = new Set([...unreachable].filter(deferredNativePath));
  const readinessPaths = new Set([...unreachable].filter((path) => !deferredPaths.has(path)));
  const deferredClusters = clustersOf(deferredPaths, edges);
  const readinessClusters = clustersOf(readinessPaths, edges);
  const allClusters = [
    ...deferredClusters.map((paths) => ({ paths, deferred: true })),
    ...readinessClusters.map((paths) => ({ paths, deferred: false })),
  ].sort((left, right) => Number(right.deferred) - Number(left.deferred) || compare(left.paths[0], right.paths[0]));
  const clusters = allClusters.slice(0, MAX_CLUSTERS).map(({ paths, deferred }, index) => {
    const clusterEdges = edges.filter((edge) => paths.includes(edge.from) && paths.includes(edge.to));
    return {
      clusterId: `cluster-${String(index + 1).padStart(3, "0")}`,
      classification: deferred ? "deferred-native-codex-runtime" : (paths.length === 1 && clusterEdges.length === 0 ? "isolated-unreachable-module" : "unreachable-module-cluster"),
      readinessFinding: !deferred,
      moduleCount: paths.length,
      paths: paths.slice(0, MAX_PATHS_PER_CLUSTER),
      pathsTruncated: Math.max(0, paths.length - MAX_PATHS_PER_CLUSTER),
      edges: clusterEdges.slice(0, MAX_EDGES_PER_CLUSTER),
      edgesTruncated: Math.max(0, clusterEdges.length - MAX_EDGES_PER_CLUSTER),
    };
  });
  return {
    schema: "pipeline.module-cluster-reachability.v1",
    ok: readinessPaths.size === 0,
    scope: { subjectDirectories: SUBJECT_DIRS, nativeCodexRuntime: "deferred-out-of-scope" },
    counts: {
      subjects: subjectPaths.length,
      frontierModules: frontierPaths.length,
      frontierRoots: roots.filter((path) => !subjects.has(path)).length,
      roots: roots.length,
      edges: edges.length,
      reachable: subjectPaths.filter((path) => reachable.has(path)).length,
      unreachable: unreachable.size,
      clusters: allClusters.length,
      readinessFindingClusters: readinessClusters.length,
      deferredNativeCodexClusters: deferredClusters.length,
    },
    roots: roots.slice(0, MAX_REPORTED_ROOTS),
    rootsTruncated: Math.max(0, roots.length - MAX_REPORTED_ROOTS),
    clusters,
    diagnosticsTruncated: Math.max(0, allClusters.length - MAX_CLUSTERS),
  };
}

function main() {
  const rootFlag = process.argv.indexOf("--root");
  const root = rootFlag >= 0 ? process.argv[rootFlag + 1] : process.cwd();
  if (!root || !existsSync(root)) {
    process.stderr.write(`${JSON.stringify({ schema: "pipeline.module-cluster-reachability.v1", ok: false, error: "invalid-root" })}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const result = auditModuleClusterReachability({ root });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ schema: "pipeline.module-cluster-reachability.v1", ok: false, error: "audit-failed", message: String(error?.message ?? error).slice(0, 500) })}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
