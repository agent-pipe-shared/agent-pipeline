#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blockNativeReadback, digest, finalizeNativeReadback, prepareNativeReadback, readNativeReadback, recordNativeReadbackStep, storeNativeReadback } from "./native-plugin-readback.mjs";

const hex = (char, n = 64) => char.repeat(n);
const root = mkdtempSync(join(tmpdir(), "native-readback-"));
mkdirSync(join(root, "hooks"));
mkdirSync(join(root, ".codex-plugin"));
writeFileSync(join(root, ".codex-plugin/plugin.json"), JSON.stringify({ name: "pipeline-core", version: "0.2.0" }));
writeFileSync(join(root, "hooks/codex-pretool-guard.mjs"), "adapter");
writeFileSync(join(root, "hooks/guard-push.mjs"), "guard");
const adapterDigest = digest("adapter"), guardDigest = digest("guard");
const manifestDigest = createHash("sha256").update(writeManifest()).digest("hex");
function writeManifest() { return JSON.stringify({ name: "pipeline-core", version: "0.2.0" }); }
const prepared = prepareNativeReadback({
  transactionId: "btm-d2-1", provider: "codex", pluginId: "pipeline-core", sourceOid: hex("a", 40), loadedRootKind: "codex-provider-cache",
  manifest: { relativePath: ".codex-plugin/plugin.json", name: "pipeline-core", version: "0.2.0", digest: manifestDigest },
  loadedChain: [{ relativePath: "hooks/codex-pretool-guard.mjs", expectedDigest: adapterDigest }, { relativePath: "hooks/guard-push.mjs", expectedDigest: guardDigest }],
});
for (const length of [41, 63]) assert.throws(() => prepareNativeReadback({
  transactionId: "btm-d2-bad", provider: "codex", pluginId: "pipeline-core", sourceOid: hex("a", length), loadedRootKind: "codex-provider-cache",
  manifest: { relativePath: ".codex-plugin/plugin.json", name: "pipeline-core", version: "0.2.0", digest: manifestDigest },
  loadedChain: [{ relativePath: "hooks/guard-push.mjs", expectedDigest: guardDigest }],
}), /sourceOid invalid/);
const common = mkdtempSync(join(tmpdir(), "native-readback-common-"));
let stored = storeNativeReadback({ gitCommonDir: common, state: prepared, expectedRawSha256: null });
assert.equal(statSync(stored.path).mode & 0o777, 0o600);
assert.equal(readNativeReadback(common, "btm-d2-1").state.phase, "prepared");
assert.equal(storeNativeReadback({ gitCommonDir: common, state: prepared, expectedRawSha256: stored.rawDigest }).written, false);
let state = prepared;
for (const phase of ["update-observed", "reload-observed", "trust-observed", "fresh-session-observed"]) {
  state = recordNativeReadbackStep(state, { expectedRevision: state.revision, expectedStateSha256: digest(state), phase, observation: { status: "observed", phase, evidenceDigest: hex(String(state.revision + 1)), observedAt: state.revision + 1 } });
  stored = storeNativeReadback({ gitCommonDir: common, state, expectedRawSha256: stored.rawDigest });
}
const freshState = state;
state = finalizeNativeReadback(state, root);
stored = storeNativeReadback({ gitCommonDir: common, state, expectedRawSha256: stored.rawDigest });
assert.equal(state.phase, "verified");
assert.throws(() => recordNativeReadbackStep(prepared, { expectedRevision: 9, expectedStateSha256: digest(prepared), phase: "update-observed", observation: { status: "observed", phase: "update-observed", evidenceDigest: hex("1"), observedAt: 1 } }), /stale/);
writeFileSync(join(root, "hooks/guard-push.mjs"), "drift");
assert.throws(() => finalizeNativeReadback(freshState, root), /hook-chain/);
const blocked = blockNativeReadback(prepared, { expectedRevision: 0, expectedStateSha256: digest(prepared), reason: "hook-trust-missing" });
assert.equal(blocked.phase, "blocked");
assert.throws(() => blockNativeReadback(prepared, { expectedRevision: 0, expectedStateSha256: digest(prepared), reason: "guess" }), /closed reason/);
assert.throws(() => prepareNativeReadback({ ...{
  transactionId: "btm-d2-1", provider: "codex", pluginId: "pipeline-core", sourceOid: hex("a", 40), loadedRootKind: "codex-provider-cache",
  manifest: { relativePath: ".codex-plugin/plugin.json", name: "pipeline-core", version: "0.2.0", digest: manifestDigest }, loadedChain: [{ relativePath: "hooks/guard-push.mjs", expectedDigest: guardDigest }], extra: true,
} }), /keys/);
const antigravityRoot = mkdtempSync(join(tmpdir(), "native-readback-antigravity-"));
mkdirSync(join(antigravityRoot, "hooks"));
const antigravityManifest = JSON.stringify({ name: "agent-pipeline-core", version: "0.2.0" });
writeFileSync(join(antigravityRoot, "plugin.json"), antigravityManifest);
writeFileSync(join(antigravityRoot, "hooks/antigravity-pretool-guard.mjs"), "antigravity-adapter");
const antigravityPrepared = prepareNativeReadback({
  transactionId: "btm-d2-antigravity", provider: "antigravity", pluginId: "pipeline-core", sourceOid: hex("b", 40), loadedRootKind: "antigravity-project-scope",
  manifest: { relativePath: "plugin.json", name: "agent-pipeline-core", version: "0.2.0", digest: createHash("sha256").update(antigravityManifest).digest("hex") },
  loadedChain: [{ relativePath: "hooks/antigravity-pretool-guard.mjs", expectedDigest: digest("antigravity-adapter") }],
});
let antigravityState = antigravityPrepared;
for (const phase of ["update-observed", "reload-observed", "trust-observed", "fresh-session-observed"]) {
  antigravityState = recordNativeReadbackStep(antigravityState, { expectedRevision: antigravityState.revision, expectedStateSha256: digest(antigravityState), phase, observation: { status: "observed", phase, evidenceDigest: hex(String(antigravityState.revision + 1)), observedAt: antigravityState.revision + 1 } });
}
assert.equal(finalizeNativeReadback(antigravityState, antigravityRoot).phase, "verified");
assert.throws(() => prepareNativeReadback({
  transactionId: "btm-d2-antigravity-invalid", provider: "antigravity", pluginId: "pipeline-core", sourceOid: hex("b", 40), loadedRootKind: "antigravity-project-scope",
  manifest: { relativePath: "plugin.json", name: "pipeline-core", version: "0.2.0", digest: createHash("sha256").update(antigravityManifest).digest("hex") },
  loadedChain: [{ relativePath: "hooks/antigravity-pretool-guard.mjs", expectedDigest: digest("antigravity-adapter") }],
}), /manifest invalid/);
rmSync(root, { recursive: true, force: true });
rmSync(common, { recursive: true, force: true });
rmSync(antigravityRoot, { recursive: true, force: true });
console.log("native-plugin-readback: 10 tests passed");
