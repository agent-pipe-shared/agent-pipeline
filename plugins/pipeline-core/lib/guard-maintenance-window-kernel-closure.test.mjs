#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-maintenance-window-kernel-closure.test.mjs -- static invariant proving
 * `NEVER_LIFTABLE_KERNEL_PATHS` (lib/guard-maintenance-window.mjs) is transitively
 * CLOSED under first-party relative imports: for every kernel path, every module it
 * imports (recursively) via a relative specifier is ALSO a kernel path.
 *
 * WHY THIS TEST EXISTS (NVA-A7FIX-2, fixing Critic F-2 against NVA-A7FIX-1): a hand-
 * maintained enumeration keeps reproducing this exact bug shape -- a fix closes the
 * specific hole a reviewer happened to find (F-2: `critical-human-proof-policy.mjs`
 * itself imports `yaml-lite.mjs`/`runner-profiles-v3.mjs`/
 * `critical-action-approval-request.mjs`, none of which were listed) and leaves the
 * NEXT import hop open. This test makes the closure self-enforcing: it fails on ANY
 * future edit that adds an import to a kernel file without also adding the imported
 * module to the kernel list, closing the class of bug rather than one instance of it.
 *
 * SCANNER: a plain regex over `import ... from "(...)"` / `export ... from "(...)"`
 * clauses -- no AST dependency, matching this codebase's existing comfort with pure
 * string/regex logic (see git-cmd.mjs's own header). The character class between the
 * keyword and `from` is restricted to what a real import/export clause can contain
 * (identifiers, `,`, `{`, `}`, `*`, whitespace), so a non-greedy match can never skip
 * over unrelated code to a distant, unconnected `from "..."` elsewhere in the file.
 * This also makes the regex NOT anchored to one line, so a multi-line
 * `import {\n  a,\n  b,\n} from "./x.mjs";` is matched exactly like its single-line
 * form. Side-effect-only `import "./x.mjs";` (no binding, no `from`) is matched
 * separately. `node:*` builtins and bare/package specifiers are ignored (never
 * first-party, never resolvable to a repo-relative path). Only `.mjs`/`.js` kernel
 * entries are parsed for imports -- `hooks.json` and `project/critical-human-proof.json`
 * have none.
 *
 * SPAWN EDGES (pipeline.gmw-kernel-closure-test-does-not-model-spawn-edges): a kernel
 * file can also reach a first-party script through the PROCESS boundary rather than an
 * import -- `spawnSync(process.execPath, [path, ...])`. The scanner follows this shape
 * too, the same way it follows `import`/`export ... from`: it extracts the array's first
 * element and classifies it --
 *   - an IDENTIFIER is traced back through the file's own source: either a direct
 *     `const NAME = fileURLToPath(new URL("../relative/spec.mjs", import.meta.url))`
 *     script-path constant, or a simple `name = OTHER_NAME;` reassignment chased (up to
 *     8 hops) to one. The resolved relative specifier is then resolved and checked for
 *     kernel-set membership exactly like a relative import specifier.
 *   - a STRING LITERAL is checked the same way a literal import specifier already is:
 *     relative (`./`/`../`) literals become an edge, everything else (a flag like
 *     `"-e"`, a bare subcommand) is ignored -- it is not a first-party script reference.
 *   - anything else (a member expression, a call, a template literal, spread, ...) is a
 *     shape the scanner cannot classify.
 *
 * DYNAMIC IMPORT EDGES (NVA-KERNELDYN-1): a kernel file's `import("...")` whose specifier
 * is built at runtime (e.g. `import(pathToFileURL(join(PLUGIN_LIB_DIR, "manifest.mjs")).
 * href)`) cannot be traced back to a literal string the way a static `from "..."` clause
 * or a spawn-edge string-literal argument can -- there is no specifier to read. Rather than
 * fail closed on every such call forever, `DYNAMIC_IMPORT_EDGES` below is a hand-declared,
 * per-kernel-file table naming exactly which first-party modules that file's dynamic
 * imports resolve to; a declared target is folded into the walked closure exactly like a
 * static import specifier -- it still has to be a kernel path, or GMWKC01 fails on it same
 * as anything else. A kernel file with NO table entry still throws on its first `import(`
 * exactly as before (unclassified shape, resolved by hand). A file WITH an entry is also
 * checked for staleness: the number of dynamic-import call sites the source actually
 * contains must equal the table's declared count, or the check throws -- an edge added or
 * removed in the source without updating the table would otherwise silently stop being
 * covered. The call-site count deliberately requires a non-empty argument
 * (`\bimport\s*\(\s*[^)\s]`) so a *prose* mention of the `import()` operator in a comment
 * (no argument between the parens) is not miscounted as a real call site.
 *
 * COMMENT-BLANKED SCAN (NVA-V19-VERIFYHONEST, 2026-08-28): every regex above (dynamic-import
 * count, `import ... from`, side-effect `import "..."`, the spawn-edge family) runs against
 * `stripCodeComments(source)`, not the raw file text. A line comment or a block comment can
 * contain ordinary prose that happens to LOOK like code -- e.g. a docstring explaining a past
 * bug via the exact phrase `` `await import(...)` `` inside a block comment, with no code
 * behind it at all -- and a scanner reading raw source cannot tell that apart from a real
 * unclassifiable call site. `stripCodeComments` is a small state machine (code / line-comment /
 * block-comment / string), not a second independent regex pass over the same text: it walks
 * the source once, tracking which of those four states each character falls in, and blanks
 * comment characters (to spaces, preserving newlines so line-anchored regexes like
 * `SIDE_EFFECT_IMPORT_RE`'s `^...$m` still line up) while leaving code and STRING CONTENTS
 * untouched -- a literal import specifier between quotes must survive, or every downstream
 * regex loses its own input. Tracking state explicitly (rather than, say, stripping strings
 * first and comments second as two independent regex passes) is what keeps a comment
 * containing a quote and a string containing a comment-start sequence from desynchronizing
 * each other: while inside a block/line comment, a quote character is just a character (never
 * opens a string); while inside a string, a comment-start sequence is just characters (never
 * opens a comment). Only an ACTUAL dynamic import in real code -- never routed through this
 * blanking because it was never inside a comment or string span to begin with -- still throws.
 *
 * FAILS CLOSED on a shape it cannot classify: an UNDECLARED dynamic `import(` call in a
 * kernel file's source, a stale `DYNAMIC_IMPORT_EDGES` entry, an identifier passed to
 * `spawnSync(process.execPath, [...])` that cannot be statically traced to a script-path
 * constant, or any other unclassifiable first array element in that same call shape, aborts
 * this check with a named-file diagnostic instead of silently proceeding -- a
 * silently-skipped file would defeat the entire point of this test (a missed dynamic
 * import, or a missed spawn edge, is exactly the kind of hole a hand-maintained
 * enumeration already produced once).
 *
 * GMWKC03 (pipeline.gwm-kernel-doc-enumeration-diverges-from-the-code-array, 2026-08-25):
 * GMWKC01 only proves the CODE array is closed under import -- it says nothing about
 * whether `docs/guard-maintenance-window-threat-model.md`'s "Protected assets" prose
 * transcription of that array is complete. A prior dispatch found 13 code entries with
 * no mention in the doc at all, invisible to GMWKC01 because the doc isn't code. This
 * check parses the doc's own backtick-quoted `lib/`/`scripts/`/`hooks/`/`project/...`
 * path tokens out of that one section and asserts they are a SUPERSET of
 * `NEVER_LIFTABLE_KERNEL_PATHS` -- it fails on any future array addition that isn't also
 * reflected in the doc's prose, closing the class of drift rather than this one instance.
 *
 * Run: node plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { NEVER_LIFTABLE_KERNEL_PATHS, isNeverLiftableKernelPath } from "./guard-maintenance-window.mjs";

// plugins/pipeline-core/lib/ -> plugins/pipeline-core/ -> plugins/ -> <repo root>
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const IMPORT_FROM_RE = /\b(?:import|export)\s+[A-Za-z0-9_$,{}*\s]*?\bfrom\s+["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+["']([^"']+)["']\s*;?\s*$/gm;
// Requires a non-empty argument between the parens so a prose mention of the `import()`
// operator in a comment (no argument) is never counted as a real dynamic-import call site
// -- see the "DYNAMIC IMPORT EDGES" section of the file header.
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*[^)\s]/g;

/**
 * Blanks `//` line comments and `/* ... *\/` block comments out of `source`, replacing their
 * characters with spaces (newlines preserved, so line-anchored regexes keep matching real
 * code lines at the same positions) -- see the "COMMENT-BLANKED SCAN" section of the file
 * header for why this exists and why it is a single character-by-character state machine
 * rather than two independent regex passes. String and template-literal CONTENTS (single,
 * double, and backtick-quoted, including `\`-escaped characters) are left completely
 * untouched, because the specifier every downstream regex actually wants sits between a pair
 * of quotes. The four states are mutually exclusive by construction: while scanning a
 * comment, a quote character never opens a string; while scanning a string, `//`/`/*` never
 * open a comment -- so neither an apostrophe/quote inside a comment nor a comment-start
 * sequence inside a string can desynchronize the other.
 */
function stripCodeComments(source) {
  let out = "";
  let state = "code"; // "code" | "line-comment" | "block-comment" | "string"
  let stringQuote = null;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === "code") {
      if (ch === "/" && next === "/") { state = "line-comment"; i += 1; continue; }
      if (ch === "/" && next === "*") { state = "block-comment"; i += 1; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { state = "string"; stringQuote = ch; out += ch; continue; }
      out += ch;
      continue;
    }
    if (state === "line-comment") {
      if (ch === "\n") { state = "code"; out += "\n"; } else { out += " "; }
      continue;
    }
    if (state === "block-comment") {
      if (ch === "*" && next === "/") { state = "code"; out += "  "; i += 1; continue; }
      out += ch === "\n" ? "\n" : " ";
      continue;
    }
    // state === "string"
    out += ch;
    if (ch === "\\" && next !== undefined) { out += next; i += 1; continue; }
    if (ch === stringQuote) { state = "code"; stringQuote = null; }
  }
  return out;
}

