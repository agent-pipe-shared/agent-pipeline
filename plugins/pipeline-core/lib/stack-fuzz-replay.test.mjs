// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { minimizeSyntheticFuzzCrash, replaySyntheticFuzzCrash } from "./stack-fuzz-replay.mjs";
import { createDynamicTargetAuthorization } from "./stack-dynamic-boundary.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const target = { id: "fuzz-target", environment: "test", bindingSha256: "c".repeat(64) };
const scope = { id: "fuzz-scope", paths: ["fixtures"] };
const receipt = createDynamicTargetAuthorization({ candidate, target, scope, execution: { network: "offline", credential: "none", timeoutMs: 1000 } }).receipt;
const authorization = { candidate, target, scope, receipt };
const created = minimizeSyntheticFuzzCrash({ candidate, input: "prefix CRASH marker suffix", requiredTokens: ["CRASH", "marker"] });
assert.equal(created.ok, true);
let pass = 0;
function check(name, fn) { fn(); pass++; console.log(`PASS ${name}`); }

check("minimization preserves a deterministic replay input", () => {
  assert.equal(created.reproducer.minimized, "CRASHmarker");
  assert.deepEqual(replaySyntheticFuzzCrash({ candidate, reproducer: created.reproducer, oracle: { requiredTokens: ["CRASH", "marker"], fixed: false }, authorization }), { ok: true, reproduces: true, code: "FUZZ-REPLAY-REPRODUCED" });
});
check("the same minimized reproducer replays clean after a synthetic fix", () => {
  assert.deepEqual(replaySyntheticFuzzCrash({ candidate, reproducer: created.reproducer, oracle: { requiredTokens: ["CRASH", "marker"], fixed: true }, authorization }), { ok: true, reproduces: false, code: "FUZZ-REPLAY-CLEAN" });
});
check("candidate and oracle drift fail closed", () => {
  assert.equal(replaySyntheticFuzzCrash({ candidate: { ...candidate, tree: "c".repeat(40) }, reproducer: created.reproducer, oracle: { requiredTokens: ["CRASH", "marker"], fixed: false }, authorization }).code, "FUZZ-REPLAY-CANDIDATE-MISMATCH");
  assert.equal(replaySyntheticFuzzCrash({ candidate, reproducer: created.reproducer, oracle: { requiredTokens: ["CRASH", "other"], fixed: false }, authorization }).code, "FUZZ-REPLAY-ORACLE-MISMATCH");
});
check("missing crash fragments and receipt tampering are rejected", () => {
  assert.equal(minimizeSyntheticFuzzCrash({ candidate, input: "safe", requiredTokens: ["CRASH"] }).code, "FUZZ-REPRODUCER-INVALID");
  assert.equal(replaySyntheticFuzzCrash({ candidate, reproducer: { ...created.reproducer, minimized: "other" }, oracle: { requiredTokens: ["CRASH", "marker"], fixed: false }, authorization }).code, "FUZZ-REPLAY-TAMPERED");
  assert.equal(replaySyntheticFuzzCrash({ candidate, reproducer: created.reproducer, oracle: { requiredTokens: ["CRASH", "marker"], fixed: true }, authorization: null }).code, "FUZZ-REPLAY-VERIFICATION-REQUIRED");
});

console.log(`${pass} stack fuzz replay checks passed`);
