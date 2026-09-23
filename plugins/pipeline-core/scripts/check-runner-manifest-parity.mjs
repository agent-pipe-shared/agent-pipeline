import { readFileSync } from "node:fs";
import { join } from "node:path";

export function checkRunnerManifestParity(pluginRoot) {
  const manifests = {
    antigravity: "plugin.json",
    claude: ".claude-plugin/plugin.json",
    codex: ".codex-plugin/plugin.json",
  };

  const results = {};
  let baseVersion = null;
  let cachebuster = null;

  for (const [runner, relPath] of Object.entries(manifests)) {
    try {
      const content = readFileSync(join(pluginRoot, relPath), "utf8");
      const data = JSON.parse(content);

      if (data.name !== "pipeline-core" && data.name !== "agent-pipeline-core") {
         throw new Error("Invalid name");
      }

      const vMatch = data.version.match(/^(\d+\.\d+\.\d+)\+([a-z]+)\.([0-9]+)\.([a-f0-9]+)$/);
      if (!vMatch) throw new Error("Invalid version format");

      const [_, base, suffix, ts, cb] = vMatch;

      if (suffix !== runner) throw new Error("Runner suffix mismatch");
      if (baseVersion === null) baseVersion = base;
      else if (baseVersion !== base) throw new Error("Base version mismatch");

      if (cachebuster === null) cachebuster = cb;
      else if (cachebuster !== cb) throw new Error("Cachebuster mismatch");

      results[runner] = { ok: true, version: data.version };
    } catch (e) {
      return { ok: false, error: `${runner}: ${e.message}` };
    }
  }

  return { ok: true, baseVersion, cachebuster, results };
}
