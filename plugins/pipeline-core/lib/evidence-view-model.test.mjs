// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";import test from "node:test";import {buildEvidenceViewModel} from "./evidence-view-model.mjs";
const model=()=>({candidate:{commit:"a".repeat(40),tree:"b".repeat(40)},status:"pass",artifacts:[{path:"specs/result.md",sha256:"c".repeat(64),state:"verified"}]});
test("renders only candidate-bound non-authoritative evidence",()=>assert.equal(buildEvidenceViewModel(model()).authority,"non-authoritative"));test("rejects open or unbound viewer input",()=>{assert.throws(()=>buildEvidenceViewModel({...model(),approval:true}));assert.throws(()=>buildEvidenceViewModel({...model(),candidate:{commit:"bad",tree:"bad"}}));});
