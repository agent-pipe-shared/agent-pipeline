#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildNeutralRangeCommit, computeNeutralPlanDigest, detectNeutralLeakage, neutralCanonicalDigest, neutralLeakagePolicyDigest,
  NEUTRAL_IDENTITY, NEUTRAL_MESSAGE, PLUMBING_COMMANDS, validateNeutralRangePlan,
} from "./neutral-range-plan.mjs";
const h = (char, length = 64) => char.repeat(length);
const patch = "diff --git a/a.txt b/a.txt\n";
function fixture() {
  const plan = {
    schema: "pipeline.neutral-range-plan.v1", sourceRepositoryFingerprint: h("1"), publicRepositoryFingerprint: h("2"),
    sourceBaseCommit: h("a", 40), sourceBaseTree: h("b", 40), sourceCandidateCommit: h("c", 40), sourceCandidateTree: h("d", 40),
    publicBaseCommit: h("e", 40), publicBaseTree: h("f", 40), publicBaseCommitterEpoch: 100,
    sourceDelta: ["a.txt"], operations: [{ operation: "add", path: "a.txt", newMode: "100644", sourceSha256: h("3"), publicSha256: h("3") }],
    exclusions: [], transformRecords: [], publicBaseManifest: [], resultManifest: [{ path: "a.txt", mode: "100644", rawSha256: h("3") }],
    resultManifestDigest: null, exclusionReview: null, exclusionReviewDigest: null, author: NEUTRAL_IDENTITY, committer: NEUTRAL_IDENTITY,
    authorTimestamp: 101, committerTimestamp: 101, message: NEUTRAL_MESSAGE, signed: false, commitCount: 1, parentCommits: [h("e", 40)],
    plumbing: { commands: PLUMBING_COMMANDS, shell: false, privateIndex: true, clearedEnvironment: true, nullSystemConfig: true, nullGlobalConfig: true, hooksDisabled: true, filtersDisabled: true, signingDisabled: true, editorDisabled: true, pagerDisabled: true, credentialHelpersDisabled: true, remoteHelpersDisabled: true, networkDisabled: true },
    leakagePolicyDigest: neutralLeakagePolicyDigest(), machineDenySet: [], machineDenySetDigest: neutralCanonicalDigest([]), allowances: [], gitleaksFindings: [],
    generatedPatchSha256: null, generatedPatch: patch, resultCommit: h("4", 40), resultTree: h("5", 40), planDigest: null,
  };
  plan.resultManifestDigest = neutralCanonicalDigest(plan.resultManifest);
  return plan;
}
const rawHash = (value) => createHash("sha256").update(value).digest("hex");
function valid() { const plan = fixture(); plan.generatedPatchSha256 = rawHash(plan.generatedPatch); plan.planDigest = computeNeutralPlanDigest(plan); return plan; }
let tests = 0; const check = (name, fn) => { fn(); tests++; };
check("valid exact plan", () => assert.equal(validateNeutralRangePlan(valid()).ok, true));
check("unknown top-level field blocks", () => assert.throws(() => validateNeutralRangePlan({ ...valid(), callerClaim: true }), /keys/));
check("41-character object id blocks", () => { const plan = valid(); plan.sourceCandidateCommit = h("c", 41); plan.planDigest = computeNeutralPlanDigest(plan); assert.throws(() => validateNeutralRangePlan(plan), /sourceCandidateCommit/); });
check("63-character object id blocks", () => { const plan = valid(); plan.resultCommit = h("4", 63); plan.planDigest = computeNeutralPlanDigest(plan); assert.throws(() => validateNeutralRangePlan(plan), /resultCommit/); });
check("source SHA-256 endpoints may bind a public SHA-1 range", () => { const plan = valid(); for (const key of ["sourceBaseCommit", "sourceBaseTree", "sourceCandidateCommit", "sourceCandidateTree"]) plan[key] = h("a", 64); plan.planDigest = computeNeutralPlanDigest(plan); assert.equal(validateNeutralRangePlan(plan).ok, true); });
check("digest is recomputed", () => assert.throws(() => validateNeutralRangePlan({ ...valid(), resultCommit: h("6", 40) }), /plan digest/));
check("complete partition enforced", () => { const plan = valid(); plan.sourceDelta = ["a.txt", "b.txt"]; plan.planDigest = computeNeutralPlanDigest(plan); assert.throws(() => validateNeutralRangePlan(plan), /partition/); });
check("reviewed exclusion binds the normalized plan", () => { const plan = valid(); plan.sourceDelta = ["a.txt", "private.txt"]; plan.exclusions = [{ path: "private.txt", reason: "private operations" }]; plan.exclusionReview = { schema: "pipeline.neutral-exclusion-review.v1", planDigest: null, sourceEndpoint: plan.sourceCandidateCommit, publicEndpoint: plan.publicBaseCommit, excluded: plan.exclusions, reviewerRoute: "critic", assurance: "technical-isolation", candidateTree: plan.resultTree, verdict: "PASS", findings: [] }; plan.exclusionReviewDigest = neutralCanonicalDigest({ ...plan.exclusionReview, planDigest: null }); plan.planDigest = computeNeutralPlanDigest(plan); plan.exclusionReview.planDigest = plan.planDigest; assert.equal(validateNeutralRangePlan(plan).ok, true); });
check("exclusion review digest drift blocks", () => { const plan = valid(); plan.sourceDelta = ["a.txt", "private.txt"]; plan.exclusions = [{ path: "private.txt", reason: "private operations" }]; plan.exclusionReview = { schema: "pipeline.neutral-exclusion-review.v1", planDigest: null, sourceEndpoint: plan.sourceCandidateCommit, publicEndpoint: plan.publicBaseCommit, excluded: plan.exclusions, reviewerRoute: "critic", assurance: "technical-isolation", candidateTree: plan.resultTree, verdict: "PASS", findings: [] }; plan.exclusionReviewDigest = h("9"); plan.planDigest = computeNeutralPlanDigest(plan); plan.exclusionReview.planDigest = plan.planDigest; assert.throws(() => validateNeutralRangePlan(plan), /review digest/); });
check("tree manifest enforced", () => { const plan = valid(); plan.resultManifest = []; plan.resultManifestDigest = neutralCanonicalDigest([]); plan.planDigest = computeNeutralPlanDigest(plan); assert.throws(() => validateNeutralRangePlan(plan), /tree manifest/); });
check("unsupported mode blocks", () => { const plan = valid(); plan.operations[0].newMode = "120000"; plan.planDigest = computeNeutralPlanDigest(plan); assert.throws(() => validateNeutralRangePlan(plan), /mode/); });
check("plumbing drift blocks", () => { const plan = valid(); plan.plumbing = { ...plan.plumbing, networkDisabled: false }; plan.planDigest = computeNeutralPlanDigest(plan); assert.throws(() => validateNeutralRangePlan(plan), /plumbing/); });
check("Gitleaks finding blocks", () => { const plan = valid(); plan.gitleaksFindings = [{ RuleID: "generic-api-key" }]; plan.planDigest = computeNeutralPlanDigest(plan); assert.throws(() => validateNeutralRangePlan(plan), /credential/); });
check("reviewed public URL hash is the only URL-host allowance", () => { const plan = valid(); plan.generatedPatch = "https://github.com/example/public\n"; plan.generatedPatchSha256 = rawHash(plan.generatedPatch); plan.allowances = [{ ruleId: "url-host", normalizedValueSha256: rawHash("https://github.com/example/public") }]; plan.planDigest = computeNeutralPlanDigest(plan); assert.equal(validateNeutralRangePlan(plan).ok, true); });
check("private URL cannot be allowlisted", () => { const plan = valid(); plan.generatedPatch = "http://127.0.0.1/private\n"; plan.generatedPatchSha256 = rawHash(plan.generatedPatch); plan.allowances = [{ ruleId: "url-host", normalizedValueSha256: rawHash("http://127.0.0.1/private") }]; plan.planDigest = computeNeutralPlanDigest(plan); assert.throws(() => validateNeutralRangePlan(plan), /url-host/); });
check("later private URL cannot hide behind an allowed public URL", () => { const plan = valid(); plan.generatedPatch = "https://github.com/example/public http://127.0.0.1/private\n"; plan.generatedPatchSha256 = rawHash(plan.generatedPatch); plan.allowances = [{ ruleId: "url-host", normalizedValueSha256: rawHash("https://github.com/example/public") }]; plan.planDigest = computeNeutralPlanDigest(plan); assert.throws(() => validateNeutralRangePlan(plan), /url-host/); });
check("path traversal blocks", () => { const plan = valid(); plan.sourceDelta = ["../a.txt"]; plan.operations[0].path = "../a.txt"; plan.resultManifest[0].path = "../a.txt"; plan.resultManifestDigest = neutralCanonicalDigest(plan.resultManifest); plan.planDigest = computeNeutralPlanDigest(plan); assert.throws(() => validateNeutralRangePlan(plan), /path/); });
check("correlation trailer detected", () => assert.equal(detectNeutralLeakage("Dispatch: hidden"), "correlation-trailer"));
check("link-local URL detected", () => assert.equal(detectNeutralLeakage("http://169.254.1.2/x"), "url-host"));

