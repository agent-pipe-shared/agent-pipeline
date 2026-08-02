// SPDX-License-Identifier: SUL-1.0
/** Local non-authority persistence for one destination's independent outbox. */
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalizeJson, parseStrictJson } from "./governance-event.mjs";
import { createGovernanceExportOutbox, validateGovernanceExportOutbox } from "./governance-export-outbox.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u; const SHA = /^[a-f0-9]{64}$/u;
function fail(code) { const error = new Error("Governance export outbox storage is invalid."); error.code = code; throw error; }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function target(root, profile) { if (!ID.test(profile ?? "")) fail("GEOS-PROFILE"); return join(root, ".pipeline", "governance-export", profile, "outbox.json"); }
async function readCurrent(root, destinationProfile, policyRevision) {
  const path = target(root, destinationProfile); try { const entry = await lstat(path); if (!entry.isFile() || entry.isSymbolicLink()) fail("GEOS-PATH"); const bytes = await readFile(path); const value = validateGovernanceExportOutbox(parseStrictJson(bytes)); if (value.destinationProfile !== destinationProfile || value.policyRevision !== policyRevision) fail("GEOS-BINDING"); return { value, digest: digest(bytes), path }; } catch (error) { if (error?.code !== "ENOENT") throw error; return { value: createGovernanceExportOutbox({ destinationProfile, policyRevision }), digest: null, path }; }
}
export async function loadGovernanceExportOutbox({ repositoryRoot, destinationProfile, policyRevision } = {}) { if (!SHA.test(policyRevision ?? "")) fail("GEOS-POLICY"); const current = await readCurrent(resolve(repositoryRoot ?? ""), destinationProfile, policyRevision); return Object.freeze({ schema: "pipeline.governance-export-outbox-readback.v1", status: current.digest === null ? "absent" : "current", outbox: current.value, sha256: current.digest }); }
/** CAS persistence deliberately stores only sanitized projections, never canonical events or secrets. */
export async function persistGovernanceExportOutbox({ repositoryRoot, destinationProfile, policyRevision, expectedSha256, outbox } = {}) {
  if (!(expectedSha256 === null || SHA.test(expectedSha256)) || !SHA.test(policyRevision ?? "")) fail("GEOS-REQUEST"); const root = resolve(repositoryRoot ?? ""); const current = await readCurrent(root, destinationProfile, policyRevision); if (current.digest !== expectedSha256) return Object.freeze({ schema: "pipeline.governance-export-outbox-write-receipt.v1", status: "conflict", sha256: current.digest });
  const next = validateGovernanceExportOutbox(outbox); if (next.destinationProfile !== destinationProfile || next.policyRevision !== policyRevision) fail("GEOS-BINDING"); const bytes = `${canonicalizeJson(next)}\n`; const dir = join(root, ".pipeline", "governance-export", destinationProfile); await mkdir(dir, { recursive: true }); const temporary = join(dir, `.outbox-${randomUUID()}.tmp`); await writeFile(temporary, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 }); const reread = await readCurrent(root, destinationProfile, policyRevision); if (reread.digest !== expectedSha256) { await unlink(temporary); return Object.freeze({ schema: "pipeline.governance-export-outbox-write-receipt.v1", status: "conflict", sha256: reread.digest }); } await rename(temporary, current.path); const confirmed = await readCurrent(root, destinationProfile, policyRevision); if (confirmed.digest !== digest(bytes)) fail("GEOS-READBACK"); return Object.freeze({ schema: "pipeline.governance-export-outbox-write-receipt.v1", status: "stored", sha256: confirmed.digest });
}
