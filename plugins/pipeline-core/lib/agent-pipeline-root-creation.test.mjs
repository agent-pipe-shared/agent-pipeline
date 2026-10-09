// SPDX-License-Identifier: SUL-1.0
//
// WIN-AP-T (Ruling 141, slice S1 of the WIN-AP-D note): every first creator of
// the private root `<git-common-dir>/agent-pipeline` must leave that segment
// private. Each pin runs ONE creator against its own fresh temporary
// repository, proves the creator actually ran (its own artefact exists), and
// only then asserts the privacy of the `agent-pipeline` segment:
//
//   win32: assessWindowsPrivatePath(segment).status === "secure"
//   POSIX: (mode & 0o077) === 0
//
// Pins (a) to (c) hold under either answer to decision D0. Pin (e) is written
// against the Ruling 141 default (a pre-existing insecure segment owned by the
// current user is repaired in place by the single entry point); a PO "refuse"
// ruling changes only that pin. Pin (d), the four WIN-GES-F3 integration reds,
// is deliberately absent: the existing cases in
// scripts/guard-maintenance-window.test.mjs serve as that pin.
//
// Expected state while the creators are unhardened (before slices S2 to S5):
//   (a) RED on every platform: the recursive mkdir passes mode 0o755 (POSIX)
//       and inherits the parent DACL without any hardening (win32).
//   (b), (c) GREEN on POSIX (recursive mkdir with mode 0o700); RED on win32
//       when the host temporary directory hands down a foreign ACE.
//   (e) RED everywhere: the entry point does not exist yet.
// A win32 host whose temporary directory hands down no foreign ACE makes
// (a) to (c) GREEN by an absent premise, not because the creator hardens.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { readLocalRepositoryFingerprint } from "./governance-event-store.mjs";
import { recordBootstrapPreflightReceipt } from "./guard/bootstrap-receipt.mjs";
import { isFirstDenialThisScope } from "./guard/denial-telemetry.mjs";
import { assessWindowsPrivatePath } from "./windows-private-state.mjs";

const SEGMENT = "agent-pipeline";
const WIN32 = process.platform === "win32";

/**
 * A real, freshly initialised git repository (one empty commit) in the host
 * temporary directory, plus its resolved common directory. The process umask is
 * pinned to 0o022 for the duration so that a POSIX mode check measures the
 * creator's own mode argument and not the invoking shell's umask.
 */
async function withRepository(run) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ap-root-")));
  const previousUmask = WIN32 ? null : process.umask(0o022);
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "fixture"], { cwd: root });
    const common = realpathSync(resolve(root, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim()));
    return await run({ root, common, segment: join(common, SEGMENT) });
  } finally {
    if (previousUmask !== null) process.umask(previousUmask);
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  }
}

function privacyOf(segment) {
  if (WIN32) {
    const { status, reason } = assessWindowsPrivatePath(segment);
    return { isPrivate: status === "secure", detail: `status=${status}${reason ? `, reason=${reason}` : ""}` };
  }
  const mode = statSync(segment).mode & 0o777;
  return { isPrivate: (mode & 0o077) === 0, detail: `mode=0o${mode.toString(8)}` };
}

/** The creator must have run (its artefact exists) before privacy means anything. */
function assertCreatorRanThenSegmentPrivate(pin, segment, artefact) {
  assert.ok(existsSync(artefact), `${pin}: the creator left no artefact under the "${SEGMENT}" segment, so it did not run (a swallowed error is not a pass)`);
  const { isPrivate, detail } = privacyOf(segment);
  assert.ok(isPrivate, `${pin}: the "${SEGMENT}" segment is not private after its first creator ran (${detail})`);
}

/**
 * Makes `segment` an insecure private-root premise owned by the current user:
 * POSIX group/other readable; win32 a foreign ACE (inherited from the host
 * temporary directory when it hands one down, otherwise granted explicitly).
 * Returns true only when the premise really holds.
 */
function makeInsecureSegment(segment) {
  mkdirSync(segment, { mode: 0o755 });
  if (!WIN32) {
    chmodSync(segment, 0o755);
    return !privacyOf(segment).isPrivate;
  }
  if (!privacyOf(segment).isPrivate && assessWindowsPrivatePath(segment).status === "insecure") return true;
  try {
    execFileSync("icacls", [segment, "/grant", "*S-1-1-0:(OI)(CI)R"], { stdio: "ignore" });
  } catch {
    return false;
  }
  return assessWindowsPrivatePath(segment).status === "insecure";
}

