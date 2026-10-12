// SPDX-License-Identifier: SUL-1.0
/**
 * FANOUT slice S1: the slice-queue library.
 *
 * Design: specs/sprint-alfred-epic/design/fanout-enforcement-design.md sections 3.1
 * (queue format), 3.5 (`validateSliceQueue`) and 6 (row "S1 queue lib").
 *
 * PURE: no hook wiring, no CLI, no private state. The only I/O is
 * `loadSliceQueue` reading one file, and that reader is injectable. Protected
 * patterns and any protected-path inventory are INJECTED, never read here.
 *
 * Settled interpretations (Elephant-approved, applied exactly):
 *   - Scopes are repo-relative, backslash-normalised and case-folded on win32/darwin
 *     only. A queue that is valid on linux but collides under folding gets a
 *     `SQ-WARN-CASEFOLD` warning there. Absolute, drive, UNC, home and `..` scopes
 *     are refused (`SQ-SCOPE`). Brace expansion and globstar are supported;
 *     a character class is over-approximated as ONE arbitrary character. A trailing
 *     slash marks a directory; a literal last segment without a dot is a directory
 *     prefix. Overlap is decided by exact language intersection of the segment
 *     patterns, so every doubt resolves toward "overlaps" (the safe direction).
 *   - Terminal slices (caller-supplied `terminalIds`, plus declared `cancelled`)
 *     are ignored by the overlap, monolith, protected and commit rules. They are NOT
 *     ignored by the schema, shared-surface and tier rules, which are properties of
 *     the queue text rather than of what runs concurrently.
 *   - `readyAndLive` takes injected records, ledger-live ids and heartbeats, in
 *     shapes compatible with fanout-ledger.mjs `liveSlices`/`staleSlices`. A
 *     terminal record ends liveness; a silent live slice is NEVER freed (it stays
 *     live and is listed in `silent`). Default attempt cap: 2.
 *
 * Judgement calls where the design is silent (strictest reading chosen):
 *   - The schema is closed: an unknown key is `SQ-SCHEMA`, so a typo such as
 *     `dependson` cannot silently drop an ordering edge.
 *   - A leading dot is not an extension dot: `.claude` is a directory prefix, while
 *     `.eslintrc.json` stays one file. (Literal reading would make `.claude` a file.)
 *   - Un-ordered means "neither reaches the other in the dependency DAG", computed
 *     over ALL slices, so an ordering that runs through a terminal slice still counts.
 *   - "Verify scope" for the test-heavy warning = a test-looking path in writeScope
 *     or readScope (the queue format has no dedicated verify field).
 *   - The default critical-path and shared-surface lists are conservative defaults;
 *     both are overridable (`criticalPathPatterns`, `sharedSurfaces`).
 */
import { readFileSync, statSync } from "node:fs";

import { isSafeTaskId, isTerminalOutcome } from "./dispatch-record.mjs";

export const SLICE_QUEUE_SCHEMA = "pipeline.slice-queue.v1";
export const SLICE_STATES = Object.freeze(["ready", "hold-po", "blocked-external", "deferred", "cancelled"]);
export const SLICE_TIERS = Object.freeze(["mechanic", "implementor", "deep", "critic"]);
export const COMMIT_MODES = Object.freeze(["host-commit", "worktree", "diff-only", "self-commit"]);
export const LOAD_CLASSES = Object.freeze(["light", "test-heavy"]);
export const DEFAULT_MAX_ATTEMPTS = 2;
/** Same value as fanout-ledger.mjs `DEFAULT_STALE_AFTER_MINUTES` (pinned by a test). */
export const DEFAULT_STALE_AFTER_MINUTES = 20;
/** Outcomes (normalised) of a terminal record that did NOT deliver: the slice returns to ready with attempts+1. */
export const HANDBACK_OUTCOMES = Object.freeze(["partial", "completed-no-delivery", "stopped-without-commit", "failed", "aborted", "error"]);
export const HANDBACK_CLASSIFICATIONS = Object.freeze(["completed-undelivered", "stopped-without-commit"]);
/** Files only the Elephant writes after slices land (ADR-0080 PSP-1 denylist, made concrete). */
export const DEFAULT_SHARED_SURFACES = Object.freeze([
  "docs/state.md",
  "docs/state-archive/",
  "docs/adr/README.md",
  "backlog/index.json",
  "backlog/STATUS.md",
  "backlog/transitions*.ndjson",
  "docs/*handover*",
  "specs/*/*handover*",
  "specs/*/*acceptance-matrix*",
  "specs/*/*tracking-matrix*",
]);
/** Paths whose slice needs a critic follow-up slice (hook / guard / security / architecture). */
export const DEFAULT_CRITICAL_PATH_PATTERNS = Object.freeze([
  "(^|/)hooks?/",
  "(^|/)guard[^/]*",
  "(^|/)security[^/]*",
  "(^|/)architecture[^/]*",
]);

