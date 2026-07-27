#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** GitHub.com-only target resolver and closed observation adapter for B4. */
import { createHash } from "node:crypto";
import { mapGitHubForgeObservation } from "../lib/forge-capability.mjs";

const PROJECT_PATH = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u;
const MODES = new Set(["none", "operator-local", "credential-lease", "unavailable"]);
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const freeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

export const GITHUB_FORGE_ADAPTER_VERSION = "1.0.0";

export function resolveGitHubTarget(input) {
  if (!exact(input, ["baseUrl", "projectPath", "authenticationMode"]) || input.baseUrl !== "https://github.com"
    || typeof input.projectPath !== "string" || !PROJECT_PATH.test(input.projectPath) || input.projectPath.includes("..")
    || !MODES.has(input.authenticationMode)) return { ok: false, code: "SHAPE:github-target", target: null };
  return { ok: true, code: null, target: freeze({ provider: "github", baseUrlClass: "github-com", baseUrlSha256: sha256("github-com\0https://github.com"), projectCoordinatesSha256: sha256(`github-com\0https://github.com\0${input.projectPath}`), authenticationMode: input.authenticationMode }) };
}

/** Network-free adapter seam: maps a closed extension without accepting raw API payloads. */
export function mapGitHubAdapterObservation(input) {
  if (!exact(input, ["reportId", "target", "observations", "governance", "evidence"]) || !exact(input.target, ["provider", "baseUrlClass", "baseUrlSha256", "projectCoordinatesSha256", "authenticationMode"]) || input.target.provider !== "github" || input.target.baseUrlClass !== "github-com") throw new Error("SHAPE:github-forge-observation");
  return mapGitHubForgeObservation({ reportId: input.reportId, baseUrlClass: input.target.baseUrlClass, projectCoordinatesSha256: input.target.projectCoordinatesSha256, authenticationMode: input.target.authenticationMode, observations: structuredClone(input.observations), governance: structuredClone(input.governance), evidence: structuredClone(input.evidence) });
}
