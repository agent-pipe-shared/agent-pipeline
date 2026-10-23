# K131-AGY-GLOBAL-DEFAULT-DOC notes (clone scratch/clones/k131, base main 1c784b9d7)

Status: implementation complete in clone; independent Critic read and PO acceptance pending.
Commit: d00559261 docs(setup): make the global installer choice the documented default Antigravity route (SETUP.md, GEMINI.md).
Trailers: AI-Assisted: true / Dispatch: K131-AGY-GLOBAL-DEFAULT-DOC (goldfish). Clone git identity set locally (same as main checkout).
Note: evidence/dispatch-record-K131-AGY-GLOBAL-DEFAULT-DOC.json was not created by me (briefing did not ask for it); the Elephant may need it for dispatch-authorship-verify.

## Cause
SETUP.md told the reader to clone the release outside the project and then choose Workspace-Local; since D79 the installer refuses that
(ATR-WORKSPACE-SOURCE-OUTSIDE, repair "use the global option"). GEMINI.md step 1 inherited it. No way back global -> workspace (ATR-OTHER-SCOPE-CONFLICT).
All facts are K129's cited code facts (scratch/agent-out/K129-notes.md); no new product claim.

## Change (SETUP.md, "Antigravity (Agy): workspace-local binding" section)
- Intro: bind with Global topology refresh (documented default); Workspace-Local is the documented alternative.
- Clone-location paragraph: states the Global choice is the one that accepts a source outside the project.
- Prompt paragraph: choose Global (prompt choice 2); Workspace-Local (choice 1) = alternative, requires the clone inside the workspace;
  after a global registration the installer refuses Workspace-Local.
- Upgrade paragraph: same choice as before; readback for Global ($HOME/.gemini/config/plugins.json, exactly one Pipeline entry naming the view)
  and for Workspace-Local (.agents/plugins.json) (both per K129 H registryBound / registryChange).
- "Choosing where to bind": default line, "(documented default)" on choice 2, refusal explanation linked to the default, one sentence
  "choose Workspace-Local only deliberately ... cannot be undone through the installer".
- "Not verified from the code": extended by "(the PO's Antigravity run checks this)" for which workspaces Agy loads for a global registration.
- Link text at Step 0 "Antigravity (Agy)" changed from "workspace-local procedure" to "Agy binding procedure" (anchor target unchanged).
- Unchanged: all headings, refusal codes, the inert-outside-opted-in paragraph, pinned inventory markers.
GEMINI.md: heading "(Workspace-Local)" -> "(Global)", intro and step 1 select Global, Workspace-Local only with the plugin inside the project,
refusal code named, link to SETUP kept. Length +3 lines net.

## Smallest-reading decisions
- Kept "Keep the clone at the same path while the plugin is registered" (existing sentence) generalized from "while it is registered".
  Whether the global registration needs the source to stay is not stated in K129; left as the conservative existing advice.
- Kept the "from each consumer project root" upgrade wording (global rewrites workspace hook files per K129, so per-project runs stay plausible).
- Anchor `#antigravity-agy-workspace-local-binding` unchanged (heading text pinned).

## Checks (each alone, after the commit, from the main checkout against the clone)
- node scratch/clones/k131/harness/scripts/check-doc-contracts.mjs: exit 0, "2569 Markdown file(s), 1977 link(s), 106 anchor check(s)".
- node --test scratch/clones/k131/harness/scripts/check-doc-contracts.test.mjs: 76 pass, 0 fail.
- node scratch/clones/k131/harness/scripts/check-product-capability-inventory.mjs: PASS (inventory).
- extra: node --test scratch/clones/k131/plugins/pipeline-core/lib/pins/pipeline-hooks-act-in-repositories-that-never-opted-in.test.mjs: 14 pass, 0 fail
  (pins the SETUP inert wording). Before-baseline: K129 recorded the same checks green on its own base.
Ratchet effect on architecture/boundary-policy.json: none (docs only). No protected paths touched; no protected diff.

## Risks
- Docs now call global the default although which workspaces Agy loads for a global registration is unverified (named in SETUP; PO's Antigravity run decides).
- Global is irreversible through the installer; stated in SETUP.

## Proposed commit message
Already committed as d00559261 (message file scratch/clones/k131/scratch/commit-msg/k131.txt).
