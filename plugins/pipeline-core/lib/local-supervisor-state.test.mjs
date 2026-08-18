// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { admitLocalSupervisorCleanup, localSupervisorStateDigest, planLocalSupervisorFilesystemRepair, repairLocalSupervisorState, resolveLocalSupervisorRoot, validateLocalSupervisorState } from "./local-supervisor-state.mjs";
import { mkdtempTestScratch } from "./test-tmpdir.mjs";
const D = "a".repeat(64), C = "b".repeat(64), owner = { nonce: "owner-1", pid: 42, processStartSha256: "c".repeat(64), bootSha256: "d".repeat(64) };
let passed = 0; const check = (name, fn) => { fn(); passed += 1; console.log(`ok ${passed} - ${name}`); };
const fixture = (fn) => { const root = mkdtempSync(join(homedir(), ".local-supervisor-")); try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); } };
check("no lawful platform root is typed unavailable", () => assert.equal(resolveLocalSupervisorRoot({ platform: "linux", env: {}, repositoryFingerprint: D }).code, "LSS-UNAVAILABLE"));
check("relative platform state bases are unavailable", () => assert.equal(resolveLocalSupervisorRoot({ platform: "linux", env: { XDG_STATE_HOME: "." }, repositoryFingerprint: D }).code, "LSS-UNAVAILABLE"));
check("platform-specific absolute roots stay lawful", () => { const root = resolveLocalSupervisorRoot({ platform: "win32", env: { LOCALAPPDATA: "C:\\PipelineState" }, repositoryFingerprint: D }); assert.equal(root.code, "LSS-ROOT"); assert.match(root.root, /\\Agent-Pipeline\\v1\\/u); });
check("create persists a closed record and repeated repair is a no-op", () => fixture((root) => { const first = repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }); assert.equal(first.disposition, "create"); assert.equal(validateLocalSupervisorState(first.state).ok, true); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "noop"); }));
check("read-only preflight neither creates a root nor mutates ready state", () => fixture((base) => { const root = join(base, "absent"); assert.equal(planLocalSupervisorFilesystemRepair({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "create"); assert.equal(existsSync(root), false); const state = repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).state; assert.equal(planLocalSupervisorFilesystemRepair({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).state.recordSha256, state.recordSha256); }));
check("candidate and subject mismatches require recovery rather than a no-op", () => fixture((root) => { repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: "e".repeat(64), subject: "d1" }).disposition, "recovery-required"); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "other" }).disposition, "recovery-required"); }));
check("a v1 or v2 record is not silently adopted by the v3 contract", () => fixture((root) => { const state = repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).state; for (const schema of ["pipeline.local-supervisor-state.v1", "pipeline.local-supervisor-state.v2"]) { const legacy = { ...state, schema }; legacy.recordSha256 = localSupervisorStateDigest(legacy); writeFileSync(join(root, "state.json"), `${JSON.stringify(legacy)}\n`); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "recovery-required"); } }));
check("only a live structured foreign lock returns busy; stale or unknown locks require recovery", () => fixture((root) => { const lock = join(root, "repair.lock"); writeFileSync(lock, `${JSON.stringify({ schema: "pipeline.local-supervisor-repair-lock.v1", nonce: "foreign", pid: 7, expiresAtMs: 2 })}\n`); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1", nowMs: 1 }).disposition, "busy"); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1", nowMs: 2 }).disposition, "recovery-required"); writeFileSync(lock, "foreign"); assert.equal(planLocalSupervisorFilesystemRepair({ root, repositoryFingerprint: D, candidate: C, subject: "d1", nowMs: 1 }).disposition, "recovery-required"); }));
check("local write denial returns typed unavailable rather than an exception or busy", () => fixture((root) => { chmodSync(root, 0o500); try { const result = repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }); assert.equal(result.code, "LSS-IO"); assert.equal(result.disposition, "unavailable"); } finally { chmodSync(root, 0o700); } }));
check("group or world writable state roots fail closed before create, noop or recovery", () => fixture((root) => { chmodSync(root, 0o770); try { assert.equal(planLocalSupervisorFilesystemRepair({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "unavailable"); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "unavailable"); } finally { chmodSync(root, 0o700); } }));
check("a sticky group/world-writable ancestor is unavailable even when owned by the current user", () => fixture((base) => { const root = join(base, "state"); chmodSync(base, 0o1777); try { assert.equal(planLocalSupervisorFilesystemRepair({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "unavailable"); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "unavailable"); } finally { chmodSync(base, 0o700); } }));
check("hard-linked supervisor records fail closed rather than becoming an owned no-op", () => fixture((root) => { repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }); linkSync(join(root, "state.json"), join(root, "state-copy.json")); assert.equal(planLocalSupervisorFilesystemRepair({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "recovery-required"); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "recovery-required"); }));
check("unknown interrupted journal requires recovery instead of adoption", () => fixture((root) => { writeFileSync(join(root, "prepared.json"), "not-json"); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "recovery-required"); }));
check("a valid interrupted prepare durably records recover-owned through readback", () => fixture((root) => { const staged = repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).state; rmSync(join(root, "state.json")); writeFileSync(join(root, "prepared.json"), `${JSON.stringify(staged)}\n`); const recovered = repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }); assert.equal(recovered.disposition, "recover-owned"); const readback = JSON.parse(readFileSync(join(root, "state.json"), "utf8")); assert.equal(readback.repair.kind, "recover-owned"); assert.equal(readback.recordSha256, recovered.state.recordSha256); }));
check("symlink state root is unavailable", () => fixture((base) => { const target = join(base, "target"); mkdirSync(target); const linked = join(base, "linked"); symlinkSync(target, linked); assert.equal(repairLocalSupervisorState({ root: linked, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "unavailable"); }));
check("a symlinked state ancestor is unavailable before it can redirect repair", () => fixture((base) => { const target = join(base, "target"); mkdirSync(target); const linked = join(base, "agent-pipeline"); symlinkSync(target, linked); assert.equal(repairLocalSupervisorState({ root: join(linked, "v1", D), repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "unavailable"); assert.equal(existsSync(join(target, "v1", D)), false); }));
check("preflight rejects a symlinked ancestor even when the final root is absent", () => fixture((base) => { const target = join(base, "target"); mkdirSync(target); const linked = join(base, "agent-pipeline"); symlinkSync(target, linked); assert.equal(planLocalSupervisorFilesystemRepair({ root: join(linked, "v1", D), repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "unavailable"); assert.equal(existsSync(join(target, "v1", D)), false); }));
check("a non-regular state root is unavailable", () => fixture((base) => { const root = join(base, "state-file"); writeFileSync(root, "not-a-directory"); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "unavailable"); }));
check("state, journal and lock symlinks are rejected without following them", () => fixture((root) => { const target = join(root, "target"); writeFileSync(target, "{}\n"); for (const name of ["state.json", "prepared.json", "repair.lock"]) { symlinkSync(target, join(root, name)); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "recovery-required"); rmSync(join(root, name)); } }));
check("oversized state, journal and lock files are rejected before parsing", () => fixture((root) => { for (const name of ["state.json", "prepared.json", "repair.lock"]) { writeFileSync(join(root, name), "x".repeat(65_537)); assert.equal(repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).disposition, "recovery-required"); rmSync(join(root, name)); } }));
check("cleanup requires a manifest member and an unexpired complete owner lease", () => fixture((root) => { const state = repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" }).state; const live = { ...state, status: "recovery-required", owner, lease: { heartbeatMs: 1, expiresAtMs: 2, leaseSha256: "e".repeat(64) } }; live.recordSha256 = localSupervisorStateDigest(live); const admitted = { record: live, owner, leaseSha256: "e".repeat(64), manifest: [live.recordSha256], nowMs: 1 }; assert.equal(admitLocalSupervisorCleanup(admitted).ok, true); assert.equal(admitLocalSupervisorCleanup({ ...admitted, manifest: [] }).ok, false); assert.equal(admitLocalSupervisorCleanup({ ...admitted, nowMs: 2 }).ok, false); assert.equal(admitLocalSupervisorCleanup({ ...admitted, owner: { ...owner, pid: 43 } }).ok, false); }));

// Windows: Node synthesizes `.mode` on native Windows from the read-only
// attribute alone, so the bare `(mode & 0o022)`/`uid` comparisons in
// trustedAncestor/ownedStateDirectory/ownedStateFile were meaningless there
// and failed closed unconditionally (backlog/items/2026-08-18-windows-posix-
// mode-bit-checks-are-meaningless-on-ntfs.md). These checks inject
// `platform: "win32"` plus a stubbed DACL assessor to prove the win32 branch
// decides the outcome, not the bare mode/uid bits. `scratchFixture` uses this
// repo's own scratch/test-tmp convention rather than a host-temp path.
const scratchFixture = (fn) => { const root = mkdtempTestScratch("local-supervisor-win32-"); try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); } };

check("win32: a POSIX-insecure state root is admitted via the injected DACL assurance instead of failing closed", () => scratchFixture((root) => {
  chmodSync(root, 0o755); // would fail the old bare `(mode & 0o022) === 0` comparison unconditionally
  try {
    const result = planLocalSupervisorFilesystemRepair({
      root, repositoryFingerprint: D, candidate: C, subject: "d1",
      platform: "win32", assessWindowsPrivate: () => ({ status: "secure" }),
    });
    assert.equal(result.disposition, "create");
  } finally {
    chmodSync(root, 0o700);
  }
}));

check("win32: an insecure DACL assessment on the state root still fails closed", () => scratchFixture((root) => {
  const result = planLocalSupervisorFilesystemRepair({
    root, repositoryFingerprint: D, candidate: C, subject: "d1",
    platform: "win32", assessWindowsPrivate: () => ({ status: "insecure" }),
  });
  assert.equal(result.disposition, "unavailable");
}));

check("win32: an insecure DACL assessment on the state file still fails closed even though its directory is secure", () => scratchFixture((root) => {
  const created = repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" });
  assert.equal(created.disposition, "create");
  const statePath = join(root, "state.json");
  const result = repairLocalSupervisorState({
    root, repositoryFingerprint: D, candidate: C, subject: "d1",
    platform: "win32", assessWindowsPrivate: (path) => ({ status: path === statePath ? "insecure" : "secure" }),
  });
  assert.equal(result.disposition, "recovery-required");
}));

check("win32: a secure directory and state file replay as a genuine no-op, not merely skipped", () => scratchFixture((root) => {
  const created = repairLocalSupervisorState({ root, repositoryFingerprint: D, candidate: C, subject: "d1" });
  assert.equal(created.disposition, "create");
  const result = repairLocalSupervisorState({
    root, repositoryFingerprint: D, candidate: C, subject: "d1",
    platform: "win32", assessWindowsPrivate: () => ({ status: "secure" }),
  });
  assert.equal(result.disposition, "noop");
  assert.equal(result.state.recordSha256, created.state.recordSha256);
}));

console.log(`1..${passed}`);