// Declared dynamic-import edges (see "DYNAMIC IMPORT EDGES" in the file header): one entry
// per kernel file whose dynamic `import()` specifiers are built at runtime rather than
// written as a literal string, naming every first-party module those calls resolve to,
// relative to the declaring file's own directory -- resolved and kernel-membership-checked
// exactly like a static import specifier. The declared count is cross-checked against the
// actual number of dynamic-import call sites in that file's source (relativeImportSpecifiers
// below), so an edge added or removed in the source without updating this table fails
// rather than silently stops being covered.
const DYNAMIC_IMPORT_EDGES = {
  // pre-push-hook-install.mjs's evaluateOneCommit() dynamically imports these four via
  // `pathToFileURL(join(PLUGIN_LIB_DIR, "<name>")).href` -- PLUGIN_LIB_DIR is an
  // install-time-bound absolute path, not a literal specifier the static scanner can read.
  "plugins/pipeline-core/scripts/pre-push-hook-install.mjs": [
    "../lib/manifest.mjs",
    "../lib/verify-evidence-path.mjs",
    "../lib/security-completeness-gate.mjs",
    "../lib/project-authority.mjs",
  ],
};

// Spawn-edge scanner (pipeline.gmw-kernel-closure-test-does-not-model-spawn-edges): see
// the "SPAWN EDGES" section of the file header for the shapes this classifies.
const SPAWN_EXEC_PATH_RE = /\bspawnSync\(\s*process\.execPath\s*,\s*\[\s*([^,\]]+?)\s*[,\]]/g;
const SCRIPT_PATH_CONST_RE = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*fileURLToPath\(\s*new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)\s*\)/g;
const IDENTIFIER_REASSIGN_RE = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*;/g;
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const STRING_LITERAL_RE = /^["']([^"']*)["']$/;
const MAX_IDENTIFIER_CHASE_HOPS = 8;

