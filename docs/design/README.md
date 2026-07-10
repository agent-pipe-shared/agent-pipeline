# Design Guide: From Raw Idea to a Good Requirement Doc

A self-service guide for brainstorming with a chat AI before a larger requirement goes
into the actual development pipeline. Concrete techniques, no methodology name-dropping —
every technique below tells you HOW to use it, often with a ready-to-copy micro-prompt.

**The two sibling files in this folder:**

- **[`design-facilitator-prompt.md`](design-facilitator-prompt.md)** — the ready-made
  prompt block you paste into a new chat session to start the brainstorming.
- **[`export-template.md`](export-template.md)** — the target format the AI exports
  into at the end (eight lean sections including a Mermaid example).

---

## Where this fits

This guide sits **deliberately upstream of the pipeline** — it isn't a pipeline feature,
but an optional, recommended pre-step. Nobody has to use it; you can always skip the
design stage and start directly. If you do use it: the pipeline later reads the
resulting export as **orientation**, not as a mandatory schema and not as a hard gate —
it gets questioned just like any other requirement, never rubber-stamped just because it
looks finished.

## The four-phase flow

1. **Sharpen the problem.** Before any solution takes shape: what's the actual problem,
   who has it, why now? Vague problems produce precisely wrong solutions.
2. **Generate options.** At least two plausible paths, not just the first idea thought
   through to the end.
3. **Converge.** In several short rounds instead of one long pass: after each round,
   check what's missing, then keep converging.
4. **Check and export.** Red-team your own recommendation, surface assumptions, then
   pour it into the [export](export-template.md).

## Techniques

**Force interview mode (the AI asks back first).** Actively tell the AI to ask
clarifying questions before making any proposal, instead of delivering immediately —
this stops it from silently making assumptions you never confirmed.
> Micro-prompt: "Before you propose anything: ask me all the clarifying questions you
> need for completeness first. Only make proposals after that."

**Deliver constraints early.** Name existing systems, stack, regulatory limits, and hard
exclusions (e.g. no vendor lock-in) already in the first message — otherwise the AI
burns its first round on options that fail against reality.
> Micro-prompt: "Constraints: the existing stack is X, Y must keep working, Z is
> excluded for regulatory reasons, no vendor lock-in."

**≥2 options with trade-offs instead of the first idea.** Explicitly demand at least two
architecture or solution options, each with pros and cons, before any recommendation is
made at all — an AI's first idea is rarely its most thought-through one, only its
fastest.
> Micro-prompt: "Show me at least two plausible options, each with pros and cons, before
> you commit to one."

**Deliberately set non-goals.** Explicitly state what should NOT be part of the
solution. This cuts off scope creep early and simultaneously sharpens the AI's
proposals, because it stops trying to solve everything at once.
> Micro-prompt: "Non-goals for this round: …"

**Red-team your own recommendation.** Once the AI has stated a recommendation, ask it to
actively attack it: weakest assumption, biggest risk, where does it break first.
> Micro-prompt: "Now attack your own recommendation: what's the weakest assumption?
> Where does this break first?"

**Have assumptions listed explicitly.** At the end of each round, ask the AI to list all
assumptions its proposal rests on — including the implicit ones it wouldn't have
mentioned on its own.
> Micro-prompt: "List every assumption you made for this proposal, including the
> implicit ones."

**Use a diagram as a thinking check.** A Mermaid diagram forces precision: if you can't
draw a flow, you haven't actually thought it through. Have the AI produce the diagram
early, not as an afterthought at the end — gaps show up while drawing, not while
describing.

**Design for splittability from the start.** Ask from the beginning how the topic could
be split into independently shippable chunks, instead of leaving that thought for the
end — it already shapes the architecture options themselves.
> Micro-prompt: "How would you split this topic into several independently shippable
> parts, and which part depends on which?"

**Converge iteratively instead of in one pass.** Several short rounds instead of one
long wall-of-text session: produce a round, converge, check, tackle the next gap. This
keeps every single AI answer focused and checkable.

## Anti-patterns

- **Dictating the solution and only having the AI confirm it.** This turns the AI into
  a yes-man and it loses its value as a sparring partner — you get a confirmation, not a
  check.
- **Giving no context.** Leads to generic proposals that miss your actual situation (see
  "Deliver constraints early" above).
- **Taking the first answer as final.** Without red-teaming and at least one convergence
  round, blind spots stay undetected until they become expensive later.
- **Wall-of-text prompts.** Too much at once makes the AI lose focus and prevents
  bundled clarifying questions — start lean and converge iteratively instead.

## From brainstorming to export

1. Open [`design-facilitator-prompt.md`](design-facilitator-prompt.md) and copy the
   complete prompt block into a new chat session.
2. Attach your raw idea directly below it.
3. Answer the AI's bundled clarifying questions (one round).
4. The AI delivers the export following the schema in
   [`export-template.md`](export-template.md) — including Mermaid diagrams with a
   documented self-check ("Mermaid check: passed").
5. Save the export following the persistence convention below.

## Format: Markdown or PDF

Markdown is the most pipeline-friendly form — directly readable, versionable, diffable.
PDF is also accepted as an input form if your path (e.g. via a diagramming tool) leads
there; the pipeline then only loses diff capability, not readability.

## Where does the export go? (Persistence convention)

A finished export lands, versioned, in the repo under `specs/<topic>/design-input.md` —
a fixed location, no gate, no schema enforcement. That makes it discoverable and
referenceable for the backlog items later cut from it.
