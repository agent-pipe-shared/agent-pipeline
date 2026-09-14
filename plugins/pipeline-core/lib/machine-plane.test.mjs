#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * machine-plane.test.mjs -- SETUP-2b (specs/sprint-nova-epic/plans/
 * nova-setup-bootstrap.md SS2, SS6a). Covers AC-1..AC-8 of the new module: the sole
 * path derivation, the never-throwing three-valued reader, the exact key set (and the
 * zero-overlap enforcement against both planes' foreign fields), and the atomic,
 * validating, no-key-material writer.
 *
 * Every fixture home directory lives under this repository's own gitignored scratch/
 * tree (SCRATCH_ROOT below) and is injected via `homedirFn` -- never the real $HOME,
 * and nothing here is ever written to the real `~/.agent-pipeline/` (briefing field 4).
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MACHINE_PLANE_SCHEMA,
  machinePlaneFilePath,
  readMachinePlane,
  resolveLocalOperatorKeyAnchor,
  validateMachinePlane,
  writeMachinePlane,
} from "./machine-plane.mjs";

const SCRATCH_ROOT = fileURLToPath(new URL("../../../scratch/", import.meta.url));

function homeFixture() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const home = mkdtempSync(join(SCRATCH_ROOT, "machine-plane-home-"));
  const realHome = realpathSync(home);
  return { home, target: join(realHome, ".agent-pipeline", "machine.json") };
}

