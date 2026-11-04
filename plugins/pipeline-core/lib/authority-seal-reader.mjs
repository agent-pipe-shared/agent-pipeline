// SPDX-License-Identifier: SUL-1.0
/**
 * Late binding of the PRD and the Spec (docs/adr/draft-late-binding-of-prd-and-spec-at-the-approval.md), build step 1a.
 *
 * ONE shared reader of the bound authority documents of a feature. It returns `{ sealed, digests }` so that no reader decides
 * its own default for a package that is not sealed yet. Step 1a is inert: no existing reader calls it, the continuity schema
 * does not know the `sealed` marker yet, and a state without the marker reads as sealed, which is today's behaviour for every
 * bound project (the migration is the identity).
 *
 * PO decisions of 2026-11-04 (candidate 19 plan, "PO decisions of the 2026-11-04 sitting"):
 *  - the marker is `sealed: false` inside `continuity.authority`; there is no separate seal record;
 *  - a draft binds no authority digest, so the draft carries paths only;
 *  - a draft is never a dead end: every refusal for an unsealed package carries a typed exit, and `reopen-design` stays
 *    executable in every state.
 *
 * Pure: it reads the object it is given, touches no file, takes no lock and never throws.
 */

export const AUTHORITY_SEAL_SCHEMA = "pipeline.authority-seal-read.v1";

const SHA256 = /^[a-f0-9]{64}$/u;

/** The typed exits a reader names when it refuses on a package that is not sealed. */
export const AUTHORITY_SEAL_EXITS = Object.freeze({
  prepareSeal: "prepare-seal",
  reopenDesign: "reopen-design",
});

/**
 * The ONE scope predicate of the late binding (EL-19, the PRD release scope): a package is sealed at its approval unless its profile is
 * `mini`. The bind at the end of onboarding (a draft instead of digests), the seal plan and `prepare-seal` all read it from here.
 */
export function inSealScope(profile) {
  return profile !== "mini";
}

function safePath(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240 || value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(code, reason) {
  return Object.freeze({ schema: AUTHORITY_SEAL_SCHEMA, status: "invalid", sealed: false, digests: null, paths: null, code, reason, exits: Object.freeze([AUTHORITY_SEAL_EXITS.reopenDesign]) });
}

/**
 * Read the seal state of a `continuity.authority` object.
 *
 * sealed:  `{ status: "sealed", sealed: true, digests: { prd, spec, result, plan }, paths }` (marker absent or true).
 * draft:   `{ status: "draft", sealed: false, digests: null, paths: { prd, spec, result, plan } }` (marker false, no digest bound).
 * invalid: `{ status: "invalid", sealed: false, digests: null, code, reason, exits }`; `sealed` is false so a reader that only checks
 *          the flag fails closed. Codes: ASR-AUTHORITY, ASR-MARKER, ASR-ARTIFACT, ASR-DRAFT-DIGEST.
 */
export function readAuthoritySeal(authority) {
  if (!isRecord(authority)) return invalid("ASR-AUTHORITY", "continuity.authority is not an object");
  const marker = authority.sealed;
  if (marker !== undefined && typeof marker !== "boolean") return invalid("ASR-MARKER", "the sealed marker must be a boolean when present");
  const names = ["prd", "spec", "result", "plan"];
  if (marker === false) {
    const paths = {};
    for (const name of names) {
      const artifact = authority[name];
      if (artifact === undefined || artifact === null) {
        if (name === "prd" || name === "spec") return invalid("ASR-ARTIFACT", `the draft ${name} path is missing`);
        paths[name] = null;
        continue;
      }
      if (!isRecord(artifact) || !safePath(artifact.path)) return invalid("ASR-ARTIFACT", `the draft ${name} path is not a safe repository-relative path`);
      if (artifact.sha256 !== undefined) return invalid("ASR-DRAFT-DIGEST", `the draft ${name} must not carry an authority digest before the seal`);
      paths[name] = artifact.path;
    }
    return Object.freeze({ schema: AUTHORITY_SEAL_SCHEMA, status: "draft", sealed: false, digests: null, paths: Object.freeze(paths),
      exits: Object.freeze([AUTHORITY_SEAL_EXITS.prepareSeal, AUTHORITY_SEAL_EXITS.reopenDesign]) });
  }
  const digests = {};
  const paths = {};
  for (const name of names) {
    const artifact = authority[name];
    if (artifact === undefined || artifact === null) {
      if (name === "prd" || name === "spec") return invalid("ASR-ARTIFACT", `the sealed ${name} binding is missing`);
      digests[name] = null;
      paths[name] = null;
      continue;
    }
    if (!isRecord(artifact) || !safePath(artifact.path) || typeof artifact.sha256 !== "string" || !SHA256.test(artifact.sha256)) {
      return invalid("ASR-ARTIFACT", `the sealed ${name} binding needs a safe path and a sha256 digest`);
    }
    digests[name] = artifact.sha256;
    paths[name] = artifact.path;
  }
  return Object.freeze({ schema: AUTHORITY_SEAL_SCHEMA, status: "sealed", sealed: true, digests: Object.freeze(digests), paths: Object.freeze(paths), exits: Object.freeze([]) });
}

/**
 * The gate form for a reader that is an authority-bearing gate after the approval (close, release preflight, push and
 * publication subjects): `{ ok: true, digests }` for a sealed package, otherwise a typed refusal that names its exits.
 */
export function requireSealedAuthority(authority) {
  const read = readAuthoritySeal(authority);
  if (read.status === "sealed") return { ok: true, digests: read.digests, paths: read.paths };
  return {
    ok: false,
    code: read.status === "draft" ? "ASR-NOT-SEALED" : read.code,
    reason: read.status === "draft"
      ? "the PRD and the Spec are not sealed yet; prepare the seal (the approval is the seal), or reopen the design to keep editing"
      : read.reason,
    exits: read.exits,
  };
}
