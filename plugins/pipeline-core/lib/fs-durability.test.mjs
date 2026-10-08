// SPDX-License-Identifier: SUL-1.0
// FSYNC-T4 (ruling 27): pin every branch of fsyncDirectoryDurable and its return
// value. The helper returns "confirmed" after a successful directory fsync and
// "unsupported" when it tolerates a win32 code; it still throws otherwise. All
// cases go through the injectable { fs, platform } parameters with a fake fs
// that records its calls, so no real directory is opened and the result does not
// depend on the host platform.
import assert from "node:assert/strict";
import test from "node:test";

import { fsyncDirectoryDurable } from "./fs-durability.mjs";

const DIRECTORY = "/virtual/fsync-target";
const FD = 42;
const WIN32_TOLERATED_CODES = ["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"];

function codedError(code) {
  const error = new Error(`simulated ${code}`);
  error.code = code;
  return error;
}

/** Fake fs recording every call in order; openSync/fsyncSync can be told to throw. */
function fakeFs({ openError = null, fsyncError = null } = {}) {
  const calls = [];
  return {
    calls,
    names: () => calls.map((call) => call.name),
    openSync(path, flags) {
      calls.push({ name: "openSync", path, flags });
      if (openError !== null) throw openError;
      return FD;
    },
    fsyncSync(fd) {
      calls.push({ name: "fsyncSync", fd });
      if (fsyncError !== null) throw fsyncError;
    },
    closeSync(fd) {
      calls.push({ name: "closeSync", fd });
    },
  };
}

function sameError(expected) {
  return (error) => error === expected;
}

test("FSD-1 linux: successful open and fsync returns confirmed and closes the descriptor", () => {
  const fs = fakeFs();
  const result = fsyncDirectoryDurable(DIRECTORY, { fs, platform: "linux" });
  assert.deepEqual(fs.names(), ["openSync", "fsyncSync", "closeSync"]);
  assert.equal(fs.calls[0].path, DIRECTORY);
  assert.equal(fs.calls[1].fd, FD);
  assert.equal(fs.calls[2].fd, FD);
  assert.equal(result, "confirmed");
});

test("FSD-2 win32: successful open and fsync returns confirmed and closes the descriptor", () => {
  const fs = fakeFs();
  const result = fsyncDirectoryDurable(DIRECTORY, { fs, platform: "win32" });
  assert.deepEqual(fs.names(), ["openSync", "fsyncSync", "closeSync"]);
  assert.equal(fs.calls[2].fd, FD);
  assert.equal(result, "confirmed");
});

for (const code of WIN32_TOLERATED_CODES) {
  test(`FSD-3 win32: openSync ${code} returns unsupported, nothing to close`, () => {
    const fs = fakeFs({ openError: codedError(code) });
    const result = fsyncDirectoryDurable(DIRECTORY, { fs, platform: "win32" });
    assert.deepEqual(fs.names(), ["openSync"]);
    assert.equal(result, "unsupported");
  });
}

test("FSD-4 win32: fsyncSync EPERM returns unsupported and still closes the descriptor", () => {
  const fs = fakeFs({ fsyncError: codedError("EPERM") });
  const result = fsyncDirectoryDurable(DIRECTORY, { fs, platform: "win32" });
  assert.deepEqual(fs.names(), ["openSync", "fsyncSync", "closeSync"]);
  assert.equal(fs.calls[2].fd, FD);
  assert.equal(result, "unsupported");
});

test("FSD-5 linux: openSync EPERM is not tolerated and rethrows the same error", () => {
  const failure = codedError("EPERM");
  const fs = fakeFs({ openError: failure });
  assert.throws(() => fsyncDirectoryDurable(DIRECTORY, { fs, platform: "linux" }), sameError(failure));
  assert.deepEqual(fs.names(), ["openSync"]);
});

test("FSD-6 linux: fsyncSync EINVAL is not tolerated, rethrows the same error and still closes", () => {
  const failure = codedError("EINVAL");
  const fs = fakeFs({ fsyncError: failure });
  assert.throws(() => fsyncDirectoryDurable(DIRECTORY, { fs, platform: "linux" }), sameError(failure));
  assert.deepEqual(fs.names(), ["openSync", "fsyncSync", "closeSync"]);
  assert.equal(fs.calls[2].fd, FD);
});

test("FSD-7 win32: an out-of-set code (EIO) on openSync rethrows the same error", () => {
  const failure = codedError("EIO");
  const fs = fakeFs({ openError: failure });
  assert.throws(() => fsyncDirectoryDurable(DIRECTORY, { fs, platform: "win32" }), sameError(failure));
  assert.deepEqual(fs.names(), ["openSync"]);
});

test("FSD-8 win32: an out-of-set code (EIO) on fsyncSync rethrows the same error and still closes", () => {
  const failure = codedError("EIO");
  const fs = fakeFs({ fsyncError: failure });
  assert.throws(() => fsyncDirectoryDurable(DIRECTORY, { fs, platform: "win32" }), sameError(failure));
  assert.deepEqual(fs.names(), ["openSync", "fsyncSync", "closeSync"]);
  assert.equal(fs.calls[2].fd, FD);
});
