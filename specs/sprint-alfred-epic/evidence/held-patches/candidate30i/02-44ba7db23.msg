fix(antigravity): the runner view marks every shipped Pipeline agent as a subagent only and pins the inherited defaults

The Antigravity runner view writes mainAgent false, subagent true, commandExecutionPolicy sandbox and inheritCustomizations true into every agent frontmatter, refuses a source that already carries one of the keys, and leaves the Claude sources unchanged.

AI-Assisted: true
Dispatch: C30G-S1B (goldfish)
