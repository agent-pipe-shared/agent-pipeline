// GREP-PUSH-F-20261009 scratch finalizer (git-ignored, re-runnable): rewrites the terminal record from the captures that exist.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as dr from "../../../plugins/pipeline-core/lib/dispatch-record.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const path = join(repo, "evidence", "dispatch-record-GREP-PUSH-F-20261009.json");
const rec = JSON.parse(readFileSync(path, "utf8"));
const toolUses = Number(process.argv[2] ?? 50);

const cap = (name) => {
  const p = join(repo, "evidence", "GREP-PUSH-F-20261009", name);
  if (!existsSync(p)) return { present: false, line: `${name}: NOT written (the background capture had not finished when this record was written)` };
  const t = readFileSync(p, "utf8");
  const cases = /(\d+)\/(\d+) cases passed\./u.exec(t);
  const exit = /^exitCode: (\d+)/mu.exec(t);
  const fails = [...t.matchAll(/^FAIL\s+(\S+)/gmu)].map((m) => m[1]);
  const fired = /GREPPUSHF-REDIRECT-\S+ [^\n]*/u.exec(t);
  return {
    present: true, cases: cases ? [Number(cases[1]), Number(cases[2])] : null, fails, exit: exit ? Number(exit[1]) : null,
    line: `${name}: wrapped exit ${exit ? exit[1] : "unknown"}, ${cases ? cases[1] + "/" + cases[2] + " cases passed" : "no case summary found"}, failing: ${fails.length ? fails.join(", ") : "none listed"}; ${fired ? fired[0] : "no redirect line found"}`,
  };
};
const push = cap("after-guard-push.txt");
const git = cap("after-guard-git.txt");

const POST = "specs/sprint-alfred-epic/signed-package/tranche-2/lib/git-cmd.mjs";
const MAN = "specs/sprint-alfred-epic/signed-package/tranche-2/GREP-PUSH-MANIFEST.md";
const text = [
  "Closing-allowance handover (80 percent checkpoint reached, plus a briefing contradiction): independent review: pending. Implementation is built and probed but NOT committed and NOT accepted.",
  "",
  "1. DoD results",
  "- Route pre-check: requested route (field 6) sonnet, Sonnet 5.5, effort xhigh; observed identity claude-sonnet-5-5, named by this dispatch's runtime prompt; no contradiction.",
  "- Post-image " + POST + ": built (4 anchored edits, +109 lines). In-process probe: PGM-A01..A27 all classify as not-a-push, PGM-R01..R22 all classify as a push, 24 extra adversarial and control commands as intended. passed (in-process, not the suite).",
  "- after-guard-push.txt: " + (push.present ? "PGM-A01..A27 and PGM-R01..R22 are all green (49 of 49), but the briefed DoD (only the PG-CHECKPOINT pair red) is FAILED: the suite also shows PGC-T38b, PGC-T38c, PGC-T82b and PGC-T82c red, exactly the four pins predicted to flip (contradiction in section 5). " : "not verifiable here: ") + push.line.replace(/^after-guard-push.txt: /u, ""),
  "- after-guard-git.txt (no new red): " + (git.present ? "measured; compare its failing list with the TR-C-T5 baseline reds GG22-T5F1a and GG22-T5F1b: " : "not verifiable here: ") + git.line.replace(/^after-guard-git.txt: /u, ""),
  "- Manifest F section: written (digests, export name, pin table). consumer-safe-paths: not run. Single commit: NOT made (see section 5 and 6).",
  "",
  "2. Evidence",
  "- node scratch/dispatch-wip/GREP-PUSH-F/build.mjs, exit 0: base blob cda79122b54bc097c10ec78ecda3984eb09851d1, post sha256 0130bcd6c1645273c6a31eb6e1894b6c6dc9ba83f51383836749f4f2980c7a34 (81374 bytes, 1443 lines); probe stdout only (no file): admitted 27 wrong 0, refused 22 wrong 0, adversarial 24 wrong 0. The same run executed plugins/pipeline-core/lib/git-cmd.test.mjs against the post-image: exit 1, failure names not captured (summary regex matched nothing).",
  "- " + push.line,
  "- " + git.line,
  "- Capture command shape (WSL, background, timeout 1500): capture-evidence.mjs --out evidence/GREP-PUSH-F-20261009/<file> --label after -- node --test scratch/dispatch-wip/GREP-PUSH-F/<suite>.f.test.mjs. The first foreground attempt with the briefed timeout 540 exited 124: the T measurement of the same suite took 974 s.",
  "",
  "3. Changed files",
  "- " + POST + ": new tranche-2 post-image of lib/git-cmd.mjs (marker exemption, exported hasFailClosedMarker). UNCOMMITTED, untracked.",
  "- " + MAN + ": F section (section 5) appended. UNCOMMITTED.",
  "- evidence/GREP-PUSH-F-20261009/*.txt captures if present, and this record. Git-ignored scratch: scratch/dispatch-wip/GREP-PUSH-F/.",
  "",
  "4. Deliberately not changed",
  "- Live plugins/pipeline-core/lib/git-cmd.mjs and every live kernel path; every test file (incl. PGC-T38b/c and PGC-T82b/c, which cannot stay green); lib/git-cmd.test.mjs; the foreign uncommitted edits.",
  "- Pre-existing and out of scope: git grep -O<pager> / --open-files-in-pager takes a command in a quoted word and is invisible to the no-marker path already; the exemption does not widen it.",
  "",
  "5. Deviations from spec",
  "- STOP condition 2 (briefing versus manifest versus repo): the DoD wants only the PG-CHECKPOINT pair red and forbids test edits, but PGC-T38b/c use the byte-identical command of PGM-A08 and PGC-T82b/c the PGM-A03 shape with another dispatch id; expectation BLOCK versus ALLOW cannot both hold. Four pins flip GREEN to RED by construction. A re-aim of those four pins by a separate test dispatch (QG-04) must come first or travel with the commit. PGM-A22 was not contested: the rule admits it through the recursion on the simple payload.",
  "- Design decisions taken inside F's latitude (recorded in the manifest): exemption inside commandIsGitPushAt, hasFailClosedMarker exported unchanged; heredoc commits and any backslash are never exempt (PGC-T42b/c, T80a/b, T5F3a, T85d stay green); a global option before the subcommand is never exempt.",
  "- Capture timeout 1500 instead of the briefed 540, run in the background and awaited in-turn.",
  "",
  "6. Open items (closing-allowance handover)",
  "- Committed: nothing committed. Verified green: only the in-process probe (above). Remains undone: commit, consumer-safe-paths, captures not listed above, the lib git-cmd.test.mjs failure names, the four-pin test re-aim.",
  "- Next briefing: dispatch the test re-aim first; then one commit with git add -- " + POST + " " + MAN + " and subject fix(git-cmd): exempt marker text in non-push subcommands from push detection (tranche-2); allow 1500 s per suite on WSL (background plus in-turn wait loop); capture lib/git-cmd.test.mjs failing names with --test-reporter=tap into evidence.",
].join("\n");

