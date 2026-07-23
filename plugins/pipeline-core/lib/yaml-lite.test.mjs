#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * yaml-lite.test.mjs -- test suite for the strict-subset YAML parser (yaml-lite.mjs).
 *
 * Same plain-assertion + "N/N cases passed." output convention as
 * plugins/pipeline-core/hooks/guard-git.test.mjs / scripts/critic-bare.test.mjs.
 *
 * Run:   node plugins/pipeline-core/lib/yaml-lite.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseYaml, parseYamlFile, YamlLiteError } from "./yaml-lite.mjs";

let pass = 0;
const failures = [];
function record(id, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${id} -- ${detail}`);
  }
}

/** Asserts parseYaml(text) deep-equals expected (via JSON round-trip comparison). */
function checkParses(id, text, expected) {
  let actual;
  let err;
  try {
    actual = parseYaml(text);
  } catch (e) {
    err = e;
  }
  const actualJson = err ? undefined : JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  record(id, !err && actualJson === expectedJson, err ? `threw: ${err.message}` : `got ${actualJson}, expected ${expectedJson}`);
}

/** Asserts parseYaml(text) throws a YamlLiteError with the given line number. */
function checkThrows(id, text, expectedLine, { messageIncludes } = {}) {
  let threw = null;
  try {
    parseYaml(text);
  } catch (e) {
    threw = e;
  }
  const problems = [];
  if (!threw) problems.push("expected a throw, got none");
  else {
    if (!(threw instanceof YamlLiteError)) problems.push(`not a YamlLiteError (name=${threw.name})`);
    if (threw.line !== expectedLine) problems.push(`line=${threw.line} (expected ${expectedLine})`);
    if (messageIncludes && !threw.message.includes(messageIncludes)) {
      problems.push(`message missing "${messageIncludes}" (got: ${threw.message})`);
    }
  }
  record(id, problems.length === 0, problems.join("; "));
}

// ---- flat map ------------------------------------------------------------------------------
checkParses("MAP flat  simple key: value pairs", "name: Bofur\nage: 42\nactive: true\n", {
  name: "Bofur",
  age: 42,
  active: true,
});

// ---- nested map ----------------------------------------------------------------------------
checkParses("MAP nested  2-space indent nesting", "outer:\n  inner:\n    leaf: 1\n    other: two\n", {
  outer: { inner: { leaf: 1, other: "two" } },
});

// ---- block list of scalars ------------------------------------------------------------------
checkParses("LIST scalars  block list of plain scalar items", "items:\n  - a\n  - b\n  - c\n", {
  items: ["a", "b", "c"],
});

// ---- block list of maps (phases[]-like shape) ------------------------------------------------
checkParses(
  "LIST maps  phases[]-like block list of maps",
  "phases:\n  - name: p1\n    id: 1\n  - name: p2\n    id: 2\n",
  { phases: [{ name: "p1", id: 1 }, { name: "p2", id: 2 }] },
);

// ---- comment handling, incl. `#` inside quotes not stripped -----------------------------------
checkParses("COMMENT full-line  a comment-only line is dropped", "# just a comment\nkey: value\n", { key: "value" });
checkParses(
  "COMMENT trailing  trailing `# comment` is stripped after a value",
  "key: value # trailing comment\n",
  { key: "value" },
);
checkParses(
  "COMMENT quoted  `#` inside a quoted scalar is literal, NOT stripped as a comment",
  'label: "a#b" # trailing comment\n',
  { label: "a#b" },
);

// ---- quoted strings containing `:` -----------------------------------------------------------
checkParses(
  "QUOTE colon  a quoted scalar may contain `:` without being split as a key",
  'url: "http://example.com:8080"\n',
  { url: "http://example.com:8080" },
);
checkParses("QUOTE single  single-quoted scalar containing `:`", "url: 'a:b:c'\n", { url: "a:b:c" });

// ---- empty []/{} literals -----------------------------------------------------------------
checkParses("FLOW empty  empty [] and {} literals", "tags: []\nmeta: {}\n", { tags: [], meta: {} });

// ---- bool/int coercion ----------------------------------------------------------------------
checkParses(
  "SCALAR coerce  bool/int coercion, quoted values stay strings",
  'flag_true: true\nflag_false: false\ncount: 7\nnegative: -3\nquoted_num: "7"\n',
  { flag_true: true, flag_false: false, count: 7, negative: -3, quoted_num: "7" },
);

// ---- bad indent error ------------------------------------------------------------------------
checkThrows("ERR indent  inconsistent nested indentation is rejected with the offending line", "a:\n  b: 1\n   c: 2\n", 3);

// ---- tab error --------------------------------------------------------------------------------
checkThrows("ERR tab  a tab in indentation is rejected", "a:\n\tb: 1\n", 2, { messageIncludes: "tab" });

// ---- duplicate-key error ------------------------------------------------------------------------
checkThrows("ERR dup  a duplicate key within the same mapping is rejected", "a: 1\na: 2\n", 2, { messageIncludes: "duplicate key" });
checkThrows(
  "ERR dup nested  a duplicate key within a nested list-item map is rejected",
  "phases:\n  - name: p1\n    name: p2\n",
  3,
  { messageIncludes: "duplicate key" },
);

// ---- anchor/alias/tag/|/> rejection -------------------------------------------------------------
checkThrows("ERR anchor  an anchor (&name) is rejected", "key: &anchor value\n", 1, { messageIncludes: "anchor" });
checkThrows("ERR alias  an alias (*name) is rejected", "key: *alias\n", 1, { messageIncludes: "alias" });
checkThrows("ERR tag  a tag (!tag) is rejected", "key: !tag value\n", 1, { messageIncludes: "tag" });
checkThrows("ERR literal-block  a literal block scalar (|) is rejected", "key: |\n  text\n", 1, { messageIncludes: "literal block scalar" });
checkThrows("ERR folded-block  a folded block scalar (>) is rejected", "key: >\n  text\n", 1, { messageIncludes: "folded block scalar" });

// ---- multi-doc rejection -----------------------------------------------------------------------
checkThrows("ERR multidoc  a `---` document separator is rejected", "---\na: 1\n", 1, { messageIncludes: "multi-document" });
checkThrows("ERR multidoc-end  a `...` document end marker is rejected", "a: 1\n...\n", 2, { messageIncludes: "multi-document" });

// ---- flow collections beyond empty (bonus coverage of the "unsupported flow syntax" clause) -----
checkThrows("ERR flow-seq  a non-empty flow sequence [1, 2] is rejected", "a: [1, 2]\n", 1, { messageIncludes: "flow-style" });
checkThrows("ERR flow-map  a non-empty flow mapping {a: 1} is rejected", "a: {b: 1}\n", 1, { messageIncludes: "flow-style" });

// ---- bare scalar document (bonus: not in the DoD list, but cheap correctness coverage) ----------
checkParses("SCALAR bare  a single bare scalar line is a whole document", "hello world\n", "hello world");

// ---- parseYamlFile (reads from disk) -------------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), "yaml-lite-test-"));
  const file = join(dir, "sample.yaml");
  writeFileSync(file, "name: Bofur\ncount: 3\n");
  const result = parseYamlFile(file);
  record(
    "FILE parseYamlFile  reads utf8 from disk and parses it",
    JSON.stringify(result) === JSON.stringify({ name: "Bofur", count: 3 }),
    `result=${JSON.stringify(result)}`,
  );
  rmSync(dir, { recursive: true, force: true });
}

// ---- Summary ------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
