// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.outside-root-read-label-skips-option-value-file-tokens (AC-223).
// The outside-root read label must treat the value of `rg --ignore-file` and
// `grep --exclude-from` (separated and `=` forms) as read targets, while
// non-file option values and pattern tokens stay out. Strings are parsed, never executed.
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGuardCommand} from '../../hooks/guard-command-grammar.mjs';
import {qp4OperandResolvesOutsideRoot} from '../guard/shell-grammar.mjs';

const repository=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
mkdirSync(join(repository,'scratch'),{recursive:true});
const fixture=mkdtempSync(join(repository,'scratch','outside-root-option-value-'));
const project=join(fixture,'project');
mkdirSync(project,{recursive:true});
mkdirSync(join(fixture,'outside'),{recursive:true});
after(()=>rmSync(fixture,{recursive:true,force:true}));

const parse=command=>parseGuardCommand(command,project,{platform:'linux'});
const label=command=>{
  const parsed=parse(command);
  assert.equal(parsed.parseStatus,'accepted',command);
  return qp4OperandResolvesOutsideRoot(parsed,project);
};

// Acceptance point 1 + 2: each of the two options is classified as a read target, one test each.
for(const [exe,option] of [['rg','--ignore-file'],['grep','--exclude-from']]){
  test(`${exe} ${option} separated outside value is labelled outside-root`,()=>{
    assert.equal(label(`${exe} ${option} ../outside/opts.txt needle scan.txt`),true);
  });
  test(`${exe} ${option}= outside value is labelled outside-root`,()=>{
    assert.equal(label(`${exe} ${option}=../outside/opts.txt needle scan.txt`),true);
  });
  test(`${exe} ${option} absolute outside value is labelled outside-root`,()=>{
    const abs=join(fixture,'outside','opts.txt').replaceAll('\\','/');
    assert.equal(label(`${exe} ${option} ${abs} needle scan.txt`),true);
  });
  test(`${exe} ${option} in-root value is not labelled outside-root`,()=>{
    assert.equal(label(`${exe} ${option} opts.txt needle scan.txt`),false);
    assert.equal(label(`${exe} ${option}=opts.txt needle scan.txt`),false);
  });
}

// Boundary kept from F-2: pattern and non-file option values stay excluded.
for(const [exe,option] of [['rg','--glob'],['grep','--exclude']]){
  test(`${exe} ${option} non-file value is not a read target`,()=>{
    assert.equal(label(`${exe} ${option} ../outside/not-a-file -e needle scan.txt`),false);
  });
}
test('outside-looking pattern token is not a read target',()=>{
  assert.equal(label('rg ../outside/pattern scan.txt'),false);
  assert.equal(label('grep ../outside/pattern scan.txt'),false);
});
test('ordinary outside positional target stays labelled',()=>{
  assert.equal(label('rg needle ../outside/opts.txt'),true);
});

// Meaningful-RED: a scratch mirror of the production function with the option-file push
// removed drops the outside token; the real function keeps it. The mirror is built in
// memory from the production source text; production is never edited.
test('mirror without the option-file push loses the outside value (case can fail)',()=>{
  const source=readFileSync(new URL('../guard/shell-grammar.mjs',import.meta.url),'utf8');
  const start=source.indexOf('const QP4_RG_SHORT_VALUE');
  const end=source.indexOf('export function qp4OperandResolvesOutsideRoot');
  assert.ok(start>0&&end>start,'production anchors present');
  const slice=source.slice(start,end);
  const push='if (optionFile && typeof value === "string" && value !== "") fileValues.push(value);';
  assert.ok(slice.includes(push),'option-file push present in production');
  const build=text=>new Function(text+'\nreturn qp4ReadTargetOperands;')();
  const mutated=build(slice.replace(push,''));
  const real=build(slice);
  for(const [exe,argv] of [
    ['rg',['--ignore-file','../outside/opts.txt','needle','scan.txt']],
    ['grep',['--exclude-from=../outside/opts.txt','needle','scan.txt']],
  ]){
    assert.ok(real(exe,argv).includes('../outside/opts.txt'),`real keeps ${exe} option value`);
    assert.ok(!mutated(exe,argv).includes('../outside/opts.txt'),`mirror drops ${exe} option value`);
  }
});

// Host limitation: none of these cases needs directory mode bits or directory symlinks,
// so nothing is skipped on this native Windows host.