/**
 * Map every identifier this ONE kernel file's source assigns from a
 * `fileURLToPath(new URL("../relative/spec.mjs", import.meta.url))` script-path
 * constant, or reassigns (`name = OTHER_NAME;`) from one, to its ultimate specifier.
 */
function scriptPathIdentifierMap(source) {
  const map = new Map();
  let match;
  SCRIPT_PATH_CONST_RE.lastIndex = 0;
  while ((match = SCRIPT_PATH_CONST_RE.exec(source)) !== null) {
    map.set(match[1], { kind: "path", specifier: match[2] });
  }
  IDENTIFIER_REASSIGN_RE.lastIndex = 0;
  while ((match = IDENTIFIER_REASSIGN_RE.exec(source)) !== null) {
    const [, target, ref] = match;
    if (!map.has(target)) map.set(target, { kind: "ref", ref });
  }
  return map;
}

function resolveScriptPathIdentifier(map, name, depth = 0) {
  if (depth > MAX_IDENTIFIER_CHASE_HOPS) return null;
  const entry = map.get(name);
  if (!entry) return null;
  if (entry.kind === "path") return entry.specifier;
  return resolveScriptPathIdentifier(map, entry.ref, depth + 1);
}

/** Every `spawnSync(process.execPath, [<script>, ...])` edge ONE kernel file's source declares. */
function spawnEdgeSpecifiers(source, repoRelativePath) {
  const identifierMap = scriptPathIdentifierMap(source);
  const specs = [];
  SPAWN_EXEC_PATH_RE.lastIndex = 0;
  let match;
  while ((match = SPAWN_EXEC_PATH_RE.exec(source)) !== null) {
    const token = match[1].trim();
    if (IDENTIFIER_RE.test(token)) {
      const resolved = resolveScriptPathIdentifier(identifierMap, token);
      if (resolved === null) {
        throw new Error(
          `${repoRelativePath} calls spawnSync(process.execPath, [${token}, ...]) but "${token}" cannot be ` +
          "statically traced to a fileURLToPath(new URL(...)) script-path constant -- this spawn-edge shape " +
          "must be resolved by hand (name the spawned script and add it to NEVER_LIFTABLE_KERNEL_PATHS if " +
          "first-party), not silently skipped.",
        );
      }
      specs.push(resolved);
      continue;
    }
    const literal = STRING_LITERAL_RE.exec(token);
    if (literal !== null) {
      // A non-relative string literal (a flag like "-e", a bare subcommand) is not a
      // first-party script reference -- ignored, mirroring how a non-relative import
      // specifier is already ignored below.
      if (literal[1].startsWith("./") || literal[1].startsWith("../")) specs.push(literal[1]);
      continue;
    }
    throw new Error(
      `${repoRelativePath} calls spawnSync(process.execPath, [${token}, ...]) with a first array element the ` +
      "static scanner cannot classify (neither a traceable identifier nor a string literal) -- this spawn-edge " +
      "shape must be resolved by hand (name the spawned script and add it to NEVER_LIFTABLE_KERNEL_PATHS if " +
      "first-party), not silently skipped.",
    );
  }
  return specs;
}

