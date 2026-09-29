// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/git-hook-snapshot-admission.mjs
// Mechanical bootstrap emitted into installed implementations. No policy copy:
// the actual activation decision is made by the canonical snapshot observer.
export function renderGitHookSnapshotAdmission(snapshot){
 if(!snapshot||typeof snapshot.root!=='string'||!/^[a-f0-9]{64}$/.test(snapshot.manifestSha256))throw Error('GHA-INPUT');
 return `
const PIPELINE_SNAPSHOT_ROOT = ${JSON.stringify(snapshot.root)};
const PIPELINE_SNAPSHOT_MANIFEST_SHA256 = ${JSON.stringify(snapshot.manifestSha256)};
async function admitPipelineScope(root) {
  const fs = await import('node:fs');
  const crypto = await import('node:crypto');
  const path = await import('node:path');
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  function physical(target) {
    let current = path.parse(target).root;
    for (const segment of target.slice(current.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      const st = fs.lstatSync(current);
      if (st.isSymbolicLink() || (current !== target && !st.isDirectory())) throw Error('GHA-ALIAS');
    }
    if (fs.realpathSync(target) !== target) throw Error('GHA-IDENTITY');
    return fs.lstatSync(target);
  }
  let remaining = 67108864;
  function read(target, maximum) {
    const pre = physical(target);
    if (!pre.isFile() || pre.nlink !== 1 || pre.size > maximum || pre.size > remaining) throw Error('GHA-SIZE');
    const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      const before = fs.fstatSync(fd), capacity = Math.min(maximum, remaining);
      if (before.ino !== pre.ino || before.dev !== pre.dev || before.nlink !== 1 || !before.isFile() || before.size > capacity) throw Error('GHA-FD');
      const bytes = Buffer.alloc(capacity + 1); let count = 0;
      while (count < bytes.length) { const n = fs.readSync(fd, bytes, count, bytes.length - count, null); if (!n) break; count += n; }
      if (count > capacity) throw Error('GHA-SIZE'); remaining -= count;
      const after = fs.fstatSync(fd), now = physical(target);
      if (after.ino !== now.ino || after.dev !== now.dev || after.size !== count || now.size !== count || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || now.mtimeMs !== after.mtimeMs || now.ctimeMs !== after.ctimeMs || now.nlink !== 1) throw Error('GHA-DRIFT');
      return bytes.subarray(0,count);
    } finally { fs.closeSync(fd); }
  }
  const manifestBytes = read(path.join(PIPELINE_SNAPSHOT_ROOT, 'snapshot.json'), 1048576);
  if (digest(manifestBytes) !== PIPELINE_SNAPSHOT_MANIFEST_SHA256) throw Error('GHA-MANIFEST');
  const manifest = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(manifestBytes));
  if (manifest.schema !== 'pipeline.git-hook-runtime-snapshot.v1' || !Array.isArray(manifest.inventory) || manifest.inventory.length > 4096) throw Error('GHA-MANIFEST');
  const seen = new Set();
  for (const entry of manifest.inventory) {
    if (typeof entry.path !== 'string' || !(entry.path === 'protected-baseline.json' || ['lib','hooks','scripts','config','schemas'].includes(entry.path.split('/')[0])) || entry.path.includes(String.fromCharCode(92)) || entry.path.split('/').some(x => !x || x === '.' || x === '..' || x.startsWith('.')) || seen.has(entry.path) || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('GHA-PATH');
    seen.add(entry.path);
    if (digest(read(path.join(PIPELINE_SNAPSHOT_ROOT, entry.path), 4194304)) !== entry.sha256) throw Error('GHA-CONTENT');
  }
  if (!seen.has('lib/governance-scope.mjs')) throw Error('GHA-SCOPE-MISSING');
  const {observeGovernanceScope} = await import(pathToFileURL(path.join(PIPELINE_SNAPSHOT_ROOT,'lib/governance-scope.mjs')).href);
  const observed = observeGovernanceScope({rootDir:root});
  if (!observed.requiresEnforcement) return false;
  if (observed.state !== 'active') throw Error('GHA-ACTIVE-UNVERIFIABLE');
  return true;
}
`;
}
