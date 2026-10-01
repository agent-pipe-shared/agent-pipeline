// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyQualityPackage, authorizeQualityPackageCommit, qualityPackageIntentSha256, SIGNED_QUALITY_PACKAGE_SCHEMA, verifyQualityPackageCommitAuthorization } from "./signed-quality-package.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "signed-quality-package-"));
  git(root, ["init", "-q"]); git(root, ["config", "user.email", "test@example.invalid"]); git(root, ["config", "user.name", "Test"]);
  const keys = generateKeyPairSync("ed25519"); const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  writeFileSync(join(root, "subject.txt"), "before\n");
  mkdirSync(join(root, "project"));
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "test-key", publicKeySha256: sha(publicKey) }] }));
  git(root, ["add", "subject.txt", "project/critical-human-proof.json"]); git(root, ["commit", "-qm", "base"]);
  const record = { schema: SIGNED_QUALITY_PACKAGE_SCHEMA, baseCommit: git(root, ["rev-parse", "HEAD"]), unifiedDiff: "diff --git a/subject.txt b/subject.txt\nindex df967b9..3e75765 100644\n--- a/subject.txt\n+++ b/subject.txt\n@@ -1 +1 @@\n-before\n+after\n", expectedDigests: { "subject.txt": sha("after\n") } };
  record.intentSha256 = qualityPackageIntentSha256(record);
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: record.intentSha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(record.intentSha256), keys.privateKey).toString("base64") };
  return { root, record, proof, publicKey, privateKey: keys.privateKey, trustPolicy: { keyReference: "test-key", publicKeySha256: sha(publicKey) } };
}

function proofFor(record, item) {
  return { schema: "pipeline.po-approval-proof.v1", intentSha256: record.intentSha256, keyReference: "test-key", publicKey: item.publicKey, signatureBase64: sign(null, Buffer.from(record.intentSha256), item.privateKey).toString("base64") };
}

test("quality package requires matching human proof and only applies verified bytes", () => {
  const item = fixture();
  try {
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof, trustPolicy: item.trustPolicy }).code, "QUALITY-PACKAGE-VERIFIED");
    assert.equal(readFileSync(join(item.root, "subject.txt"), "utf8"), "before\n");
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof, trustPolicy: item.trustPolicy, applyToMain: true }).code, "QUALITY-PACKAGE-APPLIED");
    assert.equal(readFileSync(join(item.root, "subject.txt"), "utf8"), "after\n");
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("isolated readback includes new, mixed, and explicitly ignored added paths without writing to main", () => {
  for (const { mixed, ignored } of [
    { mixed: false, ignored: false },
    { mixed: true, ignored: false },
    { mixed: false, ignored: true },
  ]) {
    const item = fixture();
    try {
      if (ignored) {
        writeFileSync(join(item.root, ".gitignore"), "created.txt\n");
        git(item.root, ["add", ".gitignore"]);
        git(item.root, ["commit", "-qm", "ignore generated path"]);
      }
      writeFileSync(join(item.root, "created.txt"), "created\n");
      git(item.root, ignored ? ["add", "-f", "created.txt"] : ["add", "created.txt"]);
      const expectedDigests = { "created.txt": sha("created\n") };
      if (mixed) {
        writeFileSync(join(item.root, "subject.txt"), "after\n");
        git(item.root, ["add", "subject.txt"]);
        expectedDigests["subject.txt"] = sha("after\n");
      }
      const record = {
        schema: SIGNED_QUALITY_PACKAGE_SCHEMA,
        baseCommit: git(item.root, ["rev-parse", "HEAD"]),
        unifiedDiff: execFileSync("git", ["diff", "--cached", "--binary", "HEAD"], { cwd: item.root, encoding: "utf8" }),
        expectedDigests,
      };
      record.intentSha256 = qualityPackageIntentSha256(record);
      const proof = proofFor(record, item);
      git(item.root, ["restore", "--staged", "--source=HEAD", "--", "created.txt"]);
      if (mixed) git(item.root, ["restore", "--staged", "--source=HEAD", "--", "subject.txt"]);
      rmSync(join(item.root, "created.txt"));
      if (mixed) writeFileSync(join(item.root, "subject.txt"), "before\n");
      assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: record, proof, trustPolicy: item.trustPolicy }).code, "QUALITY-PACKAGE-VERIFIED");
      assert.equal(readFileSync(join(item.root, "subject.txt"), "utf8"), "before\n");
      const badDigestRecord = { ...record, expectedDigests: { ...record.expectedDigests, "created.txt": sha("wrong\n") } };
      badDigestRecord.intentSha256 = qualityPackageIntentSha256(badDigestRecord);
      assert.equal(applyQualityPackage({
        repoRoot: item.root, packageIntent: badDigestRecord,
        proof: proofFor(badDigestRecord, item), trustPolicy: item.trustPolicy,
      }).code, "QUALITY-PACKAGE-READBACK-MISMATCH");
    } finally { rmSync(item.root, { recursive: true, force: true }); }
  }
});

