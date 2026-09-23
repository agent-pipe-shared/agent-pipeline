#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { auditLanguageCanon } from "./check-language-canon.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const script = join(scriptDir, "check-language-canon.mjs");
const marker = "<!-- DE-REFERENCE-BELOW | complete German reader copy -->";
const bilingual = ["README.md", "docs/operating-model.md"];
const englishOnly = ["SETUP.md", "docs/README.md", "docs/overview.md", "docs/usage.md", "docs/migration.md"];

function fixture({ mutate } = {}) {
  const root = mkdtempSync(join(tmpdir(), "language-canon-"));
  for (const path of bilingual) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    const text = `# English authority\n\nEnglish body.\n\n${marker}\n\n# Deutsche Lesefassung\n\nDeutscher Text.\n`;
    writeFileSync(file, mutate ? mutate(path, text) : text);
  }
  writeFileSync(join(root, "PIPELINE_FLOW.md"), mutate
    ? mutate("PIPELINE_FLOW.md", "# English flow\n\nEnglish body.\n\n[Deutsche Lesefassung](PIPELINE_FLOW.de.md)\n")
    : "# English flow\n\nEnglish body.\n\n[Deutsche Lesefassung](PIPELINE_FLOW.de.md)\n");
  writeFileSync(join(root, "PIPELINE_FLOW.de.md"), mutate
    ? mutate("PIPELINE_FLOW.de.md", "# Deutscher Ablauf\n\nDeutscher Text.\n")
    : "# Deutscher Ablauf\n\nDeutscher Text.\n");
  for (const path of englishOnly) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "# English only\n");
  }
  return root;
}

test("Hawkeye audit passes for two embedded translations and the linked German flow", () => {
  assert.deepEqual(auditLanguageCanon(repoRoot), []);
});

test("Hawkeye audit rejects missing, incomplete, and misplaced translation boundaries", () => {
  const root = fixture({
    mutate(path, text) {
      if (path === "README.md") return text.replace(marker, "");
      if (path === "PIPELINE_FLOW.md") return text.replace("](PIPELINE_FLOW.de.md)", "](missing.de.md)");
      if (path === "PIPELINE_FLOW.de.md") return text.replace("# Deutscher Ablauf", "Deutscher Ablauf");
      return text;
    },
  });
  try {
    const findings = auditLanguageCanon(root).join("\n");
    assert.match(findings, /README\.md: expected exactly one DE-REFERENCE-BELOW marker/);
    assert.match(findings, /PIPELINE_FLOW\.md: missing link to the German reader copy/);
    assert.match(findings, /PIPELINE_FLOW\.de\.md: complete German reader copy is missing/);
    writeFileSync(join(root, "SETUP.md"), `# English only\n\n${marker}\n`);
    assert.match(auditLanguageCanon(root).join("\n"), /SETUP\.md: English-only user document contains a German reference marker/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Hawkeye language scope is fixed to the maintained embedded and linked translations", () => {
  const source = readFileSync(script, "utf8");
  assert.match(source, /const bilingualFrontDoors = \["README\.md", "docs\/operating-model\.md"\]/);
  assert.match(source, /const splitTranslation = \{ english: "PIPELINE_FLOW\.md", german: "PIPELINE_FLOW\.de\.md" \}/);
  assert.match(source, /const englishOnlyUserDocs = \["SETUP\.md", "docs\/README\.md", "docs\/overview\.md", "docs\/usage\.md", "docs\/migration\.md"\]/);
});

test("the complete German Operating Model copy retains its boundary-aware Verify and QG-13 correction rules", () => {
  const text = readFileSync(join(repoRoot, "docs", "operating-model.md"), "utf8");
  const [english, german] = text.split("<!-- DE-REFERENCE-BELOW", 2);
  assert.ok(german, "expected the complete German reader-copy boundary");
  assert.match(english, /Verify is boundary-aware \(ADR-0081\)/);
  assert.match(german, /Verify ist grenzbewusst \(ADR-0081\)/);
  assert.match(english, /When the delivery contract explicitly requires actual\nindependent PASS/);
  assert.match(german, /Verlangt der Delivery-Vertrag\nausdrücklich einen tatsächlichen unabhängigen PASS/);
});