/** Number of real dynamic-import call sites (non-empty argument) in ONE file's source. */
function countDynamicImports(source) {
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  let count = 0;
  while (DYNAMIC_IMPORT_RE.exec(source) !== null) count += 1;
  return count;
}

/** Every first-party (relative-specifier) import/spawn-edge/declared-dynamic-import-edge
 * ONE kernel file's source declares. Scans `stripCodeComments(source)`, never the raw file
 * text, so prose inside a `//`/`/* *\/` comment can never be misread as a real import,
 * export, dynamic-import, or spawn-edge call site -- see the "COMMENT-BLANKED SCAN" section
 * of the file header. */
function relativeImportSpecifiers(absPath, repoRelativePath) {
  const rawSource = readFileSync(absPath, "utf8");
  const source = stripCodeComments(rawSource);
  const dynamicImportCount = countDynamicImports(source);
  const declaredDynamicTargets = DYNAMIC_IMPORT_EDGES[repoRelativePath];
  if (dynamicImportCount > 0 && !declaredDynamicTargets) {
    throw new Error(
      `${repoRelativePath} contains a dynamic import() the static scanner cannot classify -- ` +
      "this shape must be resolved by hand (name the target module and add it to " +
      "DYNAMIC_IMPORT_EDGES, and to NEVER_LIFTABLE_KERNEL_PATHS if first-party), not silently skipped.",
    );
  }
  if (declaredDynamicTargets && declaredDynamicTargets.length !== dynamicImportCount) {
    throw new Error(
      `${repoRelativePath} declares ${declaredDynamicTargets.length} dynamic-import edge(s) in ` +
      `DYNAMIC_IMPORT_EDGES but its source actually contains ${dynamicImportCount} dynamic-import ` +
      "call site(s) -- a stale declaration (an edge added, removed, or changed in the source " +
      "without updating the table) would otherwise silently stop covering a real edge; fix the " +
      "table to match the source exactly.",
    );
  }
  const specs = new Set();
  let match;
  IMPORT_FROM_RE.lastIndex = 0;
  while ((match = IMPORT_FROM_RE.exec(source)) !== null) specs.add(match[1]);
  SIDE_EFFECT_IMPORT_RE.lastIndex = 0;
  while ((match = SIDE_EFFECT_IMPORT_RE.exec(source)) !== null) specs.add(match[1]);
  for (const spec of spawnEdgeSpecifiers(source, repoRelativePath)) specs.add(spec);
  if (declaredDynamicTargets) for (const spec of declaredDynamicTargets) specs.add(spec);
  const relativeSpecs = [];
  for (const spec of specs) {
    if (spec.startsWith("./") || spec.startsWith("../")) relativeSpecs.push(spec);
  }
  return relativeSpecs;
}

