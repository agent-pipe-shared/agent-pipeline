// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./lib/test-case-completion.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as installer from "./install-agy.mjs";
import { observeRunnerPublicCoreIdentity } from "./lib/public-core-observation.mjs";
import { observeAntigravityPluginTopology } from "./lib/antigravity-plugin-topology.mjs";
import { writeLocalDevelopmentInstalledPluginReceipt } from "./scripts/installed-plugin-attestation-host.mjs";

const cases = [];
// Keep the original case callbacks and observed platform skip, and register all
// siblings through the official recorder before any callback executes.
function test(name, options, callback) {
  const run = typeof options === "function" ? options : callback;
  const mode = typeof options === "object" && options.skip ? "skip" : "run";
  cases.push({ id: `AGYIC${String(cases.length + 1).padStart(3, "0")}`, name, mode, run });
}

function fixture(t) {
  const scratch = resolve("scratch");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "agy-inline-candidate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const main = join(root, "main");
  const candidate = join(root, "candidate");
  const selected = join(main, "plugins", "pipeline-core");
  const candidatePlugin = join(candidate, "plugins", "pipeline-core");
  const configRoot = join(root, "host");
  const workspaceRoot = join(root, "consumer");
  const receiptDirectory = join(configRoot, "receipts");
  mkdirSync(join(selected, "hooks"), { recursive: true });
  mkdirSync(join(selected, "skills", "critic-review"), { recursive: true });
  mkdirSync(join(configRoot, "config", "plugins"), { recursive: true });
  mkdirSync(receiptDirectory);
  mkdirSync(workspaceRoot);
  writeFileSync(join(selected, "plugin.json"), '{"name":"agent-pipeline-core","version":"0.7.0","description":"Independent installer fixture"}\n');
  writeFileSync(join(selected, "hooks.json"), '{"pipeline-core":{"PreInvocation":[{"type":"command","command":"node hooks/antigravity-start-hint.mjs"}]}}\n');
  for (const path of ["hooks/antigravity-pretool-guard.mjs", "hooks/antigravity-start-hint.mjs", "skills/critic-review/SKILL.md"]) {
    writeFileSync(join(selected, path), "// fixture baseline\n");
  }
  const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = (repo) => {
    git(repo, ["add", "plugins/pipeline-core"]);
    git(repo, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"]);
  };
  git(main, ["init", "--initial-branch", "main"]);
  git(main, ["remote", "add", "origin", "https://example.invalid/synthetic-pipeline.git"]);
  commit(main);
  git(main, ["worktree", "add", "-b", "installer-candidate", candidate]);
  const changedFile = "hooks/antigravity-pretool-guard.mjs";
  writeFileSync(join(candidatePlugin, changedFile), "// fixture approved candidate\n");
  commit(candidate);
  // Main remains the user-selected installation path. Its uncommitted bytes
  // match the clean candidate, so Main's own Git identity cannot attest it.
  writeFileSync(join(selected, changedFile), readFileSync(join(candidatePlugin, changedFile)));
  assert.notEqual(git(main, ["status", "--porcelain=v1", "--", "plugins/pipeline-core"]), "");
  assert.equal(git(candidate, ["status", "--porcelain=v1", "--", "plugins/pipeline-core"]), "");
  return { root, main, candidate, selected, candidatePlugin, configRoot, workspaceRoot, receiptDirectory, changedFile, git, commit };
}

function hostFiles(root) {
  const entries = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) { entries.push([relative(root, path), "directory"]); visit(path); }
      else entries.push([relative(root, path), readFileSync(path).toString("base64")]);
    }
  };
  visit(root);
  return entries;
}

function resolveSelected(f) {
  assert.equal(typeof installer.resolveAntigravityInstallerAttestationSource, "function", "the installer must own inline clean-candidate discovery");
  return installer.resolveAntigravityInstallerAttestationSource({ sourcePluginRoot: f.selected });
}