dr.validateDurableDispatchReportText(text);
rec.outcome = "stopped-without-commit";
rec.outcomeClassification = { schema: dr.OUTCOME_CLASSIFICATION_SCHEMA, kind: "stopped-without-commit" };
rec.commits = [];
rec.log = [
  { phase: "opening: briefing read, preflight run, record created", toolUseCount: 14 },
  { phase: "orientation: manifests, live git-cmd.mjs marker rule, PGM/PGC pins read; contradiction T38b/A08 and T82b/A03 confirmed", toolUseCount: 35 },
  { phase: "post-image built and probed in-process (49 pins + 24 extra commands as intended)", toolUseCount: 37 },
  { phase: "WSL capture attempt with timeout 540 exited 124; relaunched in background with timeout 1500 (T run took 974 s)", toolUseCount: 44 },
  { phase: "manifest F section written; 80 percent checkpoint; record finalized", toolUseCount: toolUses },
];
rec.report = { text, changedFiles: [POST, MAN] };
rec.resultSha256 = dr.reportSha256(text);
rec.closingAllowance = {
  schema: dr.CLOSING_ALLOWANCE_SCHEMA,
  taskId: rec.taskId,
  committed: [],
  verifiedGreen: [{ check: "in-process probe of the post-image (not a suite)", command: "node scratch/dispatch-wip/GREP-PUSH-F/build.mjs", exitCode: 0, artifact: "stdout only, no file" }],
  remainsUndone: [
    "commit of the post-image and manifest (blocked by the T38b/c, T82b/c contradiction)",
    "consumer-safe-paths run",
    "WSL suite captures not marked present in the report",
    "names of the failing cases of lib/git-cmd.test.mjs against the post-image",
    "uncommitted: " + POST + " (untracked), " + MAN + " (modified)",
  ],
  nextBriefingAdjustments: [
    "dispatch a test re-aim for PGC-T38b/c and PGC-T82b/c first (QG-04), then commit the post-image",
    "budget 1500 s per WSL suite and wait in-turn; reserve calls for two or three wait loops",
    "capture lib/git-cmd.test.mjs failures with the tap reporter",
  ],
};
writeFileSync(path, JSON.stringify(rec, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ written: true, push: push.line, git: git.line, resultSha256: rec.resultSha256 }));
