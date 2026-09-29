// SPDX-License-Identifier: SUL-1.0
// Shared physical scratch identity for the guard union.
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function scratchLivePluginRoots() {
  // The executing module's own installation remains protected even if its
  // manifest has disappeared. Additional declared roots must be plausible.
  const own = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const candidates = [process.env.CLAUDE_PLUGIN_ROOT];
  return [...new Set([own, ...candidates.filter(candidate => {
    if (typeof candidate !== 'string' || !candidate) return false;
    try { return lstatSync(resolve(candidate, 'hooks')).isDirectory()
      && lstatSync(resolve(candidate, '.claude-plugin/plugin.json')).isFile(); }
    catch { return false; }
  }).map(candidate => resolve(candidate))])];
}

function contained(root, target, equal = false) {
  const rel = relative(root, target);
  return (equal || rel !== '') && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * Recognize inert scratch by physical identity, never by a filename suffix.
 * Callers must supply every active plugin/authority root, including an active
 * installation located beneath scratch. This grants no shell grammar admission.
 * Reject all aliases and multiply linked files conservatively. Missing entries
 * are allowed only after inspecting every existing ancestor from the root.
 * This is a preflight check, not a race-proof open/write capability.
 */
export function isPhysicalScratchTarget(filePath, {
  rootDir, liveRoots = scratchLivePluginRoots(), allowScratchRoot = false,
  lstat = lstatSync, realpath = realpathSync,
} = {}) {
  if (typeof rootDir !== 'string' || typeof filePath !== 'string' || !filePath
    || filePath.includes('\0') || filePath.includes('\\')
    || /^[A-Za-z]:/.test(filePath) || !Array.isArray(liveRoots)) return false;
  try {
    const root = resolve(rootDir);
    if (realpath(root) !== root || !lstat(root).isDirectory()) return false;
    const scratch = resolve(root, 'scratch');
    const target = resolve(root, filePath);
    if (!contained(scratch, target, allowScratchRoot)) return false;
    for (const liveRoot of liveRoots) {
      if (typeof liveRoot !== 'string' || !liveRoot) return false;
      const declared = resolve(root, liveRoot);
      let physical;
      try { physical = realpath(declared); }
      catch (error) { if (error?.code !== 'ENOENT') return false; physical = declared; }
      if (contained(declared, target, true) || contained(physical, target, true)) return false;
    }
    const components = ['scratch', ...relative(scratch, target).split(sep).filter(Boolean)];
    let current = root;
    for (let index = 0; index < components.length; index++) {
      current = resolve(current, components[index]);
      let stat;
      try { stat = lstat(current); }
      catch (error) { return error?.code === 'ENOENT'; }
      if (stat.isSymbolicLink() || realpath(current) !== current) return false;
      if (index < components.length - 1 && !stat.isDirectory()) return false;
      if (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)) return false;
    }
    return true;
  } catch { return false; }
}

/** Input must come from the caller's already admitted single-command parser. */
export function isBoundedScratchOnlyWords(words, context) {
  if (!Array.isArray(words) || words.some(word => typeof word !== 'string')) return false;
  let target;
  if (words[0] === 'mkdir') {
    target = words.length === 2 && !words[1].startsWith('-') ? words[1]
      : words.length === 3 && words[1] === '-p' && !words[2].startsWith('-') ? words[2] : null;
    return target !== null && isPhysicalScratchTarget(target, { ...context, allowScratchRoot: true });
  }
  if (words[0] === 'touch' && words.length === 2 && !words[1].startsWith('-')) target = words[1];
  if (words[0] === 'cp' && words.length === 4 && words[1] === '--') target = words[3];
  return typeof target === 'string' && isPhysicalScratchTarget(target, context);
}
