// SPDX-License-Identifier: SUL-1.0
// Read-only start hint: reports whether the workspace is Pipeline-governed and what agy has loaded.
// Writes nothing (no lock, no state, no registration).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { observeAntigravityLoadedTopology } from './antigravity-plugin-topology.mjs';

export async function observeAgyStartHint({ workspaceRoot, configRoot, loadedPluginRoot } = {}) {
  const governed = ['project/pipeline.json', 'pipeline.user.yaml', '.git/agent-pipeline'].some((rel) => existsSync(join(workspaceRoot, rel)));
  const loaded = observeAntigravityLoadedTopology({ loadedPluginRoot, configRoot, workspaceRoot });
  return { governed, loaded };
}
