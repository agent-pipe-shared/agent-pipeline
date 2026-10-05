# Advisor consult — 2026-10-03 findings-round amendment (fallback route)

Route: recorded self-dispatch fallback, `pipeline-core:consult-advisor` (Claude,
native Windows, after operator hotfix 3). The formal producer reached its typed
no-child outcome (`unavailable`, `native-initial-answer-provenance-unavailable`).
Read scope: spec §21, PRD §14, the findings register, and AC-26…AC-31 at
candidate `ec7183dd`. Spec §§1–20, AC-1…AC-25 and traceability were not read.

**Verdict:** `needs-revision`.

1. **blocking** — Spec §21.4 has no contract or acceptance case for K3-10,
   K3-11, K3-12 or K3-13. Only operator hotfixes cover them, so a candidate
   stamped from source breaks the Claude Advisor again. *Disposition:* add R4
   contract items and cases for all four in the first R4 slice next to K3-9.
2. **blocking** — The scope rule contradicts itself.
   - PRD §14 says "in full"; Spec §21 says "confirmed/partially only" with the
     range K1-1…K8-4, which omits K8-5 and K9.
   - Requirement rows sit in workstream headers although the literal rule
     excludes them. K5-1 is in neither.
   - Pending K7-7 and K2-6 sit inside workstreams.
   - K9 points to §21.5, which has no such content, so the K9-3 privacy-check
     gap has no owner.
   - The verification summary is stale.
   *Disposition:* give each workstream an explicit ID list, add a deferred list
   with reproduction steps (K7-8, K4-8, K2-6/K7-7 unless verified), refresh the
   summary and align the PRD wording.
3. **major** — These confirmed rows have no workstream: K1-8 (reopen loop), K4-7
   (intermediate PO confirmations), K4-9 (description-sensitive digest), K2-6b,
   K8-5. *Disposition:* K1-8 and K4-7 → R5 with a revision-loop case (R3-1
   inventory includes one revision); K4-9 → R3; K2-6b → R2; K8-5 → R6 with a
   pre-commit host-path check.
4. **major** — The R3 override match key is undefined: the canonical digest
   fields, the "governed target" per tool, the Pipeline-owned paths, and drift
   on tracked files. This touches security. *Disposition:* define each one and
   add R3-3 variants for Bash and for tracked files.
5. **major** — "PO asked exactly twice" is underdetermined: how many pushes on
   the happy path; whether key setup counts; the chat-mode checkpoint rule.
   *Disposition:* specify all three so R3-1 can be judged.
6. **major** — The `scratch/` read-only script lane (R1-4) could be built
   fail-open; "known writer" is undefined. *Disposition:* a fail-closed
   mechanism (static scan, sandbox or post-run tree diff) and a rewritten R1-4.
7. **major** — The self-dispatch fallback does not bind template digest → sent
   prompt → subagent id → result (K3-6), and nothing enforces read-only for a
   fallback Critic/Advisor. *Disposition:* a dispatch→result record, guard
   enforcement of read-only for role-labelled fallbacks, and negative cases.
8. **major** — Contracts without acceptance cases: K4-5, K6-2 (R3-2 assumes a
   pre-push hook), K3-1, K5-3, K1-6, K6-3, K7-2, K1-7. *Disposition:* add cases;
   run R3-2 from a fresh clone.
9. **major** — The R6 pre-commit refusal of unclassified docs needs a
   `governance/` write that draft blocks (K1-6). *Disposition:* admit
   classifier writes in design phases, or have writers self-classify; add a
   zero-override design-phase doc-commit case; clarify `docs/adr/`.
10. **major** — The PO redesign direction (course/driver) is not reflected; R1
    assumes the patch route. *Disposition:* record the patch-or-redesign
    decision in PRD §14 and Spec §21.
11. **major** — No end-to-end acceptance criterion with a host matrix.
    *Disposition:* AC-32 with the scenario, the hosts (Claude on Windows and
    POSIX, plus Codex and Antigravity OS), the pass conditions (zero overrides,
    zero recovery ceremonies, exactly two PO asks, push done) and per-host
    evidence.
12. **major** — The WSL UNC read admission does not name the credential roots
    inside the distro. *Disposition:* enumerate them and add a negative case.
13. **minor** — No integration owner for hooks and commit policy across
    R1/R3/R5/R6; hook provisioning must precede R3-2; the hotfix dependency and
    its removal point are not stated.
14. **minor** — Loose ends: the K7-3 split; the K7-8/K4-8 repro owners; the R3-5
    column bound; two open "or" choices; R2-5 does not cover
    `APB-DISPATCH-INVALID`; the K4-1 footer suspicion.
