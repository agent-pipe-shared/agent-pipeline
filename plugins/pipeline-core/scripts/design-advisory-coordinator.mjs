#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Versioned five-source initial-design Advisor entry for productive runners.
 * Codex uses its managed actual host store. Claude/Agy honestly record that
 * the initial answer/proposal provenance capability is unavailable before
 * any child or export. Historical native/consult transport remains available
 * through explicit --legacy-v1 diagnostics and retains its actual version.
 */
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import {randomUUID} from 'node:crypto';
import {coordinateInitialDesignAdvisory} from '../lib/design-advisory-coordinator-v2.mjs';
import {createNativeInitialAdvisorExecution} from '../lib/native-initial-advisor-execution.mjs';
import {observeAdvisorCandidate} from '../lib/design-advisor-provenance.mjs';
import {designAdvisorValueSha256} from '../lib/design-advisor-course.mjs';
import {loadRunnerProfilesV3Registry} from '../lib/runner-profiles-v3.mjs';
import {requireProjectOnboardingReady} from '../lib/project-onboarding-ready-gate.mjs';
import {parseCodexDesignAdvisorArgs,runCodexDesignAdvisorBootstrap,exportCodexDesignAdvisorArtifacts} from './codex-design-advisor-bootstrap.mjs';

import { coordinateLegacyDesignAdvisory } from "../lib/design-advisory-coordinator.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { runAdvisoryHostBridge } from "./advisory-host-bridge.mjs";

const PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]+$/u;
const USAGE = "historical diagnostics: design-advisory-coordinator.mjs --legacy-v1 --repo-root <path> --runner <claude|codex|antigravity> --feature <id> --plan <repo-path> --spec <repo-path> --decision <accept|decline> --rationale-file <repo-path>; productive entry requires --feature-id, --authoring-dispatch-id, --profile, --expected-commit, --expected-tree, five --input/--prd/--spec/--design/--traceability path:sha256 references and --output-prefix";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || Object.hasOwn(values, key)) fail("DAC-CLI-USAGE", USAGE);
    values[key] = value;
  }
  const required = ["--repo-root", "--runner", "--feature", "--plan", "--spec", "--decision", "--rationale-file"];
  if (required.some((key) => !Object.hasOwn(values, key)) || Object.keys(values).some((key) => !required.includes(key))) fail("DAC-CLI-USAGE", USAGE);
  if (!["claude", "codex", "antigravity"].includes(values["--runner"]) || !["accept", "decline"].includes(values["--decision"]) || !PATH.test(values["--rationale-file"])) fail("DAC-CLI-USAGE", USAGE);
  return values;
}
function rationale(root, path) {
  const target = resolve(root, path);
  if (!target.startsWith(`${root}/`)) fail("DAC-CLI-RATIONALE", "rationale path escapes repository root");
  const value = readFileSync(target, "utf8");
  if (value.trim().length === 0 || value.length > 16 * 1024) fail("DAC-CLI-RATIONALE", "rationale is empty or oversized");
  return value;
}

export async function runDesignAdvisoryCoordinator(argv = process.argv.slice(2), dependencies = {}) {
  if(!argv.includes('--legacy-v1'))return runInitialCoordinator(argv);
  // Explicit historical diagnostics preserve their actual v1 contract. They
  // cannot supply initial-five-source provenance to the productive v2 reader.
  argv=argv.filter(value=>value!=='--legacy-v1');
  const values = parse(argv);
  const root = resolve(values["--repo-root"]);
  return coordinateLegacyDesignAdvisory({
    repoRoot: root,
    runtime: { runner: values["--runner"], profile: "feature" },
    featureId: values["--feature"],
    planPath: values["--plan"],
    specPath: values["--spec"],
    disposition: { decision: values["--decision"], rationale: rationale(root, values["--rationale-file"]) },
    invokeBridge: dependencies.invokeBridge ?? (({ inputPath, receiptPath }) => runAdvisoryHostBridge(
      ["--input", inputPath, "--receipt", receiptPath],
      { ...(dependencies.bridgeDependencies ?? {}), repoRoot: root },
    )),
  });
}

async function runInitialCoordinator(argv){
 const index=argv.indexOf('--runner'),runner=argv[index+1];
 if(index<0||!['claude','codex','antigravity'].includes(runner)||argv.lastIndexOf('--runner')!==index)throw Error('DAC-CLI-RUNNER');
 const initialArgs=[...argv.slice(0,index),...argv.slice(index+2)];
 if(runner==='codex')return runCodexDesignAdvisorBootstrap(initialArgs);
 const args=parseCodexDesignAdvisorArgs(initialArgs),root=realpathSync(args['repo-root']);
 if(root!==resolve(args['repo-root']))throw Error('DAC-CLI-PHYSICAL-ROOT');
 requireProjectOnboardingReady({rootDir:root,intent:'dispatch',runner});
 const candidate=observeAdvisorCandidate(root);
 if(candidate.commit!==args['expected-commit']||candidate.tree!==args['expected-tree'])throw Error('DAC-CLI-CANDIDATE-DRIFT');
 const route={model:null,effort:null,sourceSha256:designAdvisorValueSha256(loadRunnerProfilesV3Registry()),candidateCommit:candidate.commit};
 if(args.inspect)return {ok:true,status:'native-initial-answer-provenance-unavailable',candidate,route,childStarted:false,inputSubmitted:false,implementationAuthority:false};
 const dispatch={dispatchId:'advisor_'+randomUUID(),queueRevision:0,candidateCommit:candidate.commit,candidateTree:candidate.tree};
 const result=await coordinateInitialDesignAdvisory({repoRoot:root,runner,featureId:args['feature-id'],authoringDispatchId:args['authoring-dispatch-id'],sources:args.sources,reason:'risk-review',profile:args.profile,dispatch,route,hostExecution:createNativeInitialAdvisorExecution({runner})});
 if(result.status!=='unavailable-pending-final-approval')return result;
 return {ok:false,status:result.status,code:result.code,runner,profile:args.profile,route,courseBinding:result.courseBinding,hostReceipt:null,artifacts:exportCodexDesignAdvisorArtifacts(root,args['output-prefix'],result),implementationAuthority:false};
}

if (isDirectInvocation(import.meta.url)) {
  runDesignAdvisoryCoordinator().then(
    (result) => { process.stdout.write(`${JSON.stringify(result)}\n`); if (!result.ok && result.status !== "admitted") process.exitCode = 2; },
    (error) => { process.stderr.write(`DESIGN-ADVISORY-COORDINATOR-FAILED: ${error.code ?? "error"}: ${error.message}\n`); process.exitCode = 2; },
  );
}
