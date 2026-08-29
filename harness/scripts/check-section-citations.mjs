#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Prose `§N` / `§N.M` citation lint against `docs/operating-model.md`.
 *
 * `check-doc-contracts.mjs` validates Markdown links and anchors; a `§N.M`
 * written in prose (or inside a backtick code span) is invisible to it. This
 * check parses citations that NAME `docs/operating-model.md` — either the
 * literal filename or the repo's `OM` shorthand, immediately followed by a
 * `§N` / `§N.M` reference — and resolves them against that file's real
 * heading structure (each numbered `##` section is §N in reading order; each
 * `###` child under it is §N.M in reading order within that section; the
 * headings carry no literal `N.M` text of their own, so resolution is purely
 * structural/ordinal).
 *
 * Two severities (PO Decision, backlog/items/2026-08-07-no-check-validates-
 * prose-section-citations.md, Option B, 2026-08-18):
 *   - FAIL (kind A): the section or subsection number does not exist at all.
 *   - WARN, never failing (kind B): the number resolves to a real section, but
 *     a trailing parenthetical/description on the citation does not share any
 *     significant word with that section's actual heading text.
 *
 * Detection is deliberately narrow and proximity-bound (an anchor —
 * `operating-model.md` or `OM` — immediately followed, within a short
 * same-line window, by `§N`), mirroring the exact method this repo's own PO/
 * Elephant already used to certify the citation-sweep closed (docs/state.md,
 * AC-R3-1: `rg -n "OM §"` and `rg -no "operating-model\.md[^)]{0,30}§[0-9.]+"`).
 * A bare `§N` with no named anchor is out of scope by the same precedent.
 *
 * Scope excludes archival/quoting-the-defect surfaces, matching that same
 * precedent: `specs/**`, `backlog/**` (design archives and backlog items
 * legitimately quote a stale citation as a described defect, not as a live
 * cross-reference a reader would follow) plus `docs/state.md` (the running
 * decision journal, which narrates past defect instances found elsewhere
 * rather than carrying live cross-references itself) and `AGENTS.md` (the
 * sibling doc-contract check's own exclusion).
 *
 * `docs/adr/**` is DELIBERATELY IN SCOPE (2026-08, Nova/Phoenix merge review
 * rework, RW1-CITATIONSCOPE) — reversing an earlier blanket exclusion that
 * treated every ADR as archival-only. ADRs carry live "Full articulation: ..."
 * pointers a reader genuinely follows (e.g. ADR-0009's own "Full articulation:
 * `docs/operating-model.md` §5.2, ..." sentence), not just historical quotes
 * of past defects; a probe against the real corpus confirmed a genuinely
 * broken `§5.2` citation in `docs/adr/0009-session-hygiene-lifecycle.md` that
 * the old blanket exclusion hid. Only `plugins/pipeline-core/docs/adr/**` —
 * the generated, byte-identical vendored mirror of the `UNIVERSAL_ADRS`
 * subset (`generate-vendored-canon.mjs`) — stays excluded: scanning it too
 * would just duplicate the same canonical-file finding under a second path;
 * `generate-vendored-canon.test.mjs` already asserts the mirror is
 * byte-identical to its canonical origin, so checking the canonical copy
 * covers the mirror by construction. Before this rework, the exclusion ran
 * the other way (`docs/adr/**` excluded, its mirror not), which meant the
 * mirror was the ONLY copy scanned for the ~20 vendored ADRs and the other
 * ~50+ non-vendored canonical ADRs were never checked by either copy — an
 * unintended asymmetry, not a deliberate design (previously recorded only in
 * a commit message body, QG-06).
 *
 * Deliberately NOT built here: Option 3 from the backlog item (backticked
 * `path:line` citation checking) — explicitly deferred, larger false-positive
 * surface, not part of this PO decision.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { enumerateTrackedMarkdown, stripFencedCode } from "./check-doc-contracts.mjs";

const OPERATING_MODEL_PATH = "docs/operating-model.md";
const VENDOR_PREFIX = "plugins/pipeline-core/";
const VENDORED_OPERATING_MODEL_PATH = `${VENDOR_PREFIX}${OPERATING_MODEL_PATH}`;
const DE_REFERENCE_MARKER = "<!-- DE-REFERENCE-BELOW";
const EXTRA_EXCLUDED_PREFIXES = ["plugins/pipeline-core/docs/adr/", "specs/", "backlog/"];
const EXTRA_EXCLUDED_PATHS = new Set(["docs/state.md"]);

function defaultReadText(file) {
  return readFileSync(file, "utf8");
}

export function isOutOfCitationScope(repoPath) {
  if (EXTRA_EXCLUDED_PATHS.has(repoPath)) return true;
  return EXTRA_EXCLUDED_PREFIXES.some((prefix) => repoPath.startsWith(prefix));
}

/**
 * Parse `docs/operating-model.md`'s real heading structure: each numbered
 * `##` heading is one section (in reading order = its own printed number);
 * each `###` heading nested under it is one subsection (in reading order
 * within that section, 1-based — the headings carry no digits of their own).
 * Only the English half above the bilingual-doc skip marker is read (CLAUDE.md
 * — Bilingual-doc skip convention); the German mirror is never a resolution
 * target.
 */
export function parseOperatingModelHeadings(markdown) {
  const markerIndex = markdown.indexOf(DE_REFERENCE_MARKER);
  const english = markerIndex === -1 ? markdown : markdown.slice(0, markerIndex);
  const lines = stripFencedCode(english).split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(\d+)\.\s+(.+?)\s*$/);
    if (h2) {
      current = { number: Number(h2[1]), title: h2[2].trim(), subsections: [] };
      sections.push(current);
      continue;
    }
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3 && current) {
      current.subsections.push({ ordinal: current.subsections.length + 1, title: h3[1].trim() });
    }
  }
  return sections;
}

