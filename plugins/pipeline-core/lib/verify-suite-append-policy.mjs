// SPDX-License-Identifier: SUL-1.0
/** WP-B2-ii: a registration batch may append suites, never rewrite prior gate coverage. */
import { parseStrictJson } from "./governance-event.mjs";
import { canonical } from "./po-approval-proof.mjs";

const MAX_BYTES = 2 * 1024 * 1024;
const REGISTRATION_SCHEMA = "pipeline.verify-suites.v1";
const fail = code => ({ ok: false, code, appended: 0 });

function readDocument(bytes) {
  if (!(typeof bytes === "string" || bytes instanceof Uint8Array)
    || Buffer.byteLength(bytes) < 1 || Buffer.byteLength(bytes) > MAX_BYTES) return null;
  try {
    const value = parseStrictJson(bytes);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).sort().join("\0") === "schema\0suites"
      && value.schema === REGISTRATION_SCHEMA && Array.isArray(value.suites)
      ? value : null;
  } catch { return null; }
}

/**
 * Compare exact logical entries from the committed predecessor and the proposed
 * postimage. Presentation-only rewrites are not an append and cannot quietly
 * re-pin an existing suite. The normal Verify registration validator separately
 * checks the entire postimage's suite schema, file existence and coverage.
 */
export function evaluateVerifySuiteAppend({ beforeBytes, afterBytes } = {}) {
  const before = readDocument(beforeBytes);
  const after = readDocument(afterBytes);
  if (!before || !after) return fail("VSA-SHAPE");
  if (after.suites.length <= before.suites.length) return fail("VSA-NO-APPEND");
  for (let index = 0; index < before.suites.length; index += 1) {
    if (canonical(before.suites[index]) !== canonical(after.suites[index])) return fail("VSA-PRIOR-ENTRY-CHANGED");
  }
  const names = new Set();
  const files = new Set();
  for (const suite of after.suites) {
    if (suite === null || typeof suite !== "object" || Array.isArray(suite)
      || typeof suite.name !== "string" || suite.name.length === 0
      || typeof suite.file !== "string" || suite.file.length === 0
      || names.has(suite.name) || files.has(suite.file)) return fail("VSA-ENTRY");
    names.add(suite.name);
    files.add(suite.file);
  }
  return { ok: true, code: "VSA-APPEND", appended: after.suites.length - before.suites.length };
}
