#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
} from "../../lib/project-onboarding-ready-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(HERE, "SKILL.md"), "utf8");
const pluginRoot = join(HERE, "..", "..");
const criticSkill = readFileSync(join(pluginRoot, "skills", "critic-review", "SKILL.md"), "utf8");
const criticAgent = readFileSync(join(pluginRoot, "agents", "critic.md"), "utf8");
const repositoryRoot = join(pluginRoot, "..", "..");
const criticRole = readFileSync(join(repositoryRoot, "roles", "critic.md"), "utf8");
const criticTemplate = readFileSync(join(repositoryRoot, "templates", "prompts", "critic-review.md"), "utf8");
const sessionBootstrap = readFileSync(join(repositoryRoot, "harness", "session-bootstrap.md"), "utf8");

const cases = [
  ["Critic role carriers close before preflight and cannot fall into Elephant onboarding", () => {
    assert.match(skill, /Role resolution \(first decision, before preflight\)/u);
    assert.match(skill, /Default to `elephant` only when no role carrier exists/u);
    assert.match(skill, /Conflicting or unknown role carriers are a bootstrap defect: stop before the\s+preflight, onboarding inspection, Git, State, handover, or history/u);
    assert.match(skill, /For\s+Goldfish and Critic, validate the action shape but do not execute it/u);
    assert.match(skill, /Goldfish and Critic retain their compact rows and never gain an onboarding\s+inspection from this boundary selection/u);
    for (const surface of [skill, criticSkill, criticAgent, criticRole, criticTemplate, sessionBootstrap]) {
      assert.match(surface, /CRITIC-BOOTSTRAP-ROLE-CLOSED/u);
    }
    assert.match(criticSkill, /an omitted adapter argument must not select\s+the Elephant default/u);
    assert.match(criticAgent, /never execute\s+its onboarding `nextAction`, default to Elephant/u);
    assert.match(criticTemplate, /Bootstrap role: critic \(closed/u);
  }],
  ["bootstrap command grammar failures retry without revoking lifecycle readiness", () => {
    assert.match(skill, /Run each bootstrap shell observation as one simple read-only command/u);
    assert.match(skill, /Do not use `\| sort`, `&&`, `;`, `tee`, `xargs`, command substitution, or output redirection/u);
    assert.match(skill, /read with `rg --files` and sort the returned paths in agent memory/u);
    assert.match(skill, /exact bounded `rg … \| head -n 1\.\.500` diagnostic form/u);
    assert.match(skill, /does not invalidate an already observed V4 `ready` lifecycle result/u);
    assert.match(skill, /Retry the observation in an admitted form and continue the same bootstrap/u);
  }],
  ["V4 bootstrap inspection is checked before Git or ordinary V3 authority", () => {
    const onboarding = skill.indexOf("## Step 0 — Consumer-root onboarding state");
    const loadedState = skill.indexOf("## Step 1 — Ruleset presence + loaded state");
    const v3Authority = skill.indexOf("## Step 1a — V3 source/runtime authority");
    assert.ok(onboarding >= 0, "Step 0 must exist");
    assert.ok(onboarding < loadedState, "onboarding must precede loaded-state Git checks");
    assert.ok(onboarding < v3Authority, "onboarding must precede V3 authority checks");
    assert.match(skill, /Before \*\*any\*\* `git rev-parse`, Git freshness helper, `setup\.mjs`, V3 authority\s+validator/u);
    assert.match(skill, /project-onboarding-v3\.mjs" inspect --root "\$PWD" --intent bootstrap/u);
    assert.match(skill, /pipeline\.project-onboarding\.v4/u);
    assert.match(skill, /Do not replace\s+it with a shell emptiness check, a copied consumer-root `setup\.mjs`, generated\s+project-file heuristics, or an incidental Git error/u);
  }],
  ["an inherited restart ticket performs private host readback before inspection and then re-inspects", () => {
    const helper = skill.indexOf("codex-project-runtime-readback-host.mjs");
    const inspect = skill.indexOf('project-onboarding-v3.mjs" inspect --root "$PWD" --intent bootstrap');
    assert.ok(helper >= 0 && helper < inspect, "ticket-bound helper must precede the V4 bootstrap inspection");
    assert.match(skill, /preflight helper's `handoff` result/u);
    assert.match(skill, /reports handoff presence only and never\s+prints the private ticket or token/u);
    assert.match(skill, /do not inspect the\s+environment again/u);
    assert.match(skill, /pipeline\.codex-project-runtime-readback-status\.v1/u);
    assert.match(skill, /status `produced`/u);
    assert.match(skill, /runtime-readback-unavailable/u);
    assert.match(skill, /re-inspect from the beginning/u);
    assert.match(skill, /runtime\.status `readback-current`/u);
    assert.match(skill, /post-ticket result may continue only as\s+`ready` with runtime\.status `readback-current`/u);
  }],
  ["normal bootstrap accepts only native local or receipt-bound plugin-managed readiness", () => {
    assert.match(skill, /On the normal path with no inherited ticket, `ready` has exactly three accepted\s+runtime forms/u);
    assert.match(skill, /repository mode `local` with repository status `local-valid-writable`/u);
    assert.match(skill, /repository mode `local` with repository status `local-valid-writable`,\s+runtime status `plugin-managed`/u);
    assert.match(skill, /repository mode and status `host-managed`, runtime status `plugin-managed`/u);
    assert.match(skill, /a non-null source digest, null target\/barrier\/readback digests/u);
    assert.match(skill, /`appServer\.required:true` plus\s+`appServer\.status:running` and `appServer\.code:CAS-READY`/u);
    assert.match(skill, /receipt-bound forms require no runtime initialization or native readback\s+barrier/u);
    assert.match(skill, /make no project-local\s+runtime or native-readback claim/u);
    assert.match(skill, /empty read-only `\.codex` directory alone is not runtime authority/u);
    assert.match(skill, /authoritative in the execution boundary\s+selected by the preflight/u);
    assert.match(skill, /Under `host-authorized-wsl`, run the exact inspector once directly\s+at the host-authorized local read-only boundary/u);
    assert.match(skill, /do not precede it with a sandbox probe or repeat it across both views/u);
    assert.match(skill, /Any mixed form\s+is malformed and fail-closed/u);
    assert.match(skill, /V4 inspection itself carries\s+the mandatory single read-only App-Server observation/u);
    assert.match(skill, /`host-managed` form with a concrete `gitVersion` is the narrowly bound\s+post-initialization Codex mount/u);
    assert.match(skill, /fresh pre-initialization form is not `ready`/u);
    assert.match(skill, /`host-repository-init-required`/u);
    assert.match(skill, /runtime status `plugin-managed-unattested`/u);
    assert.match(skill, /`appServer\.required:false`, `appServer\.status:not-requested`, and\s+`appServer\.code:null`/u);
  }],
  ["host-managed readiness hands off only bounded Git initialization to the host", () => {
    assert.match(skill, /codex-host-repository-init\.mjs" plan --root "\$PWD"/u);
    assert.match(skill, /pipeline\.codex-host-repository-init-plan\.v1/u);
    assert.match(skill, /`requiresHostBoundary:true`/u);
    assert.match(skill, /run it only through the host-authorized local write boundary/u);
    assert.match(skill, /never in the workspace sandbox/u);
    assert.match(skill, /pipeline\.codex-host-repository-init-apply\.v1/u);
    assert.match(skill, /initializes Git without a commit, copies the private kickoff continuity\s+history into the new Git control path/u);
    assert.match(skill, /atomically publishes one private\s+digest-bound admission directory containing the transaction intent, post-init\s+receipt, and receipt-digest marker in `\.claude\/\.runtime`/u);
    assert.match(skill, /An exact\s+pending intent plus the same exclusively reserved Git directory identity and\s+successfully initialized closed core-tree make the confirmed apply\s+restart-safe; a partial or replaced `\.git` fails closed, and pending state is\s+never readiness by itself/u);
    assert.match(skill, /fresh Codex\s+hook can distinguish the otherwise identical empty protected mount/u);
    assert.match(skill, /mutates no portable\s+Pipeline\/project file/u);
    assert.match(skill, /exactly one ordinary project-session\s+restart/u);
    assert.match(skill, /Do not run the\s+onboarding inspector at the host boundary/u);
    assert.match(skill, /For this 0\.4\.6 compatibility hotfix,\s+the lifecycle guard may fall back either to the exact fresh-root host-init\s+admission directory/u);
    assert.match(skill, /complete protected Git control mount \(`HEAD`, `config`, `objects`,\s+and `refs`; never an empty `\.git`\)/u);
    assert.match(skill, /physical\s+project root, stable Pipeline source\/calibration authority, and\s+immutable\s+kickoff history/u);
    assert.match(skill, /Issue #25 owns replacing\s+both with one native cross-view session attestation/u);
  }],
  ["V4 progress and every controlling terminal state expose only their closed structured action", () => {
    for (const status of ["portable-seed-required", "runtime-initialization-required", "runtime-attestation-required", "restart-required", "kickoff-required", "ready"]) {
      assert.equal(skill.includes(`\`${status}\``), true, `${status} must be documented`);
    }
    for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
      assert.equal(skill.includes(status), true, `${status} must fail closed in bootstrap`);
    }
    assert.match(skill, /Execute only a schema-valid read-only `command` action\s+whose `mutation` and `requiresConfirmation` fields are both `false`/u);
    assert.match(skill, /Never auto-execute a mutating action/u);
    assert.match(skill, /digest-bound `apply-portable-seed`,\s+`initialize-runtime`, or `apply-repair` action/u);
    assert.match(skill, /`restart-process`[\s\S]*requiresCurrentProcessExit/u);
    assert.match(skill, /`partial\|invalid\|unsafe\|migration-required\|adoption-required/u);
    assert.doesNotMatch(skill, /fresh-host-managed/u);
    assert.doesNotMatch(skill, /project-onboarding-v3\.mjs" apply --root "\$PWD" --activate/u);
  }],
  ["kickoff-required gives one complete local command and forbids remote syntax discovery", () => {
    assert.match(skill, /goal is a short project\s+objective, not the pasted design, requirements list, acceptance criteria, or\s+PRD/u);
    assert.match(skill, /one line, ideally 3–12 words, and at most 160 UTF-8 bytes/u);
    assert.match(skill, /Preserve the\s+complete design in conversation for the post-bootstrap PRD\/spec review/u);
    assert.match(skill, /never pass it through `--goal`/u);
    assert.match(skill, /project-onboarding-v3\.mjs" kickoff plan --root "\$PWD" --goal "\{\{GOAL\}\}"/u);
    assert.match(skill, /`kickoff` and `plan` are two separate argv elements in that order/u);
    for (const alias of ["`kickoff-plan`", "`plan-kickoff`", "`plan --goal`", "bare `kickoff`"]) {
      assert.equal(skill.includes(alias), true, `${alias} must be explicitly rejected`);
    }
    assert.match(skill, /Do not inspect the script, search GitHub,\s+browse the web, call a repository connector, or run any remote command/u);
    assert.match(skill, /pipeline\.codex-onboarding-kickoff-plan\.v1/u);
    assert.match(skill, /project-onboarding-v3\.mjs" kickoff apply --root "\$PWD" --goal "\{\{SAME_GOAL\}\}" --plan-sha256 "\{\{PLAN_SHA256\}\}" --activate/u);
    assert.match(skill, /Never reconstruct the\s+digest, split the goal, or substitute a network result/u);
  }],
  ["runner SessionStart hints are visible but never invisible initializers", () => {
    assert.match(skill, /Codex and Claude expose a visible, non-mutating SessionStart onboarding hint/u);
    assert.match(skill, /For an ungoverned folder it is an opt-in gate/u);
    assert.match(skill, /run neither this skill nor an\s+onboarding inspection until the user answers affirmatively/u);
    assert.match(skill, /Codex and Claude SessionStart hooks surface a visible, non-mutating onboarding reminder/u);
    assert.match(skill, /MUST NOT invoke this skill or inspect onboarding before the affirmative answer/u);
  }],
  ["pipeline-start reports its resolved distribution identity before inspection", () => {
    assert.match(skill, /Runtime identity line \(mandatory, before Step 0\)/u);
    assert.match(skill, /pipeline-start-preflight\.mjs/u);
    assert.match(skill, /pipeline\.start-preflight\.v1/u);
    assert.match(skill, /reports handoff presence only and never\s+prints the private ticket or token/u);
    assert.match(skill, /Agent Pipeline start: version \{\{MANIFEST_VERSION\}\} · plugin root \{\{ABSOLUTE_PLUGIN_ROOT\}\}/u);
    assert.match(skill, /`plugin-refresh-required` is an attended update handoff, not a project defect/u);
    assert.match(skill, /ask\s+whether the user wants to activate the already installed version/u);
    assert.match(skill, /Claude Code uses its native\s+`\/reload-plugins`/u);
    assert.match(skill, /Codex has no such slash command/u);
    assert.match(skill, /installation performed\s+inside `\/plugins` is followed by `\/new`/u);
    assert.match(skill, /`plugin-daemon-refresh-required`/u);
    assert.match(skill, /codex app-server daemon restart/u);
    assert.match(skill, /Never invent a Codex `\/reload-plugins` command/u);
    assert.match(skill, /restart the global daemon from an\s+active project session or without that explicit authorization/u);
    assert.match(skill, /run only `codex plugin list --json` as the native registry\s+readback/u);
    assert.match(skill, /`pipeline-core@agent-pipeline-local`/u);
    assert.match(skill, /sanctioned development override/u);
    assert.match(skill, /prevents an older official session from replacing its cache/u);
    assert.match(skill, /do\s+not search cache directories, use a replacement plugin root, inspect the\s+network, or run onboarding/u);
    assert.match(skill, /run no onboarding command/u);
    assert.match(skill, /`installedSource` as\s+`remote\|local-development\|unknown`/u);
    assert.match(skill, /`executionBoundary` as\s+`default\|host-authorized-wsl`/u);
    assert.match(skill, /a `nextAction`\s+that is null unless status is `ready`/u);
    assert.match(skill, /For Elephant, execute that exact returned action at its declared boundary/u);
    assert.match(skill, /never reconstruct\s+or independently invoke the initial lifecycle inspector/u);
    assert.match(skill, /Agent Pipeline source: local-development · registered local Codex marketplace/u);
    assert.match(skill, /also permits push and release/u);
    assert.match(skill, /make that one routing\s+decision authoritative for the whole bootstrap/u);
    assert.match(skill, /Do not first execute any of those helpers in\s+the workspace sandbox/u);
    assert.match(skill, /every mutating action retains its exact confirmation/u);
  }],
  ["V3 source plus native or plugin-managed runtime authority is bootstrap authority", () => {
    assert.match(skill, /pipeline\.user\.v3/u);
    assert.match(skill, /v3-bootstrap-authority\.mjs" --root "\$PWD"/u);
    assert.match(skill, /Consumer-root `setup\.mjs`\s+is neither required nor consulted/u);
    assert.match(skill, /`runtimeProjection: "noop"`/u);
    assert.match(skill, /`runtimeReadback: "current"`/u);
    assert.match(skill, /`runtimeProjection: "plugin-managed"`/u);
    assert.match(skill, /`runtimeReadback: "plugin-provided"`/u);
    assert.match(skill, /status `ready`/u);
    assert.match(skill, /projection-only\s+`projection-current`, `restart-required`, host-managed projection gap, or\s+unavailable cleared readback is non-success/u);
    assert.match(skill, /explicit V3 migration\/apply/u);
    assert.match(skill, /current native readback/u);
    assert.match(skill, /pending restart barrier is bound to\s+a different Pipeline launcher\/helper or Codex executable identity/u);
    assert.match(skill, /replacing a\s+stale binding when necessary/u);
    assert.match(skill, /`executionBoundary:external-terminal`/u);
    assert.match(skill, /`invocation:user-copy-only`/u);
    assert.match(skill, /`codexToolCallPermitted:false`/u);
    assert.match(skill, /never submit the launcher to Bash, exec, PTY, or any\s+other Codex tool/u);
    assert.match(skill, /run the exact digest-bound action in a real\s+external terminal/u);
    assert.match(skill, /returned `launch\.copyCommand` object is mandatory/u);
    assert.match(skill, /`maxColumns:72` plus nonempty `posix` and `powershell`/u);
    assert.match(skill, /On Linux and macOS print the exact\s+returned `posix` string/u);
    assert.match(skill, /on Windows print the exact returned `powershell`\s+string/u);
    assert.match(skill, /never reconstruct it from argv/u);
    assert.match(skill, /assembles long paths from short variable assignments/u);
    assert.match(skill, /`external-launch-required`/u);
    assert.match(skill, /`retryAfterEpochMs`/u);
    assert.match(skill, /invokes the digest-bound\s+readback helper directly/u);
    assert.match(skill, /starts a separate strict App Server/u);
    assert.match(skill, /ordinary token-free Codex TUI/u);
    assert.match(skill, /`readback-produced` means the barrier was\s+cleared but the TUI could not be started/u);
    assert.match(skill, /re-enters this Step 0 with no inherited handoff/u);
  }],
  ["host-managed freshness is bound to protected controls or the durable initializer receipt", () => {
    assert.match(skill, /accepts only the exact protected control layout or the durable digest-bound receipt/u);
    assert.match(skill, /Neither host-managed form claims remote freshness or performs a fetch/u);
    assert.match(skill, /invalid host-managed layout or receipt/u);
  }],
  ["V1/V2 and runtime drift fail closed without confirmation", () => {
    assert.match(skill, /\*\*F5\*\*/u);
    assert.match(skill, /Do not use V1\/V2/u);
    assert.match(skill, /print \*\*no confirmation line\*\*/u);
  }],
  ["Codex locked projects use only the loaded plugin status wrapper", () => {
    assert.match(skill, /\.agent-pipeline\/core\.lock\.json/u);
    assert.match(skill, /currently loaded `pipeline-core` plugin/u);
    assert.match(skill, /node "\$\{PIPELINE_PLUGIN_ROOT\}\/scripts\/codex-private-overlay-activation\.mjs" route --project-root "\$PWD"/u);
    assert.match(skill, /Do not substitute a silent `test -f`/u);
    assert.match(skill, /status `public` with sole reason `SNT-A-ROUTE-PUBLIC`/u);
    assert.match(skill, /status `locked` with sole reason `SNT-A-ROUTE-LOCKED`/u);
    assert.match(skill, /node "\$\{PIPELINE_PLUGIN_ROOT\}\/scripts\/codex-private-overlay-activation\.mjs" status --project-root "\$PWD"/u);
    assert.match(skill, /node "\$\{PIPELINE_PLUGIN_ROOT\}\/scripts\/codex-private-overlay-activation\.mjs" load-context --project-root "\$PWD"/u);
    assert.match(skill, /Never select a wrapper under `\$PWD`/u);
    assert.match(skill, /Do not run project-local\s+`setup\.mjs`, a local harness,[\s\S]*as an SNT-A\s+identity\/admission substitute/u);
    assert.match(skill, /When `\.agent-pipeline\/core\.lock\.json` is absent,[\s\S]*ordinary public-project/u);
  }],
  ["private-overlay status outcomes are explicit and mutation-free", () => {
    assert.match(skill, /`activation-required`:[\s\S]*STOP before Step 1b and print no confirmation\s+line/u);
    assert.match(skill, /Report the returned reason and `planSha256`; perform no mutation/u);
    assert.match(skill, /do not invoke `activate`/u);
    assert.match(skill, /`rejected`, a non-zero exit, malformed output,[\s\S]*FAIL CLOSED/u);
    assert.match(skill, /`activated`: this is the only activation status/u);
  }],
  ["activated status requires the bounded operational context envelope", () => {
    assert.match(skill, /sanitized status alone is never private context/u);
    assert.match(skill, /pipeline\.private-overlay-operational-context\.v1/u);
    assert.match(skill, /status `context-loaded`/u);
    assert.match(skill, /same `planSha256` as the activated readback/u);
    assert.match(skill, /not private filenames/u);
    assert.match(skill, /Do not echo,[\s\S]*persist,[\s\S]*export/u);
    assert.match(skill, /SNT-A-CODEX-CONTEXT-TRANSFER-UNAVAILABLE/u);
    assert.match(skill, /Only `activated` plus schema-valid `context-loaded` may continue/u);
    assert.match(skill, /Do not infer or reconstruct the\s+private inputs from the project checkout, status stdout, setup, or harness/u);
  }],
  ["SNT-A admission does not replace project F4 checks", () => {
    assert.match(skill, /replaces only SNT-A identity, admission,[\s\S]*private-input authentication/u);
    assert.match(skill, /does \*\*not\*\* satisfy or replace\s+the project-specific Step 3 calibration\/denies, Step 4 handover, or Step 5\s+verify checks/u);
    assert.match(skill, /retain their F4 behavior/u);
  }],
  ["work profiles are epic feature mini and advisory is not a profile", () => {
    assert.match(skill, /`epic`, `feature`, or `mini`/u);
    assert.match(skill, /`advisor` and `design-first` are no longer profiles/u);
    assert.doesNotMatch(skill, /Profile \{\{advisor\|design-first/u);
    assert.doesNotMatch(skill, /\/advisor fable/u);
    assert.equal((skill.match(/MP-26g/gu) ?? []).length, 1, "MP-26g may appear only in the explicit V3 supersession notice");
    assert.match(skill, /reuse the persisted unambiguous V3\s+profile and phase/u);
    assert.match(skill, /Ask only when[\s\S]*genuinely\s+ambiguous/u);
    assert.doesNotMatch(skill, /profile question repeats at EVERY bootstrap/u);
  }],
  ["Epic and Feature run only model-free Advisor preflight while Mini and declined disable it", () => {
    assert.match(skill, /Missing consent resolves to `default`/u);
    assert.match(skill, /`declined` and `mini` are disabled\s+before any child, model request, export, receipt or consultation budget/u);
    assert.match(skill, /advisor-capability-preflight\.mjs/u);
    assert.match(skill, /pipeline\.advisory-capability-preflight\.v2/u);
    assert.match(skill, /available\|degraded\|unavailable\|disabled\|unknown/u);
  }],
  ["bootstrap starts no Advisor sequence and requires demand only later", () => {
    assert.match(skill, /effects must be exactly\s+zero child launches, model requests, question exports, receipts and\s+consultation-budget milliseconds/u);
    assert.match(skill, /Do not run\s+`codex-host-advisor-route\.mjs`, `codex-advisory-bootstrap\.mjs`/u);
    assert.match(skill, /Session start, profile selection, restart, resume, re-entry, Compact,\s+unchanged handover, a configured route and consent alone are explicitly\s+non-triggering/u);
    assert.match(skill, /pipeline\.advisory-demand\.v2/u);
    assert.match(skill, /unchanged reuse key is `reuse-no-repeat`/u);
    assert.match(skill, /frozen V3 Claude chain and Codex route remain consultation-only/u);
  }],
  ["Verify availability never executes the calibrated gate", () => {
    assert.match(skill, /Confirm the project's ONE verify command[\s\S]*without invoking that command/u);
    assert.match(skill, /Never append or pass `--help`/u);
    assert.match(skill, /`node --check <script>`/u);
    assert.match(skill, /resolve only the executable\s+path/u);
    assert.match(skill, /Run no full gate and create no\s+evidence at bootstrap/u);
  }],
  ["Advisor confirmation reports capability assurance without consultation claims", () => {
    assert.match(skill, /Advisor capability \{\{available\|degraded\|unavailable\|disabled\|unknown\}\}/u);
    assert.match(skill, /reports only the model-free preflight/u);
    assert.match(skill, /must never name an answer,\s+consultation receipt or consultation success/u);
  }],
  ["existing provenance and Elephant role checks remain", () => {
    assert.match(skill, /git rev-parse HEAD/u);
    assert.match(skill, /ruleset-freshness\.mjs" --repo "\$PWD"/u);
    assert.match(skill, /`pipeline\.pipeline-update-availability\.v1`/u);
    assert.match(skill, /`sprint_phoenix == origin\/sprint_phoenix` remains `equal` and write-permitted/u);
    assert.match(skill, /Only an exact matched entry from the loaded plugin's shipped\s+`pipeline\.ruleset-update-policy\.v1` may return `blocking:true`/u);
    assert.match(skill, /host-authorized\s+network-open\/read-only command boundary/u);
    assert.match(skill, /`installedSource:local-development`, skip the public-marketplace equality\s+helper/u);
    assert.match(skill, /all\s+Verify, Security, push\/publication approval, and readback gates still run\s+unchanged/u);
    assert.match(skill, /bootstrap-env-check\.mjs/u);
    assert.match(skill, /do not first run a known-to-fail sandbox probe/u);
    assert.match(skill, /check-po-gate-authority\.mjs/u);
    assert.match(skill, /EL-01\/EL-02\/EL-03\/EL-04\/EL-16\/EL-18\/EL-19/u);
    assert.match(skill, /Bootstrap check passed:/u);
  }],
  ["Compact re-enters bootstrap then resumes persisted continuity", () => {
    assert.match(skill, /Compact MUST rerun `?pipeline-start`? as a continuation re-entry/u);
    assert.match(skill, /after that re-entry, automatically continue the persisted next action without waiting/u);
    assert.match(skill, /Only an explicit pause\/cancel\/replace\/redirect, a named gate, completion or a typed blocker may stop/u);
  }],
  ["Cleanup startup reuses one CAS-bound descriptor and exposes only typed rotation/recovery", () => {
    assert.match(skill, /command owns the entire First-bind CAS/u);
    assert.match(skill, /WT-SESSION-REUSED/u);
    assert.match(skill, /MUST NOT create or persist another nonce/u);
    assert.match(skill, /atomically releases the exact State tuple/u);
    assert.match(skill, /use `release-binding`/u);
    assert.match(skill, /read-only `plan-recovery`/u);
    assert.match(skill, /digest-bound `apply-recovery` action for explicit PO confirmation/u);
    assert.match(skill, /active descriptor is never PO-force-replaced/u);
  }],
  ["Readiness and Critic retain their documented selected host boundary", () => {
    assert.equal(skill.includes("sandboxed-readonly-host-bridge.mjs"), true, "pipeline start must name the generic selected host bridge");
    assert.match(skill, /Readiness and Critic duties; it is not an Advisor route/u);
    assert.doesNotMatch(skill, /Codex Advisory[\s\S]*network-open\/read-only/u);
    assert.equal(skill.includes("danger-full-access"), false, "the prohibited mode must never appear as a workaround");
  }],
  ["self-application probes the managed toolchain without exporting pipeline scope to consumers", () => {
    assert.match(skill, /Self-application toolchain preflight/u);
    assert.match(skill, /toolchain-preflight\.mjs" --root "\$PWD"/u);
    assert.match(skill, /Agent-Pipeline checkout only/u);
    assert.match(skill, /never run it in a consumer project/u);
    assert.match(skill, /read-only observation/u);
    assert.match(skill, /does not write a receipt/u);
    assert.match(skill, /securityGate: blocking/u);
    assert.match(skill, /security\/release\/public-baseline claims/u);
    assert.match(skill, /execution_environment`, `probe_timeout`, and `probe_error`/u);
    assert.match(skill, /never recommend\s+reinstalling/u);
  }],
  ["self-application observation governance fails closed before writes", () => {
    assert.match(skill, /Observation\/document governance \(Agent-Pipeline source checkout only\)/u);
    assert.match(skill, /node harness\/scripts\/check-observation-governance\.mjs/u);
    assert.match(skill, /unclassified `docs\/` artifact/u);
    assert.match(skill, /case \*\*F6\*\*/u);
    assert.match(skill, /no Issue, label, backlog item, or network request/u);
    assert.match(skill, /no writing, dispatch, confirmation line/u);
  }],
];

let passed = 0;
for (const [name, run] of cases) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name} -- ${error.message}`);
  }
}

console.log(`\npipeline-start V3: ${passed}/${cases.length} checks passed.`);
process.exit(passed === cases.length ? 0 : 1);
