test(design-review): native Claude review fixtures carry the host observation

D247 refuses present-plan over a Claude review round without a host
observation of its reviewer. The fixtures that walk present-plan with a
native Claude receipt built through the library now carry the observation
the route stamps (the report's digest, the reviewer model), as a receipt
made through export-report and create would. No assertion changes; the
refusal itself is covered by DABX016.

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
