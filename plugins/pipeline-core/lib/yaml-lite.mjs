// SPDX-License-Identifier: SUL-1.0
/**
 * yaml-lite.mjs -- strict-subset YAML parser, no library dependency.
 *
 * DEPENDENCY-FREE LIBRARY (plugins/pipeline-core/lib/): the only node built-in used is
 * node:fs (parseYamlFile's readFileSync) -- parseYaml() itself is pure string-in,
 * value-out. New file: a dedup search found no existing YAML/
 * JSON-schema/git-command utility anywhere in this repo to extend instead (no `yaml`/
 * `js-yaml` dependency, no lib/ directory, no prior parser) -- confirmed via repo-wide
 * grep for "yaml", "js-yaml", "require(...yaml", "from ['\"]yaml" before writing this.
 *
 * SUPPORTED GRAMMAR (strict subset -- loud rejection of everything else, see below)
 *   - Block-style maps: `key: value`, 2-space indent per nesting level.
 *   - Block-style lists: `- ` prefix (scalar items or map items); a list item that
 *     itself opens with `key: value` starts a map whose sibling keys are the
 *     subsequent lines aligned to the column right after "- ".
 *   - Scalars: strings, booleans (`true`/`false`, `True`/`False`, `TRUE`/`FALSE`),
 *     integers (`-?[0-9]+`). Quoted strings (single or double) may contain `:` and
 *     `#` -- quoting always forces the string type, no bool/int coercion.
 *   - Comments: `#` outside quotes runs to end of line; `#` inside a quoted string is
 *     literal content, never stripped.
 *   - Literal empty flow collections: `[]` and `{}` only.
 *
 * THIS IS A LIBRARY: it always throws YamlLiteError on anything outside the grammar
 * above -- fail-open/closed is entirely the CALLER's decision, never this module's.
 * Loudly rejected (never silently misparsed):
 *   - Anchors (`&name`), aliases (`*name`), tags (`!tag`/`!!type`).
 *   - Block scalars: literal (`|`) and folded (`>`) indicators.
 *   - Flow collections beyond the empty literals (`[1, 2]`, `{a: 1}`, ...).
 *   - Multi-document markers (`---` / `...`) at column 0.
 *   - Tab characters in indentation.
 *   - Duplicate keys within the same mapping.
 *
 * Every error is a YamlLiteError carrying `{ line, message }` (1-based source line).
 */

import { readFileSync } from "node:fs";

export class YamlLiteError extends Error {
  constructor(line, message) {
    super(`line ${line}: ${message}`);
    this.name = "YamlLiteError";
    this.line = line;
  }
}

// ---------------------------------------------------------------------------------------------
// Quote-aware scanning helpers. All three functions share the same little state machine:
// track whether we are inside a single- or double-quoted run, honoring `\"` escapes inside
// double quotes and doubled `''` escapes inside single quotes, so `:`/`#` inside quotes are
// never mistaken for structural characters.
// ---------------------------------------------------------------------------------------------

/** Strip an unquoted `#...` comment tail. Throws on an unterminated quoted string. */
function stripUnquotedComment(str, lineNo) {
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      if (quote === '"' && ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && str[i + 1] === "'") {
          i++;
          continue;
        }
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#") {
      return str.slice(0, i).replace(/[ \t]+$/, "");
    }
  }
  if (quote) {
    throw new YamlLiteError(lineNo, `unterminated ${quote === '"' ? "double" : "single"}-quoted string`);
  }
  return str;
}

/** Index of the first unquoted `:` that is followed by whitespace or end-of-string, or -1. */
function findTopLevelColon(str) {
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      if (quote === '"' && ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && str[i + 1] === "'") {
          i++;
          continue;
        }
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ":" && (i + 1 >= str.length || str[i + 1] === " ")) return i;
  }
  return -1;
}

const FORBIDDEN_PREFIX_RE = /^[&*!|>]/;
const FORBIDDEN_PREFIX_NAME = {
  "&": "anchor (&...)",
  "*": "alias (*...)",
  "!": "tag (!... / !!...)",
  "|": "literal block scalar (|)",
  ">": "folded block scalar (>)",
};

function rejectForbiddenConstruct(token, lineNo) {
  const m = token.match(FORBIDDEN_PREFIX_RE);
  if (m) {
    const marker = m[0];
    throw new YamlLiteError(
      lineNo,
      `unsupported YAML construct ${JSON.stringify(marker)} -- ${FORBIDDEN_PREFIX_NAME[marker]} is not part of the yaml-lite strict subset`,
    );
  }
}

