#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-verify-suite-registration.mjs — every *.test.mjs suite under a
 * registered root is registered in harness/scripts/verify.mjs, every
 * registration entry names a file that exists, and no registration array
 * carries a duplicate suite id/name.
 * (specs/sprint-phoenix-epic/phase-plan_gate-integrity.md §R1.1-R1.4)
 *
 * WHY THIS EXISTS. verify.mjs is TP-3-protected, so an author cannot
 * register a test in the same dispatch that writes it, and hand-offs get
 * dropped -- it has happened three times in one feature area. On 2026-08-08
 * a single duplicated registration line, introduced by a clean auto-merge,
 * made plugins/pipeline-core/lib/verify-resume.mjs:114 throw ("Verify suite
 * registration is invalid") before planning anything: zero suites started,
 * and every dispatch in that window honestly reported "verify not run" with
 * nobody able to say what it would have reported. A second measurement in
 * the same window found 109 of 349 test files registered nowhere (31%).
 * Neither was discoverable by review -- both were discoverable only by
 * running a command that had silently stopped working. This check
 * mechanises the invariant already stated in prose at verify.mjs ~315-317:
 * "An unregistered suite is not a test Verify forgot to run -- it is a test
 * that protects nothing, and the gap is invisible precisely because the
 * file exists and passes when run by hand."
 *
 * THREE DEFECT CLASSES, each reported with its own distinct message:
 *   1. UNREGISTERED   -- a *.test.mjs file under a registered root has no
 *      registration entry in any of verify.mjs's three suite arrays, and is
 *      not a declared exclusion (R1.3).
 *   2. MISSING-FILE   -- a registration entry's `file:` expression resolves
 *      to a path that does not exist on disk (R1.3).
 *   3. DUPLICATE-NAME -- two entries, within or across the three arrays,
 *      share the same `name`. `name` is the field verify-journal.mjs
 *      threads through unchanged as the suite `id`
 *      (`return { id: suite.name, ... }`), which is exactly what
 *      verify-resume.mjs:114's `planVerifyResume()` keys on and throws on
 *      the FIRST duplicate of, before planning anything. This check instead
 *      names every duplicate it finds (R1.4).
 *
 * STATIC PARSING, NOT IMPORT. This module never imports or executes
 * verify.mjs: importing it spawns git, requires a clean candidate, and runs
 * the entire suite corpus as a side effect of module load -- exactly the
 * kind of second implementation R1.3 explicitly rejects for the push gate
 * (a registration-completeness step inside verify is already enforced at
 * the push gate transitively; see plugins/pipeline-core/hooks/guard-push.mjs
 * ~1577-1578), and unsafe for a check meant to run cheaply and repeatedly.
 * Instead this module locates the three registration arrays' source text by
 * declaration (TEST_SUITES / SCOPED_VERIFY_SUITES /
 * WINDOWS_ASSURANCE_VERIFY_SUITES) and resolves each entry's `file:`
 * expression the same way verify.mjs itself composes it:
 *   - TEST_SUITES entries write `file: join(IDENT, "seg", ...)` directly,
 *     IDENT one of repoRoot/libDir/hooksDir/scriptDir/pluginScriptsDir
 *     (verify.mjs ~60-67); this module reproduces those five base
 *     directories from verifyPath's own location and calls node's own
 *     `path.join` on the extracted literal segments -- never `eval`.
 *   - SCOPED_VERIFY_SUITES / WINDOWS_ASSURANCE_VERIFY_SUITES entries write
 *     `file: "relative/path"` as a literal; verify.mjs's own composition
 *     (~482-483) then maps each through `join(repoRoot, suite.file)`. This
 *     module applies that identical mapping in its own code rather than
 *     parsing those two composition lines as expressions -- see next
 *     paragraph.
 * An entry whose `file:` uses any other shape is reported as unresolved,
 * never silently skipped: an unresolvable entry is exactly the kind of gap
 * this check exists to surface.
 *
 * TWO `file:` EXPRESSIONS THAT CANNOT BE PARSED AS EXPRESSIONS, DISCLOSED.
 * `join(repoRoot, suite.file)` appears twice in verify.mjs (~482-483),
 * mapping SCOPED_VERIFY_SUITES / WINDOWS_ASSURANCE_VERIFY_SUITES into the
 * suites verify.mjs actually runs. `suite.file` there is a variable, not a
 * literal, so the line cannot be resolved by parsing it in isolation. This
 * module never attempts to: it is not a registration-array ENTRY, it is the
 * composition step, and this module performs that identical composition in
 * its own code (`join(repoRoot, entry.file)`) using the literal `file:`
 * values read directly out of the two source arrays, where they ARE
 * literals. No expression is left unresolved in this check's output.
 *
 * EXCLUSIONS. A file that legitimately carries no registration entry is
 * named in EXCLUSIONS below, each with a one-line reason. An exclusion is a
 * debt with an owner, not a permanent state (R1.2): it is filed, not fixed,
 * and every line here is expected to eventually become either a
 * registration or a deletion. A file absent from both the registration
 * arrays AND this list is always a failure -- this checker's own two files
 * are deliberately not on this list.
 *
 * Exit 0: no defect in any class, and every array was found and parsed.
 * Exit 2: at least one finding; every finding names the concrete file,
 *   registration entry, or duplicate involved.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");
const VERIFY_REL = join("harness", "scripts", "verify.mjs");

/** Roots scanned for *.test.mjs suites (mirrors the classification report's
 *  headline: "tracked *.test.mjs under plugins/pipeline-core/ + harness/"). */
export const REGISTERED_ROOTS = Object.freeze(["harness", join("plugins", "pipeline-core")]);

/**
 * Declared exclusions -- files that legitimately carry no registration
 * entry today. Seeded 2026-08-08 from the red 7 in
 * specs/sprint-phoenix-epic/evidence/unregistered-suite-classification.md
 * (R1.2: filed, not fixed -- each is a debt with an owner, not a permanent
 * state). Do not add this checker's own two files here; see header.
 */
export const EXCLUSIONS = Object.freeze({
  "harness/lib/plan-spec-state-v2.test.mjs":
    "red (R1.2): SyntaxError, plan-spec-state-v2.mjs has no export bindPlanSpecApprovalWithHumanDecision",
  "harness/scripts/recovery-bridge-approval.test.mjs":
    "red (R1.2): SyntaxError, pipeline-state.mjs has no export RECOVERY_BRIDGE_DECISION_SCHEMA",
  "plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs":
    "red (R1.2): SyntaxError, codex-host-plugin-list.mjs has no export observeCodexRulesetSource",
  "plugins/pipeline-core/hooks/guard-git-phoenix.test.mjs":
    "red (R1.2): AssertionError, 1 !== 2",
  "plugins/pipeline-core/scripts/afk-activation.test.mjs":
    "red (R1.2): AssertionError, false !== true",
  "plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs":
    "red (R1.2): AssertionError against harness/review-protocol.md",
  "plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs":
    "red (R1.2): WAVR19 fails; also itself an unregistered self-check of verify.mjs's own ordering",
});

function toPosix(rawPath) { return rawPath.split(sep).join("/"); }

function walkTestFiles(absDir, out) {
  let entries;
  try { entries = readdirSync(absDir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(absDir, entry.name);
    if (entry.isDirectory()) walkTestFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith(".test.mjs")) out.push(full);
  }
}

function extractBlock(source, pattern) {
  const match = source.match(pattern);
  return match ? match[1] : null;
}

/** `{ name: "x", file: join(IDENT, "a", "b", ...) ... }` -- TEST_SUITES form. */
const JOIN_ENTRY_RE = /\{\s*name:\s*"([^"]+)"\s*,\s*file:\s*join\(\s*([A-Za-z_$][\w$]*)\s*,\s*((?:"(?:[^"\\]|\\.)*"\s*,?\s*)+)\)/g;
/** `Object.freeze({ name: "x", file: "relative/path" })` -- scoped / Windows-assurance form. */
const LITERAL_ENTRY_RE = /Object\.freeze\(\{\s*name:\s*"([^"]+)"\s*,\s*file:\s*"([^"]+)"\s*,?\s*\}\)/g;

