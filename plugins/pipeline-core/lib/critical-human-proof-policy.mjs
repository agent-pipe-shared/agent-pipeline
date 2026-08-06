// SPDX-License-Identifier: SUL-1.0
/**
 * The project's critical-human-proof policy (ADR-0055).
 *
 * Extracted so the State writer and the push guard read ONE implementation. They
 * previously could not: the reader lived inside `scripts/pipeline-state.mjs`, so the
 * guard had no way to see the policy at all and simply assumed it.
 *
 * `.v1` — `requiredKinds` only. Deleting a kind from that list does not relax the
 * gate; the writer action REJECTS instead, so nobody can quietly disarm the proof by
 * trimming a list. That stays true.
 *
 * `.v2` — adds the one thing `.v1` had no answer for: an operator who genuinely wants
 * the cryptographic proof off. A waiver must name its kind AND carry a reason, so
 * standing the gate down is a committed, diffable, attributable act. The waived kind
 * stays in `requiredKinds`: the action remains gated, only the private-key proof is
 * no longer demanded.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { CRITICAL_ACTION_KINDS } from "./critical-action-approval-request.mjs";
import { PUSH_APPROVAL_MODES } from "./runner-profiles-v3.mjs";
import { parseYaml } from "./yaml-lite.mjs";

export const USER_SOURCE_PATH = "pipeline.user.yaml";
export const DEFAULT_PUSH_APPROVAL_MODE = "signature";

/**
 * Does the working tree's copy of the setting match the one that is committed?
 *
 * WHY THIS EXISTS — the T2 Critic's C1 blocker on `62de980`. The guard family defends
 * this file through two lanes, and the write lane (GS-1) is sound. The shell lane is not:
 * it refuses a command whose *text* contains the literal filename, so any command that
 * assembles the name at runtime walks straight past it, and no amount of better string
 * matching fixes that — an interpreter given inline code, or a script the agent wrote a
 * moment earlier, is opaque to a guard that can only read the command line.
 *
 * That mattered far more than "one config file is writable". A single such write set
 * `gates.push_approval: chat`, which both admitted the in-session guard-testpath override
 * AND, through `criticalProofWaiverFor` below, stood down the detached Ed25519 proof for
 * `push`. The agent could clear its own push gate.
 *
 * So the decision no longer rests on the working tree alone. A copy that differs from
 * `HEAD` is treated as unverified and yields the strongest mode, never the weakest. The
 * asymmetry is the point: an in-session edit can only ever STRENGTHEN the gate, so the
 * attack produces the opposite of what it wants, whichever route wrote the file.
 *
 * Be precise about the residual, because overselling this is how the previous claim got
 * written: an agent that writes AND commits the file makes the two agree again. What that
 * costs it is invisibility — the change becomes a diffable commit inside the candidate the
 * push request binds to, in front of Verify, the Critic and the PO. This lowers an
 * unobservable in-session flip to a recorded one; it does not make the file unreachable.
 *
 * Fails closed on everything: no Git, no commit, an unreadable object, a non-zero exit or
 * a throw all mean "not verified".
 *
 * Consequence for the operator, stated because it changes a workflow: setting `chat` now
 * requires committing the change. An uncommitted edit reads as `signature`.
 */
