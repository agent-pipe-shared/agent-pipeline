#!/usr/bin/env node
// handover-rotate.mjs
//
// Rotation/archive mechanism for a project's handover file (default
// `docs/state.md`), per ADR-0064 (this repo) porting Nova's ADR-0066 shape.
//
// Safety property this script exists to enforce structurally, not just
// procedurally (ADR-0060's own warning: "a rotation that only deletes
// destroys rules that exist nowhere else"):
//
//   A section may only be archived once it carries the section-scoped
//   extraction-acknowledgment marker `pipeline.handover-rotation-extraction-ack.v2`
//   as the FIRST non-blank line of the section body (immediately after its
//   `## ` header line):
//
//     <!-- pipeline.handover-rotation-extraction-ack.v2: true -->
//
//   A section without this marker is NEVER included in an archive plan,
//   in EITHER --dry-run or --execute mode. This is not a convenience default
//   -- it is the mechanism refusing to guess at "already extracted".
//
// Modes:
//   --dry-run     (default) Computes the rotation plan and writes a full,
//                 human-readable preview to --out (default:
//                 scratch/state-rotation-dry-run-preview.md). NEVER writes
//                 to the handover file itself.
//   --execute     Would perform the real rewrite: split the handover file,
//                 write archived sections to docs/state-archive/, rewrite
//                 the live file with only the operative head plus an
//                 "## Archived history" pointer table. Exists in this file's
//                 own code for future use; THIS DISPATCH NEVER PASSES IT.
//   --check-size  Lightweight gate check for close-block wiring: reports the
//                 handover file's current byte size against the configured
//                 threshold and exits 1 if over (0 otherwise). Read-only,
//                 makes no rotation decision, touches no file.
//
// CLI flags:
//   --file <path>          handover file (default: docs/state.md)
//   --max-bytes <n>        operative-head byte budget (default: 12000,
//                           ADR-0064 Decision 4's inherited Nova default)
//   --keep-sections <n>    always keep at least this many of the most
//                           recent top-level sections in the head,
//                           regardless of size (default: 2, mirrors
//                           close-block SKILL.md step 6c's "last 2 full
//                           session/block entries")
//   --archive-dir <path>   archive directory (default: docs/state-archive)
//   --out <path>           dry-run preview output path (default:
//                           scratch/state-rotation-dry-run-preview.md)
//
// Exit codes: 0 success; 1 --check-size over threshold; 2 usage/read error.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const ACK_MARKER_RE =
  /^<!--\s*pipeline\.handover-rotation-extraction-ack\.v2\s*:\s*true\s*-->\s*$/;

const DEFAULT_MAX_BYTES = 12000;
const DEFAULT_KEEP_SECTIONS = 2;

/**
 * Split a handover file's text into a preamble (everything before the
 * first top-level `## ` header) and an ordered array of sections. Section
 * order in the returned array matches the file's own top-to-bottom order,
 * which for this repo's `docs/state.md` is NEWEST FIRST (checkpoint N at
 * the top, checkpoint 1 and inherited history at the bottom).
 *
 * @param {string} text
 * @returns {{ preamble: string, sections: Array<{header: string, body: string, startLine: number, acked: boolean}> }}
 */
export function parseSections(text) {
  const lines = text.split('\n');
  const headerIdx = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^## /.test(lines[i])) headerIdx.push(i);
  }
  const preambleLines = headerIdx.length > 0 ? lines.slice(0, headerIdx[0]) : lines.slice();
  const preamble = preambleLines.join('\n');

  const sections = [];
  for (let s = 0; s < headerIdx.length; s++) {
    const start = headerIdx[s];
    const end = s + 1 < headerIdx.length ? headerIdx[s + 1] : lines.length;
    const sectionLines = lines.slice(start, end);
    const header = sectionLines[0];
    const body = sectionLines.join('\n');
    // Ack marker must be the first non-blank line AFTER the header.
    let acked = false;
    for (let i = 1; i < sectionLines.length; i++) {
      const t = sectionLines[i].trim();
      if (t === '') continue;
      acked = ACK_MARKER_RE.test(t);
      break;
    }
    sections.push({ header, body, startLine: start + 1, acked });
  }
  return { preamble, sections };
}

function byteLen(s) {
  return Buffer.byteLength(s, 'utf8');
}

