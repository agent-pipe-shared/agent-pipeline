// Original OSV001–008, prospective executable callbacks. The supplied factory is
// ONLY the genuine approved-course fixture constructor selected and pinned by
// Root. It is not a Source backend and cannot issue a brand or bypass a check.
// Constructor/setup failures remain failures, never negative-control success.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as LibrarySource from '../lib/owned-continuity-verification.mjs';
import * as OnboardingSource from '../lib/onboarding-continuity.mjs';
import * as RegistrySource from '../lib/session-authority-registry.mjs';
import {createTestCaseCompletionRecorder} from '../lib/test-case-completion.mjs';
import {createHash} from 'node:crypto';
import {createSuiteSourceControl} from './osv-suite-source-controls.mjs';
import {assertActualGuardRefusal} from './osv-guard-refusal-controls.mjs';
import {captureOwnedPhysicalFiles, assertOwnedPhysicalConservation, readOwnedPhysicalFile, changeActualOwnedFileBytes} from './osv-owned-file-controls.mjs';
import {createRealLifetimeSuiteSource, assertActualDeadlineRefusal, disposeActualOwnerAfterOwnedSuiteProgress, assertActualLostOwnerRefusal} from './osv-deadline-disconnect-controls.mjs';

const NEW_LIBRARY = 'plugins/pipeline-core/lib/owned-continuity-verification.mjs';
const NEW_LIBRARY_SHA = '19bf2884f900ab66a1b51b2d153e6d0dba62bfcf8f879e98dbc737f1a34b0055';
const I03 = 'plugins/pipeline-core/lib/onboarding-continuity.mjs';
const I03_SHA = 'cd4f6f335d18fc6b0b53d93687347eca91867aac77d9a423762d7f58cf610bfb';
const SCHEMA = 'pipeline.verify-case-completion-policy.v1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const OSV_CODES = new Set(['OSV-OWNER-UNAVAILABLE','OSV-COURSE-UNAVAILABLE','OSV-ASSOCIATION-UNAVAILABLE','OSV-INPUT-DRIFT','OSV-EXCHANGE-UNAVAILABLE','OSV-REPLAY','OSV-EXPIRED','OSV-VERIFY-FAILED','OSV-TERMINAL-UNAVAILABLE']);

