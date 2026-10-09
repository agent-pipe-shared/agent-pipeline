// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";

import {
  AGENT_PIPELINE_ROOT_INSECURE_OWNED_POSTURE,
  AGENT_PIPELINE_ROOT_REPAIRED_ADVISORY,
  ensureAgentPipelineRoot,
  ensureHardenedPrivateDirectory,
} from "./hardened-private-directory.mjs";
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
const REMEDY_UNAVAILABLE = "the Windows assurance could not be performed; the installer can be re-run once that is resolved";
const REMEDY_INSECURE = "the new directory did not end private; the installer can be re-run after checking the inherited permissions of its parent";

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
      // WINACLFIX-G: nothing is left behind, so the owner remedy must not appear; the observed cause is named.
      assert.equal(message.includes(REMEDY), false, message);
      assert.equal(message.includes("must be removed or re-secured"), false, message);
      assert.ok(message.includes(status === "unavailable" ? REMEDY_UNAVAILABLE : REMEDY_INSECURE), message);
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
    assert.equal(message.includes(REMEDY), false, message);
    assert.ok(message.includes(REMEDY_UNAVAILABLE), message);
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

// WINACLFIX-H: a pre-existing segment whose assurance is unavailable was never judged insecure,
// so the owner remedy ("remove or re-secure") must not be offered; the unavailable remedy is.
test("win32 refusal of a pre-existing segment whose assurance is unavailable gets the unavailable remedy", () => {
  withTemp("hpd-existing-unavailable-", (anchor) => {
    const existing = join(anchor, "agent-pipeline");
    mkdirSync(existing);
    const message = refusalMessage(() => ensureHardenedPrivateDirectory(anchor, join(existing, "hook-state"), {
      platform: "win32",
      assess: () => ({ status: "unavailable", reason: "PowerShell missing" }),
      harden: unreachable("harden"),
    }));
    assert.equal(existsSync(existing), true, "an existing directory is refused, never removed");
    assert.ok(message.includes("unavailable") && message.includes("PowerShell missing"), message);
    assert.ok(message.includes("The directory already existed and was left untouched."), message);
    assert.ok(message.includes(REMEDY_UNAVAILABLE), message);
    assert.equal(message.includes(REMEDY), false, message);
    assert.equal(message.includes("must be removed or re-secured"), false, message);
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

// WIN-AP-T2 (Ruling 141 D0; Ruling 146 open item i): characterisation pins for every branch of the
// repository-private root entry point. WIN-AP-F2 exercised the refusal branches only through an
// untracked probe. These cases are expected GREEN against the current implementation; a red one is a
// finding about the implementation, not a reason to loosen the case.
//
// Three kinds of case, named in their titles. "seam-driven" cases inject the observation, hardening,
// assessment, chmod or uid seams because a real host cannot build the state (a foreign owner, a
// chmod that does not take, an unobservable DACL); the directories themselves are still real.
// "real win32 DACL host" and "real POSIX mode host" cases need the host's own mechanism and skip
// with a typed `SKIP-HOST-CLASS` reason when that mechanism is missing, probed rather than assumed.
describe("ensureAgentPipelineRoot (Ruling 141 D0 root entry point)", () => {
  const SEGMENT = "agent-pipeline";
  const ME = "HOST\\me";
  const SECURE = { status: "secure", reason: "ok" };
  const INSECURE = { status: "insecure", reason: "foreign ACE" };
  const observed = (over = {}) => ({ status: null, reason: null, observation: { currentOwner: ME, owner: ME, reparsePoint: false, principals: [ME, "Everyone"], ...over } });
  const shape = (path, over = {}) => ({ path, created: false, repaired: false, advisory: null, detail: null, ...over });
  const withCommon = (prefix, run) => withTemp(prefix, (common) => run(common, join(resolve(common), SEGMENT)));

  function expectRefusal(run, code) {
    let thrown = null;
    try { run(); } catch (error) { thrown = error; }
    assert.ok(thrown instanceof PrivateBoundaryError, `expected a PrivateBoundaryError, got ${thrown?.name ?? "no throw"}: ${thrown?.message ?? ""}`);
    assert.equal(thrown.code, code, thrown.message);
    return thrown.message;
  }

  /** win32 seams with call counters; `assessed` is the sequence the assess seam walks, its last entry repeating. */
  function win32Seams({ observe, assessed = [SECURE], ...extra }) {
    const calls = { observe: 0, assess: 0, harden: [] };
    const queue = [...assessed];
    return {
      calls,
      options: {
        platform: "win32",
        observe: () => { calls.observe += 1; return observe; },
        harden: (path) => { calls.harden.push(path); return SECURE; },
        assess: () => { calls.assess += 1; return queue.length > 1 ? queue.shift() : queue[0]; },
        ...extra,
      },
    };
  }

  function chmodSpy(effect = () => {}) {
    const calls = [];
    return { calls, chmod: (...args) => { calls.push(args); effect(...args); } };
  }

  /** Makes `root` group/other readable; returns a typed skip reason when the host does not record that. */
  function makeInsecurePosixRoot(root) {
    mkdirSync(root);
    chmodSync(root, 0o755);
    return (lstatSync(root).mode & 0o077) !== 0 ? null : "SKIP-HOST-CLASS group-other-readable-mode-not-recorded";
  }

  function makeDirectoryLink(target, link) {
    try {
      symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
      return null;
    } catch (error) {
      return `SKIP-HOST-CLASS directory-link-creation-denied (${error?.code ?? "unknown"})`;
    }
  }

  function removeLink(link) {
    try { unlinkSync(link); } catch { try { rmdirSync(link); } catch { /* the temporary-directory sweep reports a stuck link */ } }
  }

  /** A host that records and enforces POSIX mode bits and owner ids; probed, not inferred from the platform name. */
  const POSIX_MODE_HOST_SKIP = (() => {
    if (typeof process.getuid !== "function") return "SKIP-HOST-CLASS no-posix-owner-ids";
    try {
      return withTemp("apr-mode-probe-", (dir) => {
        chmodSync(dir, 0o700);
        if ((lstatSync(dir).mode & 0o077) !== 0) return "SKIP-HOST-CLASS posix-private-mode-not-recorded";
        chmodSync(dir, 0o755);
        return (lstatSync(dir).mode & 0o077) === 0 ? "SKIP-HOST-CLASS posix-open-mode-not-recorded" : false;
      });
    } catch (error) {
      return `SKIP-HOST-CLASS posix-mode-probe-failed (${error?.code ?? "unknown"})`;
    }
  })();
  const WIN32_DACL_HOST_SKIP = process.platform === "win32" ? false : "SKIP-HOST-CLASS no-windows-dacl-on-this-host";

  test("the D0 default posture is repair, and an omitted, undefined or explicit posture takes it (seam-driven win32)", () => {
    assert.equal(AGENT_PIPELINE_ROOT_INSECURE_OWNED_POSTURE, "repair");
    assert.equal(AGENT_PIPELINE_ROOT_REPAIRED_ADVISORY, "PB-ROOT-REPAIRED");
    for (const extra of [{}, { posture: undefined }, { posture: "repair" }]) {
      withCommon("apr-default-", (common, root) => {
        mkdirSync(root);
        const { calls, options } = win32Seams({ observe: observed(), ...extra });
        assert.equal(ensureAgentPipelineRoot(common, options).repaired, true, JSON.stringify(extra));
        assert.deepEqual(calls.harden, [root], JSON.stringify(extra));
      });
    }
  });

  test("an absent root is created hardened and reported as created, nothing repaired (seam-driven win32)", () => {
    withCommon("apr-w-absent-", (common, root) => {
      const { calls, options } = win32Seams({ observe: observed() });
      assert.deepEqual(ensureAgentPipelineRoot(common, options), shape(root, { created: true }));
      assert.deepEqual(calls.harden, [root], "the created root is hardened exactly once");
      assert.equal(calls.observe, 0, "an absent root has no owner or DACL to observe");
      assert.equal(statSync(root).isDirectory(), true);
    });
  });

  test("a present, secure root is returned as found under either posture, never hardened (seam-driven win32)", () => {
    for (const posture of ["repair", "refuse"]) {
      withCommon("apr-w-secure-", (common, root) => {
        mkdirSync(root);
        const { calls, options } = win32Seams({ observe: observed({ principals: [ME] }), posture });
        assert.deepEqual(ensureAgentPipelineRoot(common, options), shape(root), posture);
        assert.deepEqual(calls.harden, [], `${posture}: a secure root is not hardened again`);
      });
    }
  });

  test("an insecure root owned by the current user is repaired in place and carries PB-ROOT-REPAIRED (seam-driven win32)", () => {
    withCommon("apr-w-repair-", (common, root) => {
      mkdirSync(root);
      const { calls, options } = win32Seams({ observe: observed(), assessed: [SECURE] });
      const result = ensureAgentPipelineRoot(common, options);
      assert.deepEqual(result, shape(root, { repaired: true, advisory: "PB-ROOT-REPAIRED", detail: "private path DACL grants a non-owner principal" }));
      assert.deepEqual(calls.harden, [root], "the repair hardens the root exactly once");
      assert.equal(calls.assess, 1, "the repair is re-assessed once, after hardening");
      assert.equal(existsSync(root), true);
    });
  });

  for (const [label, after, status, reason, remedy] of [
    ["insecure", INSECURE, "insecure", "foreign ACE", REMEDY],
    ["unavailable", { status: "unavailable", reason: "PowerShell missing" }, "unavailable", "PowerShell missing", REMEDY_UNAVAILABLE],
    ["unreported", undefined, "unavailable", "no reason reported", REMEDY_UNAVAILABLE],
  ]) {
    test(`a repair whose re-assessment is ${label} is refused with PB-WINDOWS-ASSURANCE, never reported repaired, and the root stays (seam-driven win32)`, () => {
      withCommon(`apr-w-norepair-${label}-`, (common, root) => {
        mkdirSync(root);
        const { calls, options } = win32Seams({ observe: observed(), assessed: [after] });
        const message = expectRefusal(() => ensureAgentPipelineRoot(common, options), "PB-WINDOWS-ASSURANCE");
        assert.deepEqual(calls.harden, [root], "the repair was attempted exactly once");
        assert.equal(existsSync(root), true, "a pre-existing root is never removed by a failed repair");
        assert.ok(message.includes(`assurance is ${status} for ${SEGMENT}: ${reason}.`), message);
        assert.ok(message.includes("An in-place repair reset its DACL to the current principal, but it did not end secure."), message);
        assert.ok(message.includes(remedy), message);
        assert.equal(message.includes(common), false, "the message names the segment, never a host path");
      });
    });
  }

  test("a refuse or unrecognised posture leaves an insecure root untouched and refuses (seam-driven win32)", () => {
    for (const posture of ["refuse", "REPAIR", "Repair", "", null, true]) {
      withCommon("apr-w-posture-", (common, root) => {
        mkdirSync(root);
        const { calls, options } = win32Seams({ observe: observed(), assessed: [INSECURE], posture });
        const message = expectRefusal(() => ensureAgentPipelineRoot(common, options), "PB-WINDOWS-ASSURANCE");
        assert.deepEqual(calls.harden, [], `posture ${JSON.stringify(posture)}: nothing is hardened`);
        assert.equal(existsSync(root), true);
        assert.ok(message.includes("The directory already existed and was left untouched."), message);
        assert.ok(message.includes("insecure") && message.includes("foreign ACE"), message);
      });
    }
  });

  test("a root owned by anyone else is refused and left untouched under either posture (seam-driven win32)", () => {
    for (const posture of ["repair", "refuse"]) {
      withCommon("apr-w-foreign-", (common, root) => {
        mkdirSync(root);
        const { calls, options } = win32Seams({ observe: observed({ owner: "HOST\\other" }), assessed: [INSECURE], posture });
        const message = expectRefusal(() => ensureAgentPipelineRoot(common, options), "PB-WINDOWS-ASSURANCE");
        assert.deepEqual(calls.harden, [], `${posture}: a foreign-owned root is never hardened`);
        assert.equal(existsSync(root), true);
        assert.ok(message.includes("The directory already existed and was left untouched."), message);
      });
    }
  });

  test("a root the observation reports as a reparse point is refused even with a clean DACL, and left untouched (seam-driven win32)", () => {
    withCommon("apr-w-reparse-", (common, root) => {
      mkdirSync(root);
      const reason = "private path is a reparse point or its state is unknown";
      const { calls, options } = win32Seams({ observe: observed({ reparsePoint: true, principals: [ME] }), assessed: [{ status: "insecure", reason }] });
      const message = expectRefusal(() => ensureAgentPipelineRoot(common, options), "PB-WINDOWS-ASSURANCE");
      assert.deepEqual(calls.harden, [], "a reparse point is never hardened");
      assert.equal(existsSync(root), true);
      assert.ok(message.includes(reason), message);
    });
  });

  for (const [label, observation] of [
    ["an unavailable status carrying an observation", { status: "unavailable", reason: "PowerShell missing", observation: observed().observation }],
    ["an unavailable status without an observation", { status: "unavailable", reason: "PowerShell missing", observation: null }],
    ["no observation at all", undefined],
  ]) {
    test(`a root whose owner and DACL cannot be observed (${label}) is refused with the unavailable remedy and left untouched (seam-driven win32)`, () => {
      withCommon("apr-w-unobservable-", (common, root) => {
        mkdirSync(root);
        const { calls, options } = win32Seams({ observe: observation, assessed: [{ status: "unavailable", reason: "PowerShell missing" }] });
        const message = expectRefusal(() => ensureAgentPipelineRoot(common, options), "PB-WINDOWS-ASSURANCE");
        assert.deepEqual(calls.harden, [], "an unobservable root is never hardened");
        assert.equal(existsSync(root), true);
        assert.ok(message.includes(`assurance is unavailable for ${SEGMENT}: PowerShell missing.`), message);
        assert.ok(message.includes(REMEDY_UNAVAILABLE), message);
      });
    });
  }

  test("a link at the root is refused with PB-DIRECTORY under every platform branch, link and target untouched (seam-driven platform over a real link)", (t) => {
    withCommon("apr-link-", (common, root) => {
      const target = join(common, "link-target");
      mkdirSync(target);
      writeFileSync(join(target, "keep.txt"), "keep");
      const skip = makeDirectoryLink(target, root);
      if (skip !== null) { t.skip(skip); return; }
      try {
        const modeBefore = lstatSync(target).mode;
        for (const options of [
          { platform: "win32", observe: unreachable("observe"), harden: unreachable("harden"), assess: unreachable("assess") },
          { platform: "linux", chmod: unreachable("chmod"), getuid: unreachable("getuid") },
          {},
        ]) {
          const message = expectRefusal(() => ensureAgentPipelineRoot(common, options), "PB-DIRECTORY");
          assert.ok(message.includes("must be a physical directory"), message);
          assert.equal(lstatSync(root).isSymbolicLink(), true, "the link is left exactly as found");
          assert.equal(readFileSync(join(target, "keep.txt"), "utf8"), "keep", "nothing behind the link is touched");
          assert.equal(lstatSync(target).mode, modeBefore, "the link target's mode is never changed through the link");
        }
      } finally {
        removeLink(root);
      }
    });
  });

  test("a file at the root path is refused with PB-DIRECTORY under every platform branch and its content stays (seam-driven platform over a real file)", () => {
    withCommon("apr-file-", (common, root) => {
      writeFileSync(root, "not a directory");
      for (const options of [
        { platform: "win32", observe: unreachable("observe"), harden: unreachable("harden"), assess: unreachable("assess") },
        { platform: "linux", chmod: unreachable("chmod"), getuid: unreachable("getuid") },
        {},
      ]) {
        const message = expectRefusal(() => ensureAgentPipelineRoot(common, options), "PB-DIRECTORY");
        assert.ok(message.includes("must be a physical directory"), message);
        assert.equal(lstatSync(root).isFile(), true, "the file is never replaced");
        assert.equal(readFileSync(root, "utf8"), "not a directory");
      }
    });
  });

  test("an anchor that is missing, empty, not a string or not a directory is refused with PB-ANCHOR and creates nothing (seam-driven platform)", () => {
    withTemp("apr-anchor-", (dir) => {
      const missing = join(dir, "missing-anchor");
      const file = join(dir, "anchor-is-a-file");
      writeFileSync(file, "x");
      for (const options of [
        { platform: "win32", observe: unreachable("observe"), harden: unreachable("harden"), assess: unreachable("assess") },
        { platform: "linux", chmod: unreachable("chmod"), getuid: unreachable("getuid") },
      ]) {
        for (const anchor of [missing, file, "", undefined, null, 7]) {
          expectRefusal(() => ensureAgentPipelineRoot(anchor, options), "PB-ANCHOR");
        }
      }
      assert.equal(existsSync(missing), false, "a missing anchor is never created");
      assert.equal(existsSync(join(missing, SEGMENT)), false);
      assert.equal(lstatSync(file).isFile(), true);
    });
  });

  test("an insecure root owned by someone else, or by an unknown uid, is refused with PB-ROOT-INSECURE and never chmodded (seam-driven POSIX)", (t) => {
    withCommon("apr-p-foreign-", (common, root) => {
      const skip = makeInsecurePosixRoot(root);
      if (skip !== null) { t.skip(skip); return; }
      const before = lstatSync(root);
      for (const [label, getuid] of [["another uid", () => before.uid + 1], ["null", () => null], ["undefined", () => undefined], ["NaN", () => Number.NaN], ["a string", () => String(before.uid)]]) {
        const spy = chmodSpy();
        const message = expectRefusal(() => ensureAgentPipelineRoot(common, { platform: "linux", getuid, chmod: spy.chmod }), "PB-ROOT-INSECURE");
        assert.match(message, /private-state directory agent-pipeline is insecure \(mode 0o[0-7]{3}\)\./u, label);
        assert.ok(message.includes("It is not owned by the current user and was left untouched."), `${label}: ${message}`);
        assert.ok(message.includes(REMEDY), message);
        assert.deepEqual(spy.calls, [], `${label}: a root that is not provably ours is never chmodded`);
        assert.equal(lstatSync(root).mode, before.mode, `${label}: the mode is untouched`);
        assert.equal(message.includes(common), false, "the message names the segment, never a host path");
      }
    });
  });

  test("a refuse or unrecognised posture refuses an insecure root owned by the current user without chmod (seam-driven POSIX)", (t) => {
    withCommon("apr-p-posture-", (common, root) => {
      const skip = makeInsecurePosixRoot(root);
      if (skip !== null) { t.skip(skip); return; }
      const before = lstatSync(root);
      for (const posture of ["refuse", "REPAIR", "", null]) {
        const spy = chmodSpy();
        const message = expectRefusal(() => ensureAgentPipelineRoot(common, { platform: "linux", posture, getuid: () => before.uid, chmod: spy.chmod }), "PB-ROOT-INSECURE");
        assert.ok(message.includes("It is owned by the current user and was left untouched (refuse posture)."), `${JSON.stringify(posture)}: ${message}`);
        assert.deepEqual(spy.calls, [], `${JSON.stringify(posture)}: nothing is chmodded`);
        assert.equal(lstatSync(root).mode, before.mode);
      }
    });
  });

  test("a chmod that does not take is refused with PB-ROOT-INSECURE after exactly one attempt on the assessed inode (seam-driven POSIX)", (t) => {
    withCommon("apr-p-notake-", (common, root) => {
      const skip = makeInsecurePosixRoot(root);
      if (skip !== null) { t.skip(skip); return; }
      const before = lstatSync(root);
      const spy = chmodSpy();
      const message = expectRefusal(() => ensureAgentPipelineRoot(common, { platform: "linux", getuid: () => before.uid, chmod: spy.chmod }), "PB-ROOT-INSECURE");
      assert.equal(spy.calls.length, 1, "the repair is attempted exactly once");
      const [path, mode, expected] = spy.calls[0];
      assert.equal(path, join(resolve(common), SEGMENT));
      assert.equal(mode, 0o700);
      assert.deepEqual([expected.dev, expected.ino], [before.dev, before.ino], "the chmod is bound to the inode that was assessed");
      assert.match(message, /did not end private after an in-place repair \(mode 0o[0-7]{3}\)\./u);
      assert.ok(message.includes(REMEDY), message);
      assert.equal(existsSync(root), true, "the root is never removed");
    });
  });

  test("an error thrown by the chmod seam propagates unchanged and is not read as a repair (seam-driven POSIX)", (t) => {
    withCommon("apr-p-throws-", (common, root) => {
      const skip = makeInsecurePosixRoot(root);
      if (skip !== null) { t.skip(skip); return; }
      const boom = new Error("chmod crashed");
      const before = lstatSync(root);
      assert.throws(() => ensureAgentPipelineRoot(common, { platform: "linux", getuid: () => before.uid, chmod: () => { throw boom; } }), (error) => error === boom);
      assert.equal(lstatSync(root).mode, before.mode);
    });
  });

  test("real POSIX mode host: an absent root is created with mode 0o700 and reported as created", { skip: POSIX_MODE_HOST_SKIP }, () => {
    withCommon("apr-rp-absent-", (common, root) => {
      assert.deepEqual(ensureAgentPipelineRoot(common), shape(root, { created: true }));
      assert.equal(statSync(root).mode & 0o777, 0o700);
    });
  });

  test("real POSIX mode host: a present root with mode 0o700 is returned as found", { skip: POSIX_MODE_HOST_SKIP }, () => {
    withCommon("apr-rp-secure-", (common, root) => {
      mkdirSync(root);
      chmodSync(root, 0o700);
      assert.deepEqual(ensureAgentPipelineRoot(common), shape(root));
      assert.equal(statSync(root).mode & 0o777, 0o700);
    });
  });

  for (const mode of [0o755, 0o770, 0o705]) {
    test(`real POSIX mode host: an insecure root of mode 0o${mode.toString(8)} owned by the current user is repaired to 0o700 with PB-ROOT-REPAIRED`, { skip: POSIX_MODE_HOST_SKIP }, () => {
      withCommon("apr-rp-repair-", (common, root) => {
        mkdirSync(root);
        chmodSync(root, mode);
        assert.deepEqual(ensureAgentPipelineRoot(common), shape(root, { repaired: true, advisory: "PB-ROOT-REPAIRED", detail: `mode 0o${mode.toString(8)} reset to 0o700` }));
        assert.equal(statSync(root).mode & 0o777, 0o700);
      });
    });
  }

  test("real POSIX mode host: the refuse posture leaves an insecure root of the current user at its mode and refuses with PB-ROOT-INSECURE", { skip: POSIX_MODE_HOST_SKIP }, () => {
    withCommon("apr-rp-refuse-", (common, root) => {
      mkdirSync(root);
      chmodSync(root, 0o755);
      const message = expectRefusal(() => ensureAgentPipelineRoot(common, { posture: "refuse" }), "PB-ROOT-INSECURE");
      assert.ok(message.includes("(mode 0o755)") && message.includes("(refuse posture)"), message);
      assert.equal(statSync(root).mode & 0o777, 0o755, "the refused root keeps the mode it had");
    });
  });

  test("real win32 DACL host: an absent root is created with a secure DACL; a second call returns it as found", { skip: WIN32_DACL_HOST_SKIP }, () => {
    withCommon("apr-rw-absent-", (common, root) => {
      assert.deepEqual(ensureAgentPipelineRoot(common), shape(root, { created: true }));
      assert.equal(assessWindowsPrivatePath(root).status, "secure");
      assert.deepEqual(ensureAgentPipelineRoot(common), shape(root));
      assert.equal(assessWindowsPrivatePath(root).status, "secure");
    });
  });

  test("real win32 DACL host: an insecure root of the current user is repaired to a secure DACL with PB-ROOT-REPAIRED", { skip: WIN32_DACL_HOST_SKIP }, (t) => {
    withCommon("apr-rw-repair-", (common, root) => {
      mkdirSync(root);
      if (assessWindowsPrivatePath(root).status !== "insecure") {
        t.skip("SKIP-HOST-CLASS temp-directory-inherits-no-foreign-ace (an explicit foreign ACE survives the repair and is refused, Ruling 146 open item ii)");
        return;
      }
      const result = ensureAgentPipelineRoot(common);
      assert.deepEqual({ ...result, detail: typeof result.detail }, shape(root, { repaired: true, advisory: "PB-ROOT-REPAIRED", detail: "string" }));
      assert.match(result.detail, /DACL/u);
      assert.equal(assessWindowsPrivatePath(root).status, "secure");
    });
  });

  test("real win32 DACL host: the refuse posture leaves an insecure root of the current user insecure and refuses with PB-WINDOWS-ASSURANCE", { skip: WIN32_DACL_HOST_SKIP }, (t) => {
    withCommon("apr-rw-refuse-", (common, root) => {
      mkdirSync(root);
      if (assessWindowsPrivatePath(root).status !== "insecure") {
        t.skip("SKIP-HOST-CLASS temp-directory-inherits-no-foreign-ace (the insecure-existing premise cannot be built)");
        return;
      }
      const message = expectRefusal(() => ensureAgentPipelineRoot(common, { posture: "refuse" }), "PB-WINDOWS-ASSURANCE");
      assert.ok(message.includes("The directory already existed and was left untouched."), message);
      assert.equal(assessWindowsPrivatePath(root).status, "insecure", "the refused root is never hardened");
    });
  });
});
