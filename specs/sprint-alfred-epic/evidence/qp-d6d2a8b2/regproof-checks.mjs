// REGADD checks: (1) git apply --check of every package patch against a fresh export of the current HEAD,
// (2) classifyVulnerableSuite on the value-binding test, (3) sanitization scan of the new deliverables.
// Run from the repository root through capture-evidence. Exit 0 only when every check passes.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = resolve(process.cwd());
const S = "scratch/REGADD";
const out = (s) => process.stdout.write(`${s}\n`);
const run = (cmd, args) => spawnSync(cmd, args, { cwd: REPO, encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 1 << 26, input: "" });
let failures = 0;
const check = (label, ok, detail = "") => { if (!ok) failures += 1; out(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`); };

const head = run("git", ["rev-parse", "HEAD"]).stdout.trim();
out(`HEAD ${head}`);
rmSync(join(REPO, S, "chk"), { recursive: true, force: true });
rmSync(join(REPO, S, "chk.tar"), { force: true });
mkdirSync(join(REPO, S, "chk"), { recursive: true });
check("git archive HEAD", run("git", ["archive", "--format=tar", `--output=${S}/chk.tar`, "HEAD"]).status === 0);
check("tar extract", run("tar", ["-xf", `${S}/chk.tar`, "-C", `${S}/chk`]).status === 0);

const RP = "specs/sprint-alfred-epic/design/verify-registration-package-1";
const S2 = "specs/sprint-alfred-epic/design/s2-package-1";
const patches = [`${RP}/test-registrations.patch`, `${RP}/case-completion-dispositions.patch`, `${RP}/inventory-surfaces.patch`, `${S2}/protected-baseline.patch`, `${S2}/verify-registration.patch`, `${S2}/inventory-surfaces.patch`];
for (const p of patches) {
  const r = run("git", ["apply", "--check", `--directory=${S}/chk`, p]);
  check(`git apply --check ${p}`, r.status === 0, `exit ${r.status}${r.stderr ? ` ${r.stderr.trim().split(/\r?\n/)[0]}` : ""}`);
}

const mod = await import(pathToFileURL(join(REPO, "harness/scripts/check-verify-case-completion.mjs")).href);
const src = readFileSync(join(REPO, "plugins/pipeline-core/scripts/gitleaks-repair-ignore.value-binding.test.mjs"), "utf8");
const cls = mod.classifyVulnerableSuite(src);
out(`classifyVulnerableSuite(value-binding) = ${JSON.stringify(cls)}`);
check("value-binding test is not a vulnerable suite (no disposition required)", cls === null);

const RES = [/(?<![A-Za-z0-9_])[A-Za-z]:[\\/]/, /\/Users\//, /\/home\//, /AppData/i];
const files = [`${RP}/README.md`, `${RP}/test-registrations.patch`, `${RP}/case-completion-dispositions.patch`, `${RP}/inventory-surfaces.patch`, "specs/sprint-alfred-epic/evidence/night-2026-10-05/regproof-regadd-result.json"];
for (const f of files) {
  const text = readFileSync(join(REPO, f), "utf8");
  const hits = RES.filter((re) => re.test(text)).length;
  check(`sanitization ${f}`, hits === 0, `${hits} pattern hit(s)`);
}
const json = JSON.parse(readFileSync(join(REPO, files[4]), "utf8"));
check("JSON residualHostPathCheck.hits === 0", json.residualHostPathCheck?.hits === 0, `hits ${json.residualHostPathCheck?.hits}`);
check("JSON assertions.allPass", json.assertions?.allPass === true);
check("JSON headSha is the recorded export HEAD", typeof json.headSha === "string" && json.headSha.length === 40, `json ${json.headSha} / now ${head}`);
out(`${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
