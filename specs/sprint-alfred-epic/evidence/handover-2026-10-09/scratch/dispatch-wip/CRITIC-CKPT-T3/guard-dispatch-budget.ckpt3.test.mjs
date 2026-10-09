// CRITIC-CKPT-T3 scratch entry (the file the DoD command names). The runner child imports the guard by its live URL; NODE_OPTIONS
// registers the load hook in every child so it receives the guard post-image bytes.
import { existsSync, readFileSync, rmSync } from "node:fs";
const sidecar = new URL("./fired-guard-dispatch-budget.mjs.log", import.meta.url);
rmSync(sidecar, { force: true });
process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS ?? "") + " --import=" + new URL("./register.mjs", import.meta.url).href).trim();
process.on("exit", () => {
  const loads = existsSync(sidecar) ? readFileSync(sidecar, "utf8").split("\n").filter(Boolean).length : 0;
  console.error(loads > 0 ? "CKPT3-REDIRECT-FIRED guard-dispatch-budget.mjs (" + loads + " runner-child loads served from the tranche-2 guard post-image)" : "CKPT3-REDIRECT-NOT-FIRED guard-dispatch-budget.mjs (the live guard ran)");
});
await import("./guard-dispatch-budget.ckpt3.body.mjs");