test("quality package commit authorization binds the whole staged index and committed trust policy", () => {
  const item = fixture();
  try {
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof, trustPolicy: item.trustPolicy, applyToMain: true }).ok, true);
    git(item.root, ["add", "subject.txt"]);
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).code, "QUALITY-PACKAGE-COMMIT-AUTHORIZED");
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).code, "QUALITY-PACKAGE-COMMIT-VERIFIED");
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).code, "QUALITY-PACKAGE-COMMIT-AUTHORIZED");
    const commonDir = git(item.root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const receiptPath = join(commonDir, "agent-pipeline", "signed-quality-packages", "commit-authorizations", `${item.record.intentSha256}.json`);
    writeFileSync(receiptPath, "{}\n", { mode: 0o600 });
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).ok, false);
    writeFileSync(join(item.root, "extra.txt"), "extra\n"); git(item.root, ["add", "extra.txt"]);
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).ok, false);
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("commit authorization accepts .github content and staged files above the child-process default buffer", () => {
  const item = fixture();
  try {
    mkdirSync(join(item.root, ".github", "workflows"), { recursive: true });
    const workflow = "name: verify\n";
    const large = `${"x".repeat(1_100_000)}\n`;
    writeFileSync(join(item.root, ".github", "workflows", "verify.yml"), workflow);
    writeFileSync(join(item.root, "large.txt"), large);
    git(item.root, ["add", ".github/workflows/verify.yml", "large.txt"]);
    const record = {
      schema: SIGNED_QUALITY_PACKAGE_SCHEMA,
      baseCommit: git(item.root, ["rev-parse", "HEAD"]),
      unifiedDiff: execFileSync("git", ["diff", "--cached", "--binary", "HEAD"], { cwd: item.root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
      expectedDigests: { ".github/workflows/verify.yml": sha(workflow), "large.txt": sha(large) },
    };
    record.intentSha256 = qualityPackageIntentSha256(record);
    const proof = proofFor(record, item);
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: record, proof }).code, "QUALITY-PACKAGE-COMMIT-AUTHORIZED");
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).code, "QUALITY-PACKAGE-COMMIT-VERIFIED");
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("quality package refuses symlinked package outputs and receipt-directory ancestors", () => {
  const item = fixture();
  const outside = mkdtempSync(join(tmpdir(), "signed-quality-package-outside-"));
  try {
    symlinkSync("subject.txt", join(item.root, "link.txt"));
    git(item.root, ["add", "link.txt"]);
    const record = { schema: SIGNED_QUALITY_PACKAGE_SCHEMA, baseCommit: git(item.root, ["rev-parse", "HEAD"]), unifiedDiff: execFileSync("git", ["diff", "--cached", "--binary", "HEAD"], { cwd: item.root, encoding: "utf8" }), expectedDigests: { "link.txt": sha("subject.txt") } };
    record.intentSha256 = qualityPackageIntentSha256(record);
    const proof = proofFor(record, item);
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: record, proof, trustPolicy: item.trustPolicy }).code, "QUALITY-PACKAGE-READBACK-MISMATCH");
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: record, proof }).code, "QUALITY-PACKAGE-COMMIT-INDEX-MISMATCH");
    git(item.root, ["restore", "--staged", "--source=HEAD", "--", "link.txt"]);
    writeFileSync(join(item.root, "subject.txt"), "after\n"); git(item.root, ["add", "subject.txt"]);
    symlinkSync(outside, join(item.root, ".git", "agent-pipeline"), "dir");
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).code, "QUALITY-PACKAGE-COMMIT-STORAGE-INVALID");
  } finally { rmSync(item.root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test("quality package fails closed on tamper, unsafe paths, proof failure, and base drift", () => {
  const item = fixture();
  try {
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: { ...item.record, unifiedDiff: item.record.unifiedDiff.replace("after", "other") }, proof: item.proof, trustPolicy: item.trustPolicy }).code, "QUALITY-PACKAGE-INVALID");
    const unsafe = { ...item.record, expectedDigests: { "../outside.txt": sha("after\n") } }; unsafe.intentSha256 = qualityPackageIntentSha256(unsafe);
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: unsafe, proof: item.proof, trustPolicy: item.trustPolicy }).code, "QUALITY-PACKAGE-INVALID");
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: { ...item.proof, signatureBase64: "AA==" }, trustPolicy: item.trustPolicy }).ok, false);
    writeFileSync(join(item.root, "drift.txt"), "x\n"); git(item.root, ["add", "drift.txt"]); git(item.root, ["commit", "-qm", "drift"]);
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof, trustPolicy: item.trustPolicy, applyToMain: true }).code, "QUALITY-PACKAGE-BASE-DRIFT");
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

