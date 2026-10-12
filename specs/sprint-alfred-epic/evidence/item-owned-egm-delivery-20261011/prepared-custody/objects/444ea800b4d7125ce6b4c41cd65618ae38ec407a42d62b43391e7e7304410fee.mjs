import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const own='scratch/alfred-postinstall-whole-items-20261011/passive-read-batch-correction';
const source='plugins/pipeline-core/lib/guard/shell-grammar.mjs';
const expected='6a711bdb8a5db034007920808d36ef260873603b4a54364552f4e9f6d408ddcd';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(source);if(digest(bytes)!==expected)throw Error('Source CAS drift');
const helper=`// This metadata lane recognizes only the two measured display formats. GNU
// stat treats them as inert formatting data. Each operand must independently
// be an existing, unaliased, contained passive read; no option changes lookup.
const STAT_METADATA_FORMATS = new Set(["%a %s %n", "%a %s %h %n"]);

export function isFormattedStatReadArgs(args, root, extraRoots = [], dependencies = {}) {
  if (!Array.isArray(args) || args.length < 3
    || !["-c", "--format"].includes(args[0])
    || !STAT_METADATA_FORMATS.has(args[1])) return false;
  const realpath = dependencies.realpath ?? realpathSync;
  const lstat = dependencies.lstat ?? lstatSync;
  const passive = dependencies.passive ?? isAllowedPassiveReadTarget;
  return args.slice(2).every((arg) => {
    const candidate = rawReadCandidatePath(arg, root);
    if (candidate === null || !pathInside(root, resolve(candidate))) return false;
    try {
      const physicalRoot = realpath(root);
      const physical = realpath(candidate);
      const observed = lstat(candidate);
      if (physicalRoot !== resolve(root) || physical !== resolve(candidate)
        || !pathInside(physicalRoot, physical)
        || (!observed.isFile() && !observed.isDirectory())) return false;
    } catch { return false; }
    return passive(arg, {
      rootDir: root, recursive: true, additionalRecursiveRoots: extraRoots,
    });
  });
}

`;
let text=bytes.toString('utf8');
const marker='export function isReadOnlySimpleWords(words, root, extraRoots = BOUNDED_PIPELINE_ADDITIONAL_ROOTS) {';
if(text.split(marker).length!==2)throw Error('helper insertion mismatch');
text=text.replace(marker,helper+marker);
const branch='    if (executable === "rg") return isBoundedSingleRg(args, root, extraRoots);';
if(text.split(branch).length!==2)throw Error('branch insertion mismatch');
text=text.replace(branch,`    // Route every formatting spelling to the closed lane, including unsupported
    // attached values, so generic flag treatment cannot admit them indirectly.
    if (executable === "stat" && args.some((arg) => /^--format(?:=|$)|^-c/u.test(arg))) {
      return isFormattedStatReadArgs(args, root, extraRoots);
    }
`+branch);
const destination=path.join(own,'postimages',source);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,text,{mode:fs.statSync(source).mode&0o777});
fs.writeFileSync(path.join(own,'stat-preparation.json'),JSON.stringify({source:{path:source,sha256:expected,mode:fs.statSync(source).mode&0o777,bytes:bytes.length},postimage:{path:destination,sha256:digest(Buffer.from(text)),mode:fs.statSync(destination).mode&0o777,bytes:Buffer.byteLength(text)},scope:'stat-scope-v2.md',productionChanged:false},null,2)+'\n');
console.log(JSON.stringify({postimage:destination,sha256:digest(Buffer.from(text))}));
