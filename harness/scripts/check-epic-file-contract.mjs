#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-epic-file-contract — does `specs/sprint-phoenix-epic/spec.md` §7
 * ("Detailed implementation inventory") still match the tree it claims to
 * describe?
 *
 * WHY THIS EXISTS (backlog/items/2026-08-09-epic-file-contract-has-no-drift-check.md).
 * §7 declares itself the Epic's file contract and states that "a new
 * implementation file outside this inventory requires the Elephant to
 * update the Spec before dispatch." Nothing ever checked that the inventory
 * still matched the actual tree; eight files created during the sprint were
 * found absent from it, confirmed only by a sixteen-commit-range Critic
 * finding that happened to compare one file against §7 by hand. Every other
 * declared contract in this sprint (verify-suite registration,
 * Critic-contract citations, skill/spec coverage, ADR consistency, doc
 * reconciliation) already has a mechanical check; the Spec's own file
 * contract did not, until this one.
 *
 * TWO INDEPENDENT MEASURES, deliberately asymmetric (the backlog item's own
 * Proposal, quoted): "verify that every path the inventory names exists,
 * and report -- do not fail -- on tracked files under the roots the
 * inventory covers that it does not name."
 *
 *   1. EXISTENCE (fails the check): every path §7's first table column
 *      names, across every `### 7.x` subsection, must exist on disk under
 *      `root`. A missing path is a finding and the check exits non-zero.
 *   2. DRIFT (reported, never fails): a "root" is the immediate parent
 *      directory of a path §7 names (e.g. naming `harness/scripts/verify.mjs`
 *      covers the root `harness/scripts`). For every such root, every file
 *      that lives DIRECTLY inside it (no recursion into subdirectories that
 *      are not themselves a named root) and is not itself named by §7 is
 *      reported as drift. This never fails the check: an inventory is a
 *      statement of intent, not a filesystem whitelist (see the backlog
 *      item's rationale for why the second half reports rather than fails --
 *      a check that failed on every unlisted file would be turned off
 *      within a day).
 *
 * WHAT THIS CHECK DOES NOT DO -- read this before trusting a green line:
 *  - It does not recurse into subdirectories of a covered root unless that
 *    subdirectory is itself named as a root by some other §7 path (e.g.
 *    `docs/adr/README.md` makes `docs/adr` its own root, distinct from the
 *    root `docs` that other paths cover; nothing under `docs/adr/` is
 *    counted against the `docs` root, and vice versa).
 *  - It does not distinguish a file that predates the Epic from one created
 *    during it -- a root with many long-standing, unrelated files reports
 *    all of them as drift alongside genuinely new ones. The signal this
 *    check restores is "does §7 still match the tree", not "what changed
 *    this sprint".
 *  - It does not read the Change/Rationale table columns, only the path
 *    column.
 *  - It never edits §7 itself; whether the drift it reports should be
 *    repaired by adding entries to §7 is a separate, already-dispositioned
 *    PO decision (see the backlog item), not something this check performs.
 *
 * Usage: node harness/scripts/check-epic-file-contract.mjs [--root <dir>] [--spec <relative-path>]
 * Exit 0 = every §7-declared path exists (drift, if any, is reported, not failed).
 * Exit 2 = at least one §7-declared path is missing, or §7 itself could not be read.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");
export const SPEC_REL = join("specs", "sprint-phoenix-epic", "spec.md");

