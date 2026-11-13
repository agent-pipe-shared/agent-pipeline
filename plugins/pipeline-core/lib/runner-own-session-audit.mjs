// SPDX-License-Identifier: SUL-1.0
// Private implementation of runner-transcript-recovery's consented metadata lane.
//
// One repository-bound audit of the ACTIVE Codex session. The active session id is resolved from the
// host environment inside this process (the caller never supplies a selector, a pathname or a read
// grant, and no shell variable query is involved). The session store is enumerated newest-first and
// filtered by the first record of each file, so a foreign session costs one small head read instead of
// a prefix read. Segments of this repository that belong to the active session's lineage (the session
// it was spawned or forked from, and the sessions spawned or forked from it) are described by
// pseudonymized, bounded metadata only; no transcript content and no storage path leave this module.
//
// A bound reached while enumerating is reported (`truncated`, `completeness: "partial"`,
// `incompleteReasons`, `limits`, `scan`) rather than failing the audit, except when the active session
// itself was not found before the bound was reached.
import { constants, lstatSync, realpathSync, opendirSync, openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { resolveModelRoleHostSessionIdentity } from './model-role-host-identity.mjs';

// C29 (Codex run 3, C1; PO tile 2026-11-13 "full paginated audit export"): a lineage member is read whole, page by page
// (`windowBytes` per page, one running sha256 over [0, snapshot size)), never by head and tail windows. Memory stays one page plus one
// record; `segmentBytes` bounds the bytes of all non-current members together and `recordBytes` the one record a page boundary splits.
const LIMIT = {
  entries: 20_000, directories: 4_096, depth: 8,
  headBytes: 512 * 1024, headChunk: 16 * 1024, scanBytes: 256 * 1024 * 1024,
  windowBytes: 2 * 1024 * 1024, segmentBytes: 1024 * 1024 * 1024, recordBytes: 16 * 1024 * 1024,
  repositorySessions: 2_048, segments: 64, lineageDepth: 16,
};
const SCHEMA = 'pipeline.runner-own-session-audit.v1';
const COUNTER_KEYS = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const EVENT_LABEL = /^[a-z][a-z0-9_.-]{0,47}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/u;
const BOUND_REASON = /-bound-reached$/u;
const digest = value => createHash('sha256').update(value).digest('hex');
const result = (reason, extra = {}) => ({ schema: SCHEMA, runner: 'codex', status: 'unavailable', reason, ...extra });
const fail = code => { throw new Error(code); };
const label = value => (typeof value === 'string' && EVENT_LABEL.test(value) ? value : 'other');
const iso = ms => (ms === null ? 'unavailable' : new Date(ms).toISOString());

/** Test seam only: the CLI never passes it. Unknown or non-positive bounds make the invocation invalid. */
function limitsFrom(internals) {
  if (internals === undefined) return { ...LIMIT };
  if (!internals || typeof internals !== 'object' || Array.isArray(internals)
    || Object.keys(internals).some(key => !['limits', 'afterRead'].includes(key))
    || (internals.afterRead !== undefined && typeof internals.afterRead !== 'function')) return null;
  const supplied = internals.limits ?? {};
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) return null;
  for (const [key, value] of Object.entries(supplied)) {
    if (!Object.hasOwn(LIMIT, key) || !Number.isSafeInteger(value) || value < 1) return null;
  }
  return { ...LIMIT, ...supplied };
}

function physical(path, directory) {
  const resolved = resolve(path);
  if (realpathSync(resolved) !== resolved) fail('path-alias');
  for (let part = resolved; ; part = dirname(part)) {
    if (lstatSync(part).isSymbolicLink()) fail('path-alias');
    if (dirname(part) === part) break;
  }
  const stat = lstatSync(resolved);
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) fail('path-alias');
  return resolved;
}

/**
 * Open a regular file without following a link, run `use(fd, size)`, and prove the same file was read.
 * A session log is append-only and a live one grows while it is audited, so growth is tolerated; a
 * replaced, re-linked or shortened file is not the file that was read.
 */
function withFile(path, hook, use) {
  physical(path, false);
  if (constants.O_NOFOLLOW === undefined) fail('nofollow-unavailable');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1) fail('path-alias');
    const value = use(fd, before.size);
    hook?.(path);
    const after = fstatSync(fd), pathname = lstatSync(path);
    if (before.dev !== pathname.dev || before.ino !== pathname.ino || after.nlink !== 1 || after.size < before.size) fail('snapshot-changed');
    return { value, size: before.size, grew: after.size > before.size };
  } finally { closeSync(fd); }
}

