// SPDX-License-Identifier: SUL-1.0
// Native hook metadata has the same transport trust as cwd. This is not a
// portable attestation and must never be populated from tool arguments.
import { constants, fstatSync, lstatSync, realpathSync, openSync, readSync, closeSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseGuardCommand } from '../hooks/guard-command-grammar.mjs';

export function antigravityArtifactHostContext(envelope) {
  if (envelope?.toolCall?.name !== 'run_command') return undefined;
  return {
    conversationId: envelope.conversationId,
    artifactDirectoryPath: envelope.artifactDirectoryPath,
    transcriptPath: envelope.transcriptPath,
    workspacePaths: envelope.workspacePaths,
  };
}

function physical(path, kind) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) return false;
  try {
    if (realpathSync(path) !== path) return false;
    for (let cursor = path; ; cursor = dirname(cursor)) {
      if (lstatSync(cursor).isSymbolicLink()) return false;
      if (dirname(cursor) === cursor) break;
    }
    const stat = lstatSync(path);
    return kind === 'directory' ? stat.isDirectory() : stat.isFile() && stat.nlink === 1;
  } catch { return false; }
}

/** A permission check only: never copies or reads a transcript. Exact new PNG
 * at the current host root, one regular project PNG source, no extra operands.
 * The registered AGY adapter reconstructs the context from original top-level
 * system fields; Claude/Codex cannot select this route with an input field.
 */
export function isCurrentSessionArtifactExport(input, root, { runner } = {}) {
  if (runner !== 'antigravity' || input?.tool_name !== 'Bash') return false;
  const host = input.antigravity_artifact_host;
  if (!host || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(host.conversationId ?? '')) return false;
  const artifactRoot = host.artifactDirectoryPath;
  if (typeof artifactRoot !== 'string' || basename(artifactRoot) !== host.conversationId
    || basename(dirname(artifactRoot)) !== 'brain'
    || artifactRoot.split(sep).some((part) => /^(?:\.git|\.ssh|\.aws|\.codex|\.claude|plugins?|cache|marketplaces?|installations?|credentials?|keys?)$/iu.test(part))
    || host.transcriptPath !== join(artifactRoot, '.system_generated', 'logs', 'transcript.jsonl')
    || !Array.isArray(host.workspacePaths) || !host.workspacePaths.includes(root)
    || !physical(root, 'directory') || !physical(artifactRoot, 'directory')) return false;
  const parsed = parseGuardCommand(input.tool_input?.command, root, { platform: 'linux' });
  if (parsed.parseStatus !== 'accepted' || parsed.operators.length || parsed.redirects.length || parsed.segments.length !== 1) return false;
  const segment = parsed.segments[0];
  if (segment.executable !== 'cp') return false;
  const args = [...segment.argv];
  if (args[0] === '--') args.shift();
  if (args.length !== 2 || args.some((arg) => arg.startsWith('-') || /[\0\r\n*?\[\]{}]/u.test(arg))) return false;
  const [sourceOperand, target] = args;
  const source = resolve(root, sourceOperand);
  const sourceRelative = relative(root, source);
  const parts = sourceRelative.split(sep);
  if (!sourceRelative || sourceRelative.startsWith(`..${sep}`) || isAbsolute(sourceRelative)
    || parts.some((part) => part.startsWith('.') || /(?:credential|secret|private|transcript|session|cache|plugin|install|keys?|logs?)/iu.test(part))
    || !/\.png$/u.test(source) || !/\.png$/u.test(target)
    || sourceOperand.split(/[\\/]/u).some((part) => part === '.' || part === '..')
    || !physical(source, 'file') || !isAbsolute(target) || resolve(target) !== target
    || dirname(target) !== artifactRoot || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/u.test(basename(target))) return false;
  try { lstatSync(target); return false; } catch (error) { if (error.code !== 'ENOENT') return false; }
  // A renamed source or credential is not an image. Read only a bounded header
  // from the already contained regular file, using O_NOFOLLOW on supported hosts.
  let fd;
  try {
    const expected = lstatSync(source);
    fd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW);
    const actual = fstatSync(fd);
    if (!actual.isFile() || actual.nlink !== 1 || actual.dev !== expected.dev || actual.ino !== expected.ino) return false;
    const header = Buffer.alloc(24);
    if (readSync(fd, header, 0, header.length, 0) !== header.length) return false;
    return header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      && header.readUInt32BE(8) === 13 && header.toString('ascii', 12, 16) === 'IHDR'
      && header.readUInt32BE(16) > 0 && header.readUInt32BE(20) > 0;
  } catch { return false; } finally { if (fd !== undefined) closeSync(fd); }
}

export function crossRepositoryDenialReason(denials) {
  // The shared guard already selected the exact HGO recovery. A second adapter
  // classification used to label every outside target as a plugin cache.
  return denials.map((entry) => entry.reason).join('\n');
}