const MINUTE_MS = 60_000;
const MAX_QUEUE_BYTES = 1024 * 1024;
const MAX_SCOPE_LENGTH = 512;
const MAX_ALTERNATIVES = 64;
const GLOB_CHARS = /[*?[]/u;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;
const FEATURE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const TEST_LOOKING = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[a-z0-9]+$/iu;
const TOP_KEYS = new Set(["schema", "feature", "defaults", "limits", "monoliths", "slices"]);
const DEFAULT_KEYS = new Set(["commitMode", "tier", "loadClass"]);
const LIMIT_KEYS = new Set(["deadline", "maxAttemptsPerSlice"]);
const SLICE_KEYS = new Set(["id", "title", "state", "holdReason", "dependsOn", "writeScope", "readScope", "tier", "tierReason", "commitMode", "loadClass", "briefing", "estimatedToolCalls"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isSliceId = (value) => isSafeTaskId(value) && value.length <= 128 && !value.includes("..");
const isLine = (value) => typeof value === "string" && value.trim() !== "" && value.length <= 300 && !CONTROL_CHARS.test(value);
const foldsCase = (platform) => platform === "win32" || platform === "darwin";
const parseTime = (value) => (typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : Number.NaN);

function resolveNow(now) {
  const value = now === undefined ? Date.now() : typeof now === "function" ? now() : now;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("now must be a finite millisecond timestamp or a function returning one");
  return value;
}
function toIdList(value) {
  if (typeof value === "string") return [value];
  if (value === null || value === undefined || typeof value[Symbol.iterator] !== "function") return [];
  return [...value].filter((item) => typeof item === "string");
}

// ------------------------------------------------------------------ scopes

function classEnd(chars, index) {
  let cursor = index + 1;
  if (chars[cursor] === "!" || chars[cursor] === "^") cursor += 1;
  if (chars[cursor] === "]") cursor += 1;
  for (; cursor < chars.length; cursor += 1) if (chars[cursor] === "]") return cursor;
  return -1;
}
function bracketsClosed(segment) {
  const chars = Array.from(segment);
  for (let index = 0; index < chars.length; index += 1) {
    if (chars[index] !== "[") continue;
    const end = classEnd(chars, index);
    if (end < 0) return false;
    index = end;
  }
  return true;
}
function splitBraceTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
/** `{a,b}` expands, nests, and a group without a top-level comma stays literal. Bounded. */
function expandBraces(text) {
  let depth = 0;
  let open = -1;
  let close = -1;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "{") {
      if (depth === 0) open = index;
      depth += 1;
    } else if (ch === "}") {
      if (depth === 0) return { error: "unbalanced closing brace" };
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (open === -1) return { values: [text] };
  if (close === -1) return { error: "unterminated brace group" };
  const rest = expandBraces(text.slice(close + 1));
  if (rest.error) return rest;
  const inner = text.slice(open + 1, close);
  const parts = splitBraceTopLevel(inner);
  const middle = [];
  if (parts.length === 1) {
    const nested = expandBraces(inner);
    if (nested.error) return nested;
    for (const value of nested.values) middle.push(`{${value}}`);
  } else {
    for (const part of parts) {
      const expanded = expandBraces(part);
      if (expanded.error) return expanded;
      middle.push(...expanded.values);
    }
  }
  if (middle.length * rest.values.length > MAX_ALTERNATIVES) return { error: `scope expands to more than ${MAX_ALTERNATIVES} alternatives` };
  const prefix = text.slice(0, open);
  const values = [];
  for (const head of middle) for (const tail of rest.values) values.push(`${prefix}${head}${tail}`);
  return { values };
}
function normalizeAlternative(alt) {
  if (alt.trim() === "") return { error: "scope has an empty alternative" };
  if (alt.startsWith("/")) return { error: "absolute scopes are refused (scopes are repo-relative)" };
  if (alt.startsWith("~")) return { error: "home-relative scopes are refused" };
  if (alt.includes(":")) return { error: "drive letters, URLs and stream names are refused" };
  const trailing = alt.endsWith("/");
  const segments = alt.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) return { error: "parent-directory segments are refused" };
  if (!segments.every(bracketsClosed)) return { error: "unterminated character class" };
  if (segments.length === 0) return { value: "./" };
  return { value: `${segments.join("/")}${trailing ? "/" : ""}` };
}

/**
 * Canonicalises ONE declared scope. Returns `{ ok: true, alternatives }` (brace
 * expansion can yield several canonical patterns, a directory keeps its trailing
 * slash, the repository root is `./`) or `{ ok: false, code: "SQ-SCOPE", reason }`.
 * Options: `{ platform?, foldCase? }`; case-folds on win32/darwin unless overridden.
 */
export function normalizeScope(raw, options = {}) {
  const failure = (reason) => ({ ok: false, code: "SQ-SCOPE", reason, alternatives: [] });
  const fold = options.foldCase ?? foldsCase(options.platform ?? process.platform);
  if (typeof raw !== "string") return failure("scope must be a string");
  let text = raw.trim();
  if (text === "") return failure("scope is empty");
  if (text.length > MAX_SCOPE_LENGTH) return failure("scope is too long");
  if (CONTROL_CHARS.test(text)) return failure("scope contains control characters");
  text = text.replaceAll("\\", "/");
  if (fold) text = text.normalize("NFC").toLowerCase();
  const expanded = expandBraces(text);
  if (expanded.error) return failure(expanded.error);
  const alternatives = [];
  for (const alt of expanded.values) {
    const normalized = normalizeAlternative(alt);
    if (normalized.error) return failure(normalized.error);
    if (!alternatives.includes(normalized.value)) alternatives.push(normalized.value);
  }
  return { ok: true, alternatives };
}

const isDirLike = (last) => !GLOB_CHARS.test(last) && last.indexOf(".", 1) === -1;
function compileAlternative(canonical) {
  if (canonical === "./") return { canonical, segments: ["**"], literal: false, dir: true };
  const parts = canonical.split("/").filter((segment) => segment !== "");
  const last = parts[parts.length - 1];
  const dir = canonical.endsWith("/") || isDirLike(last);
  return { canonical, segments: dir && last !== "**" ? [...parts, "**"] : parts, literal: !GLOB_CHARS.test(canonical), dir };
}
function compileScopes(input, options) {
  const compiled = [];
  for (const raw of Array.isArray(input) ? input : [input]) {
    const normalized = normalizeScope(raw, options);
    if (!normalized.ok) return null;
    for (const alt of normalized.alternatives) compiled.push(compileAlternative(alt));
  }
  return compiled;
}
function segmentTokens(segment) {
  const chars = Array.from(segment);
  const tokens = [];
  for (let index = 0; index < chars.length; index += 1) {
    const ch = chars[index];
    if (ch === "*") {
      if (tokens[tokens.length - 1] !== "*") tokens.push("*");
    } else if (ch === "?") tokens.push("?");
    else if (ch === "[") {
      const end = classEnd(chars, index);
      if (end < 0) tokens.push("[");
      else {
        tokens.push("?");
        index = end;
      }
    } else tokens.push(ch);
  }
  return tokens;
}
/** Can some single path segment satisfy BOTH patterns? (`*` = any run, `?`/class = one character.) */
function segmentsIntersect(a, b) {
  if (!GLOB_CHARS.test(a) && !GLOB_CHARS.test(b)) return a === b;
  const x = segmentTokens(a);
  const y = segmentTokens(b);
  const memo = new Map();
  const walk = (i, j) => {
    const key = `${i}:${j}`;
    if (memo.has(key)) return memo.get(key);
    let result;
    if (i === x.length && j === y.length) result = true;
    else if (i < x.length && x[i] === "*") result = walk(i + 1, j) || (j < y.length && walk(i, j + 1));
    else if (j < y.length && y[j] === "*") result = walk(i, j + 1) || (i < x.length && walk(i + 1, j));
    else if (i === x.length || j === y.length) result = false;
    else result = (x[i] === "?" || y[j] === "?" || x[i] === y[j]) && walk(i + 1, j + 1);
    memo.set(key, result);
    return result;
  };
  return walk(0, 0);
}
/** Can some path satisfy BOTH segment sequences? (`**` = zero or more segments.) */
function sequencesIntersect(a, b) {
  const memo = new Map();
  const walk = (i, j) => {
    const key = `${i}:${j}`;
    if (memo.has(key)) return memo.get(key);
    let result;
    if (i === a.length && j === b.length) result = true;
    else if (i < a.length && a[i] === "**") result = walk(i + 1, j) || (j < b.length && walk(i, j + 1));
    else if (j < b.length && b[j] === "**") result = walk(i, j + 1) || (i < a.length && walk(i + 1, j));
    else if (i === a.length || j === b.length) result = false;
    else result = segmentsIntersect(a[i], b[j]) && walk(i + 1, j + 1);
    memo.set(key, result);
    return result;
  };
  return walk(0, 0);
}
function findOverlap(left, right) {
  for (const l of left) for (const r of right) if (sequencesIntersect(l.segments, r.segments)) return { left: l.canonical, right: r.canonical };
  return null;
}

/**
 * Do two scopes (or two lists of scopes) share a path? Both sides are normalised
 * with `options` (`platform`/`foldCase`). An invalid scope cannot be judged, so the
 * answer is `true`: when in doubt, it overlaps.
 */
export function scopesOverlap(a, b, options = {}) {
  const left = compileScopes(a, options);
  const right = compileScopes(b, options);
  if (left === null || right === null) return true;
  return findOverlap(left, right) !== null;
}

// ------------------------------------------------------------------ protected flag

function splitRegexTopLevel(source) {
  const parts = [];
  let depth = 0;
  let inClass = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === "\\") index += 1;
    else if (inClass) {
      if (ch === "]") inClass = false;
    } else if (ch === "[") inClass = true;
    else if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "|" && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}
function matchingParen(source, openIndex) {
  let depth = 0;
  let inClass = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === "\\") index += 1;
    else if (inClass) {
      if (ch === "]") inClass = false;
    } else if (ch === "[") inClass = true;
    else if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
/** Literal prefixes every match of the regex must start with (one per top-level alternative). `[""]` = unknown. */
function regexLiteralPrefixes(source) {
  const parts = splitRegexTopLevel(source);
  if (parts.length > 1) return parts.flatMap(regexLiteralPrefixes);
  const body = source.startsWith("^") ? source.slice(1) : source;
  if (body.startsWith("(")) {
    const close = matchingParen(body, 0);
    if (close < 0) return [""];
    let inner = body.slice(1, close);
    if (inner.startsWith("?:")) inner = inner.slice(2);
    else if (inner.startsWith("?")) return [""];
    if (["?", "*", "{"].includes(body[close + 1])) return [""];
    return splitRegexTopLevel(inner).flatMap(regexLiteralPrefixes);
  }
  let out = "";
  for (let index = 0; index < body.length; index += 1) {
    const ch = body[index];
    if (ch === "\\") {
      const next = body[index + 1];
      if (next !== undefined && !/[A-Za-z0-9]/u.test(next)) {
        out += next;
        index += 1;
        continue;
      }
      break;
    }
    if (ch === "?" || ch === "*" || ch === "{") {
      out = out.slice(0, -1);
      break;
    }
    if ("[](){}|.+$^".includes(ch)) break;
    out += ch;
  }
  return [out];
}
function staticPrefix(alt) {
  if (alt.canonical === "./") return "";
  const glob = alt.canonical.search(GLOB_CHARS);
  if (glob !== -1) return alt.canonical.slice(0, glob);
  return alt.canonical.endsWith("/") ? alt.canonical : `${alt.canonical}/`;
}

/** Compiles injected protected patterns / inventory once; `check(compiledAlternatives)` answers per slice. */
function buildProtectedMatcher(options) {
  const platform = options.platform ?? process.platform;
  const fold = options.foldCase ?? foldsCase(platform);
  const patterns = [];
  const inventory = [];
  const invalid = [];
  (Array.isArray(options.protectedPatterns) ? options.protectedPatterns : []).forEach((item, index) => {
    const id = isObject(item) && !(item instanceof RegExp) && typeof item.id === "string" ? item.id : `pattern-${index + 1}`;
    const source = item instanceof RegExp ? item.source : isObject(item) ? item.pattern : item;
    let regex = null;
    if (typeof source === "string") {
      for (const flags of fold ? ["iu", "i"] : ["u", ""]) {
        try {
          regex = new RegExp(source, flags);
          break;
        } catch { /* try the next flag set */ }
      }
    }
    if (regex === null) invalid.push(id);
    else patterns.push({ id, regex, prefixes: regexLiteralPrefixes(source).map((prefix) => (fold ? prefix.toLowerCase() : prefix)) });
  });
  (Array.isArray(options.protectedPaths) ? options.protectedPaths : []).forEach((item, index) => {
    const compiled = compileScopes(item, { platform, foldCase: fold });
    if (compiled === null) invalid.push(`inventory-${index + 1}`);
    else inventory.push(...compiled);
  });
  return {
    invalid,
    checked: patterns.length > 0 || inventory.length > 0,
    check(alternatives) {
      const matches = [];
      for (const alt of alternatives) {
        const exactFile = alt.literal && !alt.dir;
        const prefix = staticPrefix(alt);
        for (const pattern of patterns) {
          const hit = pattern.regex.test(alt.canonical)
            || (!exactFile && pattern.prefixes.some((candidate) => candidate.startsWith(prefix) || prefix.startsWith(candidate)));
          if (hit) matches.push({ scope: alt.canonical, via: "pattern", id: pattern.id });
        }
        for (const entry of inventory) {
          if (sequencesIntersect(alt.segments, entry.segments)) matches.push({ scope: alt.canonical, via: "inventory", id: entry.canonical });
        }
      }
      return { protected: matches.length > 0, matches };
    },
  };
}

/**
 * Is a slice (an object with `writeScope`, or a bare list of scopes) protected?
 * Injected: `protectedPatterns` (regex sources, RegExp, or `{ id, pattern }`) and
 * `protectedPaths` (concrete inventory). A literal file is matched exactly; a glob
 * or directory is flagged when it may contain a path some pattern accepts (literal
 * prefix over-approximation). Returns `{ protected, matches, checked }`.
 */
export function protectedFlag(slice, options = {}) {
  const scopes = Array.isArray(slice) ? slice : isObject(slice) && Array.isArray(slice.writeScope) ? slice.writeScope : [];
  const matcher = buildProtectedMatcher(options);
  const compiled = compileScopes(scopes, options);
  if (compiled === null) return { protected: true, matches: [{ scope: null, via: "unjudgeable", id: null }], checked: matcher.checked };
  return { ...matcher.check(compiled), checked: matcher.checked };
}

// ------------------------------------------------------------------ validation

/**
 * Validates a parsed queue (design 3.5). Options: `platform`, `terminalIds`,
 * `protectedPatterns`, `protectedPaths`, `sharedSurfaces`, `criticalPathPatterns`.
 * Returns `{ ok, errors, warnings, queue }`; `queue` is the normalized form when `ok`.
 * Every error/warning is `{ code, message, sliceId?, slices?, ... }`.
 */
export function validateSliceQueue(input, options = {}) {
  const errors = [];
  const warnings = [];
  const err = (code, message, extra = {}) => errors.push({ code, message, ...extra });
  const warn = (code, message, extra = {}) => warnings.push({ code, message, ...extra });
  const done = () => ({ ok: errors.length === 0, errors, warnings, queue: errors.length === 0 ? normalizedQueue : null });
  let normalizedQueue = null;
  const platform = options.platform ?? process.platform;
  const scopeOptions = { platform };
  const foldedOptions = { platform, foldCase: true };
  const terminalIds = new Set(toIdList(options.terminalIds));

  if (!isObject(input)) {
    err("SQ-SCHEMA", "queue must be a JSON object");
    return done();
  }
  for (const key of Object.keys(input)) if (!TOP_KEYS.has(key)) err("SQ-SCHEMA", `unknown top-level key ${JSON.stringify(key).slice(0, 40)}`);
  if (input.schema !== SLICE_QUEUE_SCHEMA) err("SQ-SCHEMA", `schema must be ${SLICE_QUEUE_SCHEMA}`);
  if (typeof input.feature !== "string" || !FEATURE.test(input.feature)) err("SQ-SCHEMA", "feature must be a short safe token");

  const defaults = { commitMode: undefined, tier: undefined, loadClass: "light" };
  if (input.defaults !== undefined) {
    if (!isObject(input.defaults)) err("SQ-SCHEMA", "defaults must be an object");
    else {
      for (const key of Object.keys(input.defaults)) if (!DEFAULT_KEYS.has(key)) err("SQ-SCHEMA", `unknown defaults key ${JSON.stringify(key).slice(0, 40)}`);
      for (const [key, allowed] of [["commitMode", COMMIT_MODES], ["tier", SLICE_TIERS], ["loadClass", LOAD_CLASSES]]) {
        const value = input.defaults[key];
        if (value === undefined) continue;
        if (allowed.includes(value)) defaults[key] = value;
        else err("SQ-SCHEMA", `defaults.${key} must be one of ${allowed.join("|")}`);
      }
    }
  }
  const limits = { deadline: null, maxAttemptsPerSlice: null };
  if (input.limits !== undefined) {
    if (!isObject(input.limits)) err("SQ-SCHEMA", "limits must be an object");
    else {
      for (const key of Object.keys(input.limits)) if (!LIMIT_KEYS.has(key)) err("SQ-SCHEMA", `unknown limits key ${JSON.stringify(key).slice(0, 40)}`);
      const { deadline, maxAttemptsPerSlice } = input.limits;
      if (deadline !== undefined && deadline !== null) {
        if (typeof deadline === "string" && ISO_UTC.test(deadline) && Number.isFinite(Date.parse(deadline))) limits.deadline = deadline;
        else err("SQ-SCHEMA", "limits.deadline must be an ISO-8601 UTC timestamp");
      }
      if (maxAttemptsPerSlice !== undefined) {
        if (Number.isSafeInteger(maxAttemptsPerSlice) && maxAttemptsPerSlice >= 1 && maxAttemptsPerSlice <= 10) limits.maxAttemptsPerSlice = maxAttemptsPerSlice;
        else err("SQ-SCHEMA", "limits.maxAttemptsPerSlice must be an integer from 1 to 10");
      }
    }
  }
  const monoliths = [];
  if (input.monoliths !== undefined) {
    if (!Array.isArray(input.monoliths)) err("SQ-SCHEMA", "monoliths must be a list of scopes");
    else {
      for (const raw of input.monoliths) {
        const compiled = compileScopes(raw, scopeOptions);
        if (compiled === null) err("SQ-SCOPE", `monolith ${JSON.stringify(raw)?.slice(0, 60)} is not a usable repo-relative scope`);
        else monoliths.push({ raw, compiled });
      }
    }
  }
  if (!Array.isArray(input.slices)) {
    err("SQ-SCHEMA", "slices must be a list");
    return done();
  }

  // ---- per-slice fields
  const entries = [];
  const byId = new Map();
  input.slices.forEach((raw, index) => {
    if (!isObject(raw)) {
      err("SQ-SCHEMA", `slice #${index} must be an object`);
      return;
    }
    if (!isSliceId(raw.id)) {
      err("SQ-ID", `slice #${index} has no safe id`);
      return;
    }
    const id = raw.id;
    if (byId.has(id)) {
      err("SQ-ID", `duplicate slice id ${id}`, { sliceId: id });
      return;
    }
    for (const key of Object.keys(raw)) if (!SLICE_KEYS.has(key)) err("SQ-SCHEMA", `slice ${id}: unknown key ${JSON.stringify(key).slice(0, 40)}`, { sliceId: id });
    if (!isLine(raw.title)) err("SQ-SCHEMA", `slice ${id}: title must be one non-empty line`, { sliceId: id });
    const state = SLICE_STATES.includes(raw.state) ? raw.state : null;
    if (state === null) err("SQ-SCHEMA", `slice ${id}: state must be one of ${SLICE_STATES.join("|")}`, { sliceId: id });
    const holdReason = typeof raw.holdReason === "string" && raw.holdReason.trim() !== "" ? raw.holdReason : null;
    if (state !== null && state !== "ready" && holdReason === null) err("SQ-HOLD-REASON", `slice ${id}: state ${state} needs a holdReason`, { sliceId: id });
    if (state === "ready" && raw.holdReason !== undefined && raw.holdReason !== null) err("SQ-HOLD-REASON", `slice ${id}: a ready slice must not carry a holdReason`, { sliceId: id });

    let dependsOn = [];
    if (raw.dependsOn !== undefined) {
      if (Array.isArray(raw.dependsOn) && raw.dependsOn.every((dep) => typeof dep === "string")) dependsOn = [...new Set(raw.dependsOn)];
      else err("SQ-SCHEMA", `slice ${id}: dependsOn must be a list of slice ids`, { sliceId: id });
    }
    const readScopes = (field, required) => {
      const value = raw[field];
      if (value === undefined && !required) return [];
      if (!Array.isArray(value)) {
        err("SQ-SCHEMA", `slice ${id}: ${field} must be a list of scopes`, { sliceId: id });
        return [];
      }
      return value;
    };
    const writeScope = readScopes("writeScope", true);
    const readScope = readScopes("readScope", false);
    const compiledOf = (scopes, field, opts, report = true) => {
      const compiled = [];
      for (const scope of scopes) {
        const one = compileScopes(scope, opts);
        if (one === null) {
          if (report) err("SQ-SCOPE", `slice ${id}: ${field} entry ${JSON.stringify(scope)?.slice(0, 60)} is not a usable repo-relative scope`, { sliceId: id });
        } else compiled.push(...one);
      }
      return compiled;
    };
    const compiled = compiledOf(writeScope, "writeScope", scopeOptions);
    const compiledFolded = compiledOf(writeScope, "writeScope", foldedOptions, false);
    const compiledRead = compiledOf(readScope, "readScope", scopeOptions);

    const pick = (field, allowed, code) => {
      const value = raw[field] ?? defaults[field];
      if (value === undefined) {
        err("SQ-SCHEMA", `slice ${id}: ${field} is missing and no default is declared`, { sliceId: id });
        return null;
      }
      if (!allowed.includes(value)) {
        err(code, `slice ${id}: ${field} must be one of ${allowed.join("|")}`, { sliceId: id });
        return null;
      }
      return value;
    };
    const tier = pick("tier", SLICE_TIERS, "SQ-TIER");
    const commitMode = pick("commitMode", COMMIT_MODES, "SQ-SCHEMA");
    const loadClass = pick("loadClass", LOAD_CLASSES, "SQ-SCHEMA");
    const tierReason = typeof raw.tierReason === "string" && raw.tierReason.trim() !== "" ? raw.tierReason : null;
    if ((tier === "deep" || tier === "critic") && tierReason === null) err("SQ-TIER", `slice ${id}: tier ${tier} needs a tierReason`, { sliceId: id });

    let briefingRef = null;
    if (raw.briefing !== undefined) {
      if (!isObject(raw.briefing) || Object.keys(raw.briefing).some((key) => key !== "ref") || typeof raw.briefing.ref !== "string") {
        err("SQ-SCHEMA", `slice ${id}: briefing must be { "ref": "<repo-relative path>" }`, { sliceId: id });
      } else if (!normalizeScope(raw.briefing.ref, scopeOptions).ok) {
        err("SQ-SCOPE", `slice ${id}: briefing.ref is not a usable repo-relative path`, { sliceId: id });
      } else briefingRef = raw.briefing.ref;
    }
    let estimatedToolCalls = null;
    if (raw.estimatedToolCalls !== undefined) {
      if (Number.isSafeInteger(raw.estimatedToolCalls) && raw.estimatedToolCalls >= 1 && raw.estimatedToolCalls <= 10_000) estimatedToolCalls = raw.estimatedToolCalls;
      else err("SQ-SCHEMA", `slice ${id}: estimatedToolCalls must be a positive integer`, { sliceId: id });
    }

    const entry = {
      id,
      title: typeof raw.title === "string" ? raw.title : "",
      state,
      holdReason,
      dependsOn,
      writeScope: writeScope.filter((scope) => typeof scope === "string").map((scope) => scope.trim()),
      readScope: readScope.filter((scope) => typeof scope === "string").map((scope) => scope.trim()),
      scopes: [...new Set(compiled.map((alt) => alt.canonical))],
      tier,
      tierReason,
      commitMode,
      loadClass,
      briefingRef,
      estimatedToolCalls,
      terminal: terminalIds.has(id) || state === "cancelled",
      protected: false,
      protectedMatches: [],
      compiled,
      compiledFolded,
      readCanonical: compiledRead.map((alt) => alt.canonical),
    };
    byId.set(id, entry);
    entries.push(entry);
  });

  // ---- dependencies: unknown ids, then cycles
  const graph = new Map();
  for (const entry of entries) {
    for (const dep of entry.dependsOn) if (!byId.has(dep)) err("SQ-DEP-UNKNOWN", `slice ${entry.id} depends on unknown slice ${dep}`, { sliceId: entry.id, dependency: dep });
    graph.set(entry.id, entry.dependsOn.filter((dep) => byId.has(dep)));
  }
  const color = new Map();
  const stack = [];
  const visit = (id) => {
    color.set(id, 1);
    stack.push(id);
    for (const dep of graph.get(id)) {
      const state = color.get(dep) ?? 0;
      if (state === 1) {
        const cycle = [...stack.slice(stack.indexOf(dep)), dep];
        err("SQ-DEP-CYCLE", `dependency cycle ${cycle.join(" -> ")}`, { cycle, slices: [...new Set(cycle)] });
      } else if (state === 0) visit(dep);
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const entry of entries) if ((color.get(entry.id) ?? 0) === 0) visit(entry.id);
  const ancestors = new Map();
  for (const entry of entries) {
    const seen = new Set();
    const todo = [...graph.get(entry.id)];
    while (todo.length > 0) {
      const dep = todo.pop();
      if (seen.has(dep)) continue;
      seen.add(dep);
      todo.push(...graph.get(dep));
    }
    ancestors.set(entry.id, seen);
  }
  const ordered = (a, b) => ancestors.get(a).has(b) || ancestors.get(b).has(a);
  const active = entries.filter((entry) => !entry.terminal);
  const unorderedPairs = (candidates) => {
    const pairs = [];
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) if (!ordered(candidates[i].id, candidates[j].id)) pairs.push([candidates[i], candidates[j]]);
    }
    return pairs;
  };

  // ---- SQ-OVERLAP (+ case-fold warning on case-sensitive platforms)
  for (const [a, b] of unorderedPairs(active)) {
    const hit = findOverlap(a.compiled, b.compiled);
    if (hit !== null) {
      err("SQ-OVERLAP", `un-ordered slices ${a.id} and ${b.id} overlap (${hit.left} / ${hit.right}); order them with dependsOn or split the scope`, { slices: [a.id, b.id], scopes: [hit.left, hit.right] });
    } else if (!foldsCase(platform)) {
      const folded = findOverlap(a.compiledFolded, b.compiledFolded);
      if (folded !== null) warn("SQ-WARN-CASEFOLD", `slices ${a.id} and ${b.id} are disjoint here but collide where paths fold case (${folded.left} / ${folded.right})`, { slices: [a.id, b.id], scopes: [folded.left, folded.right] });
    }
  }
  // ---- SQ-MONOLITH
  for (const monolith of monoliths) {
    const holders = active.filter((entry) => entry.compiled.length > 0 && findOverlap(entry.compiled, monolith.compiled) !== null).map((entry) => entry.id);
    if (holders.length > 1) err("SQ-MONOLITH", `monolith ${monolith.raw} is written by more than one non-terminal slice (${holders.join(", ")})`, { monolith: monolith.raw, slices: holders });
  }
  // ---- SQ-SHARED-SURFACE
  const surfaces = [];
  for (const surface of options.sharedSurfaces ?? DEFAULT_SHARED_SURFACES) {
    const compiled = compileScopes(surface, scopeOptions);
    if (compiled === null) warn("SQ-WARN-SHARED-SURFACE", `shared surface ${JSON.stringify(surface)?.slice(0, 60)} is not a usable scope and was skipped`);
    else surfaces.push(...compiled);
  }
  for (const entry of entries) {
    for (const alt of entry.compiled) {
      const hit = findOverlap([alt], surfaces);
      if (hit !== null) err("SQ-SHARED-SURFACE", `slice ${entry.id} writes ${hit.left}, which covers the shared surface ${hit.right}; only the Elephant writes it`, { sliceId: entry.id, scope: hit.left, surface: hit.right });
    }
  }
  // ---- SQ-PROTECTED
  const matcher = buildProtectedMatcher({ ...options, platform });
  for (const entry of entries) {
    const flag = matcher.check(entry.compiled);
    entry.protected = flag.protected;
    entry.protectedMatches = flag.matches;
  }
  for (const [a, b] of unorderedPairs(active.filter((entry) => entry.protected))) {
    err("SQ-PROTECTED", `protected slices ${a.id} and ${b.id} are un-ordered; bundle them into one package or sequence them with dependsOn`, { slices: [a.id, b.id] });
  }
  // ---- SQ-COMMIT
  for (const [a, b] of unorderedPairs(active.filter((entry) => entry.commitMode === "self-commit"))) {
    err("SQ-COMMIT", `self-commit slices ${a.id} and ${b.id} are un-ordered; at most one self-committing slice may run at a time`, { slices: [a.id, b.id] });
  }
  // ---- SQ-TIER: critical paths need a critic follow-up (transitively dependent, not cancelled)
  const criticalSources = options.criticalPathPatterns ?? DEFAULT_CRITICAL_PATH_PATTERNS;
  const critical = [];
  for (const source of criticalSources) {
    try {
      critical.push(new RegExp(source, "iu"));
    } catch {
      warn("SQ-WARN-CRITICAL-PATTERN", `critical-path pattern ${JSON.stringify(source)?.slice(0, 60)} is not a valid regular expression and was skipped`);
    }
  }
  const critics = entries.filter((entry) => entry.tier === "critic" && entry.state !== "cancelled");
  for (const entry of entries) {
    if (entry.tier === "critic" || entry.state === "cancelled") continue;
    const touched = entry.compiled.find((alt) => critical.some((regex) => regex.test(alt.canonical)));
    if (touched === undefined) continue;
    if (!critics.some((critic) => ancestors.get(critic.id).has(entry.id))) {
      err("SQ-TIER", `slice ${entry.id} touches ${touched.canonical} (hook/guard/security/architecture) and needs a critic follow-up slice that depends on it`, { sliceId: entry.id, scope: touched.canonical });
    }
  }
  // ---- warnings (non-terminal slices only)
  for (const entry of active) {
    if (entry.estimatedToolCalls !== null && entry.estimatedToolCalls > 40) warn("SQ-WARN-TOOLCALLS", `slice ${entry.id} estimates ${entry.estimatedToolCalls} tool calls (> 40, near the ~50-call cliff)`, { sliceId: entry.id });
    if (entry.writeScope.length > 8) warn("SQ-WARN-SCOPE-SIZE", `slice ${entry.id} declares ${entry.writeScope.length} write-scope entries (> 8)`, { sliceId: entry.id });
    if (entry.briefingRef === null) warn("SQ-WARN-NO-BRIEFING", `slice ${entry.id} has no briefing ref`, { sliceId: entry.id });
    if (entry.loadClass === "test-heavy" && ![...entry.scopes, ...entry.readCanonical].some((path) => TEST_LOOKING.test(path))) {
      warn("SQ-WARN-NO-VERIFY", `test-heavy slice ${entry.id} names no test file in its write or read scope`, { sliceId: entry.id });
    }
  }
  for (const id of matcher.invalid) warn("SQ-WARN-PROTECTED-PATTERN", `protected pattern/inventory entry ${id} is not usable and was skipped`);
  if (!matcher.checked) warn("SQ-WARN-PROTECTED-UNCHECKED", "no protected patterns or inventory were injected; protected slices cannot be flagged");

  normalizedQueue = {
    schema: SLICE_QUEUE_SCHEMA,
    feature: input.feature,
    defaults: { commitMode: defaults.commitMode ?? null, tier: defaults.tier ?? null, loadClass: defaults.loadClass },
    limits: { deadline: limits.deadline, maxAttemptsPerSlice: limits.maxAttemptsPerSlice ?? DEFAULT_MAX_ATTEMPTS },
    monoliths: monoliths.map((monolith) => monolith.raw),
    slices: entries.map(({ compiled: _compiled, compiledFolded: _folded, readCanonical: _read, ...rest }) => rest),
  };
  return done();
}

