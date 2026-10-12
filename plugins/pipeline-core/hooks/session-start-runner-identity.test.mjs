// SPDX-License-Identifier: SUL-1.0
// Canonical file-only fixture adapter; business callbacks/IDs remain byte-exact.
import assert from "node:assert/strict";
import {after} from "node:test";
import {existsSync,readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from "node:fs";
import os from "node:os";
import {join} from "node:path";
import {syncBuiltinESMExports} from "node:module";
import {fileURLToPath,pathToFileURL} from "node:url";
import {registerTestCaseCompletion} from "../lib/test-case-completion.mjs";
const fixtureParent=fileURLToPath(new URL("../../../scratch/",import.meta.url));
mkdirSync(fixtureParent,{recursive:true});
const root=mkdtempSync(join(fixtureParent,"ssri-fixture-"));
for(const part of ["home","tmp",".claude","xdg-config","xdg-cache","xdg-data"])mkdirSync(join(root,part));
const originalHome=os.homedir,originalTmp=os.tmpdir;
const overrides={HOME:join(root,"home"),USERPROFILE:join(root,"home"),TMPDIR:join(root,"tmp"),TMP:join(root,"tmp"),TEMP:join(root,"tmp"),XDG_CONFIG_HOME:join(root,"xdg-config"),XDG_CACHE_HOME:join(root,"xdg-cache"),XDG_DATA_HOME:join(root,"xdg-data"),PIPELINE_SSRI_FIXTURE_ROOT:root};
const prior=Object.fromEntries(Object.keys(overrides).map(key=>[key,process.env[key]]));
Object.assign(process.env,overrides);os.homedir=()=>join(root,"home");os.tmpdir=()=>join(root,"tmp");syncBuiltinESMExports();
after(()=>{os.homedir=originalHome;os.tmpdir=originalTmp;syncBuiltinESMExports();for(const[key,value]of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}rmSync(root,{recursive:true,force:true});});
const inheritedLoader="import { fileURLToPath, pathToFileURL } from \"node:url\";\nimport { resolve as resolvePath } from \"node:path\";\nconst repository = resolvePath(fileURLToPath(new URL(\"../..\", import.meta.url)));\nconst base = pathToFileURL(repository + \"/plugins/pipeline-core/\").href;\nconst testUrl = new URL(\"./session-start-runner-identity.test.mjs\", import.meta.url).href;\nlet fixture;\nexport function initialize(data) { fixture = data.fixture; }\nexport function resolve(specifier, context, nextResolve) {\n  if (context.parentURL === testUrl) {\n    if (specifier === \"../lib/test-case-completion.mjs\") return { url: base + \"lib/test-case-completion.mjs\", shortCircuit: true };\n    if (specifier === \"./codex-session-start-hint.mjs\") return { url: base + \"hooks/codex-session-start-hint.mjs\", shortCircuit: true };\n  }\n  return nextResolve(specifier, context);\n}\nexport function load(url, context, nextLoad) {\n  const overrides = {\n    [base + \"lib/governance-scope.mjs\"]: `export function observeGovernanceScope({rootDir}={}) { if(rootDir !== ${JSON.stringify(fixture)}) throw new Error('fixture scope mismatch'); return {requiresEnforcement:true,hintAllowed:false,state:'active'}; }`,\n    [base + \"lib/resume-hint.mjs\"]: `export function inspectResumeHint() { return {status:'unavailable'}; }`,\n    [base + \"lib/project-authority.mjs\"]: `export function resolveProjectAuthorityPaths() { return {status:'ready',state:'.claude/pipeline-state.json'}; }`,\n  };\n  if (Object.hasOwn(overrides, url)) return { format: \"module\", source: `export * from ${JSON.stringify(url + \"?ssri-original\")};\\n${overrides[url]}`, shortCircuit: true };\n  return nextLoad(url, context);\n}\n";
const inheritedPreload="import { register } from \"node:module\";\nregister(new URL(\"./loader.mjs\", import.meta.url), { data: { fixture: process.env.PIPELINE_SSRI_FIXTURE_ROOT } });\n";
// Only relocate loader import routing to the actual canonical graph; its three seam bodies stay unchanged.
const repository=fileURLToPath(new URL("../../../",import.meta.url));
const relocatedLoader=inheritedLoader
 .replace('const repository = resolvePath(fileURLToPath(new URL("../..", import.meta.url)));','const repository = '+JSON.stringify(repository)+';')
 .replace('const testUrl = new URL("./session-start-runner-identity.test.mjs", import.meta.url).href;','const testUrl = '+JSON.stringify(import.meta.url)+';');
writeFileSync(join(root,"loader.mjs"),relocatedLoader,{flag:"wx"});
writeFileSync(join(root,"preload.mjs"),inheritedPreload,{flag:"wx"});
await import(pathToFileURL(join(root,"preload.mjs")).href);
const {main}=await import("./codex-session-start-hint.mjs");
assert.ok(root, "isolated public nonGit fixture required");
const config = JSON.parse(readFileSync(new URL("hooks.json", import.meta.resolve("./codex-session-start-hint.mjs")), "utf8"));
const codexConfig = JSON.parse(readFileSync(new URL("codex-hooks.json", import.meta.resolve("./codex-session-start-hint.mjs")), "utf8"));
assert.ok(existsSync(fileURLToPath(import.meta.resolve("./codex-session-start-hint.mjs"))), "shared installed script exists");
function configuredEntries(value, matcher) {
  assert.ok(Array.isArray(value.hooks?.SessionStart), "SessionStart configuration array required");
  const entries = value.hooks.SessionStart.filter(row => row.matcher === matcher)
    .flatMap(row => row.hooks).filter(row => typeof row.command === "string" && row.command.includes("/hooks/codex-session-start-hint.mjs"));
  assert.equal(entries.length, 1, "one configured shared hint entry required");
  assert.equal(entries[0].type, "command");
  return entries;
}
const claudeEntries = configuredEntries(config, "startup|resume|clear");
const codexEntries = configuredEntries(codexConfig, "startup|resume|clear|compact");
function payload(input, runner = null) {
  let output = "";
  const original = process.stdout.write;
  process.stdout.write = chunk => { output += chunk; return true; };
  try { main({ projectDir: root, input, runner }); } finally { process.stdout.write = original; }
  return JSON.parse(output);
}
const cases = [
  { id: "SSRI001", name: "configured Claude startup never advertises Codex recovery", run() {
    // Identity comes from the owned Claude entry interface, never a payload/env claim.
    const output = payload({ hook_event_name: "SessionStart", source: "startup", session_id: "synthetic-claude-current", cwd: root }, "claude");
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /--runner codex/u);
    assert.match(output.hookSpecificOutput.additionalContext, /Transcript recovery is unavailable for this runner/u);
  } },
  { id: "SSRI002", name: "positive Codex method seam retains repository prior-only guidance", run() {
    const decision = { context: payload({ hook_event_name: "SessionStart", source: "startup", session_id: "synthetic-codex-current", cwd: root }, "codex").hookSpecificOutput.additionalContext };
    assert.match(decision.context, /--runner codex --exclude-session "synthetic-codex-current"/u);
    assert.match(decision.context, /only PRIOR Codex transcripts whose own session metadata matches this repository identity/u);
    assert.match(decision.context, /never search \$CODEX_HOME, ~\/\.codex/u);
  } },
  { id: "SSRI003", name: "signal-less entry reports unavailable rather than guessing Codex", run() {
    const output = payload({ hook_event_name: "SessionStart", source: "startup", session_id: "synthetic-unknown-current", cwd: root }, null);
    assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /--runner codex/u);
    assert.match(output.hookSpecificOutput.additionalContext, /Transcript recovery is unavailable for this runner/u);
  } },
  { id: "SSRI004", name: "compact missing continuity keeps lightweight fail-closed reground", run() {
    const output = payload({ hook_event_name: "SessionStart", source: "compact", session_id: "synthetic-compact-current", cwd: root });
    assert.match(output.systemMessage, /PCR-OUTER-INVALID/u);
    assert.doesNotMatch(output.systemMessage, /run pipeline-core:pipeline-start/u);
    assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /--runner codex/u);
  } },
  { id: "SSRI005", name: "owned Claude configuration supplies explicit Claude runner", run() {
    assert.equal(claudeEntries[0].command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/codex-session-start-hint.mjs" --runner claude');
  } },
  { id: "SSRI006", name: "owned Codex configuration supplies explicit Codex runner on both platforms", run() {
    const expected = 'node "${PLUGIN_ROOT}/hooks/codex-session-start-hint.mjs" --runner codex';
    assert.equal(codexEntries[0].command, expected);
    assert.equal(codexEntries[0].commandWindows, expected);
  } },
];
registerTestCaseCompletion({ cases, fd: 3, maxBytes: 8192 });
