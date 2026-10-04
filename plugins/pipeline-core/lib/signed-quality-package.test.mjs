// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { applyQualityPackage, authorizeQualityPackageCommit, qualityPackageIntentSha256, SIGNED_QUALITY_PACKAGE_SCHEMA, verifyQualityPackageCommitAuthorization, verifyQualityPackageIntegrationPreCommit, verifyQualityPackageIntegrationPostCommit } from "./signed-quality-package.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const FIXTURE_TMP = fileURLToPath(new URL("../../tmp/", import.meta.url));
mkdirSync(FIXTURE_TMP, { recursive: true });

function fixture() {
  const root = mkdtempSync(join(FIXTURE_TMP, "signed-quality-package-"));
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
  const outside = mkdtempSync(join(FIXTURE_TMP, "signed-quality-package-outside-"));
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

function integrationReady(item) {
  assert.equal(applyQualityPackage({ repoRoot:item.root, packageIntent:item.record, proof:item.proof, trustPolicy:item.trustPolicy, applyToMain:true }).ok,true);
  git(item.root,["add","subject.txt"]);
  assert.equal(authorizeQualityPackageCommit({repoRoot:item.root,packageIntent:item.record,proof:item.proof}).ok,true);
  return { intentSha256:item.record.intentSha256, commonDir:git(item.root,["rev-parse","--path-format=absolute","--git-common-dir"]) };
}

test("integration precommit and postcommit verifiers bind the signed package to one exact parent and tree",()=>{
  const item=fixture();try{
    const auth=integrationReady(item);
    assert.equal(verifyQualityPackageIntegrationPreCommit({repoRoot:item.root,intentSha256:auth.intentSha256}).code,"QUALITY-PACKAGE-INTEGRATION-PRECOMMIT-VERIFIED");
    git(item.root,["commit","-qm","integration"]);
    const commit=git(item.root,["rev-parse","HEAD"]);
    assert.equal(verifyQualityPackageIntegrationPostCommit({repoRoot:item.root,commitSha:commit,intentSha256:auth.intentSha256}).code,"QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED");
  }finally{rmSync(item.root,{recursive:true,force:true});}
});

for(const kind of ["wrong-intent","forged-proof","missing-authorization","extra-staged","dropped-staged","content-drift","mode-drift","symlink-submodule","postcommit-extra","wrong-parent","merge-parent","unsafe-authorization"]){
  test("integration verifier rejects "+kind,()=>{
    const item=fixture();try{
      const auth=integrationReady(item);
      const authFile=join(auth.commonDir,"agent-pipeline","signed-quality-packages","commit-authorizations",`${auth.intentSha256}.json`);
      if(kind==="wrong-intent")assert.equal(verifyQualityPackageIntegrationPreCommit({repoRoot:item.root,intentSha256:"f".repeat(64)}).ok,false);
      if(kind==="forged-proof")writeFileSync(authFile,JSON.stringify({schema:"pipeline.signed-quality-package-commit-authorization.v1",packageIntent:item.record,proof:{...item.proof,signatureBase64:"AA=="}}),{mode:0o600});
      if(kind==="missing-authorization")rmSync(authFile);
      if(kind==="extra-staged"){writeFileSync(join(item.root,"extra.txt"),"extra\n");git(item.root,["add","extra.txt"]);}
      if(kind==="dropped-staged")git(item.root,["restore","--staged","--source=HEAD","--","subject.txt"]);
      if(kind==="content-drift"){writeFileSync(join(item.root,"subject.txt"),"drift\n");git(item.root,["add","subject.txt"]);}
      if(kind==="mode-drift"){git(item.root,["update-index","--chmod=+x","subject.txt"]);}
      if(kind==="symlink-submodule")git(item.root,["update-index","--add","--cacheinfo","160000,"+"a".repeat(40)+",subject.txt"]);
      if(kind==="unsafe-authorization"){rmSync(authFile);symlinkSync(join(item.root,"subject.txt"),authFile);}
      if(["wrong-parent","merge-parent","postcommit-extra"].includes(kind)){
        if(kind==="postcommit-extra"){writeFileSync(join(item.root,"extra.txt"),"extra\n");git(item.root,["add","extra.txt"]);}
        let commit;
        if(kind==="wrong-parent"){
          git(item.root,["restore","--staged","--source=HEAD","--","subject.txt"]);git(item.root,["commit","--allow-empty","-qm","advance parent"]);git(item.root,["add","subject.txt"]);git(item.root,["commit","-qm","wrong parent"]);commit=git(item.root,["rev-parse","HEAD"]);
        }else if(kind==="merge-parent"){
          const base=item.record.baseCommit;const tree=git(item.root,["write-tree"]);const other=git(item.root,["commit-tree",`${base}^{tree}`,"-p",base,"-m","other"]);
          commit=git(item.root,["commit-tree",tree,"-p",base,"-p",other,"-m","merge"]);
        }else{git(item.root,["commit","-qm","extra"]);commit=git(item.root,["rev-parse","HEAD"]);}
        assert.equal(verifyQualityPackageIntegrationPostCommit({repoRoot:item.root,commitSha:commit,intentSha256:auth.intentSha256}).ok,false);
      } else if(kind!=="wrong-intent")assert.equal(verifyQualityPackageIntegrationPreCommit({repoRoot:item.root,intentSha256:auth.intentSha256}).ok,false);
    }finally{rmSync(item.root,{recursive:true,force:true});}
  });
}

test("postcommit distinguishes an absent selected receipt from present invalid authorization",()=>{
 const item=fixture();try{
  const auth=integrationReady(item);git(item.root,["commit","-qm","integration"]);const commit=git(item.root,["rev-parse","HEAD"]);
  const expected=join(auth.commonDir,"agent-pipeline","signed-quality-packages","commit-authorizations");
  const authFile=join(expected,`${auth.intentSha256}.json`);
  rmSync(authFile);
  assert.equal(verifyQualityPackageIntegrationPostCommit({repoRoot:item.root,commitSha:commit,intentSha256:auth.intentSha256}).code,"QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-ABSENT");
  mkdirSync(expected,{recursive:true});writeFileSync(authFile,"{}\n",{mode:0o600});
  assert.equal(verifyQualityPackageIntegrationPostCommit({repoRoot:item.root,commitSha:commit,intentSha256:auth.intentSha256}).code,"QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
  rmSync(authFile);rmSync(join(auth.commonDir,"agent-pipeline"),{recursive:true,force:true});
  assert.equal(verifyQualityPackageIntegrationPostCommit({repoRoot:item.root,commitSha:commit,intentSha256:auth.intentSha256}).code,"QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-ABSENT");
  symlinkSync(item.root,join(auth.commonDir,"agent-pipeline"),"dir");
  assert.equal(verifyQualityPackageIntegrationPostCommit({repoRoot:item.root,commitSha:commit,intentSha256:auth.intentSha256}).code,"QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
 }finally{rmSync(item.root,{recursive:true,force:true});}
});

// ---------- Operator hotfix 11: the signed quality package route on native Windows ----------
// Defect (pre-hotfix): (a) `git rev-parse --show-toplevel` reports "D:/x/y" with forward slashes on Git for Windows and was compared with
// `!==` against the Node-resolved "D:\x\y", so a valid committed policy was refused on win32 (QUALITY-PACKAGE-COMMITTED-POLICY-INVALID);
// (b) the receipt checks required `(stat.mode & 0o077) === 0`, but win32 reports a fixed 0o666 mode, so every receipt the module wrote
// itself was refused. These cases pin the platform-parity behaviour; the fixtures set core.autocrlf=false so they do not depend on the
// host's line-ending configuration.
import { chmodSync, existsSync, lstatSync, rmSync as rmSyncHf11, unlinkSync, writeFileSync as writeFileSyncHf11 } from "node:fs";
import { dirname } from "node:path";
import { applyCommittedQualityPackage, gitReportedPathIsSamePhysicalPath, receiptModeBitsRefused } from "./signed-quality-package.mjs";

const HF11_ACCEPTED_BEFORE_COMMIT = { commitAuthorization: "QUALITY-PACKAGE-COMMIT-VERIFIED", preCommit: "QUALITY-PACKAGE-INTEGRATION-PRECOMMIT-VERIFIED" };
const HF11_REFUSED_RECEIPT = { commitAuthorization: "QUALITY-PACKAGE-COMMIT-ABSENT", preCommit: "QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID" };

function hf11Repo(label) {
  const root = mkdtempSync(join(FIXTURE_TMP, `hf11-${label}-`));
  git(root, ["init", "-q"]);
  for (const [key, value] of [["user.email", "test@example.invalid"], ["user.name", "Test"], ["core.autocrlf", "false"], ["commit.gpgsign", "false"]]) git(root, ["config", key, value]);
  const keys = generateKeyPairSync("ed25519"); const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  writeFileSync(join(root, "subject.txt"), "before\n");
  mkdirSync(join(root, "project"));
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "test-key", publicKeySha256: sha(publicKey) }] }));
  git(root, ["add", "subject.txt", "project/critical-human-proof.json"]); git(root, ["commit", "-qm", "base"]);
  const record = { schema: SIGNED_QUALITY_PACKAGE_SCHEMA, baseCommit: git(root, ["rev-parse", "HEAD"]), unifiedDiff: "diff --git a/subject.txt b/subject.txt\nindex df967b9..3e75765 100644\n--- a/subject.txt\n+++ b/subject.txt\n@@ -1 +1 @@\n-before\n+after\n", expectedDigests: { "subject.txt": sha("after\n") } };
  record.intentSha256 = qualityPackageIntentSha256(record);
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: record.intentSha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(record.intentSha256), keys.privateKey).toString("base64") };
  return { root, record, proof };
}

