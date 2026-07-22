#!/usr/bin/env node
/**
 * Fail-closed repository documentation contract gate.
 *
 * Checks tracked Markdown links/anchors plus the calibrated handover authority.
 * It excludes the user-owned root instruction file before every source or target
 * read. It never performs network requests or semantic prose review.
 */
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { checkObservationGovernance } from "./check-observation-governance.mjs";

const decoder = new TextDecoder("utf-8", { fatal: true });
const EXCLUDED_PATH = "AGENTS.md";
const STATEFUL_DESIGN_SURFACES = ["templates/spec.md", "roles/elephant.md"];
const STATEFUL_DESIGN_CONTRACTS = [
  {
    id: "authority-issuer-replay",
    phrases: ["Authority issuer and replay rule.", "authority issuer and replay rule"],
  },
  {
    id: "durable-storage-atomicity",
    phrases: ["Durable storage and atomicity boundary.", "durable storage and atomicity"],
  },
  {
    id: "crash-state-matrix",
    phrases: ["Complete resource/phase crash-state matrix.", "complete resource/phase crash-state matrix"],
  },
  {
    id: "mutation-enforcement",
    phrases: ["Exact mutation point and kernel/controller enforcement point.", "exact mutation plus kernel/controller enforcement points"],
  },
  {
    id: "bootstrap-self-update",
    phrases: ["Bootstrap and self-update transition.", "bootstrap/self-update transition"],
  },
  {
    id: "candidate-evidence-binding",
    phrases: ["Binary candidate/evidence binding.", "binary candidate/evidence binding"],
  },
  {
    id: "pre-post-bytes",
    phrases: ["Exact pre- and post-mutation bytes.", "exact pre/post bytes"],
  },
  {
    id: "sole-recovery-authority",
    phrases: ["Sole recovery authority.", "sole recovery authority"],
  },
  {
    id: "self-reference-audit",
    phrases: ["Self-reference audit (what mutable material cannot authenticate itself).", "self-reference audit"],
  },
];
function posixPath(value) {
  return value.split(sep).join("/");
}

