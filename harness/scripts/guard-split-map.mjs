// SPDX-License-Identifier: SUL-1.0
/**
 * guard-split-map.mjs -- the extractor behind plan stage S2 (splitting the guard monolith).
 *
 * Plan: specs/sprint-alfred-epic/design/s2-guard-split-plan.md (sections 2-4). Hand-copying
 * thousands of lines is the failure mode this tool exists to remove: it reads the base blob
 * (`git show <sha>:<path>`), splits it into top-level declarations, and either emits one
 * target module or proves that a candidate tree is a pure move of the base.
 *
 * Modes (node built-ins only; no shell; the base blob is read through spawnSync):
 *   extract       --base <sha> --module <name> --out <file>
 *       Emit one module. Declarations are byte-identical to the base except the three
 *       whitelisted transforms: (a) a leading `export ` where a declaration gained a
 *       cross-module consumer (or was exported in the base), (b) the import.meta.url
 *       specifier depth (`new URL("<rel>", import.meta.url)` and
 *       `resolve(dirname(fileURLToPath(import.meta.url)), "<rel>")` are rebased from the
 *       source directory to the module directory), (c) a computed import header.
 *       `--module facade` emits the facade: header, imports, base-surface re-exports, the
 *       depth-0 statements of the base (verbatim, in order) and the facade-mapped declarations.
 *   check         --base <sha> --dir <dir> [--facade <file>] [--out <result.json>] [--complete]
 *       Prove that every base declaration appears exactly once across the modules found in
 *       <dir>, byte-identical modulo the whitelist. Exit 1 on any miss, duplicate, byte
 *       difference, misplaced or unknown declaration. Modules whose file is absent are
 *       "not yet extracted" (partial-coverage mode) unless --complete is given. <dir> is a
 *       repository root when <dir>/<moduleDir> exists ("tree" layout, the facade is only read
 *       through --facade), otherwise a flat directory of <module>.mjs files (facade.mjs).
 *   graph         --base <sha> [--out <result.json>]
 *       Assert the layering of the map: every cross-module reference points at a strictly
 *       lower layer, and the module graph has no cycle. Prints the per-module import surface.
 *   export-surface --file <path> [--out <file>]
 *       Sorted export names with typeof (runtime import of the file).
 *   list          --base <sha>
 *       The declaration inventory (line range, kind, export flag, size) of the base blob.
 * Common options: --repo <dir> (default: this repository), --map <file> (default:
 * harness/guard-split-map.json).
 *
 * The map (harness/guard-split-map.json) is data: { source, baseSha, moduleDir, facade,
 * modules: { <name>: { layer } }, declarations: { <declaration name>: <module> } }.
 * Depth-0 statements of the base (the early exit, the direct invocation, the re-export
 * list) are not declarations; they always belong to the facade.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_MAP = "harness/guard-split-map.json";
const DEFAULT_SOURCE = "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs";

// ---------------------------------------------------------------------------------------
// Lexer: tokens only (comments and whitespace are skipped, template expressions are lexed as
// code). Enough JavaScript for a ES-module file: strings, templates, regex literals, numbers.
// ---------------------------------------------------------------------------------------

const PUNCTUATORS = [
  "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=",
  "?.", "??", "=>", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "**",
];
const REGEX_PRECEDING_KEYWORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);
const isIdStart = (c) => /[A-Za-z_$]/.test(c) || c > "\u007f";
const isIdPart = (c) => /[A-Za-z0-9_$]/.test(c) || c > "\u007f";

export function lex(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  let prev = null;
  if (src.startsWith("#!")) while (i < n && src[i] !== "\n") i++;

  const push = (t, v, s, e) => {
    const tok = { t, v, s, e };
    tokens.push(tok);
    prev = tok;
  };
  const regexAllowed = () => {
    if (prev === null) return true;
    if (prev.t === "num" || prev.t === "str" || prev.t === "tpl" || prev.t === "re") return false;
    if (prev.t === "id") return REGEX_PRECEDING_KEYWORDS.has(prev.v);
    return !(prev.v === ")" || prev.v === "]" || prev.v === "}");
  };
  function lexTemplate() {
    const s = i;
    i++;
    const tok = { t: "tpl", v: "`", s, e: s + 1 };
    tokens.push(tok);
    while (i < n) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { i++; break; }
      if (c === "$" && src[i + 1] === "{") {
        i += 2;
        prev = null;
        lexCode(true);
        continue;
      }
      i++;
    }
    tok.e = i;
    prev = tok;
  }
  function lexCode(untilBrace) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") {
        const close = src.indexOf("*/", i + 2);
        if (close < 0) throw new Error("unterminated block comment");
        i = close + 2;
        continue;
      }
      const s = i;
      if (isIdStart(c)) {
        i++;
        while (i < n && isIdPart(src[i])) i++;
        push("id", src.slice(s, i), s, i);
        continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
        i++;
        while (i < n && (/[0-9A-Za-z_.]/.test(src[i]) || ((src[i] === "+" || src[i] === "-") && /[eE]/.test(src[i - 1]) && !/^0[xX]/.test(src.slice(s, i))))) i++;
        push("num", src.slice(s, i), s, i);
        continue;
      }
      if (c === '"' || c === "'") {
        i++;
        while (i < n && src[i] !== c) {
          if (src[i] === "\\") i++;
          i++;
        }
        i++;
        push("str", src.slice(s, i), s, i);
        continue;
      }
      if (c === "`") { lexTemplate(); continue; }
      if (c === "/" && regexAllowed()) {
        i++;
        let inClass = false;
        while (i < n) {
          const d = src[i];
          if (d === "\\") { i += 2; continue; }
          if (d === "\n") throw new Error(`unterminated regex literal at offset ${s}`);
          if (d === "[") inClass = true;
          else if (d === "]") inClass = false;
          else if (d === "/" && !inClass) break;
          i++;
        }
        i++;
        while (i < n && isIdPart(src[i])) i++;
        push("re", src.slice(s, i), s, i);
        continue;
      }
      let v = c;
      for (const p of PUNCTUATORS) {
        if (src.startsWith(p, i)) { v = p; break; }
      }
      i += v.length;
      if (v === "{") depth++;
      if (v === "}") {
        if (untilBrace && depth === 0) return;
        depth--;
      }
      push("p", v, s, i);
    }
  }
  lexCode(false);
  return tokens;
}

