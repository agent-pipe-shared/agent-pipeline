// PROBE-B: which step of inspectSelectedPlanProfile() throws for a bare tmpdir fixture?
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readOnboardingIntakeCheckpoint } from "../../plugins/pipeline-core/lib/onboarding-continuity.mjs";

function attempt(label, dir) {
  try {
    const r = readOnboardingIntakeCheckpoint({ rootDir: dir });
    console.log(label, "OK status=" + r.status);
  } catch (e) {
    console.log(label, "THROW code=" + e.code + " msg=" + String(e.message).slice(0, 200));
    console.log(String(e.stack).split("\n").slice(1, 5).join("\n"));
  }
}

const bare = realpathSync(mkdtempSync(join(tmpdir(), "probe-b-bare-")));
attempt("BARE-TMPDIR(no git)", bare);

const inited = realpathSync(mkdtempSync(join(tmpdir(), "probe-b-git-")));
spawnSync("git", ["init", "-q"], { cwd: inited });
attempt("GIT-INITED-TMPDIR", inited);
console.log("HOME-set=" + (typeof process.env.HOME === "string"), "XDG_STATE_HOME-set=" + (typeof process.env.XDG_STATE_HOME === "string"));
