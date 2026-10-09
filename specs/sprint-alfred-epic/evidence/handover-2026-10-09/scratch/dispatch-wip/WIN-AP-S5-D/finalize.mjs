// Terminal-record finalizer for WIN-AP-S5-D-20261009: appends log entries, the commit, and the report (sha256 bound to report.text).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const recordPath = resolve(here, "..", "..", "..", "evidence", "dispatch-record-WIN-AP-S5-D-20261009.json");
const record = JSON.parse(readFileSync(recordPath, "utf8"));

const text = `WIN-AP-S5-D-20261009 completion report (goldfish-deep). Diagnosis complete, report committed. Independent review: pending. PO acceptance: pending. Not a closing-allowance handover (finished inside the base cap).

Route pre-check: the briefing declares class research/diagnosis (not an architecture, guardrail or security class), so the MP-07 pre-check was not mandatory; stated anyway. Requested: goldfish-deep, tool-layer model sonnet (Sonnet 5.5, effort xhigh). Observed in this dispatch's own runtime prompt: "You are powered by the model named Sonnet 5.5. The exact model ID is claude-sonnet-5-5". Model matches. Effort is not observable beyond a numeric hint (disclosed, not a mismatch).

VERDICT. Classification (B): a product defect in the hardener hardenWindowsPrivateDirectory (plugins/pipeline-core/lib/windows-private-state.mjs, HARDEN_DIRECTORY_SCRIPT). It is NOT a fixture or host artefact and NOT caused by the WIN-AP-S5 edit. Native GMW49 and GMW50 are red at HEAD even without the S5 edit: the production call GMW50 reaches (guardMaintenanceWindowInternals.storagePaths on a fresh repository under repo-root/scratch) throws GMW-DACL at HEAD (probe 2). The S5 edit only moved the failure from secureDirectory on the leaf (GMW-DACL) to ensureAgentPipelineRoot (PB-WINDOWS-ASSURANCE, UnauthorizedAccessException). The regression is commit 5a72c9b61 (WIN-HARDEN-F, 06:24): it replaced Get-Acl + Set-Acl by Directory.GetAccessControl/SetAccessControl over Access,Owner and calls SetOwner unconditionally. WIN-GMW-F's native capture (05:52) shows GMW49/GMW50 PASS, so it predates that commit; the pre-5a72c9b61 script hardens a checkout-volume directory fine (probe 3). The S5 record's sandbox/host hypothesis is refuted: a non-elevated ordinary token reproduces it.

Mechanism (inferred from four discriminating variants, no access-check trace): persisting the Owner section needs WRITE_OWNER; an owner holds only implicit READ_CONTROL and WRITE_DAC. On the temp volume the user profile hands down an explicit current-user FullControl ACE (has WRITE_OWNER). On the checkout volume the directory inherits only Authenticated Users Modify (+ Users ReadAndExecute, Administrators/SYSTEM FullControl; the Administrators group is deny-only in a non-elevated token), which lacks WRITE_OWNER. Measured on the checkout volume: shipped script fails at Directory.SetAccessControl (0x80070005); SetOwner alone to the same owner fails; Access-section-only passes; explicit user FullControl first then shipped script passes; skipping SetOwner when the owner SID already equals the current SID passes, is secure afterwards and is repeatable (two calls). S6-F's pins use os.tmpdir(), which masks it. Real trigger: a non-elevated user, a repo on a data volume or below a drive root with the default root ACL, and a first creation or repair of any private directory (every caller of the hardener). The live checkout has not broken because its private-state segment already exists and is assessed, not hardened.

1. DoD results
- Report with probe output, classification, proposed slices (T then F, write sets): passed (specs/sprint-alfred-epic/evidence/win-ap-s5-d-gmw50-hardening-2026-10-09.md).
- One commit of the report, subject docs(alfred): diagnose the native GMW50 hardening failure (WIN-AP-S5-D): passed, cbe50d783142294efa47cadaedf14dabf359ba54.
- Terminal record: this file. Forbidden respected: no production or test file changed; the live .git/agent-pipeline was not touched.

2. Evidence
- Probes (scratch, git-ignored, outputs written by the probes themselves and embedded in the committed report): node scratch/dispatch-wip/WIN-AP-S5-D/probe.mjs, probe2.mjs, probe3.mjs; outputs probe-output.txt, probe2-output.txt, probe3-output.txt in that directory; each run completed without a tool error (exit 0 as reported by the tool).
- Read-only evidence used: evidence/WIN-AP-S5-20261009/native-after.txt lines 480-530; evidence/WIN-AP-S6-F-20261009/native-after.txt; evidence/WIN-GMW-F-20261009/native.txt (GMW49/GMW50 PASS, written 05:52); git show 5a72c9b61.

3. Changed files
- specs/sprint-alfred-epic/evidence/win-ap-s5-d-gmw50-hardening-2026-10-09.md (new; the diagnosis report, committed).
- Untracked, not committed: this record; git-ignored scratch/dispatch-wip/WIN-AP-S5-D/ (probes, outputs, finalizer) and scratch/commit-msg/WIN-AP-S5-D.txt.

4. Deliberately not changed
- All production and test files (forbidden); the S5 two-line edit (not re-applied); the stale GMW50 comment "GREEN today on every host" (true again once slice F lands); the live .git/agent-pipeline; the foreign uncommitted edits; 5a72c9b61 itself (a revert would re-break the repeatable-hardening fix it made; the narrow fix is the conditional SetOwner).

5. Deviations from spec
- GMW50 itself was not run natively (about 300 s): its red at HEAD is established by running the production call it reaches on its exact fixture placement; the T slice's first native run supplies the machine-written baseline.
- The record was finalized in one write (commit, outcome, report) instead of a separate post-commit checkpoint, to stay inside the budget.
- Probe sources are not committed (scratch is ignored); every probe result is embedded in the committed report.
- Three tool uses were spent on guard refusals (bootstrap receipt on the first Write, a host-path drive letter in the first report draft, an rg flag spelling).

6. Open items and next briefing
- Next, in order: (T) RED pin in plugins/pipeline-core/lib/windows-private-state.test.mjs (win32-only; premise built by ACL via icacls /inheritance:r /grant "*S-1-5-11:(OI)(CI)M" on the fixture parent, recipe untested; assert hardenWindowsPrivateDirectory(child) is secure, twice); (F) plugins/pipeline-core/lib/windows-private-state.mjs HARDEN_DIRECTORY_SCRIPT only, three exact edits listed in section 6 of the report (compare GetOwner SID to the current user SID, SetOwner only when they differ; security-adjacent, Critic mandatory, Elephant sets the tier); then re-land WIN-AP-S5 as briefed with a native-before at HEAD first. After F, GMW49/GMW50 should be green natively; GMW48 stays red (pre-existing).
- Unmeasured: elevated token / owner-not-self branch, ReFS or Dev Drive, the laptop, Codex and Antigravity runners, WSL/macOS (not affected by construction: the hardener runs on win32 only).
- Briefing defect to note: the S5 DoD named a "documented always-green control" that had in fact not been run natively since 5a72c9b61; future native-before captures should precede any slice that claims "nothing else changes".
`;

record.commits = ["cbe50d783142294efa47cadaedf14dabf359ba54"];
record.outcome = "completed";
record.log.push(
  { phase: "oriented (S5 record, GMW50 fixture, hardener, entry point, S6-F pins); probe 1 reproduced the failure only on the checkout volume", toolUses: 26 },
  { phase: "probe 2 (mechanism variants, HEAD storagePaths throws GMW-DACL) and probe 3 (pre-5a72c9b61 script passes, prototype fix repeatable); history check found 5a72c9b61 after WIN-GMW-F native capture; advisor consulted", toolUses: 38 },
  { phase: "report written and committed (cbe50d783); terminal record written", toolUses: 48 },
);
record.resultSha256 = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
record.report = { text, changedFiles: ["specs/sprint-alfred-epic/evidence/win-ap-s5-d-gmw50-hardening-2026-10-09.md"] };
writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(`record written; outcome=${record.outcome}; resultSha256=${record.resultSha256}; reportBytes=${Buffer.byteLength(text, "utf8")}`);
