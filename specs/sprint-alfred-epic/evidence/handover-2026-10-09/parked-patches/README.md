# Parked uncommitted edits (2026-10-09, before the checkpoint push)

Each patch holds a staged part and an unstaged part (`git apply` each part in order after removing the `#` header lines).
- MECH-HAIKU-F.patch — mechanic → Haiku/medium; after-capture RED (RP31, migration-v3), needs a test slice first.
- CRITIC-CKPT-F2-critic-md.patch — critic.md 65 turns + Write/Edit; ships ONLY with the signed tranche-2 guard (post-image also at signed-package/tranche-2/agents/critic.md).
- foreign-uncommitted.patch — edits present before this session's wave (pipeline-state import edit, sanctioned-args-onboarding, pipeline-state.test); provenance unknown, preserved verbatim.

- MECH-HAIKU-F.patch: staged 0 bytes, unstaged 15008 bytes
- CRITIC-CKPT-F2-critic-md.patch: staged 3702 bytes, unstaged 0 bytes
- foreign-uncommitted.patch: staged 2508 bytes, unstaged 1189 bytes
