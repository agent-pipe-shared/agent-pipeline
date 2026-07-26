#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";

import { observeCodexOnboardingCapabilities } from "./codex-onboarding-capabilities.mjs";

const roots = [];

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      LC_ALL: "C",
    },
  }).trim();
}

function makeRoot(label) {
  const root = mkdtempSync(join(tmpdir(), `codex onboarding capabilities ${label} with spaces-`));
  roots.push(root);
  return root;
}

function localRepository(label = "local") {
  const root = makeRoot(label);
  git(root, ["init", "--initial-branch=main"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "README.md"]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
  return root;
}

function expected(fields) {
  return {
    status: fields.status,
    mode: fields.mode,
    gitVersion: fields.gitVersion ?? null,
    initializesGit: fields.initializesGit ?? false,
    rootWritable: fields.rootWritable,
    sessionCapability: fields.sessionCapability,
    worktreeCapability: fields.worktreeCapability,
  };
}

function assertExact(actual, fields) {
  assert.deepEqual(actual, expected(fields));
  assert.deepEqual(Object.keys(actual).sort(), [
    "gitVersion",
    "initializesGit",
    "mode",
    "rootWritable",
    "sessionCapability",
    "status",
    "worktreeCapability",
  ]);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function treeSnapshot(root) {
  const rows = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const rel = relative(root, path);
      const info = lstatSync(path);
      if (info.isSymbolicLink()) rows.push([rel, "symlink", readlinkSync(path)]);
      else if (info.isDirectory()) {
        rows.push([rel, "directory", info.mode & 0o777]);
        visit(path);
      } else if (info.isFile()) rows.push([rel, "file", info.mode & 0o777, sha256(readFileSync(path))]);
      else rows.push([rel, "other", info.mode]);
    }
  }
  visit(root);
  return rows;
}

function refSnapshot(root) {
  return git(root, ["for-each-ref", "--format=%(refname)%00%(objectname)"]);
}

function worktreeSnapshot(root) {
  return git(root, ["worktree", "list", "--porcelain", "-z"]);
}

function hostManagedRoot(label = "host") {
  const root = makeRoot(label);
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, ".codex"));
  chmodSync(join(root, ".git"), 0o500);
  chmodSync(join(root, ".codex"), 0o500);
  return root;
}

