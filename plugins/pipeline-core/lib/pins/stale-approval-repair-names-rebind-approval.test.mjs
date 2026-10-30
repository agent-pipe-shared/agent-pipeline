// SPDX-License-Identifier: SUL-1.0
// Pin for backlog 2026-10-26-transfer-invalidates-plan-approval (repair text).
//
// After a repository is cloned or transferred to another device, the plan approval still holds but its device-local
// values differ, and the readers answer CVCT-AUTHORITY-STALE / CVCT-PROFILE-STALE. The repair used to say only
// "approve the plan again" and never named `rebind-approval`, the route that re-checks every bound digest and
// takes no new approval. Both repair texts (item-course refusal and configure-verify refusal) must name it, and
// must keep the re-approval route for the case where the approved bytes really changed.
import assert from "node:assert/strict";
import { test } from "node:test";

import { configureVerifyRepair } from "../calibration-verify-commit-transition.mjs";
import { staleApprovalRepair } from "../native-goldfish-host-state.mjs";

for (const code of ["CVCT-AUTHORITY-STALE", "CVCT-PROFILE-STALE"]) {
  test(`SAR01 ${code}: the item-course repair names rebind-approval and keeps re-approval`, () => {
    const text = staleApprovalRepair(code);
    assert.match(text, /rebind-approval/u);
    assert.match(text, /submit-plan/u);
    assert.match(text, /approve it again/u);
  });

  test(`SAR02 ${code}: the configure-verify repair names rebind-approval and keeps re-approval`, () => {
    const text = configureVerifyRepair(code);
    assert.match(text, /rebind-approval/u);
    assert.match(text, /approve/u);
  });
}

test("SAR04 CVCT-FILE: the item-course repair names the State-file mode repair of a transferred clone, not the generic inspect", () => {
  const text = staleApprovalRepair("CVCT-FILE");
  assert.match(text, /chmod 600 \.claude\/pipeline-state\.json/u);
  assert.match(text, /owner-only ACL/u);
  assert.doesNotMatch(text, /rebind-approval|approve it again/u);
});

test("SAR03 other codes do not name rebind-approval", () => {
  assert.doesNotMatch(staleApprovalRepair("CVCT-APPROVAL-UNAVAILABLE"), /rebind-approval/u);
  assert.doesNotMatch(configureVerifyRepair("CVCT-FILE"), /rebind-approval/u);
});
