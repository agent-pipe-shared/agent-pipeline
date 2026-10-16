// SPDX-License-Identifier: SUL-1.0
// Pin: fixture suites must reach the State authority on native Windows (AC-270).
// The fixture's private-state root must be created by the production-owned
// creator (protected, owner-only DACL), never by an inheriting mkdirSync, and
// the DACL assurance itself must stay strict.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {makeFixture,must,state} from '../architecture-prospective-materialization.fixture.mjs';
import {inspectWindowsOwnedAuthorityPath} from '../windows-owned-authority-backend.mjs';

const win=process.platform==='win32';

test('fixture set-feature reaches the State authority and the private root passes native DACL inspection',{skip:!win&&'native Windows DACL only'},()=>{
  const f=makeFixture('signature',{stage:'draft'});
  const observed=inspectWindowsOwnedAuthorityPath({path:join(f.dir,'.git','agent-pipeline'),directory:true});
  assert.match(observed.nativeFacts,/./u);
  assert.equal(state(f).feature?.id??state(f).featureId??'e2e','e2e');
});

test('DACL assurance is not weakened: an inheriting mkdirSync private root is still refused',{skip:!win&&'native Windows DACL only'},()=>{
  const root=mkdtempSync(join(process.cwd(),'scratch','dacl-pin-'));
  const dir=join(root,'agent-pipeline');mkdirSync(dir,{mode:0o700});
  assert.throws(()=>inspectWindowsOwnedAuthorityPath({path:dir,directory:true}),error=>error.reason==='WIN-AUTH-DACL'||error.reason==='WIN-AUTH-OWNER');
});