const gitEnv = (extra = {}) => ({
  PATH: process.env.PATH,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  LC_ALL: "C",
  ...extra,
});
function git(root, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    env: gitEnv(options.env),
    input: options.input,
    shell: false,
  });
  assert.equal(result.status, 0, `${args.join(" ")}: ${String(result.stderr)}`);
  return typeof result.stdout === "string" ? result.stdout.trim() : result.stdout;
}
function gitObjectId(type, bytes, format = "sha1") {
  return createHash(format).update(Buffer.from(`${type} ${bytes.length}\0`, "ascii")).update(bytes).digest("hex");
}
function flatTree(entries, format = "sha1") {
  const raw = Buffer.concat([...entries].sort(([left], [right]) => left.localeCompare(right)).map(([path, entry]) => Buffer.concat([
    Buffer.from(`${entry.mode} ${path}\0`, "utf8"),
    Buffer.from(entry.oid, "hex"),
  ])));
  return { raw, oid: gitObjectId("tree", raw, format) };
}
function neutralCommitBytes(tree, parent, epoch) {
  const identity = `${NEUTRAL_IDENTITY} ${epoch} +0000`;
  return Buffer.from([
    `tree ${tree}`,
    `parent ${parent}`,
    `author ${identity}`,
    `committer ${identity}`,
    "",
    NEUTRAL_MESSAGE,
  ].join("\n"), "utf8");
}
function realFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "neutral-range-plan-test-"));
  git(root, ["init", "--quiet", "--object-format=sha1"]);
  const baseContent = new Map([
    ["delete.txt", Buffer.from("delete me\n")],
    ["mode.txt", Buffer.from("same bytes\n")],
    ["modify.txt", Buffer.from("before\n")],
    ["old.txt", Buffer.from("rename bytes\n")],
    ["unchanged.txt", Buffer.from("unchanged\n")],
  ]);
  const baseModes = new Map([...baseContent.keys()].map((path) => [path, "100644"]));
  const baseTreeEntries = new Map();
  for (const [path, bytes] of baseContent) {
    const oid = git(root, ["hash-object", "-w", "--stdin"], { input: bytes });
    baseTreeEntries.set(path, { mode: baseModes.get(path), oid });
  }
  const baseIndexDirectory = mkdtempSync(join(tmpdir(), "neutral-range-base-index-"));
  const baseIndex = join(baseIndexDirectory, "index");
  git(root, ["read-tree", "--empty"], { env: { GIT_INDEX_FILE: baseIndex } });
  const baseIndexInfo = Buffer.from([...baseTreeEntries].map(([path, entry]) => `${entry.mode} ${entry.oid}\t${path}\0`).join(""), "utf8");
  git(root, ["update-index", "-z", "--index-info"], { env: { GIT_INDEX_FILE: baseIndex }, input: baseIndexInfo });
  const publicBaseTree = git(root, ["write-tree"], { env: { GIT_INDEX_FILE: baseIndex } });
  rmSync(baseIndexDirectory, { recursive: true, force: true });
  const baseIdentity = {
    GIT_AUTHOR_NAME: "Public Base", GIT_AUTHOR_EMAIL: "public-base@example.invalid", GIT_AUTHOR_DATE: "@100 +0000",
    GIT_COMMITTER_NAME: "Public Base", GIT_COMMITTER_EMAIL: "public-base@example.invalid", GIT_COMMITTER_DATE: "@100 +0000",
  };
  const publicBaseCommit = git(root, ["commit-tree", publicBaseTree], { env: baseIdentity, input: "base\n" });
  git(root, ["update-ref", "refs/heads/main", publicBaseCommit]);

  const changed = new Map([
    ["add.txt", Buffer.from(options.addContent ?? "added\n")],
    ["mode.txt", baseContent.get("mode.txt")],
    ["modify.txt", Buffer.from("after\n")],
    ["new.txt", baseContent.get("old.txt")],
  ]);
  const resultContent = new Map([
    ["add.txt", changed.get("add.txt")],
    ["mode.txt", changed.get("mode.txt")],
    ["modify.txt", changed.get("modify.txt")],
    ["new.txt", changed.get("new.txt")],
    ["unchanged.txt", baseContent.get("unchanged.txt")],
  ]);
  const resultModes = new Map([
    ["add.txt", "100644"], ["mode.txt", "100755"], ["modify.txt", "100644"],
    ["new.txt", "100644"], ["unchanged.txt", "100644"],
  ]);
  const resultEntries = new Map([...resultContent].map(([path, bytes]) => [path, {
    mode: resultModes.get(path), oid: gitObjectId("blob", bytes),
  }]));
  const resultTree = flatTree(resultEntries).oid;
  const resultCommit = gitObjectId("commit", neutralCommitBytes(resultTree, publicBaseCommit, 101));
  const manifest = (content, modes) => [...content].sort(([left], [right]) => left.localeCompare(right)).map(([path, bytes]) => ({
    path, mode: modes.get(path), rawSha256: rawHash(bytes),
  }));
  const publicBaseManifest = manifest(baseContent, baseModes);
  const resultManifest = manifest(resultContent, resultModes);
  const plan = {
    schema: "pipeline.neutral-range-plan.v1",
    sourceRepositoryFingerprint: h("1"), publicRepositoryFingerprint: h("2"),
    sourceBaseCommit: h("a", 40), sourceBaseTree: h("b", 40), sourceCandidateCommit: h("c", 40), sourceCandidateTree: h("d", 40),
    publicBaseCommit, publicBaseTree, publicBaseCommitterEpoch: 100,
    sourceDelta: ["add.txt", "delete.txt", "mode.txt", "modify.txt", "new.txt", "old.txt"],
    operations: [
      { operation: "add", path: "add.txt", newMode: "100644", sourceSha256: rawHash(changed.get("add.txt")), publicSha256: rawHash(changed.get("add.txt")) },
      { operation: "delete", path: "delete.txt", oldMode: "100644", oldPublicSha256: rawHash(baseContent.get("delete.txt")) },
      { operation: "modify", path: "mode.txt", oldMode: "100644", newMode: "100755", oldPublicSha256: rawHash(baseContent.get("mode.txt")), sourceSha256: rawHash(changed.get("mode.txt")), publicSha256: rawHash(changed.get("mode.txt")) },
      { operation: "modify", path: "modify.txt", oldMode: "100644", newMode: "100644", oldPublicSha256: rawHash(baseContent.get("modify.txt")), sourceSha256: rawHash(changed.get("modify.txt")), publicSha256: rawHash(changed.get("modify.txt")) },
      { operation: "rename", oldPath: "old.txt", newPath: "new.txt", oldMode: "100644", newMode: "100644", oldPublicSha256: rawHash(baseContent.get("old.txt")), sourceSha256: rawHash(changed.get("new.txt")), publicSha256: rawHash(changed.get("new.txt")) },
    ],
    exclusions: [], transformRecords: [], publicBaseManifest, resultManifest,
    resultManifestDigest: neutralCanonicalDigest(resultManifest), exclusionReview: null, exclusionReviewDigest: null,
    author: NEUTRAL_IDENTITY, committer: NEUTRAL_IDENTITY, authorTimestamp: 101, committerTimestamp: 101,
    message: NEUTRAL_MESSAGE, signed: false, commitCount: 1, parentCommits: [publicBaseCommit],
    plumbing: { commands: PLUMBING_COMMANDS, shell: false, privateIndex: true, clearedEnvironment: true, nullSystemConfig: true, nullGlobalConfig: true, hooksDisabled: true, filtersDisabled: true, signingDisabled: true, editorDisabled: true, pagerDisabled: true, credentialHelpersDisabled: true, remoteHelpersDisabled: true, networkDisabled: true },
    leakagePolicyDigest: neutralLeakagePolicyDigest(), machineDenySet: [], machineDenySetDigest: neutralCanonicalDigest([]), allowances: [], gitleaksFindings: [],
    generatedPatchSha256: rawHash("public candidate\n"), generatedPatch: "public candidate\n", resultCommit, resultTree, planDigest: null,
  };
  plan.planDigest = computeNeutralPlanDigest(plan);
  return { root, plan, changed };
}