/** Resolve one parsed §N / §N.M citation against the parsed heading structure. */
export function resolveCitation(sections, sectionNumber, subsectionOrdinal) {
  const section = sections.find((entry) => entry.number === sectionNumber);
  if (!section) return { status: "section-missing" };
  if (subsectionOrdinal == null) return { status: "ok", title: section.title, level: "section" };
  const subsection = section.subsections[subsectionOrdinal - 1];
  if (!subsection) return { status: "subsection-missing", sectionTitle: section.title };
  return { status: "ok", title: subsection.title, level: "subsection" };
}

// Anchor immediately (within a short, `)`-free gap — mirrors the precedent
// regex's own 30-char bound) followed by a §N / §N.M and an optional
// parenthetical description. `OM` only counts when it is directly followed by
// `§` (not, e.g., an unrelated word ending in the letters "om").
const PRIMARY_CITATION_RE = /(?:operating-model(?:\.md)?|(?<![\p{L}])OM(?=\s*§))[^)\n]{0,30}§(\d+)(?:\.(\d+))?(?:\s*\(([^)\n]*)\))?/gu;
// A same-anchor enumeration continuation: `, §4.2 (...)` or `/§3.5` right
// after a citation already attributed to the same anchor -- never crosses
// another named document to avoid misattributing an unrelated §N.
const CONTINUATION_CITATION_RE = /^\s*[,/]\s*`?§(\d+)(?:\.(\d+))?`?(?:\s*\(([^)\n]*)\))?/u;

/** Extract every operating-model §N/§N.M citation on one line (no line breaks). */
export function extractCitations(line) {
  const results = [];
  for (const match of line.matchAll(PRIMARY_CITATION_RE)) {
    results.push({
      section: Number(match[1]),
      subsection: match[2] != null ? Number(match[2]) : null,
      description: match[3] ?? null,
    });
    let rest = line.slice(match.index + match[0].length);
    for (;;) {
      const continuation = rest.match(CONTINUATION_CITATION_RE);
      if (!continuation) break;
      results.push({
        section: Number(continuation[1]),
        subsection: continuation[2] != null ? Number(continuation[2]) : null,
        description: continuation[3] ?? null,
      });
      rest = rest.slice(continuation[0].length);
    }
  }
  return results;
}

function significantWords(value) {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4);
}

/**
 * Fuzzy kind-B judgment: does a citation's own parenthetical/description
 * share any significant (>=4 char) word with the heading it actually
 * resolves to? A description with no significant words at all (too short to
 * judge) never warns.
 */