/** Parses a full single- or double-quoted scalar token; throws if malformed or trailing. */
function parseQuotedScalar(token, lineNo) {
  const q = token[0];
  let i = 1;
  let closingIdx = -1;
  while (i < token.length) {
    const ch = token[i];
    if (q === '"' && ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === q) {
      if (q === "'" && token[i + 1] === "'") {
        i += 2;
        continue;
      }
      closingIdx = i;
      break;
    }
    i++;
  }
  if (closingIdx === -1) {
    throw new YamlLiteError(lineNo, `unterminated ${q === '"' ? "double" : "single"}-quoted scalar`);
  }
  if (closingIdx !== token.length - 1) {
    throw new YamlLiteError(lineNo, `unexpected content after closing quote: ${JSON.stringify(token)}`);
  }
  let inner = token.slice(1, closingIdx);
  inner = q === '"' ? inner.replace(/\\(.)/g, (_, c) => c) : inner.replace(/''/g, "'");
  return inner;
}

/** Key text is always a string -- unquote it if quoted, otherwise use as-is. */
function coerceKey(rawKey, lineNo) {
  rejectForbiddenConstruct(rawKey, lineNo);
  if (rawKey[0] === '"' || rawKey[0] === "'") return parseQuotedScalar(rawKey, lineNo);
  return rawKey;
}

/** Value text: quoted -> string; else bool/int coercion; else plain string. */
function coerceScalarValue(valueText, lineNo) {
  rejectForbiddenConstruct(valueText, lineNo);
  if (valueText === "[]") return [];
  if (valueText === "{}") return {};
  if (valueText[0] === "[" || valueText[0] === "{") {
    throw new YamlLiteError(lineNo, "flow-style collections are not supported (only empty [] / {} literals are)");
  }
  if (valueText[0] === '"' || valueText[0] === "'") return parseQuotedScalar(valueText, lineNo);
  if (valueText === "true" || valueText === "True" || valueText === "TRUE") return true;
  if (valueText === "false" || valueText === "False" || valueText === "FALSE") return false;
  if (/^-?[0-9]+$/.test(valueText)) return parseInt(valueText, 10);
  return valueText;
}

/** Splits "key: value" (value possibly empty) on the first top-level colon, or null. */
function splitKeyValue(text, lineNo) {
  const idx = findTopLevelColon(text);
  if (idx === -1) return null;
  const rawKey = text.slice(0, idx).trim();
  const rawValue = text.slice(idx + 1).trim();
  if (rawKey === "") throw new YamlLiteError(lineNo, "empty mapping key");
  return { key: coerceKey(rawKey, lineNo), valueText: rawValue };
}

function isListItemLine(text) {
  return text === "-" || text.startsWith("- ");
}

// ---------------------------------------------------------------------------------------------
// Tokenization: raw text -> array of { indent, text, lineNo }, comments/blank lines dropped,
// tabs-in-indentation and multi-doc markers rejected loudly.
// ---------------------------------------------------------------------------------------------