function parseQuotedSegments(raw) {
  const matches = raw.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
  return matches.map((literal) => JSON.parse(literal));
}

function parseJoinEntries(block, arrayName, baseDirs, findings) {
  const entries = [];
  for (const match of block.matchAll(JOIN_ENTRY_RE)) {
    const [, name, ident, segmentsRaw] = match;
    const base = baseDirs[ident];
    if (base === undefined) {
      findings.push(`UNRESOLVED-FILE-EXPRESSION ${arrayName} "${name}": unrecognized base identifier "${ident}" in its file: expression`);
      continue;
    }
    entries.push({ name, arrayName, resolvedPath: join(base, ...parseQuotedSegments(segmentsRaw)) });
  }
  return entries;
}

function parseLiteralEntries(block, arrayName, repoRoot) {
  const entries = [];
  for (const match of block.matchAll(LITERAL_ENTRY_RE)) {
    const [, name, fileLiteral] = match;
    // Mirrors verify.mjs's own composition at ~482-483: `join(repoRoot, suite.file)`.
    entries.push({ name, arrayName, resolvedPath: join(repoRoot, fileLiteral) });
  }
  return entries;
}

export function checkVerifySuiteRegistration({
  verifyPath = join(DEFAULT_ROOT, VERIFY_REL),
  registeredRoots = REGISTERED_ROOTS,
  exclusions = EXCLUSIONS,
} = {}) {
  const findings = [];
  let verifySource;
  try {
    verifySource = readFileSync(verifyPath, "utf8");
  } catch (error) {
    return {
      ok: false,
      findings: [`READ-ERROR: could not read ${verifyPath} (${error.code ?? error.message})`],
      registeredCount: 0, unregisteredCount: 0, excludedCount: 0, entries: [], unregisteredFiles: [],
    };
  }

  const scriptDir = dirname(verifyPath);
  const repoRoot = resolve(scriptDir, "..", "..");
  const baseDirs = {
    repoRoot,
    scriptDir,
    libDir: join(repoRoot, "plugins", "pipeline-core", "lib"),
    hooksDir: join(repoRoot, "plugins", "pipeline-core", "hooks"),
    pluginScriptsDir: join(repoRoot, "plugins", "pipeline-core", "scripts"),
  };

  const blocks = [
    { arrayName: "TEST_SUITES", pattern: /const TEST_SUITES = \[([\s\S]*?)\n\];/, kind: "join" },
    { arrayName: "SCOPED_VERIFY_SUITES", pattern: /const SCOPED_VERIFY_SUITES = Object\.freeze\(\[([\s\S]*?)\n\]\);/, kind: "literal" },
    { arrayName: "WINDOWS_ASSURANCE_VERIFY_SUITES", pattern: /const WINDOWS_ASSURANCE_VERIFY_SUITES = Object\.freeze\(\[([\s\S]*?)\n\]\);/, kind: "literal" },
  ];

  let entries = [];
  for (const { arrayName, pattern, kind } of blocks) {
    const block = extractBlock(verifySource, pattern);
    if (block === null) {
      findings.push(`PARSE-ERROR: could not locate the ${arrayName} array in ${verifyPath}`);
      continue;
    }
    const parsed = kind === "join"
      ? parseJoinEntries(block, arrayName, baseDirs, findings)
      : parseLiteralEntries(block, arrayName, repoRoot);
    // A block that is legitimately empty (whitespace only) is not a parse failure --
    // only a non-empty block that still yielded zero entries indicates the parser's
    // pattern no longer matches this array's syntax.
    if (parsed.length === 0 && block.trim() !== "") {
      findings.push(`PARSE-ERROR: the ${arrayName} array was located but no entries could be parsed from it`);
    }
    entries = entries.concat(parsed);
  }

  // Class 2 -- MISSING-FILE.
  for (const entry of entries) {
    if (!existsSync(entry.resolvedPath)) {
      findings.push(`MISSING-FILE ${entry.arrayName} "${entry.name}" names ${toPosix(relative(repoRoot, entry.resolvedPath))}, which does not exist`);
    }
  }

  // Class 3 -- DUPLICATE-NAME. `name` is the field threaded through unchanged as the suite
  // `id` (verify-journal.mjs: `return { id: suite.name, ... }`), which is exactly what
  // verify-resume.mjs:114 throws on the FIRST duplicate of, before planning anything.
  const byName = new Map();
  for (const entry of entries) {
    if (!byName.has(entry.name)) byName.set(entry.name, []);
    byName.get(entry.name).push(entry.arrayName);
  }
  for (const [name, arrayNames] of byName) {
    if (arrayNames.length > 1) findings.push(`DUPLICATE-NAME "${name}" is registered ${arrayNames.length} times (${arrayNames.join(", ")})`);
  }

  // Class 1 -- UNREGISTERED.
  const registeredPaths = new Set(entries.map((entry) => resolve(entry.resolvedPath)));
  const discovered = [];
  for (const root of registeredRoots) walkTestFiles(join(repoRoot, root), discovered);
  discovered.sort();
  const unregisteredFiles = [];
  let excludedCount = 0;
  for (const absolutePath of discovered) {
    if (registeredPaths.has(resolve(absolutePath))) continue;
    const relativePath = toPosix(relative(repoRoot, absolutePath));
    if (Object.prototype.hasOwnProperty.call(exclusions, relativePath)) { excludedCount += 1; continue; }
    unregisteredFiles.push(relativePath);
    findings.push(`UNREGISTERED ${relativePath} is a *.test.mjs suite under a registered root with no verify.mjs registration entry`);
  }

  return {
    ok: findings.length === 0,
    findings,
    registeredCount: entries.length,
    unregisteredCount: unregisteredFiles.length,
    excludedCount,
    entries,
    unregisteredFiles,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex === -1 ? DEFAULT_ROOT : resolve(process.argv[rootIndex + 1] ?? DEFAULT_ROOT);
  const result = checkVerifySuiteRegistration({ verifyPath: join(root, VERIFY_REL) });
  if (result.ok) {
    console.log(
      `Verify suite registration is complete: ${result.registeredCount} registered, ` +
      `${result.excludedCount} declared exclusion(s), 0 unregistered.`,
    );
    process.exit(0);
  }
  for (const finding of result.findings) console.error(finding);
  console.error(
    `Verify suite registration check failed: ${result.findings.length} finding(s) ` +
    `(${result.unregisteredCount} unregistered, ${result.excludedCount} declared exclusion(s)).`,
  );
  process.exit(2);
}