test("Agy Main selection discovers a genuine clean matching candidate without changing the approved install root", (t) => {
  const f = fixture(t);
  const selected = installer.selectPluginSource({ answer: "1", scriptDir: f.selected });
  assert.equal(selected.pluginRoot, f.selected);
  const direct = observeRunnerPublicCoreIdentity("antigravity", { sourcePluginRoot: f.selected, installedPluginRoot: f.selected });
  assert.deepEqual(direct.reasonCodes, ["SNT-A2-SOURCE-DIRTY"], "this fixture reproduces the original Main-source refusal");
  const resolved = resolveSelected(f);
  assert.equal(resolved.status, "attestable-source", JSON.stringify(resolved));
  assert.equal(resolved.attestationSourceRoot, f.candidatePlugin);
  assert.equal(resolved.candidate.commit, f.git(f.candidate, ["rev-parse", "HEAD"]));
  assert.equal(resolved.candidate.branch, "installer-candidate");
  assert.equal(installer.verifyAntigravityInstallerSource({ configRoot: f.configRoot, workspaceRoot: f.workspaceRoot, sourcePluginRoot: selected.pluginRoot, attestationSourceRoot: resolved.attestationSourceRoot, scope: "global" }).status, "attestable-source");
});

test("Agy inline candidate refresh installs selected Main bytes and writes a genuinely verified candidate receipt", (t) => {
  const f = fixture(t);
  const resolved = resolveSelected(f);
  assert.equal(resolved.status, "attestable-source", JSON.stringify(resolved));
  const managed = join(f.configRoot, "config", "plugins", "agent-pipeline-core");
  const cliCalls = [];
  const receiptInputs = [];
  const result = installer.refreshAntigravityInstallation({ configRoot: f.configRoot, workspaceRoot: f.workspaceRoot, approvedSourceRoot: f.selected, attestationSourceRoot: resolved.attestationSourceRoot, scope: "global", globalChangeApproved: true }, {
    runCli(argv) {
      cliCalls.push([...argv]);
      if (argv[0] === "--version") return { status: "ok", version: "1.2.12" };
      assert.equal(argv[0], "plugin");
      assert.ok(["validate", "install"].includes(argv[1]));
      assert.equal(argv[2], f.selected, "the candidate supplies provenance; the user's Main root supplies installation bytes");
      if (argv[1] === "install") {
        cpSync(f.selected, managed, { recursive: true });
        writeFileSync(join(f.configRoot, "config", "import_manifest.json"), '{"imports":[{"name":"agent-pipeline-core"}]}\n');
      } else assert.equal(argv[1], "validate");
      return { status: "ok" };
    },
    writeInstalledReceipt(input) {
      receiptInputs.push(input);
      return writeLocalDevelopmentInstalledPluginReceipt(input, { receiptDirectory: f.receiptDirectory });
    },
  });
  assert.equal(result.status, "refreshed", JSON.stringify(result));
  assert.equal(cliCalls.filter((argv) => argv[1] === "install").length, 1);
  assert.equal(receiptInputs.length, 1);
  assert.equal(receiptInputs[0].sourcePluginRoot, f.candidatePlugin);
  assert.equal(receiptInputs[0].installedPluginRoot, managed);
  assert.equal(observeRunnerPublicCoreIdentity("antigravity", { sourcePluginRoot: f.candidatePlugin, installedPluginRoot: managed }).status, "ready");
  assert.equal(observeAntigravityPluginTopology({ configRoot: f.configRoot, workspaceRoot: f.workspaceRoot, approvedSourceRoot: f.selected }).registries.global.entries[0].root, f.selected);
  const receipts = readdirSync(f.receiptDirectory).filter((name) => name.endsWith(".json") && !name.endsWith(".source.json"));
  assert.equal(receipts.length, 1);
  assert.equal(JSON.parse(readFileSync(join(f.receiptDirectory, receipts[0]), "utf8")).source.commit, resolved.candidate.commit);
  assert.equal(existsSync(join(f.workspaceRoot, ".git")), false);
});

