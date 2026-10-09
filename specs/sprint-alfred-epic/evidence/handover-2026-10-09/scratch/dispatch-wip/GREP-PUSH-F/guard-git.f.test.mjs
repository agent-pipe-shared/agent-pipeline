import { existsSync, readFileSync, rmSync } from "node:fs";
const sidecar = new URL("./fired.log", import.meta.url);
rmSync(sidecar, { force: true });
process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS ?? "") + " --import=" + new URL("./register.mjs", import.meta.url).href).trim();
process.on("exit", () => {
  const hits = existsSync(sidecar) ? readFileSync(sidecar, "utf8").split("\n").filter(Boolean) : [];
  const by = {};
  for (const h of hits) by[h] = (by[h] ?? 0) + 1;
  console.error((hits.length > 0 ? "GREPPUSHF-REDIRECT-FIRED " : "GREPPUSHF-REDIRECT-NOT-FIRED ") + "guard-git.mjs " + JSON.stringify(by));
});
await import("./guard-git.body.mjs");
