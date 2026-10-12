import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { isSanctionedLifecycleCommand } from "./source/lib/guard/command-catalogue.mjs";
import { START_PREFLIGHT_SCRIPT } from "./source/lib/guard/constants.mjs";
import { devPlanShellRefusalHit } from "./source/lib/guard/devplan-shell-lane.mjs";

const draftRoot = resolve("scratch/alfred-postinstall-whole-items-20261011/literal-bootstrap-item-delivery/consumer");
const preflight = (args = []) => `node "${START_PREFLIGHT_SCRIPT}"${args.length === 0 ? "" : ` ${args.join(" ")}`}`;
const forceDraftBlock = () => ({
  verdict: "block",
  reason: "controlled draft fixture",
  feature: "draft-fixture",
  planPath: null,
  lifecycleStatus: "draft",
});

test("exact role-routed preflight stays admitted in draft while malformed and expanded commands remain gated", () => {
  for (const role of ["elephant", "goldfish", "critic"]) {
    const command = preflight(["--role", role]);
    assert.equal(isSanctionedLifecycleCommand(command, draftRoot), true, role);
    assert.equal(devPlanShellRefusalHit(command, draftRoot, {
      devPlanGateVerdictFn: forceDraftBlock,
    }), null, `${role} preflight must not be classified as a draft write`);
  }

  for (const args of [["--role", "unknown"], ["--role", "goldfish", "--unexpected"], ["--unexpected"]]) {
    const command = preflight(args);
    assert.equal(isSanctionedLifecycleCommand(command, draftRoot), false, JSON.stringify(args));
    assert.equal(devPlanShellRefusalHit(command, draftRoot, {
      devPlanGateVerdictFn: forceDraftBlock,
    })?.verdict, "block", `malformed preflight must remain subject to the draft gate: ${JSON.stringify(args)}`);
  }
});
