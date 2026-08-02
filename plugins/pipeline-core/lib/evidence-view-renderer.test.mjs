// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";import test from "node:test";import {renderEvidenceView} from "./evidence-view-renderer.mjs";
const model={schema:"pipeline.evidence-view-model.v1",authority:"non-authoritative",status:"tampered",candidate:{commit:"a".repeat(40),tree:"b".repeat(40)},artifacts:[{path:"<unsafe>",state:"tampered",sha256:"c".repeat(64)}]};
test("renders offline CSP-protected accessible static evidence",()=>{const html=renderEvidenceView(model);assert.match(html,/Content-Security-Policy/);assert.match(html,/&lt;unsafe&gt;/);assert.match(html,/non-authoritative/);});
