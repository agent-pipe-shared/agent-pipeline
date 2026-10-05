// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ensureHardenedPrivateDirectory } from "./hardened-private-directory.mjs";
import { PrivateBoundaryError } from "./private-boundary.mjs";
import { assessWindowsPrivatePath } from "./windows-private-state.mjs";
import { applyDecline as applyPreCommitDecline } from "../scripts/pre-commit-hook-install.mjs";
import { applyDecline as applyCommitMsgDecline } from "../scripts/commit-msg-hook-install.mjs";

const windowsOnly = { skip: process.platform !== "win32" ? "native Windows DACL behaviour" : false };

function withTemp(prefix, run) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try { return run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const unreachable = (name) => () => { throw new Error(`${name} must not be called on this platform`); };
const isAssuranceRefusal = (error) => error instanceof PrivateBoundaryError && error.code === "PB-WINDOWS-ASSURANCE";

test("non-win32 platform creates one 0o700 directory per segment and never touches the DACL helpers", () => {
  withTemp("hpd-posix-", (anchor) => {
    const calls = [];
    const target = join(anchor, "agent-pipeline", "hook-state");
    const result = ensureHardenedPrivateDirectory(anchor, target, {
      platform: "linux",
      harden: unreachable("harden"),
      assess: unreachable("assess"),
      mkdir: (path, options) => { calls.push([path, options]); return mkdirSync(path, options); },
    });
    assert.equal(result, target);
    assert.deepEqual(calls, [
      [join(anchor, "agent-pipeline"), { mode: 0o700 }],
      [target, { mode: 0o700 }],
    ]);
    if (process.platform !== "win32") assert.equal(statSync(target).mode & 0o777, 0o700);
  });
});

test("win32 hardens every directory it created before descending and only assesses pre-existing ones", () => {
  withTemp("hpd-order-", (anchor) => {
    const existing = join(anchor, "agent-pipeline");
    mkdirSync(existing);
    const middle = join(existing, "hook-state");
    const leaf = join(middle, "runtime");
    const events = [];
    const result = ensureHardenedPrivateDirectory(anchor, leaf, {
      platform: "win32",
      assess: (path) => { events.push(["assess", path]); return { status: "secure" }; },
      harden: (path) => { events.push(["harden", path, existsSync(join(path, "runtime"))]); return { status: "secure" }; },
    });
    assert.equal(result, leaf);
    assert.deepEqual(events, [["assess", existing], ["harden", middle, false], ["harden", leaf, false]]);
  });
});

test("win32 refuses a pre-existing insecure directory instead of silently re-hardening it", () => {
  withTemp("hpd-refuse-", (anchor) => {
    const existing = join(anchor, "agent-pipeline");
    mkdirSync(existing);
    const hardened = [];
    assert.throws(() => ensureHardenedPrivateDirectory(anchor, join(existing, "hook-state"), {
      platform: "win32",
      assess: () => ({ status: "insecure", reason: "foreign ACE" }),
      harden: (path) => { hardened.push(path); return { status: "secure" }; },
    }), isAssuranceRefusal);
    assert.deepEqual(hardened, []);
    assert.equal(existsSync(join(existing, "hook-state")), false, "nothing is created below a refused directory");
  });
});

test("win32 fails closed when hardening a directory it just created does not end secure", () => {
  withTemp("hpd-unsecure-", (anchor) => {
    assert.throws(() => ensureHardenedPrivateDirectory(anchor, join(anchor, "agent-pipeline", "hook-state"), {
      platform: "win32",
      assess: unreachable("assess"),
      harden: () => ({ status: "unavailable", reason: "PowerShell missing" }),
    }), isAssuranceRefusal);
    assert.equal(existsSync(join(anchor, "agent-pipeline", "hook-state")), false, "no descent past an unhardened directory");
  });
});

test("a target outside the anchor and a non-directory segment are refused on every platform", () => {
  withTemp("hpd-bounds-", (anchor) => {
    const options = { platform: "linux", harden: unreachable("harden"), assess: unreachable("assess") };
    assert.throws(() => ensureHardenedPrivateDirectory(join(anchor, "inner"), join(anchor, "outside"), options), (error) => error.code === "PB-ESCAPE");
    mkdirSync(join(anchor, "inner"));
    writeFileSync(join(anchor, "inner", "not-a-directory"), "x");
    assert.throws(() => ensureHardenedPrivateDirectory(join(anchor, "inner"), join(anchor, "inner", "not-a-directory", "deeper"), options), (error) => error.code === "PB-DIRECTORY");
    assert.throws(() => ensureHardenedPrivateDirectory(join(anchor, "missing-anchor"), join(anchor, "missing-anchor", "x"), options), (error) => error.code === "PB-ANCHOR");
  });
});

test("real native Windows: created directories assess secure; a pre-existing insecure one is refused and stays unhardened", windowsOnly, (t) => {
  withTemp("hpd-real-", (anchor) => {
    const parent = join(anchor, "agent-pipeline");
    const child = join(parent, "pre-commit-hook");
    assert.equal(ensureHardenedPrivateDirectory(anchor, child), child);
    assert.equal(assessWindowsPrivatePath(parent).status, "secure");
    assert.equal(assessWindowsPrivatePath(child).status, "secure");

    const plain = join(anchor, "plain");
    mkdirSync(plain, { mode: 0o700 });
    if (assessWindowsPrivatePath(plain).status !== "insecure") {
      t.skip("host temp directory does not inherit foreign ACEs, so the insecure-existing premise cannot be built");
      return;
    }
    assert.throws(() => ensureHardenedPrivateDirectory(anchor, join(plain, "child")), isAssuranceRefusal);
    assert.equal(assessWindowsPrivatePath(plain).status, "insecure", "an existing directory is refused, never silently re-hardened");
    assert.equal(existsSync(join(plain, "child")), false);
  });
});

for (const [name, decline, stateName] of [
  ["pre-commit", applyPreCommitDecline, "pre-commit-hook"],
  ["commit-msg", applyCommitMsgDecline, "commit-msg-hook"],
]) {
  test(`${name} installer creates its private state directories ${process.platform === "win32" ? "with a secure DACL" : "with mode 0o700"}`, () => {
    withTemp(`hpd-${name}-`, (dir) => {
      const init = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, encoding: "utf8", timeout: 20_000 });
      assert.equal(init.status, 0, init.stderr);
      assert.equal(decline({ rootDir: dir }).status, "declined");
      const parent = join(dir, ".git", "agent-pipeline");
      for (const path of [parent, join(parent, stateName)]) {
        if (process.platform === "win32") assert.equal(assessWindowsPrivatePath(path).status, "secure", path);
        else assert.equal(statSync(path).mode & 0o777, 0o700, path);
      }
    });
  });
}