/** A repository with the package applied, staged and authorized (the state a commit hook sees); returns the receipt path. */
function hf11Authorized(label) {
  const item = hf11Repo(label);
  assert.equal(applyCommittedQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof, applyToMain: true }).code, "QUALITY-PACKAGE-APPLIED");
  git(item.root, ["add", "subject.txt"]);
  assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).code, "QUALITY-PACKAGE-COMMIT-AUTHORIZED");
  const commonDir = git(item.root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const receipt = join(commonDir, "agent-pipeline", "signed-quality-packages", "commit-authorizations", `${item.record.intentSha256}.json`);
  assert.equal(existsSync(receipt), true);
  return { ...item, receipt };
}

const hf11Verdicts = (item) => ({
  commitAuthorization: verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).code,
  preCommit: verifyQualityPackageIntegrationPreCommit({ repoRoot: item.root, intentSha256: item.record.intentSha256 }).code,
});

test("hotfix 11: receiptModeBitsRefused skips the POSIX mode-bit term on win32 only and fails closed on every platform that has mode bits", () => {
  for (const mode of [0o666, 0o644, 0o640, 0o604, 0o777, 0o600, 0o400, 0o060, 0o006, 0o100666]) assert.equal(receiptModeBitsRefused(mode, "win32"), false, `win32 ${mode.toString(8)}`);
  for (const platform of ["linux", "darwin", "freebsd"]) {
    for (const mode of [0o600, 0o400, 0o700, 0o100600]) assert.equal(receiptModeBitsRefused(mode, platform), false, `${platform} ${mode.toString(8)}`);
    for (const mode of [0o644, 0o640, 0o604, 0o660, 0o606, 0o666, 0o777, 0o060, 0o006, 0o100644]) assert.equal(receiptModeBitsRefused(mode, platform), true, `${platform} ${mode.toString(8)}`);
    for (const mode of [undefined, null, "600", Number.NaN, 1.5]) assert.equal(receiptModeBitsRefused(mode, platform), true, `${platform} non-integer ${String(mode)}`);
  }
  assert.equal(receiptModeBitsRefused(0o644), process.platform !== "win32", "the default platform is the running platform");
  assert.equal(receiptModeBitsRefused(0o600), false);
});