import {spawnSync as agentSpawnSync} from "node:child_process";
import {linkSync as agentLinkSync} from "node:fs";
import {fileURLToPath as agentFileURLToPath} from "node:url";


function signedAgentInputs(item) {
  const inputDir=join(item.root,"scratch");mkdirSync(inputDir);
  writeFileSync(join(item.root,".gitignore"),"/scratch/\n");git(item.root,["add",".gitignore"]);git(item.root,["commit","-qm","fixture inputs"]);
  item.record.baseCommit=git(item.root,["rev-parse","HEAD"]);item.record.intentSha256=qualityPackageIntentSha256(item.record);item.proof=proofFor(item.record,item);
  const intent=join(inputDir,"intent.json"),proof=join(inputDir,"proof.json"),policy=join(item.root,"project/critical-human-proof.json");
  writeFileSync(intent,JSON.stringify(item.record));writeFileSync(proof,JSON.stringify(item.proof));
  return {intent,proof,policy};
}
function signedAgentCli(item,inputs,tail=["verify"],policy=inputs.policy,intent=inputs.intent,proof=inputs.proof) {
  return agentSpawnSync(process.execPath,[agentFileURLToPath(new URL("../scripts/quality-package-materializer.mjs",import.meta.url)),item.root,intent,proof,policy,...tail],{cwd:item.root,encoding:"utf8"});
}

test("SIGNED-AGENT CLI verifies, applies and authorizes with canonical committed trust",()=>{
  const item=fixture();try{
    const input=signedAgentInputs(item);
    assert.equal(signedAgentCli(item,input).status,0);
    assert.equal(readFileSync(join(item.root,"subject.txt"),"utf8"),"before\n");
    assert.equal(signedAgentCli(item,input,["apply"]).status,0);
    git(item.root,["add","subject.txt"]);
    assert.equal(signedAgentCli(item,input,["authorize-commit"]).status,0);
    writeFileSync(join(item.root,"extra.txt"),"extra\n");git(item.root,["add","extra.txt"]);
    assert.notEqual(signedAgentCli(item,input,["authorize-commit"]).status,0,"whole index");
  }finally{rmSync(item.root,{recursive:true,force:true});}
});