function readAt(fd, start, end) {
  const bytes = Buffer.alloc(end - start);
  for (let offset = 0; offset < bytes.length;) {
    const got = readSync(fd, bytes, offset, bytes.length - offset, start + offset);
    if (!got) fail('snapshot-changed');
    offset += got;
  }
  return bytes;
}

/** The first complete line of a session file; never a clipped or in-progress record. */
function firstRecord(path, hook, LIM, scan) {
  return withFile(path, hook, (fd, size) => {
    const cap = Math.min(size, LIM.headBytes), parts = [];
    for (let have = 0; have < cap;) {
      const end = Math.min(cap, have + LIM.headChunk), chunk = readAt(fd, have, end);
      scan.bytesRead += chunk.length;
      const newline = chunk.indexOf(10);
      if (newline >= 0) { parts.push(chunk.subarray(0, newline)); return { status: 'record', text: Buffer.concat(parts).toString('utf8') }; }
      parts.push(chunk);
      have = end;
    }
    return { status: size > cap ? 'oversized' : 'incomplete' };
  }).value;
}

// Assumed Codex session_meta linkage to the session this one was forked or spawned from. These two
// spellings are not verified against a live session store; a session without either has no parent.
function parentOf(meta) {
  for (const candidate of [meta.forked_from_id, meta.source?.subagent?.thread_spawn?.parent_thread_id]) {
    if (typeof candidate === 'string' && SESSION_ID.test(candidate)) return candidate;
  }
  return null;
}

/** Newest-first, repository-filtered enumeration. Foreign sessions are counted and discarded. */
function enumerate(storage, root, active, LIM, hook) {
  const scan = { entriesVisited: 0, directoriesVisited: 0, candidateFiles: 0, foreignSessions: 0, repositorySessions: 0,
    nonSessionFiles: 0, skippedCandidates: 0, bytesRead: 0 };
  const reasons = new Set(), repository = [], activeFiles = [], stack = [{ path: storage, depth: 0 }], cache = new Map(), foreignIds = new Set();
  let firstFailure = null, stop = false;
  const inRepository = cwd => {
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) return false;
    if (resolve(cwd) === root) return true;
    if (!cache.has(cwd)) {
      let real = null;
      try { real = realpathSync(cwd); } catch { /* A vanished working directory is not this repository. */ }
      cache.set(cwd, real === root);
    }
    return cache.get(cwd);
  };
  while (stack.length && !stop) {
    const directory = stack.pop();
    if (directory.depth > LIM.depth) { reasons.add('depth-bound-reached'); continue; }
    if (scan.directoriesVisited >= LIM.directories) { reasons.add('directory-bound-reached'); break; }
    scan.directoriesVisited += 1;
    physical(directory.path, true);
    const names = [], handle = opendirSync(directory.path);
    try { for (let entry; (entry = handle.readSync()) !== null;) {
      if (scan.entriesVisited >= LIM.entries) { reasons.add('entry-bound-reached'); stop = true; break; }
      scan.entriesVisited += 1;
      if (entry.isSymbolicLink()) fail('path-alias');
      names.push({ name: entry.name, directory: entry.isDirectory(), file: entry.isFile() });
    } } finally { handle.closeSync(); }
    names.sort((left, right) => (left.name < right.name ? 1 : left.name > right.name ? -1 : 0));
    for (const entry of names) {
      if (!entry.file || !entry.name.endsWith('.jsonl')) continue;
      if (scan.bytesRead >= LIM.scanBytes) { reasons.add('scan-byte-bound-reached'); stop = true; break; }
      scan.candidateFiles += 1;
      const path = join(directory.path, entry.name), head = firstRecord(path, hook, LIM, scan);
      if (head.status === 'oversized') { scan.skippedCandidates += 1; firstFailure ??= 'record-bound-exceeded'; continue; }
      if (head.status === 'incomplete' || !head.text.trim()) { scan.skippedCandidates += 1; continue; }
      let row;
      try { row = JSON.parse(head.text); } catch { scan.skippedCandidates += 1; firstFailure ??= 'metadata-malformed'; continue; }
      const meta = row?.type === 'session_meta' && row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : null;
      if (meta === null || typeof meta.id !== 'string') { scan.nonSessionFiles += 1; continue; }
      if (meta.id === active) {
        if (typeof meta.cwd !== 'string' || !isAbsolute(meta.cwd) || physical(meta.cwd, true) !== root) fail('session-repository-conflict');
        if (activeFiles.length) fail('session-identity-ambiguous');
        activeFiles.push({ path, id: meta.id, parentId: parentOf(meta) });
      } else if (!inRepository(meta.cwd)) { scan.foreignSessions += 1; if (SESSION_ID.test(meta.id)) foreignIds.add(meta.id); }
      else if (repository.length >= LIM.repositorySessions) reasons.add('repository-session-bound-reached');
      else repository.push({ path, id: meta.id, parentId: parentOf(meta) });
    }
    // Ascending push order pops the greatest (newest) directory name first.
    for (const entry of [...names].reverse()) if (entry.directory) stack.push({ path: join(directory.path, entry.name), depth: directory.depth + 1 });
  }
  scan.repositorySessions = repository.length + activeFiles.length;
  return { scan, reasons, repository, activeFiles, firstFailure, foreignIds };
}

