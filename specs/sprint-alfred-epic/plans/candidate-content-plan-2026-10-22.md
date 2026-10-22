# Content plan to the 0.7.0 test candidate (2026-10-22)

Purpose: one clear order of work for everything content-related that is still open before the local test
candidate. Items already finished today are not listed as open. Engineering status only: no Critic review and no PO
acceptance is claimed anywhere below. The candidate is stamped only on the PO's call.

## 1. Landed in the tree today (committed, nothing left to do except Critic/PO)

Backlog grooming (9 duplicates merged and closed), decisions D85-D117, ratchets, scanMode (k4), required-evidence
gate scripts (k3), scratch rotation coverage (D116), settled-journal tests parked below, dispatch-record liveness
readback (k13, D110), dispatch recovery state (k18), host-boundary briefing obligation (k19), CR-03 reconciliation
(k14), restated test-briefs item (D111), case-completion registry rows and VCR01 re-pin (k12), signed-action
isolation matrix (k17), SDF001/SDR002 restated under QG-04 (k21), counted pin run 186/186 green on fbaec36bc.

## 2. Built, delivered as protected diffs for the operator sitting (apply order is fixed, see the sitting list)

k1 read policy D96/D105/D109 - k5 registry lock wait - k8 settled journal D113 - k6 append contract D103/D107 and
index deletion D100/D104 - k7 readiness flap D112 - k9 `git -C` read forms and compile-summary D114/D115 - k10
advisory degradation D117 - k11 D64 present-plan refusal and sanitized digest pair - k12 completion policy rows -
k13 one registration line - k15 pendingAsks print-once - k16 sed misparse and fail-open - k2/k3 onboarding author
identity, required-evidence registration - k23 four suites converted to the completion protocol. Held unprotected
commits are imported after their protected diff is applied (they are red before).

## 3. In flight right now (clones, hand-back pending)

| Slice | Content | Needs from the sitting |
|---|---|---|
| k9 (resumed) | `tail` admitted in the bounded git pipeline (PO tile) | extended protected diff |
| k15 (resumed) | `final.nextAction` as a reference (PO tile) | extended protected diff |
| k20 | D99 family grouping in the V3 policy (PO tile) | maybe protected diff |
| k22 | skip non-matching override capabilities before drift audit (PO tile) | protected diff |
| k24 | why dispatch-record log entries are skipped, fold appends | maybe |
| k25 | EL-01 tripwire fail-open conditions | protected diff |
| k27 | zero-interaction revision pin; phase telemetry (wall, tool, human wait) | none expected |
| k28 | V-10 route recording for Critic and other roles, Workflow path, CAS failure | protected diff |
| k29 | approval-bound package across a device switch | maybe |

## 4. Still to assign after the wave returns (content, agent-doable)

1. Follow-ups the agents named: perl/ruby `-i.bak` in the parsed lane; chain-aware parse for `git ... && sed -i`
   (design); synchronous throw in a transition retains the lock (K5 area); per-boundary memo of the repository
   inspection that makes every MFHS case take 45-100 s (changes drift-detection semantics: needs a PO call);
   guard-side second-writer refusal while an owner is live (deferred in the liveness pin).
2. `critic-skip` / evidence items that the rehearsal shows red after the stack (re-measured at the end).
3. Per-row remeasure leftovers after the final counted pin run: only counts, no content.

## 5. Not buildable here, tracked for the PO or a native host

Host executor for the WSL required Advisor (native host), `bounded-reader-terminal-binding` (blocked on its
dependency), Windows/macOS runs of the read-policy and the Windows ancestor pin (native hosts), PO-deferred
`lifecycle-read-scope` / `declared-system-skill` (post-0.7.0), `elephant-main-context`, `forensics-and-audit`,
`greenfield-comparisons` (post-0.7.0).

## 6. Order of the remaining work

1. Collect the in-flight clones (section 3); fix their open points; no new content scope after that unless the
   remeasure shows a gap.
2. Rebuild the rehearsal stack in a fresh clone with every diff; fix stacking issues; raise the five line ratchets
   with reason, owner and expiry 2026-11-30 in the same pass.
3. Sitting at 18:00 (PO at the terminal): protected diffs in the fixed order, then the registration in two commits
   (suites first, inventory with the re-baselined `sourceBaseline` second).
4. Import the held unprotected commits; fresh-clone Verify as a measurement only (one heavy suite at a time);
   counted pin run again at the final head.
5. Independent Critic reads on the security-class and kernel bundles (read policy, `git -C` pipeline, sed fix,
   override isolation, registry/journal, tripwire, route recording); fix their findings.
6. Final delivery remeasure with the tool and its evidence commit; PO list updated; native-host runs and PO
   acceptance stay outside the agent's reach.