function committedUnchanged(root, raw, spawn) {
  try {
    // The path in a `<rev>:<path>` spec resolves against the REPOSITORY TOP LEVEL, not
    // against `-C`. The first version of this function ignored that and asked for
    // `HEAD:pipeline.user.yaml` while reading `<root>/pipeline.user.yaml`, which is only
    // the same file when root IS the top level. The T3 Critic found it (K1): in a checkout
    // holding more than one project root, an agent could make `<subdir>/pipeline.user.yaml`
    // byte-equal to the ROOT's committed copy and have it accepted as "unchanged" though it
    // was never committed at that path -- reopening exactly the C1 escalation. The mirror
    // case was just as wrong: a sub-project that DID commit its own copy could never reach
    // `chat`, because Git looked for the blob at the top level.
    const top = spawn("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    if (top.error || top.status !== 0 || typeof top.stdout !== "string") return false;
    const repoRoot = top.stdout.trim();
    if (repoRoot === "") return false;
    // Ask for the blob at the path this file actually occupies, expressed from the top
    // level and with POSIX separators, which is the only form Git accepts in a rev spec.
    //
    // Both operands must live in the SAME namespace. `--show-toplevel` is physical: Git
    // reaches it through `getcwd()`, so symlinks are already resolved. `resolve()` is purely
    // lexical and resolves none. Relating them directly -- the first version of this line --
    // makes `relative()` emit a `..` path for any root reached through a symlink, so a
    // correctly committed file reads as uncommitted. The T4 Critic found it. The sibling
    // modules had this right already: project-authority.mjs (`realRoot`) and
    // guard-lifecycle-ready.mjs (`isProjectWritePath`) both realpath before comparing.
    //
    // Only the DIRECTORY is resolved. A symlinked `pipeline.user.yaml` must not be followed,
    // and is not: readPushApprovalMode rejects it by `lstatSync` long before this runs.
    const relPath = relative(repoRoot, join(realpathSync(resolve(root)), USER_SOURCE_PATH));
    if (relPath === "" || relPath.startsWith("..") || isAbsolute(relPath)) return false;
    const result = spawn("git", ["-C", root, "show", `HEAD:${relPath.split(sep).join("/")}`], {
      encoding: "buffer",
      maxBuffer: 1024 * 1024,
    });
    if (result.error || result.status !== 0 || !result.stdout) return false;
    return Buffer.compare(Buffer.from(result.stdout), Buffer.from(raw, "utf8")) === 0;
  } catch {
    return false;
  }
}

/**
 * Read `gates.push_approval` from the project's own source of truth (ADR-0056).
 *
 * This is read directly rather than through a compiled projection because `gates` is
 * not one of the V3 compiler's owned keys — the manifest's gate block is
 * hand-maintained, so projecting a single setting would mean extending the frozen
 * owned-keys contract for it. Absent file, absent key, or anything unparseable all
 * mean the fail-closed default: a gate whose configuration cannot be read is at its
 * strongest setting, never its weakest.
 */
export function readPushApprovalMode(dir, { spawn = spawnSync } = {}) {
  const path = join(resolve(dir), USER_SOURCE_PATH);
  if (!existsSync(path)) return { mode: DEFAULT_PUSH_APPROVAL_MODE, source: "default" };
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) return { mode: DEFAULT_PUSH_APPROVAL_MODE, source: "unsafe" };
    const raw = readFileSync(path, "utf8");
    if (!committedUnchanged(resolve(dir), raw, spawn)) {
      return { mode: DEFAULT_PUSH_APPROVAL_MODE, source: "uncommitted" };
    }
    const value = parseYaml(raw);
    const configured = value?.gates?.push_approval;
    if (configured === undefined) return { mode: DEFAULT_PUSH_APPROVAL_MODE, source: "default" };
    return PUSH_APPROVAL_MODES.includes(configured)
      ? { mode: configured, source: USER_SOURCE_PATH }
      : { mode: DEFAULT_PUSH_APPROVAL_MODE, source: "invalid" };
  } catch {
    return { mode: DEFAULT_PUSH_APPROVAL_MODE, source: "unreadable" };
  }
}

export const CRITICAL_HUMAN_PROOF_POLICY_PATH = "project/critical-human-proof.json";
export const CRITICAL_HUMAN_PROOF_POLICY_V1 = "pipeline.critical-human-proof-policy.v1";
export const CRITICAL_HUMAN_PROOF_POLICY_V2 = "pipeline.critical-human-proof-policy.v2";
const MAX_POLICY_BYTES = 32_768;
const MIN_REASON_CHARS = 8;
const MAX_REASON_CHARS = 500;

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * @returns {{ok: true, requiredKinds: Set<string>, waivers: Map<string, string>}
 *          | {ok: false, code: string}}
 */