// ---------------------------------------------------------------------------------------
// Binding patterns, references and locals
// ---------------------------------------------------------------------------------------

const isP = (tok, v) => tok !== undefined && tok.t === "p" && tok.v === v;
const isId = (tok, v) => tok !== undefined && tok.t === "id" && (v === undefined || tok.v === v);

function skipExpression(tokens, k) {
  let depth = 0;
  for (; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.t !== "p") continue;
    if (t.v === "(" || t.v === "[" || t.v === "{") depth++;
    else if (t.v === ")" || t.v === "]" || t.v === "}") {
      if (depth === 0) return k;
      depth--;
    } else if ((t.v === "," || t.v === ";") && depth === 0) return k;
  }
  return k;
}

function skipBalanced(tokens, k) {
  let depth = 0;
  for (; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.t !== "p") continue;
    if (t.v === "(" || t.v === "[" || t.v === "{") depth++;
    else if (t.v === ")" || t.v === "]" || t.v === "}") {
      depth--;
      if (depth === 0) return k + 1;
    }
  }
  return k;
}

/** Parses one binding target at tokens[k] (identifier or destructuring pattern); returns the index after it. */
function parsePattern(tokens, k, out) {
  const t = tokens[k];
  if (isId(t)) { out.push(t.v); return k + 1; }
  if (!(isP(t, "{") || isP(t, "["))) throw new Error(`unsupported binding pattern at token ${k}`);
  const object = t.v === "{";
  const close = object ? "}" : "]";
  k++;
  while (!isP(tokens[k], close)) {
    if (isP(tokens[k], ",")) { k++; continue; }
    if (isP(tokens[k], "...")) { k = parsePattern(tokens, k + 1, out); continue; }
    if (object) {
      const keyTok = tokens[k];
      k = isP(keyTok, "[") ? skipBalanced(tokens, k) : k + 1;
      if (isP(tokens[k], ":")) k = parsePattern(tokens, k + 1, out);
      else if (isId(keyTok)) out.push(keyTok.v);
    } else {
      k = parsePattern(tokens, k, out);
    }
    if (isP(tokens[k], "=")) k = skipExpression(tokens, k + 1);
  }
  return k + 1;
}

function parseParams(tokens, openIdx, out) {
  let k = openIdx + 1;
  while (k < tokens.length && !isP(tokens[k], ")")) {
    if (isP(tokens[k], ",")) { k++; continue; }
    if (isP(tokens[k], "...")) k++;
    k = parsePattern(tokens, k, out);
    if (isP(tokens[k], "=")) k = skipExpression(tokens, k + 1);
  }
}

function collectLocals(tokens, a, b) {
  const locals = [];
  for (let k = a; k <= b; k++) {
    const t = tokens[k];
    try {
      if (isId(t, "const") || isId(t, "let") || isId(t, "var")) parsePattern(tokens, k + 1, locals);
      else if (isId(t, "function")) {
        let m = k + 1;
        if (isP(tokens[m], "*")) m++;
        if (isId(tokens[m])) m++;
        if (isP(tokens[m], "(")) parseParams(tokens, m, locals);
      } else if (isId(t, "catch") && isP(tokens[k + 1], "(")) parseParams(tokens, k + 1, locals);
      else if (isP(t, "=>")) {
        const before = tokens[k - 1];
        if (isId(before)) locals.push(before.v);
        else if (isP(before, ")")) {
          let depth = 0;
          let m = k - 1;
          for (; m >= a; m--) {
            if (isP(tokens[m], ")")) depth++;
            else if (isP(tokens[m], "(")) { depth--; if (depth === 0) break; }
          }
          if (m >= a) parseParams(tokens, m, locals);
        }
      }
    } catch {
      // locals are informational (shadow-candidate flagging); a pattern we cannot parse is skipped
    }
  }
  return new Set(locals);
}

/** Identifier references of tokens[a..b]: no property names, no object keys (a ternary colon is not a key). */
function collectIdents(tokens, a, b) {
  const idents = new Set();
  const stack = [{ ch: "", ternary: 0 }];
  for (let k = a; k <= b; k++) {
    const t = tokens[k];
    const top = stack[stack.length - 1];
    if (t.t === "p") {
      if (t.v === "(" || t.v === "[" || t.v === "{") stack.push({ ch: t.v, ternary: 0 });
      else if (t.v === ")" || t.v === "]" || t.v === "}") { if (stack.length > 1) stack.pop(); }
      else if (t.v === "?") top.ternary++;
      else if (t.v === ":" && top.ternary > 0) top.ternary--;
      continue;
    }
    if (t.t !== "id") continue;
    const before = tokens[k - 1];
    const after = tokens[k + 1];
    if (isP(before, ".") || isP(before, "?.")) continue;
    if (isP(after, ":") && top.ch === "{" && top.ternary === 0 && !isId(before, "case")) continue;
    idents.add(t.v);
  }
  return idents;
}