test("pin (a): readLocalRepositoryFingerprint leaves the agent-pipeline segment private on a fresh repository", async () => {
  await withRepository(async ({ root, segment }) => {
    const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root });
    assert.match(fingerprint, /^[0-9a-f]{64}$/u, "pin (a): the first bind must mint a fingerprint");
    assertCreatorRanThenSegmentPrivate("pin (a)", segment, join(segment, "governance-events", "repository-binding.json"));
  });
});

test("pin (b): recordBootstrapPreflightReceipt leaves the agent-pipeline segment private on a fresh repository", async () => {
  await withRepository(async ({ root, common, segment }) => {
    const agentId = "win-ap-t-agent";
    // The injected identity makes the runtime agent_id / agent_type path reachable; the
    // injected common directory resolver stands in for the hook's git probe. The mkdir
    // and the write under test stay the real ones.
    recordBootstrapPreflightReceipt(
      { agent_id: agentId, agent_type: "pipeline-core:goldfish-deep" },
      root,
      { subagentIdentityFn: () => ({ kind: "unresolved" }), resolveGitCommonDirFn: () => common },
    );
    assertCreatorRanThenSegmentPrivate("pin (b)", segment, join(segment, "bootstrap-receipt", `${agentId}.json`));
  });
});

test("pin (c): a denial-telemetry write leaves the agent-pipeline segment private on a fresh repository", async () => {
  await withRepository(async ({ root, common, segment }) => {
    const sessionId = "win-ap-t-session";
    const first = isFirstDenialThisScope(
      { session_id: sessionId },
      root,
      "WIN-AP-T-CLASS",
      { subagentIdentityFn: () => ({ kind: "orchestrator" }), resolveGitCommonDirFn: () => common },
    );
    assert.equal(first, true, "pin (c): the first denial of a class in a fresh scope must report true");
    assertCreatorRanThenSegmentPrivate("pin (c)", segment, join(segment, "guard-denial-classes", `${sessionId}.json`));
  });
});

test("pin (e) premise: the insecure pre-existing agent-pipeline segment can be built on this host", async (t) => {
  await withRepository(({ segment }) => {
    if (!makeInsecureSegment(segment)) {
      t.skip(`the host cannot build an insecure "${SEGMENT}" premise, so pin (e) would be vacuous here`);
      return;
    }
    assert.equal(privacyOf(segment).isPrivate, false, `pin (e) premise: the "${SEGMENT}" segment must be insecure before the entry point runs`);
  });
});

test("pin (e): D0 default - ensureAgentPipelineRoot repairs a pre-existing insecure agent-pipeline segment owned by the current user", async (t) => {
  // Not a todo and not a skip: until Ruling 141 slice S2 lands the export, this is RED.
  const module = await import("./hardened-private-directory.mjs");
  assert.equal(
    typeof module.ensureAgentPipelineRoot,
    "function",
    "pin (e): ./hardened-private-directory.mjs does not export ensureAgentPipelineRoot(common) yet (Ruling 141, slice S2); the D0 repair-in-place default cannot be exercised",
  );
  await withRepository(async ({ common, segment }) => {
    if (!makeInsecureSegment(segment)) {
      t.skip(`the host cannot build an insecure "${SEGMENT}" premise (see the premise case above)`);
      return;
    }
    await module.ensureAgentPipelineRoot(common);
    assert.ok(existsSync(segment), `pin (e): the "${SEGMENT}" segment must still exist after the repair`);
    const { isPrivate, detail } = privacyOf(segment);
    assert.ok(isPrivate, `pin (e): the entry point left the pre-existing insecure "${SEGMENT}" segment insecure (${detail})`);
  });
});

// WIN-AP-S6-T (Ruling 162, slice S6 of the WIN-AP-D note): the two shared
// private-directory helpers must go through the hardened entry point
// `ensureAgentPipelineRoot` for the `agent-pipeline` segment, so that their many
// callers need no edit:
//
//   private-boundary.ensurePrivateDirectory
//   human-guard-override.secureDirectory (exposed as humanGuardOverrideInternals.secureDirectory)
//
// Each helper is called on a path ONE level below the segment, as production
// does. The helpers expose no injection seam for the entry point, so "went
// through it" is observed through its two visible effects: the in-place repair
// of a pre-existing insecure segment (Ruling 157 D0) and the typed
// PB-ROOT-REPAIRED process warning. Three pins per helper:
//
//   pin (f) fresh repository: the segment ends private
//   pin (g) pre-existing insecure segment owned by the current user: it ends private
//   pin (h) that repair is reported as exactly one PB-ROOT-REPAIRED warning
const S6_HELPERS = [
  {
    name: "private-boundary.ensurePrivateDirectory",
    child: "s6-probe",
    load: async () => (await import("./private-boundary.mjs")).ensurePrivateDirectory,
  },
  {
    name: "human-guard-override.secureDirectory",
    child: "human-guard-overrides",
    load: async () => (await import("./human-guard-override.mjs")).humanGuardOverrideInternals?.secureDirectory,
  },
];

