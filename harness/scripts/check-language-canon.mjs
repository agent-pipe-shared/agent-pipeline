#!/usr/bin/env node
/**
 * Narrow P4 contract: ADR-0011 permits one marked German reader aid only on
 * the four named English-canonical public front doors. This is deliberately
 * not a general language checker or a repository-wide documentation scan.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMarkdownLinks } from "./check-doc-contracts.mjs";

const readerAid = "> _A German version follows below · Eine deutsche Fassung folgt weiter unten._";
const deReferenceMarker = "DE-REFERENCE-BELOW";
const frontDoors = ["README.md", "SETUP.md", "docs/overview.md", "docs/usage.md"];
const docsReadme = "docs/README.md";
const removedForms = [readerAid, deReferenceMarker, "Die deutsche Fassung ist eine Übersetzung des englischen Originals."];
const germanReferenceTargets = new Map([
  ["README.md", "docs/deploy/README.md"],
  ["SETUP.md", "docs/design/README.md"],
  ["docs/overview.md", "../README.md"],
  ["docs/usage.md", "../SETUP.md"],
]);

function occurrences(text, value) {
  return text.split(value).length - 1;
}

export function auditLanguageCanon(root) {
  const findings = [];
  for (const path of frontDoors) {
    const text = readFileSync(join(root, path), "utf8");
    const readerAidAt = text.indexOf(readerAid);
    const markerAt = text.indexOf(deReferenceMarker);
    if (occurrences(text, readerAid) !== 1) findings.push(`${path}: expected exactly one ADR-0011 German reader aid`);
    if (occurrences(text, deReferenceMarker) !== 1) findings.push(`${path}: expected exactly one DE-REFERENCE-BELOW marker`);
    if (!text.startsWith("# ")) findings.push(`${path}: expected English-first front-door heading`);
    if (readerAidAt < 0 || markerAt <= readerAidAt) findings.push(`${path}: expected reader aid before the post-English-body marker`);
    const target = germanReferenceTargets.get(path);
    const link = extractMarkdownLinks(text).find((entry) => entry.destination === target && entry.line > text.slice(0, markerAt).split("\n").length);
    if (!link) findings.push(`${path}: German reader-aid reference lacks its fixed local link target ${target}`);
    else if (!existsSync(resolve(root, dirname(path), target))) findings.push(`${path}: German reader-aid local link target is missing`);
  }

  const docsText = readFileSync(join(root, docsReadme), "utf8");
  for (const form of removedForms) {
    if (docsText.includes(form)) findings.push(`${docsReadme}: unapproved German reader-aid form remains`);
  }
  return findings;
}

const invokedPath = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedPath) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const findings = auditLanguageCanon(repoRoot);
  if (findings.length) {
    process.stderr.write(`${findings.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write(`language-canon: ${frontDoors.length} front doors; ${docsReadme} clear\n`);
}
