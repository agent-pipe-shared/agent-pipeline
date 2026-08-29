#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Refuse agent edits to the configuration that decides how strong a gate is.
 *
 * WHY. The PO asked what stops an agent from simply writing
 * `gates.push_approval: "chat"` into `pipeline.user.yaml` and pushing on its own
 * authority. The measured answer was: nothing. `guard-testpath`, `guard-devplan` and
 * `guard-lifecycle-ready` all returned exit 0 for that Edit, and the file was in fact
 * edited during the session that asked the question. A review had recorded the path as
 * protected because `human-guard-override.mjs` lists it in a function called
 * `protectedPath()` — but that function only classifies what an *override* may touch;
 * it is not a PreToolUse gate and never refused anything.
 *
 * An agent that can weaken its own gate has no gate. This closes that, for the small
 * closed set of files whose contents decide a gate's strength rather than a project's
 * ordinary configuration:
 *
 *   pipeline.user.yaml              gates.push_approval, gates.*  (ADR-0056)
 *   project/critical-human-proof.json   requiredKinds / waivedKinds (ADR-0055)
 *   project/pipeline.yaml           gates.push.approval          (ADR-0054 reconciliation)
 *   project/guard-config.json       the protected-path lists themselves
 *   <live plugin root>/**          the installed guard code that is enforcing right now (GS-6)
 *
 * SHAPE. Deliberately the same as `guard-testpath`: refuse, name the rule, and point at
 * the sanctioned escape. GS-1..GS-5/GS-7 (the write-lane paths above) route through the
 * same audited `lib/human-guard-override.mjs` family every sibling guard already uses
 * (ADR-0059 Decision 3): always attempt to consume a genuinely armed capability first,
 * and on failure offer whichever route matches the repository's own COMMITTED
 * `gates.push_approval` -- chat or signed. Admitting a CHAT-armed capability here is not
 * a new hole: `authorizeHumanGuardOverride()`'s own unconditional, path-independent
 * `HGO-SIGNATURE-MODE-REQUIRED` check (ADR-0059 Decision 1) already refuses to arm ANY
 * chat-mode capability, for ANY file, unless the repository's COMMITTED mode is already
 * "chat" -- reachable only through a real, prior, deliberate human commit (ADR-0056
 * Decision 4's accepted "chosen for ergonomics" downgrade), never something a ready
 * agent session can bootstrap from "signature" by itself. A SIGNED capability is always
 * admissible regardless of the committed mode, exactly like everywhere else in HGO. GS-6
 * (the live plugin root below) is the one exception: it keeps its own separate, narrower
 * Guard Maintenance Window lift (ADR-0058) rather than HGO, because a time-boxed window
 * is the right shape for "the PO is actively developing guard code" and the wrong shape
 * for a one-shot config edit (ADR-0058 Decision 2). Neither route is a human hand-editing
 * the file outside a session: every rule this guard denies is either reachable through one
 * of these two audited ceremonies, or -- the live-plugin kernel below -- genuinely
 * unliftable, and says so with no route at all (ADR-0059's 2026-08-08 companion
 * instruction to Decision 6: never both an unreachable rule and a hand-editing escape
 * hatch beside it).
 *
 * SCOPE, and it is narrower than it looks. This hook is wired for write TOOLS only
 * (`Edit|Write|NotebookEdit`, asserted by GST07), so it never sees a shell command.
 * Measured 2026-08-06: `touch project/guard-config.json` was admitted with nothing
 * claiming it, and `node -e` is an ordinary simple command under the closed grammar — so
 * for a while the Edit refusal below could simply be stepped around. The shell lane is
 * enforced by `guard-lifecycle-ready.mjs` (`GUARD-GATE-STRENGTH-SHELL`), which is already
 * Bash-wired and already owns the read-only classifier, and which imports
 * `GATE_STRENGTH_PATHS` from here so there is one definition of what these paths are.
 * Neither half is sufficient alone; GST13..GST16 cover the shell one.
 *
 * FAIL-OPEN on malformed input and on an unreadable repository, like its siblings: a
 * guard is a safety net, not a prison. It fails CLOSED only on the thing it exists for
 * — a write to a listed path.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { writeTargetPath } from "../lib/tool-write-target.mjs";
import { parseYaml } from "../lib/yaml-lite.mjs";
import { bootstrapBindingStagingAuthoringAdmitted } from "../lib/onboarding-staging-authoring.mjs";
import { isNeverLiftableKernelPath, windowCoversRule } from "../lib/guard-maintenance-window.mjs";
import { readPushApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import {
  consumeHumanGuardOverride,
  humanGuardRouteUnavailableReason,
  planHumanGuardOverride,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { readLocalRepositoryFingerprint } from "../lib/governance-event-store.mjs";
import { canonicalSha256, parseStrictJson } from "../lib/governance-event.mjs";
import { readPublicRepositoryFile } from "../lib/threat-model-approval-request.mjs";
import {
  appendConsumedHumanGovernanceDecision,
  appendHumanGovernanceDecision,
  queryHumanGovernanceDecisions,
} from "../lib/human-governance-ledger.mjs";
import { buildAppendIntent, buildOverrideDecisions, requestDecisionId } from "../lib/guard-authority-ledger-intake.mjs";
// NVA-CF-BL19-COPYSAFEADOPT: ceremony command lines built through the shared
// renderer instead of hand-assembled `${JSON.stringify(...)}` templates,
// mirroring the identical adoption already landed in guard-lifecycle-ready.mjs
// and guard-testpath.mjs (NVA-W12-COPYSAFE).
import { boundedCopySafeCommand, placeholder } from "../lib/copy-safe-command.mjs";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const GATE_STRENGTH_PATHS = Object.freeze([
  Object.freeze({
    id: "GS-1",
    path: "pipeline.user.yaml",
    reason: "pipeline.user.yaml carries gates.push_approval — it decides whether a human clears the push gate with a detached signature or in-session (ADR-0056).",
  }),
  Object.freeze({
    id: "GS-2",
    path: "project/critical-human-proof.json",
    reason: "critical-human-proof.json decides which actions demand a detached Ed25519 proof, and carries the reasoned waivers that stand it down (ADR-0055).",
  }),
  Object.freeze({
    id: "GS-3",
    path: "project/pipeline.yaml",
    reason: "the project manifest carries gates.push.approval — it decides whether the push gate blocks at all.",
  }),
  Object.freeze({
    id: "GS-4",
    path: "project/guard-config.json",
    reason: "guard-config.json carries the protected-path lists every other guard reads, including this one's siblings.",
  }),
  Object.freeze({
    id: "GS-5",
    path: ".claude/pipeline.yaml",
    reason: "the legacy-tier manifest carries gates.push.approval for projects that never migrated (ADR-0054).",
  }),
  // GS-7 (not GS-6: that id is the live-plugin rule below and renumbering would break every
  // reference to it). GS-3 got its legacy sibling as GS-5 but GS-4 never got one, so on a
  // legacy-tier project an Edit to .claude/guard-config.json was not a gate-strength path at
  // all -- while the shell lane, which matches on basename, refused the very same file. The
  // write lane was the weaker of the two, which is the wrong way round. Found by the T1
  // Critic on 511d7d7 (F5).
  Object.freeze({
    id: "GS-7",
    path: ".claude/guard-config.json",
    reason: "the legacy-tier guard config carries the same protected-path lists as GS-4 for projects that never migrated (ADR-0054).",
  }),
  // GS-8: the first entry in this table protecting product source rather than
  // project configuration -- deliberately, because this is a fixed,
  // review-gated 2-URL allowlist the bootstrap readiness gate trusts, not
  // ordinary product source under active development. See design
  // bootstrap-origin-allowlist-and-codex-wsl-freshness.md §A.3 item 3.
  Object.freeze({
    id: "GS-8",
    path: "plugins/pipeline-core/lib/public-core-origin-allowlist.mjs",
    reason: "public-core-origin-allowlist.mjs is the two reviewed Public-Core origins the bootstrap self-application check compares its own origin against -- widening it widens what the readiness gate accepts as attested.",
  }),
  Object.freeze({
    id: "GS-9",
    path: "plugins/pipeline-core/lib/self-application-attestation-gate.mjs",
    reason: "self-application-attestation-gate.mjs decides whether the bootstrap origin/content attestation runs at all and whether its result fails -- disabling it disables the GS-8 allowlist comparison with it.",
  }),
  // GS-10..GS-15: merged in from the Nova line (feat/sprint-nova-codex-v046), renumbered
  // up from their pre-merge GS-8..GS-13 to avoid colliding with the Phoenix-side GS-8/GS-9
  // above -- GS-8/GS-9 are already referenced by id throughout the tree
  // (project/guard-config.json, guard-lifecycle-ready.mjs,
  // guard-gate-strength-origin-attestation.test.mjs), so those keep their numbers and the
  // Nova entries are appended after them.
  Object.freeze({
    id: "GS-10",
    path: "project/pipeline.json",
    reason: "the project authority configuration declares verify and core settings and must not be edited directly.",
  }),
  Object.freeze({
    id: "GS-11",
    path: ".claude/pipeline.json",
    reason: "the legacy-tier project authority configuration declares verify and core settings.",
  }),
  Object.freeze({
    id: "GS-12",
    path: "pipeline.json",
    reason: "the root pipeline manifest configuration declares verify and core settings.",
  }),
  Object.freeze({
    id: "GS-13",
    path: ".claude/policy-lock.yaml",
    reason: "the policy lock configuration enforces central governance mandate and must not be altered by agents.",
  }),
  Object.freeze({
    id: "GS-14",
    path: ".claude/policy-lock.json",
    reason: "the policy lock configuration enforces central governance mandate and must not be altered by agents.",
  }),
  Object.freeze({
    id: "GS-15",
    path: "project/.onboarding-staging/*",
    reason: "onboarding staging artifacts are coordinator-managed and must not be modified directly during implementation.",
  }),
]);

// ---------------------------------------------------------------------------------
// NVA-W13-GATESTRENGTH (backlog/items/2026-08-29-pipeline-user-yaml-file-level-
// protection-forces-signature-ceremony.md): field-scoped protection for GS-1 only.
// pipeline.field-scoped-gate-strength-protection -- the marker `done_when` greps for.
//
// GS-1's own stated `reason` above names ONE field (`gates.push_approval`), not the
// file's contents as a whole, but the write lane matches by PATH only -- so editing
// the wholly unrelated `language.human_facing` field cost the identical full ceremony
// as editing `gates.push_approval` itself. This closes that gap for GS-1 alone (the
// only entry in GATE_STRENGTH_PATHS whose stated reason names a single field, per the
// backlog item's own Proposal §1): an Edit/Write whose FIELD-LEVEL diff touches only
// an explicitly allowlisted, known-safe dotted path stands down; everything else --
// any field this allowlist does not name, any parse failure, any edit this module
// cannot cleanly simulate -- falls straight through to the unchanged, file-scoped
// ceremony below. Default-deny by construction (Acceptance bullet 2's own framing:
// "any field not on the explicit non-protected allowlist... still requires the full
// ceremony"): widening the allowlist is a deliberate, reviewable, one-line addition,
// never a class of edit silently slipping through.
//
// Deliberately does NOT touch the shell lane (`GUARD-GATE-STRENGTH-SHELL` in
// guard-lifecycle-ready.mjs): that classifier matches on the file NAME appearing
// anywhere in an arbitrary shell command string and says so in its own denial text --
// it cannot tell a read from a write inside such a string, let alone which FIELD a
// write would touch, so it stays file-scoped even after this fix (Acceptance bullet
// 3; see the backlog item's own Shell-lane note for the disclosed rationale).
// ---------------------------------------------------------------------------------

export const GATE_STRENGTH_FIELD_SCOPE_SCHEMA = "pipeline.field-scoped-gate-strength-protection.v1";

/** Dotted-path allowlist per GATE_STRENGTH_PATHS `path`. Only GS-1 has an entry today;
 * every other rule keeps its unqualified, file-level protection, unchanged. */
