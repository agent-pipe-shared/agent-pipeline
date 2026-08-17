#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkUnpublishedSiblingSprintConsumption,
  PARALLEL_SPRINT_PUBLICATION_GATE_INPUT_SCHEMA,
  SIBLING_SPRINT_EPICS,
} from "../lib/parallel-sprint-integration.mjs";
import { validatePublicReleaseState } from "../lib/public-release-state.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

/**
 * EPIC-AC-02 verify gate: "IF a package consumes an unpublished Nova, Cyborg, or Nightwing
 * commit, THEN Phoenix verification SHALL fail." (specs/sprint-phoenix-epic/acceptance.md)
 *
 * `checkUnpublishedSiblingSprintConsumption` (parallel-sprint-integration.mjs) is the sealed,
 * pure decision function and never invokes Git. This script is the observation-gathering
 * half: it discovers every real `specs/<id>/lifecycle.json` feature-package manifest, gathers
 * the Git evidence the decision function's input schema requires for each manifest with a
 * bound `candidate.commit`, and fails closed whenever that evidence cannot be produced.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
export const EPIC_AC02_CHECK_SCHEMA = "pipeline.epic-ac02-publication-check.v1";

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return { status: typeof result.status === "number" ? result.status : null, stdout: String(result.stdout ?? "").trim(), error: result.error ?? null };
}

/** `git merge-base --is-ancestor <commit> <tip>`; the raw exit status only -- `null` means the
 * probe itself could not run (missing Git, missing object), never a verdict. */
function isAncestor(root, commit, tip) {
  const result = runGit(root, ["merge-base", "--is-ancestor", commit, tip]);
  return result.error ? null : result.status;
}

/** A ref's identity segments, split on Git's own path/word separators, lower-cased. */
function refSegments(refname) {
  return refname.toLowerCase().split(/[-_/]/u).filter(Boolean);
}

/** Which sibling Epic (if any) a ref name belongs to, by exact segment match -- never a
 * substring match, so "nova" does not also claim an unrelated "renovation" branch. */
function epicForRef(refname) {
  const segments = new Set(refSegments(refname));
  return SIBLING_SPRINT_EPICS.find((epic) => segments.has(epic)) ?? null;
}

/** One resolved tip commit per sibling Epic this repository actually holds a branch for
 * today, preferring the fetched remote-tracking copy over a possibly-stale local branch.
 * Returns `null` (never an empty Map) when the ref listing itself could not be produced. */
function siblingEpicTips(root) {
  const listed = runGit(root, ["for-each-ref", "--format=%(refname)"]);
  if (listed.status !== 0) return null;
  const chosen = new Map();
  for (const refname of listed.stdout.split("\n").filter(Boolean)) {
    const epic = epicForRef(refname);
    if (epic === null) continue;
    const rank = refname.startsWith("refs/remotes/") ? 0 : refname.startsWith("refs/heads/") ? 1 : 2;
    const existing = chosen.get(epic);
    if (existing === undefined || rank < existing.rank) chosen.set(epic, { refname, rank });
  }
  const tips = new Map();
  for (const [epic, { refname }] of chosen) {
    const resolved = runGit(root, ["rev-parse", "--verify", `${refname}^{commit}`]);
    if (resolved.status === 0 && OID.test(resolved.stdout)) tips.set(epic, resolved.stdout);
  }
  return tips;
}

/** This repository's own release-state projection, read as a publication record.
 *
 * Every follow-up Sprint Epic here (Nightwing/Phoenix/Nova today; Cyborg the same way once it
 * has a branch) is a `feat/sprint-<slug>-<runner>` branch cut from one accepted go-live OID
 * and published through the same shared release train (ADR-0043) -- there is exactly one
 * publication boundary in this repository, not one per Epic, so the same record applies to
 * whichever sibling Epic a manifest's bound commit is attributed to. */
