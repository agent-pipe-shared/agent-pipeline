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
