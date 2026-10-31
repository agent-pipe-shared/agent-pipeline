// SPDX-License-Identifier: SUL-1.0
// Native hook metadata has the same transport trust as cwd. This is not a
// portable attestation and must never be populated from tool arguments.
import { createHash, randomBytes } from 'node:crypto';
import { constants, fstatSync, lstatSync, mkdirSync, readdirSync, realpathSync, openSync, readFileSync, readSync, closeSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
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

/** True when `path` is an absolute, symlink-free (every ancestor included) directory, or a single-link regular file. */
export const artifactPathIsPhysical = physical;

// ---------------------------------------------------------------------------------------------------------------------
// AC-175C: the host-context HANDOFF. The CLI transcript export cannot receive the Antigravity host context on its argv, and
// no environment variable carries it. The pretool hook holds the envelope, so for the ONE admitted export command of its own
// conversation it writes the context it already computed into a private single-use file under the git common dir; the CLI
// reads that file, checks every binding, consumes it and then applies its existing screens unchanged. The file location is
// derived from the repository root and the conversation id alone: no agent-supplied path, flag value or variable selects it.
// Same transport trust as the hook metadata itself: a writer who can create files under the git common dir is out of scope.
// ---------------------------------------------------------------------------------------------------------------------

export const ANTIGRAVITY_HOST_HANDOFF_SCHEMA = 'pipeline.antigravity-host-handoff.v1';
/**
 * A handoff lives for one tool round trip; anything older is stale and cleared. Five minutes, not seconds: the hook runs at
 * PreToolUse, and a command that waits for the person's confirmation before it starts must still find its handoff.
 */
export const ANTIGRAVITY_HOST_HANDOFF_TTL_MS = 5 * 60_000;
const HANDOFF_MAX_BYTES = 16 * 1024;
const HANDOFF_CLOCK_SKEW_MS = 5_000;
const CONVERSATION_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const HOST_HANDOFF_KEYS = ['artifactDirectoryPath', 'conversationId', 'transcriptPath', 'workspacePaths'];
const argsSha256 = (args) => createHash('sha256').update(JSON.stringify(args)).digest('hex');
const flagValue = (args, flag) => (Array.isArray(args) && args.indexOf(flag) >= 0 ? args[args.indexOf(flag) + 1] : undefined);
const ownedByThisUser = (stat) => process.platform === 'win32' || typeof process.getuid !== 'function' || stat.uid === process.getuid();

function plainDirectory(path) {
  try { const stat = lstatSync(path); return stat.isDirectory() && !stat.isSymbolicLink() && ownedByThisUser(stat); } catch { return false; }
}

/** The git common dir of `root`, from the filesystem alone (no spawn): a `.git` directory, or the admin dir a worktree's `.git` file names. */
function gitCommonDirectory(root) {
  if (typeof root !== 'string' || !isAbsolute(root)) return null;
  const dotGit = join(root, '.git');
  try {
    const stat = lstatSync(dotGit);
    if (stat.isSymbolicLink()) return null;
    if (stat.isDirectory()) return dotGit;
    if (!stat.isFile() || stat.size > 4096) return null;
    const pointer = /^gitdir: (.+)\r?\n?$/u.exec(readFileSync(dotGit, 'utf8'));
    if (!pointer) return null;
    const admin = resolve(root, pointer[1]);
    const common = resolve(admin, readFileSync(join(admin, 'commondir'), 'utf8').trim());
    return plainDirectory(admin) && plainDirectory(common) && dirname(admin) === join(common, 'worktrees') ? common : null;
  } catch { return null; }
}

/** Where the handoffs of `root` live (a path, not a promise that it exists), or null when `root` has no usable git common dir. */
export function antigravityHostHandoffDirectory(root) {
  const common = gitCommonDirectory(root);
  return common === null ? null : join(common, 'agent-pipeline', 'antigravity-host-handoff');
}

const hostShapeIsValid = (host) => host !== null && typeof host === 'object' && !Array.isArray(host)
  && JSON.stringify(Object.keys(host).sort()) === JSON.stringify(HOST_HANDOFF_KEYS)
  && CONVERSATION_ID.test(host.conversationId)
  && typeof host.artifactDirectoryPath === 'string' && typeof host.transcriptPath === 'string'
  && Array.isArray(host.workspacePaths) && host.workspacePaths.every((path) => typeof path === 'string');

/**
 * Hook side. Binds the host context to the conversation id, the exact admitted argv (digest), the project root and a short
 * expiry. The caller (the pretool hook) has already admitted the command and validated the layout. Never throws.
 */
export function writeAntigravityHostHandoff({ root, host, args, now = Date.now() } = {}) {
  const refuse = (reason) => ({ status: 'refused', reason });
  try {
    if (!Array.isArray(args) || args[0] !== 'export' || args.some((arg) => typeof arg !== 'string')) return refuse('argv-not-an-export');
    if (!hostShapeIsValid(host) || flagValue(args, '--session-id') !== host.conversationId) return refuse('host-context-not-bound-to-the-session');
    const directory = antigravityHostHandoffDirectory(root);
    if (directory === null) return refuse('git-common-dir-unavailable');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!plainDirectory(dirname(directory)) || !plainDirectory(directory)) return refuse('handoff-directory-unsafe');
    const record = {
      schema: ANTIGRAVITY_HOST_HANDOFF_SCHEMA,
      conversationId: host.conversationId,
      root,
      argsSha256: argsSha256(args),
      issuedAt: now,
      expiresAt: now + ANTIGRAVITY_HOST_HANDOFF_TTL_MS,
      host: Object.fromEntries(HOST_HANDOFF_KEYS.map((key) => [key, host[key]])),
    };
    const final = join(directory, `${host.conversationId}.json`);
    const temporary = join(directory, `.${host.conversationId}.${randomBytes(6).toString('hex')}.tmp`);
    writeFileSync(temporary, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
    try { renameSync(temporary, final); } catch (error) { try { unlinkSync(temporary); } catch { /* best effort */ } throw error; }
    return { status: 'written' };
  } catch { return refuse('handoff-not-written'); }
}

/** Reads the open handle of an already lstat-checked handoff file; null when anything about it is not what lstat saw. */
function readHandoffBytes(file, before) {
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size) return null;
    const bytes = Buffer.alloc(stat.size);
    return readSync(fd, bytes, 0, stat.size, 0) === stat.size ? bytes : null;
  } catch { return null; } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* already closed */ } }
}

