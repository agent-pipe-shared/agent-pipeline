fix(continuity): a bound session can run the advancing State entries end to end

The bound session's legacy lifetime handle is carried across the exact +1 advance of cancel-submitted-plan and cancel-mixed-plan-state, so the effects check stays strict for every other change; the pre-write refusal now fires only for another session's binding or an inconsistent member and names both routes.

AI-Assisted: true
Dispatch: C30G-S2B (goldfish)