export const GATE_STRENGTH_FIELD_EXEMPTIONS = Object.freeze({
  "pipeline.user.yaml": Object.freeze(["language.human_facing"]),
});

/** Flattens a parsed yaml-lite value into `{ "a.b.c": leafValue }`, treating arrays and
 * `null` as opaque leaves (never descended into) -- this only needs to tell "this leaf
 * changed" from "this leaf did not", never to diff array contents element-by-element. */
function flattenGateStrengthYaml(value, prefix, out) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of Object.keys(value)) {
      flattenGateStrengthYaml(value[key], prefix === "" ? key : `${prefix}.${key}`, out);
    }
    return;
  }
  out.set(prefix, value);
}

/** Structural equality over yaml-lite's own value shapes (string/number/boolean/null/
 * array/plain object) -- deliberately not JSON.stringify, whose key-order sensitivity
 * would misclassify a semantically-unchanged object as a changed leaf. */
function gateStrengthValuesEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => gateStrengthValuesEqual(entry, b[index]));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.hasOwn(b, key) && gateStrengthValuesEqual(a[key], b[key]));
  }
  return false;
}

/** The set of dotted leaf paths that differ between two parsed yaml-lite documents --
 * added, removed, or changed value alike. Exported for direct unit coverage. */
export function changedGateStrengthDottedPaths(before, after) {
  const beforeMap = new Map();
  const afterMap = new Map();
  flattenGateStrengthYaml(before, "", beforeMap);
  flattenGateStrengthYaml(after, "", afterMap);
  const paths = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changed = [];
  for (const path of paths) {
    if (!beforeMap.has(path) || !afterMap.has(path) || !gateStrengthValuesEqual(beforeMap.get(path), afterMap.get(path))) {
      changed.push(path);
    }
  }
  return changed;
}