// ---------------------------------------------------------------------------------------
// Top-level scan: imports, declarations, statements
// ---------------------------------------------------------------------------------------

const DECLARATION_KEYWORDS = new Set(["function", "class", "const", "let", "var"]);
const LINE_START_KEYWORDS = new Set(["function", "class", "const", "let", "var", "import", "export"]);

function declarationNames(tokens, declIdx, declKind) {
  if (declKind === "function" || declKind === "class") {
    let k = declIdx + 1;
    if (isP(tokens[k], "*")) k++;
    return [tokens[k].v];
  }
  const names = [];
  let k = declIdx + 1;
  for (;;) {
    k = parsePattern(tokens, k, names);
    if (isP(tokens[k], "=")) k = skipExpression(tokens, k + 1);
    if (isP(tokens[k], ",")) { k++; continue; }
    break;
  }
  return names;
}

function parseImport(tokens, a) {
  let k = a + 1;
  if (tokens[k].t === "str") return { specifier: tokens[k].v.slice(1, -1), bindings: [] };
  const bindings = [];
  if (isId(tokens[k]) && !isId(tokens[k], "from")) {
    bindings.push({ imported: "default", local: tokens[k].v });
    k++;
    if (isP(tokens[k], ",")) k++;
  }
  if (isP(tokens[k], "*")) {
    bindings.push({ imported: "*", local: tokens[k + 2].v });
    k += 3;
  } else if (isP(tokens[k], "{")) {
    k++;
    while (!isP(tokens[k], "}")) {
      if (isP(tokens[k], ",")) { k++; continue; }
      const imported = tokens[k].v;
      let local = imported;
      k++;
      if (isId(tokens[k], "as")) { local = tokens[k + 1].v; k += 2; }
      bindings.push({ imported, local });
    }
    k++;
  }
  if (!isId(tokens[k], "from") || tokens[k + 1].t !== "str") throw new Error(`unsupported import statement at token ${a}`);
  return { specifier: tokens[k + 1].v.slice(1, -1), bindings };
}

function classify(tokens, i) {
  const t = tokens[i];
  if (isId(t, "import") && !(isP(tokens[i + 1], "(") || isP(tokens[i + 1], "."))) return { kind: "import" };
  let k = i;
  let exported = false;
  if (isId(t, "export")) {
    const next = tokens[i + 1];
    if (isP(next, "{") || isP(next, "*") || isId(next, "default")) return { kind: "statement", exportList: !isId(next, "default") };
    exported = true;
    k = i + 1;
  }
  const bodyIdx = k;
  if (isId(tokens[k], "async") && isId(tokens[k + 1], "function")) k++;
  if (tokens[k].t === "id" && DECLARATION_KEYWORDS.has(tokens[k].v)) {
    return { kind: "declaration", exported, exportIdx: exported ? i : -1, bodyIdx, declIdx: k, declKind: tokens[k].v };
  }
  return { kind: "statement" };
}

