// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { main } from "./governance-export.mjs";
test("keeps policy absence explicit and passes only requested source inputs to projection", async () => { const paths = []; const result = await main(["preview", "--event-file", "event.json", "--policy-file", "none"], { readJson: async (path) => { paths.push(path); return { path }; }, project: (input) => ({ status: input.policy === null ? "denied" : "projected" }) }); assert.deepEqual(paths, ["event.json"]); assert.equal(result.status, "denied"); });
test("maps a supplied sanitized projection through a supplied public profile without transport", async () => { const paths = []; const result = await main(["map", "--projection-file", "projection.json", "--profile-file", "profile.json"], { readJson: async (path) => { paths.push(path); return { path }; }, map: (input) => ({ status: "mapped", ...input }) }); assert.deepEqual(paths, ["projection.json", "profile.json"]); assert.equal(result.status, "mapped"); });
test("rejects non-preview command shapes", async () => { await assert.rejects(() => main(["drain"]), (error) => error.code === "GEC-ARGUMENT"); });
