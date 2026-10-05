// SPDX-License-Identifier: SUL-1.0
/**
 * windows-hide-preload.mjs -- keep child processes from opening console windows on native Windows.
 *
 * Failure this closes (live evidence 2026-10-05): a full Verify on native Windows spawned a very
 * large number of short-lived `git` children from test processes, none of them with
 * `windowsHide`. A console-subsystem child started by a parent that has no visible console gets a
 * console of its own, which the default terminal application shows as a window, so the host
 * opened and closed windows until it became unstable.
 *
 * Mechanism: importing this module on `win32` wraps `child_process.spawn`, `spawnSync`,
 * `execFile`, `execFileSync`, `exec`, `execSync` and `fork` so that a call whose options carry no
 * `windowsHide` receives `windowsHide: true`. An explicit value (true OR false) is respected, the
 * caller's options object is never mutated, and every argument shape Node accepts (with or
 * without `args`, `options`, `callback`) keeps working. `syncBuiltinESMExports()` makes ESM named
 * imports (`import { spawnSync } from "node:child_process"`) see the wrappers.
 *
 * Reach: the module is meant to be loaded through NODE_OPTIONS (`--import=`) so every Node process
 * a suite starts, and every Node grandchild, inherits it. `composeWindowsHideNodeOptions` builds
 * that value. It is inert on every other platform and idempotent.
 *
 * Node's permission model (`--permission`) denies a NODE_OPTIONS `--import` of a file outside
 * `--allow-fs-read` with ERR_ACCESS_DENIED before any user code runs (measured on Node 24), and
 * `--allow-fs-read` itself cannot be put in NODE_OPTIONS (it is rejected without `--permission`).
 * A suite run under the permission model cannot spawn children anyway, so the NODE_OPTIONS entry is
 * a `data:` URL gate that imports this file only when no permission model is active.
 *
 * This file imports Node builtins only: it ships in the plugin and must stay usable from a
 * consumer repository that has none of this repository's other files.
 */
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";

/** Marker on a wrapped function; also how a second load recognises an already-wrapped one. */
export const WINDOWS_HIDE_WRAPPED = Symbol.for("pipeline.windows-hide-preload.wrapped");

/** Absolute `file:` URL of this module, as NODE_OPTIONS must name it. */
export const WINDOWS_HIDE_PRELOAD_URL = import.meta.url;

/** Suite parallelism on native Windows when no explicit PIPELINE_VERIFY_CONCURRENCY is given. */
export const WINDOWS_VERIFY_CONCURRENCY_CAP = 2;

// Where the options object sits, per signature: `args` = a middle argument array exists,
// `callback` = a trailing callback is accepted.
const SHAPES = Object.freeze({
  spawn: Object.freeze({ args: true, callback: false }),
  spawnSync: Object.freeze({ args: true, callback: false }),
  execFile: Object.freeze({ args: true, callback: true }),
  execFileSync: Object.freeze({ args: true, callback: false }),
  exec: Object.freeze({ args: false, callback: true }),
  execSync: Object.freeze({ args: false, callback: false }),
  fork: Object.freeze({ args: true, callback: false }),
});

function isOptionsObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Return the call arguments with `windowsHide: true` supplied when the options do not state it.
 * A shape this cannot classify is returned untouched so Node raises its own argument error.
 */
function withDefaultWindowsHide(callArgs, shape) {
  if (callArgs.length < 1) return callArgs;
  const [first, ...rest] = callArgs;
  let callback;
  if (shape.callback && typeof rest[rest.length - 1] === "function") callback = rest.pop();
  const hasArgsSlot = shape.args && (Array.isArray(rest[0]) || (rest.length > 1 && (rest[0] === null || rest[0] === undefined)));
  const optionsIndex = hasArgsSlot ? 1 : 0;
  const options = rest[optionsIndex];
  let nextOptions;
  if (options === undefined) nextOptions = { windowsHide: true };
  else if (isOptionsObject(options)) nextOptions = options.windowsHide === undefined ? { ...options, windowsHide: true } : options;
  else return callArgs;
  const rebuilt = [first];
  if (hasArgsSlot) rebuilt.push(rest[0]);
  rebuilt.push(nextOptions, ...rest.slice(optionsIndex + 1));
  if (callback !== undefined) rebuilt.push(callback);
  return rebuilt;
}