/**
 * CLI side. `status`: `unavailable` (no handoff, an expired one, or a lost race for it), `invalid` (a handoff that is malformed,
 * over-permissive, linked, misnamed, or bound to another command or project), or `consumed` with the host context. The file is
 * removed when it is expired, malformed or consumed; a well-formed handoff bound to a different command is left to its owner.
 */
export function consumeAntigravityHostHandoff({ root, sessionId, args, now = Date.now() } = {}) {
  const unavailable = { status: 'unavailable' };
  const invalid = { status: 'invalid' };
  if (typeof sessionId !== 'string' || !CONVERSATION_ID.test(sessionId) || !Array.isArray(args)) return unavailable;
  const directory = antigravityHostHandoffDirectory(root);
  if (directory === null) return unavailable;
  const file = join(directory, `${sessionId}.json`);
  const discard = () => { try { unlinkSync(file); } catch { /* already gone */ } };
  let before;
  try { before = lstatSync(file); } catch (error) { return error?.code === 'ENOENT' ? unavailable : invalid; }
  if (!plainDirectory(dirname(directory)) || !plainDirectory(directory)) return invalid;
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1 || before.size > HANDOFF_MAX_BYTES
    || !ownedByThisUser(before) || (process.platform !== 'win32' && (before.mode & 0o077) !== 0)) { discard(); return invalid; }
  const bytes = readHandoffBytes(file, before);
  let record = null;
  try { record = bytes === null ? null : JSON.parse(bytes.toString('utf8')); } catch { record = null; }
  const wellFormed = record !== null && typeof record === 'object' && !Array.isArray(record)
    && record.schema === ANTIGRAVITY_HOST_HANDOFF_SCHEMA && Number.isFinite(record.issuedAt) && Number.isFinite(record.expiresAt)
    && record.expiresAt - record.issuedAt === ANTIGRAVITY_HOST_HANDOFF_TTL_MS && record.issuedAt <= now + HANDOFF_CLOCK_SKEW_MS
    && typeof record.root === 'string' && typeof record.argsSha256 === 'string' && hostShapeIsValid(record.host)
    && record.conversationId === sessionId && record.host.conversationId === sessionId;
  if (!wellFormed) { discard(); return invalid; }
  if (record.expiresAt <= now) { discard(); return unavailable; }
  // Bound to another project or another command: it belongs to the command the hook admitted, not to this one.
  if (record.root !== root || record.argsSha256 !== argsSha256(args)) return invalid;
  // Claim by rename so exactly one reader wins, then check the claimed bytes are the bytes that were validated.
  const claimed = `${file}.claim-${process.pid}-${randomBytes(4).toString('hex')}`;
  try { renameSync(file, claimed); } catch { return unavailable; }
  let claimedBytes = null;
  try { claimedBytes = readHandoffBytes(claimed, lstatSync(claimed)); } catch { claimedBytes = null; }
  try { unlinkSync(claimed); } catch { /* the sweep clears a leftover claim */ }
  if (claimedBytes === null || !claimedBytes.equals(bytes)) return invalid;
  return { status: 'consumed', host: record.host };
}

