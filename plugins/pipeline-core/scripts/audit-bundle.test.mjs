// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { main } from "./audit-bundle.mjs";
const pack = { schema: "pipeline.organization-policy-pack.v1" };
test("passes closed plan inputs and every requested pack to the bundle planner", async () => { let captured; const result = await main(["plan", "--repo", "/repo", "--manifest", "specs/x/lifecycle.json", "--bundle-id", "evidence-1", "--core-version", "0.4.7", "--pack-file", "one.json", "--pack-file", "two.json"], { readJson: async () => pack, plan: (input) => { captured = input; return { status: "preview" }; } }); assert.equal(result.status, "preview"); assert.equal(captured.packs.length, 2); });
test("routes build and verify through their explicit local services", async () => { const built = await main(["build", "--repo", "/repo", "--plan-file", "plan.json", "--output", "bundle"], { readJson: async () => ({ plan: true }), build: (input) => ({ status: "built", output: input.outputPath }) }); const verified = await main(["verify", "--bundle", "bundle"], { verify: () => ({ status: "verified" }) }); assert.equal(built.status, "built"); assert.equal(verified.status, "verified"); });
