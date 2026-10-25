#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Publish one consumer-authored functional or visual result through an explicit,
 * immutable run path. This is a cooperative writer, not interception of other
 * consumer file writes. The input artifact is already produced by the caller.
 * JSON artifacts must declare the expected schema; PNG artifacts use image/png.
 * A latest pointer is replaceable only after its retained record is validated.
 * Failed results are retained and can become latest attempts; consumers inspect
 * the run payload rather than interpreting latest as a successful result.
 *
 * Usage: node plugins/pipeline-core/scripts/publish-evidence-run.mjs
 *   --output-root evidence/scene --run-id run-001 --kind functional
 *   --source index.html --artifact evidence/scene/browser-check.json
 *   --schema app.browser-check.v1
 * For a visual JSON or PNG result, use --kind visual, its distinct input path
 * and exact schema (or image/png), plus --viewport 1280x720 and optional
 * --device-scale-factor 2. The output root must be inside the Git checkout.
 * The caller chooses a fresh run ID per attempt; reusing an ID is refused.
 * A kind's latest pointer pins its payload schema. A later run with a different
 * schema needs a separate output namespace. Publication rechecks the exact
 * latest bytes immediately before replacement and refuses observed drift;
 * this is not a global CAS against noncooperating arbitrary file writes.
 */
import { constants, closeSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRepoRoot, findResidualHostPath, readHeadIdentity } from './capture-evidence.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const own = (code) => Object.assign(new Error(code), { code });

function inside(root, path) {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
    || rel.split(sep).includes('.git')) throw own('EVIDENCE-RUN-PATH-OUTSIDE');
  return target;
}

function physicalPath(root, path, createParents = false) {
  const rel = relative(root, path);
  let current = root;
  if (realpathSync(root) !== root) throw own('EVIDENCE-RUN-ALIAS');
  for (const part of rel.split(sep).slice(0, -1)) {
    current = join(current, part);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) {
      if (error?.code !== 'ENOENT' || !createParents) throw own('EVIDENCE-RUN-PARENT');
      mkdirSync(current);
      stat = lstatSync(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(current) !== current) {
      throw own('EVIDENCE-RUN-ALIAS');
    }
  }
}

function readPhysicalFile(root, path) {
  physicalPath(root, path);
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || lstatSync(path).isSymbolicLink()) throw own('EVIDENCE-RUN-INPUT-ALIAS');
    return readFileSync(fd);
  } catch (error) {
    if (error?.code?.startsWith('EVIDENCE-')) throw error;
    throw own('EVIDENCE-RUN-INPUT');
  } finally { if (fd !== undefined) closeSync(fd); }
}