function registrations(id, kinds, selectedVariant) {
  return kinds.map((kind,index) => ({name: `${id.toLowerCase()}-${index===0?selectedVariant:kind}`, file: `scratch/osv-independent/${id.toLowerCase()}/${index===0?selectedVariant:kind}.mjs`, caseCompletion: {schema: SCHEMA, caseIds: kind === 'incomplete' ? ['OSVF001','OSVF002'] : ['OSVF001'], maxBytes: 65536}}));
}
async function sourceImport(f, relative, expected) {
  const file = path.join(f.graphRoot, relative);
  const stat = fs.lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.nlink, 1);
  assert.equal(fs.realpathSync(file), file);
  if (expected !== undefined) assert.equal(sha(fs.readFileSync(file)), expected, 'Bind actual selected Source before product evaluation');
  const modules = {[NEW_LIBRARY]:LibrarySource,[I03]:OnboardingSource,'plugins/pipeline-core/lib/session-authority-registry.mjs':RegistrySource};
  assert.ok(Object.hasOwn(modules,relative),'Only the fixed already authenticated Source modules are inspected');
  return modules[relative];
}
function refusal(actual, codes) {
  assert.equal(actual?.status, 'unavailable', 'Require the real Source refusal union');
  assert.ok(OSV_CODES.has(actual.code), 'Refusal must retain a declared typed Source code');
  assert.ok(codes.includes(actual.code), 'Require the independently specified failure branch');
}
function actualSuccess(actual) {
  assert.equal(actual?.status, 'succeeded', 'Actual default Verify and fresh terminal ownership must succeed');
  assert.equal(actual.code, null);
  assert.equal(actual.terminal.outerClose.closeObserved, true);
  assert.equal(actual.terminal.outerClose.code, 0);
  assert.equal(actual.terminal.outerClose.signal, null);
  assert.equal(actual.terminal.outerClose.errorCode, null);
  assert.equal(actual.terminal.journal.terminal.status, 'passed');
  assert.equal(actual.terminal.journal.dispatchedSuiteCount, 1);
  assert.equal(actual.terminal.journal.steps.length, 1);
  assert.equal(actual.terminal.journal.steps[0].exitCode, 0);
  assert.equal(actual.terminal.journal.steps[0].reused, false);
}
function plainPhysicalAuthority(f) {
  assert.ok(Array.isArray(f.authorityFiles) && f.authorityFiles.length > 0, 'Fixture must expose actual State/course/member authority paths for readback');
  return captureOwnedPhysicalFiles({root: f.ownedRoot, files: f.authorityFiles});
}
async function author(c, f, row, kind, support = false) {
  const suite = path.resolve(f.repository, row.file);
  const officialRecorder = path.join(f.repository, 'plugins/pipeline-core/lib/test-case-completion.mjs');
  let specifier = path.relative(path.dirname(suite), officialRecorder).split(path.sep).join('/');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  const markerRelative = kind === 'disconnect' ? `${path.posix.dirname(row.file)}/actual-disconnect-progress` : null;
  const data = ['deadline','disconnect'].includes(kind)
    ? createRealLifetimeSuiteSource({kind, recorderModuleSpecifier: specifier, markerRelative})
    : createSuiteSourceControl({kind, recorderModuleSpecifier: specifier});
  const files = [{path: row.file, source: data.source}];
  let supportFile = null;
  if (support) {
    supportFile = path.join(path.dirname(suite), 'actual-support.mjs');
    files[0].source += "import {value} from './actual-support.mjs';\nassert.equal(value,42);\n";
    files.push({path: path.relative(f.repository, supportFile), source: 'export const value=42;\n'});
  }
  const authored = c.authorOwnedTaskVerificationSuite({suiteId: row.name, files});
  assert.equal(authored.status, 'authored');
  assert.equal(typeof authored.taskPreparationHandle, 'object');
  assert.equal(Object.isFrozen(authored.taskPreparationHandle), true);
  const registered = c.completeOwnedTaskVerificationRegistration({taskPreparationHandle: authored.taskPreparationHandle});
  assert.equal(registered.status, 'registered');
  assert.equal(registered.suiteId, row.name);
  assert.match(registered.associationSha256, /^[a-f0-9]{64}$/);
  return {port: c.acquireVerificationPort(), suite, supportFile, registered, authored, markerRelative};
}

