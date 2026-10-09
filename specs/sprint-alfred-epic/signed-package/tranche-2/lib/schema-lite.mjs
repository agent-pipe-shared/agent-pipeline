// SPDX-License-Identifier: SUL-1.0
/**
 * schema-lite.mjs -- hand-rolled JSON-Schema validator, no library dependency.
 *
 * DEPENDENCY-FREE LIBRARY (plugins/pipeline-core/lib/): shared by callers under
 * hooks/ and scripts/. Never imports node:fs/node:child_process/etc. -- pure
 * data-in/data-out functions only.
 *
 * Provenance: extracted VERBATIM from
 * plugins/pipeline-core/scripts/critic-bare.mjs, where it validated a critic
 * verdict against critic-verdict.schema.json. That call site now imports
 * validateAgainstSchema from here instead of defining it locally -- see
 * critic-bare.mjs for the loadSchema()/readFileSync() file-loading half, which
 * stayed there (it is file I/O, not schema validation, and this module stays
 * dependency-free of node:fs).
 *
 * Understands exactly the keywords used by critic-verdict.schema.json: type,
 * required, properties, items, enum, additionalProperties. Extend in lockstep
 * with any schema file that starts relying on more -- it silently ignores
 * keywords it does not know (unchanged behavior from the original). This
 * proposal also recognizes `oneOf` as a non-empty array of object schemas,
 * requiring exactly one branch to accept; schemas without `oneOf` retain the
 * prior behavior.
 *
 * EXTENSION vs. the original (additive, existing semantics unchanged): when
 * `additionalProperties` is a schema OBJECT (not the literal boolean `false`),
 * every extra/unlisted key's value is validated against that schema instead of
 * being silently ignored -- e.g. `{ "type": "object", "properties": {...},
 * "additionalProperties": { "type": "string" } }` requires every extra key's
 * value to be a string. `additionalProperties: false` keeps its original
 * "reject any extra key" behavior; `additionalProperties` absent/true keeps
 * its original "extra keys allowed, unchecked" behavior -- both unchanged.
 */

function jsTypeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value; // "object" | "string" | "boolean" | "number" | "undefined"
}

function typeMatches(actual, expectedType) {
  const expectedList = Array.isArray(expectedType) ? expectedType : [expectedType];
  return expectedList.includes(actual);
}

function isSchemaObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateNode(value, schema, path, errors) {
  if (schema.type && !typeMatches(jsTypeOf(value), schema.type)) {
    errors.push(`${path}: expected type "${schema.type}", got "${jsTypeOf(value)}"`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value ${JSON.stringify(value)} is not one of [${schema.enum.join(", ")}]`);
  }
  if (schema.type === "object") {
    const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    for (const req of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(obj, req)) {
        errors.push(`${path}: missing required property "${req}"`);
      }
    }
    if (schema.properties) {
      for (const [key, subschema] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          validateNode(obj[key], subschema, `${path}.${key}`, errors);
        }
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) errors.push(`${path}: unexpected additional property "${key}"`);
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      // Additive extension: additionalProperties as a schema object validates every
      // extra/unlisted key's value against it, instead of leaving extra keys unchecked.
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) {
          validateNode(obj[key], schema.additionalProperties, `${path}.${key}`, errors);
        }
      }
    }
  }
  if (schema.type === "array" && schema.items) {
    const arr = Array.isArray(value) ? value : [];
    arr.forEach((item, i) => validateNode(item, schema.items, `${path}[${i}]`, errors));
  }
  if (Object.prototype.hasOwnProperty.call(schema, "oneOf")) {
    const branches = schema.oneOf;
    if (!Array.isArray(branches) || branches.length === 0 || !branches.every(isSchemaObject)) {
      errors.push(`${path}: oneOf must be a non-empty array of object schemas`);
    } else {
      let matches = 0;
      for (const branch of branches) {
        const branchErrors = [];
        validateNode(value, branch, path, branchErrors);
        if (branchErrors.length === 0) matches += 1;
      }
      if (matches !== 1) {
        errors.push(`${path}: oneOf matched ${matches} branches; expected exactly one`);
      }
    }
  }
}

/** Returns { valid: boolean, errors: string[] }. Never throws on a malformed oneOf. */
export function validateAgainstSchema(value, schema) {
  const errors = [];
  validateNode(value, schema, "$", errors);
  return { valid: errors.length === 0, errors };
}
