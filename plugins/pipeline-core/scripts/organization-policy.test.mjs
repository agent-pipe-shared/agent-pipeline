// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { main } from "./organization-policy.mjs";
test("inspects all explicit packs without a repository mutation path", async () => { let received; const output = await main(["inspect", "--core-version", "0.4.7", "--pack-file", "one.json", "--pack-file", "two.json"], { readJson: async (path) => ({ path }), resolve: (input) => { received = input; return { schema: "effective" }; } }); assert.equal(output.schema, "effective"); assert.deepEqual(received.packs, [{ path: "one.json" }, { path: "two.json" }]); });
test("plans only a named activation and rejects incomplete command forms", async () => { const output = await main(["plan", "--repo", "/repo", "--core-version", "0.4.7", "--pack-file", "one.json", "--activation-id", "activate-policy"], { readJson: async () => ({}), plan: (input) => ({ status: "preview", id: input.activationId }) }); assert.equal(output.id, "activate-policy"); await assert.rejects(() => main(["plan", "--core-version", "0.4.7", "--pack-file", "one.json"]), (error) => error.code === "OPC-ARGUMENT"); });
