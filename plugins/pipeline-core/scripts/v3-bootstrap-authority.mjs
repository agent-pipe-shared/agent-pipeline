#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only public V3 bootstrap authority validator.
 *
 * Consumer roots are not required to ship setup.mjs. The V3 migration owns
 * the source and every runtime projection, while this common reader also
 * requires the current private native Codex readback before returning ready.
 */
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  inspectRunnerProfileMigrationV3,
  planRunnerProfileMigrationV3,
} from "../lib/runner-profile-migration-v3.mjs";
import { loadManifest } from "../lib/manifest.mjs";
import {
  readCurrentRuntimeReadback,
  readRestartBarrier,
} from "../lib/codex-onboarding-runtime.mjs";
import {
  hasCodexRuntimeControlMount,
  observeCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";
import {
  LEGACY_CALIBRATION,
  NEUTRAL_CALIBRATION,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";
import { parseYaml } from "../lib/yaml-lite.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const SCHEMA = "pipeline.v3-bootstrap-authority.v1";
/**
 * The restart barrier and its native readback are Codex-specific: the barrier
 * binds a `codexExecutableSha256` and proves a fresh Codex process reloaded the
 * projected runtime. A runner listed here has no comparable contract in this
 * codebase, so requiring that artifact would be a permanently unsatisfiable
 * gate rather than evidence. Such a runner reports the honest
 * `runtimeReadback: "not-applicable"` and never claims `"current"`.
 */
const RUNNERS_WITHOUT_NATIVE_READBACK = new Set(["claude"]);

function diagnostic(path, code, message, repair) {
  return { path, code, message, repair };
}

function rejected(root, diagnostics, extra = {}) {
  return { schema: SCHEMA, status: "rejected", root, diagnostics, ...extra };
}

function hasHostManagedCalibration(root, deps = {}) {
  try {
    const authority = resolveProjectAuthorityPaths({ rootDir: root });
    const relativePath = authority.status === "ready"
      ? authority.calibration
      : (lstatSync(join(root, NEUTRAL_CALIBRATION), { throwIfNoEntry: false })
        ? NEUTRAL_CALIBRATION
        : LEGACY_CALIBRATION);
    const calibration = JSON.parse((deps.readFileSync ?? readFileSync)(
      join(root, relativePath),
      "utf8",
    ));
    return calibration?.repositoryMode === "host-managed";
  } catch { return false; }
}

function isHostManagedCodexProjection(plan, inspection) {
  return inspection.sourceKind === "v3"
    && plan.status === "ready"
    && plan.runtimeMode === "host-managed-codex"
    && plan.sourceSha256 === inspection.sourceSha256
    && (plan.changes?.length ?? 0) > 0
    && plan.changes.every((change) => change?.path?.startsWith(".codex/"));
}

function pluginManagedCodexProjectionState(root, plan, inspection, deps) {
  let admissionStatus = "absent";
  try {
    admissionStatus = observeCodexHostRepositoryInitAdmission(root, {
      lstat: deps.lstatSync,
      readFile: deps.readFileSync,
      platform: deps.process?.platform,
    }).status;
  } catch {
    admissionStatus = "invalid";
  }
  const exactProjection = inspection.sourceKind === "v3"
    && plan.status === "ready"
    && plan.runtimeMode === "host-managed-codex"
    && plan.sourceSha256 === inspection.sourceSha256
    && (plan.changes?.length ?? 0) > 0
    && plan.changes.every((change) => change?.path?.startsWith(".codex/"));
  if (!exactProjection) return null;
  const reservedMount = hasCodexRuntimeControlMount(root, {
    access: deps.accessSync,
    fsConstants: deps.constants,
    lstat: deps.lstatSync,
    readdir: deps.readdirSync,
  });
  if (admissionStatus === "valid") return "receipt-attested";
  if (admissionStatus === "invalid") return reservedMount ? "receipt-invalid" : null;
  return reservedMount ? "reserved-unattested" : null;
}

function repositoryCapability(root, deps) {
  return hasHostManagedCalibration(root, deps) ? "host-managed" : "local";
}

function projectionCurrent(root, inspection, runtimeProjection, extra = {}, deps = {}, runner = "codex") {
  if (RUNNERS_WITHOUT_NATIVE_READBACK.has(runner)) {
    // The private Codex runtime authority is never read for this runner: no
    // restart barrier has to exist on disk, and none is fabricated.
    return {
      schema: SCHEMA,
      status: "ready",
      root,
      source: inspection.source,
      sourceKind: "v3",
      sourceSha256: inspection.sourceSha256,
      runtimeProjection,
      runtimeReadback: "not-applicable",
      diagnostics: [],
      ...extra,
    };
  }
  const repositoryMode = repositoryCapability(root, deps);
  let barrier;
  try {
    barrier = readRestartBarrier({
      rootDir: root,
      repositoryCapability: repositoryMode,
      deps,
    });
  } catch {
    return rejected(root, [diagnostic(
      "$.runtime",
      "v3_runtime_readback_unavailable",
      "the private Codex runtime readback authority could not be observed safely",
      "repair the private runtime state before bootstrap",
    )], {
      source: inspection.source,
      sourceKind: "v3",
      sourceSha256: inspection.sourceSha256,
      runtimeProjection,
      ...extra,
    });
  }
  if (barrier.status === "absent") {
    return {
      schema: SCHEMA,
      status: "projection-current",
      root,
      source: inspection.source,
      sourceKind: "v3",
      sourceSha256: inspection.sourceSha256,
      runtimeProjection,
      runtimeReadback: "absent",
      diagnostics: [],
      ...extra,
    };
  }
  if (barrier.barrier.state === "restart-required") {
    return {
      schema: SCHEMA,
      status: "restart-required",
      root,
      source: inspection.source,
      sourceKind: "v3",
      sourceSha256: inspection.sourceSha256,
      runtimeProjection,
      runtimeReadback: "restart-required",
      diagnostics: [],
      ...extra,
    };
  }
  try {
    const current = readCurrentRuntimeReadback({
      rootDir: root,
      repositoryCapability: repositoryMode,
      deps,
    });
    if (current.status !== "current") throw new Error("runtime readback is absent");
  } catch {
    return rejected(root, [diagnostic(
      "$.runtime",
      "v3_runtime_readback_unavailable",
      "the cleared Codex runtime barrier has no current bound native readback",
      "repeat the authenticated restart/readback workflow",
    )], {
      source: inspection.source,
      sourceKind: "v3",
      sourceSha256: inspection.sourceSha256,
      runtimeProjection,
      ...extra,
    });
  }
  return {
    schema: SCHEMA,
    status: "ready",
    root,
    source: inspection.source,
    sourceKind: "v3",
    sourceSha256: inspection.sourceSha256,
    runtimeProjection,
    runtimeReadback: "current",
    diagnostics: [],
    ...extra,
  };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      const root = args[index + 1];
      if (!root || root.startsWith("--")) return { error: "--root requires a project directory" };
      parsed.root = root;
      index += 1;
    } else if (arg === "--runner") {
      const runner = args[index + 1];
      if (runner !== "claude" && runner !== "codex") {
        return { error: '--runner requires "claude" or "codex"' };
      }
      parsed.runner = runner;
      index += 1;
    } else if (arg === "--help" || arg === "-h") parsed.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!parsed.help && !parsed.root) return { error: "--root is required" };
  return parsed;
}

