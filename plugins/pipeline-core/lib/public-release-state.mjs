// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";

export const PUBLIC_RELEASE_STATE_SCHEMA = "pipeline.public-release-state.v1";
const SHA256 = /^[0-9a-f]{64}$/u; const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const KEYS = ["schema", "version", "tag", "commit", "tree", "publicationStatus", "releaseUrlClass", "observedAt", "recordSha256"];
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} invalid`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} keys invalid`);
}
export function publicReleaseStateDigest(record) {
  const { recordSha256, ...payload } = record;
  return createHash("sha256").update(`${PUBLIC_RELEASE_STATE_SCHEMA}\0${canonical(payload)}`).digest("hex");
}
export function createPublicReleaseState(input) {
  exact(input, KEYS.filter((key) => key !== "schema" && key !== "recordSha256"), "public release state input");
  if (typeof input.version !== "string" || !/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u.test(input.version)
    || input.tag !== `v${input.version}` || !OID.test(input.commit ?? "") || !OID.test(input.tree ?? "")
    || !["published", "unpublished"].includes(input.publicationStatus)
    || !["public-release", "none"].includes(input.releaseUrlClass)
    || (input.publicationStatus === "published") !== (input.releaseUrlClass === "public-release")
    || typeof input.observedAt !== "string" || !Number.isFinite(Date.parse(input.observedAt))) throw new TypeError("public release state input invalid");
  const record = { schema: PUBLIC_RELEASE_STATE_SCHEMA, ...structuredClone(input), recordSha256: "0".repeat(64) };
  record.recordSha256 = publicReleaseStateDigest(record); return record;
}
export function validatePublicReleaseState(record) {
  exact(record, KEYS, "public release state");
  if (record.schema !== PUBLIC_RELEASE_STATE_SCHEMA || !SHA256.test(record.recordSha256 ?? "")) throw new TypeError("public release state invalid");
  const expected = createPublicReleaseState(Object.fromEntries(KEYS.filter((key) => !["schema", "recordSha256"].includes(key)).map((key) => [key, record[key]])));
  if (canonical(record) !== canonical(expected)) throw new TypeError("public release state digest invalid");
  return true;
}