export function scanSource(source) {
  const tokens = lex(source);
  const units = [];
  const imports = [];
  const lineStartOf = (pos) => source.lastIndexOf("\n", pos - 1) + 1;
  let idx = 0;
  let prevEnd = 0;
  while (idx < tokens.length) {
    const first = tokens[idx];
    if (first.s !== lineStartOf(first.s)) throw new Error(`top-level unit does not start at column 0 (offset ${first.s}: ${first.v})`);
    const head = classify(tokens, idx);
    const closesOnBrace = head.kind === "declaration" && (head.declKind === "function" || head.declKind === "class");
    let depth = 0;
    let j = idx;
    for (; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.t === "p") {
        if (t.v === "(" || t.v === "[" || t.v === "{") depth++;
        else if (t.v === ")" || t.v === "]" || t.v === "}") {
          depth--;
          if (depth === 0 && t.v === "}" && closesOnBrace) break;
        } else if (t.v === ";" && depth === 0) break;
      } else if (depth === 0 && j > idx && t.t === "id" && LINE_START_KEYWORDS.has(t.v) && t.s === lineStartOf(t.s)) {
        throw new Error(`unterminated top-level unit starting at offset ${first.s}: reached '${t.v}' at column 0`);
      }
    }
    if (j >= tokens.length) throw new Error(`unterminated top-level unit starting at offset ${first.s}`);
    if (j === idx && tokens[j].v === ";") throw new Error(`stray semicolon at offset ${first.s}`);
    const last = tokens[j];
    let end = last.e;
    const eol = source.indexOf("\n", end);
    const lineEnd = eol < 0 ? source.length : eol;
    if (tokens[j + 1] !== undefined && tokens[j + 1].s < lineEnd) throw new Error(`two top-level units share a line (offset ${tokens[j + 1].s})`);
    if (/^[ \t]*(\/\/.*|\/\*.*\*\/[ \t]*)?\r?$/.test(source.slice(end, lineEnd))) end = source[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;

    const region = source.slice(prevEnd, first.s);
    const firstText = /\S/.exec(region);
    const start = firstText === null ? first.s : Math.max(prevEnd, lineStartOf(prevEnd + firstText.index));
    const lineOf = (pos) => source.slice(0, pos).split("\n").length;

    if (head.kind === "import") {
      const parsed = parseImport(tokens, idx);
      imports.push(parsed);
      units.push({ kind: "import", ...parsed, tokA: idx, tokB: j });
    } else if (head.kind === "declaration") {
      const names = declarationNames(tokens, head.declIdx, head.declKind);
      const bodyStart = tokens[head.bodyIdx].s;
      const headStart = head.exported ? tokens[head.exportIdx].s : bodyStart;
      units.push({
        kind: "declaration",
        name: names[0],
        names,
        exported: head.exported,
        declKind: head.declKind,
        lead: source.slice(start, headStart),
        body: source.slice(bodyStart, end),
        bodyStart,
        line: lineOf(first.s),
        endLine: lineOf(last.s),
        tokA: head.bodyIdx,
        tokB: j,
        idents: collectIdents(tokens, head.bodyIdx, j),
        locals: collectLocals(tokens, head.bodyIdx, j),
      });
    } else {
      const hasFrom = head.exportList === true && tokens.slice(idx, j + 1).some((t) => isId(t, "from"));
      units.push({
        kind: hasFrom ? "reexport" : "statement",
        name: null,
        names: [],
        exported: false,
        lead: source.slice(start, first.s),
        body: source.slice(first.s, end),
        bodyStart: first.s,
        line: lineOf(first.s),
        endLine: lineOf(last.s),
        tokA: idx,
        tokB: j,
        idents: collectIdents(tokens, idx, j),
        locals: collectLocals(tokens, idx, j),
      });
    }
    prevEnd = end;
    idx = j + 1;
  }
  if (/\S/.test(source.slice(prevEnd))) throw new Error("unattached trailing comment after the last top-level unit");
  const seen = new Set();
  for (const u of units) {
    if (u.kind !== "declaration") continue;
    for (const nm of u.names) {
      if (seen.has(nm)) throw new Error(`duplicate top-level declaration name '${nm}'`);
      seen.add(nm);
    }
  }
  return { source, tokens, units, imports };
}

// ---------------------------------------------------------------------------------------
// Map and plan
// ---------------------------------------------------------------------------------------

function findDuplicateKeys(text) {
  const duplicates = [];
  const stack = [];
  let i = 0;
  let lastKey = "";
  while (i < text.length) {
    const c = text[i];
    if (c === "{" || c === "[") {
      stack.push({ obj: c === "{", keys: new Set(), label: lastKey });
      lastKey = "";
      i++;
    } else if (c === "}" || c === "]") {
      stack.pop();
      i++;
    } else if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      const value = JSON.parse(text.slice(i, j + 1));
      let k = j + 1;
      while (/\s/.test(text[k] ?? "")) k++;
      const top = stack[stack.length - 1];
      if (text[k] === ":" && top?.obj) {
        if (top.keys.has(value)) duplicates.push({ path: stack.slice(1).map((e) => e.label).join("."), key: value });
        top.keys.add(value);
        lastKey = value;
      }
      i = j + 1;
    } else i++;
  }
  return duplicates;
}

export function parseMap(text) {
  return { map: JSON.parse(text), duplicateKeys: findDuplicateKeys(text) };
}

const layerOf = (map, name) => map.modules?.[name]?.layer;

export function buildPlan(model, map, duplicateKeys = []) {
  const declUnits = model.units.filter((u) => u.kind === "declaration");
  const names = declUnits.flatMap((u) => u.names);
  const owner = new Map();
  const unmapped = [];
  for (const nm of names) {
    const m = map.declarations?.[nm];
    if (m === undefined) unmapped.push(nm);
    else owner.set(nm, m);
  }
  const nameSet = new Set(names);
  const stale = Object.keys(map.declarations ?? {}).filter((nm) => !nameSet.has(nm));
  const doubleMapped = duplicateKeys.filter((d) => d.path === "declarations");
  const unknownModules = [...new Set([...owner.values()].filter((m) => map.modules?.[m] === undefined))];
  const splitUnits = declUnits.filter((u) => new Set(u.names.map((nm) => owner.get(nm))).size > 1).map((u) => u.name);
  const unitModule = (u) => (u.kind === "declaration" ? owner.get(u.name) : u.kind === "statement" ? "facade" : null);

  const edges = new Map();
  const consumers = new Map();
  for (const u of model.units) {
    const from = unitModule(u);
    if (from === null || from === undefined) continue;
    for (const ref of u.idents) {
      const to = owner.get(ref);
      if (to === undefined || to === from || u.names.includes(ref)) continue;
      const key = `${from}->${to}`;
      if (!edges.has(key)) edges.set(key, { from, to, names: new Map() });
      const edge = edges.get(key);
      edge.names.set(ref, (edge.names.get(ref) ?? false) || !u.locals.has(ref));
      if (!consumers.has(ref)) consumers.set(ref, new Set());
      consumers.get(ref).add(from);
    }
  }
  const baseExported = new Set(declUnits.filter((u) => u.exported).flatMap((u) => u.names));
  const mapped = names.length - unmapped.length;
  return {
    owner,
    unmapped,
    stale,
    doubleMapped,
    unknownModules,
    splitUnits,
    unitModule,
    edges: [...edges.values()].map((e) => ({
      from: e.from,
      to: e.to,
      names: [...e.names.keys()].sort(),
      shadowOnly: [...e.names.values()].every((certain) => !certain),
    })),
    needsExport: (name) => baseExported.has(name) || (consumers.get(name)?.size ?? 0) > 0,
    baseExported,
    declarationCount: names.length,
    line: `${names.length} declarations at base, ${mapped} mapped, ${unmapped.length} unmapped, ${doubleMapped.length} double-mapped`,
  };
}

