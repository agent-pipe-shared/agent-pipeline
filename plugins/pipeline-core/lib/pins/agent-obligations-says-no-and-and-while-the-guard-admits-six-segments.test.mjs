#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: pipeline.agent-obligations-says-no-and-and-while-the-guard-admits-six-segments (AC-107).
 *
 * The original defect: agent-obligations section 1 said "No `&&`" while the lifecycle guard
 * admits up to MAX_AND_CHAIN_SEGMENTS `&&`-chained segments when every segment is itself an
 * admitted shape. Each case drives the real generator and the real guard modules.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { OBLIGATIONS_PATH, renderAgentObligations } from "../../../../harness/scripts/generate-agent-obligations.mjs";
import { ADMITTED_GRAMMAR_SHAPES, MAX_AND_CHAIN_SEGMENTS } from "../guard/grammar-denials.mjs";
import { isReadOnlyDiagnosticCommand } from "../guard/shell-grammar.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PROBE = "rg -n needle CLAUDE.md";
const chain = (n, segment = PROBE) => Array.from({ length: n }, () => segment).join(" && ");
const admitted = (command) => isReadOnlyDiagnosticCommand(command, REPO_ROOT) === true;
const section1 = (document) => {
  const start = document.indexOf("## 1. One simple command per Bash call");
  const end = document.indexOf("### 1a.");
  assert.ok(start >= 0 && end > start, "section 1 must be locatable");
  return document.slice(start, end);
};

test("AP1: the guard's chain bound is 6 and the bound is exported as data", () => {
  assert.equal(MAX_AND_CHAIN_SEGMENTS, 6);
});

test("AP2: the guard admits a chain of exactly the bound and refuses one segment more", () => {
  assert.equal(admitted(PROBE), true, "fixture segment must be admitted on its own");
  assert.equal(admitted(chain(2)), true);
  assert.equal(admitted(chain(MAX_AND_CHAIN_SEGMENTS)), true, "six read-only segments must be admitted");
  assert.equal(admitted(chain(MAX_AND_CHAIN_SEGMENTS + 1)), false, "seven segments must be refused");
});

test("AP3: a chain with one non-admitted segment, or a redirect or semicolon, stays refused", () => {
  assert.equal(admitted(`${PROBE} && rm -rf scratch/x`), false);
  assert.equal(admitted(`${PROBE} && rg -n needle CLAUDE.md > scratch/out.txt`), false);
  assert.equal(admitted(`${PROBE} ; ${PROBE}`), false);
});

test("AP4: section 1 no longer says a flat 'No &&' and states the guard's bound", () => {
  const text = section1(readFileSync(OBLIGATIONS_PATH, "utf8"));
  assert.doesNotMatch(text, /No\s+`&&`/u, "section 1 must not forbid && outright");
  assert.match(text, /No `;`, no redirects/u, "; and redirects stay forbidden");
  const flat = text.replace(/\s+/gu, " ");
  const match = /`&&` is admitted only as up to (\d+) segments, and only when every segment is itself an admitted read-only shape/u.exec(flat);
  assert.ok(match, "section 1 must state the bounded && rule");
  assert.equal(Number(match[1]), MAX_AND_CHAIN_SEGMENTS, "document bound must equal the guard's bound");
});

test("AP5: the document's own chained example is admitted by the guard", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.match(document, /`git status && git log`/u);
  assert.equal(admitted("git status && git log"), true);
});

test("AP6: the guard's refusal grammar lists the same bound the document states", () => {
  const shape = ADMITTED_GRAMMAR_SHAPES.find((entry) => /&&/u.test(entry.spelling));
  assert.ok(shape, "the admitted-grammar table must list the && shape");
  assert.match(shape.spelling, new RegExp(`up to ${MAX_AND_CHAIN_SEGMENTS} `, "u"));
  // The table's placeholder target does not exist in this checkout; substitute a real in-repo file.
  assert.equal(admitted(shape.example.replaceAll("probe.txt", "CLAUDE.md")), true, "the table's own example must be admitted");
});

test("AP7: the committed canonical and vendored documents equal a fresh generation", () => {
  const committed = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.equal(renderAgentObligations(), committed);
  const vendored = readFileSync(join(REPO_ROOT, "plugins", "pipeline-core", "templates", "prompts", "agent-obligations.md"), "utf8");
  assert.equal(vendored, committed);
});