function tokenizeLines(text) {
  const rawLines = text.split(/\r\n|\r|\n/);
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const lineNo = i + 1;
    const raw = rawLines[i];
    const leading = raw.match(/^[ \t]*/)[0];
    if (leading.includes("\t")) {
      throw new YamlLiteError(lineNo, "tab characters are not allowed in indentation -- use spaces only");
    }
    const indent = leading.length;
    let rest = stripUnquotedComment(raw.slice(indent), lineNo);
    rest = rest.replace(/[ \t]+$/, "");
    if (rest === "") continue; // blank or comment-only line
    if (indent === 0 && (rest === "---" || rest === "...")) {
      throw new YamlLiteError(lineNo, "multi-document YAML (--- / ... markers) is not supported");
    }
    lines.push({ indent, text: rest, lineNo });
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Recursive-descent block parser over the tokenized line array.
// ---------------------------------------------------------------------------------------------

/** Resolves a key's value: either an inline scalar, or a nested block on deeper-indented lines. */
function resolveEntryValue(lines, cursor, indentForNested, valueText, lineNo) {
  if (valueText !== "") return coerceScalarValue(valueText, lineNo);
  if (cursor.pos < lines.length && lines[cursor.pos].indent > indentForNested) {
    return parseNode(lines, cursor, lines[cursor.pos].indent);
  }
  return null;
}

function parseMapping(lines, cursor, indent) {
  const map = {};
  const seenKeys = new Set();
  while (cursor.pos < lines.length && lines[cursor.pos].indent === indent && !isListItemLine(lines[cursor.pos].text)) {
    const line = lines[cursor.pos];
    const kv = splitKeyValue(line.text, line.lineNo);
    if (!kv) throw new YamlLiteError(line.lineNo, `expected a "key: value" mapping entry, got: ${JSON.stringify(line.text)}`);
    if (seenKeys.has(kv.key)) throw new YamlLiteError(line.lineNo, `duplicate key ${JSON.stringify(kv.key)}`);
    seenKeys.add(kv.key);
    cursor.pos++;
    map[kv.key] = resolveEntryValue(lines, cursor, indent, kv.valueText, line.lineNo);
  }
  return map;
}

function parseSequence(lines, cursor, indent) {
  const result = [];
  while (cursor.pos < lines.length && lines[cursor.pos].indent === indent && isListItemLine(lines[cursor.pos].text)) {
    const line = lines[cursor.pos];
    const rest = line.text === "-" ? "" : line.text.slice(2);
    if (rest.trim() === "") {
      cursor.pos++;
      if (cursor.pos < lines.length && lines[cursor.pos].indent > indent) {
        result.push(parseNode(lines, cursor, lines[cursor.pos].indent));
      } else {
        result.push(null);
      }
      continue;
    }
    const kv = splitKeyValue(rest, line.lineNo);
    if (kv) {
      // The item opens a map inline (after "- "); its virtual key column is 2 past the dash.
      const mapIndent = line.indent + 2;
      const map = {};
      const seenKeys = new Set([kv.key]);
      cursor.pos++;
      map[kv.key] = resolveEntryValue(lines, cursor, mapIndent, kv.valueText, line.lineNo);
      while (cursor.pos < lines.length && lines[cursor.pos].indent === mapIndent && !isListItemLine(lines[cursor.pos].text)) {
        const sibling = lines[cursor.pos];
        const kv2 = splitKeyValue(sibling.text, sibling.lineNo);
        if (!kv2) {
          throw new YamlLiteError(sibling.lineNo, `expected a "key: value" mapping entry, got: ${JSON.stringify(sibling.text)}`);
        }
        if (seenKeys.has(kv2.key)) throw new YamlLiteError(sibling.lineNo, `duplicate key ${JSON.stringify(kv2.key)}`);
        seenKeys.add(kv2.key);
        cursor.pos++;
        map[kv2.key] = resolveEntryValue(lines, cursor, mapIndent, kv2.valueText, sibling.lineNo);
      }
      result.push(map);
    } else {
      result.push(coerceScalarValue(rest, line.lineNo));
      cursor.pos++;
    }
  }
  return result;
}

function parseNode(lines, cursor, indent) {
  const line = lines[cursor.pos];
  if (line.indent !== indent) {
    throw new YamlLiteError(line.lineNo, `bad indentation: expected ${indent} space(s), got ${line.indent}`);
  }
  return isListItemLine(line.text) ? parseSequence(lines, cursor, indent) : parseMapping(lines, cursor, indent);
}

/**
 * Parses a yaml-lite document from a string. Returns the parsed value (object, array, string,
 * boolean, number, or null for an empty document). Throws YamlLiteError on any construct
 * outside the strict subset (see file header) -- never silently misparses.
 */
export function parseYaml(text) {
  const lines = tokenizeLines(String(text));
  if (lines.length === 0) return null;

  // A single non-list, non-"key: value" top-level line is a bare scalar document.
  if (lines.length === 1 && lines[0].indent === 0 && !isListItemLine(lines[0].text)) {
    const kv = splitKeyValue(lines[0].text, lines[0].lineNo);
    if (!kv) return coerceScalarValue(lines[0].text, lines[0].lineNo);
  }

  if (lines[0].indent !== 0) {
    throw new YamlLiteError(lines[0].lineNo, `top-level content must start at column 0, got indent ${lines[0].indent}`);
  }
  const cursor = { pos: 0 };
  const value = parseNode(lines, cursor, 0);
  if (cursor.pos !== lines.length) {
    const leftover = lines[cursor.pos];
    throw new YamlLiteError(
      leftover.lineNo,
      `bad indentation or unexpected content after the top-level block: ${JSON.stringify(leftover.text)}`,
    );
  }
  return value;
}

/** Reads `path` as utf8 and parses it as a yaml-lite document (see parseYaml). */
export function parseYamlFile(path) {
  return parseYaml(readFileSync(path, "utf8"));
}