function planProblems(plan) {
  const problems = [];
  if (plan.unmapped.length) problems.push(`unmapped declarations: ${plan.unmapped.join(", ")}`);
  if (plan.stale.length) problems.push(`map entries without a base declaration: ${plan.stale.join(", ")}`);
  if (plan.doubleMapped.length) problems.push(`double-mapped declarations: ${plan.doubleMapped.map((d) => d.key).join(", ")}`);
  if (plan.unknownModules.length) problems.push(`declarations mapped to undeclared modules: ${plan.unknownModules.join(", ")}`);
  if (plan.splitUnits.length) problems.push(`one declaration statement mapped to several modules: ${plan.splitUnits.join(", ")}`);
  return problems;
}

// ---------------------------------------------------------------------------------------
// Whitelisted transforms and extraction
// ---------------------------------------------------------------------------------------

function rebaseRelative(rel, sourceDir, targetDir) {
  if (sourceDir === targetDir) return rel;
  const out = posix.relative(targetDir, posix.join(sourceDir, rel)) || ".";
  return out.startsWith(".") ? out : `./${out}`;
}

function isMetaUrlAt(tokens, k) {
  return isId(tokens[k], "import") && isP(tokens[k + 1], ".") && isId(tokens[k + 2], "meta") && isP(tokens[k + 3], ".") && isId(tokens[k + 4], "url");
}

/** Transform (b): rebase the import.meta.url specifier of a unit from sourceDir to targetDir. */
function transformedBody(model, unit, sourceDir, targetDir) {
  const { tokens } = model;
  const edits = [];
  let sites = 0;
  for (let k = unit.tokA; k <= unit.tokB; k++) {
    if (!isMetaUrlAt(tokens, k)) continue;
    sites++;
    const at = (o) => tokens[k + o];
    let str = null;
    if (isP(at(-1), ",") && at(-2)?.t === "str" && isP(at(-3), "(") && isId(at(-4), "URL") && isId(at(-5), "new") && isP(at(5), ")")) str = at(-2);
    else if (isP(at(-1), "(") && isId(at(-2), "fileURLToPath") && isP(at(-3), "(") && isId(at(-4), "dirname") && isP(at(5), ")") && isP(at(6), ")") && isP(at(7), ",") && at(8)?.t === "str" && isP(at(9), ")")) str = at(8);
    if (str === null) {
      if (sourceDir === targetDir) continue;
      throw new Error(`import.meta.url in an unrecognised position in '${unit.name ?? unit.body.slice(0, 40)}'; the depth transform cannot be proven`);
    }
    const rel = str.v.slice(1, -1);
    if (!rel.startsWith(".")) throw new Error(`import.meta.url specifier '${rel}' is not relative`);
    edits.push({ at: str.s + 1 - unit.bodyStart, length: rel.length, text: rebaseRelative(rel, sourceDir, targetDir) });
  }
  let body = unit.body;
  for (const e of edits.reverse()) body = body.slice(0, e.at) + e.text + body.slice(e.at + e.length);
  return { body, sites };
}

function rewriteSpecifier(spec, sourceDir, targetDir) {
  return spec.startsWith(".") ? rebaseRelative(spec, sourceDir, targetDir) : spec;
}

const moduleFilePath = (map, name) => (name === "facade" ? map.facade : posix.join(map.moduleDir, `${name}.mjs`));
const moduleDirOf = (map, name) => (name === "facade" ? posix.dirname(map.facade) : map.moduleDir);

function moduleUnits(model, plan, name) {
  return model.units.filter((u) => plan.unitModule(u) === name);
}

/** Computed import surface (transform (c)) of one module. */
function moduleImports(model, map, plan, name) {
  const sourceDir = posix.dirname(map.source);
  const targetDir = moduleDirOf(map, name);
  const units = moduleUnits(model, plan, name);
  const used = new Set(units.flatMap((u) => [...u.idents]));
  const groups = new Map();
  for (const imp of model.imports) {
    const spec = rewriteSpecifier(imp.specifier, sourceDir, targetDir);
    for (const b of imp.bindings) {
      if (!used.has(b.local)) continue;
      if (!groups.has(spec)) groups.set(spec, { default: null, namespace: null, named: [] });
      const g = groups.get(spec);
      if (b.imported === "default") g.default = b.local;
      else if (b.imported === "*") g.namespace = b.local;
      else {
        const text = b.imported === b.local ? b.local : `${b.imported} as ${b.local}`;
        if (!g.named.includes(text)) g.named.push(text);
      }
    }
  }
  const external = [];
  for (const [spec, g] of groups) {
    const clause = [g.default, g.named.length ? `{ ${g.named.join(", ")} }` : null].filter(Boolean).join(", ");
    if (clause) external.push({ specifier: spec, text: `import ${clause} from "${spec}";`, bindings: [g.default, ...g.named].filter(Boolean) });
    if (g.namespace) external.push({ specifier: spec, text: `import * as ${g.namespace} from "${spec}";`, bindings: [`* as ${g.namespace}`] });
  }
  const siblings = new Map();
  for (const edge of plan.edges.filter((e) => e.from === name)) siblings.set(edge.to, edge.names);
  const siblingLines = [...siblings.entries()]
    .sort(([a], [b]) => (layerOf(map, a) - layerOf(map, b)) || (a < b ? -1 : 1))
    .map(([to, names]) => {
      const rel = posix.relative(targetDir, moduleFilePath(map, to));
      return `import { ${names.join(", ")} } from "${rel.startsWith(".") ? rel : `./${rel}`}";`;
    });
  return { external, siblings, siblingLines };
}