/**
 * The proposed full post-write text for a write-shaped tool call, against the target's
 * CURRENT on-disk content -- mirrors `guard-handover-size.mjs`'s own `proposedHandoverBytes`
 * Edit-simulation shape (single-occurrence replacement computed by hand, never
 * `String.prototype.replace()`, whose replacement-string argument treats `$&`/`$\``/`$'`/`$$`
 * as special patterns even for a literal search string). Returns `null` when the shape
 * cannot be determined; callers fail CLOSED on `null` here (unlike the size guard's
 * fail-open), because "cannot determine" means "cannot prove this touches only the
 * allowlist," and the safe default for that is to stay protected.
 */
export function simulateGateStrengthWriteContent({ toolName, toolInput, currentContent }) {
  if (toolName === "Write") {
    if (typeof toolInput?.content !== "string") return null;
    return toolInput.content;
  }
  if (toolName === "Edit") {
    if (typeof toolInput?.old_string !== "string" || typeof toolInput?.new_string !== "string") return null;
    if (toolInput.replace_all === true) {
      return currentContent.split(toolInput.old_string).join(toolInput.new_string);
    }
    const matchIndex = currentContent.indexOf(toolInput.old_string);
    if (matchIndex === -1) return null;
    return currentContent.slice(0, matchIndex) + toolInput.new_string
      + currentContent.slice(matchIndex + toolInput.old_string.length);
  }
  return null; // NotebookEdit and anything else: no simulation, stays protected
}

/**
 * True only when this Edit/Write's proposed content can be cleanly simulated, both the
 * current and proposed text parse as yaml-lite documents, and EVERY changed dotted leaf
 * path is on `exemptPaths`. Fails CLOSED (`exempt: false`, meaning "stay protected") on
 * anything it cannot determine: an unparseable document on either side, a non-object
 * top-level value, or a write shape `simulateGateStrengthWriteContent` cannot simulate.
 * `changedPaths` is `null` whenever `exempt` could not be meaningfully evaluated, so a
 * caller building a message never prints a stale or empty-by-construction list.
 */
