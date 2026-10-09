// SPDX-License-Identifier: SUL-1.0
/**
 * Parked exact-alternatives implementation for schema-lite.
 *
 * This is based on the live dependency-free validator and adds only oneOf:
 * a non-empty array of object schemas matches when exactly one branch accepts.
 */

function jsTypeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
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