function moduleHeader(model, map, name) {
  const lines = [];
  if (name === "facade" && model.source.startsWith("#!")) lines.push(model.source.slice(0, model.source.indexOf("\n")));
  lines.push("// SPDX-License-Identifier: SUL-1.0");
  if (name === "facade") lines.push(...(map.facadeHeader ?? []));
  else lines.push(`// Guard module "${name}" (layer ${layerOf(map, name)}), split out of ${posix.basename(map.source)}; declarations moved verbatim (s2-guard-split-plan.md).`);
  return `${lines.join("\n")}\n`;
}

export function extractModule(model, map, moduleName) {
  if (map.modules?.[moduleName] === undefined) throw new Error(`unknown module '${moduleName}'`);
  const plan = buildPlan(model, map);
  const problems = planProblems(plan);
  if (problems.length) throw new Error(problems.join("; "));
  const sourceDir = posix.dirname(map.source);
  const targetDir = moduleDirOf(map, moduleName);
  const units = moduleUnits(model, plan, moduleName);
  let importMetaSites = 0;
  const chunks = units.map((u) => {
    const { body, sites } = transformedBody(model, u, sourceDir, targetDir);
    importMetaSites += sites;
    return u.kind === "declaration" ? `${u.lead}${plan.needsExport(u.name) ? "export " : ""}${body}` : `${u.lead}${body}`;
  });
  const imports = moduleImports(model, map, plan, moduleName);
  const reexports = [];
  if (moduleName === "facade") {
    const byModule = new Map();
    for (const u of model.units) {
      if (u.kind !== "declaration" || !u.exported) continue;
      const to = plan.owner.get(u.name);
      if (to === "facade") continue;
      if (!byModule.has(to)) byModule.set(to, []);
      byModule.get(to).push(...u.names);
    }
    for (const [to, names] of [...byModule.entries()].sort(([a], [b]) => (layerOf(map, a) - layerOf(map, b)) || (a < b ? -1 : 1))) {
      const rel = posix.relative(targetDir, moduleFilePath(map, to));
      reexports.push(`export { ${names.sort().join(", ")} } from "${rel.startsWith(".") ? rel : `./${rel}`}";`);
    }
  }
  const sections = [[...imports.external.map((e) => e.text), ...imports.siblingLines].join("\n"), reexports.join("\n"), chunks.join("\n\n")].filter(Boolean);
  const text = `${moduleHeader(model, map, moduleName)}\n${sections.join("\n\n")}\n`;
  return {
    text,
    declarations: units.filter((u) => u.kind === "declaration").length,
    statements: units.filter((u) => u.kind === "statement").length,
    importMetaSites,
    bytes: Buffer.byteLength(text),
  };
}

// ---------------------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------------------