export function evaluateGateStrengthFieldExemption({ toolName, toolInput, currentContent, exemptPaths }) {
  if (!Array.isArray(exemptPaths) || exemptPaths.length === 0) return { exempt: false, changedPaths: null };
  const proposedContent = simulateGateStrengthWriteContent({ toolName, toolInput, currentContent });
  if (proposedContent === null) return { exempt: false, changedPaths: null };

  let before;
  let after;
  try {
    before = parseYaml(currentContent);
    after = parseYaml(proposedContent);
  } catch {
    return { exempt: false, changedPaths: null };
  }
  if (before === null || typeof before !== "object" || Array.isArray(before)) return { exempt: false, changedPaths: null };
  if (after === null || typeof after !== "object" || Array.isArray(after)) return { exempt: false, changedPaths: null };

  const changedPaths = changedGateStrengthDottedPaths(before, after);
  const exemptSet = new Set(exemptPaths);
  return { exempt: changedPaths.every((path) => exemptSet.has(path)), changedPaths };
}

export const LIVE_PLUGIN_RULE = Object.freeze({
  id: "GS-6",
  reason: "this file is inside the installed plugin that is enforcing the guards right now, and a guard script is re-read on every invocation — editing it disarms the gate inside this same session.",
});

/**
 * GS-6, the same hole one level down: the config above decides a gate's strength, but the
 * INSTALLED guard code decides whether the config is read at all. `hooks.json` is loaded once
 * at session start, so rewiring it does not take effect until the next session — but a guard
 * *script* is re-read on every invocation, so writing `process.exit(0)` into the installed
 * `guard-push.mjs` disarms the push gate immediately, inside the same session. Measured: with a
 * ready lifecycle, no guard in the family claimed a write into the installed plugin root.
 *
 * Refused here is the copy that is CURRENTLY ENFORCING — the plugin root this guard is itself
 * running from. That deliberately leaves a source checkout's own `plugins/pipeline-core/`
 * writable, because in a development session the enforcing copy is the installed one and the
 * repository copy is ordinary product source under Verify, Critic and the PO gate.
 */
export function livePluginRoots() {
  const roots = new Set();
  const own = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  roots.add(own);
  const declared = process.env.CLAUDE_PLUGIN_ROOT;
  if (typeof declared === "string" && declared !== "") {
    const candidate = resolve(declared);
    // A declared root is only honoured when it actually looks like this plugin; an empty or
    // over-broad value (`/`, a home directory) must not turn this guard into a blanket refusal.
    if (existsSync(join(candidate, "hooks")) && existsSync(join(candidate, ".claude-plugin", "plugin.json"))) {
      roots.add(candidate);
    }
  }
  return [...roots];
}

/** True when `absolute` lies inside one of the currently-enforcing plugin roots. */
export function insideLivePlugin(absolute, roots = livePluginRoots()) {
  return roots.some((root) => {
    const rel = relative(root, absolute);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  });
}

/** Repository-relative, forward-slashed, case-insensitive — matching the sibling guards. */
export function gateStrengthRuleFor(filePath, projectDir) {
  if (typeof filePath !== "string" || filePath.length === 0) return null;
  const root = resolve(projectDir);
  const absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  const rel = relative(root, absolute);
  if (rel.startsWith(`..${sep}`) || rel === "") return null;
  const normalized = rel.split(sep).join("/").toLowerCase();
  return GATE_STRENGTH_PATHS.find((rule) => {
    const rPath = rule.path.toLowerCase();
    if (rPath.endsWith("/*")) {
      const prefix = rPath.slice(0, -2);
      return normalized === prefix || normalized.startsWith(`${prefix}/`);
    }
    return rPath === normalized;
  }) ?? null;
}

// ---------------------------------------------------------------------------------
// PHX-WP-HGO-LEDGER-EMISSION-V2 (design specs/sprint-phoenix-epic/design/
// gmw-hgo-evidence-intake-into-the-human-ledger.md §7.1/§7.5): additive portable
// governance-ledger emission for HGO's `denied` and `consumed` transitions, wired
// at THIS hook's own two call sites (the CLI's `granted` wiring lives in
// scripts/guard-human-override.mjs). Mirrors scripts/guard-maintenance-window.mjs's
// own repositoryFingerprintFor/capturePolicyDigestFor local-helper discipline
// (small, owned by each caller -- same DUPLICATION NOTE precedent that module
// documents at its own top).
//
// FAIL-OPEN BY DESIGN (§8.1): both helpers below record an outcome (deny, or an
// already-consumed capability) this hook has already, synchronously and
// independently, decided by the time either is called. Every call site wraps the
// `await` in try/catch and never lets a ledger failure change the hook's own
// exit code or stderr text -- narrowing/informational, not arming (contrast the
// CLI-side `granted` append, which stays fail-closed per §8.1's other branch).
// ---------------------------------------------------------------------------------