export function isExcludedRepoPath(value) {
  return posixPath(value).replace(/^\.\//, "") === EXCLUDED_PATH;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function defaultReadText(file) {
  return decoder.decode(readFileSync(file));
}

/**
 * Check the two stateful-design documentation surfaces against their distinct,
 * equivalent checklist wording. Callers decide whether both surfaces apply.
 */
export function checkStatefulDesignContracts(surfaces) {
  const findings = [];
  for (const [surfaceIndex, surface] of STATEFUL_DESIGN_SURFACES.entries()) {
    for (const contract of STATEFUL_DESIGN_CONTRACTS) {
      if (!surfaces[surface].includes(contract.phrases[surfaceIndex])) {
        findings.push(`stateful-design-contract: ${surface}: ${contract.id}`);
      }
    }
  }
  return findings;
}

export function stripFencedCode(markdown) {
  const lines = markdown.split("\n");
  let fence = null;
  return lines
    .map((line) => {
      const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (!fence && open) {
        fence = { char: open[1][0], length: open[1].length };
        return "";
      }
      if (fence) {
        const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
        return "";
      }
      return line;
    })
    .join("\n");
}

function cleanHeading(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

function baseSlug(value) {
  return cleanHeading(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "")
    .replace(/\s/g, "-");
}

export function collectAnchors(markdown) {
  const text = stripFencedCode(markdown);
  const lines = text.split("\n");
  const anchors = new Set();
  const headingSlugs = new Set();
  const nextSuffix = new Map();
  const addHeading = (heading) => {
    const base = baseSlug(heading);
    let suffix = nextSuffix.get(base) ?? 0;
    let candidate = suffix === 0 ? base : `${base}-${suffix}`;
    while (headingSlugs.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    nextSuffix.set(base, suffix);
    headingSlugs.add(candidate);
    anchors.add(candidate);
  };
  for (let i = 0; i < lines.length; i += 1) {
    const atx = lines[i].match(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/);
    if (atx) addHeading(atx[1]);
    if (i > 0 && /^ {0,3}(?:=+|-+)\s*$/.test(lines[i]) && lines[i - 1].trim()) addHeading(lines[i - 1]);
    for (const match of lines[i].matchAll(/<a\s+[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gi)) {
      anchors.add(match[1]);
      anchors.add(match[1].toLocaleLowerCase("en-US"));
    }
  }
  return anchors;
}

function normalizeReferenceId(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function unwrapDestination(value) {
  return value.startsWith("<") && value.endsWith(">") ? value.slice(1, -1) : value;
}

function inlineDestinations(line) {
  const closingAfterTitle = (cursor) => {
    while (/\s/.test(line[cursor] ?? "")) cursor += 1;
    if (line[cursor] === ")") return cursor;
    const opener = line[cursor];
    const closer = opener === "(" ? ")" : opener;
    if (opener !== '"' && opener !== "'" && opener !== "(") return -1;
    cursor += 1;
    let escaped = false;
    for (; cursor < line.length; cursor += 1) {
      const char = line[cursor];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === closer) {
        cursor += 1;
        while (/\s/.test(line[cursor] ?? "")) cursor += 1;
        return line[cursor] === ")" ? cursor : -1;
      }
    }
    return -1;
  };
  const results = [];
  for (let start = 0; start < line.length; start += 1) {
    if (line[start] !== "[") continue;
    const labelEnd = line.indexOf("]", start + 1);
    if (labelEnd < 0 || line[labelEnd + 1] !== "(") continue;
    let cursor = labelEnd + 2;
    if (line[cursor] === "<") {
      const close = line.indexOf(">", cursor + 1);
      const outerClose = close > cursor ? closingAfterTitle(close + 1) : -1;
      if (outerClose >= 0) {
        results.push(line.slice(cursor, close + 1));
        start = outerClose;
      }
      continue;
    }
    const destinationStart = cursor;
    let depth = 0;
    let escaped = false;
    for (; cursor < line.length; cursor += 1) {
      const char = line[cursor];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "(") {
        depth += 1;
        continue;
      }
      if (char === ")") {
        if (depth === 0) {
          results.push(line.slice(destinationStart, cursor));
          start = cursor;
          break;
        }
        depth -= 1;
        continue;
      }
      if (/\s/.test(char) && depth === 0) {
        const outerClose = closingAfterTitle(cursor);
        if (outerClose >= 0) {
          results.push(line.slice(destinationStart, cursor));
          start = outerClose;
        }
        break;
      }
    }
  }
  return results;
}

export function extractMarkdownLinks(markdown) {
  const text = stripFencedCode(markdown);
  const lines = text.split("\n");
  const definitions = new Map();
  const links = [];
  for (let index = 0; index < lines.length; index += 1) {
    const definition = lines[index].match(/^ {0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)(?:\s+.*)?$/);
    if (definition) {
      const id = normalizeReferenceId(definition[1]);
      definitions.set(id, { destination: unwrapDestination(definition[2]), line: index + 1 });
      links.push({ destination: unwrapDestination(definition[2]), line: index + 1, kind: "reference-definition" });
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^ {0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)(?:\s+.*)?$/.test(line)) continue;
    for (const destination of inlineDestinations(line)) {
      links.push({ destination: unwrapDestination(destination), line: index + 1, kind: "inline" });
    }
    for (const match of line.matchAll(/!?\[([^\]]+)\]\[([^\]]*)\]/g)) {
      const id = normalizeReferenceId(match[2] || match[1]);
      const target = definitions.get(id);
      if (target) links.push({ ...target, line: index + 1, kind: "reference-use" });
      else links.push({ destination: null, referenceId: id, line: index + 1, kind: "missing-reference" });
    }
  }
  return links;
}

function gitList(root, patterns = []) {
  const result = spawnSync("git", ["ls-files", "-z", "--", ...patterns], { cwd: root, encoding: "buffer" });
  if (result.status !== 0) throw new Error(`git ls-files failed with exit ${result.status ?? "unknown"}`);
  const output = decoder.decode(result.stdout);
  return output.split("\0").filter(Boolean).map(posixPath);
}

export function enumerateTrackedMarkdown(root) {
  return gitList(root, ["*.md"]).filter((entry) => !isExcludedRepoPath(entry)).sort();
}

function splitDestination(raw) {
  const hash = raw.indexOf("#");
  const beforeHash = hash < 0 ? raw : raw.slice(0, hash);
  const fragmentRaw = hash < 0 ? null : raw.slice(hash + 1);
  const query = beforeHash.indexOf("?");
  return {
    pathRaw: query < 0 ? beforeHash : beforeHash.slice(0, query),
    fragmentRaw,
  };
}

function decodePart(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`invalid URL encoding in ${label}`);
  }
}

function isExternal(destination) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination) || destination.startsWith("//");
}

