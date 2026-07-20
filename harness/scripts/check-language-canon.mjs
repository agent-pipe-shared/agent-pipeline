#!/usr/bin/env node
/**
 * Hawkeye user-document language boundary. English is authoritative; exactly
 * three maintained user documents carry a complete German reader copy below a
 * bounded marker. Redirects and task guides remain English-only so they never
 * become a second maintained translation surface.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const deReferenceMarker = "DE-REFERENCE-BELOW";
const bilingualFrontDoors = ["README.md", "PIPELINE_FLOW.md", "docs/operating-model.md"];
const englishOnlyUserDocs = ["SETUP.md", "docs/README.md", "docs/overview.md", "docs/usage.md", "docs/migration.md"];

function occurrences(text, value) {
  return text.split(value).length - 1;
}

export function auditLanguageCanon(root) {
  const findings = [];
  for (const path of bilingualFrontDoors) {
    const text = readFileSync(join(root, path), "utf8");
    const markerAt = text.indexOf(deReferenceMarker);
    if (!text.startsWith("# ")) findings.push(`${path}: expected an English-first front-door heading`);
    if (occurrences(text, deReferenceMarker) !== 1) {
      findings.push(`${path}: expected exactly one DE-REFERENCE-BELOW marker`);
      continue;
    }
    const before = text.slice(0, markerAt).trim();
    const after = text.slice(markerAt + deReferenceMarker.length).replace(/^[^\n]*\n/, "").trim();
    if (!before.includes("\n")) findings.push(`${path}: English authority body is missing before the German marker`);
    if (!after.startsWith("# ")) findings.push(`${path}: complete German reader copy must begin after the marker`);
  }
  for (const path of englishOnlyUserDocs) {
    const text = readFileSync(join(root, path), "utf8");
    if (text.includes(deReferenceMarker)) findings.push(`${path}: English-only user document contains a German reference marker`);
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
  process.stdout.write(`language-canon: ${bilingualFrontDoors.length} bilingual front doors; ${englishOnlyUserDocs.length} English-only user documents clear\n`);
}
