import { execFileSync } from "node:child_process";
import { inspectArchitecturePushCurrency } from "../../../plugins/pipeline-core/lib/architecture-push-currency.mjs";
import { inspectArchitectureEntryReadiness } from "../../../plugins/pipeline-core/lib/architecture-entry-readiness.mjs";

const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const r = inspectArchitecturePushCurrency({ projectDir: process.cwd(), commit, checkpoint: true });
console.log(JSON.stringify({ ok: r.ok, applicable: r.applicable, stale: r.stale, reason: r.reason,
  staleCount: r.staleContracts?.length ?? 0,
  staleSample: (r.staleContracts ?? []).slice(0, 8).map((s) => `${s.target} <- ${s.contract}`) }, null, 2));
let entry;
try { entry = await inspectArchitectureEntryReadiness({ rootDir: process.cwd() }); } catch (e) { entry = { threw: String(e?.message ?? e) }; }
console.log(JSON.stringify(entry, null, 2).slice(0, 3000));
