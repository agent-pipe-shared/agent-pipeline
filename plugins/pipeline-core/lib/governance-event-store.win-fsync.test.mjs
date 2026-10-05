// SPDX-License-Identifier: SUL-1.0
/**
 * WINFSYNC: `writeAtomic` in the governance event store must not fail on native
 * Windows merely because the host refuses to fsync a DIRECTORY handle
 * (`EPERM: operation not permitted, fsync`). The file fsync and the rename stay
 * hard; only the best-effort parent-directory flush is tolerated, only on
 * win32, and only for the two codes the host actually uses to say "unsupported".
 *
 * Deterministic: the platform and the `open` seam are injected, so every branch
 * runs identically on any host. One end-to-end case uses the real host file
 * system and is the live reproduction of the original failure on native Windows.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, open as realOpen, readdir, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as store from "./governance-event-store.mjs";

const SHA256_HEX = /^[a-f0-9]{64}$/u;

function fsError(code) {
  return Object.assign(new Error(`${code}: simulated host refusal`), { code, syscall: "fsync" });
}

async function withTemporaryDirectory(body) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "ges-win-fsync-")));
  try { return await body(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

/**
 * Wrap the real `open`: regular files are real (so the write, the rename and the
 * temp cleanup are exercised for real); the DIRECTORY open is replaced by a fake
 * handle whose open/sync outcome the case chooses and whose calls are counted.
 */
function instrumentedOpen(directory, { directoryOpenError = null, directorySyncError = null, fileSyncError = null } = {}) {
  const calls = { fileSync: 0, directoryOpen: 0, directorySync: 0, directoryClose: 0 };
  const open = async (target, flags, mode) => {
    if (path.resolve(target) === path.resolve(directory)) {
      calls.directoryOpen += 1;
      if (directoryOpenError) throw directoryOpenError;
      return {
        sync: async () => { calls.directorySync += 1; if (directorySyncError) throw directorySyncError; },
        close: async () => { calls.directoryClose += 1; },
      };
    }
    const handle = await realOpen(target, flags, mode);
    return {
      writeFile: (...args) => handle.writeFile(...args),
      sync: async () => { calls.fileSync += 1; if (fileSyncError) throw fileSyncError; return handle.sync(); },
      close: () => handle.close(),
    };
  };
  return { open, calls };
}

async function leftoverTemporaries(directory) {
  return (await readdir(directory)).filter((name) => name.endsWith(".tmp"));
}

const TOLERATED = ["EPERM", "EISDIR"];

for (const code of TOLERATED) {
  test(`win32: a directory fsync refused with ${code} does not fail the atomic write`, async () => {
    await withTemporaryDirectory(async (directory) => {
      const target = path.join(directory, "record.json");
      const { open, calls } = instrumentedOpen(directory, { directorySyncError: fsError(code) });
      await store.writeAtomic(target, "{\"ok\":true}\n", { platform: "win32", open });
      assert.equal(await readFile(target, "utf8"), "{\"ok\":true}\n", "the rename must still publish the bytes");
      assert.deepEqual(await leftoverTemporaries(directory), []);
      assert.equal(calls.fileSync, 1, "the file fsync stays mandatory");
      assert.equal(calls.directorySync, 1, "the directory flush is still attempted, only its refusal is tolerated");
      assert.equal(calls.directoryClose, 1, "the directory handle is always closed");
    });
  });

  test(`win32: opening the directory refused with ${code} does not fail the atomic write`, async () => {
    await withTemporaryDirectory(async (directory) => {
      const target = path.join(directory, "record.json");
      const { open, calls } = instrumentedOpen(directory, { directoryOpenError: fsError(code) });
      await store.writeAtomic(target, "{\"ok\":true}\n", { platform: "win32", open });
      assert.equal(await readFile(target, "utf8"), "{\"ok\":true}\n");
      assert.deepEqual(await leftoverTemporaries(directory), []);
      assert.equal(calls.fileSync, 1);
      assert.equal(calls.directorySync, 0, "nothing to sync when the open itself was refused");
    });
  });
}