test("hotfix 11: gitReportedPathIsSamePhysicalPath accepts the spellings of one directory (Git's forward slashes on win32) and rejects any other", () => {
  const base = mkdtempSync(join(FIXTURE_TMP, "hf11-paths-"));
  try {
    const dirA = join(base, "Dir-A"); const dirB = join(base, "Dir-B");
    mkdirSync(dirA); mkdirSync(dirB);
    const same = gitReportedPathIsSamePhysicalPath;
    assert.equal(same(dirA, dirA), true);
    assert.equal(same(dirA.replaceAll("\\", "/"), dirA), true, "Git for Windows spelling (a no-op spelling change on POSIX)");
    assert.equal(same(`${dirA.replaceAll("\\", "/")}/`, dirA), true);
    assert.equal(same(dirB, dirA), false);
    assert.equal(same(base, dirA), false);
    assert.equal(same(dirname(dirA), dirA), false);
    assert.equal(same(join(dirA, "does-not-exist"), dirA), false);
    for (const bad of ["", "Dir-A", undefined, null]) assert.equal(same(bad, dirA), false, `unusable value ${String(bad)}`);
    const flipped = dirA.replace(/[A-Za-z]/gu, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
    assert.notEqual(flipped, dirA);
    assert.equal(same(flipped, dirA), process.platform === "win32", "a different-case spelling is the same directory on win32 only");
    const link = join(base, "link-to-a");
    let linked = true;
    try { symlinkSync(dirA, link, process.platform === "win32" ? "junction" : "dir"); } catch { linked = false; }
    if (linked) { assert.equal(same(link, dirA), true); assert.equal(same(link, dirB), false); }
  } finally { rmSyncHf11(base, { recursive: true, force: true }); }
});

test("hotfix 11: verify, apply, authorize-commit and the commit-time verifiers accept a correctly signed package end to end (native Windows included)", () => {
  const item = hf11Repo("e2e");
  try {
    const request = { repoRoot: item.root, packageIntent: item.record, proof: item.proof };
    assert.equal(applyCommittedQualityPackage(request).code, "QUALITY-PACKAGE-VERIFIED", "pre-hotfix win32: QUALITY-PACKAGE-COMMITTED-POLICY-INVALID");
    assert.equal(readFileSync(join(item.root, "subject.txt"), "utf8"), "before\n");
    assert.equal(applyCommittedQualityPackage({ ...request, applyToMain: true }).code, "QUALITY-PACKAGE-APPLIED");
    assert.equal(readFileSync(join(item.root, "subject.txt"), "utf8"), "after\n");
    git(item.root, ["add", "subject.txt"]);
    assert.equal(authorizeQualityPackageCommit(request).code, "QUALITY-PACKAGE-COMMIT-AUTHORIZED");
    assert.equal(authorizeQualityPackageCommit(request).code, "QUALITY-PACKAGE-COMMIT-AUTHORIZED", "a repeated authorize-commit re-reads the existing receipt");
    assert.deepEqual(hf11Verdicts(item), HF11_ACCEPTED_BEFORE_COMMIT);
    git(item.root, ["commit", "-qm", "integration"]);
    const commitSha = git(item.root, ["rev-parse", "HEAD"]);
    assert.equal(verifyQualityPackageIntegrationPostCommit({ repoRoot: item.root, commitSha, intentSha256: item.record.intentSha256 }).code, "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED");
  } finally { rmSyncHf11(item.root, { recursive: true, force: true }); }
});

test("hotfix 11: the path normalisation relaxes nothing (subdirectory root, forged proof, wrong key, dirty tree, tampered policy)", () => {
  const item = hf11Repo("neg");
  try {
    const request = { packageIntent: item.record, proof: item.proof };
    assert.equal(applyCommittedQualityPackage({ repoRoot: join(item.root, "project"), ...request }).code, "QUALITY-PACKAGE-COMMITTED-POLICY-INVALID", "a subdirectory is not the Git top level");
    const forged = { ...item.proof, signatureBase64: Buffer.alloc(64).toString("base64") };
    assert.equal(applyCommittedQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: forged }).ok, false);
    const stranger = generateKeyPairSync("ed25519");
    const wrongKey = { ...item.proof, publicKey: stranger.publicKey.export({ type: "spki", format: "pem" }), signatureBase64: sign(null, Buffer.from(item.record.intentSha256), stranger.privateKey).toString("base64") };
    assert.equal(applyCommittedQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: wrongKey }).ok, false);
    writeFileSyncHf11(join(item.root, "subject.txt"), "dirty\n");
    assert.equal(applyCommittedQualityPackage({ repoRoot: item.root, ...request, applyToMain: true }).code, "QUALITY-PACKAGE-BASE-DRIFT");
    writeFileSyncHf11(join(item.root, "subject.txt"), "before\n");
    const policyPath = join(item.root, "project", "critical-human-proof.json");
    const policyBytes = readFileSync(policyPath);
    writeFileSyncHf11(policyPath, `${policyBytes.toString("utf8")}\n`);
    assert.equal(applyCommittedQualityPackage({ repoRoot: item.root, ...request }).code, "QUALITY-PACKAGE-COMMITTED-POLICY-INVALID", "worktree policy bytes that differ from the committed blob");
    writeFileSyncHf11(policyPath, policyBytes);
    assert.equal(applyCommittedQualityPackage({ repoRoot: item.root, ...request }).code, "QUALITY-PACKAGE-VERIFIED", "positive control after restoring the policy");
  } finally { rmSyncHf11(item.root, { recursive: true, force: true }); }
});