function publishedTipRecord(root) {
  const path = join(root, "docs", "release-state.json");
  if (!existsSync(path)) return null;
  let record;
  try { record = JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
  try { validatePublicReleaseState(record); } catch { return null; }
  return { ref: record.tag, commit: record.commit, publicationStatus: record.publicationStatus };
}

/** Discover every `specs/<id>/lifecycle.json` feature-package manifest in this repository. */
export function discoverFeaturePackageManifests(root) {
  const specsDir = join(root, "specs");
  if (!existsSync(specsDir)) return [];
  const manifests = [];
  for (const entry of readdirSync(specsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(specsDir, entry.name, "lifecycle.json");
    if (!existsSync(manifestPath)) continue;
    manifests.push({ id: entry.name, path: manifestPath, manifest: JSON.parse(readFileSync(manifestPath, "utf8")) });
  }
  return manifests;
}

/**
 * Gather the real Git observations `checkUnpublishedSiblingSprintConsumption` needs for one
 * manifest: which sibling Epics' branches reach into its bound commit's ancestry, and whether
 * that reach lands inside this repository's own published state.
 *
 * Direction note: this is deliberately `git merge-base --is-ancestor <siblingTip>
 * <boundCommit>` -- is a sibling's branch tip an ancestor of the bound commit -- not a literal
 * `git for-each-ref --contains <boundCommit>` reduced to sibling names. Empirically, in this
 * repository, `git for-each-ref --contains v0.4.0` lists every ref for which `v0.4.0` is an
 * ANCESTOR of that ref's own tip; run with `<commit>` bound to the package's own candidate,
 * that command answers "which sibling branch has since absorbed Phoenix's candidate", the
 * reverse of what EPIC-AC-02 asks. `checkUnpublishedSiblingSprintConsumption`'s own words are
 * "that bound commit, or its ancestry, carries a commit that belongs to a sibling Epic" --
 * i.e. the sibling commit must be reachable FROM the bound commit, which is exactly what
 * `merge-base --is-ancestor <siblingTip> <boundCommit>` decides, without depending on
 * `boundCommit` naming any ref of its own. The gate's `siblingProvenance.probe` field still
 * reads `"branch-contains"` per its schema: the question answered -- does a sibling branch's
 * work sit inside the bound commit's history -- is the same one; only the concrete primitive
 * differs from a literal reading of the phrase.
 */
export function gatherPublicationGateInput(root, manifest) {
  const unobserved = () => ({
    schema: PARALLEL_SPRINT_PUBLICATION_GATE_INPUT_SCHEMA,
    package: manifest,
    siblingProvenance: "unobserved",
    consumptions: [],
  });
  const boundCommit = manifest?.candidate?.commit ?? null;
  if (boundCommit === null) return unobserved();

  const known = runGit(root, ["cat-file", "-e", `${boundCommit}^{commit}`]);
  if (known.status !== 0) return unobserved();

  const tips = siblingEpicTips(root);
  if (tips === null) return unobserved();

  const publishedTip = publishedTipRecord(root);
  const epics = [];
  const consumptions = [];
  for (const [epic, tip] of tips) {
    const attributed = isAncestor(root, tip, boundCommit);
    if (attributed === null) return unobserved(); // any failed probe fails the whole manifest closed
    if (attributed !== 0) continue; // tip is not an ancestor of boundCommit: nothing consumed
    epics.push(epic);
    let reachability = "unobserved";
    if (publishedTip !== null) {
      const probeStatus = isAncestor(root, tip, publishedTip.commit);
      if (probeStatus !== null) reachability = { probe: "merge-base--is-ancestor", tipCommit: publishedTip.commit, exitCode: probeStatus };
    }
    consumptions.push({ epic, commit: tip, source: "candidate-commit-ancestry", publishedTip, reachability });
  }
  return {
    schema: PARALLEL_SPRINT_PUBLICATION_GATE_INPUT_SCHEMA,
    package: manifest,
    siblingProvenance: { probe: "branch-contains", epics },
    consumptions,
  };
}

/** Evaluate EPIC-AC-02 against every real feature-package manifest in `root`. */
export function checkEpicAc02Publication(root = DEFAULT_ROOT) {
  const results = discoverFeaturePackageManifests(root).map(({ id, path, manifest }) => ({
    id,
    path,
    receipt: checkUnpublishedSiblingSprintConsumption(gatherPublicationGateInput(root, manifest)),
  }));
  const failed = results.filter(({ receipt }) => receipt.status !== "verification-permitted");
  return { schema: EPIC_AC02_CHECK_SCHEMA, ok: failed.length === 0, results, failed };
}

if (isDirectInvocation(import.meta.url)) {
  const result = checkEpicAc02Publication(process.cwd());
  if (result.ok) {
    process.stdout.write(`epic-ac02-publication: ${result.results.length} package(s) checked, 0 failed\n`);
    process.exitCode = 0;
  } else {
    for (const { id, receipt } of result.failed) {
      process.stderr.write(`epic-ac02-publication: ${id} ${receipt.status} (${receipt.code}) findings=${JSON.stringify(receipt.findings)}\n`);
    }
    process.exitCode = 2;
  }
}