/**
 * Derives the CLI's runner from the project's own V3 source when `--runner`
 * is not given on the command line. This replicates (does not import) the
 * canonical `selectedRunner(root, fs)` derivation in
 * `../lib/project-onboarding-v3.mjs:934` -- that lib already imports
 * `validateV3BootstrapAuthority` FROM this file, so importing back from it
 * would be circular. Returns `null` on any missing/unreadable/ambiguous
 * source; a `null` result deliberately keeps the caller on the Codex
 * fail-closed path (`RUNNERS_WITHOUT_NATIVE_READBACK.has(null)` is false).
 */
function deriveCliRunner(root, deps = {}) {
  try {
    const raw = (deps.readFileSync ?? readFileSync)(join(root, "pipeline.user.yaml"), "utf8");
    const declared = parseYaml(raw)?.runners;
    const selected = declared?.default;
    return (selected === "claude" || selected === "codex")
      && Array.isArray(declared?.enabled)
      && declared.enabled.includes(selected)
      ? selected
      : null;
  } catch {
    return null;
  }
}

/**
 * `runner` is the runner the caller already derived from the project's own V3
 * source. It defaults to `"codex"`, so every existing caller keeps today's
 * exact native-readback requirement; a `null`/unknown value also stays on that
 * fail-closed Codex path.
 */
