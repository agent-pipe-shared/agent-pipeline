// Elephant probe (Ruling 156): ensureAgentPipelineRoot on a scratch "common dir" on the repository's own filesystem.
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureAgentPipelineRoot } from "../../../plugins/pipeline-core/lib/hardened-private-directory.mjs";

const common = resolve(join("scratch", "dispatch", "elephant", "drvfs-root-probe-common"));
if (existsSync(common)) rmSync(common, { recursive: true, force: true });
mkdirSync(common, { recursive: true });
for (const round of ["fresh", "existing"]) {
  try {
    const result = ensureAgentPipelineRoot(common);
    console.log(`${round}: ok created=${result.created} repaired=${result.repaired} advisory=${result.advisory}`);
  } catch (error) {
    console.log(`${round}: ${error?.code ?? "no-code"} ${String(error?.message ?? error).split("\n")[0]}`);
  }
}
rmSync(common, { recursive: true, force: true });