/**
 * The AUTHORITATIVE repository identity for the ledger -- never the raw rootDir
 * string, and never the path-derived `derivePoGateRepositoryFingerprint` hash
 * either (NVA-GSFP-1): every governance-event-store.mjs call below requires the
 * store's own bound identity (`readLocalRepositoryFingerprint`, bind-on-first-use)
 * or fails closed with GES-CROSS-REPOSITORY. Mirrors
 * scripts/guard-maintenance-window.mjs's own `repositoryFingerprintFor` and
 * scripts/human-authority-grant.mjs's identical local helper.
 */
export async function gateStrengthRepositoryFingerprint(rootDir) {
  const repo = discoverRepository(rootDir);
  return { repo, fingerprint: await readLocalRepositoryFingerprint({ repositoryRoot: repo.primaryRoot }) };
}

export function gateStrengthCapturePolicyDigest(primaryRoot) {
  const bytes = readPublicRepositoryFile(primaryRoot, "governance/events/capture-policy.json");
  return canonicalSha256(parseStrictJson(bytes));
}

/**
 * §7.5 `denied`: appends the `requested` then `denied` portable pair for one HGO
 * denial. `planHumanGuardOverride` (read-only; no file writes; recomputes and
 * drift-checks the same fields `recordHumanGuardDenial` already wrote) is the only
 * already-exported function that reconstructs the full request record
 * (`repository`, `policy`, `eligiblePaths`, `commandClass`) `buildOverrideDecisions`
 * requires as its `capability` parameter -- `recordHumanGuardDenial`'s own return on
 * `status: "planned"` carries only `{status, requestSha256}` (verified against
 * source). DISCLOSED deviation from a literal reading of "act on their existing
 * return values": `planHumanGuardOverride` is a third already-exported function of
 * the same module, called read-only, not a modification of the two named ones.
 *
 * `notBeforeEpochMs`/`expiresAtEpochMs` are not pinned by §7.5 for `denied` (only
 * `authorized` names a source, `capability.authorizedAt`/`.expiresAt`). This records
 * the request's own validity window: `notBeforeEpochMs` is this denial's own clock
 * read, `expiresAtEpochMs` is the request's own TTL-bound expiry already computed by
 * `recordHumanGuardDenial`/`planHumanGuardOverride`. DISCLOSED interpretation.
 */
export async function appendOverrideDeniedLedgerEvent({ rootDir, pluginRoot, requestSha256, authorizationChannel, nowMs = Date.now() }) {
  const scriptPath = join(pluginRoot, "scripts", "guard-human-override.mjs");
  const plan = planHumanGuardOverride({ rootDir, pluginRoot, requestSha256, scriptPath });
  const { repo, fingerprint } = await gateStrengthRepositoryFingerprint(rootDir);
  const capturePolicyDigest = gateStrengthCapturePolicyDigest(repo.primaryRoot);
  const { decisions: existing } = await queryHumanGovernanceDecisions({ repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint });
  const requestId = requestDecisionId({ intentSha256: requestSha256, producer: "hgo" });
  const generation = existing.filter((entry) => entry.event === "denied" && entry.links.requestDecisionId === requestId).length;
  const built = buildOverrideDecisions({
    transition: "denied",
    capability: plan,
    repositoryFingerprint: fingerprint,
    authorizationChannel,
    generation,
    notBeforeEpochMs: nowMs,
    expiresAtEpochMs: Date.parse(plan.expiresAt),
  });
  if (!built.representable) return { appended: false, reason: built.reason };
  const requestAlreadyAppended = existing.some((entry) => entry.decisionId === requestId);
  const receipts = [];
  for (const decision of built.decisions) {
    if (decision.event === "requested" && requestAlreadyAppended) continue;
    const intent = buildAppendIntent({
      decision, repositoryFingerprint: fingerprint, occurredAtEpochMs: nowMs,
      featureId: null, requestId: requestSha256, capturePolicyDigest,
    });
    receipts.push(await appendHumanGovernanceDecision({ repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint, intent }));
  }
  return { appended: true, receipts };
}

/** Parses the trailing `-<g>` generation out of an `hgo-grant-<i32>-<g>` decisionId. */
function gateStrengthGenerationOf(decisionId) {
  const match = /-(\d+)$/u.exec(decisionId);
  if (!match) throw new Error(`GST-LEDGER-DECISION-ID: cannot parse a generation out of ${decisionId}`);
  return Number(match[1]);
}

/**
 * §7.5 `consumed`: appends via the ledger's own single-use disposition helper
 * (`appendConsumedHumanGovernanceDecision`), reused rather than re-implemented
 * (design §7.5's own words: "the strongest anti-replay primitive available"). No
 * `guard-authority-ledger-intake.mjs` builder exists for `consumed` (it is not in
 * that module's `OVERRIDE_TRANSITIONS`), so the ledger's own consumption helper is
 * the correct and only path, matching `scripts/governance-authority.mjs`'s own
 * existing caller of the same function as the worked precedent for this call
 * convention. If no live granted decision is found for this request -- including
 * the case the grant itself was never representable (§7.5 layers 0/3, §8.1's named
 * exception) -- this appends nothing and returns cleanly; that is not a failure, it
 * is the not-representable/absent case propagating forward from grant time.
 *
 * The `hgo-consume-<i32>-<g>` decisionId is a DISCLOSED filled design gap: §7.3
 * names no id scheme for `consumed` (only `denyDecisionId` was already filled, with
 * the identical comment, inside `guard-authority-ledger-intake.mjs`). It follows
 * that module's own `<producer>-<kind>-<i32>-<g>` convention exactly, computed here
 * rather than there because that module is out of scope for this dispatch.
 */
