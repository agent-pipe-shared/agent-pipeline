// PROBE-C: what does checkCloneProvisioning() observe for a fresh git-init'd fixture root?
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  checkCloneProvisioning,
  assessMandatoryHookReadiness,
  applyMandatoryHookGate,
} from "../../plugins/pipeline-core/scripts/check-clone-provisioning.mjs";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "probe-c-")));
spawnSync("git", ["init", "-q"], { cwd: dir });
const scrub = (p) => String(p ?? "").split(dir).join("<fixture>");

function show(label) {
  const report = checkCloneProvisioning(dir);
  const readiness = assessMandatoryHookReadiness(report);
  console.log(label, "readiness=" + readiness.status, "gate(ready)=" + applyMandatoryHookGate("ready", readiness));
  for (const c of report.checks) {
    if (/hook/.test(c.id)) console.log("  ", c.id, c.status, scrub(c.path));
  }
}

show("DEFAULT-FIXTURE");

// Same fixture, but the host-level git config points hooks elsewhere. This
// shows the observed hook path follows git config outside the fixture root.
const cfg = join(realpathSync(tmpdir()), "probe-c-global-gitconfig-" + process.pid);
writeFileSync(cfg, "[core]\n\thooksPath = /nonexistent-probe-hooks\n");
process.env.GIT_CONFIG_GLOBAL = cfg;
show("WITH-GLOBAL-core.hooksPath");