export function validateV3BootstrapAuthority({ rootDir = process.cwd(), deps = {}, runner = "codex" } = {}) {
  const inspection = inspectRunnerProfileMigrationV3({ rootDir, deps });
  if (inspection.status !== "ready") {
    return rejected(inspection.root, [diagnostic(
      "$.source",
      "v3_inspection_not_ready",
      "the project does not have one readable V3 migration source",
      "repair the reported source or recovery condition through the explicit V3 migration workflow",
    ), ...(inspection.diagnostics ?? [])], { inspectionStatus: inspection.status });
  }
  if (inspection.sourceKind !== "v3") {
    return rejected(inspection.root, [diagnostic(
      "$.sourceKind",
      "v3_source_not_current",
      "pipeline.user.yaml is not a current pipeline.user.v3 authority",
      "run the explicit V3 migration/apply workflow, then rerun bootstrap",
    )], { source: inspection.source, sourceKind: inspection.sourceKind });
  }

  const manifest = loadManifest(inspection.root);
  if (manifest.status !== "ok") {
    return rejected(inspection.root, [diagnostic(
      "$.manifest",
      "manifest_invalid",
      "the canonical .claude/pipeline.yaml manifest is absent or invalid",
      "regenerate the manifest only through the explicit V3 lifecycle writer",
    )], { source: inspection.source, sourceKind: inspection.sourceKind, manifestStatus: manifest.status });
  }

  const plan = planRunnerProfileMigrationV3({ rootDir, deps });
  const hostManagedCalibration = hasHostManagedCalibration(inspection.root, deps);
  const pluginManagedState = pluginManagedCodexProjectionState(
    inspection.root,
    plan,
    inspection,
    deps,
  );
  if (pluginManagedState) {
    const invalidAdmission = pluginManagedState === "receipt-invalid";
    return {
      schema: SCHEMA,
      status: pluginManagedState === "receipt-attested"
        ? "ready"
        : invalidAdmission
          ? "projection-drift"
          : "host-init-required",
      root: inspection.root,
      source: inspection.source,
      sourceKind: "v3",
      sourceSha256: inspection.sourceSha256,
      runtimeProjection: invalidAdmission
        ? "plugin-managed-invalid"
        : pluginManagedState === "receipt-attested"
          ? "plugin-managed"
          : "plugin-managed-unattested",
      runtimeReadback: invalidAdmission
        ? "invalid"
        : pluginManagedState === "receipt-attested"
          ? "plugin-provided"
          : "absent",
      diagnostics: invalidAdmission
        ? [diagnostic(
          "$.runtime",
          "host_init_admission_invalid",
          "the existing host initialization admission is invalid or stale",
          "repair the host initialization receipt and control layout before retrying",
        )]
        : [],
    };
  }
  if (hostManagedCalibration && isHostManagedCodexProjection(plan, inspection)) {
    return rejected(plan.root, [diagnostic(
      "$.runtime",
      "v3_runtime_projection_missing",
      "the host-managed root has no materialized selected Codex runtime projection",
      "use the lifecycle capability result; a read-only host target cannot claim bootstrap readiness",
    )], {
      source: inspection.source,
      sourceKind: "v3",
      sourceSha256: inspection.sourceSha256,
      runtimeProjection: "host-managed-codex",
      hostManagedCalibration: true,
    });
  }
  if (plan.status !== "noop" || plan.sourceKind !== "v3" || plan.sourceSha256 !== inspection.sourceSha256
    || (plan.changes?.length ?? 0) !== 0 || (plan.decisionConflicts?.length ?? 0) !== 0) {
    const code = plan.status === "ready" ? "v3_runtime_drift"
      : plan.sourceSha256 !== inspection.sourceSha256 ? "v3_source_changed_during_readback"
        : "v3_plan_not_noop";
    return rejected(plan.root ?? inspection.root, [diagnostic(
      "$.runtime",
      code,
      "the current V3 source and runtime projections do not produce an empty migration plan",
      "repair only through the explicit V3 migration/apply workflow, then rerun bootstrap",
    ), ...(plan.diagnostics ?? [])], {
      source: inspection.source,
      sourceKind: plan.sourceKind ?? inspection.sourceKind,
      planStatus: plan.status,
      runtimeMode: plan.runtimeMode ?? "standard",
      hostManagedCalibration,
      changes: (plan.changes ?? []).map((change) => change.path),
    });
  }

  return projectionCurrent(plan.root, inspection, "noop", {}, deps, runner);
}

export function main(args = process.argv.slice(2), {
  write = process.stdout.write.bind(process.stdout),
  deps = {},
} = {}) {
  const options = parseArgs(args);
  if (options.help) {
    write("Usage: node plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs --root <project-dir> [--runner claude|codex]\n");
    return 0;
  }
  if (options.error) {
    write(`${options.error}\n`);
    return 2;
  }
  const runner = options.runner ?? deriveCliRunner(options.root, deps);
  const result = validateV3BootstrapAuthority({ rootDir: options.root, deps, runner });
  write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === "ready" ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) process.exit(main());