/** Resolve a relative import specifier against the importing file's OWN repo-relative path. */
function resolveRepoRelative(fromRepoRelativePath, specifier) {
  const dir = dirname(fromRepoRelativePath);
  return normalize(join(dir, specifier)).split(sep).join("/");
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}: ${error.stack ?? error.message}`);
    failed += 1;
  }
}

check("GMWKC01 NEVER_LIFTABLE_KERNEL_PATHS is transitively closed under first-party relative imports", () => {
  const kernelSet = new Set(NEVER_LIFTABLE_KERNEL_PATHS);
  const missing = [];
  const visited = new Set();
  const queue = [...NEVER_LIFTABLE_KERNEL_PATHS];
  while (queue.length > 0) {
    const relPath = queue.shift();
    if (visited.has(relPath)) continue;
    visited.add(relPath);
    // hooks.json / project/critical-human-proof.json: not JS, no imports to walk.
    if (!relPath.endsWith(".mjs") && !relPath.endsWith(".js")) continue;
    const absPath = join(REPO_ROOT, relPath);
    if (!existsSync(absPath)) {
      throw new Error(`${relPath} is listed in NEVER_LIFTABLE_KERNEL_PATHS but does not exist on disk.`);
    }
    for (const spec of relativeImportSpecifiers(absPath, relPath)) {
      const resolved = resolveRepoRelative(relPath, spec);
      if (!kernelSet.has(resolved)) {
        missing.push(`${relPath} imports "${spec}" -> ${resolved}, which is NOT in NEVER_LIFTABLE_KERNEL_PATHS`);
      }
      // Recurse regardless of membership: a missing transitive dependency of a missing
      // transitive dependency must ALSO surface as its own failure line, not just the
      // first hop -- otherwise fixing hop 1 could still leave hop 2 undiscovered.
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  assert.equal(
    missing.length,
    0,
    `NEVER_LIFTABLE_KERNEL_PATHS is not transitively closed (${missing.length} missing edge(s)):\n${missing.join("\n")}`,
  );
});

check("GMWKC02 PLUGIN_KERNEL_SUFFIXES/PROJECT_KERNEL_PATHS derive correctly from the extended array (both anchors)", () => {
  // Project-root anchor: this real, self-hosted checkout (ADR-0015 self-application) --
  // `plugins/pipeline-core/lib/entrypoint.mjs` is one of the paths this dispatch adds.
  assert.equal(
    isNeverLiftableKernelPath(join(REPO_ROOT, "plugins", "pipeline-core", "lib", "entrypoint.mjs"), { rootDir: REPO_ROOT }),
    true,
    "a newly added plugins/pipeline-core/... entry must be reachable via the project-root anchor (PROJECT_KERNEL_PATHS/PLUGIN_KERNEL_SUFFIXES re-derived from the extended array)",
  );
  assert.equal(
    isNeverLiftableKernelPath(join(REPO_ROOT, "plugins", "pipeline-core", "lib", "guard-git.mjs"), { rootDir: REPO_ROOT }),
    false,
    "an ordinary, non-kernel plugin file must still not be claimed as kernel",
  );
  // Plugin-root anchor: a globally-installed copy whose live plugin root is NOT inside
  // rootDir at all -- only reachable via the livePluginRoot parameter's grandparent
  // (mirrors guard-maintenance-window.test.mjs's own GMW08 pattern).
  const globalRoot = mkdtempSync(join(tmpdir(), "gmwkc-global-"));
  const globalPluginRoot = join(globalRoot, "marketplace", "plugins", "pipeline-core");
  mkdirSync(join(globalPluginRoot, "lib"), { recursive: true });
  assert.equal(
    isNeverLiftableKernelPath(join(globalPluginRoot, "lib", "entrypoint.mjs"), { rootDir: REPO_ROOT }),
    false,
    "unreachable via rootDir alone",
  );
  assert.equal(
    isNeverLiftableKernelPath(join(globalPluginRoot, "lib", "entrypoint.mjs"), { rootDir: REPO_ROOT, livePluginRoot: globalPluginRoot }),
    true,
    "must be caught via the livePluginRoot anchor once entrypoint.mjs is a kernel path",
  );
});

check("GMWKC03 docs/guard-maintenance-window-threat-model.md's Protected-assets prose lists every NEVER_LIFTABLE_KERNEL_PATHS entry", () => {
  const docPath = join(REPO_ROOT, "docs", "guard-maintenance-window-threat-model.md");
  const doc = readFileSync(docPath, "utf8");
  const sectionStart = doc.indexOf("## Protected assets");
  const sectionEnd = doc.indexOf("## Threats and controls");
  if (sectionStart === -1 || sectionEnd === -1 || sectionEnd <= sectionStart) {
    throw new Error(`Could not locate the "## Protected assets" ... "## Threats and controls" span in ${docPath}.`);
  }
  const section = doc.slice(sectionStart, sectionEnd);
  const DOC_PATH_TOKEN_RE = /`((?:lib|scripts|hooks)\/[A-Za-z0-9_.\-]+\.(?:mjs|js|json)|project\/critical-human-proof\.json)`/g;
  const docPaths = new Set();
  let match;
  while ((match = DOC_PATH_TOKEN_RE.exec(section)) !== null) {
    const token = match[1];
    docPaths.add(token.startsWith("project/") ? token : `plugins/pipeline-core/${token}`);
  }
  const missing = NEVER_LIFTABLE_KERNEL_PATHS.filter((p) => !docPaths.has(p));
  assert.equal(
    missing.length,
    0,
    `${missing.length} NEVER_LIFTABLE_KERNEL_PATHS entr${missing.length === 1 ? "y is" : "ies are"} not mentioned in ` +
    `docs/guard-maintenance-window-threat-model.md's "Protected assets" section:\n${missing.join("\n")}`,
  );
});

