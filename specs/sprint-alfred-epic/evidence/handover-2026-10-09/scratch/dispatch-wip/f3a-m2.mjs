// ADR0085-M2 read-only probe: is the live design approval admitted at HEAD?
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { rereadApprovedDesignWorkflowPackage } from "../../plugins/pipeline-core/lib/design-workflow-package.mjs";
import { designAdvisoryAdmission } from "../../plugins/pipeline-core/lib/guard-devplan-policy.mjs";
import { LEGACY_STATE, NEUTRAL_STATE, resolveProjectAuthorityPaths } from "../../plugins/pipeline-core/lib/project-authority.mjs";

const projectDir = process.cwd();
const auth = resolveProjectAuthorityPaths({ rootDir: projectDir });
const rel = auth.status === "ready" ? auth.state : (existsSync(join(projectDir, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
const state = JSON.parse(readFileSync(join(projectDir, rel), "utf8"));
const t = (d) => (typeof d === "string" ? d.slice(0, 12) : String(d));
const sha = (p) => createHash("sha256").update(readFileSync(join(realpathSync(projectDir), p))).digest("hex");

const approval = state.planApproval;
console.log(`planApproval.schema: ${approval?.schema}`);
const planPath = typeof state.planSubmission?.planPath === "string" ? state.planSubmission.planPath : approval?.poGateAuthority?.planPath;
const specPath = typeof state.planSubmission?.specPath === "string" ? state.planSubmission.specPath : approval?.poGateAuthority?.specPath;
console.log(`planPath: ${planPath} (${t(sha(planPath))})`);
console.log(`specPath: ${specPath} (${t(sha(specPath))})`);
console.log(`packageSha256: ${t(approval?.designWorkflowPackageSha256)}`);

try {
  const root = realpathSync(projectDir);
  const r = rereadApprovedDesignWorkflowPackage({
    repoRoot: root,
    packagePath: approval.designWorkflowPackagePath,
    packageSha256: approval.designWorkflowPackageSha256,
    featureId: state.activeFeature?.id,
    planPath, planSha256: sha(planPath),
    specPath, specSha256: sha(specPath),
    advisorExceptionBinding: approval.designWorkflowApproval?.advisorException ?? null,
  });
  console.log(`probe1 rereadApprovedDesignWorkflowPackage: ok=${r.ok} code=${r.code} mode=${approval.designWorkflowApproval?.mode}`);
} catch (e) {
  console.log(`probe1 THREW: ${e.code} ${String(e.message).slice(0, 120)}`);
}
try {
  const a = designAdvisoryAdmission(state, projectDir, planPath, specPath);
  console.log(`probe2 designAdvisoryAdmission: ok=${a.ok} code=${a.code} mode=${a.mode}`);
} catch (e) {
  console.log(`probe2 THREW: ${e.code} ${String(e.message).slice(0, 120)}`);
}
