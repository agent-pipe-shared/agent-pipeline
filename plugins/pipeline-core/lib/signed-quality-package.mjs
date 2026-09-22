// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export function applyQualityPackage(repoRoot, packageIntent, applyToMain = false) {
  // Validate schema
  if (packageIntent.schema !== "pipeline.signed-quality-package.v1") {
    throw new Error("Invalid schema");
  }

  // Use a temporary worktree
  const worktreeDir = join(repoRoot, ".claude/worktrees/temp-builder-" + Date.now());
  
  try {
    const gitEnv = { ...process.env, GIT_DIR: join(repoRoot, ".git"), GIT_WORK_TREE: worktreeDir };
    
    // Create worktree
    spawnSync("git", ["worktree", "add", worktreeDir, packageIntent.baseCommit], { stdio: "ignore" });

    // Apply patch
    const patchPath = join(worktreeDir, "package.patch");
    writeFileSync(patchPath, packageIntent.unifiedDiff);
    
    const checkRes = spawnSync("git", ["apply", "--check", patchPath], { cwd: worktreeDir });
    if (checkRes.status !== 0) throw new Error("git apply --check failed");
    
    const applyRes = spawnSync("git", ["apply", patchPath], { cwd: worktreeDir });
    if (applyRes.status !== 0) throw new Error("git apply failed");

    // Verify digests
    for (const [relPath, expectedSha] of Object.entries(packageIntent.expectedDigests)) {
      const content = readFileSync(join(worktreeDir, relPath));
      const sha = createHash("sha256").update(content).digest("hex");
      if (sha !== expectedSha) {
        throw new Error(`Digest mismatch for ${relPath}: expected ${expectedSha}, got ${sha}`);
      }
    }

    if (applyToMain) {
       // Also apply to main repository
       const mainPatch = join(repoRoot, "package.patch");
       writeFileSync(mainPatch, packageIntent.unifiedDiff);
       spawnSync("git", ["apply", mainPatch], { cwd: repoRoot });
    }

    return { ok: true, worktreeDir };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