check("real builder materializes the exact neutral commit without refs, checkout or caller config", () => {
  const fx = realFixture();
  const calls = [];
  const indexPaths = new Set();
  const marker = join(fx.root, "unexpected-side-effect");
  const executable = join(fx.root, "unexpected-command.sh");
  writeFileSync(executable, `#!/bin/sh\nprintf invoked >> '${marker}'\nexit 91\n`, { mode: 0o700 });
  chmodSync(executable, 0o700);
  const hookDirectory = join(fx.root, "hooks");
  mkdirSync(hookDirectory);
  const commitHook = join(hookDirectory, "commit-msg");
  writeFileSync(commitHook, `#!/bin/sh\nprintf hook >> '${marker}'\nexit 92\n`, { mode: 0o700 });
  chmodSync(commitHook, 0o700);
  git(fx.root, ["config", "core.hooksPath", hookDirectory]);
  git(fx.root, ["config", "filter.evil.clean", executable]);
  git(fx.root, ["config", "filter.evil.required", "true"]);
  git(fx.root, ["config", "commit.gpgSign", "true"]);
  git(fx.root, ["config", "gpg.program", executable]);
  git(fx.root, ["config", "core.editor", executable]);
  git(fx.root, ["config", "core.pager", executable]);
  git(fx.root, ["config", "credential.helper", executable]);
  git(fx.root, ["config", "remote.origin.url", "ssh://private.invalid/repository"]);
  writeFileSync(join(fx.root, ".gitattributes"), "* filter=evil\n");
  const maliciousConfig = join(fx.root, "malicious.gitconfig");
  writeFileSync(maliciousConfig, `[commit]\n\tgpgSign = true\n[core]\n\thooksPath = ${hookDirectory}\n`);
  const beforeRefs = git(fx.root, ["for-each-ref", "--format=%(refname) %(objectname)"]);
  const beforeStatus = git(fx.root, ["status", "--porcelain"]);
  const oldGlobal = process.env.GIT_CONFIG_GLOBAL;
  const oldSystem = process.env.GIT_CONFIG_SYSTEM;
  process.env.GIT_CONFIG_GLOBAL = maliciousConfig;
  process.env.GIT_CONFIG_SYSTEM = maliciousConfig;
  try {
    const outcome = buildNeutralRangeCommit({
      root: fx.root,
      plan: fx.plan,
      contentByPath: fx.changed,
      spawn(command, args, options) {
        calls.push({ command, args, options });
        if (options.env.GIT_INDEX_FILE) indexPaths.add(options.env.GIT_INDEX_FILE);
        return spawnSync(command, args, options);
      },
    });
    assert.deepEqual(outcome, {
      ok: true, code: "BTM-E2-BUILT", mutation: "objects", planDigest: fx.plan.planDigest,
      resultCommit: fx.plan.resultCommit, resultTree: fx.plan.resultTree,
    });
  } finally {
    if (oldGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = oldGlobal;
    if (oldSystem === undefined) delete process.env.GIT_CONFIG_SYSTEM; else process.env.GIT_CONFIG_SYSTEM = oldSystem;
  }
  assert.equal(existsSync(marker), false);
  assert.equal(git(fx.root, ["for-each-ref", "--format=%(refname) %(objectname)"]), beforeRefs);
  assert.equal(git(fx.root, ["status", "--porcelain"]), beforeStatus);
  assert.equal(git(fx.root, ["cat-file", "-p", fx.plan.resultCommit]), neutralCommitBytes(fx.plan.resultTree, fx.plan.publicBaseCommit, 101).toString("utf8").trim());
  assert.ok(indexPaths.size === 1 && [...indexPaths].every((path) => !existsSync(path) && !path.startsWith(join(fx.root, ".git"))));
  const allowed = new Set(["cat-file", "read-tree", "hash-object", "update-index", "write-tree", "commit-tree"]);
  for (const call of calls) {
    assert.equal(call.command, "git");
    assert.equal(call.options.shell, false);
    assert.equal(call.options.env.GIT_CONFIG_NOSYSTEM, "1");
    assert.equal(call.options.env.GIT_CONFIG_GLOBAL, "/dev/null");
    assert.equal(Object.hasOwn(call.options.env, "HOME"), false);
    assert.equal(Object.hasOwn(call.options.env, "GIT_CONFIG_SYSTEM"), false);
    const subcommand = call.args.find((argument) => allowed.has(argument));
    assert.ok(allowed.has(subcommand));
    assert.equal(call.args.some((argument) => new Set(["remote", "fetch", "push", "checkout", "add", "merge"]).has(argument)), false);
  }
  assert.equal(calls.filter((call) => call.args.includes("commit-tree")).length, 1);
  rmSync(fx.root, { recursive: true, force: true });
});

check("builder rejects an incomplete content packet before any Git process", () => {
  const fx = realFixture();
  let calls = 0;
  const changed = new Map(fx.changed);
  changed.delete("add.txt");
  const outcome = buildNeutralRangeCommit({ root: fx.root, plan: fx.plan, contentByPath: changed, spawn() { calls++; } });
  assert.equal(outcome.code, "BTM-E2-CONTENT-INVALID");
  assert.equal(outcome.mutation, "none");
  assert.equal(calls, 0);
  rmSync(fx.root, { recursive: true, force: true });
});

check("builder rejects changed bytes that disagree with the closed digest before Git", () => {
  const fx = realFixture();
  let calls = 0;
  const changed = new Map(fx.changed);
  changed.set("add.txt", Buffer.from("different\n"));
  const outcome = buildNeutralRangeCommit({ root: fx.root, plan: fx.plan, contentByPath: changed, spawn() { calls++; } });
  assert.equal(outcome.code, "BTM-E2-CONTENT-INVALID");
  assert.equal(calls, 0);
  rmSync(fx.root, { recursive: true, force: true });
});

check("builder scans actual changed bytes even when generated patch is benign", () => {
  const fx = realFixture({ addContent: "token=private-value\n" });
  let calls = 0;
  const outcome = buildNeutralRangeCommit({ root: fx.root, plan: fx.plan, contentByPath: fx.changed, spawn() { calls++; } });
  assert.equal(outcome.code, "BTM-E2-CONTENT-INVALID");
  assert.equal(calls, 0);
  rmSync(fx.root, { recursive: true, force: true });
});

check("builder fails closed when the declared result tree differs from plumbing output", () => {
  const fx = realFixture();
  fx.plan.resultTree = h("9", 40);
  fx.plan.resultCommit = h("8", 40);
  fx.plan.planDigest = computeNeutralPlanDigest(fx.plan);
  const outcome = buildNeutralRangeCommit({ root: fx.root, plan: fx.plan, contentByPath: fx.changed });
  assert.equal(outcome.code, "BTM-E2-TREE-MISMATCH");
  assert.equal(outcome.mutation, "objects");
  assert.equal(git(fx.root, ["for-each-ref", "--contains", fx.plan.publicBaseCommit, "--format=%(refname)"]), "refs/heads/main");
  rmSync(fx.root, { recursive: true, force: true });
});
check("builder fails closed when the declared result commit differs from exact neutral bytes", () => {
  const fx = realFixture();
  const beforeRefs = git(fx.root, ["for-each-ref", "--format=%(refname) %(objectname)"]);
  fx.plan.resultCommit = h("8", 40);
  fx.plan.planDigest = computeNeutralPlanDigest(fx.plan);
  const outcome = buildNeutralRangeCommit({ root: fx.root, plan: fx.plan, contentByPath: fx.changed });
  assert.equal(outcome.code, "BTM-E2-COMMIT-MISMATCH");
  assert.equal(outcome.mutation, "objects");
  assert.equal(git(fx.root, ["for-each-ref", "--format=%(refname) %(objectname)"]), beforeRefs);
  rmSync(fx.root, { recursive: true, force: true });
});
console.log(`neutral-range-plan: ${tests} tests passed`);