/** The active session, the sessions it descends from, and the sessions descending from it. */
function lineageOf(active, repository, LIM, reasons) {
  const byId = new Map(), children = new Map();
  for (const session of repository) {
    byId.set(session.id, [...(byId.get(session.id) ?? []), session]);
    if (session.parentId) children.set(session.parentId, [...(children.get(session.parentId) ?? []), session.id]);
  }
  const members = [{ ...active, role: 'current', depth: 0 }], seen = new Set([active.id]);
  let cursor = active.parentId;
  for (let hops = 1; cursor; hops += 1) {
    if (seen.has(cursor)) { reasons.add('lineage-cycle'); break; }
    if (hops > LIM.lineageDepth) { reasons.add('lineage-depth-bound-reached'); break; }
    const files = byId.get(cursor);
    if (!files) { reasons.add('parent-segment-not-found'); break; }
    seen.add(cursor);
    for (const file of files) members.push({ ...file, role: 'parent', depth: -hops });
    cursor = files[0].parentId;
  }
  const queue = [{ id: active.id, depth: 0 }];
  while (queue.length) {
    const { id, depth } = queue.shift();
    for (const kid of new Set(children.get(id) ?? [])) {
      if (seen.has(kid)) continue;
      if (depth + 1 > LIM.lineageDepth) { reasons.add('lineage-depth-bound-reached'); continue; }
      seen.add(kid);
      for (const file of byId.get(kid)) members.push({ ...file, role: 'child', depth: depth + 1 });
      queue.push({ id: kid, depth: depth + 1 });
    }
  }
  if (members.length > LIM.segments) { members.length = LIM.segments; reasons.add('segment-bound-reached'); }
  return members;
}

