#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Independent RED contract for exact oneOf support in schema-lite. */
import assert from "node:assert/strict";
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
  ],
});
