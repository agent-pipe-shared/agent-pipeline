// SPDX-License-Identifier: SUL-1.0
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { planVerifySelection } from "./verify-selection.mjs";
import { auditHash } from "./feature-close-audit-receipt.mjs";
export function auditFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "audit executor space-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } }).trim();
  git(["init", "-q"]); git(["commit", "--allow-empty", "-qm", "candidate"]);
  const candidate = { commit: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) }, featureId = "fixture-audit", base = `specs/${featureId}`;
  mkdirSync(join(root, base), { recursive: true });
  const verify = { schema: "pipeline.verify-evidence.v0", ...candidate, candidate, exitCode: 0, selection: planVerifySelection({ mode: "candidate", candidateCommit: candidate.commit, registeredSuiteIds: ["test"], policy: { schema: "pipeline.verify-selection.v1", baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] } }) };
  const artifacts = ["prd", "spec", "acceptance", "result", "candidate-evidence"].map(kind => {
    const bytes = kind === "candidate-evidence" ? JSON.stringify(verify) : kind, path = `${base}/${kind}.json`;
    writeFileSync(join(root, path), bytes);
    return { class: kind, path, sha256: auditHash(bytes), authority: ["prd", "spec"].includes(kind), mutability: kind === "candidate-evidence" ? "immutable" : "mutable", retention: "active" };
  });
  const manifestPath = `${base}/lifecycle.json`;
  writeFileSync(join(root, manifestPath), JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id: featureId, rigor: 1 }, state: "completed", artifacts, candidate, supersedes: null }));
  const pack = { schema: "pipeline.organization-policy-pack.v1", packId: "security-baseline", revision: "a".repeat(64), compatibility: { minimumCoreVersion: "0.4.0", maximumCoreVersion: "0.5.0" }, governanceFloors: { requireHumanDecisionLedger: true, allowExternalAuthority: false }, documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true }] };
  return { root, git, options: { repositoryRoot: root, featureId, candidate, manifestPath, coreVersion: "0.4.7", packs: [pack] } };
}