// ------------------------------------------------------------------ loading

/**
 * Reads and validates `<path>`. Never throws. Result:
 * `{ status: "absent"|"invalid"|"valid", path, raw, queue, errors, warnings, mtimeMs }`
 * where `raw` is the parsed JSON (feed it to `readyAndLive`) and `queue` the
 * normalized queue when valid. An absent file is not an error (the governor stays
 * silent); anything else that is not a valid queue is `invalid`.
 * Options: everything `validateSliceQueue` takes, plus injectable `readFile(path)`
 * and `mtimeMs(path)`.
 */
export function loadSliceQueue(path, options = {}) {
  const base = { status: "invalid", path: typeof path === "string" ? path : null, raw: null, queue: null, errors: [], warnings: [], mtimeMs: null };
  const invalid = (message) => ({ ...base, errors: [{ code: "SQ-SCHEMA", message }] });
  if (typeof path !== "string" || path === "") return invalid("queue path must be a non-empty string");
  const reader = options.readFile ?? ((target) => {
    if (statSync(target).size > MAX_QUEUE_BYTES) throw Object.assign(new Error("slice queue too large"), { code: "SQ-TOO-LARGE" });
    return readFileSync(target, "utf8");
  });
  let text;
  try {
    text = reader(path);
  } catch (error) {
    if (error?.code === "ENOENT") return { ...base, status: "absent" };
    return invalid(`slice queue is unreadable (${error?.code ?? "error"})`);
  }
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_QUEUE_BYTES) return invalid("slice queue is not text or exceeds 1 MiB");
  let mtimeMs = null;
  try {
    const value = (options.mtimeMs ?? ((target) => statSync(target).mtimeMs))(path);
    mtimeMs = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
  } catch { /* unknown mtime */ }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ...invalid("slice queue is not valid JSON"), mtimeMs };
  }
  const validation = validateSliceQueue(raw, options);
  return { ...base, status: validation.ok ? "valid" : "invalid", raw, queue: validation.queue, errors: validation.errors, warnings: validation.warnings, mtimeMs };
}

