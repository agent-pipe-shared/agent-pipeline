// Source target: plugins/pipeline-core/lib/runtime-projection-removal.test.mjs
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "UC03C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {planRuntimeProjectionOwnedRemoval,removeJsonOwnedPaths} from './runtime-projection-removal.mjs';
test('JSON owned-key deletion preserves exact foreign scalar/object bytes and formatting',()=>{const bytes='{\n  "foreign": { "snow": "❄", "n": 1e+2 },\n  "humanRoles": {"po":{"displayLabel":"PO", "foreign":true}},\n  "tail" : [ 1, 2 ]\n}\n';const p=planRuntimeProjectionOwnedRemoval({format:'json',bytes,expectedBytes:bytes,ownedKeys:['humanRoles.po.displayLabel']});assert.equal(p.status,'ready');assert.ok(p.afterBytes.includes('"foreign": { "snow": "❄", "n": 1e+2 }'));assert.ok(p.afterBytes.includes('"tail" : [ 1, 2 ]'));assert.equal(JSON.parse(p.afterBytes).humanRoles.po.foreign,true);assert.equal(Object.hasOwn(JSON.parse(p.afterBytes).humanRoles.po,'displayLabel'),false);assert.deepEqual(JSON.parse(removeJsonOwnedPaths('{"first":1,"owned":2}', ['owned'])),{first:1});assert.deepEqual(JSON.parse(removeJsonOwnedPaths('{"owned":2}', ['owned'])),{});});
test('modified owned values or duplicate keys refuse rather than overwrite',()=>{assert.equal(planRuntimeProjectionOwnedRemoval({format:'json',bytes:'{"owned":1,"foreign":2}',expectedBytes:'{"owned":2}',ownedKeys:['owned']}).status,'conflict');assert.throws(()=>removeJsonOwnedPaths('{"owned":1,"owned":2}', ['owned']),/PRR-DUPLICATE/);});
test('YAML block removal preserves foreign blocks comments and exact CRLF',()=>{const bytes='modelRouting:\r\n  advisor: codex\r\n# User comment retained\r\nforeign:\r\n  hello: 世界\r\nsession:\r\n  keep_awake: true\r\n  unrelated: yes\r\n';const p=planRuntimeProjectionOwnedRemoval({format:'yaml',bytes,expectedBytes:bytes,ownedKeys:['modelRouting','session.keep_awake']});assert.equal(p.status,'ready');assert.equal(p.afterBytes,'# User comment retained\r\nforeign:\r\n  hello: 世界\r\nsession:\r\n  unrelated: yes\r\n');assert.equal(planRuntimeProjectionOwnedRemoval({format:'yaml',bytes:'modelRouting:\n  advisor: unknown\n',expectedBytes:'modelRouting:\n  advisor: codex\n',ownedKeys:['modelRouting']}).status,'conflict');});
test('TOML removal is top-level and leaves same-name foreign section bytes intact',()=>{const bytes='name = "Advisor"\nmodel = "codex"\n# foreign comment\n[foreign]\nmodel = "mine"\n';const p=planRuntimeProjectionOwnedRemoval({format:'toml',bytes,expectedBytes:bytes,ownedKeys:['name','model']});assert.equal(p.status,'ready');assert.equal(p.afterBytes,'# foreign comment\n[foreign]\nmodel = "mine"\n');assert.equal(planRuntimeProjectionOwnedRemoval({format:'toml',bytes:'model = "user"\n',expectedBytes:'model = "codex"\n',ownedKeys:['model']}).status,'conflict');});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 4) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