// WINACLFIX-F (finding F2): a created segment that fails its assurance is taken back, and the
// refusal says which directory, why, and what the owner must do.
const REMEDY = "an existing insecure private directory must be removed or re-secured by its owner before the installer is re-run";

function refusalMessage(run) {
  try {
    run();
  } catch (error) {
    assert.ok(isAssuranceRefusal(error), `expected PB-WINDOWS-ASSURANCE, got ${error?.code ?? error}`);
    return error.message;
  }
  return assert.fail("expected a PB-WINDOWS-ASSURANCE refusal");
}

for (const status of ["unavailable", "insecure"]) {
  test(`win32 removes a created segment whose hardening ends ${status}, so a retry meets no existing insecure directory`, () => {
    withTemp(`hpd-rollback-${status}-`, (anchor) => {
      const parent = join(anchor, "agent-pipeline");
      const leaf = join(parent, "hook-state");
      const message = refusalMessage(() => ensureHardenedPrivateDirectory(anchor, leaf, {
        platform: "win32",
        assess: unreachable("assess"),
        harden: (path) => (path === leaf ? { status, reason: "PowerShell missing" } : { status: "secure" }),
      }));
      assert.equal(existsSync(leaf), false, "the created segment that failed hardening is removed before the refusal");
      assert.equal(existsSync(parent), true, "an earlier created segment that hardened to secure stays");
      assert.ok(message.includes("agent-pipeline/hook-state"), message);
      assert.ok(message.includes(status) && message.includes("PowerShell missing"), message);
      assert.ok(message.includes(REMEDY), message);
      assert.equal(message.includes(anchor), false, "the message is anchor-relative and carries no host path");

      const assessed = [];
      const result = ensureHardenedPrivateDirectory(anchor, leaf, {
        platform: "win32",
        assess: (path) => { assessed.push(path); return { status: "secure" }; },
        harden: () => ({ status: "secure" }),
      });
      assert.equal(result, leaf);
      assert.equal(existsSync(leaf), true);
      assert.deepEqual(assessed, [parent], "the retry assesses the surviving secure segment and creates the leaf afresh");
    });
  });
}

