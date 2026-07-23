// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { observeHostAdvisorWorkspace } from "./host-advisor-workspace.mjs";
test("observes deterministic injected git workspace", () => { const files = "a.txt\0b.txt\0"; const stage = "100644 "+"a".repeat(40)+" 0\ta.txt\0"; const git = args => { const k=args.join(" "); if(k.includes("show-toplevel")) return Buffer.from(process.cwd()+"\n"); if(k.includes("HEAD^{tree}")) return Buffer.from("b".repeat(40)+"\n"); if(k.includes("rev-parse HEAD")) return Buffer.from("c".repeat(40)+"\n"); if(k.includes("--stage")) return Buffer.from(stage); return Buffer.from(files); }; const out = observeHostAdvisorWorkspace(process.cwd(), {git}); assert.equal(out.manifest.entries.length,2); });
