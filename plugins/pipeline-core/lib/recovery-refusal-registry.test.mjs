import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  RECOVERY_REFUSAL_REGISTRY,
  lookupRecoveryDisposition,
  findUnregisteredCodes,
} from "./recovery-refusal-registry.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DISPOSITIONS = new Set(["refuse", "unavailable", "handoff"]);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

test("RV-7: the registry is a frozen code -> { rv, disposition, prerequisite } object", () => {
  assert.ok(Object.isFrozen(RECOVERY_REFUSAL_REGISTRY));
  const entries = Object.entries(RECOVERY_REFUSAL_REGISTRY);
  assert.ok(entries.length > 0);
  for (const [code, entry] of entries) {
    assert.match(entry.rv, /^RV-(?:[1-9]|1[01])$/, `${code}: rv`);
    assert.ok(DISPOSITIONS.has(entry.disposition), `${code}: disposition`);
    if (entry.disposition === "refuse") {
      assert.equal(entry.prerequisite, null, `${code}: refuse has no prerequisite`);
    } else {
      assert.ok(entry.prerequisite && typeof entry.prerequisite === "object", `${code}: prerequisite object`);
      assert.ok(nonEmpty(entry.prerequisite.kind), `${code}: prerequisite.kind`);
      assert.ok(nonEmpty(entry.prerequisite.action), `${code}: prerequisite.action`);
    }
  }
});

test("RV-7: lookupRecoveryDisposition returns the registered entry for a known code", () => {
  const [code, entry] = Object.entries(RECOVERY_REFUSAL_REGISTRY)[0];
  assert.deepEqual(lookupRecoveryDisposition(code), entry);
});

test("RV-7: an unknown code yields an attended diagnostic handoff and never throws", () => {
  for (const input of ["NOT-A-REGISTERED-CODE", "", undefined, null, 42]) {
    let result;
    assert.doesNotThrow(() => { result = lookupRecoveryDisposition(input); });
    assert.equal(result.rv, null);
    assert.equal(result.disposition, "handoff");
    assert.equal(result.prerequisite.kind, "attended-diagnostic");
    assert.ok(nonEmpty(result.prerequisite.action));
  }
});