function relativeTarget(root, sourcePath, destination) {
  if (isExternal(destination)) return { external: true };
  const { pathRaw, fragmentRaw } = splitDestination(destination);
  const decodedPath = decodePart(pathRaw, "path");
  const fragment = fragmentRaw === null ? null : decodePart(fragmentRaw, "fragment");
  if (decodedPath.startsWith("/") || isAbsolute(decodedPath)) return { error: "absolute internal path" };
  const absolute = decodedPath === "" ? resolve(root, sourcePath) : resolve(root, dirname(sourcePath), decodedPath);
  if (!inside(root, absolute)) return { error: "path escapes repository root" };
  return { absolute, repoPath: posixPath(relative(root, absolute)), fragment };
}

function safeFile(root, repoPath, readText, { requireRegular = false, forbidSymlink = false } = {}) {
  if (isAbsolute(repoPath) || repoPath.includes("\\")) throw new Error("repo path must be canonical POSIX relative");
  const absolute = resolve(root, repoPath);
  if (!inside(root, absolute)) throw new Error("path escapes repository root");
  const canonicalRepoPath = posixPath(relative(root, absolute));
  if (repoPath.replace(/^\.\//, "") !== canonicalRepoPath) throw new Error("repo path is not canonical");
  if (isExcludedRepoPath(canonicalRepoPath)) return { excluded: true };
  const stat = lstatSync(absolute);
  if (forbidSymlink && stat.isSymbolicLink()) throw new Error("symlink is not allowed");
  const real = realpathSync(absolute);
  if (!inside(root, real)) throw new Error("symlink target escapes repository root");
  const realRepoPath = posixPath(relative(root, real));
  if (isExcludedRepoPath(realRepoPath)) return { excluded: true };
  if (requireRegular && !stat.isFile()) throw new Error("target is not a regular file");
  return { absolute, stat, text: stat.isFile() ? readText(absolute) : null };
}

function finding(source, line, destination, reason) {
  return `${source}:${line} -> ${destination ?? "[reference]"}: ${reason}`;
}

export function checkRepository(rootInput, options = {}) {
  const root = realpathSync(resolve(rootInput));
  const readText = options.readText ?? defaultReadText;
  const markdownPaths = (options.markdownPaths ?? enumerateTrackedMarkdown(root))
    .map(posixPath)
    .filter((entry) => !isExcludedRepoPath(entry))
    .sort();
  const trackedPaths = new Set((options.trackedPaths ?? gitList(root)).map(posixPath));
  const findings = [];
  const cache = new Map();
  let linksChecked = 0;
  let anchorsChecked = 0;
  let excludedLinks = 0;

  const readRepoText = (repoPath) => {
    if (isExcludedRepoPath(repoPath)) return null;
    if (cache.has(repoPath)) return cache.get(repoPath);
    const file = safeFile(root, repoPath, readText, { requireRegular: true });
    if (file.excluded) return null;
    cache.set(repoPath, file.text);
    return file.text;
  };

  for (const source of markdownPaths) {
    let text;
    try {
      text = readRepoText(source);
    } catch (error) {
      findings.push(finding(source, 1, source, `source read failed: ${error.message}`));
      continue;
    }
    if (text === null) continue;
    for (const link of extractMarkdownLinks(text)) {
      if (link.kind === "missing-reference") {
        findings.push(finding(source, link.line, link.referenceId, "missing reference definition"));
        continue;
      }
      linksChecked += 1;
      let target;
      try {
        target = relativeTarget(root, source, link.destination);
      } catch (error) {
        findings.push(finding(source, link.line, link.destination, error.message));
        continue;
      }
      if (target.external) continue;
      if (target.error) {
        findings.push(finding(source, link.line, link.destination, target.error));
        continue;
      }
      if (isExcludedRepoPath(target.repoPath)) {
        excludedLinks += 1;
        continue;
      }
      const trackedTarget = trackedPaths.has(target.repoPath);
      const trackedDescendant = [...trackedPaths].some((entry) => entry.startsWith(`${target.repoPath.replace(/\/$/, "")}/`));
      if (!trackedTarget && !trackedDescendant) {
        findings.push(finding(source, link.line, link.destination, "target is not tracked"));
        continue;
      }
      let file;
      try {
        file = safeFile(root, target.repoPath, readText);
      } catch (error) {
        findings.push(finding(source, link.line, link.destination, `target unavailable: ${error.message}`));
        continue;
      }
      if (file.excluded) {
        excludedLinks += 1;
        continue;
      }
      if (target.fragment === null || target.fragment === "") continue;
      anchorsChecked += 1;
      if (!file.stat.isFile() || !target.repoPath.toLowerCase().endsWith(".md")) {
        findings.push(finding(source, link.line, link.destination, "fragment target is not Markdown"));
        continue;
      }
      const anchors = collectAnchors(file.text);
      const fragment = target.fragment.toLocaleLowerCase("en-US");
      if (!anchors.has(target.fragment) && !anchors.has(fragment)) {
        findings.push(finding(source, link.line, link.destination, "anchor not found"));
      }
    }
  }

  const calibrationPath = ".claude/pipeline.json";
  try {
    const raw = readRepoText(calibrationPath);
    const keyCount = [...raw.matchAll(/"handover"\s*:/g)].length;
    if (keyCount !== 1) throw new Error(`expected exactly one handover key, found ${keyCount}`);
    const calibration = JSON.parse(raw);
    const handover = calibration?.handover;
    if (typeof handover !== "string" || handover.trim() === "") throw new Error("handover must be a nonempty string");
    if (handover !== posixPath(handover) || handover.includes("\\") || handover.startsWith("/") || handover.split("/").includes("..")) {
      throw new Error("handover must be a repo-relative POSIX path without escape");
    }
    if (!handover.toLowerCase().endsWith(".md")) throw new Error("handover must target Markdown");
    if (isExcludedRepoPath(handover)) throw new Error("handover targets excluded user-owned path");
    if (!trackedPaths.has(handover)) throw new Error("handover target is not tracked");
    safeFile(root, handover, readText, { requireRegular: true, forbidSymlink: true });

    const claudeLinks = extractMarkdownLinks(readRepoText("CLAUDE.md"))
      .filter((link) => link.destination)
      .map((link) => ({ ...link, target: relativeTarget(root, "CLAUDE.md", link.destination) }))
      .filter((link) => !link.target.external && !link.target.error);
    const handoverLinks = claudeLinks.filter((link) => link.target.repoPath === handover);
    if (handoverLinks.length === 0) throw new Error("CLAUDE.md does not link to calibrated handover");
    const stateLinks = claudeLinks.filter((link) => link.target.repoPath.toLowerCase().endsWith("state.md"));
    if (stateLinks.some((link) => link.target.repoPath !== handover)) throw new Error("CLAUDE.md links to a competing state.md");

    const backlink = extractMarkdownLinks(readRepoText(handover))
      .filter((link) => link.destination)
      .map((link) => relativeTarget(root, handover, link.destination))
      .some((target) => !target.external && !target.error && target.repoPath === calibrationPath);
    if (!backlink) throw new Error("handover does not link back to calibration");
  } catch (error) {
    findings.push(`authority: ${error.message}`);
  }

  let statefulDesignContracts = "not-applicable";
  if (STATEFUL_DESIGN_SURFACES.every((path) => trackedPaths.has(path))) {
    const surfaces = {};
    let available = true;
    for (const path of STATEFUL_DESIGN_SURFACES) {
      try {
        const text = readRepoText(path);
        if (text === null) throw new Error("surface is excluded");
        surfaces[path] = text;
      } catch {
        available = false;
        break;
      }
    }
    if (available) {
      statefulDesignContracts = "checked";
      findings.push(...checkStatefulDesignContracts(surfaces));
    }
  }

  const observationGovernance = checkObservationGovernance(root, { optionalWhenAbsent: true });
  for (const item of observationGovernance.findings) findings.push(`observation-governance: ${item}`);

  findings.sort();
  return {
    findings,
    stats: {
      markdownFiles: markdownPaths.length,
      linksChecked,
      anchorsChecked,
      excludedLinks,
      observationGovernance: observationGovernance.applicable ? "checked" : "not-applicable",
      statefulDesignContracts,
    },
  };
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex < 0 || rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-doc-contracts.mjs [--root <repository>]\n");
    process.exit(2);
  }
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const root = rootIndex === 0 ? args[1] : defaultRoot;
  try {
    const result = checkRepository(root);
    if (result.findings.length) {
      for (const item of result.findings) process.stderr.write(`DOC-CONTRACT ${item}\n`);
      process.stderr.write(`Documentation contracts failed: ${result.findings.length} finding(s).\n`);
      process.exit(2);
    }
    process.stdout.write(
      `Documentation contracts valid: ${result.stats.markdownFiles} Markdown file(s), ${result.stats.linksChecked} link(s), ${result.stats.anchorsChecked} anchor check(s).\n`,
    );
  } catch (error) {
    process.stderr.write(`Documentation contracts unavailable: ${error.message}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