function existingRegular(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw own('EVIDENCE-RUN-OWNERSHIP');
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function publishNew(path, bytes) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
    linkSync(temp, path); // exclusive, even if a noncooperating writer raced us
  } finally {
    try { unlinkSync(temp); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

function validatePointer(root, outputRoot, latest, kind) {
  if (!existingRegular(latest)) return null;
  const bytes = readPhysicalFile(root, latest);
  let value;
  try { value = JSON.parse(bytes); }
  catch { throw own('EVIDENCE-RUN-OWNERSHIP'); }
  if (value?.schema !== 'pipeline.consumer-evidence-latest.v1' || value.kind !== kind
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value.runId ?? '')
    || value.recordPath !== `runs/${value.runId}/${kind}.run.json`
    || !/^[0-9a-f]{64}$/u.test(value.recordSha256 ?? '')) throw own('EVIDENCE-RUN-OWNERSHIP');
  const recordPath = inside(root, join(outputRoot, value.recordPath));
  let record;
  try { record = readPhysicalFile(root, recordPath); }
  catch { throw own('EVIDENCE-RUN-OWNERSHIP'); }
  if (sha256(record) !== value.recordSha256) throw own('EVIDENCE-RUN-OWNERSHIP');
  let parsed;
  try { parsed = JSON.parse(record); } catch { throw own('EVIDENCE-RUN-OWNERSHIP'); }
  if (parsed?.schema !== 'pipeline.consumer-evidence-run.v1' || parsed.kind !== kind
    || parsed.runId !== value.runId) throw own('EVIDENCE-RUN-OWNERSHIP');
  const expectedName = `${kind}.${parsed.artifact?.schema === 'image/png' ? 'png' : 'json'}`;
  if (parsed.artifact?.path !== expectedName || parsed.artifact.schema !== value.artifactSchema
    || !/^[0-9a-f]{64}$/u.test(parsed.artifact.sha256 ?? '')) {
    throw own('EVIDENCE-RUN-OWNERSHIP');
  }
  let payload;
  try { payload = readPhysicalFile(root, inside(root, join(outputRoot, 'runs', value.runId, expectedName))); }
  catch { throw own('EVIDENCE-RUN-OWNERSHIP'); }
  if (sha256(payload) !== parsed.artifact.sha256) throw own('EVIDENCE-RUN-OWNERSHIP');
  return { bytes, artifactSchema: parsed.artifact.schema };
}

export function publishEvidenceRun({ root = findRepoRoot(), outputRoot, runId, kind, source, artifact, schema, viewport, deviceScaleFactor,
  beforeLatestReplace = null }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(runId ?? '')) throw own('EVIDENCE-RUN-ID');
  if (!['functional', 'visual'].includes(kind)) throw own('EVIDENCE-RUN-KIND');
  if (!/^[A-Za-z][A-Za-z0-9._/-]{1,119}$/u.test(schema ?? '')) throw own('EVIDENCE-RUN-SCHEMA');
  if (!outputRoot || !source || !artifact) throw own('EVIDENCE-RUN-ARGUMENT');
  let dimensions = null;
  if (viewport !== undefined) {
    const match = /^(\d{1,5})x(\d{1,5})$/u.exec(viewport);
    if (!match || +match[1] < 1 || +match[2] < 1) throw own('EVIDENCE-RUN-VIEWPORT');
    const scale = Number(deviceScaleFactor ?? 1);
    if (!Number.isFinite(scale) || scale <= 0 || scale > 8) throw own('EVIDENCE-RUN-VIEWPORT');
    dimensions = { width: +match[1], height: +match[2], deviceScaleFactor: scale };
  } else if (kind === 'visual' || deviceScaleFactor !== undefined) throw own('EVIDENCE-RUN-VIEWPORT');

  root = resolve(root);
  const output = inside(root, outputRoot);
  const sourcePath = inside(root, source);
  const artifactPath = inside(root, artifact);
  const sourceBytes = readPhysicalFile(root, sourcePath);
  const artifactBytes = readPhysicalFile(root, artifactPath);
  if (schema === 'image/png') {
    if (!artifactBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw own('EVIDENCE-RUN-SCHEMA');
  } else {
    let parsed;
    try { parsed = JSON.parse(artifactBytes); } catch { throw own('EVIDENCE-RUN-SCHEMA'); }
    if (!parsed || Array.isArray(parsed) || parsed.schema !== schema
      || findResidualHostPath(artifactBytes.toString('utf8'))) throw own('EVIDENCE-RUN-SCHEMA');
  }
  const candidate = readHeadIdentity(root);
  if (!/^[0-9a-f]{40}$/u.test(candidate.head) || !/^[0-9a-f]{40}$/u.test(candidate.tree)) throw own('EVIDENCE-RUN-CANDIDATE');
  const runDirectory = join(output, 'runs', runId);
  const extension = schema === 'image/png' ? 'png' : 'json';
  const payloadPath = join(runDirectory, `${kind}.${extension}`);
  const recordPath = join(runDirectory, `${kind}.run.json`);
  const latest = join(output, `${kind}.latest.json`);
  physicalPath(root, latest, true);
  const lock = `${latest}.lock`;
  try { writeFileSync(lock, 'evidence-run publication\n', { flag: 'wx', mode: 0o600 }); }
  catch { throw own('EVIDENCE-RUN-LOCKED'); }
  try {
    const preimage = validatePointer(root, output, latest, kind);
    if (preimage && preimage.artifactSchema !== schema) throw own('EVIDENCE-RUN-SCHEMA-COLLISION');
    physicalPath(root, payloadPath, true);
    if (existingRegular(payloadPath) || existingRegular(recordPath)) throw own('EVIDENCE-RUN-EXISTS');
    const record = {
      schema: 'pipeline.consumer-evidence-run.v1', runId, kind, candidate: { commit: candidate.head, tree: candidate.tree, dirty: candidate.dirty },
      source: { path: relative(root, sourcePath).split(sep).join('/'), sha256: sha256(sourceBytes) },
      viewport: dimensions,
      artifact: { schema, path: `${kind}.${extension}`, sha256: sha256(artifactBytes) },
    };
    const recordBytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
    publishNew(payloadPath, artifactBytes);
    publishNew(recordPath, recordBytes);
    if (sha256(readPhysicalFile(root, payloadPath)) !== sha256(artifactBytes)) throw own('EVIDENCE-RUN-READBACK');
    const readback = readPhysicalFile(root, recordPath);
    if (sha256(readback) !== sha256(recordBytes)) throw own('EVIDENCE-RUN-READBACK');
    const pointerBytes = Buffer.from(JSON.stringify({
      schema: 'pipeline.consumer-evidence-latest.v1', kind, runId, artifactSchema: schema,
      recordPath: `runs/${runId}/${kind}.run.json`, recordSha256: sha256(readback),
    }, null, 2) + '\n');
    const temporary = `${latest}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, pointerBytes, { flag: 'wx', mode: 0o600 });
      beforeLatestReplace?.();
      let current;
      try { current = validatePointer(root, output, latest, kind); }
      catch { throw own('EVIDENCE-RUN-POINTER-DRIFT'); }
      if ((preimage === null) !== (current === null)
        || (preimage !== null && !preimage.bytes.equals(current.bytes))) throw own('EVIDENCE-RUN-POINTER-DRIFT');
      if (current) renameSync(temporary, latest);
      else { linkSync(temporary, latest); unlinkSync(temporary); }
    } finally {
      try { unlinkSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
    return { recordPath, latest };
  } finally { unlinkSync(lock); }
}

function parse(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2);
    if (!argv[i]?.startsWith('--') || !['output-root', 'run-id', 'kind', 'source', 'artifact', 'schema', 'viewport', 'device-scale-factor'].includes(key)
      || argv[i + 1] === undefined || args[key] !== undefined) throw own('EVIDENCE-RUN-ARGUMENT');
    args[key] = argv[i + 1];
  }
  return { outputRoot: args['output-root'], runId: args['run-id'], kind: args.kind, source: args.source,
    artifact: args.artifact, schema: args.schema, viewport: args.viewport, deviceScaleFactor: args['device-scale-factor'] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--help') {
      process.stdout.write('publish-evidence-run: --output-root <dir> --run-id <id> --kind functional|visual --source <file> --artifact <file> --schema <id|image/png> [--viewport <width>x<height> --device-scale-factor <number>]\n');
    } else {
      const result = publishEvidenceRun(parse(process.argv.slice(2)));
      process.stdout.write(`evidence-run: published ${relative(findRepoRoot(), result.recordPath)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error?.code?.startsWith('EVIDENCE-RUN-') ? error.code : 'EVIDENCE-RUN-FAILED'}\n`);
    process.exitCode = 1;
  }
}
