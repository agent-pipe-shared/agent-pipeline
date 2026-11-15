// SPDX-License-Identifier: SUL-1.0
// C29e (ADR-0103): the Trivy adapter -- applicability without the binary, neutral offline invocation, fail-closed parsing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  CAPABILITY_CONTRACT_V2, TRIVY_NOT_APPLICABLE_REASON, extractTrivyFindings, inlineIgnores, isKubernetesManifestText, neutralTrivyEnv,
  run, trivyTriggerFiles, unexpectedErrorLines, unscannedTriggers,
} from "./trivy.mjs";

const FALLBACK = "2026-11-14T05:29:52+01:00\tERROR\t[misconfig] Falling back to embedded checks\terr=\"failed to check cache\"\n";
const INFO = "2026-11-14T05:29:52+01:00\tINFO\t[misconfig] Misconfiguration scanning is enabled\n";

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "trivy-adapter-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, ...rel.split("/").slice(0, -1)), { recursive: true });
    writeFileSync(join(root, ...rel.split("/")), text);
  }
  return root;
}

function report(results) {
  return JSON.stringify({ SchemaVersion: 2, Trivy: { Version: "0.76.2" }, ArtifactType: "filesystem", ...(results ? { Results: results } : {}) });
}

function stubSpawn({ scan, version = { status: 0, stdout: "Version: 0.76.2\n", stderr: "" } }) {
  const calls = [];
  const fn = (bin, args, options) => {
    calls.push({ bin, args, options });
    return args[0] === "--version" ? version : scan;
  };
  fn.calls = calls;
  return fn;
}

const DOCKERFILE_FAIL = { Target: "Dockerfile", Class: "config", Type: "dockerfile", Misconfigurations: [
  { ID: "DS-0002", Title: "Image user should not be 'root'", Severity: "HIGH", Status: "FAIL", CauseMetadata: {} },
  { ID: "DS-0026", Title: "No HEALTHCHECK defined", Severity: "LOW", Status: "FAIL", CauseMetadata: {} },
  { ID: "DS-0001", Title: "passing", Severity: "MEDIUM", Status: "PASS", CauseMetadata: {} },
] };

