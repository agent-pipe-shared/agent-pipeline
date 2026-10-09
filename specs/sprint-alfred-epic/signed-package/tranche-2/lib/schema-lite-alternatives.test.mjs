#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Independent RED contract for exact oneOf support in schema-lite. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { validateAgainstSchema } from "./schema-lite.mjs";

const legacy = {
  type: "object",
  required: ["kind", "legacy"],
  properties: {
    kind: { type: "string", enum: ["legacy"] },
    legacy: { type: "number", enum: [1] },
  },
  additionalProperties: false,
};
const shared = {
  type: "object",
  required: ["kind", "allocation"],
  properties: {
    kind: { type: "string", enum: ["shared"] },
    allocation: { type: "string", enum: ["shared"] },
  },
  additionalProperties: false,
};
const alternatives = { type: "object", oneOf: [legacy, shared] };

registerTestCaseCompletion({
  fd: 3,
  maxBytes: 32_768,
  cases: [
    {
      id: "SC-ALTERNATIVES-ACCEPT",
      name: "each exact closed alternative accepts",
      run() {
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1 }, alternatives).valid, true);
        assert.equal(validateAgainstSchema({ kind: "shared", allocation: "shared" }, alternatives).valid, true);
      },
    },
    {
      id: "SC-ALTERNATIVES-AMBIGUOUS",
      name: "a value matching more than one branch refuses under oneOf",
      run() {
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1 }, alternatives).valid, true);
        const ambiguous = {
          type: "object",
          oneOf: [
            { type: "object", required: ["value"], properties: { value: { type: "number" } } },
            { type: "object", required: ["value"], properties: { value: { type: "number" } } },
          ],
        };
        assert.equal(validateAgainstSchema({ value: 1 }, ambiguous).valid, false);
      },
    },
    {
      id: "SC-ALTERNATIVES-CLOSED",
      name: "unmatched, mixed, and unknown-key objects refuse",
      run() {
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1 }, alternatives).valid, true);
        assert.equal(validateAgainstSchema({ kind: "other", value: 1 }, alternatives).valid, false);
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1, allocation: "shared" }, alternatives).valid, false);
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1, extra: true }, alternatives).valid, false);
      },
    },
    {
      id: "SC-ALTERNATIVES-MALFORMED",
      name: "malformed oneOf declarations refuse",
      run() {
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1 }, alternatives).valid, true);
        for (const oneOf of [null, {}, [], [null], ["branch"], [1]]) {
          assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1 }, { type: "object", oneOf }).valid, false);
        }
      },
    },
    {
      id: "SC-ALTERNATIVES-NESTED-ARRAY",
      name: "oneOf is enforced in nested properties and array items",
      run() {
        const nested = {
          type: "object",
          required: ["choice", "choices"],
          properties: {
            choice: { oneOf: [legacy, shared] },
            choices: { type: "array", items: { oneOf: [legacy, shared] } },
          },
          additionalProperties: false,
        };
        assert.equal(validateAgainstSchema({
          choice: { kind: "legacy", legacy: 1 },
          choices: [{ kind: "shared", allocation: "shared" }],
        }, nested).valid, true);
        assert.equal(validateAgainstSchema({
          choice: { kind: "legacy", legacy: 1, extra: true },
          choices: [{ kind: "shared", allocation: "shared" }],
        }, nested).valid, false);
        assert.equal(validateAgainstSchema({
          choice: { kind: "legacy", legacy: 1 },
          choices: [{ kind: "shared", allocation: "shared", extra: true }],
        }, nested).valid, false);
      },
    },
    {
      id: "SC-ALTERNATIVES-Z-REGRESSION",
      name: "schemas without oneOf retain type required and additionalProperties behavior",
      run() {
        const schema = {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
          additionalProperties: false,
        };
        assert.equal(validateAgainstSchema({ name: "Ada" }, schema).valid, true);
        assert.equal(validateAgainstSchema({ name: 42 }, schema).valid, false);
        assert.equal(validateAgainstSchema({}, schema).valid, false);
        assert.equal(validateAgainstSchema({ name: "Ada", extra: true }, schema).valid, false);
      },
    },
    {
      id: "SC-ALTERNATIVES-ZZ-MATCH",
      name: "a value matching no alternative refuses",
      run() {
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1 }, alternatives).valid, true);
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: "one" }, alternatives).valid, false);
      },
    },
    {
      id: "SC-REF-CYCLE",
      name: "cyclic local references terminate and refuse within a bounded subprocess",
      run() {
        const moduleUrl = new URL("./schema-lite.mjs", import.meta.url).href;
        const code = "import {validateAgainstSchema} from " + JSON.stringify(moduleUrl) + "; const s={$defs:{a:{$ref:'#/$defs/b'},b:{$ref:'#/$defs/a'}},$ref:'#/$defs/a'}; console.log(JSON.stringify(validateAgainstSchema('value',s)));";
        const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 2000, maxBuffer: 65536 });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0);
        const validation = JSON.parse(result.stdout);
        assert.equal(validation.valid, false);
        assert.ok(validation.errors.length > 0);
      },
    },
    {
      id: "SC-REF-DISJOINT",
      name: "exactly one disjoint referenced branch accepts each valid alternative",
      run() {
        const schema = { $defs: { legacy, shared }, oneOf: [{ $ref: "#/$defs/legacy" }, { $ref: "#/$defs/shared" }] };
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1 }, schema).valid, true);
        assert.equal(validateAgainstSchema({ kind: "shared", allocation: "shared" }, schema).valid, true);
        assert.equal(validateAgainstSchema({ kind: "other" }, schema).valid, false);
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1, extra: true }, schema).valid, false);
      },
    },
    {
      id: "SC-REF-LOCAL",
      name: "local defs references enforce type required enum and closed objects",
      run() {
        const schema = { $defs: { legacy }, $ref: "#/$defs/legacy" };
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1 }, schema).valid, true);
        assert.equal(validateAgainstSchema("legacy", schema).valid, false);
        assert.equal(validateAgainstSchema({ kind: "legacy" }, schema).valid, false);
        assert.equal(validateAgainstSchema({ kind: "other", legacy: 1 }, schema).valid, false);
        assert.equal(validateAgainstSchema({ kind: "legacy", legacy: 1, extra: true }, schema).valid, false);
      },
    },
    {
      id: "SC-REF-NESTED",
      name: "root definitions stay available through properties array items and extra values",
      run() {
        const schema = { $defs: { legacy }, type: "object", required: ["choice", "choices"], properties: { choice: { $ref: "#/$defs/legacy" }, choices: { type: "array", items: { $ref: "#/$defs/legacy" } } }, additionalProperties: { $ref: "#/$defs/legacy" } };
        const value = { kind: "legacy", legacy: 1 };
        assert.equal(validateAgainstSchema({ choice: value, choices: [value], extra: value }, schema).valid, true);
        assert.equal(validateAgainstSchema({ choice: {}, choices: [value] }, schema).valid, false);
        assert.equal(validateAgainstSchema({ choice: value, choices: [{}] }, schema).valid, false);
        assert.equal(validateAgainstSchema({ choice: value, choices: [value], extra: {} }, schema).valid, false);
      },
    },
    {
      id: "SC-REF-NULLABLE",
      name: "referenced object containing nullable referenced receipt accepts null and evidence",
      run() {
        const schema = { $defs: { evidence: { type: "object", required: ["path"], properties: { path: { type: "string" } }, additionalProperties: false }, advisor: { type: "object", required: ["receipt"], properties: { receipt: { oneOf: [{ type: "null" }, { $ref: "#/$defs/evidence" }] } }, additionalProperties: false } }, type: "object", required: ["advisor"], properties: { advisor: { $ref: "#/$defs/advisor" } }, additionalProperties: false };
        assert.equal(validateAgainstSchema({ advisor: { receipt: null } }, schema).valid, true);
        assert.equal(validateAgainstSchema({ advisor: { receipt: { path: "evidence/receipt.json" } } }, schema).valid, true);
        assert.equal(validateAgainstSchema({ advisor: { receipt: 42 } }, schema).valid, false);
        assert.equal(validateAgainstSchema({ advisor: { receipt: { path: "evidence/receipt.json", extra: true } } }, schema).valid, false);
      },
    },
    {
      id: "SC-REF-OVERLAP",
      name: "overlapping referenced branches refuse when both match",
      run() {
        const schema = { $defs: { first: { type: "string" }, second: { type: "string", enum: ["shared"] } }, oneOf: [{ $ref: "#/$defs/first" }, { $ref: "#/$defs/second" }] };
        assert.equal(validateAgainstSchema("shared", schema).valid, false);
        assert.equal(validateAgainstSchema("only-first", schema).valid, true);
        assert.equal(validateAgainstSchema(42, schema).valid, false);
      },
    },
    {
      id: "SC-REF-POINTER",
      name: "local JSON pointer decoding preserves escaped definition names",
      run() {
        const schema = { $defs: { "a/b~c": { type: "string", enum: ["allowed"] } }, $ref: "#/$defs/a~1b~0c" };
        assert.equal(validateAgainstSchema("allowed", schema).valid, true);
        assert.equal(validateAgainstSchema("other", schema).valid, false);
      },
    },
    {
      id: "SC-REF-UNRESOLVED",
      name: "unresolved and non-schema local reference targets fail closed",
      run() {
        for (const schema of [{ $ref: "#/$defs/missing", $defs: {} }, { $ref: "#/$defs/value", $defs: { value: 42 } }, { $ref: "#/$defs/value", $defs: { value: null } }]) {
          const result = validateAgainstSchema("value", schema);
          assert.equal(result.valid, false);
          assert.ok(result.errors.length > 0);
        }
      },
    },
    {
      id: "SC-REF-UNSUPPORTED",
      name: "external unsupported and malformed reference declarations fail closed",
      run() {
        for (const ref of ["https://example.invalid/schema.json", "other.json#/$defs/value", "#anchor", "#/properties/value", "#/$defs/a~2b", null, 42]) {
          const result = validateAgainstSchema("value", { $ref: ref });
          assert.equal(result.valid, false);
          assert.ok(result.errors.length > 0);
        }
      },
    },
  ],
});
