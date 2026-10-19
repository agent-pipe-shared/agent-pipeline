// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/test-fixture-isolation.mjs
/**
 * Test-only fixture isolation for suites that hand a fixture directory to the governance-scope
 * controller (which discovers the enclosing Git repository and then WRITES to it).
 *
 * THE DEFECT CLASS. A fixture root created without its own `git init` has no repository of its own. When the
 * directory holding the fixture lies inside some checkout (TMPDIR pointed into a checkout, or the repository's
 * own fixture-tmpdir helper, which places fixtures under the checkout by design), Git discovery climbs out of
 * the fixture to that checkout. A decision applied to the fixture is then applied to the REAL repository: its
 * config receives an activation record and its project state is touched, after which every guard goes quiet
 * (live incident, 2026-10-19).
 *
 * WHAT THIS MODULE DOES.
 *   1. createFixtureBase(prefix, {location, repoBase}) creates the fixture base (under the OS temp dir by
 *      default, or through the sanctioned fixture-tmpdir helper's repo-local scratch leaf) and publishes it as a
 *      Git ceiling directory (GIT_CEILING_DIRECTORIES, realpath'd, restored on release). The ceiling constrains
 *      every Git child the TEST process spawns (including via the process environment it inherits).
 *   2. assertFixtureIsolated(root) is the actual enforcement. It asks Git the same question the production
 *      controller asks, with the same environment shape and DELIBERATELY WITHOUT the ceiling: the production
 *      Git environment is an allow-list, so the ceiling in the process environment does not reach the
 *      controller's own discovery. If a repository is found, its work-tree root and its common directory must
 *      both lie inside the fixture base, or the call throws FIXTURE-ESCAPE before anything is written.
 *   3. A tripwire inside the same assertion throws FIXTURE-TRIPWIRE when the resolved root or common directory
 *      equals or contains the process's own starting repository (the repository of the working directory at
 *      first use, and the checkout this module lives in).
 *   4. guardController(controller) returns a frozen copy whose mutating entry points (planDecision,
 *      applyDecision, recordOnboardingEnrollment) run the assertion first.
 *
 * A fixture that is its own repository (git init inside the base) passes, including inside a checkout.
 * A git-less fixture inside a checkout throws instead of silently resolving to that checkout.
 *
 * The rest of this repository's fixture-tmpdir helper (test-tmpdir.mjs) is composed, not duplicated: the
 * repo-scratch location delegates the directory creation to it.
 */
import {existsSync, mkdtempSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {GIT_NULL_DEVICE} from './git-null-device.mjs';
import {mkdtempTestScratch} from './test-tmpdir.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The checkout this module lives in (three levels up from the plugin lib directory). */
const OWN_CHECKOUT = resolve(HERE, '..', '..', '..');
const ORIGINAL_CEILING = process.env.GIT_CEILING_DIRECTORIES;
const activeBases = new Set();

export class FixtureIsolationError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'FixtureIsolationError';
    this.code = code;
    this.detail = detail;
  }
}

/** True when `child` equals `parent` or lies inside it (physical paths expected). */
export function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
}

function nearestExisting(path) {
  let current = resolve(path);
  const tail = [];
  for (;;) {
    if (existsSync(current)) return {current, tail};
    const parent = dirname(current);
    if (parent === current) return {current, tail};
    tail.unshift(current.slice(parent.length).replace(/^[\\/]+/, ''));
    current = parent;
  }
}

/** Realpath of the longest existing prefix plus the not-yet-existing remainder. */
export function physicalPath(path) {
  const {current, tail} = nearestExisting(path);
  try { return resolve(realpathSync(current), ...tail); } catch { return resolve(path); }
}

function syncCeiling() {
  if (activeBases.size === 0) {
    if (ORIGINAL_CEILING === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = ORIGINAL_CEILING;
    return;
  }
  const entries = [...(ORIGINAL_CEILING ? [ORIGINAL_CEILING] : []), ...activeBases];
  process.env.GIT_CEILING_DIRECTORIES = entries.join(delimiter);
}

/**
 * Create a fixture base and publish it as a Git ceiling for this process.
 * @param {string} prefix
 * @param {{location?: 'os-tmp'|'repo-scratch', repoBase?: string}} [options]
 *   repo-scratch delegates to the sanctioned fixture-tmpdir helper; repoBase is its (optional) repository
 *   root override.
 * @returns {{base: string, physicalBase: string, release: () => void}}
 */
export function createFixtureBase(prefix, {location = 'os-tmp', repoBase} = {}) {
  let created;
  if (location === 'os-tmp') created = mkdtempSync(join(tmpdir(), prefix));
  else if (location === 'repo-scratch') created = repoBase === undefined ? mkdtempTestScratch(prefix) : mkdtempTestScratch(prefix, repoBase);
  else throw new FixtureIsolationError('FIXTURE-LOCATION', 'unknown fixture base location');
  const physicalBase = realpathSync(created);
  activeBases.add(physicalBase);
  syncCeiling();
  let released = false;
  return {
    base: created,
    physicalBase,
    release() {
      if (released) return;
      released = true;
      activeBases.delete(physicalBase);
      syncCeiling();
    },
  };
}

/** The Git environment shape the production controller uses: an allow-list, never the ceiling. */
function productionGitEnvironment() {
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TMP', 'TEMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE']) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  return Object.assign(env, {GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C'});
}

