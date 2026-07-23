#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * schema-lite.test.mjs -- test suite for the hand-rolled JSON-Schema validator
 * (schema-lite.mjs), extracted from plugins/pipeline-core/scripts/critic-bare.mjs.
 * Regression coverage for the original keyword set (type, enum,
 * required, array items) is a subset of critic-bare.test.mjs's SCHEMA cases, which
 * stay green unmodified (proof of behavior-identical extraction). This file adds
 * standalone type/enum/required/array cases plus the NEW additionalProperties-as-
 * schema extension (accept + reject).
 *
 * Run:   node plugins/pipeline-core/lib/schema-lite.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { validateAgainstSchema } from "./schema-lite.mjs";

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

// ---- type ------------------------------------------------------------------------------
{
  const schema = { type: "string" };
  const ok = validateAgainstSchema("hello", schema);
  record("TYPE match  a string value passes a {type: string} schema", ok.valid && ok.errors.length === 0, JSON.stringify(ok));
}
{
  const schema = { type: "string" };
  const bad = validateAgainstSchema(42, schema);
  record(
    "TYPE mismatch  a number fails a {type: string} schema and names the expected/actual type",
    !bad.valid && bad.errors.some((e) => e.includes('expected type "string"') && e.includes('got "number"')),
    JSON.stringify(bad),
  );
}
{
  const schema = { type: ["string", "null"] };
  const ok1 = validateAgainstSchema(null, schema);
  const ok2 = validateAgainstSchema("x", schema);
  record("TYPE array  a type array [\"string\",\"null\"] accepts either listed type", ok1.valid && ok2.valid, `ok1=${JSON.stringify(ok1)} ok2=${JSON.stringify(ok2)}`);
}

// ---- enum ------------------------------------------------------------------------------
{
  const schema = { type: "string", enum: ["a", "b", "c"] };
  const ok = validateAgainstSchema("b", schema);
  const bad = validateAgainstSchema("z", schema);
  record(
    "ENUM  a value in the enum passes, one outside it fails and is named",
    ok.valid && !bad.valid && bad.errors.some((e) => e.includes('"z"') && e.includes("is not one of")),
    `ok=${JSON.stringify(ok)} bad=${JSON.stringify(bad)}`,
  );
}

// ---- required --------------------------------------------------------------------------
{
  const schema = { type: "object", required: ["a", "b"], properties: { a: { type: "string" }, b: { type: "number" } } };
  const ok = validateAgainstSchema({ a: "x", b: 1 }, schema);
  const bad = validateAgainstSchema({ a: "x" }, schema);
  record(
    "REQUIRED  a complete object passes, a missing required property fails and names it",
    ok.valid && !bad.valid && bad.errors.some((e) => e.includes('missing required property "b"')),
    `ok=${JSON.stringify(ok)} bad=${JSON.stringify(bad)}`,
  );
}

// ---- array (items) ------------------------------------------------------------------------
{
  const schema = { type: "array", items: { type: "number" } };
  const ok = validateAgainstSchema([1, 2, 3], schema);
  const bad = validateAgainstSchema([1, "two", 3], schema);
  record(
    "ARRAY items  every array item is validated against `items`, a bad one is named by index",
    ok.valid && !bad.valid && bad.errors.some((e) => e.includes("[1]") && e.includes('expected type "number"')),
    `ok=${JSON.stringify(ok)} bad=${JSON.stringify(bad)}`,
  );
}

// ---- additionalProperties: false (original behavior, unchanged) ---------------------------
{
  const schema = { type: "object", properties: { a: { type: "string" } }, additionalProperties: false };
  const ok = validateAgainstSchema({ a: "x" }, schema);
  const bad = validateAgainstSchema({ a: "x", extra: 1 }, schema);
  record(
    "ADDPROPS false  additionalProperties:false rejects any extra key (original semantics unchanged)",
    ok.valid && !bad.valid && bad.errors.some((e) => e.includes('unexpected additional property "extra"')),
    `ok=${JSON.stringify(ok)} bad=${JSON.stringify(bad)}`,
  );
}

// ---- additionalProperties absent/true (original behavior, unchanged) ----------------------
{
  const schema = { type: "object", properties: { a: { type: "string" } } };
  const result = validateAgainstSchema({ a: "x", extra: { anything: "goes" } }, schema);
  record(
    "ADDPROPS absent  no additionalProperties keyword leaves extra keys unchecked (original semantics unchanged)",
    result.valid && result.errors.length === 0,
    JSON.stringify(result),
  );
}

// ---- NEW: additionalProperties as a schema object (additive extension) --------------------
{
  const schema = {
    type: "object",
    properties: { name: { type: "string" } },
    additionalProperties: { type: "string" },
  };
  const ok = validateAgainstSchema({ name: "Bofur", note: "a dwarf", tag: "hero" }, schema);
  record(
    "ADDPROPS schema-accept  extra keys whose values match the additionalProperties schema pass",
    ok.valid && ok.errors.length === 0,
    JSON.stringify(ok),
  );
}
{
  const schema = {
    type: "object",
    properties: { name: { type: "string" } },
    additionalProperties: { type: "string" },
  };
  const bad = validateAgainstSchema({ name: "Bofur", note: 42 }, schema);
  record(
    "ADDPROPS schema-reject  an extra key whose value fails the additionalProperties schema is named with its path",
    !bad.valid && bad.errors.some((e) => e.includes("$.note") && e.includes('expected type "string"')),
    JSON.stringify(bad),
  );
}
{
  // Declared (listed) properties are exempt from additionalProperties-as-schema checks -- only
  // UNLISTED keys are validated against it, matching the additionalProperties:false precedent.
  const schema = {
    type: "object",
    properties: { name: { type: "number" } }, // deliberately a type the "note" value would fail
    additionalProperties: { type: "string" },
  };
  const result = validateAgainstSchema({ name: 1, note: "fine" }, schema);
  record(
    "ADDPROPS schema-scope  additionalProperties-as-schema only applies to UNLISTED keys, not declared properties",
    result.valid && result.errors.length === 0,
    JSON.stringify(result),
  );
}
{
  // Nested object schema as additionalProperties -- recursion through validateNode.
  const schema = {
    type: "object",
    properties: {},
    additionalProperties: { type: "object", required: ["id"], properties: { id: { type: "number" } } },
  };
  const ok = validateAgainstSchema({ item: { id: 1 } }, schema);
  const bad = validateAgainstSchema({ item: { id: "not-a-number" } }, schema);
  record(
    "ADDPROPS schema-nested  additionalProperties may itself be a nested object schema, recursively validated",
    ok.valid && !bad.valid && bad.errors.some((e) => e.includes("$.item.id")),
    `ok=${JSON.stringify(ok)} bad=${JSON.stringify(bad)}`,
  );
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