const snippet = (text, at) => text.slice(Math.max(0, at - 30), at + 70);
function firstDifference(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

export function checkModules(model, map, files, options = {}) {
  const plan = buildPlan(model, map, options.duplicateKeys ?? []);
  const sourceDir = posix.dirname(map.source);
  const result = {
    schema: "pipeline.guard-split-check.v1",
    base: map.baseSha,
    source: map.source,
    completeness: plan.line,
    mapProblems: planProblems(plan),
    modules: {},
    misses: [],
    duplicates: [],
    diffs: [],
    misplaced: [],
    extras: [],
    notYetExtracted: [],
    verbatimDeclarations: 0,
    verbatimStatements: 0,
    importMetaSites: 0,
  };
  const found = new Map();
  const baseStatements = model.units.filter((u) => u.kind === "statement");
  for (const name of Object.keys(map.modules)) {
    const text = files[name];
    if (text === undefined || text === null) {
      result.modules[name] = { status: "not-yet-extracted", expected: model.units.filter((u) => u.kind === "declaration" && plan.owner.get(u.name) === name).length };
      result.notYetExtracted.push(name);
      continue;
    }
    const targetDir = moduleDirOf(map, name);
    const header = moduleHeader(model, map, name);
    let rest = text;
    if (text.startsWith(header)) rest = text.slice(header.length);
    else result.diffs.push({ module: name, name: null, kind: "header-diff", expected: header.slice(0, 120), actual: text.slice(0, 120) });
    let parsed;
    try {
      parsed = scanSource(rest);
    } catch (error) {
      result.diffs.push({ module: name, name: null, kind: "parse-error", message: error.message });
      result.modules[name] = { status: "present", parseError: true };
      continue;
    }
    const expectedUnits = model.units.filter((u) => u.kind === "declaration" && plan.owner.get(u.name) === name);
    const actualDecls = parsed.units.filter((u) => u.kind === "declaration");
    const seenHere = new Set();
    let verbatim = 0;
    for (const a of actualDecls) {
      for (const nm of a.names) {
        if (!found.has(nm)) found.set(nm, []);
        found.get(nm).push(name);
        seenHere.add(nm);
      }
      const base = model.units.find((u) => u.kind === "declaration" && u.name === a.name);
      if (base === undefined) { result.extras.push({ module: name, name: a.name, kind: "unknown-declaration" }); continue; }
      if (plan.owner.get(base.name) !== name) { result.misplaced.push({ module: name, name: a.name, expectedModule: plan.owner.get(base.name) }); continue; }
      const expected = base.lead + transformedBody(model, base, sourceDir, targetDir).body;
      const actual = a.lead + a.body;
      if (expected === actual) verbatim++;
      else {
        const at = firstDifference(expected, actual);
        result.diffs.push({ module: name, name: a.name, kind: "byte-diff", offset: at, expected: snippet(expected, at), actual: snippet(actual, at) });
      }
    }
    for (const u of expectedUnits) if (!u.names.every((nm) => seenHere.has(nm))) result.misses.push({ module: name, name: u.name });
    const sites = expectedUnits.reduce((sum, u) => sum + transformedBody(model, u, sourceDir, targetDir).sites, 0);
    let statementsOk = 0;
    const actualStatements = parsed.units.filter((u) => u.kind === "statement");
    if (name === "facade") {
      baseStatements.forEach((b, i) => {
        const a = actualStatements[i];
        if (a !== undefined && a.lead + a.body === b.lead + b.body) statementsOk++;
        else result.diffs.push({ module: name, name: null, kind: "statement-diff", index: i, expected: (b.lead + b.body).slice(0, 120), actual: a === undefined ? null : (a.lead + a.body).slice(0, 120) });
      });
      for (let i = baseStatements.length; i < actualStatements.length; i++) result.extras.push({ module: name, name: null, kind: "unknown-statement", index: i });
    } else {
      for (const s of actualStatements) result.extras.push({ module: name, name: null, kind: "statement-outside-facade", text: s.body.slice(0, 80) });
    }
    result.verbatimDeclarations += verbatim;
    result.verbatimStatements += statementsOk;
    result.importMetaSites += sites;
    result.modules[name] = { status: "present", expected: expectedUnits.length, found: actualDecls.length, verbatim, importMetaSites: sites };
  }
  for (const [nm, where] of found) if (where.length > 1) result.duplicates.push({ name: nm, modules: where });
  result.ok =
    result.mapProblems.length === 0 &&
    ["misses", "duplicates", "diffs", "misplaced", "extras"].every((k) => result[k].length === 0) &&
    (options.complete !== true || result.notYetExtracted.length === 0);
  return result;
}

// ---------------------------------------------------------------------------------------
// graph
// ---------------------------------------------------------------------------------------

function stronglyConnected(nodes, adjacency) {
  let index = 0;
  const stack = [];
  const on = new Set();
  const idx = new Map();
  const low = new Map();
  const comps = [];
  const visit = (v) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    on.add(v);
    for (const w of adjacency.get(v) ?? []) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); on.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1) comps.push(comp.sort());
    }
  };
  for (const v of nodes) if (!idx.has(v)) visit(v);
  return comps;
}

export function checkGraph(model, map, duplicateKeys = []) {
  const plan = buildPlan(model, map, duplicateKeys);
  const modules = Object.keys(map.modules);
  const adjacency = new Map(modules.map((m) => [m, []]));
  for (const e of plan.edges) adjacency.get(e.from)?.push(e.to);
  const backEdges = plan.edges.filter((e) => !(layerOf(map, e.to) < layerOf(map, e.from)));
  const cycles = stronglyConnected(modules, adjacency);
  const surface = {};
  for (const name of modules) {
    const imports = moduleImports(model, map, plan, name);
    const declUnits = model.units.filter((u) => u.kind === "declaration" && plan.owner.get(u.name) === name);
    surface[name] = {
      layer: layerOf(map, name),
      declarations: declUnits.length,
      exports: declUnits.filter((u) => plan.needsExport(u.name)).flatMap((u) => u.names).sort(),
      importsFrom: Object.fromEntries(plan.edges.filter((e) => e.from === name).map((e) => [e.to, e.names])),
      externalSpecifiers: imports.external.map((e) => e.specifier),
    };
  }
  const problems = planProblems(plan);
  const ok = problems.length === 0 && backEdges.length === 0 && cycles.length === 0;
  return {
    schema: "pipeline.guard-split-graph.v1",
    base: map.baseSha,
    ok,
    completeness: plan.line,
    problems,
    edges: plan.edges,
    backEdges,
    cycles,
    modules: surface,
    summary: `graph: ${modules.length} modules (incl. facade), ${plan.edges.length} edges, ${backEdges.length} back-edges, ${cycles.length} cycles, ${plan.unmapped.length} unmapped -> ${ok ? "OK" : "FAIL"}`,
  };
}

// ---------------------------------------------------------------------------------------
// export-surface and command line
// ---------------------------------------------------------------------------------------