export async function appendOverrideConsumedLedgerEvent({ rootDir, pluginRoot, requestSha256, nowMs = Date.now() }) {
  const { repo, fingerprint } = await gateStrengthRepositoryFingerprint(rootDir);
  const requestId = requestDecisionId({ intentSha256: requestSha256, producer: "hgo" });
  const { decisions, events } = await queryHumanGovernanceDecisions({ repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint });
  const grant = decisions.find((entry) => entry.event === "granted" && entry.outcome === "granted"
    && entry.links.requestDecisionId === requestId
    && !decisions.some((other) => Object.values(other.links).includes(entry.decisionId)
      && ["consumed", "revoked", "superseded", "corrected"].includes(other.event)));
  if (!grant) return { appended: false, reason: "no-live-grant" };
  const grantEvent = events.find((event) => event.payload.decisionId === grant.decisionId);
  if (!grantEvent) return { appended: false, reason: "no-live-grant" };
  const generation = gateStrengthGenerationOf(grant.decisionId);
  const consumeId = `hgo-consume-${requestSha256.slice(0, 32)}-${generation}`;
  const receipt = await appendConsumedHumanGovernanceDecision({
    repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint, grantEvent,
    decisionId: consumeId, eventId: `evt-${consumeId}`, idempotencyKey: consumeId, observedAtEpochMs: nowMs,
  });
  return { appended: true, receipt };
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("guard-gate-strength.mjs")) {
  let filePath = "";
  let toolName = "";
  let toolInput = {};
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    toolName = String(input?.tool_name ?? "");
    toolInput = input?.tool_input ?? {};
    filePath = writeTargetPath(toolInput, toolName);
  } catch {
    process.exit(0); // fail-open: malformed input is not this guard's business
  }
  if (!filePath) process.exit(0);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let matched = null;
  let absolute = null;
  let matchedLivePluginRoot = null;

  // GS-6 first, and independently of the marker check below: the live plugin root is Pipeline
  // code by definition, wherever it sits and whatever the surrounding project looks like.
  try {
    absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(projectDir, filePath);
    const roots = livePluginRoots();
    if (insideLivePlugin(absolute, roots)) {
      matched = LIVE_PLUGIN_RULE;
      matchedLivePluginRoot = roots.find((root) => insideLivePlugin(absolute, [root])) ?? null;
    }
  } catch { /* fall through to the path rules */ }

  if (matched === null) {
    try { matched = gateStrengthRuleFor(filePath, projectDir); } catch { process.exit(0); }
    if (matched === null) process.exit(0);

    // Only defend a repository the Pipeline actually governs; elsewhere these are
    // ordinary filenames.
    const governed = [
      "pipeline.user.yaml", "project/pipeline.yaml", ".claude/pipeline.yaml",
      "project/guard-config.json", ".claude/guard-config.json",
      "project/pipeline.json", ".claude/pipeline.json",
    ].some((marker) => existsSync(join(resolve(projectDir), marker)));
    if (!governed) process.exit(0);

    // NVA-GS15-1: GS-15 (project/.onboarding-staging/*) stands down, and only GS-15,
    // for the one narrow Edit/Write a real session performs to author/review the
    // freshly generated staging PRD/spec before bootstrap-bind-apply can bind it
    // (NVA-BL-INTAKEBIND-1) -- the identical write guard-lifecycle-ready.mjs already
    // admits, via the same shared predicate (../lib/onboarding-staging-authoring.mjs),
    // so the two guards no longer contradict each other on this exact write and the
    // PO's po-plan-acknowledged marker can actually be written. Checked here, before
    // the HGO block below, so an admitted edit never consumes or plans an override
    // capability for a write this guard is about to allow anyway. Fails CLOSED: any
    // thrown error inside the predicate (a malformed checkpoint, an unreadable
    // repository) leaves this refusal standing, exactly like every other exit path
    // in this file.
    if (matched.id === "GS-15") {
      let admitted = false;
      try {
        admitted = bootstrapBindingStagingAuthoringAdmitted({
          input: { tool_name: toolName, tool_input: toolInput }, root: projectDir,
        });
      } catch { admitted = false; }
      if (admitted) process.exit(0);
    }

    // NVA-W13-GATESTRENGTH: GS-1 stands down, and only GS-1, for an Edit/Write to
    // pipeline.user.yaml whose FIELD-LEVEL diff touches only GATE_STRENGTH_FIELD_EXEMPTIONS'
    // allowlisted dotted paths -- see the module-level comment above GATE_STRENGTH_FIELD_
    // SCOPE_SCHEMA for the full rationale. Checked here, before the HGO block below, so an
    // admitted field-scoped edit never consumes or plans an override capability for a write
    // this guard is about to allow anyway -- the same placement discipline as the GS-15
    // stand-down immediately above. Fails CLOSED on anything it cannot determine: the
    // file-level ceremony below stays the default.
    if (matched.id === "GS-1") {
      let result = { exempt: false, changedPaths: null };
      try {
        const currentContent = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
        const exemptPaths = GATE_STRENGTH_FIELD_EXEMPTIONS[matched.path] ?? [];
        result = evaluateGateStrengthFieldExemption({ toolName, toolInput, currentContent, exemptPaths });
      } catch { result = { exempt: false, changedPaths: null }; }
      if (result.exempt) {
        process.stderr.write(
          `[pipeline-field-scope] guard-gate-strength ${GATE_STRENGTH_FIELD_SCOPE_SCHEMA}: GS-1 stands down -- ` +
            `changed field(s) [${(result.changedPaths ?? []).join(", ") || "none"}] are on the explicit ` +
            "non-protected allowlist; gates.push_approval is untouched.\n",
        );
        process.exit(0);
      }
    }
  }

  // GMW (ADR-0058): the ONLY new allow path for this file, and only for GS-6. The
  // hardcoded kernel is checked FIRST and unconditionally, before any window lookup
  // -- a path in NEVER_LIFTABLE_KERNEL_PATHS is refused even under an active,
  // correctly-scoped, unexpired window that claims to cover it. GS-1..GS-5/GS-7 are
  // untouched by this block (ADR-0058 Decision 2); it fires only when `matched` is
  // the live-plugin rule set above.
  //
  // `liveKernelPath` is hoisted to outer scope (rather than staying local to this try)
  // so the refusal message below can name the reason correctly: a kernel path is
  // genuinely unliftable and must say so with no route at all, while a non-kernel
  // live-plugin path that simply has no window open right now still has a real route
  // -- prepare/install one. No control-flow change from the prior version: the same
  // `isNeverLiftableKernelPath` call, gating the same window lookup, in the same order.
  let liveKernelPath = false;
  if (matched === LIVE_PLUGIN_RULE) {
    try {
      liveKernelPath = isNeverLiftableKernelPath(filePath, { rootDir: projectDir, livePluginRoot: matchedLivePluginRoot });
      if (!liveKernelPath) {
        const { covered, window } = windowCoversRule({ rootDir: projectDir, ruleId: "GS-6" });
        if (covered) {
          process.stderr.write(
            `[pipeline-guard-maintenance-window] GS-6 lifted: expires ${new Date(window.expiresAtMs).toISOString()}, reason: ${window.reason}\n`,
          );
          process.exit(0);
        }
      }
    } catch { /* an unusable window is not a lift; the refusal below still stands */ }
  }

  // ADR-0059 Decision 3, and the corrected follow-up decision on this guard specifically
  // (2026-08-07): GS-1..GS-5/GS-7 get the SAME lift shape every other HGO-routed guard
  // already has -- always attempt to consume first (harmless: it only ever succeeds
  // against a genuinely armed, matching capability), and on failure offer the
  // MODE-APPROPRIATE next step, mirroring guard-testpath.mjs's own denial-message shape.
  // Never GS-6: that rule keeps its own separate GMW mechanism above, untouched.
  let overrideGuidance = "";
  if (matched !== LIVE_PLUGIN_RULE) {
    let approvalMode = "signature";
    try { approvalMode = readPushApprovalMode(projectDir)?.mode ?? "signature"; } catch { approvalMode = "signature"; }

    const denials = [{ guard: "guard-gate-strength.mjs", reason: `${matched.id}: ${matched.reason}` }];
    let consumed = { status: "absent" };
    try {
      consumed = consumeHumanGuardOverride({ rootDir: projectDir, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
    } catch {
      consumed = { status: "absent" }; // an unusable capability is not an authorization
    }
    if (consumed.status === "consumed") {
      try {
        await appendOverrideConsumedLedgerEvent({ rootDir: projectDir, pluginRoot: PLUGIN_ROOT, requestSha256: consumed.requestSha256 });
      } catch { /* fail-open (§8.1 narrowing): never changes this already-decided consumption */ }
      process.stderr.write(
        `[pipeline-human-override] guard-gate-strength ${matched.id}: exact one-time capability consumed; plan=${consumed.planSha256}.\n`,
      );
      process.exit(0);
    }

    if (consumed.status === "absent" || consumed.status === "replan") {
      try {
        const planned = recordHumanGuardDenial({ rootDir: projectDir, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
        if (planned.status === "planned") {
          try {
            await appendOverrideDeniedLedgerEvent({
              rootDir: projectDir, pluginRoot: PLUGIN_ROOT, requestSha256: planned.requestSha256, authorizationChannel: approvalMode,
            });
          } catch { /* fail-open (§8.1 narrowing/informational): never changes this already-decided denial */ }
          const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
          // NVA-CF-BL19-COPYSAFEADOPT: every ceremony command line built through the
          // shared renderer instead of a hand-assembled `${JSON.stringify(...)}`
          // template. A human fill-in slot like "<plan-sha256>" passes through
          // placeholder() verbatim -- never shellWord()-quoted like a literal
          // value. script/projectDir are ALSO passed through placeholder() here,
          // pre-rendered with JSON.stringify(); request-sha256 is the one real
          // value that goes through ordinary shellWord() quoting. Mirrors
          // guard-testpath.mjs's own ceremonyCommand() exactly.
          const ceremonyCommand = (subcommand, ...extraArgv) =>
            boundedCopySafeCommand({
              executable: process.execPath,
              argv: [
                placeholder(JSON.stringify(script)), subcommand, "--repo", placeholder(JSON.stringify(projectDir)),
                "--request-sha256", planned.requestSha256, ...extraArgv,
              ],
            }).command;
          const continuation = approvalMode === "chat"
            ? [
              `Then (the human confirms in-session; this is attribution, not proof):`,
              ceremonyCommand(
                "prepare-authorization", "--plan-sha256", placeholder("<plan-sha256-from-plan>"), "--reason", placeholder('"<human-reason>"'),
              ),
              ceremonyCommand(
                "authorize", "--plan-sha256", placeholder("<plan-sha256>"), "--selection-sha256", placeholder("<selection-sha256>"),
                "--reason", placeholder('"<human-reason>"'), "--reason-sha256", placeholder("<reason-sha256>"), "--activate",
              ),
            ].join("\n")
            : [
              `Then, in this session (pure digest computation against data already in the ` +
                `repository -- neither step needs the external key, ADR-0059 Decision 1):`,
              ceremonyCommand(
                "prepare-authorization", "--plan-sha256", placeholder("<plan-sha256-from-plan>"), "--reason", placeholder('"<fixed HGO_SIGNATURE_REASON text>"'),
              ),
              ceremonyCommand("emit-signature-digest", "--plan-sha256", placeholder("<plan-sha256>")),
              `Then, outside this session (only the signature itself needs the external Ed25519 ` +
                `key; presence of a valid, correctly-bound signature IS the authorization -- ` +
                `there is no in-session activate step for this mode):`,
              ceremonyCommand(
                "authorize-by-signature", "--plan-sha256", placeholder("<plan-sha256>"), "--proof", placeholder("<external-proof.json>"),
              ),
            ].join("\n");
          overrideGuidance = [
            "",
            "Human override available for this exact edit (one use; audited; the human confirms):",
            ceremonyCommand("plan"),
            continuation,
          ].join("\n");
        } else {
          // ADR-0059 Decision 4: a denial with no route says so, with a bounded typed
          // reason, rather than looking identical to a rule that has no override at all
          // (which for this guard is a real, adjacent case -- GS-6, one branch below).
          overrideGuidance = ["", humanGuardRouteUnavailableReason("edit", { planned })].join("\n");
        }
      } catch (error) {
        overrideGuidance = ["", humanGuardRouteUnavailableReason("edit", { error })].join("\n");
      }
    }
  }

  // GS-6 non-kernel: name the signed Guard Maintenance Window and the exact prepare/install
  // commands (ADR-0059 Decision 4: every denial reports its next step) -- never a hand-editing
  // hint. Built only for that one branch; GS-6 kernel gets none at all, and GS-1..GS-5/GS-7 keep
  // their own `overrideGuidance` (HGO) computed above.
  let gmwGuidance = "";
  if (matched === LIVE_PLUGIN_RULE && !liveKernelPath) {
    const gmwScript = join(PLUGIN_ROOT, "scripts", "guard-maintenance-window.mjs");
    gmwGuidance = [
      "",
      "Guard Maintenance Window available (ADR-0058; externally signed, scoped to GS-6, time-boxed; no in-session activation step -- presence of the installed, verified record IS the window):",
      `${process.execPath} ${JSON.stringify(gmwScript)} prepare --repo-root ${JSON.stringify(projectDir)} --scope GS-6 --ttl-seconds <n> --reason "<reason>"`,
      "Then, outside this session, sign the prepared request's digest and hand back the proof:",
      `${process.execPath} ${JSON.stringify(gmwScript)} install --repo-root ${JSON.stringify(projectDir)} --request <request.json> --proof <external-proof.json>`,
    ].join("\n");
  }

  process.stderr.write([
    `BLOCKED (guard-gate-strength, plugin pipeline-core): ${matched.reason}`,
    `Rule ID: ${matched.id}`,
    `File: ${filePath}`,
    "Why: an agent that can weaken the gate that authorizes its own actions has no gate. " +
      "This file decides a gate's strength, so it is not agent-writable" +
      (matched.id === "GS-6"
        ? (liveKernelPath
          ? " -- this is one of the hardcoded NEVER_LIFTABLE_KERNEL_PATHS (ADR-0058 point 3): " +
            "the code that verifies windows and the guards that enforce this one, so a window " +
            "covering it would let the first edit disable its own expiry check or the guard " +
            "itself. It is refused before any Guard Maintenance Window lookup even runs, " +
            "unconditionally -- no window, however scoped, freshly signed or otherwise valid, " +
            "can ever cover it, and no human-guard-override capability is consulted for GS-6 " +
            "either. There is no route to lift this refusal; the file stays refused for the " +
            "remainder of this session and every session after it."
          : " -- there is deliberately no in-session override at all for this rule, because an " +
            "in-session override for 'may I disarm the gate that is enforcing right now' is the " +
            "same hole with an extra step. The sanctioned route is a signed Guard Maintenance " +
            "Window (ADR-0058) -- see below for the exact commands.")
        : " in-session by default -- a human-authorized override (chat- or signature-mode, " +
          "matching whatever gates.push_approval is actually committed) can admit one exact, " +
          "audited edit, exactly like every other guard this override family already covers " +
          "(ADR-0059) -- see below."),
    matched.id === "GS-6" ? gmwGuidance : overrideGuidance,
  ].join("\n") + "\n");
  process.exit(2);
}