for (const code of ["EIO", "EACCES", "EINVAL", "ENOSPC"]) {
  for (const stage of ["directorySyncError", "directoryOpenError"]) {
    test(`win32: any other directory error (${code} on ${stage === "directorySyncError" ? "fsync" : "open"}) still fails the write`, async () => {
      await withTemporaryDirectory(async (directory) => {
        const target = path.join(directory, "record.json");
        const { open } = instrumentedOpen(directory, { [stage]: fsError(code) });
        await assert.rejects(store.writeAtomic(target, "x\n", { platform: "win32", open }), (error) => error.code === code);
        assert.deepEqual(await leftoverTemporaries(directory), []);
      });
    });
  }
}

for (const platform of ["linux", "darwin", "freebsd"]) {
  for (const code of TOLERATED) {
    test(`${platform}: a directory fsync ${code} is NOT tolerated (behaviour unchanged off win32)`, async () => {
      await withTemporaryDirectory(async (directory) => {
        const target = path.join(directory, "record.json");
        const { open } = instrumentedOpen(directory, { directorySyncError: fsError(code) });
        await assert.rejects(store.writeAtomic(target, "x\n", { platform, open }), (error) => error.code === code);
        assert.deepEqual(await leftoverTemporaries(directory), []);
      });
    });

    test(`${platform}: a directory open ${code} is NOT tolerated (behaviour unchanged off win32)`, async () => {
      await withTemporaryDirectory(async (directory) => {
        const target = path.join(directory, "record.json");
        const { open } = instrumentedOpen(directory, { directoryOpenError: fsError(code) });
        await assert.rejects(store.writeAtomic(target, "x\n", { platform, open }), (error) => error.code === code);
        assert.deepEqual(await leftoverTemporaries(directory), []);
      });
    });
  }

  test(`${platform}: the happy path flushes the file and then the directory exactly once`, async () => {
    await withTemporaryDirectory(async (directory) => {
      const target = path.join(directory, "record.json");
      const { open, calls } = instrumentedOpen(directory);
      await store.writeAtomic(target, "x\n", { platform, open });
      assert.equal(await readFile(target, "utf8"), "x\n");
      assert.deepEqual(calls, { fileSync: 1, directoryOpen: 1, directorySync: 1, directoryClose: 1 });
    });
  });
}

test("win32: the happy path is unchanged -- the directory flush is attempted, not skipped", async () => {
  await withTemporaryDirectory(async (directory) => {
    const target = path.join(directory, "record.json");
    const { open, calls } = instrumentedOpen(directory);
    await store.writeAtomic(target, "x\n", { platform: "win32", open });
    assert.deepEqual(calls, { fileSync: 1, directoryOpen: 1, directorySync: 1, directoryClose: 1 });
  });
});

for (const platform of ["win32", "linux"]) {
  test(`${platform}: a refused FILE fsync is never tolerated and publishes nothing`, async () => {
    await withTemporaryDirectory(async (directory) => {
      const target = path.join(directory, "record.json");
      const { open, calls } = instrumentedOpen(directory, { fileSyncError: fsError("EPERM") });
      await assert.rejects(store.writeAtomic(target, "x\n", { platform, open }), (error) => error.code === "EPERM");
      assert.deepEqual(await readdir(directory), [], "no target and no temporary may survive a failed file flush");
      assert.equal(calls.directoryOpen, 0, "the rename and the directory flush are never reached");
    });
  });
}

test("host file system: first-use repository binding (the real writeAtomic path) succeeds and is stable", async () => {
  await withTemporaryDirectory(async (directory) => {
    const repositoryRoot = path.join(directory, "repo");
    await mkdir(repositoryRoot);
    execFileSync("git", ["init", "-q", repositoryRoot], { stdio: "ignore" });
    const first = await store.readLocalRepositoryFingerprint({ repositoryRoot });
    assert.match(first, SHA256_HEX);
    const second = await store.readLocalRepositoryFingerprint({ repositoryRoot });
    assert.equal(second, first, "the persisted binding is read back, never re-minted");
    const binding = JSON.parse(await readFile(path.join(repositoryRoot, ".git", "agent-pipeline", "governance-events", "repository-binding.json"), "utf8"));
    assert.equal(binding.repositoryFingerprint, first);
  });
});
