// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { createHostAdvisorStatus, createHostAdvisorLaunch, validateHostAdvisorStatus } from "./host-advisor-status.mjs";
const h = "a".repeat(64), c = "b".repeat(40);
test("constructs and validates frozen status", () => { const launch = createHostAdvisorLaunch("s", { randomBytes:()=>Buffer.alloc(32, 7) }); const s = createHostAdvisorStatus({ candidate:{commit:c,tree:c}, launch, questionSha256:h, workspaceBeforeSha256:h, workspaceAfterSha256:h, answerSha256:h, outcome:"answered" }); assert.equal(Object.isFrozen(s), true); assert.equal(s.launch.launchId, "07".repeat(32)); assert.doesNotThrow(()=>validateHostAdvisorStatus(s,{commit:c,tree:c},launch,h)); });
test("rejects replay/mismatch and extras", () => { const launch = createHostAdvisorLaunch("s", { randomBytes:()=>Buffer.alloc(32, 8) }); const s = createHostAdvisorStatus({ candidate:{commit:c,tree:c}, launch, questionSha256:h, workspaceBeforeSha256:h, workspaceAfterSha256:h, outcome:"failed" }); assert.throws(()=>validateHostAdvisorStatus(s,{commit:c,tree:c},{sessionId:"other",launchId:s.launch.launchId},h)); assert.throws(()=>createHostAdvisorStatus({ candidate:{commit:c,tree:c}, launch, questionSha256:h, workspaceBeforeSha256:h, workspaceAfterSha256:h, outcome:"failed", advisor:"x" })); });
