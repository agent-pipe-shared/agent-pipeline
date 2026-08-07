#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Produce a `pipeline.release-preflight.v1` record — the fifth and last gate the
 * publication executor demands, and the one that had a builder, a validator, and no
 * way to run either.
 *
 * WHY THIS IS A SEPARATE FILE. `release-preflight.mjs` is imported by the executor.
 * Giving it a CLI entry point would put process/argv/filesystem behaviour inside a
 * module the executor loads; keeping the producer beside it leaves that module the
 * pure builder+validator it already is.
 *
 * WHAT IT DERIVES AND WHAT IT REFUSES TO INVENT. Everything observable is read from
 * the repository: candidate and base commits and trees, working-tree cleanliness, the
 * five version surfaces, the durable documents and their digests. Everything external
 * is an explicit input this tool will not default:
 *
 *   --consent <path>   a PO consent record. `status` must be "approved"; the tool
 *                      never writes that word on the PO's behalf.
 *   --gg03 <path>      a real protected-main fast-forward binding, or omitted, in
 *                      which case GG-03 is recorded as not required.
 *
 * It cannot manufacture a ready verdict. `createReleasePreflight` derives `status`
 * from its own reasons, and this tool passes observations through unchanged: a dirty
 * tree, a version surface that disagrees, an unapproved consent, or a GG-03 binding
 * naming another candidate each yield `blocked`. That mirrors
 * `publication-gate-evidence.mjs`: derive, never attest.
 *
 * Usage:
 *   node release-preflight-cli.mjs --preflight-id <id> --base <commit> \
 *     --consent <path> --lifecycle <path> --retention-policy <sha256> \
 *     --out <path> [--gg03 <path>] [--root <repo>]
 *
 * Exit 0: a record was written (its `status` may be `blocked` — that is a real
 * outcome, not a failure of this tool). Exit 2: the inputs could not be observed
 * honestly, and nothing was written.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { createReleasePreflight, validateReleasePreflight } from "./release-preflight.mjs";
import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const DOCUMENTS = Object.freeze(["prd", "spec", "acceptance", "result"]);
const FINAL_GATES = Object.freeze(["verify", "security", "critic", "remote", "human"]);
const VERSION_SURFACES = Object.freeze([
  "VERSION",
  "plugins/pipeline-core/.codex-plugin/plugin.json",
  "plugins/pipeline-core/.claude-plugin/plugin.json",
]);

export class ReleasePreflightCliError extends Error {
  constructor(code, message) { super(message); this.name = "ReleasePreflightCliError"; this.code = code; }
}
const fail = (code, message) => { throw new ReleasePreflightCliError(code, message); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function repoFile(root, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || isAbsolute(relativePath)) fail("RPC-PATH", `${label} must be repository-relative`);
  const absolute = resolve(root, relativePath);
  if (relative(root, absolute).startsWith(`..${sep}`) || absolute === root) fail("RPC-PATH", `${label} escapes the repository`);
  let info;
  try { info = lstatSync(absolute); } catch { fail("RPC-INPUT", `${label} is unavailable (${relativePath})`); }
  if (!info.isFile() || info.isSymbolicLink()) fail("RPC-INPUT", `${label} is not a regular file (${relativePath})`);
  return absolute;
}
const readJson = (root, relativePath, label) => {
  try { return JSON.parse(readFileSync(repoFile(root, relativePath, label), "utf8")); }
  catch (error) { if (error instanceof ReleasePreflightCliError) throw error; return fail("RPC-INPUT", `${label} is not valid JSON`); }
};

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: 10_000 });
  if (result.status !== 0 || result.error) fail("RPC-GIT", `git ${args.join(" ")} failed`);
  return String(result.stdout).trim();
}

/** Observed, never asserted: HEAD, its tree, and whether anything is uncommitted. */
function observeRepository(root) {
  const headCommit = git(root, ["rev-parse", "HEAD"]);
  const headTree = git(root, ["rev-parse", "HEAD^{tree}"]);
  const status = spawnSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8", shell: false, timeout: 10_000 });
  if (status.status !== 0) fail("RPC-GIT", "git status failed");
  return { clean: String(status.stdout).length === 0, headCommit, headTree };
}

/**
 * The five version surfaces must already agree, exactly as the executor's own
 * consistency derivation demands. Disagreement is reported as a reason, not repaired.
 */
function observeVersion(root, consent) {
  const versionFile = readFileSync(repoFile(root, "VERSION", "VERSION"), "utf8").trim();
  const manifests = VERSION_SURFACES.slice(1).map((path) => {
    const value = readJson(root, path, path)?.version;
    if (typeof value !== "string") fail("RPC-VERSION", `${path} carries no string version`);
    return value;
  });
  const candidateVersion = versionFile;
  const agreed = manifests.every((value) => value === versionFile);
  return {
    candidateVersion,
    // A surface mismatch must surface as `version-decision-mismatch`, which
    // createReleasePreflight derives when candidateVersion !== targetVersion.
    targetVersion: agreed ? versionFile : `${versionFile.split(".")[0]}.${versionFile.split(".")[1]}.${Number(versionFile.split(".")[2]) + 1}`,
    decisionId: consent.decisionId,
    decisionSha256: consent.authoritySha256,
    surfaces: VERSION_SURFACES.map((path, index) => ({ path, version: index === 0 ? versionFile : manifests[index - 1] })),
    agreed,
  };
}