// ------------------------------------------------------------------ ready / live

const normalizeOutcome = (outcome) => outcome.trim().toLowerCase();
function isHandBack(record) {
  return HANDBACK_OUTCOMES.includes(normalizeOutcome(record.outcome))
    || HANDBACK_CLASSIFICATIONS.includes(record.outcomeClassification?.kind);
}

/**
 * Derives per-slice status from a RAW queue plus injected facts. Input:
 *   `queue`      the parsed queue (as `loadSliceQueue(...).raw`)
 *   `records`    dispatch-record-like `{ taskId, sliceId?, outcome, outcomeClassification?, mtimeMs? }`;
 *                a record belongs to `sliceId ?? taskId`
 *   `live`       ledger-live entries (`liveSlices()` shape `{ sliceId, launchedAt?, silentMinutes?, stale?, ... }`) or bare ids
 *   `heartbeats` `{ sliceId, at }` (ISO string or ms; `mtimeMs` is accepted too)
 *   `terminalIds`, `now` (ms or function)
 * Options: everything `validateSliceQueue` takes, plus `staleAfterMinutes` (default 20)
 * and `maxAttemptsPerSlice` (the queue's own `limits.maxAttemptsPerSlice` wins; default 2).
 *
 * Status per slice: `done` | `cancelled` | `live` | `held` (declared hold/defer/external,
 * or attempts exhausted) | `blocked` (dependency, or conflict with a live slice) | `ready`.
 * An invalid queue yields `valid: false` and an empty ready set.
 */