export function descriptionMatches(description, title) {
  const words = significantWords(description);
  if (words.length === 0) return true;
  const titleLower = title.toLocaleLowerCase("en-US");
  return words.some((word) => titleLower.includes(word));
}

function citationLabel(section, subsection) {
  return subsection == null ? `§${section}` : `§${section}.${subsection}`;
}

export function checkSectionCitations(rootInput, options = {}) {
  const root = resolve(rootInput);
  const readText = options.readText ?? defaultReadText;
  const fileExists = options.fileExists ?? ((path) => existsSync(resolve(root, path)));
  const markdownPaths = (options.markdownPaths ?? enumerateTrackedMarkdown(root))
    .filter((entry) => !isOutOfCitationScope(entry))
    .sort();

  const operatingModelText = readText(resolve(root, OPERATING_MODEL_PATH));
  const sections = parseOperatingModelHeadings(operatingModelText);
  const vendoredOperatingModelExists = fileExists(VENDORED_OPERATING_MODEL_PATH);

  const failures = [];
  const warnings = [];
  let citationsChecked = 0;
  const vendoredSourcesFlagged = new Set();

  for (const source of markdownPaths) {
    const text = readText(resolve(root, source));
    const lines = stripFencedCode(text).split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      for (const citation of extractCitations(lines[index])) {
        citationsChecked += 1;
        // Dangling-pointer-class check (generalizes the operating-model.md-not-
        // vendored defect): a vendored roles/guardrails file citing
        // docs/operating-model.md is only reachable from a plugin-only consumer
        // install if the vendored copy itself actually exists at
        // plugins/pipeline-core/docs/operating-model.md. This fires once per
        // citing vendored source file, not once per citation.
        if (
          source.startsWith(VENDOR_PREFIX) &&
          !vendoredOperatingModelExists &&
          !vendoredSourcesFlagged.has(source)
        ) {
          vendoredSourcesFlagged.add(source);
          failures.push(
            `${source}:${index + 1} -> cites ${OPERATING_MODEL_PATH} but ${VENDORED_OPERATING_MODEL_PATH} does not exist ` +
              `(dangling pointer in a plugin-only consumer install)`,
          );
        }
        const label = citationLabel(citation.section, citation.subsection);
        const resolved = resolveCitation(sections, citation.section, citation.subsection);
        if (resolved.status === "section-missing") {
          failures.push(`${source}:${index + 1} -> ${label}: section does not exist in ${OPERATING_MODEL_PATH}`);
          continue;
        }
        if (resolved.status === "subsection-missing") {
          failures.push(`${source}:${index + 1} -> ${label}: no subsection ${label} under §${citation.section} "${resolved.sectionTitle}" in ${OPERATING_MODEL_PATH}`);
          continue;
        }
        if (citation.description && !descriptionMatches(citation.description, resolved.title)) {
          warnings.push(`${source}:${index + 1} -> ${label} ("${citation.description}"): resolves to "${resolved.title}", description does not match`);
        }
      }
    }
  }

  failures.sort();
  warnings.sort();
  return {
    failures,
    warnings,
    stats: { markdownFiles: markdownPaths.length, citationsChecked },
  };
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex < 0 || rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-section-citations.mjs [--root <repository>]\n");
    process.exit(2);
  }
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const root = rootIndex === 0 ? args[1] : defaultRoot;
  try {
    const result = checkSectionCitations(root);
    for (const item of result.warnings) process.stderr.write(`SECTION-CITATION-WARN ${item}\n`);
    if (result.failures.length) {
      for (const item of result.failures) process.stderr.write(`SECTION-CITATION-FAIL ${item}\n`);
      process.stderr.write(`Section citations failed: ${result.failures.length} finding(s), ${result.warnings.length} warning(s).\n`);
      process.exit(2);
    }
    process.stdout.write(
      `Section citations valid: ${result.stats.markdownFiles} Markdown file(s), ${result.stats.citationsChecked} citation(s) checked, ${result.warnings.length} warning(s).\n`,
    );
  } catch (error) {
    process.stderr.write(`Section citations unavailable: ${error.message}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