check("GMWKC04 relativeImportSpecifiers still fails closed on a genuine unclassifiable dynamic import() in real code (positive control for GMWKC05's comment fix)", () => {
  const dir = mkdtempSync(join(tmpdir(), "gmwkc-dynimport-real-"));
  const fixturePath = join(dir, "fixture.mjs");
  writeFileSync(
    fixturePath,
    [
      "// a genuinely runtime-computed dynamic import -- real code, not a comment, no",
      "// DYNAMIC_IMPORT_EDGES entry declared for it below",
      "const moduleName = computeModuleName();",
      "export async function load() {",
      "  return import(moduleName);",
      "}",
    ].join("\n"),
  );
  assert.throws(
    () => relativeImportSpecifiers(fixturePath, "plugins/pipeline-core/lib/__gmwkc-fixture-not-a-real-kernel-path.mjs"),
    /contains a dynamic import\(\) the static scanner cannot classify/,
    "a real, undeclared dynamic import() must still throw -- this scanner guards which paths " +
    "are never liftable by a maintenance window, so silently passing it would be a blind spot, " +
    "not a fix",
  );
});

check("GMWKC05 stripCodeComments blanks // and /* */ prose without ever corrupting or being corrupted by string contents", () => {
  const dir = mkdtempSync(join(tmpdir(), "gmwkc-stripcomments-"));
  const fixturePath = join(dir, "fixture.mjs");
  writeFileSync(
    fixturePath,
    [
      "// prose mentioning \"await import(...)\" and a lone ' apostrophe -- must not be read as code",
      "/**",
      " * a block comment containing a real-looking specifier: import { x } from \"./nonexistent.mjs\";",
      " * and the exact phrase that broke this scanner once: `await import(...)` below -- a",
      " * backtick-quoted phrase inside a block comment must not desynchronize string tracking.",
      " */",
      "import { firstReal } from \"./first-real-target.mjs\"; // trailing comment must not hide this import",
      "const s = \"a string containing /* not a real comment */ and // not a real comment either\";",
      "import { secondReal } from \"./second-real-target.mjs\";",
    ].join("\n"),
  );
  const specs = relativeImportSpecifiers(fixturePath, "plugins/pipeline-core/lib/__gmwkc-fixture-not-a-real-kernel-path.mjs");
  assert.deepEqual(
    specs,
    ["./first-real-target.mjs", "./second-real-target.mjs"],
    "both real imports survive: comment prose contributes nothing, and the string literal's " +
    "fake comment markers between them must not have desynchronized the scan of the second " +
    "real import that follows it",
  );
});

console.log(`\nguard-maintenance-window-kernel-closure: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