test("RV-7: every WT-ORPHAN-* code produced by worktree-lifecycle.mjs is registered", () => {
  const source = readFileSync(path.join(here, "worktree-lifecycle.mjs"), "utf8");
  const pattern = /["'](WT-ORPHAN-[A-Z0-9-]+)["']/g;
  const found = [...source.matchAll(pattern)].map((m) => m[1]);
  assert.ok(found.length > 0, "producer must contain at least one WT-ORPHAN code");
  assert.deepEqual(findUnregisteredCodes(source, /["'](WT-ORPHAN-[A-Z0-9-]+)["']/g), []);
  for (const code of found) {
    assert.ok(Object.hasOwn(RECOVERY_REFUSAL_REGISTRY, code), `unregistered producer code ${code}`);
  }
});

test("RV-7: negative control - findUnregisteredCodes reports a synthetic unregistered code", () => {
  const synthetic = 'fail("WT-ORPHAN-NOT-REGISTERED-X", "synthetic");';
  const result = findUnregisteredCodes(synthetic, /["'](WT-ORPHAN-[A-Z0-9-]+)["']/g);
  assert.deepEqual([...result], ["WT-ORPHAN-NOT-REGISTERED-X"]);
});

test("RV-7: every registered ATR-UNAVAILABLE-* code has disposition unavailable", () => {
  for (const [code, entry] of Object.entries(RECOVERY_REFUSAL_REGISTRY)) {
    if (code.startsWith("ATR-UNAVAILABLE-")) {
      assert.equal(entry.disposition, "unavailable", code);
    }
  }
});

// RV-S4-T2 (RV-F4, RV-F5 of specs/sprint-alfred-epic/evidence/critic-2026-10-07/rv-s1s4-full.md;
// dispatcher disposition 2026-10-08). Test-only; the registry does not satisfy these yet.
test("RV-S4-T2: every literal LOC- code produced by legacy-owner-custody.mjs is registered", () => {
  const source = readFileSync(path.join(here, "legacy-owner-custody.mjs"), "utf8");
  const pattern = /["'](LOC-[A-Z0-9-]+)["']/g;
  const found = [...new Set([...source.matchAll(pattern)].map((m) => m[1]))];
  // Scan control: the producer carries the full RV-2/RV-3/RV-4 set, so an empty or
  // truncated match cannot pass this case vacuously.
  assert.ok(found.length >= 11, `producer scan found only ${found.length} LOC- codes`);
  assert.ok(found.includes("LOC-TARGET-UNSAFE"), "producer scan must see LOC-TARGET-UNSAFE");
  assert.deepEqual([...findUnregisteredCodes(source, /["'](LOC-[A-Z0-9-]+)["']/g)], []);
  for (const code of found) {
    assert.ok(Object.hasOwn(RECOVERY_REFUSAL_REGISTRY, code), `unregistered producer code ${code}`);
  }
});

test("RV-S4-T2: the codes rulings 25 and 26 introduce are registered with a valid entry", () => {
  for (const code of ["LOC-PACKAGE-INVALID", "LOC-PROOF-EXPIRED", "LOC-RECEIPT-OVERSIZE"]) {
    assert.ok(Object.hasOwn(RECOVERY_REFUSAL_REGISTRY, code), `unregistered ruling code ${code}`);
    const entry = lookupRecoveryDisposition(code);
    assert.ok(DISPOSITIONS.has(entry.disposition), `${code}: disposition`);
    assert.match(entry.rv, /^RV-(?:[1-9]|1[01])$/, `${code}: rv`);
  }
});

test("RV-S4-T2: WT-ORPHAN-ARCHIVE-READBACK is an attended handoff with a named prerequisite, not a bare refuse", () => {
  // It is raised after a write, and a retry then fails WT-ORPHAN-ARCHIVE-TARGET-EXISTS.
  assert.ok(Object.hasOwn(RECOVERY_REFUSAL_REGISTRY, "WT-ORPHAN-ARCHIVE-READBACK"));
  const entry = lookupRecoveryDisposition("WT-ORPHAN-ARCHIVE-READBACK");
  assert.equal(entry.disposition, "handoff");
  assert.ok(entry.prerequisite && typeof entry.prerequisite === "object", "a handoff needs a prerequisite object");
  assert.ok(nonEmpty(entry.prerequisite.kind), "prerequisite.kind");
  assert.ok(nonEmpty(entry.prerequisite.action), "prerequisite.action");
});

// RV-S5-T2 (RV-D2, RV-D3 of specs/sprint-alfred-epic/evidence/critic-2026-10-07/rv-s5-full.md;
// dispatcher ruling 44). Test-only; the registry does not satisfy these yet.
test("RV-S5-T2: LOC-ARCHIVE-ORPHANED-COPY is registered as an attended handoff with a non-empty prerequisite", () => {
  // It is raised after the archive copy was published, so a bare refuse (or the unknown-code fallback) would hide the orphan.
  assert.ok(Object.hasOwn(RECOVERY_REFUSAL_REGISTRY, "LOC-ARCHIVE-ORPHANED-COPY"), "unregistered code LOC-ARCHIVE-ORPHANED-COPY");
  const entry = lookupRecoveryDisposition("LOC-ARCHIVE-ORPHANED-COPY");
  assert.equal(entry.disposition, "handoff");
  assert.ok(entry.prerequisite && typeof entry.prerequisite === "object", "a handoff needs a prerequisite object");
  assert.ok(nonEmpty(entry.prerequisite.kind), "prerequisite.kind");
  assert.ok(nonEmpty(entry.prerequisite.action), "prerequisite.action");
});

// The disposition matrix admits archive (never preserve) for a conflicting receipt and
// preserve (never archive) for a matching one; the registered recovery text must say the same.
const recoveryText = (code) => {
  assert.ok(Object.hasOwn(RECOVERY_REFUSAL_REGISTRY, code), `unregistered code ${code}`);
  const text = lookupRecoveryDisposition(code).prerequisite?.action;
  assert.ok(nonEmpty(text), `${code}: the recovery text must exist`);
  return text;
};

for (const code of ["LOC-STATUS-MISMATCH", "LOC-SCHEMA-MISMATCH", "LOC-DIGEST-MISMATCH", "LOC-COMPARE-FLAG-FALSE"]) {
  test(`RV-S5-T2: the recovery text of ${code} offers archive and does not offer preserve (preserve is forbidden for a conflict)`, () => {
    const text = recoveryText(code);
    assert.doesNotMatch(text, /preserve/i, `${code}: ${text}`);
    assert.match(text, /archive/i, `${code}: the only admitted disposition must still be named: ${text}`);
  });
}

test("RV-S5-T2: the recovery text of LOC-REPLAY-PRECONDITION offers preserve and does not offer archive (archive is forbidden for a matching receipt)", () => {
  const text = recoveryText("LOC-REPLAY-PRECONDITION");
  assert.doesNotMatch(text, /archive/i, `LOC-REPLAY-PRECONDITION: ${text}`);
  assert.match(text, /preserve/i, `LOC-REPLAY-PRECONDITION: the only admitted disposition must still be named: ${text}`);
});
