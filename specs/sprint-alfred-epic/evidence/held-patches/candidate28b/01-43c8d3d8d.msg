feat(critic): lift the Critic turn limit to 100 and keep the part size derived from it

- agents/critic.md maxTurns 65 -> 100 (PO decision 2026-11-10, one-time re-pin of exactly this value in the protected preimage list). The working cap becomes 85, the checkpoint 68, and the one split bound (reads per file unchanged) 28 files per part.
- lib/critic-split.mjs mirrors the shipped value and its notice names the pinned file and its turn limit; DP26 now pins that mirror to the definition, DP27 and the three CDPF113 / CDPF032 / A1 assertions are restated in place (QG-04) for 100, 85 and 65 in reserve.
- The Critic briefing template stays unchanged (preimage-pinned, read only); it still states 65 and carries its own clause to derive the cap from the actual definition. The budget pin A1 admits that difference only with that clause.

AI-Assisted: true
Dispatch: stage-0 (elephant)