export async function exportSurface(file) {
  const ns = await import(pathToFileURL(resolvePath(file)).href);
  return Object.keys(ns).sort().map((name) => ({ name, type: typeof ns[name] }));
}

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument '${a}'`);
    const key = a.slice(2);
    if (key === "complete") opts.complete = true;
    else {
      if (args[i + 1] === undefined || args[i + 1].startsWith("--")) throw new Error(`--${key} needs a value`);
      opts[key] = args[++i];
    }
  }
  return opts;
}

function need(opts, key) {
  if (opts[key] === undefined) throw new Error(`--${key} is required`);
  return opts[key];
}

function readBase(repo, sha, path) {
  const shown = spawnSync("git", ["-C", repo, "show", `${sha}:${path}`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (shown.error !== undefined || shown.status !== 0) throw new Error(`git show ${sha}:${path} failed: ${shown.error?.message ?? shown.stderr.trim()}`);
  return shown.stdout;
}

function writeOut(file, text) {
  mkdirSync(dirname(resolvePath(file)), { recursive: true });
  writeFileSync(file, text);
}

export async function main(argv) {
  const [mode, ...rest] = argv;
  if (mode === undefined || !["extract", "check", "graph", "export-surface", "list"].includes(mode)) {
    console.error("usage: guard-split-map.mjs <extract|check|graph|export-surface|list> [options] (see the file header)");
    return 2;
  }
  const opts = parseArgs(rest);
  if (mode === "export-surface") {
    const surface = await exportSurface(need(opts,"file"));
    const lines = surface.map((s) => `${s.name}\t${s.type}`);
    if (opts.out) writeOut(opts.out, `${lines.join("\n")}\n`);
    console.log(lines.join("\n"));
    console.log(`export-surface: ${surface.length} exports, sha256 ${createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16)}`);
    return 0;
  }
  const repo = opts.repo ?? resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const base = need(opts,"base");
  if (mode === "list") {
    const listed = scanSource(readBase(repo, base, opts.source ?? DEFAULT_SOURCE));
    for (const u of listed.units) {
      if (u.kind === "import") continue;
      console.log(`${u.line}\t${u.endLine}\t${u.kind === "declaration" ? u.declKind : u.kind}\t${u.exported ? "export" : "-"}\t${u.endLine - u.line + 1}\t${u.names.length ? u.names.join(",") : u.body.slice(0, 50)}`);
    }
    return 0;
  }
  const mapPath = opts.map ?? join(repo, DEFAULT_MAP);
  const { map, duplicateKeys } = parseMap(readFileSync(mapPath, "utf8"));
  const model = scanSource(readBase(repo, base, map.source));

  if (mode === "extract") {
    const name = need(opts,"module");
    const out = extractModule(model, map, name);
    writeOut(need(opts,"out"), out.text);
    console.log(`extract: ${name} -> ${opts.out} (${out.declarations} declarations, ${out.statements} statements, ${out.importMetaSites} import.meta.url sites, ${out.bytes} bytes)`);
    return 0;
  }
  if (mode === "graph") {
    const result = checkGraph(model, map, duplicateKeys);
    console.log(result.completeness);
    for (const [name, s] of Object.entries(result.modules)) {
      const from = Object.entries(s.importsFrom).map(([m, n]) => `${m}:${n.length}`).join(" ");
      console.log(`  ${name} (L${s.layer}): ${s.declarations} decls, ${s.exports.length} exports, imports [${from}], ${s.externalSpecifiers.length} external specifiers`);
    }
    for (const e of result.backEdges) console.log(`  BACK-EDGE ${e.from} -> ${e.to}${e.shadowOnly ? " (shadow-candidate only)" : ""}: ${e.names.join(", ")}`);
    for (const c of result.cycles) console.log(`  CYCLE ${c.join(" <-> ")}`);
    for (const p of result.problems) console.log(`  PROBLEM ${p}`);
    console.log(result.summary);
    if (opts.out) writeOut(opts.out, `${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }
  // check
  const dir = resolvePath(need(opts,"dir"));
  const tree = existsSync(join(dir, map.moduleDir));
  const files = {};
  for (const name of Object.keys(map.modules)) {
    let path;
    if (name === "facade") path = opts.facade ?? (tree ? null : join(dir, "facade.mjs"));
    else path = tree ? join(dir, map.moduleDir, `${name}.mjs`) : join(dir, `${name}.mjs`);
    if (path !== null && existsSync(path)) files[name] = readFileSync(path, "utf8");
  }
  const result = checkModules(model, map, files, { complete: opts.complete === true, duplicateKeys });
  result.layout = tree ? "tree" : "flat";
  console.log(result.completeness);
  for (const [name, m] of Object.entries(result.modules)) {
    console.log(`  ${name}: ${m.status}${m.status === "present" ? ` ${m.verbatim ?? 0}/${m.expected ?? 0} verbatim` : ` (${m.expected} declarations)`}`);
  }
  for (const k of ["misses", "duplicates", "diffs", "misplaced", "extras"]) for (const item of result[k]) console.log(`  ${k.toUpperCase()}: ${JSON.stringify(item)}`);
  for (const p of result.mapProblems) console.log(`  PROBLEM ${p}`);
  console.log(
    `check: ${result.ok ? "OK" : "FAIL"} -- ${result.verbatimDeclarations} declarations and ${result.verbatimStatements} statements byte-identical (${result.importMetaSites} import.meta.url sites), ` +
      `${result.misses.length} missing, ${result.duplicates.length} duplicate, ${result.diffs.length} different, ${result.misplaced.length} misplaced, ${result.extras.length} unknown, ${result.notYetExtracted.length} modules not yet extracted`,
  );
  if (opts.out) writeOut(opts.out, `${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => { console.error(`guard-split-map: ${error.message}`); process.exitCode = 2; },
  );
}
