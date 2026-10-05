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
 * can pin the comparison without touching a real tree.
 */
import { inspectGitHookSourceSnapshot } from "./git-hook-runtime-snapshot.mjs";

const RUNTIME_SNAPSHOT_LIB = /\/runtime-([a-f0-9]{64})\/lib$/u;

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