for(const kind of ["trailing","alternate-policy","intent-symlink","proof-symlink","intent-escape","oversized-proof","policy-symlink","policy-hardlink","worktree-drift","index-drift","untracked-policy","wrong-key","forged-proof","dirty-apply","base-drift"])test("SIGNED-AGENT rejects "+kind,()=>{
 const item=fixture();try{
  let input=signedAgentInputs(item), policy=input.policy,intent=input.intent,proof=input.proof,tail=["verify"];
  if(kind==="trailing")tail.push("extra");
  if(kind==="alternate-policy"){policy=join(item.root,"scratch/alternate.json");writeFileSync(policy,readFileSync(input.policy));}
  if(kind==="intent-symlink"||kind==="proof-symlink"){const link=join(item.root,"scratch/link.json");symlinkSync(kind==="intent-symlink"?intent:proof,link);if(kind==="intent-symlink")intent=link;else proof=link;}
  if(kind==="intent-escape")intent=item.root+"/scratch/../scratch/intent.json";
  if(kind==="oversized-proof")writeFileSync(proof,JSON.stringify(item.proof)+" ".repeat(32769));
  if(kind==="policy-symlink"){const target=join(item.root,"scratch/policy.json");writeFileSync(target,readFileSync(policy));rmSync(policy);symlinkSync(target,policy);}
  if(kind==="policy-hardlink")agentLinkSync(policy,join(item.root,"scratch/policy-link.json"));
  if(kind==="worktree-drift")writeFileSync(policy,readFileSync(policy,"utf8")+"\n");
  if(kind==="index-drift"){const bytes=readFileSync(policy);writeFileSync(policy,bytes.toString()+"\n");git(item.root,["add","project/critical-human-proof.json"]);writeFileSync(policy,bytes);}
  if(kind==="untracked-policy"){
    const bytes=readFileSync(policy);rmSync(policy);git(item.root,["add","project/critical-human-proof.json"]);git(item.root,["commit","-qm","fixture absent anchor"]);writeFileSync(policy,bytes);
    item.record.baseCommit=git(item.root,["rev-parse","HEAD"]);item.record.intentSha256=qualityPackageIntentSha256(item.record);item.proof=proofFor(item.record,item);writeFileSync(intent,JSON.stringify(item.record));writeFileSync(proof,JSON.stringify(item.proof));
  }
  if(kind==="wrong-key"){const keys=generateKeyPairSync("ed25519");item.proof.publicKey=keys.publicKey.export({type:"spki",format:"pem"});item.proof.signatureBase64=sign(null,Buffer.from(item.record.intentSha256),keys.privateKey).toString("base64");writeFileSync(proof,JSON.stringify(item.proof));}
  if(kind==="forged-proof"){item.proof.signatureBase64=Buffer.alloc(64).toString("base64");writeFileSync(proof,JSON.stringify(item.proof));}
  if(kind==="dirty-apply"){tail=["apply"];writeFileSync(join(item.root,"subject.txt"),"dirty\n");}
  if(kind==="base-drift"){tail=["apply"];git(item.root,["commit","--allow-empty","-qm","fixture drift"]);}
  const result=signedAgentCli(item,input,tail,policy,intent,proof);
  assert.notEqual(result.status,0,kind+": "+result.stdout+result.stderr);
 }finally{rmSync(item.root,{recursive:true,force:true});}
});

test("SIGNED-AGENT refuses policy self-mutation even with explicit external trust",()=>{
 const item=fixture();try{
  const policy="project/critical-human-proof.json",before=readFileSync(join(item.root,policy),"utf8"),after=before+"\n";
  writeFileSync(join(item.root,policy),after);
  const record={schema:SIGNED_QUALITY_PACKAGE_SCHEMA,baseCommit:item.record.baseCommit,unifiedDiff:execFileSync("git",["diff","--",policy],{cwd:item.root,encoding:"utf8"}),expectedDigests:{[policy]:sha(after)}};
  record.intentSha256=qualityPackageIntentSha256(record);writeFileSync(join(item.root,policy),before);
  assert.equal(applyQualityPackage({repoRoot:item.root,packageIntent:record,proof:proofFor(record,item),trustPolicy:item.trustPolicy}).ok,false);
 }finally{rmSync(item.root,{recursive:true,force:true});}
});

test("SIGNED-AGENT authorize refuses a planted untracked policy",()=>{
 const item=fixture();try{
  const policy=join(item.root,"project/critical-human-proof.json"),bytes=readFileSync(policy);
  rmSync(policy);git(item.root,["add","project/critical-human-proof.json"]);git(item.root,["commit","-qm","fixture absent anchor"]);writeFileSync(policy,bytes);
  item.record.baseCommit=git(item.root,["rev-parse","HEAD"]);item.record.intentSha256=qualityPackageIntentSha256(item.record);item.proof=proofFor(item.record,item);
  writeFileSync(join(item.root,"subject.txt"),"after\n");git(item.root,["add","subject.txt"]);
  assert.equal(authorizeQualityPackageCommit({repoRoot:item.root,packageIntent:item.record,proof:item.proof}).ok,false);
 }finally{rmSync(item.root,{recursive:true,force:true});}
});
