// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { ROUTES, selectHostAdvisorRoute } from "./codex-host-advisor-route.mjs";

test("Codex epic/feature default and approved route directly to host consult", () => {
  for (const profile of ["epic", "feature"]) for (const consent of ["default", "approved"]) {
    assert.equal(selectHostAdvisorRoute({ runner: "codex", profile, consent }), ROUTES.HOST);
  }
});
test("declined and mini are disabled", () => {
  assert.equal(selectHostAdvisorRoute({ runner: "codex", profile: "epic", consent: "declined" }), ROUTES.NO_CONSENT);
  assert.equal(selectHostAdvisorRoute({ runner: "codex", profile: "mini", consent: "default" }), ROUTES.PROFILE);
  assert.equal(selectHostAdvisorRoute({ runner: "codex", profile: "mini", consent: "approved" }), ROUTES.PROFILE);
});
test("malformed and non-Codex input fails closed without platform inspection", () => {
  for (const value of [null, {}, { runner: "claude", profile: "epic", consent: "default" }, { runner: "codex", profile: "x", consent: "default" }, { runner: "codex", profile: "epic", consent: "x" }, { runner: "codex", profile: "epic", consent: "default", platform: "wsl" }]) assert.throws(() => selectHostAdvisorRoute(value));
});
