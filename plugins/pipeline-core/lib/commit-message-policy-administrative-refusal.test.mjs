// SPDX-License-Identifier: SUL-1.0
// K98 (PO decision 2026-10-23, row 7/7): the GIT-03 administrative refusal names the admitted Elephant form.
// Message-only: the code and the verdict are unchanged.
import assert from "node:assert/strict";
import test from "node:test";
import { finishedCommitMessageFindings } from "./commit-message-policy.mjs";

const message = "docs(plans): record a decision\n\nBody.\n\nDispatch: administrative (elephant)\nAI-Assisted: true\n";

test("K98 row 7/7: the administrative refusal names Dispatch: stage-0 (elephant) as the admitted form", () => {
  const finding = finishedCommitMessageFindings(message).findings.find((f) => f.code === "GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED");
  assert.ok(finding, "the administrative binding without evidence is still refused");
  assert.match(finding.detail, /Dispatch: stage-0 \(elephant\)/u);
  assert.match(finding.detail, /AI-Assisted: true/u);
});
