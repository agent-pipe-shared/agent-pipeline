#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { evaluateWindowsPrivateState } from "./windows-private-state.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS WPS${String(passed).padStart(2, "0")} ${name}\n`); }
const secure = () => ({ currentOwner: "DESKTOP\\agent", owner: "DESKTOP\\agent", reparsePoint: false, principals: ["DESKTOP\\agent"] });
check("accepts only the concrete owner with no reparse point", () => assert.equal(evaluateWindowsPrivateState(secure()).status, "secure"));
check("rejects SYSTEM and Administrators as implicit exceptions", () => { for (const principal of ["SYSTEM", "BUILTIN\\Administrators", "Everyone", "DESKTOP\\other"]) { const value = secure(); value.principals.push(principal); assert.equal(evaluateWindowsPrivateState(value).status, "insecure"); } });
check("rejects owner drift and reparse points", () => { const owner = secure(); owner.owner = "SYSTEM"; assert.equal(evaluateWindowsPrivateState(owner).status, "insecure"); const link = secure(); link.reparsePoint = true; assert.equal(evaluateWindowsPrivateState(link).status, "insecure"); });
check("keeps malformed observations unavailable", () => { assert.equal(evaluateWindowsPrivateState(null).status, "unavailable"); assert.equal(evaluateWindowsPrivateState({}).status, "unavailable"); });
process.stdout.write(`${passed}/${passed} checks passed.\n`);