const SECTION_HEADING_RE = /^## 7\./m;
const NEXT_SECTION_RE = /^## \d+\./m;
const ROW_RE = /^\|\s*`([^`]+)`\s*\|/gm;

/**
 * The §7 section text: from its own heading up to the next level-2 ("## N.")
 * heading, or end of file if §7 is the last section. Returns null if no
 * "## 7." heading is found at all -- the file contract this check validates
 * is itself absent, which is reported as a finding rather than silently
 * treated as an empty inventory.
 */
export function extractSection7(specText) {
  const start = SECTION_HEADING_RE.exec(specText);
  if (!start) return null;
  const rest = specText.slice(start.index + start[0].length);
  const next = NEXT_SECTION_RE.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** Every backtick-quoted path in §7's first table column, in document order, deduplicated. */
export function extractInventoryPaths(section7Text) {
  const paths = [];
  const seen = new Set();
  for (const m of section7Text.matchAll(ROW_RE)) {
    const p = m[1].trim();
    if (p === "" || seen.has(p)) continue;
    seen.add(p);
    paths.push(p);
  }
  return paths;
}

function toPosix(p) {
  return p.split("\\").join("/");
}

/** Every distinct immediate parent directory ("root") the inventory's paths cover, POSIX-relative. */
export function coveredRoots(paths) {
  const roots = new Set();
  for (const p of paths) {
    const norm = toPosix(p);
    const idx = norm.lastIndexOf("/");
    roots.add(idx === -1 ? "." : norm.slice(0, idx));
  }
  return [...roots].sort();
}

/** Files directly inside `root`/`dirRel` (no recursion), POSIX-relative to `root`. A missing directory yields []. */
function listFilesInDir(root, dirRel) {
  const abs = dirRel === "." ? root : join(root, dirRel);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    files.push(dirRel === "." ? entry.name : `${dirRel}/${entry.name}`);
  }
  return files;
}

export function checkEpicFileContract({ root = DEFAULT_ROOT, specRel = SPEC_REL } = {}) {
  const specPath = join(root, specRel);
  let specText;
  try {
    specText = readFileSync(specPath, "utf8");
  } catch (error) {
    return {
      ok: false,
      missing: [`${specRel}:1 -- could not read the file contract (${error.code ?? error.message})`],
      drift: [],
      coverage: { pathsDeclared: 0, rootsCovered: 0, filesScanned: 0 },
    };
  }

  const section = extractSection7(specText);
  if (section === null) {
    return {
      ok: false,
      missing: [`${specRel}:1 -- no "## 7." section heading found; the declared file contract this check validates is absent`],
      drift: [],
      coverage: { pathsDeclared: 0, rootsCovered: 0, filesScanned: 0 },
    };
  }

  const paths = extractInventoryPaths(section);
  const missing = [];
  for (const p of paths) {
    if (!existsSync(join(root, p))) {
      missing.push(`${specRel} §7 -- declared path does not exist: ${p}`);
    }
  }

  const named = new Set(paths.map(toPosix));
  const roots = coveredRoots(paths);
  const drift = [];
  let filesScanned = 0;
  for (const dirRel of roots) {
    for (const f of listFilesInDir(root, dirRel)) {
      filesScanned += 1;
      if (named.has(f)) continue;
      drift.push(f);
    }
  }
  drift.sort();

  return {
    ok: missing.length === 0,
    missing,
    drift,
    coverage: { pathsDeclared: paths.length, rootsCovered: roots.length, filesScanned },
  };
}

/**
 * The success/failure summary line. States what was measured AND what this
 * check does not cover (QG-05, guardrails/quality-gates.md): an unqualified
 * "the file contract is fine" would overclaim exactly the way the absence of
 * this check let eight files go unnoticed for a whole sprint.
 */
export function successLine({ coverage, drift }, specRel = SPEC_REL) {
  return [
    `Epic file contract (${specRel} §7): ${coverage.pathsDeclared} declared path(s) all exist on disk, ` +
      `across ${coverage.rootsCovered} covered root director${coverage.rootsCovered === 1 ? "y" : "ies"} ` +
      `(${coverage.filesScanned} files scanned in those roots).`,
    `Drift (reported, never failed): ${drift.length} tracked file(s) under a covered root that §7 does not name` +
      (drift.length > 0 ? ` -- ${drift.join(", ")}.` : "."),
    "NOT checked: files outside a covered root's own immediate directory (no recursion into an unnamed subdirectory); " +
      "whether a drifted file predates or postdates this Epic; the Change/Rationale table columns; " +
      "whether §7 should be edited to add the drifted entries -- a separate, already-dispositioned PO decision this check never performs.",
  ].join(" ");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex === -1 ? DEFAULT_ROOT : resolve(process.argv[rootIndex + 1] ?? DEFAULT_ROOT);
  const specIndex = process.argv.indexOf("--spec");
  const specRel = specIndex === -1 ? SPEC_REL : process.argv[specIndex + 1];

  const result = checkEpicFileContract({ root, specRel });
  if (result.ok) {
    console.log(successLine(result, specRel));
    process.exit(0);
  }
  for (const m of result.missing) console.error(`MISSING ${m}`);
  console.error(`Epic file contract check failed: ${result.missing.length} declared path(s) missing.`);
  process.exit(2);
}
