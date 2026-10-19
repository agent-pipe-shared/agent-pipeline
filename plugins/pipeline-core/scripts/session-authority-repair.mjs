#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// session-authority-repair.mjs <inspect|heal|move-aside> --root <root> [--no-goldfish-running --reason "<why>"]
//
// D52 (2), PF-55: the general repair every SDC-AUTHORITY-* refusal names. None of the verbs needs a bound
// session, so each runs from the agent's shell and from the PO's terminal alike.
//
//   inspect     Read-only. Per registry producer: whether its live namespace drifted from its stored
//               baseline, whether its records read at all, and how many bound members are in flight. Per
//               native item reservation: its slice, queue state and whether it still blocks. Ends with the
//               exact next command for every finding (`next`), or none when nothing blocks.
//               Also reports the scratch binding of the session it runs in (D54): the session id is
//               PIPELINE_SCRATCH_SESSION_ID, else the session's own CLAUDE_CODE_SESSION_ID; a terminal has none.
//   heal        Binds or re-anchors that scratch binding (D54), then enters the registry boundary once. That
//               heals every drifted producer with no armed or running bound member and migrates a catalogue
//               another plugin version wrote (D51 (1), PF-52), then inspects again.
//   move-aside  Last resort, when a producer's records no longer read or a namespace changed under an in-flight
//               member whose Goldfish no longer runs: the whole registry moves to session-authority-abandoned
//               (retained, never deleted) and the next governed dispatch initializes it fresh (D44). Requires
//               --no-goldfish-running (the caller asserts that no Goldfish or other authority operation runs)
//               and --reason.
//
// Prints one JSON result. Exit 0: inspected | healed | moved-aside. Exit 2: refused (typed SAR-* code).
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../lib/worktree-lifecycle.mjs";
import { createSessionAuthorityParticipantPorts } from "../lib/session-authority-observers.mjs";
import { inspectSessionAuthorityRegistryRead, moveSessionAuthorityRegistryAside, withSessionAuthorityBoundary } from "../lib/session-authority-registry.mjs";
import { readOrchestratorCommitIntegratedSlices, resolveGovernedItemQueue, retryWhileSessionAuthorityLockHeld } from "../lib/native-goldfish-host-state.mjs";
import { bindScratchDescriptor, inspectScratchBinding, resolveRunnerHostPid } from "../lib/session-cleanup-recovery.mjs";

const SCHEMA = "pipeline.session-authority-repair.v1";
const SELF = fileURLToPath(import.meta.url);
const SLICE_QUEUE = fileURLToPath(new URL("./slice-queue.mjs", import.meta.url));
const IN_FLIGHT = new Set(["armed", "running"]);

const sorted = (value) => Array.isArray(value) ? value.map(sorted)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])])) : value;
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const short = (error) => String(error?.reason ?? error?.message ?? error).replace(/[\u0000-\u001f\u007f]+/gu, " ").slice(0, 240);

/** The repair command for a root, as every refusal names it. */
export function sessionAuthorityRepairCommand(root, verb = "inspect") {
  return `node ${SELF} ${verb} --root ${root}`;
}

function parse(argv) {
  const [verb, ...rest] = argv;
  if (!["inspect", "heal", "move-aside"].includes(verb)) return { error: "usage: session-authority-repair.mjs <inspect|heal|move-aside> --root <root>" };
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index]?.startsWith("--") ? rest[index].slice(2) : null;
    if (name === "no-goldfish-running" && verb === "move-aside") { if (flags[name]) return { error: "--no-goldfish-running given twice" }; flags[name] = true; continue; }
    if (!["root", ...(verb === "move-aside" ? ["reason"] : [])].includes(name)) return { error: `unknown argument ${String(rest[index]).slice(0, 40)}` };
    const value = rest[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--") || Object.hasOwn(flags, name)) return { error: `--${name} needs one value` };
    flags[name] = value; index += 1;
  }
  if (!flags.root) return { error: "--root <root> is required" };
  if (verb === "move-aside" && (flags["no-goldfish-running"] !== true || typeof flags.reason !== "string" || !flags.reason.trim() || flags.reason.length > 500 || /[\u0000-\u001f\u007f]/u.test(flags.reason)))
    return { error: "move-aside needs --no-goldfish-running (you assert that no Goldfish or other authority operation runs) and --reason \"<one line>\"" };
  return { verb, flags };
}

