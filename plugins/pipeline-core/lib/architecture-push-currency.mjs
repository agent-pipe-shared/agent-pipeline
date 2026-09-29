// SPDX-License-Identifier: SUL-1.0
/** Candidate-bound AC-18 map currency for governed public contracts. */
import { spawnSync } from "node:child_process";
import { parseYaml } from "./yaml-lite.mjs";

const OID = /^[0-9a-f]{40,64}$/iu;
const MAP_INDEX = "architecture/map/index.md";

function git(rootDir, args, run) {
  const result = run("git", ["-C", rootDir, ...args], { encoding: "utf8", timeout: 10000 });
  return result?.status === 0 && typeof result.stdout === "string" ? result.stdout.trim() : null;
}

function latest(rootDir, commit, file, run) {
  return git(rootDir, ["log", "-1", "--format=%H", commit, "--", file], run);
}

export function inspectArchitecturePushCurrency({ projectDir, commit, checkpoint = false, deps = {} } = {}) {
  const run = deps.run ?? spawnSync;
  if (!projectDir || !OID.test(commit ?? "")) return { ok: false, reason: "candidate commit is invalid" };
  const tree = git(projectDir, ["rev-parse", "--verify", `${commit}^{tree}`], run);
  if (!OID.test(tree ?? "")) return { ok: false, reason: "candidate tree is unavailable" };
  const paths = git(projectDir, ["ls-tree", "-r", "--name-only", commit, "--", "architecture/map"], run);
  if (paths === null) return { ok: false, reason: "candidate architecture map cannot be enumerated" };
  // An unadopted project has no AC-18 map; a partial adopted map is a fault.
  if (paths === "") return { ok: true, applicable: false, commit, tree, stalenessDebt: [] };
  const index = git(projectDir, ["show", `${commit}:${MAP_INDEX}`], run);
  if (index === null) return { ok: false, reason: "candidate architecture map index is missing" };
  const stale = [];
  const concepts = paths.split("\n").filter((p) => /^architecture\/map\/[^/]+\.md$/u.test(p) && p !== MAP_INDEX);
  if (concepts.length === 0) return { ok: false, reason: "candidate architecture map has no concepts" };
  for (const concept of concepts) {
    const raw = git(projectDir, ["show", `${commit}:${concept}`], run);
    const frontmatter = raw?.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1];
    if (!frontmatter) return { ok: false, reason: "candidate architecture concept cannot be parsed" };
    let data;
    try { data = parseYaml(frontmatter); } catch { return { ok: false, reason: "candidate architecture concept cannot be parsed" }; }
    if (!Array.isArray(data?.publicContracts)) return { ok: false, reason: "candidate architecture contract list is invalid" };
    const mapCommit = latest(projectDir, commit, concept, run);
    if (!OID.test(mapCommit ?? "")) return { ok: false, reason: "candidate architecture concept history is unavailable" };
    for (const contract of data.publicContracts) {
      if (typeof contract !== "string" || !contract || contract.includes("..")) return { ok: false, reason: "candidate architecture contract path is invalid" };
      // A directory wildcard is an ownership declaration, not a single
      // versioned public API. Requiring a concept edit for every item file
      // would turn ordinary backlog intake into a stale-map signal.
      if (contract.includes("*") || !(/\.(?:[cm]?js|tsx?)$/u.test(contract) || /(?:^|\/)schemas?\/[^/]+\.json$/u.test(contract) || /\.schema\.json$/u.test(contract))) continue;
      const contractCommit = latest(projectDir, commit, contract, run);
      if (!OID.test(contractCommit ?? "")) return { ok: false, reason: "declared public contract is missing from candidate" };
      const covered = run("git", ["-C", projectDir, "merge-base", "--is-ancestor", contractCommit, mapCommit], { encoding: "utf8", timeout: 10000 });
      if (covered?.status === 1) stale.push({ type: "architecture-map-stale", module: data.id, target: concept, contract, contractCommit, mapCommit });
      else if (covered?.status !== 0) return { ok: false, reason: "architecture map ancestry cannot be verified" };
    }
  }
  return { ok: true, applicable: true, commit, tree, stale: stale.length > 0, stalenessDebt: checkpoint ? stale : [], staleContracts: stale };
}
