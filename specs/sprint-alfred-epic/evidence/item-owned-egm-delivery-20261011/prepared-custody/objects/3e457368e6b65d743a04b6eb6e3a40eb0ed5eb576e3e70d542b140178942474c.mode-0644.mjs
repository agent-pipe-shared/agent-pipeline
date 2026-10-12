import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const skillPath = "plugins/pipeline-core/skills/pipeline-start/SKILL.md";
const expectedSha256 = "8ca34f87c14655e7a746b0e8070d108fd78d33e7de92b04db0f9301be38dcb6a";
const source = readFileSync(skillPath, "utf8");
const normalize = (value) => value.replace(/\s+/gu, " ");
const bytes = Buffer.byteLength(source, "utf8");
const lazyStart = source.indexOf("## Typed lazy loading");
const postLazyStart = source.indexOf("## Gate authority and autonomous continuation", lazyStart);
assert.ok(lazyStart > 0 && postLazyStart > lazyStart, "skill must retain a typed lazy section between common sections");
const lazy = source.slice(lazyStart, postLazyStart);
const commonBody = source.slice(0, lazyStart) + source.slice(postLazyStart);
const normalizedSource = normalize(source);
const normalizedLazy = normalize(lazy);
const normalizedCommonBody = normalize(commonBody);

test("BOOT-01 reads the exact pinned skill generation and measures UTF-8 source bytes", (t) => {
  assert.equal(createHash("sha256").update(source).digest("hex"), expectedSha256);
  assert.equal(bytes, 23693);
  t.diagnostic(`UTF-8 source-context bytes: whole=${bytes}, common-body=${Buffer.byteLength(commonBody, "utf8")}, typed-lazy-section=${Buffer.byteLength(lazy, "utf8")}`);
  t.diagnostic("These are source-byte measurements, not model-token, runtime-payload, or native-runner measurements.");
});

test("BOOT-02 common path retains explicit security and PO boundaries", () => {
  for (const required of [
    "Private Critic export requires a separate, project-bound consent decision",
    "never infer host approval from a saved consent or model label",
    "safety shape, not a second PO chat gate",
    "Ask the PO once now for both",
    "never a default or invented value",
    "A recorded PRD/Spec approval mandates its accepted scope",
    "Never bypass a real gate or turn an automated evidence failure into an invented PO approval.",
  ]) assert.ok(normalizedCommonBody.includes(required), `missing common boundary: ${required}`);
  assert.ok(normalizedCommonBody.includes("requiresConfirmation"), "common path must distinguish confirmation shape from a second PO gate");
});

test("BOOT-03 runner-specific model details are conditionally referenced by the typed lazy section", () => {
  assert.ok(normalizedLazy.includes("references/model-role-codex-claude.md"));
  assert.ok(normalizedLazy.includes("references/model-role-antigravity.md"));
  assert.ok(normalizedCommonBody.includes("In a new session run the optional model-role bootstrap for the installed runner only"));
  assert.ok(normalizedCommonBody.includes("absent optional evidence keeps the existing governed V3 route and does not degrade lifecycle"));
});

test("BOOT-04 source footprint does not claim the original three-runner runtime budget", () => {
  assert.ok(normalizedSource.includes("utf8-byte-upper-bound"));
  assert.ok(normalizedSource.includes("not a model token count"));
  assert.ok(normalizedSource.includes("Normal bootstrap targets 10–15k units"));
  assert.ok(normalizedSource.includes("original payload over 45,000 is rejected"));
});