function gitText(cwd, args) {
  const result = spawnSync('git', args, {cwd, encoding: 'utf8', shell: false, timeout: 10000, env: productionGitEnvironment()});
  if (result.error) throw new FixtureIsolationError('FIXTURE-PROBE-UNAVAILABLE', 'the Git containment probe could not run: ' + (result.error.code ?? result.error.message));
  if (result.status === 0) return result.stdout.trim();
  if (result.status === 128) return null; // not a repository (or unusable): production sees the same refusal
  throw new FixtureIsolationError('FIXTURE-PROBE-UNAVAILABLE', 'the Git containment probe exited ' + result.status);
}

/**
 * The repository Git discovery finds from `dir` as production would see it (no ceiling), or null.
 * @returns {{root: string|null, commonDir: string}|null}
 */
export function discoverEnclosingRepository(dir) {
  const {current} = nearestExisting(dir);
  const common = gitText(current, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common === null || common === '') return null;
  const top = gitText(current, ['rev-parse', '--show-toplevel']);
  return {root: top ? physicalPath(top) : null, commonDir: physicalPath(common)};
}

let startingCache;
/** The process's own starting repositories: the working directory's, and this module's own checkout. */
function startingRepositories() {
  if (startingCache) return startingCache;
  const found = [];
  const seen = new Set();
  for (const start of [() => process.cwd(), () => OWN_CHECKOUT]) {
    let repository = null;
    try { repository = discoverEnclosingRepository(start()); } catch (error) { if (error instanceof FixtureIsolationError) throw error; }
    if (repository === null) continue;
    const key = String(repository.root) + '\0' + repository.commonDir;
    if (!seen.has(key)) { seen.add(key); found.push(repository); }
  }
  startingCache = found;
  return found;
}

function tripwire(repository, starting) {
  for (const own of starting) {
    for (const [label, candidate] of [['root', repository.root], ['commonDir', repository.commonDir]]) {
      if (!candidate) continue;
      for (const target of [own.root, own.commonDir]) {
        if (target && isInside(candidate, target)) {
          throw new FixtureIsolationError('FIXTURE-TRIPWIRE', `the resolved ${label} equals or contains the process's own starting repository`, {label});
        }
      }
    }
  }
}

/**
 * Throw unless `root` (an existing or not-yet-existing fixture path) resolves, as production would see it,
 * to nothing or to a repository whose root and common directory both lie inside the fixture base that holds it.
 * @param {string} root
 * @param {{startingRepositories?: Array<{root: string|null, commonDir: string}>}} [options]
 */
export function assertFixtureIsolated(root, options = {}) {
  if (typeof root !== 'string' || root === '') throw new FixtureIsolationError('FIXTURE-ROOT', 'the fixture root must be a non-empty path');
  const physical = physicalPath(root);
  const base = [...activeBases].find(candidate => isInside(candidate, physical));
  // A root outside every active base IS an escape by definition: the plan names a repository (typically the
  // enclosing checkout, which holds the base rather than the other way round) that this fixture does not own.
  if (!base) throw new FixtureIsolationError('FIXTURE-ESCAPE', 'the root lies outside every fixture base created by createFixtureBase: a decision would be applied to a repository the fixture does not own', {label: 'root', reason: 'outside-every-base'});
  const repository = discoverEnclosingRepository(physical);
  if (repository) {
    tripwire(repository, options.startingRepositories ?? startingRepositories());
    for (const [label, path] of [['root', repository.root], ['commonDir', repository.commonDir]]) {
      if (path !== null && !isInside(base, path)) {
        throw new FixtureIsolationError('FIXTURE-ESCAPE', `the resolved ${label} lies outside the fixture base: a decision would be applied to an enclosing repository`, {label});
      }
    }
  }
  return {base, repository};
}

/** A frozen copy of a controller whose mutating entry points assert isolation first. */
export function guardController(controller, assertRoot = assertFixtureIsolated) {
  const rootOf = {
    planDecision: args => args?.rootDir,
    recordOnboardingEnrollment: args => args?.rootDir,
    applyDecision: plan => plan?.root,
  };
  const guarded = {};
  for (const key of Reflect.ownKeys(controller)) {
    const value = controller[key];
    guarded[key] = typeof key === 'string' && Object.hasOwn(rootOf, key) && typeof value === 'function'
      ? (...args) => { const root = rootOf[key](...args); if (typeof root === 'string') assertRoot(root); return value(...args); }
      : value;
  }
  return Object.freeze(guarded);
}