/** Clears handoffs and claim/temporary leftovers older than the lifetime. Best effort; returns how many entries it removed. */
export function sweepAntigravityHostHandoffs({ root, now = Date.now() } = {}) {
  let removed = 0;
  try {
    const directory = antigravityHostHandoffDirectory(root);
    if (directory === null || !plainDirectory(directory)) return { removed };
    for (const name of readdirSync(directory)) {
      const entry = join(directory, name);
      try {
        const stat = lstatSync(entry);
        if (stat.isDirectory() || now - stat.mtimeMs <= ANTIGRAVITY_HOST_HANDOFF_TTL_MS) continue;
        unlinkSync(entry);
        removed += 1;
      } catch { /* a concurrent consumer or sweep got there first */ }
    }
  } catch { /* nothing to clear */ }
  return { removed };
}

/**
 * The established Antigravity brain layout, as ONE shared predicate (G13; AC-175 part B reads the same layout): a conversation
 * id, its artifact root `<...>/brain/<conversationId>` with no repository, credential, plugin or cache part, the fixed transcript
 * `<artifactRoot>/.system_generated/logs/transcript.jsonl`, an exact workspace match for `root`, and physical (non-symlink)
 * `root` and artifact root. It reads nothing and admits nothing by itself.
 */
export function antigravityArtifactLayoutIsValid(host, root) {
  if (!host || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(host.conversationId ?? '')) return false;
  const artifactRoot = host.artifactDirectoryPath;
  return !(typeof artifactRoot !== 'string' || basename(artifactRoot) !== host.conversationId
    || basename(dirname(artifactRoot)) !== 'brain'
    || artifactRoot.split(sep).some((part) => /^(?:\.git|\.ssh|\.aws|\.codex|\.claude|plugins?|cache|marketplaces?|installations?|credentials?|keys?)$/iu.test(part))
    || host.transcriptPath !== join(artifactRoot, '.system_generated', 'logs', 'transcript.jsonl')
    || !Array.isArray(host.workspacePaths) || !host.workspacePaths.includes(root)
    || !physical(root, 'directory') || !physical(artifactRoot, 'directory'));
}

/** A permission check only: never copies or reads a transcript. Exact new PNG
 * at the current host root, one regular project PNG source, no extra operands.
 * The registered AGY adapter reconstructs the context from original top-level
 * system fields; Claude/Codex cannot select this route with an input field.
 */
export function isCurrentSessionArtifactExport(input, root, { runner } = {}) {
  if (runner !== 'antigravity' || input?.tool_name !== 'Bash') return false;
  const host = input.antigravity_artifact_host;
  if (!antigravityArtifactLayoutIsValid(host, root)) return false;
  const artifactRoot = host.artifactDirectoryPath;
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

export const ARTIFACT_COPY_ROUTE_HINT = 'AGY-ARTIFACT-COPY-ROUTE: an image for the current conversation goes into its artifact directory with exactly '
  + '`cp [--] <regular PNG inside the project> <new .png directly in the current artifact directory>`: one source, no options, no glob, '
  + 'a target that does not exist yet, the absolute artifact directory of this conversation and no other.';

/** True when a refused command aims a copy or move at an Antigravity brain directory; read-only, never a permission. */
function aimsAtArtifactDirectory(input) {
  if (input?.tool_name !== 'Bash' || typeof input.tool_input?.command !== 'string') return false;
  const parsed = parseGuardCommand(input.tool_input.command, input.cwd ?? process.cwd(), { platform: 'linux' });
  if (parsed.parseStatus !== 'accepted') return false;
  return parsed.segments.some((segment) => ['cp', 'mv', 'install'].includes(segment.executable)
    && segment.argv.some((arg) => /(?:^|[\\/])brain[\\/][A-Fa-f0-9-]{36}(?:[\\/]|$)/u.test(arg)));
}

export function crossRepositoryDenialReason(denials, input) {
  // The shared guard already selected the exact HGO recovery. A second adapter
  // classification used to label every outside target as a plugin cache.
  const reason = denials.map((entry) => entry.reason).join('\n');
  // G13: a refused artifact copy names the one admitted shape, after the authoritative recovery.
  return aimsAtArtifactDirectory(input) ? `${reason}\n${ARTIFACT_COPY_ROUTE_HINT}` : reason;
}
