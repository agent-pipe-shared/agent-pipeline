// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { main } from "./change-control.mjs";
test("loads explicit gate inputs and preserves an absent external receipt", async () => { const loaded = []; const result = await main(["gate", "--profile-file", "profile.json", "--pipeline-authority-file", "authority.json", "--external-receipt-file", "none", "--now-ms", "1"], { readJson: async (path) => { loaded.push(path); return { path }; }, evaluate: (input) => ({ status: "blocked", external: input.externalReceipt, now: input.nowEpochMs }) }); assert.deepEqual(loaded, ["profile.json", "authority.json"]); assert.deepEqual(result, { status: "blocked", external: null, now: 1 }); });
test("rejects malformed argument layouts before reading files", async () => { await assert.rejects(() => main(["gate", "--profile-file", "one"]), (error) => error.code === "CCC-ARGUMENT"); });