test("hotfix 11: a receipt carrying group/other mode bits is accepted on win32 only (where the platform has no mode bits); a symlinked receipt is refused everywhere", (t) => {
  const item = hf11Authorized("mode");
  try {
    assert.deepEqual(hf11Verdicts(item), HF11_ACCEPTED_BEFORE_COMMIT, "positive control");
    chmodSync(item.receipt, 0o644); // POSIX: a real 0o644 receipt. win32: Node keeps reporting the fixed 0o666 mode.
    assert.notEqual(lstatSync(item.receipt).mode & 0o077, 0, "the receipt carries group/other bits");
    assert.deepEqual(hf11Verdicts(item), process.platform === "win32" ? HF11_ACCEPTED_BEFORE_COMMIT : HF11_REFUSED_RECEIPT);
    if (process.platform !== "win32") { chmodSync(item.receipt, 0o600); assert.deepEqual(hf11Verdicts(item), HF11_ACCEPTED_BEFORE_COMMIT, "0o600 is accepted again on POSIX"); }
    const copy = `${item.receipt}.copy`;
    writeFileSyncHf11(copy, readFileSync(item.receipt));
    unlinkSync(item.receipt);
    try { symlinkSync(copy, item.receipt, "file"); } catch (error) { t.skip(`file symlinks are not creatable on this host: ${error?.code ?? error}`); return; }
    assert.deepEqual(hf11Verdicts(item), HF11_REFUSED_RECEIPT, "the mode-term skip on win32 does not admit a symlinked receipt");
  } finally { rmSyncHf11(item.root, { recursive: true, force: true }); }
});