/**
 * Compute a rotation plan: which sections (oldest-first from the BOTTOM of
 * the file) can be archived without violating the ack-marker safety
 * property or the keepSections floor, and how many bytes that would free.
 *
 * Archival candidates are taken strictly from the bottom (oldest) upward,
 * and the scan STOPS at the first un-acked section encountered — sections
 * older still than an un-acked blocker are reported separately as
 * "blocked behind an un-acknowledged section" rather than silently skipped
 * past, since archiving around a gap would make the remaining head's
 * chronological story incoherent.
 *
 * @param {{ preamble: string, sections: Array<{header:string, body:string, startLine:number, acked:boolean}> }} parsed
 * @param {{ maxBytes: number, keepSections: number }} opts
 */
export function computePlan(parsed, opts) {
  const { preamble, sections } = parsed;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const keepSections = opts.keepSections ?? DEFAULT_KEEP_SECTIONS;

  const totalBytes = byteLen(preamble) + sections.reduce((a, s) => a + byteLen(s.body), 0);

  // Indices eligible for archival consideration at all: everything except
  // the most recent `keepSections` sections (index 0..keepSections-1).
  const archivableRangeStart = Math.min(keepSections, sections.length);

  // Scan from the END (oldest) toward archivableRangeStart, collecting a
  // contiguous run of ACKED sections. Stop at the first un-acked section.
  const toArchive = [];
  let blockedAt = null;
  for (let i = sections.length - 1; i >= archivableRangeStart; i--) {
    if (sections[i].acked) {
      toArchive.push(i);
    } else {
      blockedAt = i;
      break;
    }
  }
  toArchive.reverse(); // restore file order (oldest-of-the-archived-run first)

  const archivedBytes = toArchive.reduce((a, i) => a + byteLen(sections[i].body), 0);
  const remainingHeadBytes = totalBytes - archivedBytes;

  const unackedBlocking = sections
    .map((s, i) => ({ i, s }))
    .filter(({ i }) => i >= archivableRangeStart && !toArchive.includes(i));

  return {
    totalBytes,
    maxBytes,
    keepSections,
    archivableRangeStart,
    toArchiveIndices: toArchive,
    archivedBytes,
    remainingHeadBytes,
    overBudgetBefore: totalBytes > maxBytes,
    overBudgetAfter: remainingHeadBytes > maxBytes,
    blockedAtIndex: blockedAt,
    unackedBlockingIndices: unackedBlocking.map((x) => x.i),
  };
}

function headerSummary(header) {
  return header.length > 140 ? header.slice(0, 137) + '...' : header;
}

