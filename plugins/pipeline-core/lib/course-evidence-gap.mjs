// SPDX-License-Identifier: SUL-1.0
// Codex greenfield, candidate 27: a feature manifest revision listed a candidate-evidence file that its own commit did not hold,
// and every later Critic course read of that feature failed for good. This read-only locator names that revision and path.
// It lives apart from critic-course-admission.mjs because the State writer needs it too, and that library imports the writer.
import { execFileSync } from "node:child_process";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const FEATURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

/**
 * Read-only: the first manifest revision (oldest first, up to `commit`) that lists a candidate-evidence path its own commit
 * does not hold as a regular file, as { commit, path }, or null. It runs only git rev-list, show and ls-tree, and never throws.
 */
export function locateCourseEvidenceGap({ repoRoot, featureId, commit }) {
  try {
    if (typeof repoRoot !== "string" || !FEATURE_ID.test(featureId ?? "") || !OID.test(commit ?? "")) return null;
    const manifestPath = `specs/${featureId}/lifecycle.json`;
    const run = (args) => execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 });
    const revisions = run(["rev-list", "--reverse", commit, "--", manifestPath]).split("\n").filter(Boolean).slice(0, 512);
    for (const revision of revisions) {
      let manifest;
      try { manifest = JSON.parse(run(["show", `${revision}:${manifestPath}`])); } catch { continue; }
      for (const entry of Array.isArray(manifest?.artifacts) ? manifest.artifacts : []) {
        if (entry?.class !== "candidate-evidence" || typeof entry.path !== "string") continue;
        const row = run(["ls-tree", "-z", revision, "--", entry.path]);
        if (!/^100644 blob [a-f0-9]{40,64}\t/u.test(row) || !row.endsWith(`\t${entry.path}\0`)) return { commit: revision, path: entry.path };
      }
    }
    return null;
  } catch { return null; }
}
