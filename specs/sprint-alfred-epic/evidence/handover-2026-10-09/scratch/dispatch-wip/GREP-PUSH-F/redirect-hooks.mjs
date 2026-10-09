import { appendFileSync, readFileSync } from "node:fs";
const root = new URL("../../../", import.meta.url);
const TRANCHE = "specs/sprint-alfred-epic/signed-package/tranche-2/";
const map = {
  "plugins/pipeline-core/lib/git-cmd.mjs": TRANCHE + "lib/git-cmd.mjs",
  "plugins/pipeline-core/hooks/guard-push.mjs": TRANCHE + "hooks/guard-push.mjs",
  "plugins/pipeline-core/hooks/guard-git.mjs": TRANCHE + "hooks/guard-git.mjs",
};
const served = new Map(Object.entries(map).map(([liveRel, src]) => [new URL(liveRel, root).href, [new URL(src, root), liveRel]]));
export async function load(url, context, nextLoad) {
  const hit = served.get(url);
  if (hit === undefined) return nextLoad(url, context);
  appendFileSync(new URL("./fired.log", import.meta.url), hit[1] + "\n");
  return { format: "module", source: readFileSync(hit[0]), shortCircuit: true };
}