export function readyAndLive(input, options = {}) {
  const source = isObject(input) ? input : {};
  const nowMs = resolveNow(source.now ?? options.now);
  const staleAfter = typeof options.staleAfterMinutes === "number" && Number.isFinite(options.staleAfterMinutes) && options.staleAfterMinutes > 0
    ? options.staleAfterMinutes
    : DEFAULT_STALE_AFTER_MINUTES;
  const staleMs = staleAfter * MINUTE_MS;

  const recordsBySlice = new Map();
  for (const record of Array.isArray(source.records) ? source.records : []) {
    if (!isObject(record) || typeof record.outcome !== "string") continue;
    const key = typeof record.sliceId === "string" ? record.sliceId : record.taskId;
    if (!isSafeTaskId(key)) continue;
    recordsBySlice.set(key, [...(recordsBySlice.get(key) ?? []), record]);
  }
  const doneIds = new Set([...toIdList(options.terminalIds), ...toIdList(source.terminalIds)]);
  for (const [id, records] of recordsBySlice) {
    if (records.some((record) => isTerminalOutcome(record.outcome) && !isHandBack(record))) doneIds.add(id);
  }

  const validation = validateSliceQueue(source.queue, { ...options, terminalIds: [...doneIds] });
  const counts = { ready: 0, live: 0, done: 0, held: 0, blocked: 0, cancelled: 0 };
  const result = { valid: validation.ok, errors: validation.errors, warnings: validation.warnings, slices: [], ready: [], live: [], silent: [], held: [], blocked: [], foreignLive: [], counts };
  if (!validation.ok) return result;

  const queue = validation.queue;
  const queueDeclaresCap = source.queue.limits?.maxAttemptsPerSlice !== undefined;
  const optionCap = Number.isSafeInteger(options.maxAttemptsPerSlice) && options.maxAttemptsPerSlice >= 1 ? options.maxAttemptsPerSlice : DEFAULT_MAX_ATTEMPTS;
  const maxAttempts = queueDeclaresCap ? queue.limits.maxAttemptsPerSlice : optionCap;
  const ledgerLive = new Map();
  for (const item of Array.isArray(source.live) ? source.live : []) {
    const id = typeof item === "string" ? item : item?.sliceId;
    if (typeof id === "string") ledgerLive.set(id, isObject(item) ? item : {});
  }
  const beats = new Map();
  for (const item of Array.isArray(source.heartbeats) ? source.heartbeats : []) {
    const at = parseTime(item?.at ?? item?.mtimeMs ?? item?.lastActivityAt);
    if (typeof item?.sliceId === "string" && Number.isFinite(at)) beats.set(item.sliceId, Math.max(beats.get(item.sliceId) ?? -Infinity, at));
  }
  const knownIds = new Set(queue.slices.map((entry) => entry.id));
  result.foreignLive = [...ledgerLive.keys()].filter((id) => !knownIds.has(id));

  const summaries = new Map();
  const liveIds = [];
  // pass 1: cancelled, done, live
  for (const entry of queue.slices) {
    const records = recordsBySlice.get(entry.id) ?? [];
    const terminalRecords = records.filter((record) => isTerminalOutcome(record.outcome));
    const openRecords = records.filter((record) => !isTerminalOutcome(record.outcome));
    const attempts = terminalRecords.filter(isHandBack).length;
    const summary = {
      id: entry.id, title: entry.title, status: null, reasons: [], waitsOn: [], attempts, sources: [],
      tier: entry.tier, loadClass: entry.loadClass, commitMode: entry.commitMode, protected: entry.protected, briefingRef: entry.briefingRef,
    };
    summaries.set(entry.id, summary);
    if (entry.state === "cancelled") {
      summary.status = "cancelled";
      continue;
    }
    if (doneIds.has(entry.id)) {
      summary.status = "done";
      continue;
    }
    const terminalMs = terminalRecords.length > 0 && terminalRecords.every((record) => Number.isFinite(record.mtimeMs))
      ? Math.max(...terminalRecords.map((record) => record.mtimeMs))
      : null;
    const ledgerEntry = ledgerLive.get(entry.id);
    const beat = beats.get(entry.id);
    const sources = [];
    let ledgerCounts = ledgerEntry !== undefined;
    if (ledgerCounts && terminalRecords.length > 0) {
      const launchedMs = parseTime(ledgerEntry.launchedAt);
      ledgerCounts = terminalMs !== null && Number.isFinite(launchedMs) && launchedMs > terminalMs;
    }
    if (ledgerCounts) sources.push("ledger");
    if (openRecords.length > 0) sources.push("record");
    if (beat !== undefined && nowMs - beat <= staleMs && (terminalRecords.length === 0 || (terminalMs !== null && beat > terminalMs))) sources.push("heartbeat");
    if (sources.length === 0) continue;
    summary.status = "live";
    summary.sources = sources;
    liveIds.push(entry.id);
    let silentMinutes = null;
    let stale = false;
    if (isObject(ledgerEntry) && Number.isFinite(ledgerEntry.silentMinutes) && typeof ledgerEntry.stale === "boolean") {
      silentMinutes = ledgerEntry.silentMinutes;
      stale = ledgerEntry.stale;
    } else {
      const stamps = [parseTime(ledgerEntry?.lastActivityAt), parseTime(ledgerEntry?.launchedAt), beat ?? Number.NaN, ...openRecords.map((record) => parseTime(record.mtimeMs))].filter(Number.isFinite);
      if (stamps.length > 0) {
        const silentMs = Math.max(0, nowMs - Math.max(...stamps));
        silentMinutes = Math.round(silentMs / MINUTE_MS);
        stale = silentMs > staleMs;
      }
    }
    summary.silentMinutes = silentMinutes;
    summary.stale = stale;
    result.live.push({ sliceId: entry.id, sources, silentMinutes, stale, tier: entry.tier, loadClass: entry.loadClass, commitMode: entry.commitMode, protected: entry.protected });
    if (stale) result.silent.push({ sliceId: entry.id, silentMinutes });
  }

  // pass 2: held, blocked, ready
  const compiledScopes = (entry) => entry.scopes.map(compileAlternative);
  const byId = new Map(queue.slices.map((entry) => [entry.id, entry]));
  for (const entry of queue.slices) {
    const summary = summaries.get(entry.id);
    if (summary.status !== null) continue;
    if (entry.state !== "ready") {
      summary.status = "held";
      summary.reasons.push({ code: entry.state });
    } else if (summary.attempts >= maxAttempts) {
      summary.status = "held";
      summary.reasons.push({ code: "attempts-exhausted", attempts: summary.attempts, maxAttempts });
    } else {
      const unmet = entry.dependsOn.filter((dep) => summaries.get(dep)?.status !== "done");
      const cancelled = unmet.filter((dep) => byId.get(dep)?.state === "cancelled");
      const waiting = unmet.filter((dep) => !cancelled.includes(dep));
      summary.waitsOn = unmet;
      if (waiting.length > 0) summary.reasons.push({ code: "dependency", waitsOn: waiting });
      if (cancelled.length > 0) summary.reasons.push({ code: "dependency-cancelled", waitsOn: cancelled });
      if (unmet.length === 0) {
        const mine = compiledScopes(entry);
        const overlapping = liveIds.filter((id) => id !== entry.id && findOverlap(mine, compiledScopes(byId.get(id))) !== null);
        if (overlapping.length > 0) summary.reasons.push({ code: "scope-overlap", with: overlapping });
        const protectedLive = entry.protected ? liveIds.filter((id) => id !== entry.id && byId.get(id).protected) : [];
        if (protectedLive.length > 0) summary.reasons.push({ code: "protected-live", with: protectedLive });
        const committingLive = entry.commitMode === "self-commit" ? liveIds.filter((id) => id !== entry.id && byId.get(id).commitMode === "self-commit") : [];
        if (committingLive.length > 0) summary.reasons.push({ code: "commit-live", with: committingLive });
      }
      summary.status = summary.reasons.length > 0 ? "blocked" : "ready";
    }
  }
  for (const entry of queue.slices) {
    const summary = summaries.get(entry.id);
    result.slices.push(summary);
    counts[summary.status] += 1;
    if (summary.status === "ready") result.ready.push(entry.id);
    else if (summary.status === "held") result.held.push({ sliceId: entry.id, reasons: summary.reasons });
    else if (summary.status === "blocked") result.blocked.push({ sliceId: entry.id, reasons: summary.reasons });
  }
  return result;
}