// Invoked ONLY by the actual fixed Source Controller after genuine ctor/run/bind.
// Plain context is not authority: all Source APIs recheck the original private handles.
// No runtime factory, preload, caller-selected module, transferred brand or METHOD.
export async function runOwnedControllerCase({caseId,variant,context}) {
  const variants={OSV001:['standard'],OSV002:['standard'],OSV003:['standard'],OSV004:['complete','missing','malformed','duplicate-declaration','incomplete','real-failure'],OSV005:['replay','deadline','disconnect'],OSV006:['standard'],OSV007:['standard'],OSV008:['standard']};
  assert.ok(Object.hasOwn(variants,caseId)&&variants[caseId].includes(variant),'Require an exact fixed original case/variant');
  assert.ok(context&&Object.getPrototypeOf(context)!==undefined);
  assert.equal(typeof context.disposeRequester,'function','Use only Source-captured original runtime.dispose');
  assert.equal(typeof context.repository?.primaryRoot,'string');
  assert.equal(fs.realpathSync(context.repository.primaryRoot),context.repository.primaryRoot);
  const graphRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
  async function course(id, kinds, callback) {
    assert.equal(id,caseId,'One real fixed entry executes one original case/variant');
    const rows = registrations(id,kinds,variant);
    const f={repository:context.repository.primaryRoot,ownedRoot:context.repository.primaryRoot,graphRoot,
      runtime:{runtimePort:context.runtimePort,dispose:context.disposeRequester}};
    const library = await sourceImport(f, NEW_LIBRARY, NEW_LIBRARY_SHA);
    const onboarding = await sourceImport(f, I03, I03_SHA);
    const acquired = onboarding.acquireSourceOwnedContinuityVerificationOwner({runtimePort:f.runtime.runtimePort});
    assert.equal(acquired.status,'acquired','Require the genuine current Source-owned production owner');
    const current = onboarding.inspectSourceOwnedContinuityVerificationOwner({ownerHandle:acquired.ownerHandle,runtimePort:f.runtime.runtimePort});
    assert.equal(current.status,'current');
    assert.equal(current.course.lifecycle,'approved','Original positive verifies while actually approved');
    assert.equal(current.repository.primaryRoot,f.repository);
    assert.deepEqual(current.repository,context.repository,'Source context must retain the same actual full repository');
    const observed=onboarding.observeSessionCleanupState(f.repository);
    assert.equal(typeof observed.path,'string');
    const state=observed.state;
    const memberFile=path.join(current.repository.commonDir,current.issuer.expectedMemberRef.path.slice(5));
    f.authorityFiles=[observed.path,path.resolve(f.repository,current.course.planPath),path.resolve(f.repository,state.planSubmission.specPath),memberFile];
    if(state.planApproval?.acceptedContract)f.authorityFiles.push(path.resolve(f.repository,state.planApproval.acceptedContract.path));
    f.authorityFiles=[...new Set(f.authorityFiles)];
    const controller=library.createSourceOwnedContinuityVerificationController({runtimePort:f.runtime.runtimePort});
    assert.deepEqual(Object.keys(controller).sort(),['acquireVerificationPort','authorOwnedTaskVerificationSuite','completeOwnedTaskVerificationRegistration']);
    await callback({f,rows,library,onboarding,current,controller});
    // Original entry owns final requester disposal. No fixture/runtime is minted here.
  }
  const cases = Object.freeze([
    {id:'OSV001',name:'Actual approved owning course executes its Source-associated real suite',run:()=>course('OSV001',['complete'],async({f,rows,controller})=>{
      const prepared = await author(controller,f,rows[0],'complete');
      const before = plainPhysicalAuthority(f);
      actualSuccess(await prepared.port.execute({suiteId:rows[0].name}));
      assertOwnedPhysicalConservation({root:f.ownedRoot,before});
    })},
    {id:'OSV002',name:'Real task custody rejects forged preparation, foreign selection and support drift',run:()=>course('OSV002',['complete','missing'],async({f,rows,controller})=>{
      const before = plainPhysicalAuthority(f);
      assert.throws(()=>controller.completeOwnedTaskVerificationRegistration({taskPreparationHandle:Object.freeze({})}),error=>error.code==='OSV-ASSOCIATION-UNAVAILABLE');
      assertOwnedPhysicalConservation({root:f.ownedRoot,before});
      const prepared = await author(controller,f,rows[0],'complete',true);
      refusal(await controller.acquireVerificationPort().execute({suiteId:rows[1].name}),['OSV-ASSOCIATION-UNAVAILABLE']);
      const support = readOwnedPhysicalFile({root:f.ownedRoot,file:prepared.supportFile});
      const fault = changeActualOwnedFileBytes({root:f.ownedRoot,file:prepared.supportFile,replacement:Buffer.concat([support.bytes,Buffer.from('// genuine physical support drift\n')])});
      try { refusal(await prepared.port.execute({suiteId:rows[0].name}),['OSV-INPUT-DRIFT']); }
      finally { fault.restore(); }
      assertOwnedPhysicalConservation({root:f.ownedRoot,before});
    })},
    {id:'OSV003',name:'Genuine synchronous boundary expiry and member drift retain authority',run:()=>course('OSV003',['complete'],async({f,rows,controller,current})=>{
      const registry = await sourceImport(f,'plugins/pipeline-core/lib/session-authority-registry.mjs');
      let expiredBoundary;
      const memberInput = {producerPort:current.issuer.producerPort,memberHandle:current.issuer.memberHandle,operationHandle:current.issuer.operationHandle,expectedMemberRef:current.issuer.expectedMemberRef};
      registry.withSessionAuthorityBoundary({repository:current.repository},boundary=>{
        expiredBoundary=boundary;
        const observed=registry.inspectSourceOwnedSessionAuthorityMember({boundary,...memberInput});
        assert.ok(observed && typeof observed==='object');
      });
      assert.throws(()=>registry.inspectSourceOwnedSessionAuthorityMember({boundary:expiredBoundary,...memberInput}),error=>error.code==='SDC-AUTHORITY-UNAVAILABLE');
      assert.throws(()=>registry.withSessionAuthorityBoundary({repository:current.repository},async()=>1),error=>error.code==='SDC-AUTHORITY-UNAVAILABLE');
      const prepared=await author(controller,f,rows[0],'complete');
      const before=plainPhysicalAuthority(f);
      const memberFile=path.join(current.repository.commonDir,current.issuer.expectedMemberRef.path.slice(5));
      const member=readOwnedPhysicalFile({root:f.ownedRoot,file:memberFile});
      const fault=changeActualOwnedFileBytes({root:f.ownedRoot,file:memberFile,replacement:Buffer.concat([member.bytes,Buffer.from('\n')])});
      try { refusal(await prepared.port.execute({suiteId:rows[0].name}),['OSV-INPUT-DRIFT','OSV-OWNER-UNAVAILABLE','OSV-VERIFY-FAILED']); }
      finally { fault.restore(); }
      assertOwnedPhysicalConservation({root:f.ownedRoot,before});
    })},
    {id:'OSV004',name:'Real default Verify rejects actual missing malformed duplicate incomplete and failing FD3 courses',run:async()=>{
      for(const kind of [variant]) {
        await course('OSV004',[kind],async({f,rows,controller})=>{
          const prepared=await author(controller,f,rows[0],kind);
          const before=plainPhysicalAuthority(f);
          const result=await prepared.port.execute({suiteId:rows[0].name});
          if(kind==='complete')actualSuccess(result);
          else {
            assert.equal(result.status,'failed','Reach the authentic terminal of the real failing Verify child');
            assert.equal(result.code,'OSV-VERIFY-FAILED');
            assert.ok(result.terminal.journal,'A preflight refusal is not the FD3 negative');
            assert.equal(result.terminal.journal.dispatchedSuiteCount,1);
            assert.equal(result.terminal.journal.steps.length,1);
            assert.notEqual(result.terminal.journal.terminal.status,'passed');
          }
          assertOwnedPhysicalConservation({root:f.ownedRoot,before});
        });
      }
    }},
    {id:'OSV005',name:'Actual replay TTL and owning-lifetime loss never regain execution authority',run:async()=>{
      if(variant==='replay') { await course('OSV005',['complete'],async({f,rows,controller})=>{
        const prepared=await author(controller,f,rows[0],'complete');
        const before=plainPhysicalAuthority(f);
        actualSuccess(await prepared.port.execute({suiteId:rows[0].name}));
        const result=await prepared.port.execute({suiteId:rows[0].name});
        assert.deepEqual(Object.keys(result).sort(),['code','status']);
        refusal(result,['OSV-REPLAY']);
        assertOwnedPhysicalConservation({root:f.ownedRoot,before});
      });
      }
      if(variant==='deadline') { await course('OSV005',['deadline'],async({f,rows,controller})=>{
        const prepared=await author(controller,f,rows[0],'deadline');
        const before=plainPhysicalAuthority(f),startedAt=performance.now();
        const result=await prepared.port.execute({suiteId:rows[0].name});
        assertActualDeadlineRefusal({result,startedAt,endedAt:performance.now()});
        refusal(await prepared.port.execute({suiteId:rows[0].name}),['OSV-REPLAY']);
        assertOwnedPhysicalConservation({root:f.ownedRoot,before});
      });
      }
      if(variant==='disconnect') { await course('OSV005',['disconnect'],async({f,rows,controller})=>{
        const prepared=await author(controller,f,rows[0],'disconnect');
        const before=plainPhysicalAuthority(f);
        const running=prepared.port.execute({suiteId:rows[0].name});
        try {
          await disposeActualOwnerAfterOwnedSuiteProgress({fixture:f,markerRelative:prepared.markerRelative});
          assertActualLostOwnerRefusal(await running);
          refusal(await prepared.port.execute({suiteId:rows[0].name}),['OSV-REPLAY']);
          assertOwnedPhysicalConservation({root:f.ownedRoot,before});
        } finally { await running; }
      });
      }
    }},
    {id:'OSV006',name:'Actual verification exposes only its fixed effect and conserves active authority',run:()=>course('OSV006',['complete'],async({f,rows,controller})=>{
      const prepared=await author(controller,f,rows[0],'complete');
      assert.equal(Object.isFrozen(prepared.port),true);
      assert.deepEqual(Object.keys(prepared.port),['execute']);
      const before=plainPhysicalAuthority(f);
      refusal(await prepared.port.execute({suiteId:rows[0].name,command:'node arbitrary-writer.mjs'}),['OSV-ASSOCIATION-UNAVAILABLE']);
      actualSuccess(await prepared.port.execute({suiteId:rows[0].name}));
      assertOwnedPhysicalConservation({root:f.ownedRoot,before});
    })},
    {id:'OSV007',name:'Authentic cross-process course plus real bare-channel public-frame and extra-argv refusals',run:()=>course('OSV007',['complete'],async({f,rows,controller})=>{
      const prepared=await author(controller,f,rows[0],'complete');
      const before=plainPhysicalAuthority(f);
      actualSuccess(await prepared.port.execute({suiteId:rows[0].name}));
      for(const kind of ['missing-channel','public-frame','extra-argv'])await assertActualGuardRefusal({graphRoot:f.graphRoot,repository:f.repository,kind});
      assertOwnedPhysicalConservation({root:f.ownedRoot,before});
    })},
    {id:'OSV008',name:'Approved channel cannot be reconstructed from suite JSON or a consumed port',run:()=>course('OSV008',['complete'],async({f,rows,controller})=>{
      const prepared=await author(controller,f,rows[0],'complete');
      const before=plainPhysicalAuthority(f);
      actualSuccess(await prepared.port.execute({suiteId:rows[0].name}));
      refusal(await prepared.port.execute({suiteId:rows[0].name}),['OSV-REPLAY']);
      await assertActualGuardRefusal({graphRoot:f.graphRoot,repository:f.repository,kind:'public-frame'});
      await assertActualGuardRefusal({graphRoot:f.graphRoot,repository:f.repository,kind:'ordinary-command'});
      assertOwnedPhysicalConservation({root:f.ownedRoot,before});
    })}
  ]);
  const selected=cases.find(row=>row.id===caseId);
  assert.ok(selected);
  const recorder=createTestCaseCompletionRecorder({caseIds:[caseId],fd:3,maxBytes:65536});
  try {
    await selected.run();
    recorder.dispose(caseId,'pass');
    return Object.freeze({schema:'pipeline.owning-verification-controller-check-result.v1',caseId,variant,status:'passed'});
  } catch(error) {
    try { recorder.dispose(caseId,'fail'); } catch {}
    throw error; // Preserve the exact original Error; FD3 failure never changes the verdict.
  }
}