const NOT_VIA_ENTRY_POINT = "the helper did not route the agent-pipeline segment through ensureAgentPipelineRoot (Ruling 141 slice S6)";

async function loadS6Helper(helper) {
  const fn = await helper.load();
  assert.equal(typeof fn, "function", `${helper.name} is not reachable as a function`);
  return fn;
}

/**
 * Runs `call` and returns what it threw (or null) together with every process
 * warning delivered while it ran. `process.emitWarning` delivers on nextTick, so
 * one setImmediate turn flushes it before the listener is removed.
 */
async function callCapturingWarnings(call) {
  const warnings = [];
  const listener = (warning) => warnings.push({ code: warning?.code, message: String(warning?.message ?? "") });
  process.on("warning", listener);
  let error = null;
  try {
    try {
      call();
    } catch (caught) {
      error = caught;
    }
    await new Promise((done) => setImmediate(done));
  } finally {
    process.off("warning", listener);
  }
  return { error, warnings };
}

for (const helper of S6_HELPERS) {
  test(`pin (f) ${helper.name}: leaves the agent-pipeline segment private on a fresh repository`, async () => {
    const fn = await loadS6Helper(helper);
    await withRepository(async ({ segment }) => {
      const probe = join(segment, helper.child);
      fn(probe);
      assertCreatorRanThenSegmentPrivate(`pin (f) ${helper.name}`, segment, probe);
    });
  });

  test(`pin (g) ${helper.name}: repairs a pre-existing insecure agent-pipeline segment in place`, async (t) => {
    const fn = await loadS6Helper(helper);
    await withRepository(async ({ segment }) => {
      if (!makeInsecureSegment(segment)) {
        t.skip(`the host cannot build an insecure "${SEGMENT}" premise, so pin (g) would be vacuous here`);
        return;
      }
      const probe = join(segment, helper.child);
      const { error } = await callCapturingWarnings(() => fn(probe));
      assert.equal(error, null, `pin (g) ${helper.name}: the call threw ${error?.code ?? error?.name}: ${error?.message} instead of repairing the segment in place`);
      assert.ok(existsSync(probe), `pin (g) ${helper.name}: the helper did not create its directory below the segment`);
      const { isPrivate, detail } = privacyOf(segment);
      assert.ok(isPrivate, `pin (g) ${helper.name}: the pre-existing insecure "${SEGMENT}" segment is still insecure after the helper ran (${detail}); ${NOT_VIA_ENTRY_POINT}`);
    });
  });

  test(`pin (h) ${helper.name}: reports the in-place repair as exactly one PB-ROOT-REPAIRED warning`, async (t) => {
    const fn = await loadS6Helper(helper);
    await withRepository(async ({ common, segment }) => {
      if (!makeInsecureSegment(segment)) {
        t.skip(`the host cannot build an insecure "${SEGMENT}" premise, so pin (h) would be vacuous here`);
        return;
      }
      const { error, warnings } = await callCapturingWarnings(() => fn(join(segment, helper.child)));
      assert.equal(error, null, `pin (h) ${helper.name}: the call threw ${error?.code ?? error?.name}: ${error?.message} instead of repairing the segment in place`);
      const repaired = warnings.filter((warning) => warning.code === "PB-ROOT-REPAIRED");
      assert.equal(
        repaired.length,
        1,
        `pin (h) ${helper.name}: expected exactly one PB-ROOT-REPAIRED warning, saw ${repaired.length} (codes seen: ${warnings.map((warning) => warning.code ?? "none").join(", ") || "no warning"}); ${NOT_VIA_ENTRY_POINT}`,
      );
      assert.ok(!repaired[0].message.includes(common), `pin (h) ${helper.name}: the warning must name the segment, never a host path`);
    });
  });
}