function initializedHostManagedRoot(label = "initialized host") {
  const root = makeRoot(label);
  git(root, ["init", "--initial-branch=main"]);
  mkdirSync(join(root, ".codex"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  const files = {
    ".claude/pipeline.json": `${JSON.stringify({
      repositoryMode: "host-managed",
      handover: "docs/state.md",
    }, null, 2)}\n`,
    ".claude/pipeline-state.json": "{\"schema\":\"pipeline.state.v1\"}\n",
    "docs/state.md": "# Initial state\n",
    "specs/kickoff-initial-prd.md": "# Initial PRD\n",
    "specs/kickoff-initial-spec.md": "# Initial Spec\n",
  };
  for (const [path, bytes] of Object.entries(files)) writeFileSync(join(root, path), bytes);
  const history = {
    schema: "pipeline.codex-onboarding-continuity-history.v1",
    transactions: [{
      kind: "kickoff",
      transactionSha256: "a".repeat(64),
      goalSha256: "b".repeat(64),
      calibrationSha256: sha256(Buffer.from(files[".claude/pipeline.json"])),
      stateSha256: sha256(Buffer.from(files[".claude/pipeline-state.json"])),
      handoverSha256: sha256(Buffer.from(files["docs/state.md"])),
      prdSha256: sha256(Buffer.from(files["specs/kickoff-initial-prd.md"])),
      specSha256: sha256(Buffer.from(files["specs/kickoff-initial-spec.md"])),
    }],
  };
  mkdirSync(join(root, ".git", "agent-pipeline", "onboarding"), { recursive: true });
  writeFileSync(
    join(root, ".git", "agent-pipeline", "onboarding", "continuity-history.json"),
    `${JSON.stringify(history, null, 2)}\n`,
    { mode: 0o600 },
  );
  chmodSync(join(root, ".git"), 0o500);
  chmodSync(join(root, ".codex"), 0o500);
  return root;
}

test.after(() => {
  for (const root of roots) {
    if (existsSync(join(root, ".git"))) {
      try { chmodSync(join(root, ".git"), 0o700); } catch {}
    }
    if (existsSync(join(root, ".codex"))) {
      try { chmodSync(join(root, ".codex"), 0o700); } catch {}
    }
    try { chmodSync(root, 0o700); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

test("onboarding observes an empty root as local-uninitialized and binds only a reviewed Git-init claim", () => {
  const root = makeRoot("empty");
  const observed = observeCodexOnboardingCapabilities({
    rootDir: root,
    intent: "onboarding",
    willInitializeGit: true,
  });
  assertExact(observed, {
    status: "local-uninitialized",
    mode: "local",
    gitVersion: observed.gitVersion,
    initializesGit: true,
    rootWritable: "passed",
    sessionCapability: "not-required",
    worktreeCapability: "not-required",
  });
  assert.match(observed.gitVersion, /^\d+\.\d+(?:\.\d+)?/u);
  assert.deepEqual(readdirSync(root), []);
});

test("bootstrap observes a local-uninitialized root without claiming a Git-init mutation", () => {
  const root = makeRoot("pre head bootstrap");
  const observed = observeCodexOnboardingCapabilities({ rootDir: root, intent: "bootstrap" });
  assertExact(observed, {
    status: "local-uninitialized",
    mode: "local",
    gitVersion: observed.gitVersion,
    initializesGit: false,
    rootWritable: "passed",
    sessionCapability: "not-required",
    worktreeCapability: "not-required",
  });
});

test("a fresh Codex root with only an empty read-only .git mount is host-managed", (t) => {
  if (process.platform === "win32") t.skip("POSIX mode fixture");
  const root = makeRoot("git-only host mount");
  mkdirSync(join(root, ".git"));
  chmodSync(join(root, ".git"), 0o500);
  const observed = observeCodexOnboardingCapabilities({ rootDir: root, intent: "bootstrap" });
  assertExact(observed, {
    status: "host-managed",
    mode: "host-managed",
    rootWritable: "passed",
    sessionCapability: "not-required",
    worktreeCapability: "not-required",
  });
});

test("a restarted Codex session accepts only a kickoff-bound initialized host Git mount", (t) => {
  if (process.platform === "win32") return t.skip("POSIX protected-mount fixture");
  const root = initializedHostManagedRoot();
  try {
    const bootstrap = observeCodexOnboardingCapabilities({ rootDir: root, intent: "bootstrap" });
    assertExact(bootstrap, {
      status: "host-managed",
      mode: "host-managed",
      gitVersion: bootstrap.gitVersion,
      rootWritable: "passed",
      sessionCapability: "not-required",
      worktreeCapability: "not-required",
    });
    assert.match(bootstrap.gitVersion, /^\d+\.\d+\.\d+/u);

    const session = observeCodexOnboardingCapabilities({ rootDir: root, intent: "session" });
    assertExact(session, {
      status: "host-managed",
      mode: "host-managed",
      gitVersion: session.gitVersion,
      rootWritable: "passed",
      sessionCapability: "passed",
      worktreeCapability: "not-required",
    });

    writeFileSync(join(root, "docs", "state.md"), "# drifted state\n");
    const drift = observeCodexOnboardingCapabilities({ rootDir: root, intent: "bootstrap" });
    assert.equal(drift.status, "control-path-read-only");
    assert.equal(drift.mode, "local");
  } finally {
    chmodSync(join(root, ".git"), 0o700);
    chmodSync(join(root, ".codex"), 0o700);
  }
});

test("initialized host projection remains observable from a read-only hook without a root write probe", (t) => {
  if (process.platform === "win32") return t.skip("POSIX protected-mount fixture");
  const root = initializedHostManagedRoot("initialized host read-only hook");
  let probeSteps = 0;
  try {
    chmodSync(root, 0o500);
    const observed = observeCodexOnboardingCapabilities({
      rootDir: root,
      intent: "session",
      faultInjector() {
        probeSteps += 1;
        throw new Error("protected hook must not run a disposable write probe");
      },
    });
    assertExact(observed, {
      status: "host-managed",
      mode: "host-managed",
      gitVersion: observed.gitVersion,
      rootWritable: "passed",
      sessionCapability: "passed",
      worktreeCapability: "not-required",
    });
    assert.equal(probeSteps, 0);
  } finally {
    chmodSync(root, 0o700);
    chmodSync(join(root, ".git"), 0o700);
    chmodSync(join(root, ".codex"), 0o700);
  }
});

test("local repository capability accepts a physical .git directory and a registered .git file worktree", () => {
  const primary = localRepository("git directory");
  const directory = observeCodexOnboardingCapabilities({ rootDir: primary, intent: "bootstrap" });
  assertExact(directory, {
    status: "local-valid-writable",
    mode: "local",
    gitVersion: directory.gitVersion,
    rootWritable: "passed",
    sessionCapability: "not-required",
    worktreeCapability: "not-required",
  });

  const linked = join(makeRoot("git file parent"), "linked worktree");
  git(primary, ["worktree", "add", "--detach", linked, "HEAD"]);
  const file = observeCodexOnboardingCapabilities({ rootDir: linked, intent: "bootstrap" });
  assert.equal(lstatSync(join(linked, ".git")).isFile(), true);
  assertExact(file, {
    status: "local-valid-writable",
    mode: "local",
    gitVersion: file.gitVersion,
    rootWritable: "passed",
    sessionCapability: "not-required",
    worktreeCapability: "not-required",
  });
  git(primary, ["worktree", "remove", "--force", linked]);
});

test("host-managed observation requires exact empty non-writable physical controls and never invokes Git", () => {
  const root = hostManagedRoot();
  mkdirSync(join(root, ".agents"));
  chmodSync(join(root, ".agents"), 0o500);
  let gitCalls = 0;
  const observed = observeCodexOnboardingCapabilities({
    rootDir: root,
    intent: "bootstrap",
    deps: {
      spawnSync: () => {
        gitCalls += 1;
        throw new Error("host-managed must not invoke Git");
      },
    },
  });
  assertExact(observed, {
    status: "host-managed",
    mode: "host-managed",
    rootWritable: "passed",
    sessionCapability: "not-required",
    worktreeCapability: "not-required",
  });
  assert.equal(gitCalls, 0);
});

test("host-managed is observed but remains unqualified for session and dispatch", () => {
  for (const intent of ["session", "dispatch"]) {
    const root = hostManagedRoot(`host ${intent}`);
    const observed = observeCodexOnboardingCapabilities({
      rootDir: root,
      intent,
      repositoryMode: "host-managed",
    });
    assertExact(observed, {
      status: "host-managed",
      mode: "host-managed",
      rootWritable: "passed",
      sessionCapability: "not-observed",
      worktreeCapability: intent === "dispatch" ? "not-observed" : "not-required",
    });
  }
});

test("a writable, nonempty, symlinked, or incomplete declared host-control layout fails closed", (t) => {
  if (process.platform === "win32") t.skip("POSIX mode and symlink fixture");
  const fixtures = [
    ["writable", () => {
      const root = makeRoot("host writable");
      mkdirSync(join(root, ".git"));
      mkdirSync(join(root, ".codex"));
      return root;
    }],
    ["nonempty", () => {
      const root = hostManagedRoot("host nonempty");
      chmodSync(join(root, ".git"), 0o700);
      writeFileSync(join(root, ".git", "HEAD"), "unexpected\n");
      chmodSync(join(root, ".git"), 0o500);
      return root;
    }],
    ["symlinked", () => {
      const root = makeRoot("host symlinked");
      const outside = makeRoot("host symlink target");
      mkdirSync(join(outside, "git"));
      mkdirSync(join(root, ".codex"));
      symlinkSync(join(outside, "git"), join(root, ".git"), "dir");
      chmodSync(join(root, ".codex"), 0o500);
      return root;
    }],
    ["incomplete", () => {
      const root = makeRoot("host incomplete");
      mkdirSync(join(root, ".git"));
      chmodSync(join(root, ".git"), 0o500);
      return root;
    }],
  ];
  for (const [label, create] of fixtures) {
    const observed = observeCodexOnboardingCapabilities({
      rootDir: create(),
      intent: "onboarding",
      repositoryMode: "host-managed",
    });
    assertExact(observed, {
      status: "control-path-invalid",
      mode: "unknown",
      rootWritable: "passed",
      sessionCapability: "not-required",
      worktreeCapability: "not-required",
    });
    assert.equal(observed.gitVersion, null, label);
  }
});

test("missing and too-old Git map exactly to git-unavailable before session side effects", () => {
  for (const [label, result] of [
    ["missing", { status: null, stdout: "", stderr: "", error: Object.assign(new Error("missing"), { code: "ENOENT" }) }],
    ["old", { status: 0, stdout: "git version 2.27.9\n", stderr: "" }],
    ["unrecognized", { status: 0, stdout: "unknown git build\n", stderr: "" }],
  ]) {
    const root = makeRoot(`git ${label}`);
    let nonVersionCalls = 0;
    const observed = observeCodexOnboardingCapabilities({
      rootDir: root,
      intent: "session",
      deps: {
        spawnSync(command, args, options) {
          if (command === "git" && args.length === 1 && args[0] === "--version") return result;
          nonVersionCalls += 1;
          return spawnSync(command, args, options);
        },
      },
    });
    assertExact(observed, {
      status: "git-unavailable",
      mode: "local",
      rootWritable: "passed",
      sessionCapability: "not-observed",
      worktreeCapability: "not-required",
    });
    assert.equal(nonVersionCalls, 0, `${label} performed repository/session Git calls`);
  }
});

test("root and Git-control write probes map to distinct closed statuses and leave no bytes", (t) => {
  if (process.platform === "win32") t.skip("POSIX mode fixture");
  const rootReadOnly = makeRoot("root read only");
  chmodSync(rootReadOnly, 0o500);
  const rootBefore = treeSnapshot(rootReadOnly);
  const rootObserved = observeCodexOnboardingCapabilities({ rootDir: rootReadOnly, intent: "onboarding" });
  assertExact(rootObserved, {
    status: "root-read-only",
    mode: "unknown",
    rootWritable: "failed",
    sessionCapability: "not-required",
    worktreeCapability: "not-required",
  });
  assert.deepEqual(treeSnapshot(rootReadOnly), rootBefore);
  chmodSync(rootReadOnly, 0o700);

  const controlReadOnly = localRepository("control read only");
  const controlBefore = treeSnapshot(controlReadOnly);
  const controlMode = lstatSync(join(controlReadOnly, ".git")).mode & 0o777;
  chmodSync(join(controlReadOnly, ".git"), 0o500);
  const controlObserved = observeCodexOnboardingCapabilities({ rootDir: controlReadOnly, intent: "session" });
  assertExact(controlObserved, {
    status: "control-path-read-only",
    mode: "local",
    gitVersion: controlObserved.gitVersion,
    rootWritable: "passed",
    sessionCapability: "not-observed",
    worktreeCapability: "not-required",
  });
  chmodSync(join(controlReadOnly, ".git"), controlMode);
  assert.deepEqual(treeSnapshot(controlReadOnly), controlBefore);
});

test("root aliases, .git symlinks, and unregistered escaping .git files are rejected before probes", (t) => {
  if (process.platform === "win32") t.skip("symlink fixture");
  const physical = makeRoot("physical root");
  const alias = join(makeRoot("root alias parent"), "alias");
  symlinkSync(physical, alias, "dir");
  assertExact(observeCodexOnboardingCapabilities({ rootDir: alias, intent: "onboarding" }), {
    status: "unavailable",
    mode: "unknown",
    rootWritable: "not-observed",
    sessionCapability: "not-required",
    worktreeCapability: "not-required",
  });

  const linkedGit = makeRoot("linked git");
  const outside = localRepository("outside git");
  symlinkSync(join(outside, ".git"), join(linkedGit, ".git"), "dir");
  assertExact(observeCodexOnboardingCapabilities({ rootDir: linkedGit, intent: "bootstrap" }), {
    status: "control-path-invalid",
    mode: "local",
    gitVersion: null,
    rootWritable: "passed",
    sessionCapability: "not-required",
    worktreeCapability: "not-required",
  });

  const escaped = makeRoot("escaped git file");
  writeFileSync(join(escaped, ".git"), `gitdir: ${join(outside, ".git")}\n`);
  const escapedObserved = observeCodexOnboardingCapabilities({ rootDir: escaped, intent: "bootstrap" });
  assertExact(escapedObserved, {
    status: "control-path-invalid",
    mode: "local",
    gitVersion: escapedObserved.gitVersion,
    rootWritable: "passed",
    sessionCapability: "not-required",
    worktreeCapability: "not-required",
  });
});

test("session intent performs and fully rolls back one real cleanup-descriptor probe", () => {
  const root = localRepository("session probe");
  const before = treeSnapshot(root);
  const observed = observeCodexOnboardingCapabilities({ rootDir: root, intent: "session" });
  assertExact(observed, {
    status: "local-valid-writable",
    mode: "local",
    gitVersion: observed.gitVersion,
    rootWritable: "passed",
    sessionCapability: "passed",
    worktreeCapability: "not-required",
  });
  assert.deepEqual(treeSnapshot(root), before);
});

test("dispatch intent performs real session and detached-worktree probes with zero refs, bytes, or descriptors left", () => {
  const root = localRepository("dispatch probe");
  const before = treeSnapshot(root);
  const refsBefore = refSnapshot(root);
  const worktreesBefore = worktreeSnapshot(root);
  const observed = observeCodexOnboardingCapabilities({ rootDir: root, intent: "dispatch" });
  assertExact(observed, {
    status: "local-valid-writable",
    mode: "local",
    gitVersion: observed.gitVersion,
    rootWritable: "passed",
    sessionCapability: "passed",
    worktreeCapability: "passed",
  });
  assert.equal(refSnapshot(root), refsBefore);
  assert.equal(worktreeSnapshot(root), worktreesBefore);
  assert.deepEqual(treeSnapshot(root), before);
});

test("fault injection after session creation rolls back the exact descriptor and reports session unavailable", () => {
  const root = localRepository("session fault");
  const before = treeSnapshot(root);
  const observed = observeCodexOnboardingCapabilities({
    rootDir: root,
    intent: "session",
    faultInjector(step) {
      if (step === "session-probe-created") throw new Error("fault:session-probe-created");
    },
  });
  assertExact(observed, {
    status: "session-capability-unavailable",
    mode: "local",
    gitVersion: observed.gitVersion,
    rootWritable: "passed",
    sessionCapability: "failed",
    worktreeCapability: "not-required",
  });
  assert.deepEqual(treeSnapshot(root), before);
});

test("fault injection after worktree creation rolls back the exact worktree and reports worktree unavailable", () => {
  const root = localRepository("worktree fault");
  const before = treeSnapshot(root);
  const refsBefore = refSnapshot(root);
  const worktreesBefore = worktreeSnapshot(root);
  const observed = observeCodexOnboardingCapabilities({
    rootDir: root,
    intent: "dispatch",
    faultInjector(step) {
      if (step === "worktree-probe-created") throw new Error("fault:worktree-probe-created");
    },
  });
  assertExact(observed, {
    status: "worktree-capability-unavailable",
    mode: "local",
    gitVersion: observed.gitVersion,
    rootWritable: "passed",
    sessionCapability: "passed",
    worktreeCapability: "failed",
  });
  assert.equal(refSnapshot(root), refsBefore);
  assert.equal(worktreeSnapshot(root), worktreesBefore);
  assert.deepEqual(treeSnapshot(root), before);
});

test("foreign target and administration content is preserved instead of recursively removed", () => {
  const root = localRepository("worktree foreign-content race");
  let target;
  let admin;
  const observed = observeCodexOnboardingCapabilities({
    rootDir: root,
    intent: "dispatch",
    faultInjector(step) {
      if (step !== "worktree-probe-created") return;
      const detached = join(root, "branch", "detached");
      target = join(detached, readdirSync(detached)[0]);
      const marker = readFileSync(join(target, ".git"), "utf8").trim();
      admin = resolve(target, marker.slice("gitdir: ".length));
      writeFileSync(join(target, "foreign-target.txt"), "preserve target\n");
      writeFileSync(join(admin, "foreign-admin.txt"), "preserve admin\n");
    },
  });
  assertExact(observed, {
    status: "worktree-capability-unavailable",
    mode: "local",
    gitVersion: observed.gitVersion,
    rootWritable: "passed",
    sessionCapability: "passed",
    worktreeCapability: "failed",
  });
  assert.equal(readFileSync(join(target, "foreign-target.txt"), "utf8"), "preserve target\n");
  assert.equal(readFileSync(join(admin, "foreign-admin.txt"), "utf8"), "preserve admin\n");
  assert.match(worktreeSnapshot(root), /capability-/u);
});

test("injected root-probe failure rolls back its exact temporary paths and stops before Git", () => {
  const root = localRepository("root probe fault");
  const before = treeSnapshot(root);
  let gitCalls = 0;
  const observed = observeCodexOnboardingCapabilities({
    rootDir: root,
    intent: "dispatch",
    deps: {
      spawnSync(command, args, options) {
        gitCalls += 1;
        return spawnSync(command, args, options);
      },
    },
    faultInjector(step) {
      if (step === "root-probe-renamed") throw new Error("fault:root-probe-renamed");
    },
  });
  assertExact(observed, {
    status: "root-read-only",
    mode: "unknown",
    rootWritable: "failed",
    sessionCapability: "not-observed",
    worktreeCapability: "not-observed",
  });
  assert.equal(gitCalls, 0);
  assert.deepEqual(treeSnapshot(root), before);
});