test("win32 removes only the failing created segment and never a pre-existing parent", () => {
  withTemp("hpd-rollback-parent-", (anchor) => {
    const parent = join(anchor, "agent-pipeline");
    mkdirSync(parent);
    const leaf = join(parent, "hook-state");
    const message = refusalMessage(() => ensureHardenedPrivateDirectory(anchor, leaf, {
      platform: "win32",
      assess: () => ({ status: "secure" }),
      harden: () => ({ status: "unavailable", reason: "PowerShell missing" }),
    }));
    assert.equal(existsSync(leaf), false);
    assert.equal(existsSync(parent), true, "a directory that existed before the call is never removed");
    assert.ok(message.includes(REMEDY), message);
  });
});

test("win32 removes a failed created segment only while it is still empty and says when it could not", () => {
  withTemp("hpd-rollback-nonempty-", (anchor) => {
    const leaf = join(anchor, "agent-pipeline");
    const message = refusalMessage(() => ensureHardenedPrivateDirectory(anchor, leaf, {
      platform: "win32",
      assess: unreachable("assess"),
      harden: (path) => { writeFileSync(join(path, "raced-in"), "x"); return { status: "unavailable", reason: "PowerShell missing" }; },
    }));
    assert.equal(existsSync(join(leaf, "raced-in")), true, "content that appeared in the directory is never deleted");
    assert.ok(message.includes("could not be removed"), message);
    assert.ok(message.includes(REMEDY), message);
  });
});

test("win32 removes a created segment when the hardening primitive throws, and rethrows that error unchanged", () => {
  withTemp("hpd-rollback-throws-", (anchor) => {
    const leaf = join(anchor, "agent-pipeline");
    const boom = new Error("powershell crashed");
    assert.throws(() => ensureHardenedPrivateDirectory(anchor, leaf, {
      platform: "win32",
      assess: unreachable("assess"),
      harden: () => { throw boom; },
    }), (error) => error === boom);
    assert.equal(existsSync(leaf), false);
  });
});

test("win32 refusal of a pre-existing insecure directory leaves it in place and names it with the remedy", () => {
  withTemp("hpd-existing-message-", (anchor) => {
    const existing = join(anchor, "agent-pipeline");
    mkdirSync(existing);
    const message = refusalMessage(() => ensureHardenedPrivateDirectory(anchor, join(existing, "hook-state"), {
      platform: "win32",
      assess: () => ({ status: "insecure", reason: "foreign ACE" }),
      harden: unreachable("harden"),
    }));
    assert.equal(existsSync(existing), true, "an existing directory is refused, never removed");
    assert.ok(message.includes("agent-pipeline") && message.includes("insecure") && message.includes("foreign ACE"), message);
    assert.ok(message.includes(REMEDY), message);
    assert.equal(message.includes(anchor), false, "the message is anchor-relative and carries no host path");
  });
});
