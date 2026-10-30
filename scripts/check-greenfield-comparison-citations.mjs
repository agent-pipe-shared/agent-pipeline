#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Purpose: a release note or retro may claim that one runner's greenfield course differs from another's
// only by citing a PUBLISHED comparison file by path and sha256 (AC-190 / D209; backlog item
// "Greenfield comparisons need reproducible public evidence").
//
// Usage (from the repository root):
//   node scripts/check-greenfield-comparison-citations.mjs <repo-relative-markdown-file>
//
// A runner comparison claim is MARKED with one HTML comment on the claim's line:
//   <!-- runner-comparison path=evidence/greenfield-public/comparison-<name>.json sha256=<64 lowercase hex> -->
// Every marked claim must cite a file that (1) is a repo-relative path inside evidence/greenfield-public/
// named comparison-*.json, (2) exists as a plain file, (3) hashes to the cited digest, (4) passes the
// public screen and (5) is a pipeline.greenfield-public-comparison.v1 document. Claims that are not
// marked are not seen: marking is the author's declaration, this tool does not read prose.
//
// Output: one JSON line {status, claims, findings:[{code, line}]}. Findings never echo a cited path.
// Exit: 0 every marked claim cites, 1 at least one finding, 2 usage error or unreadable markdown.
// Codes: GFC-ARGS, GFC-MARKDOWN-UNAVAILABLE, GFC-NO-CITATION, GFC-MARKER-MALFORMED, GFC-PATH-INVALID,
//        GFC-PATH-NOT-PUBLISHED, GFC-SHA-INVALID, GFC-NOT-FOUND, GFC-SHA-MISMATCH, GFC-NOT-SCREENED,
//        GFC-NOT-A-COMPARISON.
import {createHash} from 'node:crypto';
import {lstatSync, readFileSync, realpathSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {GREENFIELD_COMPARISON_SCHEMA} from '../plugins/pipeline-core/lib/greenfield-public-comparison.mjs';
import {screenPublicTransferArtifact} from '../plugins/pipeline-core/lib/bound-artifact-transfer.mjs';

const MAX_MARKDOWN_BYTES = 262144;
const MAX_COMPARISON_BYTES = 65536;
const MARKER = /<!--[ \t]*runner-comparison(?=[ \t]|-->)([^>]*?)-->/gu;
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/u;
const PUBLISHED = /^evidence\/greenfield-public\/comparison-[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u;
const SHA = /^[a-f0-9]{64}$/u;

const held = (code, line = 0) => ({status: 'held', claims: 0, findings: [{code, line}]});

function plainFile(root, path, maxBytes) {
  let cursor = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    cursor = join(cursor, parts[i]);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) return null;
    if (i < parts.length - 1 ? !info.isDirectory() : (!info.isFile() || info.size > maxBytes)) return null;
  }
  return cursor;
}

function parseAttributes(text) {
  const out = {};
  for (const token of text.trim().split(/\s+/u).filter(Boolean)) {
    const eq = token.indexOf('=');
    const key = eq < 0 ? token : token.slice(0, eq);
    if (eq < 0 || !['path', 'sha256'].includes(key) || Object.hasOwn(out, key)) return null;
    out[key] = token.slice(eq + 1);
  }
  return out;
}

function judgeCitation(root, attributes) {
  if (attributes === null) return 'GFC-MARKER-MALFORMED';
  if (!attributes.path || !attributes.sha256) return 'GFC-NO-CITATION';
  const {path, sha256} = attributes;
  if (path.length > 240 || !SAFE_PATH.test(path)) return 'GFC-PATH-INVALID';
  if (!PUBLISHED.test(path)) return 'GFC-PATH-NOT-PUBLISHED';
  if (!SHA.test(sha256)) return 'GFC-SHA-INVALID';
  let bytes;
  try {
    const file = plainFile(root, path, MAX_COMPARISON_BYTES);
    if (file === null) return 'GFC-NOT-FOUND';
    bytes = readFileSync(file);
  } catch { return 'GFC-NOT-FOUND'; }
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) return 'GFC-SHA-MISMATCH';
  if (screenPublicTransferArtifact(bytes).status !== 'screened') return 'GFC-NOT-SCREENED';
  try {
    if (JSON.parse(bytes.toString('utf8'))?.schema !== GREENFIELD_COMPARISON_SCHEMA) return 'GFC-NOT-A-COMPARISON';
  } catch { return 'GFC-NOT-A-COMPARISON'; }
  return null;
}

export function checkGreenfieldComparisonCitations({rootDir, markdownPath} = {}) {
  let root;
  try { root = realpathSync(resolve(rootDir)); } catch { return held('GFC-MARKDOWN-UNAVAILABLE'); }
  if (typeof markdownPath !== 'string' || markdownPath.length > 240 || !SAFE_PATH.test(markdownPath) || !markdownPath.endsWith('.md')) {
    return held('GFC-MARKDOWN-UNAVAILABLE');
  }
  let text;
  try {
    const file = plainFile(root, markdownPath, MAX_MARKDOWN_BYTES);
    if (file === null) return held('GFC-MARKDOWN-UNAVAILABLE');
    text = readFileSync(file, 'utf8');
  } catch { return held('GFC-MARKDOWN-UNAVAILABLE'); }
  const findings = [];
  let claims = 0;
  text.split('\n').forEach((lineText, index) => {
    for (const match of lineText.matchAll(MARKER)) {
      claims += 1;
      const code = judgeCitation(root, parseAttributes(match[1]));
      if (code !== null) findings.push({code, line: index + 1});
    }
  });
  return {status: findings.length === 0 ? 'ok' : 'held', claims, findings};
}

export function runCitationCheck(argv, {stdout = process.stdout, rootDir = process.cwd()} = {}) {
  if (argv.length !== 1 || typeof argv[0] !== 'string') {
    stdout.write(JSON.stringify(held('GFC-ARGS')) + '\n');
    return 2;
  }
  const result = checkGreenfieldComparisonCitations({rootDir, markdownPath: argv[0]});
  stdout.write(JSON.stringify(result) + '\n');
  if (result.findings.some(f => f.code === 'GFC-MARKDOWN-UNAVAILABLE')) return 2;
  return result.status === 'ok' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runCitationCheck(process.argv.slice(2));
}