test("applicability: container, Terraform and Kubernetes trigger files are named without the binary", () => {
  const root = tree({
    "Dockerfile": "FROM alpine\n", "svc/Containerfile.prod": "FROM alpine\n", "build/app.dockerfile": "FROM alpine\n",
    "infra/net/main.tf": "resource \"x\" \"y\" {}\n",
    "k8s/svc.yaml": "apiVersion: v1\nkind: Service\nmetadata:\n  name: web\n",
    "k8s/multi.yml": "a: 1\n---\napiVersion: apps/v1\nkind: Deployment\n",
    "k8s/obj.json": "{\"apiVersion\":\"v1\",\"kind\":\"ConfigMap\"}",
    "kustomization.yaml": "apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\n",
    "chart/templates/deploy.yaml": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ .Release.Name }}\n",
    "config.yaml": "name: not a manifest\n", "package.json": "{\"name\":\"x\"}",
    ".git/Dockerfile": "FROM alpine\n",
  });
  try {
    assert.deepEqual(trivyTriggerFiles(root), {
      container: ["Dockerfile", "build/app.dockerfile", "svc/Containerfile.prod"],
      terraform: ["infra/net/main.tf"],
      kubernetes: ["k8s/multi.yml", "k8s/obj.json", "k8s/svc.yaml"],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(isKubernetesManifestText("x.yaml", "kind: Service\n"), false, "apiVersion is required");
  assert.equal(isKubernetesManifestText("x.json", "[1]"), false);
  // Measured on 0.76.2: Trivy reports no target for a List document, so it must not be a trigger (else every close ERRORs).
  assert.equal(isKubernetesManifestText("x.yaml", "apiVersion: v1\nkind: List\nitems: []\n"), false, "kind List is no trigger");
  assert.equal(isKubernetesManifestText("x.yaml", "apiVersion: v1\nkind: ConfigMapList\nitems: []\n"), false, "kind <X>List is no trigger");
  assert.equal(isKubernetesManifestText("x.json", "{\"apiVersion\":\"v1\",\"kind\":\"List\",\"items\":[]}"), false);
  assert.equal(isKubernetesManifestText("x.yaml", "apiVersion: v1\nkind: List\nitems: []\n---\napiVersion: v1\nkind: ConfigMap\n"), true, "a real document next to a List still triggers");
});

test("applicability at a Git top level counts tracked regular files only; a subdirectory of a repository is walked", () => {
  const root = tree({
    "Dockerfile": "FROM alpine\n",
    "k8s/svc.yaml": "apiVersion: v1\nkind: Service\n",
    "scratch/clone/Dockerfile": "FROM alpine\n",
    "build/main.tf": "resource \"x\" \"y\" {}\n",
  });
  const git = (...args) => {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  };
  try {
    git("init", "-q");
    writeFileSync(join(root, ".gitignore"), "build/\n");
    git("add", "--", ".gitignore", "Dockerfile", "k8s/svc.yaml");
    // An untracked clone and an ignored build folder are no part of the candidate.
    assert.deepEqual(trivyTriggerFiles(root), { container: ["Dockerfile"], terraform: [], kubernetes: ["k8s/svc.yaml"] });
    // Below the top level the tracked listing is not used: the root is walked as a plain directory.
    assert.deepEqual(trivyTriggerFiles(join(root, "scratch")), { container: ["clone/Dockerfile"], terraform: [], kubernetes: [] });
    // The walk stays reachable on its own (the archive snapshot is not a repository).
    assert.deepEqual(trivyTriggerFiles(root, { trackedFilesFn: null }).container, ["Dockerfile", "scratch/clone/Dockerfile"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no trigger file: SKIPPED as not applicable, no binary lookup and no spawn", async () => {
  const root = tree({ "README.md": "# x\n", "src/a.js": "1\n" });
  try {
    const spawn = stubSpawn({ scan: { status: 0, stdout: report([]), stderr: "" } });
    const result = await run({ rootDir: root, spawnFn: spawn, env: { PATH: "" } });
    assert.deepEqual({ status: result.status, classification: result.classification, reason: result.reason }, { status: "SKIPPED", classification: "success", reason: TRIVY_NOT_APPLICABLE_REASON });
    assert.equal(spawn.calls.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("trigger files but no binary: SKIPPED binary_missing", async () => {
  const root = tree({ "Dockerfile": "FROM alpine\n" });
  try {
    const result = await run({ rootDir: root, env: { PATH: "" } });
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.classification, "binary_missing");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invocation is offline and neutral: empty config and ignore file, private cwd, no TRIVY_* variable", async () => {
  const root = tree({ "Dockerfile": "FROM alpine\n# trivy:ignore:DS-0029\nRUN apk add curl\n" });
  try {
    const spawn = stubSpawn({ scan: { status: 0, stdout: report([DOCKERFILE_FAIL]), stderr: INFO + FALLBACK } });
    const result = await run({ rootDir: root, config: { binaryPath: "/bin/trivy" }, spawnFn: spawn, env: { PATH: "/bin", TRIVY_SEVERITY: "CRITICAL", trivy_quiet: "true" } });
    assert.equal(result.status, "FINDINGS");
    const scan = spawn.calls[1];
    assert.deepEqual(scan.args.slice(0, 7), ["config", "--format", "json", "--skip-check-update", "--cache-dir", scan.args[5], "--exit-code"]);
    for (const flag of ["--config", "--ignorefile", "--severity"]) assert.ok(scan.args.includes(flag), flag);
    assert.equal(scan.args.at(-1), root);
    assert.notEqual(scan.options.cwd, root, "never the candidate's own directory");
    assert.equal(Object.keys(scan.options.env).some((key) => key.toUpperCase().startsWith("TRIVY_") && key !== "TRIVY_NO_PROGRESS"), false);
    assert.equal(neutralTrivyEnv({ TRIVY_X: "1", A: "b" }).TRIVY_X, undefined);
    assert.deepEqual(result.inlineIgnores, [{ path: "Dockerfile", line: 2, rule: "DS-0029" }]);
    assert.equal(result.version, "0.76.2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findings: FAIL only, severity mapped, path is the target, line from CauseMetadata", () => {
  const findings = extractTrivyFindings([DOCKERFILE_FAIL, { Target: "infra/net/main.tf", Type: "terraform", Misconfigurations: [{ ID: "AWS-0107", Severity: "HIGH", Status: "FAIL", Title: "t", CauseMetadata: { StartLine: 6 } }, { ID: "X", Severity: "UNKNOWN", Status: "FAIL", CauseMetadata: {} }] }]);
  assert.deepEqual(findings.map((f) => `${f.rule}:${f.severity}:${f.path}:${f.line}`), ["DS-0002:high:Dockerfile:null", "DS-0026:low:Dockerfile:null", "AWS-0107:high:infra/net/main.tf:6", "X:medium:infra/net/main.tf:null"]);
});

test("fail closed: an error line other than the embedded-checks fallback is a scanner error", async () => {
  assert.deepEqual(unexpectedErrorLines(INFO + FALLBACK), []);
  const parseError = "2026-11-14T05:29:52+01:00\tERROR\t[terraform parser] Error parsing file\tmodule=\"root\" file_path=\"main.tf\" err=\"x\"\n";
  assert.deepEqual(unexpectedErrorLines(parseError), ["ERROR [terraform parser] main.tf: Error parsing file"]);
  const root = tree({ "main.tf": "resource \"a\" \"b\" {\n" });
  try {
    const spawn = stubSpawn({ scan: { status: 0, stdout: report([{ Target: ".", Type: "terraform", Class: "config" }]), stderr: FALLBACK + parseError } });
    const result = await run({ rootDir: root, config: { binaryPath: "/bin/trivy" }, spawnFn: spawn, env: {} });
    assert.equal(result.status, "ERROR");
    assert.match(result.reason, /error line/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fail closed: a trigger file Trivy did not report is a scanner error (a broken manifest is otherwise silent)", async () => {
  const triggers = { container: [], terraform: ["infra/a/main.tf", "root.tf"], kubernetes: ["k8s/bad.yaml", "k8s/ok.yaml"] };
  assert.deepEqual(unscannedTriggers(triggers, [{ Target: "k8s/ok.yaml" }, { Target: "infra/a", Type: "terraform" }, { Target: ".", Type: "terraform" }]), ["k8s/bad.yaml"]);
  const root = tree({ "k8s/bad.yaml": "apiVersion: v1\nkind: Service\n  bad: [\n" });
  try {
    const spawn = stubSpawn({ scan: { status: 0, stdout: report(undefined), stderr: FALLBACK } });
    const result = await run({ rootDir: root, config: { binaryPath: "/bin/trivy" }, spawnFn: spawn, env: {} });
    assert.equal(result.status, "ERROR");
    assert.match(result.reason, /trigger file not scanned by trivy: k8s\/bad\.yaml/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fail closed: nonzero exit, unparseable JSON, wrong schema version, a bad version probe", async () => {
  const root = tree({ "Dockerfile": "FROM alpine\n" });
  try {
    const cases = [
      [{ status: 2, stdout: "", stderr: "FATAL boom" }, /exited 2/u],
      [{ status: 0, stdout: "not json", stderr: "" }, /unparseable/u],
      [{ status: 0, stdout: JSON.stringify({ SchemaVersion: 1 }), stderr: "" }, /SchemaVersion 1/u],
      [{ status: 0, stdout: JSON.stringify({ SchemaVersion: 2, Results: {} }), stderr: "" }, /Results is not an array/u],
      [{ status: null, error: Object.assign(new Error("t"), { code: "ETIMEDOUT" }) }, /timed out/u],
    ];
    for (const [scan, pattern] of cases) {
      const result = await run({ rootDir: root, config: { binaryPath: "/bin/trivy" }, spawnFn: stubSpawn({ scan }), env: {} });
      assert.equal(result.status, "ERROR", String(pattern));
      assert.match(result.reason, pattern);
    }
    const noVersion = await run({ rootDir: root, config: { binaryPath: "/bin/trivy" }, spawnFn: stubSpawn({ scan: { status: 0, stdout: report([]), stderr: "" }, version: { status: 0, stdout: "dev build\n", stderr: "" } }), env: {} });
    assert.equal(noVersion.status, "ERROR");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inline ignores are listed per trigger file", () => {
  const root = tree({ "Dockerfile": "FROM a\n# trivy:ignore:DS-0002 trivy:ignore:DS-0026\n", "main.tf": "# trivy:ignore:AWS-0107\n" });
  try {
    assert.deepEqual(inlineIgnores(root, trivyTriggerFiles(root)), [
      { path: "Dockerfile", line: 2, rule: "DS-0002" }, { path: "Dockerfile", line: 2, rule: "DS-0026" }, { path: "main.tf", line: 1, rule: "AWS-0107" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("capability contract: cap.iac, offline", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.kind, "capability");
  assert.equal(CAPABILITY_CONTRACT_V2.capabilityId, "cap.iac");
  assert.equal(CAPABILITY_CONTRACT_V2.networkBehavior, "offline");
});

const realTrivy = spawnSync("trivy", ["--version"], { encoding: "utf8" });
test("real binary (skipped without trivy): a clean, a failing and a self-suppressing candidate", { skip: realTrivy.status !== 0 ? "trivy is not installed" : false }, async () => {
  const root = tree({
    "Dockerfile": "FROM ubuntu:22.04\nRUN apt-get install -y curl\n",
    "trivy.yaml": "severity:\n  - CRITICAL\nquiet: true\n",
    ".trivyignore": "DS-0002\n",
    "svc.yaml": "apiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  ports:\n    - port: 80\n",
  });
  const work = mkdtempSync(join(tmpdir(), "trivy-work-"));
  try {
    const result = await run({ rootDir: root, config: { binaryPath: "trivy", workParent: work }, env: process.env });
    assert.equal(result.status, "FINDINGS", result.reason);
    assert.ok(result.findings.some((f) => f.rule === "DS-0002" && f.severity === "high"), "the candidate's own trivy.yaml and .trivyignore are not read");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});