function validPlane(overrides = {}) {
  return {
    schema: MACHINE_PLANE_SCHEMA,
    poKeyDirectory: null,
    pushApprovalDefault: "chat",
    routing: null,
    language: null,
    session: null,
    usage: null,
    updatedAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

test("MACHPLANE-1: the schema constant is the exact verbatim value", () => {
  assert.equal(MACHINE_PLANE_SCHEMA, "pipeline.machine-plane.v1");
});

test("MACHPLANE-1: machinePlaneFilePath derives <homedir>/.agent-pipeline/machine.json from an injected homedirFn only", () => {
  const { home, target } = homeFixture();
  try {
    assert.equal(machinePlaneFilePath({ homedirFn: () => home }), target);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("MACHPLANE-1: an absent, empty, relative, throwing, or unresolvable home directory fails closed to null rather than guessing", () => {
  const cases = [
    { label: "undefined", homedirFn: () => undefined },
    { label: "empty string", homedirFn: () => "" },
    { label: "relative path", homedirFn: () => "relative/home" },
    { label: "throws", homedirFn: () => { throw new Error("no home"); } },
    { label: "does not exist on disk", homedirFn: () => join(SCRATCH_ROOT, "machine-plane-home-does-not-exist") },
  ];
  for (const { label, homedirFn } of cases) {
    assert.equal(machinePlaneFilePath({ homedirFn }), null, label);
    assert.deepEqual(readMachinePlane({ homedirFn }), { status: "absent", plane: null }, label);
  }
});

/* -------------------------------------------------------------------- *
 * AC-1: the reader never throws and is three-valued.
 * -------------------------------------------------------------------- */

test("AC-1: no file at all is 'absent', not an error", () => {
  const { home } = homeFixture();
  try {
    assert.deepEqual(readMachinePlane({ homedirFn: () => home }), { status: "absent", plane: null });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-1: a file that cannot be read as text (a directory at the leaf) is 'invalid'/MP-UNREADABLE", () => {
  const { home, target } = homeFixture();
  try {
    mkdirSync(target, { recursive: true }); // machine.json itself is a directory, not a file
    const result = readMachinePlane({ homedirFn: () => home });
    assert.equal(result.status, "invalid");
    assert.equal(result.code, "MP-UNREADABLE");
    assert.equal(result.plane, null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-1: malformed JSON is 'invalid'/MP-MALFORMED", () => {
  const { home, target } = homeFixture();
  try {
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, "{ not json");
    const result = readMachinePlane({ homedirFn: () => home });
    assert.deepEqual(result, { status: "invalid", plane: null, code: "MP-MALFORMED" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-1: well-formed JSON that fails schema validation is 'invalid' with the validator's own code, never a partial value", () => {
  const { home, target } = homeFixture();
  try {
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, `${JSON.stringify({ schema: MACHINE_PLANE_SCHEMA })}\n`); // missing every other key
    const result = readMachinePlane({ homedirFn: () => home });
    assert.equal(result.status, "invalid");
    assert.equal(result.plane, null);
    assert.equal(result.code, "MP-MISSING-KEY");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-1: a well-formed, schema-valid plane is 'valid' and returns the plane exactly", () => {
  const { home, target } = homeFixture();
  const plane = validPlane({ poKeyDirectory: home });
  try {
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, `${JSON.stringify(plane, null, 2)}\n`);
    assert.deepEqual(readMachinePlane({ homedirFn: () => home }), { status: "valid", plane });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- *
 * AC-2: the key set is exact.
 * -------------------------------------------------------------------- */

test("AC-2: an additional, otherwise-harmless key makes the plane invalid, naming that key", () => {
  const plane = { ...validPlane(), extraField: "not permitted" };
  const checked = validateMachinePlane(plane);
  assert.deepEqual(checked, { ok: false, code: "MP-UNKNOWN-KEY", detail: "extraField" });
});

test("AC-2: any single missing key makes the plane invalid, naming that key", () => {
  for (const key of Object.keys(validPlane())) {
    const plane = validPlane();
    delete plane[key];
    const checked = validateMachinePlane(plane);
    assert.deepEqual(checked, { ok: false, code: "MP-MISSING-KEY", detail: key }, key);
  }
});

test("AC-2: a non-object value (array, string, null) is invalid", () => {
  for (const value of [null, "not-an-object", [], 42]) {
    assert.deepEqual(validateMachinePlane(value), { ok: false, code: "MP-NOT-OBJECT" });
  }
});

/* -------------------------------------------------------------------- *
 * AC-3: pushApprovalDefault is one of exactly two literals.
 * -------------------------------------------------------------------- */

test("AC-3: pushApprovalDefault accepts only the verbatim literals 'signature' and 'chat'", () => {
  assert.equal(validateMachinePlane(validPlane({ pushApprovalDefault: "signature" })).ok, true);
  assert.equal(validateMachinePlane(validPlane({ pushApprovalDefault: "chat" })).ok, true);
  for (const bad of ["Signature", "CHAT", "sig", "", null, undefined, 1, "signature "]) {
    const checked = validateMachinePlane(validPlane({ pushApprovalDefault: bad }));
    assert.deepEqual(checked, { ok: false, code: "MP-PUSH-APPROVAL-DEFAULT", detail: "pushApprovalDefault" }, JSON.stringify(bad));
  }
});

/* -------------------------------------------------------------------- *
 * AC-4: poKeyDirectory is an absolute path or null.
 * -------------------------------------------------------------------- */

test("AC-4: poKeyDirectory accepts null and an absolute path that does not yet exist", () => {
  assert.equal(validateMachinePlane(validPlane({ poKeyDirectory: null })).ok, true);
  assert.equal(validateMachinePlane(validPlane({ poKeyDirectory: "/does/not/exist/yet" })).ok, true);
});

test("AC-4: a relative path, an empty string, and a NUL-carrying string are all invalid", () => {
  for (const bad of ["relative/dir", "", "/has\0nul"]) {
    const checked = validateMachinePlane(validPlane({ poKeyDirectory: bad }));
    assert.deepEqual(checked, { ok: false, code: "MP-KEY-DIRECTORY", detail: "poKeyDirectory" }, JSON.stringify(bad));
  }
});

test("AC-4: an existing path that is a directory is accepted; an existing path that is a file is invalid", () => {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_ROOT, "machine-plane-podir-"));
  const filePath = join(dir, "not-a-directory.txt");
  writeFileSync(filePath, "x");
  try {
    assert.equal(validateMachinePlane(validPlane({ poKeyDirectory: dir })).ok, true);
    assert.deepEqual(
      validateMachinePlane(validPlane({ poKeyDirectory: filePath })),
      { ok: false, code: "MP-KEY-DIRECTORY", detail: "poKeyDirectory" },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- *
 * AC-5: the repository plane cannot be stored here.
 * -------------------------------------------------------------------- */

test("AC-5: every repository-plane field is rejected if present, naming that exact key", () => {
  for (const key of ["gates", "autonomy", "critic_export", "advisor_export", "claude_md_max_lines", "push_approval"]) {
    const plane = { ...validPlane(), [key]: "anything" };
    assert.deepEqual(validateMachinePlane(plane), { ok: false, code: "MP-UNKNOWN-KEY", detail: key }, key);
  }
});

/* -------------------------------------------------------------------- *
 * AC-6: no persisted runner, enforced.
 * -------------------------------------------------------------------- */

test("AC-6: every runner-shaped field is rejected if present, naming that exact key", () => {
  for (const key of ["runner", "runners", "agent_runtime"]) {
    const plane = { ...validPlane(), [key]: "claude" };
    assert.deepEqual(validateMachinePlane(plane), { ok: false, code: "MP-UNKNOWN-KEY", detail: key }, key);
  }
});

/* -------------------------------------------------------------------- *
 * AC-7: the writer is atomic and validating.
 * -------------------------------------------------------------------- */

test("AC-7: the writer refuses a plane that fails its own validation, and nothing is written", () => {
  const { home } = homeFixture();
  try {
    assert.throws(() => writeMachinePlane({ ...validPlane(), extraField: "x" }, { homedirFn: () => home }), /MP-WRITE-REFUSED/);
    assert.deepEqual(readMachinePlane({ homedirFn: () => home }), { status: "absent", plane: null });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-7: the writer creates the containing directory when absent, writes atomically, and the plane reads back exactly", () => {
  const { home, target } = homeFixture();
  const plane = validPlane({ poKeyDirectory: home, updatedAt: new Date().toISOString() });
  try {
    const returned = writeMachinePlane(plane, { homedirFn: () => home });
    assert.deepEqual(returned, plane);
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), plane);
    // No temp file left behind after a successful atomic write.
    assert.throws(() => readFileSync(`${target}.tmp`, "utf8"));
    assert.deepEqual(readMachinePlane({ homedirFn: () => home }), { status: "valid", plane });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-7: the writer refuses outright when the target already exists as a symlink", () => {
  const { home, target } = homeFixture();
  const elsewhere = mkdtempSync(join(SCRATCH_ROOT, "machine-plane-elsewhere-"));
  const decoy = join(elsewhere, "decoy.json");
  writeFileSync(decoy, "{}\n");
  try {
    mkdirSync(join(target, ".."), { recursive: true });
    symlinkSync(decoy, target);
    assert.throws(() => writeMachinePlane(validPlane(), { homedirFn: () => home }), /MP-SYMLINK-REFUSED/);
    assert.equal(readFileSync(decoy, "utf8"), "{}\n", "the symlink target must be untouched");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- *
 * AC-8: no secret ever enters the store (shape check, not a proof).
 * -------------------------------------------------------------------- */

test("AC-8: the writer rejects a plane carrying a PEM block marker or the substring PRIVATE KEY, anywhere nested", () => {
  const { home } = homeFixture();
  try {
    assert.throws(
      () => writeMachinePlane(validPlane({ language: "-----BEGIN PRIVATE KEY-----" }), { homedirFn: () => home }),
      /MP-KEY-MATERIAL-SHAPE/,
    );
    assert.throws(
      () => writeMachinePlane(validPlane({ routing: { note: "contains a PRIVATE KEY reference" } }), { homedirFn: () => home }),
      /MP-KEY-MATERIAL-SHAPE/,
    );
    assert.deepEqual(readMachinePlane({ homedirFn: () => home }), { status: "absent", plane: null });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-8: an ordinary plane with no key-shaped strings writes cleanly", () => {
  const { home } = homeFixture();
  try {
    assert.doesNotThrow(() => writeMachinePlane(validPlane({ language: "en-US" }), { homedirFn: () => home }));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- *
 * resolveLocalOperatorKeyAnchor -- NVA-CF-TOFUFIX. The two-hop lookup
 * (readMachinePlane's poKeyDirectory -> that directory's own
 * trust-policy.json) `critical-action-authorization.mjs`'s trust-on-first-use
 * gate resolves the operator's own machine-local key through. Every fault
 * state collapses to null; only a fully valid two-hop chain returns a value.
 * -------------------------------------------------------------------- */

test("resolveLocalOperatorKeyAnchor: no plane at all resolves to null", () => {
  const { home } = homeFixture();
  try {
    assert.equal(resolveLocalOperatorKeyAnchor({ homedirFn: () => home }), null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("resolveLocalOperatorKeyAnchor: a valid plane with no poKeyDirectory resolves to null", () => {
  const { home, target } = homeFixture();
  try {
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, `${JSON.stringify(validPlane({ poKeyDirectory: null }), null, 2)}\n`);
    assert.equal(resolveLocalOperatorKeyAnchor({ homedirFn: () => home }), null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("resolveLocalOperatorKeyAnchor: a recorded poKeyDirectory whose trust-policy.json does not exist (dead pointer) resolves to null", () => {
  const { home, target } = homeFixture();
  const keyDirectory = mkdtempSync(join(SCRATCH_ROOT, "machine-plane-keydir-"));
  try {
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, `${JSON.stringify(validPlane({ poKeyDirectory: keyDirectory }), null, 2)}\n`);
    assert.equal(resolveLocalOperatorKeyAnchor({ homedirFn: () => home }), null);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(keyDirectory, { recursive: true, force: true });
  }
});

test("resolveLocalOperatorKeyAnchor: a trust-policy.json that does not parse as JSON resolves to null", () => {
  const { home, target } = homeFixture();
  const keyDirectory = mkdtempSync(join(SCRATCH_ROOT, "machine-plane-keydir-"));
  try {
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, `${JSON.stringify(validPlane({ poKeyDirectory: keyDirectory }), null, 2)}\n`);
    writeFileSync(join(keyDirectory, "trust-policy.json"), "{ not json");
    assert.equal(resolveLocalOperatorKeyAnchor({ homedirFn: () => home }), null);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(keyDirectory, { recursive: true, force: true });
  }
});

test("resolveLocalOperatorKeyAnchor: a trust-policy.json missing keyReference or a malformed publicKeySha256 resolves to null", () => {
  const { home, target } = homeFixture();
  const keyDirectory = mkdtempSync(join(SCRATCH_ROOT, "machine-plane-keydir-"));
  try {
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, `${JSON.stringify(validPlane({ poKeyDirectory: keyDirectory }), null, 2)}\n`);
    for (const bad of [
      { publicKeySha256: "a".repeat(64) }, // no keyReference
      { keyReference: "po-key-1", publicKeySha256: "not-a-digest" },
      { keyReference: "", publicKeySha256: "a".repeat(64) },
    ]) {
      writeFileSync(join(keyDirectory, "trust-policy.json"), `${JSON.stringify(bad)}\n`);
      assert.equal(resolveLocalOperatorKeyAnchor({ homedirFn: () => home }), null, JSON.stringify(bad));
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(keyDirectory, { recursive: true, force: true });
  }
});

test("resolveLocalOperatorKeyAnchor: a fully valid two-hop chain resolves the key identity", () => {
  const { home, target } = homeFixture();
  const keyDirectory = mkdtempSync(join(SCRATCH_ROOT, "machine-plane-keydir-"));
  try {
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, `${JSON.stringify(validPlane({ poKeyDirectory: keyDirectory }), null, 2)}\n`);
    const anchor = { keyReference: "po-key-1", publicKeySha256: "b".repeat(64) };
    writeFileSync(join(keyDirectory, "trust-policy.json"), `${JSON.stringify(anchor, null, 2)}\n`);
    assert.deepEqual(resolveLocalOperatorKeyAnchor({ homedirFn: () => home }), anchor);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(keyDirectory, { recursive: true, force: true });
  }
});
