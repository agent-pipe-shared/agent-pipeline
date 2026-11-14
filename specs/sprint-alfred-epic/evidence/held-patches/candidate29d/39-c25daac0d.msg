fix(dispatch-budget): name the fresh round when an aborted Critic has no grant

Claude run 3, toil P3-3: a Critic stopped by an API error (403) was
resumed with SendMessage and refused with
DISPATCH-BUDGET-CRITIC-RESUME-NOT-GENERATED; the refusal only said to
record a grant, a budget act that does not fit an infrastructure abort.
The no-grant refusal now separates the two cases: at the budget
checkpoint record a grant and send the generated text; after any other
stop (API or infrastructure error, cancelled or duplicate dispatch) do
not resume, dispatch the same round again from the Critic template as
a fresh agent. The checkpoint test pins the sentence.

AI-Assisted: true
Dispatch: stage-0 (elephant)
