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
