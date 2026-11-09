// SPDX-License-Identifier: SUL-1.0
/**
 * C22 (CGF-06, AC-108): classify the Pipeline's OWN generated metadata by a verifiable schema and keep its digest fields apart from credential fields.
 *
 * Measured on this repository: the secret scanner reads bare digests under key-shaped field names (`idempotencyKey`, `scopeKey`, `reuseKeySha256`, `courseKey`) of
 * generated JSON as credentials, and every earlier answer was a path-wide ignore. This reader says, without a value ever leaving it, which fields of one file are
 * digests whose NAME looks like a credential, and which fields really look like credentials. A class is claimed only for a JSON object with a Pipeline schema id
 * (`pipeline.<name>.v<N>`); anything else is `unclassified` and is never excused. Pure: no I/O, no ignore list, no blanket rule, never throws. A narrow, field-scoped
 * scanner exception for a classified file is only provable when `scannerSafe` is true (every credential-shaped name holds a bare lower-case hex digest).
 */
const SCHEMA_ID = /^pipeline\.[a-z0-9]+(?:[.-][a-z0-9]+)*\.v\d+$/u;
const DIGEST = /^[0-9a-f]{32,64}$/u;
// The name family of the scanner's generic rule (gitleaks generic-api-key): a field named like this makes it read the value as a secret.
const CREDENTIAL_NAME = /(?:access|auth|api|credential|creds|key|passw(?:or)?d|secret|token)/iu;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DEPTH = 64;
const MIN_CREDENTIAL_LENGTH = 8;

const unclassified = (reason) => Object.freeze({ class: "unclassified", schema: null, digestFields: [], keyShapedDigestFields: [], credentialFields: [], scannerSafe: false, reason });

/** @param {string|Uint8Array|undefined} input the file's bytes or text */
export function classifyGeneratedArtefact(input) {
  try {
    const bytes = typeof input === "string" ? Buffer.byteLength(input, "utf8") : input instanceof Uint8Array ? input.byteLength : -1;
    if (bytes < 0) return unclassified("input is neither text nor bytes");
    if (bytes > MAX_BYTES) return unclassified("input is larger than the bound");
    const text = (typeof input === "string" ? input : Buffer.from(input).toString("utf8")).replace(/^﻿/u, "");
    let value;
    try { value = JSON.parse(text); } catch { return unclassified("not JSON"); }
    if (value === null || typeof value !== "object" || Array.isArray(value)) return unclassified("not a JSON object");
    if (typeof value.schema !== "string" || !SCHEMA_ID.test(value.schema)) return unclassified("no Pipeline schema id (pipeline.<name>.v<N>)");
    const digestFields = [];
    const keyShapedDigestFields = [];
    const credentialFields = [];
    let tooDeep = false;
    const walk = (node, path, depth) => {
      if (depth > MAX_DEPTH) { tooDeep = true; return; }
      if (Array.isArray(node)) { node.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1)); return; }
      if (node === null || typeof node !== "object") return;
      for (const [name, child] of Object.entries(node)) {
        const here = path === "" ? name : `${path}.${name}`;
        if (typeof child === "string") {
          const keyShaped = CREDENTIAL_NAME.test(name);
          if (DIGEST.test(child)) { digestFields.push({ path: here, keyShaped }); if (keyShaped) keyShapedDigestFields.push(here); }
          else if (keyShaped && child.length >= MIN_CREDENTIAL_LENGTH) credentialFields.push(here);
        } else walk(child, here, depth + 1);
      }
    };
    walk(value, "", 0);
    if (tooDeep) return unclassified("nesting is deeper than the bound");
    return Object.freeze({ class: "pipeline-generated", schema: value.schema, digestFields, keyShapedDigestFields, credentialFields, scannerSafe: credentialFields.length === 0, reason: null });
  } catch {
    return unclassified("unreadable input");
  }
}