function producerReport(repository) {
  const base = join(repository.commonDir, "agent-pipeline", "session-authority");
  if (!existsSync(join(base, "catalogue.json"))) return { status: "absent", producers: [] };
  const readRef = (ref) => JSON.parse(readFileSync(join(repository.commonDir, String(ref.path).replace(/^\.git\//u, "")), "utf8"));
  const producers = [];
  let ports;
  try { ports = createSessionAuthorityParticipantPorts({ repository }); }
  catch (error) { return { status: "unreadable", reason: short(error), producers: [] }; }
  for (const { producerId, port } of ports) {
    const file = join(base, "producers", `${producerId}.json`);
    if (!existsSync(file)) { producers.push({ producerId, status: "missing" }); continue; }
    let record, members, releases;
    try {
      record = JSON.parse(readFileSync(file, "utf8"));
      members = record.members.map((entry) => readRef(entry.memberRef));
      releases = members.filter((member) => member.releaseRef).map((member) => readRef(member.releaseRef));
    } catch (error) { producers.push({ producerId, status: "unreadable", reason: short(error) }); continue; }
    const inFlight = members.filter((member) => member.association?.state === "bound" && IN_FLIGHT.has(member.phase)).length;
    let live;
    try { live = port.reconcile({ producerRecord: Object.freeze(record), memberRecords: Object.freeze(members), releaseRecords: Object.freeze(releases) }); }
    catch (error) { producers.push({ producerId, status: "reconcile-refused", code: error?.code ?? null, reason: short(error), inFlight }); continue; }
    const byId = (rows) => new Map((rows ?? []).map((row) => [row.namespaceId, row]));
    const stored = byId(record.baseline), current = byId(live);
    const drifted = [...new Set([...stored.keys(), ...current.keys()])].filter((id) => !same(stored.get(id), current.get(id))).sort();
    producers.push({ producerId, status: drifted.length ? "drifted" : "ok", drifted, inFlight });
  }
  return { status: "present", producers };
}

function reservationReport(repository, root) {
  const dir = join(repository.commonDir, "agent-pipeline", "run", "native-goldfish-host-commit");
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).sort();
  const governed = resolveGovernedItemQueue({ root });
  const slices = governed.status === "required" ? governed.normalized.slices : [];
  const integrated = new Set(slices.length ? readOrchestratorCommitIntegratedSlices({ root: repository.primaryRoot, candidateCommit: repository.candidate.commit, slices }) : []);
  const rows = [];
  for (const name of names.filter((entry) => entry.startsWith("pending-"))) {
    let bytes, state;
    try { bytes = readFileSync(join(dir, name)); state = JSON.parse(bytes); } catch (error) { rows.push({ pending: name, status: "unreadable", reason: short(error) }); continue; }
    const sha = createHash("sha256").update(bytes).digest("hex");
    const sliceId = state?.delivery?.sliceId ?? null;
    const queueState = slices.find((row) => row.id === sliceId)?.state ?? null;
    const nativeIntegrated = names.includes(`authority-integration-${sha}.json`);
    const byCommit = sliceId !== null && integrated.has(sliceId);
    rows.push({ pending: name, sliceId, itemId: state?.delivery?.itemId ?? null, dispatchId: state?.binding?.dispatchId ?? null, queueState,
      settled: nativeIntegrated ? "integrated" : byCommit ? "integrated-by-commit" : queueState === "cancelled" ? "cancelled" : null });
  }
  return rows;
}

const scratchSessionId = (env) => [env.PIPELINE_SCRATCH_SESSION_ID, env.CLAUDE_CODE_SESSION_ID]
  .find((value) => typeof value === "string" && value !== "") ?? null;
const SCRATCH_REPAIRABLE = new Set(["unbound", "dead-anchor", "directory-missing"]);

// D54: the same binding the bootstrap makes. Without scratch/ there is nothing to bind, and creating it could
// dirty a consumer tree whose .gitignore does not cover it, so both verbs skip, as the bootstrap does.
function scratchReport(root, scratch) {
  const sessionId = scratchSessionId(scratch.env);
  if (sessionId === null) return { status: "no-session-identity" };
  if (!existsSync(join(root, "scratch"))) return { status: "skipped-no-scratch-directory" };
  try { return inspectScratchBinding({ rootDir: root, sessionId, deps: scratch.deps }); }
  catch (error) { return { status: "unavailable", code: error?.code ?? null }; }
}

function bindScratch(root, scratch) {
  const sessionId = scratchSessionId(scratch.env);
  if (sessionId === null) return "no-session-identity";
  if (!existsSync(join(root, "scratch"))) return "skipped-no-scratch-directory";
  try { return bindScratchDescriptor({ rootDir: root, sessionId, deps: { pidFn: () => resolveRunnerHostPid(), ...scratch.deps } }).status; }
  catch (error) { return `unavailable:${error?.code ?? "unknown"}`; }
}

// `afterHeal`: heal just ran, so whatever it did not clear needs the next narrower command, not heal again.
function inspect(repository, root, { afterHeal = false, scratch } = {}) {
  // The strict read is what every boundary operation performs; the per-producer report explains it.
  const registry = { ...producerReport(repository), read: inspectSessionAuthorityRegistryRead({ repository }) };
  const reservations = reservationReport(repository, root);
  const scratchBinding = scratchReport(root, scratch);
  const next = [];
  const open = reservations.filter((row) => row.sliceId && row.settled === null);
  const cancelCommand = (sliceId) => `node ${SLICE_QUEUE} cancel ${sliceId} --started --reason "<why>"`;
  for (const row of open) next.push({ why: `slice ${row.sliceId} still holds its item reservation; if it delivered, commit its work with the trailer "Dispatch: ${row.sliceId} (goldfish)"; if its Goldfish no longer runs, cancel it`, command: cancelCommand(row.sliceId) });
  const drifted = registry.producers.filter((row) => row.status === "drifted");
  const broken = registry.producers.filter((row) => ["unreadable", "reconcile-refused", "missing"].includes(row.status));
  // A catalogue another plugin version wrote is migrated on the next boundary entry (PF-52), which heal performs.
  const migrates = !afterHeal && registry.read.status === "refused" && registry.read.reason === "catalogue-source-closure";
  const healReasons = [
    ...(!afterHeal && drifted.some((row) => row.inFlight === 0) ? [`drifted with nothing in flight: ${drifted.filter((row) => row.inFlight === 0).map((row) => `${row.producerId} (${row.drifted.join(", ")})`).join("; ")}`] : []),
    ...(migrates ? ["the catalogue was written by another plugin version and is migrated on heal"] : []),
    ...(!afterHeal && SCRATCH_REPAIRABLE.has(scratchBinding.status) ? [`this session's scratch binding is ${scratchBinding.status}`] : []),
  ];
  if (healReasons.length) next.push({ why: healReasons.join("; "), command: sessionAuthorityRepairCommand(root, "heal") });
  const stuck = [...drifted.filter((row) => afterHeal || row.inFlight > 0), ...broken];
  // A strict-read refusal that heal does not explain has no narrower repair.
  const healable = (reason) => !afterHeal && (reason === "catalogue-source-closure" || drifted.some((row) => row.inFlight === 0 && reason === `${row.producerId}:namespace-drift`));
  const unexplained = registry.read.status === "refused" && !healable(registry.read.reason);
  if (registry.status === "unreadable" || stuck.length || unexplained) next.push({ why: `${[...stuck.map((row) => `${row.producerId} ${row.status}${row.drifted?.length ? ` (${row.drifted.join(", ")})` : ""}${row.reason ? `: ${row.reason}` : ""}`), ...(unexplained ? [`the registry read refuses: ${registry.read.code} ${registry.read.reason}`] : [])].join("; ") || `the registry does not read: ${registry.reason}`}. Last resort once no Goldfish runs: the registry is retained aside and starts fresh`, command: `${sessionAuthorityRepairCommand(root, "move-aside")} --no-goldfish-running --reason "<why>"` });
  return { registry, reservations, scratchBinding, next };
}

function markers(repository) {
  const dir = join(repository.commonDir, "agent-pipeline", "session-authority-abandoned");
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

// `env` carries the session identity for the scratch binding; only the command line passes the process's own.
export function runSessionAuthorityRepair(argv, out = (text) => process.stdout.write(text), { env = {}, scratchDeps = {} } = {}) {
  const emit = (value, code) => { out(`${JSON.stringify({ schema: SCHEMA, ...value })}\n`); return code; };
  const scratch = { env, deps: scratchDeps };
  const parsed = parse(argv);
  if (parsed.error) return emit({ status: "refused", code: "SAR-ARGS", reason: parsed.error }, 2);
  let root, repository;
  try { root = realpathSync(resolve(parsed.flags.root)); if (!statSync(root).isDirectory()) throw new Error("not a directory"); repository = inspectSignedDescriptorCustodyRepository(root); }
  catch (error) { return emit({ status: "refused", code: "SAR-ROOT", reason: `--root is not a Pipeline repository: ${short(error)}` }, 2); }
  if (parsed.verb === "inspect") return emit({ status: "inspected", ...inspect(repository, root, { scratch }) }, 0);
  const before = new Set(markers(repository));
  // Independent of the registry, so a registry refusal below never leaves it unrepaired.
  const scratchBound = parsed.verb === "heal" ? bindScratch(root, scratch) : null;
  try {
    if (parsed.verb === "heal") retryWhileSessionAuthorityLockHeld((entered) => withSessionAuthorityBoundary({ repository }, () => { entered.value = true; return null; }));
    else retryWhileSessionAuthorityLockHeld((entered) => { const moved = moveSessionAuthorityRegistryAside({ repository, reason: parsed.flags.reason.trim(), onEntered: () => { entered.value = true; } }); return moved; });
  } catch (error) {
    return emit({ status: "refused", code: error?.code === "SDC-LOCK-HELD" ? "SAR-LOCK-HELD" : "SAR-UNAVAILABLE", reason: error?.code === "SDC-LOCK-HELD" ? "another Pipeline operation holds the registry lock; retry once it finished" : short(error), ...(scratchBound === null ? {} : { scratchBound }) }, 2);
  }
  const retained = markers(repository).filter((name) => !before.has(name));
  return emit({ status: parsed.verb === "heal" ? "healed" : "moved-aside", retained, ...(scratchBound === null ? {} : { scratchBound }), ...inspect(repository, root, { afterHeal: parsed.verb === "heal", scratch }) }, 0);
}

if (isDirectInvocation(import.meta.url)) process.exitCode = runSessionAuthorityRepair(process.argv.slice(2), undefined, { env: process.env });