function renderPreview({ file, parsed, plan }) {
  const lines = [];
  lines.push('# Handover rotation — DRY-RUN preview (no files modified)');
  lines.push('');
  lines.push(`Generated by \`plugins/pipeline-core/scripts/handover-rotate.mjs --dry-run\`.`);
  lines.push(`Source file: \`${file}\` — read-only for this preview; NOT modified.`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Current total size: **${plan.totalBytes} bytes** (${parsed.sections.length} top-level sections)`);
  lines.push(`- Configured operative-head budget: **${plan.maxBytes} bytes**`);
  lines.push(`- Keep-sections floor (most recent, never archived regardless of size): **${plan.keepSections}**`);
  lines.push(`- Over budget today: **${plan.overBudgetBefore ? 'YES' : 'no'}**`);
  lines.push('');
  if (plan.toArchiveIndices.length === 0) {
    lines.push(
      '**Proposed archive set is EMPTY.** No section beyond the keep-sections floor currently ' +
        'carries the `pipeline.handover-rotation-extraction-ack.v2` marker, so this mechanism ' +
        'correctly refuses to archive anything yet — archiving an un-acknowledged section would ' +
        'risk destroying a durable rule that exists nowhere else (ADR-0060).'
    );
  } else {
    lines.push(
      `**Proposed archive set: ${plan.toArchiveIndices.length} section(s), freeing ${plan.archivedBytes} bytes.** ` +
        `Resulting head would be ${plan.remainingHeadBytes} bytes ` +
        `(${plan.overBudgetAfter ? 'still OVER budget' : 'under budget'}).`
    );
  }
  lines.push('');
  lines.push('## Sections that WOULD be archived (oldest-first, all ack-marker verified)');
  lines.push('');
  if (plan.toArchiveIndices.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const i of plan.toArchiveIndices) {
      const s = parsed.sections[i];
      lines.push(`- line ${s.startLine}: ${headerSummary(s.header)} — ${byteLen(s.body)} bytes`);
    }
  }
  lines.push('');
  lines.push('## Sections that stay in the head (kept-floor or blocked-by-missing-ack)');
  lines.push('');
  for (let i = 0; i < parsed.sections.length; i++) {
    if (plan.toArchiveIndices.includes(i)) continue;
    const s = parsed.sections[i];
    const why =
      i < plan.archivableRangeStart
        ? 'kept (recency floor)'
        : plan.unackedBlockingIndices.includes(i)
        ? 'BLOCKED — extraction not yet acknowledged'
        : 'kept (behind a blocked section)';
    lines.push(`- line ${s.startLine}: ${headerSummary(s.header)} — ${byteLen(s.body)} bytes — ${why}`);
  }
  lines.push('');
  lines.push('## What an --execute run would additionally require');
  lines.push('');
  lines.push(
    '- A human-reviewed go-ahead on THIS preview (this dispatch stops here by design).'
  );
  lines.push(
    '- Creation of `docs/state-archive/` (does not exist yet in this repo) with a dated, ' +
      'self-contained file per rotation event, per ADR-0064 Decision 3.'
  );
  lines.push(
    '- Rewriting the live handover file with only its operative head plus an ' +
      '"## Archived history" pointer table — never invoked by this dispatch.'
  );
  lines.push('');
  return lines.join('\n');
}

function readCalibratedMaxBytes(cwd) {
  const candidates = [
    path.join(cwd, 'project', 'pipeline.json'),
    path.join(cwd, '.claude', 'pipeline.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      const v = j?.handover?.maxBytes;
      if (typeof v === 'number' && v > 0) return v;
    } catch {
      // fall through to next candidate / default
    }
  }
  return null;
}

function parseArgs(argv) {
  const out = {
    mode: 'dry-run',
    file: 'docs/state.md',
    maxBytes: null,
    keepSections: DEFAULT_KEEP_SECTIONS,
    archiveDir: 'docs/state-archive',
    out: 'scratch/state-rotation-dry-run-preview.md',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--execute') out.mode = 'execute';
    else if (a === '--dry-run') out.mode = 'dry-run';
    else if (a === '--check-size') out.mode = 'check-size';
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--max-bytes') out.maxBytes = Number(argv[++i]);
    else if (a === '--keep-sections') out.keepSections = Number(argv[++i]);
    else if (a === '--archive-dir') out.archiveDir = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else {
      throw new Error(`unrecognized argument: ${a}`);
    }
  }
  return out;
}

export function runCli(argv, cwd = process.cwd()) {
  const opts = parseArgs(argv);
  const filePath = path.isAbsolute(opts.file) ? opts.file : path.join(cwd, opts.file);
  if (!existsSync(filePath)) {
    process.stderr.write(`handover-rotate: file not found: ${filePath}\n`);
    return 2;
  }
  const text = readFileSync(filePath, 'utf8');
  const totalBytes = byteLen(text);
  const maxBytes = opts.maxBytes ?? readCalibratedMaxBytes(cwd) ?? DEFAULT_MAX_BYTES;

  if (opts.mode === 'check-size') {
    const over = totalBytes > maxBytes;
    process.stdout.write(
      JSON.stringify(
        { schema: 'pipeline.handover-size-check.v1', file: opts.file, bytes: totalBytes, maxBytes, over },
        null,
        2
      ) + '\n'
    );
    return over ? 1 : 0;
  }

  const parsed = parseSections(text);
  const plan = computePlan(parsed, { maxBytes, keepSections: opts.keepSections });

  if (opts.mode === 'dry-run') {
    const preview = renderPreview({ file: opts.file, parsed, plan });
    const outPath = path.isAbsolute(opts.out) ? opts.out : path.join(cwd, opts.out);
    writeFileSync(outPath, preview, 'utf8');
    process.stdout.write(
      `handover-rotate --dry-run: wrote preview to ${opts.out} ` +
        `(${plan.toArchiveIndices.length} section(s) proposed, ${plan.archivedBytes} bytes; ` +
        `source file untouched)\n`
    );
    return 0;
  }

  if (opts.mode === 'execute') {
    // Deliberately unreachable from any sanctioned dispatch today: ADR-0064's
    // own follow-up requires a human-reviewed go-ahead on a --dry-run preview
    // before --execute is ever invoked against a real handover file, and (per
    // this file's own safety property) it can only ever archive sections that
    // already carry the extraction-ack marker. Left as a stub so the CLI
    // shape and safety property are provable by test without a live rewrite
    // being reachable from an ordinary invocation.
    throw new Error(
      'handover-rotate --execute: not authorized for automatic invocation. ' +
        'This mode exists for a future human-reviewed rotation run only.'
    );
  }

  throw new Error(`unknown mode: ${opts.mode}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const code = runCli(process.argv.slice(2));
  process.exit(code);
}