export function readCriticalHumanProofPolicy(dir) {
  const path = resolve(dir, CRITICAL_HUMAN_PROOF_POLICY_PATH);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_POLICY_BYTES) {
      return { ok: false, code: "CRITICAL-PROOF-POLICY-UNSAFE" };
    }
    const value = JSON.parse(readFileSync(path, "utf8"));
    const v2 = value?.schema === CRITICAL_HUMAN_PROOF_POLICY_V2;
    const shapeOk = v2
      ? exactKeys(value, ["schema", "requiredKinds", "waivedKinds"])
      : exactKeys(value, ["schema", "requiredKinds"]) && value?.schema === CRITICAL_HUMAN_PROOF_POLICY_V1;
    if (!shapeOk
      || !Array.isArray(value.requiredKinds)
      || value.requiredKinds.length === 0
      || new Set(value.requiredKinds).size !== value.requiredKinds.length
      || value.requiredKinds.some((kind) => !CRITICAL_ACTION_KINDS.includes(kind))) {
      return { ok: false, code: "CRITICAL-PROOF-POLICY-INVALID" };
    }
    const waivers = new Map();
    if (v2) {
      if (!Array.isArray(value.waivedKinds)) return { ok: false, code: "CRITICAL-PROOF-POLICY-INVALID" };
      for (const entry of value.waivedKinds) {
        if (!exactKeys(entry, ["kind", "reason"])
          || !value.requiredKinds.includes(entry.kind)
          || typeof entry.reason !== "string"
          || entry.reason.trim().length < MIN_REASON_CHARS
          || entry.reason.length > MAX_REASON_CHARS
          || waivers.has(entry.kind)) {
          return { ok: false, code: "CRITICAL-PROOF-POLICY-WAIVER-INVALID" };
        }
        waivers.set(entry.kind, entry.reason.trim());
      }
    }
    return { ok: true, requiredKinds: new Set(value.requiredKinds), waivers };
  } catch (error) {
    // No policy file at all is the ordinary consumer case: nothing is required, and
    // nothing is waived either. Anything else is a policy we cannot read, which must
    // never read as "not required".
    return error?.code === "ENOENT"
      ? { ok: true, requiredKinds: new Set(), waivers: new Map() }
      : { ok: false, code: "CRITICAL-PROOF-POLICY-UNREADABLE" };
  }
}

/**
 * Has the project EXPLICITLY stood the private-key proof down for `kind`?
 *
 * Only an explicit `.v2` waiver answers yes. The absence of a policy file is not a
 * waiver, an unreadable policy is not a waiver, and a kind simply missing from
 * `requiredKinds` is not a waiver either — a caller that gates on
 * `gates.push.approval: required` keeps gating unless someone deliberately wrote the
 * waiver down. Anything else would turn "no policy configured" into "gate off".
 *
 * @returns {{waived: false, code: string|null} | {waived: true, code: null, waiver: {kind: string, reason: string}}}
 */
export function criticalProofWaiverFor(dir, kind) {
  const policy = readCriticalHumanProofPolicy(dir);
  if (!policy.ok) return { waived: false, code: policy.code };
  const reason = policy.waivers.get(kind);
  // For `push`, pipeline.user.yaml is the operator-facing control and wins (ADR-0056).
  // The two must not disagree: a policy-file waiver alongside `signature` in the source
  // is an ambiguous configuration, and an ambiguous gate configuration fails closed.
  if (kind === "push") {
    const configured = readPushApprovalMode(dir);
    if (configured.mode === "chat") {
      return {
        waived: true,
        code: null,
        waiver: { kind, reason: reason ?? `gates.push_approval: chat (${configured.source})`, mode: "chat", source: configured.source },
      };
    }
    // Fail closed unless the source genuinely has NO opinion. `default` is the only such
    // value -- no file at all, or a file without the key. Every other source (`unsafe`,
    // `invalid`, `unreadable`, `uncommitted`) means "could not be established", which is
    // the ambiguous configuration the paragraph above promises to refuse.
    //
    // This branch used to test `=== USER_SOURCE_PATH`, i.e. it enumerated the ONE source
    // that triggers a conflict. Adding `uncommitted` for C1 therefore opened a hole nobody
    // wrote on purpose: any state where the mode could not be read let a `.v2` push waiver
    // through, and `pipeline-state.mjs approve-push` then stopped demanding the detached
    // Ed25519 proof. Found by the T4 Critic. Enumerating the safe value instead of the
    // unsafe ones is what makes a future source value fail closed by default.
    if (reason !== undefined && configured.source !== "default") {
      return { waived: false, code: "CRITICAL-PROOF-MODE-CONFLICT" };
    }
  }
  return reason === undefined
    ? { waived: false, code: null }
    : { waived: true, code: null, waiver: { kind, reason } };
}