test("Agy selected hardlinked files report the physical alias before candidate discovery or host writes", (t) => {
  const f = fixture(t);
  linkSync(join(f.selected, f.changedFile), join(f.root, "selected-file-alias"));
  assert.equal(lstatSync(join(f.selected, f.changedFile)).nlink, 2);
  const before = hostFiles(f.configRoot);
  const resolved = resolveSelected(f);
  assert.equal(resolved.status, "rejected");
  assert.equal(resolved.reason, "ATR-SOURCE-PHYSICAL-UNAVAILABLE");
  assert.deepEqual(resolved.reasonCodes, ["SNT-A2-PLUGIN-NONREGULAR"]);
  const checked = installer.verifyAntigravityInstallerSource({ configRoot: f.configRoot, workspaceRoot: f.workspaceRoot, sourcePluginRoot: f.selected, attestationSourceRoot: f.candidatePlugin, scope: "global" });
  assert.equal(checked.reason, "ATR-SOURCE-PHYSICAL-UNAVAILABLE");
  assert.deepEqual(checked.reasonCodes, ["SNT-A2-PLUGIN-NONREGULAR"]);
  const result = installer.refreshAntigravityInstallation({ configRoot: f.configRoot, workspaceRoot: f.workspaceRoot, approvedSourceRoot: f.selected, attestationSourceRoot: f.candidatePlugin, scope: "global", globalChangeApproved: true }, {
    runCli() { assert.fail("aliased selected source must refuse before any CLI call"); },
    writeInstalledReceipt() { assert.fail("aliased selected source must refuse before receipt publication"); },
  });
  assert.equal(result.status, "refused");
  assert.equal(result.reason, "ATR-SOURCE-PHYSICAL-UNAVAILABLE");
  assert.deepEqual(hostFiles(f.configRoot), before);
});

for (const [kind, expectedCode, invalidate] of [
  ["stale committed content", "SNT-A2-CONTENT-MISMATCH", (f) => { writeFileSync(join(f.candidatePlugin, f.changedFile), "// stale candidate\n"); f.commit(f.candidate); }],
  ["mismatched manifest", "SNT-A2-MANIFEST-MISMATCH", (f) => { const path = join(f.candidatePlugin, "plugin.json"); const value = JSON.parse(readFileSync(path, "utf8")); value.version = "0.7.1"; writeFileSync(path, JSON.stringify(value) + "\n"); f.commit(f.candidate); }],
  ["dirty candidate", "SNT-A2-SOURCE-DIRTY", (f) => writeFileSync(join(f.candidatePlugin, f.changedFile), "// dirty candidate\n")],
  ["unknown missing origin", "SNT-A2-GIT-ORIGIN-MISSING", (f) => f.git(f.candidate, ["remote", "remove", "origin"])],
  ["invalid origin", "SNT-A2-GIT-ORIGIN-INVALID", (f) => f.git(f.candidate, ["remote", "set-url", "origin", "file:///unapproved/source"])],
  ["detached candidate", "SNT-A2-GIT-DETACHED", (f) => f.git(f.candidate, ["checkout", "--detach"])],
]) {
  test(`Agy ${kind} refuses before CLI, receipt publication or managed writes`, (t) => {
    const f = fixture(t);
    invalidate(f);
    const beforeHost = hostFiles(f.configRoot);
    const beforeConsumer = hostFiles(f.workspaceRoot);
    const resolved = resolveSelected(f);
    assert.equal(resolved.status, "rejected", JSON.stringify(resolved));
    assert.equal(resolved.reason, "ATR-SOURCE-CANDIDATE-UNAVAILABLE");
    assert.ok(resolved.reasonCodes.includes(expectedCode), JSON.stringify(resolved));
    const result = installer.refreshAntigravityInstallation({ configRoot: f.configRoot, workspaceRoot: f.workspaceRoot, approvedSourceRoot: f.selected, attestationSourceRoot: f.candidatePlugin, scope: "global", globalChangeApproved: true }, {
      runCli() { assert.fail(`${kind}: no CLI invocation is authorized by an invalid candidate`); },
      writeInstalledReceipt() { assert.fail(`${kind}: no receipt publication is authorized by an invalid candidate`); },
    });
    assert.equal(result.status, "refused", JSON.stringify(result));
    assert.equal(result.reason, "ATR-SOURCE-ATTESTATION-UNAVAILABLE");
    assert.deepEqual(result.completed, []);
    assert.deepEqual(hostFiles(f.configRoot), beforeHost);
    assert.deepEqual(hostFiles(f.workspaceRoot), beforeConsumer);
  });
}

test("Agy clean byte-matching candidate with different file mode does not supply provenance", { skip: process.platform === "win32" && "POSIX executable mode fixture" }, (t) => {
  const f = fixture(t);
  chmodSync(join(f.selected, f.changedFile), 0o755);
  const before = hostFiles(f.configRoot);
  const resolved = resolveSelected(f);
  assert.equal(resolved.status, "rejected", JSON.stringify(resolved));
  assert.ok(resolved.reasonCodes.includes("ATR-SOURCE-CANDIDATE-MODE-MISMATCH"), JSON.stringify(resolved));
  assert.deepEqual(hostFiles(f.configRoot), before);
});

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 8192 });
