// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  admitPrivateOverlayActivation,
  consumePrivateOverlayAdmission,
  validatePrivateOverlayActivation,
} from "./private-overlay-activation.mjs";
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";

const REGISTRY = loadRunnerProfilesV3Registry();
const CANDIDATE = Object.freeze({
  repository: "https://example.invalid/public/core.git",
  branch: "feature/neutral-candidate",
  commit: "1".repeat(40),
  tree: "2".repeat(40),
});
const PLUGIN = Object.freeze({
  name: "pipeline-core",
  version: "1.2.3+fixture.1",
  manifestSha256: "3".repeat(64),
  contentSha256: "7".repeat(64),
});

function yamlScalar(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  throw new TypeError("fixture contains a non-scalar YAML value");
}

function yamlLines(value, indent = 0) {
  const prefix = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`];
    return value.flatMap((entry) => {
      if (entry !== null && typeof entry === "object") return [`${prefix}-`, ...yamlLines(entry, indent + 2)];
      return [`${prefix}- ${yamlScalar(entry)}`];
    });
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${prefix}{}`];
    return entries.flatMap(([key, entry]) => {
      if (entry !== null && typeof entry === "object") return [`${prefix}${key}:`, ...yamlLines(entry, indent + 2)];
      return [`${prefix}${key}: ${yamlScalar(entry)}`];
    });
  }
  return [`${prefix}${yamlScalar(value)}`];
}

const SOURCE = `${yamlLines({
  schema: "pipeline.user.v3",
  language: { human_facing: "en", agent_facing: "en" },
  agent_runtime: "other",
  runners: { enabled: ["codex"], default: "codex" },
  routing: { profiles: REGISTRY.profiles, duties: REGISTRY.duties },
  usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
  autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
  gates: { dev_plan: "blocking", push: "blocking", security: "blocking", claude_md_max_lines: 200 },
  critic_export: REGISTRY.criticExportPolicy,
}).join("\n")}\n`;

function lock(overrides = {}) {
  return {
    $schema: "pipeline.core-lock.v1",
    source: { ...CANDIDATE, ...(overrides.source ?? {}) },
    plugin: {
      name: PLUGIN.name,
      version: PLUGIN.version,
      manifest_sha256: PLUGIN.manifestSha256,
      ...(overrides.plugin ?? {}),
    },
    ...(overrides.root ?? {}),
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "snt-a-overlay-"));
  writeFileSync(join(root, "pipeline.user.yaml"), SOURCE);
  mkdirSync(join(root, ".agent-pipeline"));
  writeFileSync(join(root, ".agent-pipeline", "core.lock.json"), `${JSON.stringify(lock(), null, 2)}\n`);
  for (const className of ["policies", "guidelines", "templates", "extensions"]) mkdirSync(join(root, ".agent-pipeline", className));
  writeFileSync(join(root, ".agent-pipeline", "policies", "a.md"), "neutral policy fixture\n");
  writeFileSync(join(root, ".agent-pipeline", "policies", "z.md"), "second neutral policy fixture\n");
  writeFileSync(join(root, ".agent-pipeline", "guidelines", "guide.md"), "neutral guideline fixture\n");
  writeFileSync(join(root, ".agent-pipeline", "templates", "template.md"), "neutral template fixture\n");
  writeFileSync(join(root, ".agent-pipeline", "extensions", "adapter.md"), "{}\n");
  return root;
}

function validate(root, overrides = {}, dependencies = {}) {
  return validatePrivateOverlayActivation({
    overlayRoot: root,
    selectedCandidate: overrides.selectedCandidate ?? CANDIDATE,
    installedPlugin: overrides.installedPlugin ?? PLUGIN,
  }, dependencies);
}

