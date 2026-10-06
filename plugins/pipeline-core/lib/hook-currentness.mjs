// SPDX-License-Identifier: SUL-1.0
/**
 * hook-currentness.mjs - the one reading of "is this installed git hook still bound to the
 * plugin tree that is loaded now?", shared by the pre-push, pre-commit and commit-msg
 * installers so the three cannot drift apart (HOOKREFRESH-S1).
 *
 * An installed hook records the library directory it was rendered against in its install
 * marker (`pluginLibDir`). Normally that is a content-addressed runtime snapshot,
 * `<state>/runtime-<sha256>/lib`, where the sha256 is the manifest digest of the plugin tree
 * the installer published (lib/git-hook-runtime-snapshot.mjs). The hook is current when that
 * recorded path is the loaded library path itself, or when the recorded digest equals the
 * digest of the loaded tree. Anything else, including an unreadable tree or a missing binding,
 * is stale: a stale hook still enforces its older rules, and an explicit reinstall rebinds it.
 *
 * Read-only: the loaded tree is inspected, never published; nothing is written, and the marker
 * shape and rendered hook bytes are not this module's business.
 *
 * `inspectSource` is injectable so a caller that already holds the loaded tree's digest can
 * avoid a second full read of the plugin tree (the inspection is two full passes), and so a test
 * can pin the comparison without touching a real tree. Each installer's `planInstall` forwards an
 * optional `inspectSource` here; a caller that plans all three installers in one pass hands them
 * ONE `createOnceSourceInspector(...)` so the tree is read at most once for the whole pass
 * (HOOKREFRESH-S1c). With no `inspectSource` every `planInstall` reads the tree itself, as before.
 */
import { resolve } from "node:path";

import { inspectGitHookSourceSnapshot } from "./git-hook-runtime-snapshot.mjs";

const RUNTIME_SNAPSHOT_LIB = /\/runtime-([a-f0-9]{64})\/lib$/u;

/**
 * Wraps a source inspector so each library directory is inspected at most once for the lifetime of
 * the returned function. The inspection is lazy (nothing is read until a hook actually needs a
 * digest) and a fault is remembered exactly like an answer: a later asker for the same directory
 * gets the same throw instead of a second full read, which `assessHookCurrentness` turns into the
 * same stale reading it would have produced itself. Create one per planning pass and drop it with
 * the pass; nothing is remembered across passes.
 */
export function createOnceSourceInspector(inspectSource = inspectGitHookSourceSnapshot) {
  const outcomes = new Map();
  return (options = {}) => {
    const dir = options?.pluginLibDir;
    const key = typeof dir === "string" ? resolve(dir) : dir;
    let outcome = outcomes.get(key);
    if (!outcome) {
      try { outcome = { value: inspectSource(options) }; }
      catch (error) { outcome = { fault: true, error }; }
      outcomes.set(key, outcome);
    }
    if (outcome.fault) throw outcome.error;
    return outcome.value;
  };
}

export function assessHookCurrentness({ recordedPluginLibDir, pluginLibDir, inspectSource = inspectGitHookSourceSnapshot } = {}) {
  let current = typeof recordedPluginLibDir === "string" && recordedPluginLibDir === pluginLibDir;
  if (!current && typeof recordedPluginLibDir === "string") {
    // The installed implementation points at an immutable runtime snapshot while callers
    // present the source plugin path: compare the exact content digest, never publish.
    const match = recordedPluginLibDir.replaceAll("\\", "/").match(RUNTIME_SNAPSHOT_LIB);
    if (match) {
      try { current = inspectSource({ pluginLibDir }).manifestSha256 === match[1]; }
      catch { current = false; }
    }
  }
  return { current, updateRequired: !current };
}