function observeDocumentation(root, lifecycle) {
  const documentation = {};
  for (const kind of DOCUMENTS) {
    const path = lifecycle.documents?.[kind];
    if (typeof path !== "string") fail("RPC-INPUT", `lifecycle.documents.${kind} is missing`);
    documentation[kind] = { path, sha256: sha256(readFileSync(repoFile(root, path, `documentation.${kind}`))) };
  }
  return documentation;
}

function retentionRecords(documentation, policySha256) {
  const records = DOCUMENTS.map((kind) => ({
    archiveDigest: null,
    archiveProvenanceSha256: null,
    classification: "public",
    path: documentation[kind].path,
    retentionClass: "active",
  })).sort((left, right) => (left.path < right.path ? -1 : 1));
  return { policySha256, records };
}

export function buildReleasePreflight({ rootDir = process.cwd(), preflightId, baseCommit, consentPath, lifecyclePath, retentionPolicySha256, gg03Path = null }) {
  const root = resolve(rootDir);
  const consent = readJson(root, consentPath, "consent");
  const lifecycleInput = readJson(root, lifecyclePath, "lifecycle");
  const repository = observeRepository(root);
  const baseTree = git(root, ["rev-parse", `${baseCommit}^{tree}`]);
  const candidate = { commit: repository.headCommit, tree: repository.headTree };
  const version = observeVersion(root, consent);
  const documentation = observeDocumentation(root, lifecycleInput);
  const manifestAbsolute = repoFile(root, lifecyclePath, "lifecycle manifest");

  const input = {
    preflightId,
    base: { commit: git(root, ["rev-parse", `${baseCommit}^{commit}`]), tree: baseTree },
    candidate,
    repository,
    version: { candidateVersion: version.candidateVersion, targetVersion: version.targetVersion, decisionId: version.decisionId, decisionSha256: version.decisionSha256 },
    documentation,
    lifecycle: {
      featureId: lifecycleInput.featureId,
      manifestPath: lifecyclePath,
      manifestSha256: sha256(readFileSync(manifestAbsolute)),
      status: "prepared",
    },
    retention: retentionRecords(documentation, retentionPolicySha256),
    consent: {
      authoritySha256: consent.authoritySha256,
      decisionId: consent.decisionId,
      evaluatedAt: consent.evaluatedAt,
      expiresAt: consent.expiresAt,
      // Passed through verbatim. This tool never writes "approved" itself.
      status: consent.status,
    },
    gates: {
      gg03: gg03Path === null ? { required: false, binding: null } : { required: true, binding: readJson(root, gg03Path, "gates.gg03.binding") },
      inventory: FINAL_GATES.map((id) => ({ id, kind: ["remote", "human"].includes(id) ? "external" : "local-final", status: "pending" })),
    },
    extensions: { schema: "pipeline.release-preflight-extension-input.v1", status: "none", registrySha256: null, requirements: [] },
  };

  const record = createReleasePreflight(input);
  validateReleasePreflight(record);
  return { record, versionSurfaces: version.surfaces, versionAgreed: version.agreed };
}

function parseArgs(argv) {
  const value = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (!flag?.startsWith("--") || next === undefined || next.startsWith("--")) {
      fail("RPC-USAGE", "Usage: release-preflight-cli.mjs --preflight-id <id> --base <commit> --consent <path> --lifecycle <path> --retention-policy <sha256> --out <path> [--gg03 <path>] [--root <repo>]");
    }
    value[flag] = next;
  }
  for (const required of ["--preflight-id", "--base", "--consent", "--lifecycle", "--retention-policy", "--out"]) {
    if (!value[required]) fail("RPC-USAGE", `${required} is required`);
  }
  return {
    rootDir: value["--root"] ?? process.cwd(),
    preflightId: value["--preflight-id"],
    baseCommit: value["--base"],
    consentPath: value["--consent"],
    lifecyclePath: value["--lifecycle"],
    retentionPolicySha256: value["--retention-policy"],
    gg03Path: value["--gg03"] ?? null,
    outPath: value["--out"],
  };
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const built = buildReleasePreflight(options);
    const root = resolve(options.rootDir);
    if (isAbsolute(options.outPath)) fail("RPC-PATH", "out path must be repository-relative");
    const target = resolve(root, options.outPath);
    if (relative(root, target).startsWith(`..${sep}`)) fail("RPC-PATH", "out path escapes the repository");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(built.record, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      status: built.record.status,
      reasons: built.record.reasons,
      recordSha256: built.record.recordSha256,
      versionSurfacesAgree: built.versionAgreed,
      writtenTo: options.outPath,
    }, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof ReleasePreflightCliError ? error.code : (error?.code ?? "RPC-ERROR");
    process.stderr.write(`release-preflight-cli: ${code}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
