#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkCompletenessVocabularyDoclint,
  DEFAULT_ROOT,
  DEFAULT_SCANNED_FILES,
} from "./check-completeness-vocabulary-doclint.mjs";

const roots = [];
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
}
function write(root, path, text) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}
function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "completeness-vocab-doclint-"));
  roots.push(root);
  return root;
}

{
  const root = fixtureRoot();
  write(root, "guardrails/security.md", "A capability may be unavailable (not applicable) for this project.\n");
  write(root, "guardrails/quality-gates.md", "No conflation here.\n");
  write(root, "docs/operating-model.md", "No conflation here either.\n");
  const result = checkCompletenessVocabularyDoclint(root, DEFAULT_SCANNED_FILES);
  check(
    "CVD01 flags a parenthetical unavailable(not-applicable) conflation with file/line",
    !result.ok && result.findings.some((f) => f.startsWith("guardrails/security.md:1:") && f.includes("conflation")),
    result.findings.join("; "),
  );
}

{
  const root = fixtureRoot();
  write(root, "guardrails/security.md", "not-applicable, i.e. unavailable, is how some tools report a skip.\n");
  write(root, "guardrails/quality-gates.md", "clean.\n");
  write(root, "docs/operating-model.md", "clean.\n");
  const result = checkCompletenessVocabularyDoclint(root, DEFAULT_SCANNED_FILES);
  check(
    "CVD02 flags a 'not-applicable, i.e. unavailable' conflation",
    !result.ok && result.findings.some((f) => f.startsWith("guardrails/security.md:1:")),
    result.findings.join("; "),
  );
}

{
  const root = fixtureRoot();
  write(root, "guardrails/security.md", "unavailable means not-applicable for reporting purposes.\n");
  write(root, "guardrails/quality-gates.md", "clean.\n");
  write(root, "docs/operating-model.md", "clean.\n");
  const result = checkCompletenessVocabularyDoclint(root, DEFAULT_SCANNED_FILES);
  check(
    "CVD03 flags an 'X means Y' direct-equivalence conflation",
    !result.ok && result.findings.some((f) => f.startsWith("guardrails/security.md:1:")),
    result.findings.join("; "),
  );
}

{
  const root = fixtureRoot();
  write(
    root,
    "guardrails/security.md",
    "- **clean** — a.\n- **complete** — b.\n- **unavailable** — c.\n- **unsupported** — d.\n- **waived** — e.\n- **not-applicable** — f.\n" +
      "unavailable means the capability could not be verified right now, which is a different claim from not-applicable, meaning the capability was never in scope.\n",
  );
  write(root, "guardrails/quality-gates.md", "unavailable and not-applicable are opposite claims, not degrees of the same thing.\n");
  write(root, "docs/operating-model.md", "An unavailable duty is a temporary gap; a not-applicable one was never in scope.\n");
  const result = checkCompletenessVocabularyDoclint(root, DEFAULT_SCANNED_FILES);
  check(
    "CVD04 does not flag prose that carefully distinguishes the two terms in the same sentence",
    result.ok,
    result.findings.join("; "),
  );
}

{
  const root = fixtureRoot();
  write(root, "guardrails/quality-gates.md", "clean.\n");
  write(root, "docs/operating-model.md", "clean.\n");
  const result = checkCompletenessVocabularyDoclint(root, DEFAULT_SCANNED_FILES);
  check(
    "CVD05 reports a missing scanned file as a finding rather than throwing",
    !result.ok && result.findings.some((f) => f.startsWith("guardrails/security.md: missing or unreadable")),
    result.findings.join("; "),
  );
}

{
  // Proves the finished lint passes clean against THIS repo's real current
  // doc content, including SEC-09's own new prose (DoD item 3b).
  const result = checkCompletenessVocabularyDoclint(DEFAULT_ROOT, DEFAULT_SCANNED_FILES);
  check(
    "CVD06 passes clean against the real repo's current scanned docs (incl. SEC-09)",
    result.ok,
    result.findings.join("; "),
  );
}

{
  // F6, CYB-2I-4R: today's real guardrails/security.md must pass the new
  // six-term-presence check on its own (not merely as a side effect of no
  // conflation pattern matching).
  const root = fixtureRoot();
  write(
    root,
    "guardrails/security.md",
    "- **clean** — a.\n- **complete** — b.\n- **unavailable** — c.\n- **unsupported** — d.\n- **waived** — e.\n- **not-applicable** — f.\n",
  );
  write(root, "guardrails/quality-gates.md", "clean.\n");
  write(root, "docs/operating-model.md", "clean.\n");
  const result = checkCompletenessVocabularyDoclint(root, DEFAULT_SCANNED_FILES);
  check(
    "CVD07 passes when all six SEC-09 term-definition anchors are present",
    result.ok,
    result.findings.join("; "),
  );
}

{
  // F6: removing one of the six terms' definition anchor (here: "waived")
  // must fail, naming exactly that term -- proves AC13's "all six terms
  // defined distinctly" half is actually enforced, not just the
  // non-conflation half. Deleting the whole SEC-09 section would previously
  // leave this lint at exit 0; this is the regression guard for that gap.
  const root = fixtureRoot();
  write(
    root,
    "guardrails/security.md",
    "- **clean** — a.\n- **complete** — b.\n- **unavailable** — c.\n- **unsupported** — d.\n- **not-applicable** — f.\n",
  );
  write(root, "guardrails/quality-gates.md", "clean.\n");
  write(root, "docs/operating-model.md", "clean.\n");
  const result = checkCompletenessVocabularyDoclint(root, DEFAULT_SCANNED_FILES);
  check(
    "CVD08 fails when the 'waived' definition anchor is missing, naming it",
    !result.ok && result.findings.some((f) => f.includes("waived") && f.startsWith("guardrails/security.md:")),
    result.findings.join("; "),
  );
}

{
  // F6: a bare substring mention of a term (not the bold-list-item
  // convention) must NOT count as a definition -- guards against a false
  // pass via unrelated prose that merely uses the word.
  const root = fixtureRoot();
  write(
    root,
    "guardrails/security.md",
    "- **clean** — a.\n- **complete** — b.\n- **unavailable** — c.\n- **unsupported** — d.\n- **not-applicable** — f.\nSome unrelated sentence mentions a waived fee elsewhere.\n",
  );
  write(root, "guardrails/quality-gates.md", "clean.\n");
  write(root, "docs/operating-model.md", "clean.\n");
  const result = checkCompletenessVocabularyDoclint(root, DEFAULT_SCANNED_FILES);
  check(
    "CVD09 does not accept a bare substring mention as a 'waived' definition anchor",
    !result.ok && result.findings.some((f) => f.includes("waived")),
    result.findings.join("; "),
  );
}

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`1..${passed + failed}`);
console.log(`# pass ${passed}`);
if (failed) { console.log(`# fail ${failed}`); process.exitCode = 1; }
