// CRITIC-CKPT-T3 scratch ESM load hook: serves the tranche-2 guard post-image bytes UNDER THE LIVE guard URL (TR-C-F method).
import { appendFileSync, readFileSync } from "node:fs";
const LIVE = new URL("../../../plugins/pipeline-core/hooks/guard-dispatch-budget.mjs", import.meta.url).href;
const SOURCE = new URL("./post/hooks/guard-dispatch-budget.mjs", import.meta.url);
export async function load(url, context, nextLoad) {
  if (url !== LIVE) return nextLoad(url, context);
  appendFileSync(new URL("./fired-guard-dispatch-budget.mjs.log", import.meta.url), url + "\n");
  return { format: "module", source: readFileSync(SOURCE), shortCircuit: true };
}
