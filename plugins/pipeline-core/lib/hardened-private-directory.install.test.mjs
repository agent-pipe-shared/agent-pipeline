// SPDX-License-Identifier: SUL-1.0
/**
 * WINACLFIX-F (finding F1): the real `applyInstall` of every hook installer, run in a fresh
 * temporary git repository, must leave every private directory it created secure. On native
 * Windows "secure" is decided by the real assessment primitive, never by a stub; elsewhere
 * the directories the installer's own helper creates must carry mode 0o700.
 *
 * Run: node --test plugins/pipeline-core/lib/hardened-private-directory.install.test.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { assessWindowsPrivatePath } from "./windows-private-state.mjs";
// pre-push first: project onboarding imports this installer in-process.
import { applyInstall as applyPrePushInstall } from "../scripts/pre-push-hook-install.mjs";
import { applyInstall as applyPreCommitInstall } from "../scripts/pre-commit-hook-install.mjs";
import { applyInstall as applyCommitMsgInstall } from "../scripts/commit-msg-hook-install.mjs";

const onWindows = process.platform === "win32";

function withTemp(prefix, run) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try { return run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** `root` and every physical (non-symlink) directory below it. */
function directoriesBelow(root) {
  const found = [root];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...directoriesBelow(join(root, entry.name)));
  }
  return found;
}

for (const [name, install, stateName] of [
  ["pre-push", applyPrePushInstall, "pre-push-hook"],
  ["pre-commit", applyPreCommitInstall, "pre-commit-hook"],
  ["commit-msg", applyCommitMsgInstall, "commit-msg-hook"],
]) {
  test(`${name} applyInstall in a fresh repository leaves every private directory it created ${onWindows ? "secure" : "mode 0o700"}`, { timeout: 180_000 }, () => {
    withTemp(`hpd-install-${name}-`, (dir) => {
      const init = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, encoding: "utf8", timeout: 20_000 });
      assert.equal(init.status, 0, init.stderr);

      if (onWindows) {
        // Premise check: a plain mkdirSync sibling in this same temp root must assess insecure on
        // this host. Without it a "secure" verdict below could not tell a hardened directory from
        // one that merely sits in a host that happens to hand down private ACEs.
        const plain = join(dir, "plain-sibling");
        mkdirSync(plain, { mode: 0o700 });
        assert.equal(assessWindowsPrivatePath(plain).status, "insecure", "premise: a plain mkdirSync directory in this temp root is insecure on this host");
      }

      const result = install({ rootDir: dir });
      assert.equal(result.status, "installed", JSON.stringify(result));

      const parent = join(dir, ".git", "agent-pipeline");
      const stateDir = join(parent, stateName);
      if (onWindows) {
        const created = directoriesBelow(parent);
        assert.ok(created.includes(stateDir), "the installer created its hook state directory");
        for (const path of created) {
          const state = assessWindowsPrivatePath(path);
          assert.equal(state.status, "secure", `${path.slice(dir.length + 1)}: ${state.reason}`);
        }
      } else {
        for (const path of [parent, stateDir]) assert.equal(statSync(path).mode & 0o777, 0o700, path.slice(dir.length + 1));
      }
    });
  });
}
