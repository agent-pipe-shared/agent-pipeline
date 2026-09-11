# Reader review phase two — greenfield-062-r7

Independent evidence check against the eleven public document blobs at
reviewed commit `635de28c3326bf9c254e9c3a61ce1ba46570af3b`. The reviewer received
the phase-one findings, committed capability inventory, governance data, and
reader protocol, but no earlier rounds, diff, history, or conversation, and
made no file changes.

- **RR-R7-01 — confirmed.** Add “optional” to the German YAML-manifest phrase
  and make the conflict sentence point unambiguously to the named authority,
  matching the English text.
- **RR-R7-02 — confirmed and refined.** Present `governance/examples/` as a
  template source copied into project-owned paths. Limit gate and review effect
  to configured rules and applicable gates/reviews; remove unconditional
  “automatically” and “before every push” claims in both languages.

Both remedies change public documentation, so this is not a closure round.