function admit(root, overrides = {}, dependencies = {}) {
  return admitPrivateOverlayActivation({
    overlayRoot: root,
    selectedCandidate: overrides.selectedCandidate ?? CANDIDATE,
    installedPlugin: overrides.installedPlugin ?? PLUGIN,
  }, dependencies);
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function reason(result) { return result.reasonCodes[0]; }
function replaceLock(root, value) { writeFileSync(join(root, ".agent-pipeline", "core.lock.json"), `${JSON.stringify(value, null, 2)}\n`); }

const cases = [];
function test(name, run) { cases.push([name, run]); }

test("accepts V3 and returns only sanitized candidate-bound evidence", () => {
  const root = fixture();
  try {
    const result = validate(root);
    assert.equal(result.status, "ready");
    assert.deepEqual(result.reasonCodes, ["SNT-A-VALIDATED"]);
    assert.deepEqual(result.admittedCounts, { policies: 2, guidelines: 1, templates: 1, extensions: 1, total: 5 });
    assert.equal(result.candidate.repositorySha256, sha256(CANDIDATE.repository));
    assert.equal(result.candidate.branchSha256, sha256(CANDIDATE.branch));
    assert.equal(result.candidate.commit, CANDIDATE.commit);
    assert.equal(result.plugin.manifestSha256, PLUGIN.manifestSha256);
    assert.equal(result.plugin.contentSha256, PLUGIN.contentSha256);
    assert.deepEqual(result.inputs.admittedFileSha256, [
      sha256("neutral policy fixture\n"),
      sha256("second neutral policy fixture\n"),
      sha256("neutral guideline fixture\n"),
      sha256("neutral template fixture\n"),
      sha256("{}\n"),
    ]);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes("neutral policy fixture"), false);
    assert.equal(serialized.includes("a.md"), false);
    assert.equal(serialized.includes(CANDIDATE.repository), false);
    assert.equal(serialized.includes(CANDIDATE.branch), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("fixed class and lexical order make the admitted digest creation-order independent", () => {
  const first = fixture();
  const second = fixture();
  try {
    rmSync(join(second, ".agent-pipeline", "policies"), { recursive: true });
    mkdirSync(join(second, ".agent-pipeline", "policies"));
    writeFileSync(join(second, ".agent-pipeline", "policies", "z.md"), "second neutral policy fixture\n");
    writeFileSync(join(second, ".agent-pipeline", "policies", "a.md"), "neutral policy fixture\n");
    assert.equal(validate(first).inputs.admittedSetSha256, validate(second).inputs.admittedSetSha256);
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test("accepts exact 40- and 64-hex Git object identities", () => {
  for (const width of [40, 64]) {
    const root = fixture();
    const selectedCandidate = { ...CANDIDATE, commit: "a".repeat(width), tree: "b".repeat(width) };
    try {
      replaceLock(root, lock({ source: selectedCandidate }));
      assert.equal(validate(root, { selectedCandidate }).status, "ready");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

for (const [name, mutate, expected] of [
  ["missing source", (root) => unlinkSync(join(root, "pipeline.user.yaml")), "SNT-A-INPUT-MISSING"],
  ["malformed source", (root) => writeFileSync(join(root, "pipeline.user.yaml"), "bad: [yaml\n"), "SNT-A-SOURCE-MALFORMED"],
  ["non-V3 source", (root) => writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v2\n"), "SNT-A-SOURCE-INVALID-V3"],
  ["missing lock", (root) => unlinkSync(join(root, ".agent-pipeline", "core.lock.json")), "SNT-A-INPUT-MISSING"],
  ["malformed lock", (root) => writeFileSync(join(root, ".agent-pipeline", "core.lock.json"), "{"), "SNT-A-LOCK-MALFORMED"],
  ["open lock schema", (root) => replaceLock(root, lock({ root: { extra: true } })), "SNT-A-LOCK-SCHEMA"],
  ["undeclared namespace", (root) => mkdirSync(join(root, ".agent-pipeline", "other")), "SNT-A-UNDECLARED-NAMESPACE"],
  ["prohibited identity material", (root) => writeFileSync(join(root, ".agent-pipeline", "policies", "owner-identity.md"), "x"), "SNT-A-PROHIBITED-MATERIAL"],
  ["prohibited secret material", (root) => writeFileSync(join(root, ".agent-pipeline", "extensions", "api-token.json"), "{}"), "SNT-A-PROHIBITED-MATERIAL"],
  ["prohibited runtime directory", (root) => mkdirSync(join(root, ".agent-pipeline", "templates", "runtime-cache")), "SNT-A-PROHIBITED-MATERIAL"],
  ["prohibited machine material", (root) => writeFileSync(join(root, ".agent-pipeline", "guidelines", "machine.json"), "{}"), "SNT-A-PROHIBITED-MATERIAL"],
  ["prohibited receipt material", (root) => writeFileSync(join(root, ".agent-pipeline", "extensions", "activation-receipt.json"), "{}"), "SNT-A-PROHIBITED-MATERIAL"],
  ["prohibited cache material", (root) => mkdirSync(join(root, ".agent-pipeline", "templates", "cache")), "SNT-A-PROHIBITED-MATERIAL"],
  ["prohibited evidence material", (root) => writeFileSync(join(root, ".agent-pipeline", "policies", "evidence.json"), "{}"), "SNT-A-PROHIBITED-MATERIAL"],
]) test(`rejects ${name}`, () => {
  const root = fixture();
  try { mutate(root); assert.equal(reason(validate(root)), expected); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

for (const name of [
  "PASSWORD.md",
  "dbPassword.md",
  "ApiKey.md",
  "api-key.md",
  "api_key.md",
  "api‑KEY.md",
  "privateKey.md",
  "private-key.md",
  "PRIVATE.KEY.md",
  "private—key.md",
]) test(`rejects normalized prohibited path segment ${name}`, () => {
  const root = fixture();
  try {
    writeFileSync(join(root, ".agent-pipeline", "extensions", name), "neutral text\n");
    assert.equal(reason(validate(root)), "SNT-A-PROHIBITED-MATERIAL");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const [name, content] of [
  ["named password assignment", "password = fixture-value\n"],
  ["normalized API key assignment", "API_KEY: fixture-value\n"],
  ["camel-case private key assignment", "privateKey = external-reference\n"],
  ["PEM private-key material", "-----BEGIN OPENSSH PRIVATE KEY-----\nfixture\n-----END OPENSSH PRIVATE KEY-----\n"],
]) test(`rejects prohibited content: ${name}`, () => {
  const root = fixture();
  try {
    writeFileSync(join(root, ".agent-pipeline", "extensions", "neutral.md"), content);
    assert.equal(reason(validate(root)), "SNT-A-PROHIBITED-MATERIAL");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("accepts safe prose and non-secret words that merely contain similar substrings", () => {
  const root = fixture();
  try {
    writeFileSync(
      join(root, ".agent-pipeline", "extensions", "access-control.md"),
      "Authentication material stays outside the overlay. Passwords must never be persisted. API keys and private keys remain in an external secret store.\n",
    );
    writeFileSync(join(root, ".agent-pipeline", "templates", "passwordless-keynote.md"), "Use delegated authentication.\n");
    assert.equal(validate(root).status, "ready");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const [field, value, expected] of [
  ["repository", "https://example.invalid/public/other.git", "SNT-A-REPOSITORY-MISMATCH"],
  ["branch", "feature/other", "SNT-A-BRANCH-MISMATCH"],
  ["commit", "4".repeat(40), "SNT-A-COMMIT-MISMATCH"],
  ["tree", "5".repeat(40), "SNT-A-TREE-MISMATCH"],
]) test(`rejects selected candidate ${field} mismatch`, () => {
  const root = fixture();
  try { assert.equal(reason(validate(root, { selectedCandidate: { ...CANDIDATE, [field]: value } })), expected); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

for (const [field, value, expected] of [
  ["name", "other-core", "SNT-A-PLUGIN-NAME-MISMATCH"],
  ["version", "9.9.9", "SNT-A-PLUGIN-VERSION-MISMATCH"],
  ["manifestSha256", "6".repeat(64), "SNT-A-PLUGIN-MANIFEST-MISMATCH"],
]) test(`rejects installed plugin ${field} mismatch`, () => {
  const root = fixture();
  try { assert.equal(reason(validate(root, { installedPlugin: { ...PLUGIN, [field]: value } })), expected); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects symlinked source, lock, namespace, nested file, and root", () => {
  for (const target of ["source", "lock", "namespace", "nested", "root"]) {
    const root = fixture();
    const external = mkdtempSync(join(tmpdir(), "snt-a-external-"));
    try {
      let selectedRoot = root;
      if (target === "source") {
        unlinkSync(join(root, "pipeline.user.yaml"));
        symlinkSync(join(external, "source.yaml"), join(root, "pipeline.user.yaml"));
      } else if (target === "lock") {
        unlinkSync(join(root, ".agent-pipeline", "core.lock.json"));
        symlinkSync(join(external, "lock.json"), join(root, ".agent-pipeline", "core.lock.json"));
      } else if (target === "namespace") {
        rmSync(join(root, ".agent-pipeline", "extensions"), { recursive: true });
        symlinkSync(external, join(root, ".agent-pipeline", "extensions"));
      } else if (target === "nested") {
        symlinkSync(join(external, "file"), join(root, ".agent-pipeline", "extensions", "linked.md"));
      } else {
        selectedRoot = join(tmpdir(), `snt-a-root-link-${process.pid}-${Date.now()}`);
        symlinkSync(root, selectedRoot);
      }
      const result = validate(selectedRoot);
      assert.ok(["SNT-A-SYMLINK", "SNT-A-ROOT-UNSAFE"].includes(reason(result)), `${target}: ${reason(result)}`);
      if (target === "root") unlinkSync(selectedRoot);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  }
});

test("rejects hard-linked and directory-shaped inputs as non-regular", () => {
  const root = fixture();
  const external = join(root, "external.txt");
  try {
    writeFileSync(external, "x");
    linkSync(external, join(root, ".agent-pipeline", "extensions", "linked.md"));
    assert.equal(reason(validate(root)), "SNT-A-NONREGULAR-INPUT");
    unlinkSync(join(root, ".agent-pipeline", "extensions", "linked.md"));
    rmSync(join(root, ".agent-pipeline", "core.lock.json"));
    mkdirSync(join(root, ".agent-pipeline", "core.lock.json"));
    assert.equal(reason(validate(root)), "SNT-A-NONREGULAR-INPUT");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects traversal-shaped observed input and unknown identity keys", () => {
  const root = fixture();
  try {
    assert.equal(reason(validate(root, { selectedCandidate: { ...CANDIDATE, branch: "feature/../escape" } })), "SNT-A-CANDIDATE-BRANCH");
    assert.equal(reason(validate(root, { selectedCandidate: { ...CANDIDATE, repository: `${CANDIDATE.repository}?ref=other` } })), "SNT-A-CANDIDATE-REPOSITORY");
    assert.equal(reason(validate(root, { selectedCandidate: { ...CANDIDATE, extra: true } })), "SNT-A-CANDIDATE-SCHEMA");
    assert.equal(reason(validate(root, { installedPlugin: { ...PLUGIN, localPath: "/not-admitted" } })), "SNT-A-PLUGIN-SCHEMA");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects a query-bearing repository in the lock", () => {
  const root = fixture();
  try {
    replaceLock(root, lock({ source: { repository: `${CANDIDATE.repository}?ref=other` } }));
    assert.equal(reason(validate(root)), "SNT-A-LOCK-SCHEMA");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects a file identity swap between descriptor snapshots", () => {
  const root = fixture();
  const source = join(root, "pipeline.user.yaml");
  const displaced = join(root, "pipeline.user.displaced");
  let calls = 0;
  try {
    const result = validate(root, {}, { afterOpen: () => {
      calls += 1;
      if (calls === 1) {
        renameSync(source, displaced);
        writeFileSync(source, SOURCE);
      }
    } });
    assert.equal(reason(result), "SNT-A-INPUT-CHANGED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects enumerated directory identity drift after readdir", () => {
  const root = fixture();
  const policies = join(root, ".agent-pipeline", "policies");
  let calls = 0;
  try {
    const result = validate(root, {}, { afterOpen: () => {
      calls += 1;
      if (calls === 3) {
        const mode = statSync(policies).mode & 0o777;
        chmodSync(policies, mode ^ 0o040);
      }
    } });
    assert.equal(reason(result), "SNT-A-TOPOLOGY-CHANGED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects missing and malformed explicit API inputs", () => {
  const root = fixture();
  try {
    assert.equal(reason(validatePrivateOverlayActivation()), "SNT-A-CANDIDATE-SCHEMA");
    assert.equal(reason(validatePrivateOverlayActivation({ overlayRoot: root, installedPlugin: PLUGIN })), "SNT-A-CANDIDATE-SCHEMA");
    assert.equal(reason(validatePrivateOverlayActivation({ overlayRoot: root, selectedCandidate: CANDIDATE })), "SNT-A-PLUGIN-SCHEMA");
    assert.equal(reason(validatePrivateOverlayActivation({ overlayRoot: 7, selectedCandidate: CANDIDATE, installedPlugin: PLUGIN })), "SNT-A-ROOT-INVALID");
    assert.equal(reason(validatePrivateOverlayActivation({ overlayRoot: root, selectedCandidate: { ...CANDIDATE, commit: "not-an-oid" }, installedPlugin: PLUGIN })), "SNT-A-CANDIDATE-COMMIT");
    assert.equal(reason(validatePrivateOverlayActivation({ overlayRoot: root, selectedCandidate: CANDIDATE, installedPlugin: { ...PLUGIN, manifestSha256: "not-a-digest" } })), "SNT-A-PLUGIN-MANIFEST");
    assert.equal(reason(validatePrivateOverlayActivation({ overlayRoot: root, selectedCandidate: CANDIDATE, installedPlugin: { ...PLUGIN, contentSha256: "not-a-digest" } })), "SNT-A-PLUGIN-CONTENT");
    const { contentSha256: _contentSha256, ...missingContentIdentity } = PLUGIN;
    assert.equal(reason(validatePrivateOverlayActivation({ overlayRoot: root, selectedCandidate: CANDIDATE, installedPlugin: missingContentIdentity })), "SNT-A-PLUGIN-SCHEMA");
    assert.equal(reason(validatePrivateOverlayActivation({ overlayRoot: root, selectedCandidate: CANDIDATE, installedPlugin: { ...PLUGIN, extra: true } })), "SNT-A-PLUGIN-SCHEMA");
    const validInput = { overlayRoot: root, selectedCandidate: CANDIDATE, installedPlugin: PLUGIN };
    assert.equal(reason(validatePrivateOverlayActivation(validInput, null)), "SNT-A-DEPENDENCY-SCHEMA");
    assert.equal(reason(validatePrivateOverlayActivation(validInput, { afterOpen: true })), "SNT-A-DEPENDENCY-SCHEMA");
    assert.equal(reason(validatePrivateOverlayActivation(validInput, { extra: true })), "SNT-A-DEPENDENCY-SCHEMA");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects traversal-shaped overlay root", () => {
  const root = fixture();
  try {
    const traversalRoot = `${root}/../${basename(root)}`;
    assert.equal(reason(validate(traversalRoot)), "SNT-A-PATH-ESCAPE");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects a symlinked .agent-pipeline component", () => {
  const root = fixture();
  const external = mkdtempSync(join(tmpdir(), "snt-a-component-"));
  try {
    rmSync(join(root, ".agent-pipeline"), { recursive: true });
    symlinkSync(external, join(root, ".agent-pipeline"));
    assert.equal(reason(validate(root)), "SNT-A-SYMLINK");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("authenticated admission consumes one immutable class-and-lexical ordered Markdown batch", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, ".agent-pipeline", "policies", "a"));
    writeFileSync(join(root, ".agent-pipeline", "policies", "a", "nested.md"), "nested neutral policy fixture\n");
    const evidence = admit(root);
    assert.equal(evidence.status, "ready");
    assert.deepEqual(evidence, validate(root), "admission evidence must equal the public sanitized validation evidence");
    const expectedCounts = { ...evidence.admittedCounts };
    let observed;
    const result = consumePrivateOverlayAdmission(evidence, (batch) => {
      observed = batch;
      assert.equal(Object.isFrozen(batch), true);
      assert.ok(batch.every((entry) => Object.isFrozen(entry)));
      assert.deepEqual(batch.map(({ className, privateName }) => `${className}:${privateName}`), [
        "policies:a.md",
        "policies:a/nested.md",
        "policies:z.md",
        "guidelines:guide.md",
        "templates:template.md",
        "extensions:adapter.md",
      ]);
      assert.deepEqual(batch.map(({ text }) => text), [
        "neutral policy fixture\n",
        "nested neutral policy fixture\n",
        "second neutral policy fixture\n",
        "neutral guideline fixture\n",
        "neutral template fixture\n",
        "{}\n",
      ]);
      assert.throws(() => { batch[0].text = "changed"; }, TypeError);
      assert.throws(() => { batch.push({}); }, TypeError);
      evidence.admittedCounts.privateCallbackField = "a.md must not escape";
    });
    assert.equal(result.status, "consumed");
    assert.deepEqual(result.admittedCounts, expectedCounts);
    const output = JSON.stringify(result);
    for (const privateValue of [root, "a.md", "adapter.md", "neutral policy fixture", "{}\n"]) {
      assert.equal(output.includes(privateValue), false);
    }
    assert.equal(Object.hasOwn(result.admittedCounts, "privateCallbackField"), false);
    assert.equal(observed[0].text, "neutral policy fixture\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public validation creates no consume authority and cloned, mutated, or replayed admission is rejected", () => {
  const root = fixture();
  try {
    let called = false;
    const publicEvidence = validate(root);
    assert.equal(reason(consumePrivateOverlayAdmission(publicEvidence, () => { called = true; })), "SNT-A-ADMISSION-INVALID");

    const replayEvidence = admit(root);
    assert.equal(reason(consumePrivateOverlayAdmission(JSON.parse(JSON.stringify(replayEvidence)), () => { called = true; })), "SNT-A-ADMISSION-INVALID");
    assert.equal(consumePrivateOverlayAdmission(replayEvidence, () => {}).status, "consumed");
    assert.equal(reason(consumePrivateOverlayAdmission(replayEvidence, () => { called = true; })), "SNT-A-ADMISSION-REPLAY");

    const mutatedEvidence = admit(root);
    mutatedEvidence.inputs.sourceSha256 = "0".repeat(64);
    assert.equal(reason(consumePrivateOverlayAdmission(mutatedEvidence, () => { called = true; })), "SNT-A-ADMISSION-MUTATED");
    assert.equal(reason(consumePrivateOverlayAdmission(mutatedEvidence, () => { called = true; })), "SNT-A-ADMISSION-REPLAY");
    assert.equal(called, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("consumer failure and async return are typed, opaque, single-use rejections", () => {
  const root = fixture();
  try {
    const failed = admit(root);
    const failure = consumePrivateOverlayAdmission(failed, () => { throw new Error("private callback detail a.md"); });
    assert.equal(reason(failure), "SNT-A-CONSUMER-FAILED");
    assert.equal(JSON.stringify(failure).includes("private callback detail"), false);
    assert.equal(reason(consumePrivateOverlayAdmission(failed, () => {})), "SNT-A-ADMISSION-REPLAY");

    const asynchronous = admit(root);
    assert.equal(reason(consumePrivateOverlayAdmission(asynchronous, () => Promise.resolve())), "SNT-A-CONSUMER-ASYNC");
    assert.equal(reason(consumePrivateOverlayAdmission(asynchronous, () => {})), "SNT-A-ADMISSION-REPLAY");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("non-Markdown and malformed UTF-8 inputs reject before any batch can be consumed", () => {
  for (const [name, mutate, expected] of [
    ["non-md", (root) => writeFileSync(join(root, ".agent-pipeline", "extensions", "adapter.json"), "{}\n"), "SNT-A-INPUT-EXTENSION"],
    ["binary", (root) => writeFileSync(join(root, ".agent-pipeline", "extensions", "adapter.md"), Buffer.from([0xff, 0xfe])), "SNT-A-INPUT-NON-UTF8"],
  ]) {
    const selected = fixture();
    try {
      mutate(selected);
      const evidence = admit(selected);
      assert.equal(reason(evidence), expected, name);
      let called = false;
      assert.equal(reason(consumePrivateOverlayAdmission(evidence, () => { called = true; })), "SNT-A-ADMISSION-INVALID");
      assert.equal(called, false);
    } finally { rmSync(selected, { recursive: true, force: true }); }
  }
});

let passed = 0;
for (const [name, run] of cases) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name} -- ${error.stack ?? error.message}`);
  }
}
console.log(`\nprivate overlay activation: ${passed}/${cases.length} checks passed.`);
process.exit(passed === cases.length ? 0 : 1);
