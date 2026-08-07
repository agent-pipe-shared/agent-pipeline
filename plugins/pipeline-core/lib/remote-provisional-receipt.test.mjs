// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createRemoteProvisionalReceipt, consumeRemoteProvisionalReceipt, provisionalReceiptAllowedForAction } from "./remote-provisional-receipt.mjs";

let tests = 0;
const check = (name, fn) => { fn(); tests += 1; };
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const scopeSha256 = "c".repeat(64); const code = "ABCD-EFGH-JKLM";
const receipt = createRemoteProvisionalReceipt({ candidate, scopeSha256, code, now: "2026-08-02T18:00:00.000Z", expiresAt: "2026-08-02T18:30:00.000Z" });

check("one exact local continuation consumes", () => assert.equal(consumeRemoteProvisionalReceipt({ receipt, candidate, scopeSha256, code, now: "2026-08-02T18:05:00.000Z" }).ok, true));
check("wrong code is rejected", () => assert.equal(consumeRemoteProvisionalReceipt({ receipt, candidate, scopeSha256, code: "ABCD-EFGH-JKLN", now: "2026-08-02T18:05:00.000Z" }).code, "REMOTE-PROVISIONAL-CODE-MISMATCH"));
check("candidate drift is rejected", () => assert.equal(consumeRemoteProvisionalReceipt({ receipt, candidate: { ...candidate, tree: "d".repeat(40) }, scopeSha256, code, now: "2026-08-02T18:05:00.000Z" }).code, "REMOTE-PROVISIONAL-SCOPE-MISMATCH"));
check("expiry is rejected", () => assert.equal(consumeRemoteProvisionalReceipt({ receipt, candidate, scopeSha256, code, now: "2026-08-02T18:30:00.001Z" }).code, "REMOTE-PROVISIONAL-EXPIRED"));
check("final actions never accept a provisional receipt", () => ["push", "deploy", "publication", "release", "override", "merge", "delete"].forEach((kind) => assert.equal(provisionalReceiptAllowedForAction(kind), false)));

console.log(`remote-provisional-receipt: ${tests} tests passed`);
