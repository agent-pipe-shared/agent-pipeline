fix(critic): keep the generated Critic prompt lines inside the Contamination Rule

An Antigravity greenfield run pasted criticDispatchPromptLines into its
Critic dispatch as nextStep says, and the Antigravity guard refused it
under the Contamination Rule: the MP-07 rationale line said "security
review". The line now says "security checks"; the dispatch policy still
reads "critical architecture or security" from it. The guard exports
its trigger pattern, and a test runs every generated line against it.

AI-Assisted: true
Dispatch: stage-0 (elephant)
