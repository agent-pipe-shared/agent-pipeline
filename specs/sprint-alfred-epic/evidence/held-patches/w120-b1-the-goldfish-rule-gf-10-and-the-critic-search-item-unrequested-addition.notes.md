# w120 — Goldfish rule GF-10 and the Critic search item "unrequested addition" (candidate 19, B1)

Applies on the repository on its own (`git apply --check` exit 0); independent of w121. PO direction 2026-11-02: the logic of the Ponytail project's lean-change prompt, in our own definition and our own words, never its wording.

## What it adds

- `roles/goldfish.md`: new rule **GF-10 (MUST) — The smallest complete change**, between the verification duty (GF-08) and the completion report (GF-09). It asks for a reach list before the first edit (callers, tests, fixtures, configuration, exports, what the change could break), the smallest change that fully delivers the briefed outcome (reuse, keep the structure, prefer removal), no unrequested abstraction, wrapper, option, dependency or "for later" code, a defect fixed once at its shared cause, moved code keeping its validation and error handling, no shortening of trust-boundary validation, data-loss handling, security, accessibility or anything the briefing names, and the report naming what was left out on purpose and any risk. It states that it does not replace test-first (QG-04) and gives no licence to skip a briefed check.
- `roles/critic.md`: one item in the minimum search surface, "unrequested addition": a new export, option, wrapper, abstraction or dependency that no criterion, briefing line or caller needs; anchored on GF-10; the evidence is the addition together with the absence of any user, never taste or style; severity `minor`, `major` only when it widens an interface consumers read. The existing evidence gate (CR-05) is unchanged, so a candidate without evidence is still dropped.
- The two vendored copies under `plugins/pipeline-core/` regenerated with `harness/scripts/generate-vendored-canon.mjs` (`--check` passes).

## Source and what was deliberately not taken

The idea comes from the public lean-change prompt of the Ponytail project (read 2026-11-02, MIT); no text, level system, slash command or runtime component is copied or fetched. Its "one small test" is not adopted (QG-04 asks for criterion-bound tests first); its "question the request" level is not adopted (a closed briefing has stop conditions, no design latitude).

## Checks (slice clone)

`check-critic-contract-citations` 21 of 21, `check-critic-fail-closed` and `check-error-register` green, `critic-packet-governance` green, `module-inventory` green; `codex-isolated-critic-protected-preimage` stays red exactly as at the base (the PO's re-pin of the Critic skill hash; this patch does not touch the pinned skill file).

## Not proven

- Nothing is measured: the seed requires rebuilding two or three past slices with and without the rule and comparing diff size, tool calls, tokens and green checks before adoption. That has not been done. The apply script carries this patch and w121 as an OPT-IN step for that reason.
- The ruleset content identity changes (role files are part of it); dispatch briefings built before the apply carry the old identity.