// `util.promisify(execFile)` resolves through a hidden `[promisify.custom]` that calls Node's
// internal function, not the exported property, so it would bypass the wrapper.
function promisifyThrough(wrapper) {
  return (...callArgs) => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    promise.child = wrapper(...callArgs, (error, stdout, stderr) => {
      if (error !== null && error !== undefined) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
    return promise;
  };
}

function wrap(original, shape) {
  if (typeof original !== "function" || original[WINDOWS_HIDE_WRAPPED] === true) return original;
  const wrapper = (...callArgs) => original(...withDefaultWindowsHide(callArgs, shape));
  for (const key of Reflect.ownKeys(original)) {
    if (key === "length" || key === "name" || key === "prototype" || key === promisify.custom) continue;
    const descriptor = Object.getOwnPropertyDescriptor(original, key);
    try { Object.defineProperty(wrapper, key, descriptor); } catch { /* metadata copy is best-effort */ }
  }
  Object.defineProperty(wrapper, "name", { value: original.name, configurable: true });
  Object.defineProperty(wrapper, "length", { value: original.length, configurable: true });
  if (typeof original[promisify.custom] === "function") {
    Object.defineProperty(wrapper, promisify.custom, { value: promisifyThrough(wrapper), configurable: true });
  }
  Object.defineProperty(wrapper, WINDOWS_HIDE_WRAPPED, { value: true });
  return wrapper;
}

/**
 * Wrap the child_process spawn family on win32. `childProcess`, `platform` and `sync` are
 * injectable so the behaviour is testable on any host; the defaults are the real ones.
 */
export function installWindowsHide({ childProcess: target = childProcess, platform = process.platform, sync = syncBuiltinESMExports } = {}) {
  if (platform !== "win32") return { installed: false, wrapped: [] };
  const wrapped = [];
  for (const [name, shape] of Object.entries(SHAPES)) {
    const original = target[name];
    const wrapper = wrap(original, shape);
    if (wrapper === original) continue;
    target[name] = wrapper;
    wrapped.push(name);
  }
  if (wrapped.length > 0) sync();
  return { installed: true, wrapped };
}

/** The NODE_OPTIONS entry that loads this module, gated off under the permission model. */
export function windowsHideImportOption(preloadUrl = WINDOWS_HIDE_PRELOAD_URL) {
  const body = `if(!process.permission)await import(${JSON.stringify(preloadUrl)})`;
  return `--import=data:text/javascript,${encodeURIComponent(body)}`;
}

/**
 * NODE_OPTIONS for a child that must load this module: the existing value is preserved and the
 * entry appended once. Any platform other than win32 gets `existing` back unchanged.
 */
export function composeWindowsHideNodeOptions(existing, { platform = process.platform, preloadUrl = WINDOWS_HIDE_PRELOAD_URL } = {}) {
  if (platform !== "win32") return existing;
  const option = windowsHideImportOption(preloadUrl);
  const base = typeof existing === "string" ? existing.trim() : "";
  if (base.includes(option)) return existing;
  return base === "" ? option : `${base} ${option}`;
}

/**
 * Suite parallelism cap for native Windows: the cap when no valid PIPELINE_VERIFY_CONCURRENCY is
 * set (same validity rule as the Verify journal's own resolution), `undefined` ("leave the
 * resolution alone") on every other platform or when an explicit override is present.
 */
export function resolveWindowsVerifyConcurrency(env = process.env, { platform = process.platform, cap = WINDOWS_VERIFY_CONCURRENCY_CAP } = {}) {
  if (platform !== "win32") return undefined;
  const raw = env?.PIPELINE_VERIFY_CONCURRENCY;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isSafeInteger(parsed) && parsed >= 1) return undefined;
  }
  return cap;
}

installWindowsHide();
