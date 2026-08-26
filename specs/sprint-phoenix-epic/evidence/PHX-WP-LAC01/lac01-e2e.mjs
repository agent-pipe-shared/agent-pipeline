// SPDX-License-Identifier: SUL-1.0
// Independent end-to-end confirmation for PHX-WP-LAC01: drive the REAL CLI in a
// real git fixture repository, then read the persisted event back off disk and
// validate it through the closed lifecycle schema. Writes its own evidence file.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLifecycleGovernanceEvent } from "../../../../plugins/pipeline-core/lib/lifecycle-governance-events.mjs";
import { statePath } from "../../../../plugins/pipeline-core/scripts/pipeline-state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, "../../../../plugins/pipeline-core/scripts/pipeline-state.mjs");
const EVIDENCE = join(here, "lac01-e2e-readback.json");
const A = "a".repeat(64), B = "b".repeat(64), D = "d".repeat(64);
const FEATURE = "feature-lifecycle-e2e";
const OUT = "artifacts/lifecycle/dispatch-e2e.json";
const dir = mkdtempSync(join(tmpdir(), "lac01-e2e-"));
const git = (...argv) => spawnSync("git", argv, { cwd: dir, encoding: "utf8" });
const cli = (...argv) => spawnSync(process.execPath, [CLI, ...argv], { cwd: dir, encoding: "utf8" });

git("init", "-q", "-b", "main");
git("config", "user.email", "fixture@example.invalid");
git("config", "user.name", "fixture");
writeFileSync(join(dir, "README.md"), "lac01 fixture\n");
git("add", "--", "README.md");
git("commit", "-q", "-m", "fixture");
const headCommit = git("rev-parse", "HEAD").stdout.trim();
const headTree = git("rev-parse", "HEAD^{tree}").stdout.trim();

const identity = (queueRevision) => ({
  featureId: FEATURE, queueRevision, packageId: "P1", actionId: "continuity-writer",
  dispatchId: "dispatch-e2e", attemptId: "attempt-e2e",
  authorityDigests: { prdSha256: A, specSha256: B, resultSha256: null },
  routeRequestSha256: D, mayDelegate: false,
});
const queue = (dispatch, nextAction) => ({ packageId: "P1", actionId: "continuity-writer", nextAction, productRetryCount: 0, environmentRerouteCount: 0, dispatch });
const initial = {
  schema: "pipeline.continuity.v0", featureId: FEATURE, revision: 0,
  runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
  authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: null },
  queueHead: queue(null, "dispatch"), blocker: null, acknowledgedFinal: null,
  resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
  recovery: null, decisionTxn: null,
  capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
};
const next = { ...structuredClone(initial), revision: 1, queueHead: queue(identity(1), "poll"), resume: { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" } };
writeFileSync(join(dir, "init.json"), `${JSON.stringify(initial, null, 2)}\n`);
writeFileSync(join(dir, "next.json"), `${JSON.stringify(next, null, 2)}\n`);

const setFeature = cli("set-feature", "--id", FEATURE, "--plan-path", "specs/prd.md");
const init = cli("continuity-init", "--expected-revision", "absent", "--request-file", "init.json", "--lock-token", "token-00000001");
const cas = cli("continuity-cas", "--expected-revision", "0", "--request-file", "next.json", "--lock-token", "token-00000001",
  "--lifecycle-event-out", OUT, "--parent-orchestration-id", "orchestration-e2e", "--worker-id", "worker-e2e", "--correlation-id", "corr-e2e");

const persistedRaw = readFileSync(join(dir, OUT), "utf8");
const validated = validateLifecycleGovernanceEvent(JSON.parse(persistedRaw));
const stateRevision = JSON.parse(readFileSync(statePath(dir), "utf8")).continuity.revision;
const evidence = {
  schema: "phx-wp-lac01.e2e-readback.v1",
  exitCodes: { setFeature: setFeature.status, continuityInit: init.status, continuityCas: cas.status },
  casStdout: cas.stdout.trim().split("\n"),
  persistedEventPath: OUT,
  persistedEventBytes: Buffer.byteLength(persistedRaw, "utf8"),
  readbackValidatesThroughClosedSchema: true,
  event: validated,
  candidateMatchesRealGitHead: validated.candidate.commit === headCommit && validated.candidate.tree === headTree,
  persistedStateRevision: stateRevision,
};
const failed = cas.status !== 0 || evidence.candidateMatchesRealGitHead !== true || stateRevision !== 1;
writeFileSync(EVIDENCE, `${JSON.stringify({ ...evidence, outcome: failed ? "failed" : "confirmed" }, null, 2)}\n`);
if (failed) { console.error(`failed: cas=${cas.status} ${cas.stderr}`); process.exit(1); }
console.log(`confirmed: ${validated.eventId}`);