function stampOf(row) {
  for (const candidate of [row?.timestamp, row?.payload?.timestamp]) {
    if (typeof candidate !== 'string' || !ISO_TIMESTAMP.test(candidate)) continue;
    const ms = Date.parse(candidate);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function eventOf(row) {
  const event = { type: label(row?.type) };
  if (typeof row?.payload?.type === 'string') event.subtype = label(row.payload.type);
  return event;
}

const TOOL_CALL_TYPES = new Set(['function_call', 'custom_tool_call', 'local_shell_call']);

/** The agent id a Codex spawn result names (`{"agent_id": ...}`, the shape the export reads too), or null. */
function spawnedAgentId(payload) {
  if (payload?.type !== 'function_call_output') return null;
  let value = payload.output;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  return value && typeof value === 'object' && typeof value.agent_id === 'string' && SESSION_ID.test(value.agent_id) ? value.agent_id : null;
}

/**
 * Read one lineage member whole, page by page, and fold it into bounded metadata. Every byte of [0, snapshot size) is read and
 * hashed; a record a page boundary splits is carried (up to `recordBytes`). Not unread: bytes appended after the snapshot size
 * (a live session grows; `grewDuringRead`), a last line without its newline (an in-progress record; `trailingPartialBytes`) and
 * a record too long to parse (read and hashed, counted in `unparsedRecordCount`).
 */
function observe(member, root, LIM, hook, budget) {
  const fold = { rows: 0, unparsed: 0, firstRow: undefined, lastRow: undefined, startMs: null, endMs: null, modelIdentity: 'unavailable',
    first: null, last: null, observations: 0, turns: 0, toolCalls: 0, spawned: new Set(), metaConflict: false };
  const take = (line) => {
    if (line.length === 0 || !line.toString('utf8').trim()) return;
    if (line.length > LIM.recordBytes) { fold.unparsed += 1; return; }
    let row;
    try { row = JSON.parse(line.toString('utf8')); } catch { fold.unparsed += 1; return; }
    fold.rows += 1;
    if (fold.firstRow === undefined) fold.firstRow = row;
    fold.lastRow = row;
    // Only the first record names the session. A later session_meta (a fork or a resume can carry one) must not claim another
    // working directory for the same id; another id is history this file carries, never an identity.
    if (fold.rows > 1 && row?.type === 'session_meta' && row.payload?.id === member.id && row.payload?.cwd !== fold.firstRow?.payload?.cwd) fold.metaConflict = true;
    const ms = stampOf(row);
    if (ms !== null) { fold.startMs = fold.startMs === null ? ms : Math.min(fold.startMs, ms); fold.endMs = fold.endMs === null ? ms : Math.max(fold.endMs, ms); }
    if (row?.type === 'turn_context') {
      fold.turns += 1;
      if (typeof row.payload?.model === 'string' && /^(?:gpt-|codex-|o[1-9])[A-Za-z0-9._-]{1,80}$/u.test(row.payload.model)) fold.modelIdentity = row.payload.model;
    }
    if (row?.type === 'response_item' && TOOL_CALL_TYPES.has(row.payload?.type)) fold.toolCalls += 1;
    if (row?.type === 'response_item') { const spawned = spawnedAgentId(row.payload); if (spawned !== null) fold.spawned.add(spawned); }
    if (row?.type === 'event_msg' && row.payload?.type === 'token_count') {
      const usage = row.payload.info?.total_token_usage;
      if (usage && COUNTER_KEYS.every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)) {
        fold.last = Object.fromEntries(COUNTER_KEYS.map(key => [key, usage[key]]));
        fold.first ??= fold.last;
        fold.observations += 1;
      } else fold.last = 'unavailable';
    }
  };
  const { value, size, grew } = withFile(member.path, hook, (fd, length) => {
    const hash = createHash('sha256');
    // `carry` holds the start of a record a page boundary split. A record longer than recordBytes is still read and hashed, but
    // its bytes are not kept (`overflow`) and it counts once as unparsed when its newline arrives.
    let carry = [], carryBytes = 0, overflow = false, overflowBytes = 0, pages = 0, read = 0;
    for (let start = 0; start < length; start += LIM.windowBytes) {
      const page = readAt(fd, start, Math.min(length, start + LIM.windowBytes));
      hash.update(page); pages += 1; read += page.length;
      let from = 0;
      for (let newline = page.indexOf(10); newline >= 0; newline = page.indexOf(10, from)) {
        if (overflow) fold.unparsed += 1;
        else take(carryBytes ? Buffer.concat([...carry, page.subarray(from, newline)]) : page.subarray(from, newline));
        carry = []; carryBytes = 0; overflow = false; overflowBytes = 0; from = newline + 1;
      }
      const rest = page.subarray(from);
      if (overflow) overflowBytes += rest.length;
      else if (carryBytes + rest.length > LIM.recordBytes) { overflow = true; overflowBytes = carryBytes + rest.length; carry = []; carryBytes = 0; }
      else if (rest.length > 0) { carry.push(rest); carryBytes += rest.length; }
    }
    return { pages, read, trailing: overflow ? overflowBytes : carryBytes, contentSha256: hash.digest('hex') };
  });
  budget.bytes += value.read;
  if (fold.firstRow?.type !== 'session_meta' || fold.firstRow.payload?.id !== member.id) fail('session-identity-changed');
  if (member.role === 'current') {
    const cwd = fold.firstRow.payload.cwd;
    if (fold.metaConflict || typeof cwd !== 'string' || !isAbsolute(cwd) || physical(cwd, true) !== root) fail('session-repository-conflict');
  }
  const tokenCounters = fold.last ?? 'unavailable';
  const delta = fold.observations >= 2 && tokenCounters !== 'unavailable'
    ? Object.fromEntries(COUNTER_KEYS.map(key => [key, tokenCounters[key] - fold.first[key]])) : null;
  return {
    sortMs: fold.startMs, role: member.role, depth: member.depth, sessionSha256: digest(member.id), spawnedIds: fold.spawned,
    ...(member.parentId ? { parentSessionSha256: digest(member.parentId) } : {}),
    startedAt: iso(fold.startMs), endedAt: iso(fold.endMs), elapsedMs: fold.startMs === null || fold.endMs === null ? 'unavailable' : fold.endMs - fold.startMs,
    firstEvent: eventOf(fold.firstRow), lastEvent: eventOf(fold.lastRow),
    recordCount: fold.rows, unparsedRecordCount: fold.unparsed,
    observation: value.read === size ? 'complete' : 'partial', unreadBytes: size - value.read, grewDuringRead: grew,
    snapshotBytes: size, pages: value.pages, contentSha256: value.contentSha256, trailingPartialBytes: value.trailing,
    turnCount: fold.turns, toolCallCount: fold.toolCalls,
    modelIdentity: fold.modelIdentity, tokenCounters, tokenObservations: fold.observations,
    tokenDelta: delta && COUNTER_KEYS.every(key => delta[key] >= 0) ? delta : 'unavailable',
  };
}

/**
 * C29 (C1): the one completeness verdict. Complete only when every byte of every lineage member was read, no spawned child is
 * missing and no other reason was recorded; anything else is partial, and every sum built from the segments says so.
 */
export function auditCompleteness({ unreadBytes, unknownChildren, incompleteReasons }) {
  return unreadBytes === 0 && unknownChildren === 0 && incompleteReasons.length === 0 ? 'complete' : 'partial';
}

/**
 * No supplied session selector, storage pathname, transcript body, or read grant. The optional second
 * argument is a test seam (`limits`, `afterRead`) that no command-line route supplies.
 */
export function auditCurrentRunnerSession(options = {}, internals = undefined) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['rootDir', 'runner', 'metadataConsent', 'operation'].includes(key))
    || (options.operation !== undefined && options.operation !== 'audit-current')) return result('invalid-invocation');
  const LIM = limitsFrom(internals);
  if (LIM === null) return result('invalid-invocation');
  const { rootDir, runner, metadataConsent } = options;
  if (metadataConsent !== 'approved') return result('metadata-consent-required');
  if (runner !== 'codex') return result('runner-unavailable');
  const identity = resolveModelRoleHostSessionIdentity({ runner });
  if (!identity.ok) return result(identity.code);
  try {
    if (typeof rootDir !== 'string' || !isAbsolute(rootDir)) fail('repository-unavailable');
    const root = physical(rootDir, true);
    const configured = process.env.CODEX_HOME;
    if (configured !== undefined && !isAbsolute(configured)) fail('storage-unavailable');
    const storage = physical(join(configured ?? join(homedir(), '.codex'), 'sessions'), true);
    const hook = internals?.afterRead;
    const found = enumerate(storage, root, identity.sessionId, LIM, hook);
    if (!found.activeFiles.length) {
      if (found.reasons.size > 0) {
        return result('scan-bound-exceeded', { truncated: true, incompleteReasons: [...found.reasons].sort(), limits: LIM, scan: found.scan });
      }
      fail(found.firstFailure ?? 'current-session-unavailable');
    }
    const reasons = found.reasons, budget = { bytes: 0 }, segments = [], members = lineageOf(found.activeFiles[0], found.repository, LIM, reasons);
    // C29 (C1): a member that does not fit the byte bound is not read at all and its whole size is counted unread, never dropped silently.
    let unreadBytes = 0, unreadSegments = 0;
    for (const member of members) {
      if (member.role !== 'current') {
        const size = lstatSync(member.path).size;
        if (budget.bytes + size > LIM.segmentBytes) { reasons.add('segment-byte-bound-reached'); unreadBytes += size; unreadSegments += 1; continue; }
      }
      segments.push(observe(member, root, LIM, hook, budget));
    }
    unreadBytes += segments.reduce((sum, segment) => sum + segment.unreadBytes, 0);
    if (unreadBytes > 0) reasons.add('segment-bytes-unread');
    // C29 (C1): every child a lineage member spawned (its spawn result names the agent id) must be a member itself. A child that ran
    // in another working directory is named as such; one with no session file found is unknown. Only counts leave this module.
    const memberIds = new Set(members.map(member => member.id));
    const spawned = new Set(segments.flatMap(segment => [...segment.spawnedIds]));
    const missing = [...spawned].filter(id => !memberIds.has(id));
    const outsideChildren = missing.filter(id => found.foreignIds.has(id)).length;
    const unknownChildren = missing.length - outsideChildren;
    if (outsideChildren > 0) reasons.add('child-outside-repository');
    if (unknownChildren > 0) reasons.add('child-segment-not-found');
    segments.sort((left, right) => left.depth - right.depth
      || (left.sortMs === null) - (right.sortMs === null) || (left.sortMs ?? 0) - (right.sortMs ?? 0)
      || (left.sessionSha256 < right.sessionSha256 ? -1 : left.sessionSha256 > right.sessionSha256 ? 1 : 0));
    const current = segments.find(segment => segment.role === 'current');
    const fresh = resolveModelRoleHostSessionIdentity({ runner });
    if (!fresh.ok || fresh.sessionId !== identity.sessionId || physical(root, true) !== root
      || physical(storage, true) !== storage) fail('session-identity-changed');
    if (found.scan.skippedCandidates > 0) reasons.add('candidates-skipped');
    if (segments.some(segment => segment.unparsedRecordCount > 0)) reasons.add('records-skipped');
    const starts = segments.map(segment => segment.sortMs).filter(ms => ms !== null);
    const ends = segments.map(segment => Date.parse(segment.endedAt)).filter(ms => Number.isFinite(ms));
    const incompleteReasons = [...reasons].sort();
    const distinct = role => new Set(segments.filter(segment => segment.role === role).map(segment => segment.sessionSha256)).size;
    found.scan.segmentBytesRead = budget.bytes;
    const completeness = auditCompleteness({ unreadBytes, unknownChildren, incompleteReasons });
    const tokenTotals = segments.every(segment => segment.tokenDelta !== 'unavailable')
      ? Object.fromEntries(COUNTER_KEYS.map(key => [key, segments.reduce((sum, segment) => sum + segment.tokenDelta[key], 0)])) : 'unavailable';
    return { schema: SCHEMA, runner, status: 'available',
      identityAssurance: 'host-environment-and-local-session-metadata',
      sessionSha256: digest(identity.sessionId), repositorySha256: digest(root),
      modelIdentity: current.modelIdentity, phaseWallTime: 'unavailable', tokenCounters: current.tokenCounters,
      startedAt: iso(starts.length ? Math.min(...starts) : null), endedAt: iso(ends.length ? Math.max(...ends) : null),
      completeness,
      truncated: incompleteReasons.some(reason => BOUND_REASON.test(reason)), incompleteReasons,
      unreadBytes, unreadSegments, unknownChildren, outsideChildren,
      // Sums over the segments that were read. `status` says whether they are the whole lineage: a partial audit gives partial sums.
      totals: { status: completeness, segments: segments.length, records: segments.reduce((sum, segment) => sum + segment.recordCount, 0),
        turns: segments.reduce((sum, segment) => sum + segment.turnCount, 0), toolCalls: segments.reduce((sum, segment) => sum + segment.toolCallCount, 0),
        tokenDelta: tokenTotals },
      limits: LIM, scan: found.scan,
      lineage: { ancestors: distinct('parent'), descendants: distinct('child') },
      segmentCount: segments.length,
      segments: segments.map(({ sortMs, spawnedIds, ...segment }, ordinal) => ({ ordinal, ...segment, spawnedChildren: spawnedIds.size })),
      privacy: { transcriptContent: 'excluded', storagePaths: 'excluded', identifiers: 'sha256' } };
  } catch (error) {
    const known = new Set(['path-alias', 'nofollow-unavailable', 'snapshot-changed',
      'record-bound-exceeded', 'metadata-malformed', 'session-repository-conflict', 'repository-unavailable',
      'storage-unavailable', 'session-identity-ambiguous', 'current-session-unavailable', 'session-identity-changed']);
    return result(known.has(error.message) ? error.message : 'host-metadata-unavailable');
  }
}
