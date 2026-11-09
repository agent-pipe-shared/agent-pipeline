#!/usr/bin/env bash
# PO apply script for candidate 23: 43 held patches exported from the build clone chain a1376d7cc..60f60f667
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate23
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-cd452b3a7 'fix(onboarding): ask for consent once through the preflight question'
step 02-105189ae7 'fix(preflight): accept a stable node of the same major beside a version manager'
step 03-547500691 'fix(skill): keep the consent line inside the start skill budget'
step 04-31fe38af5 'fix(design-review): let a second receipt withdraw findings over unchanged documents'
step 05-5e7f52aae 'fix(onboarding): narrow the rights of the project folder the driver just created on Windows'
step 06-5e4812ad6 'feat(guard): admit the help flag of every plugin script that answers it'
step 07-c885d1586 'test(guard): pin the help admission in a session that is not ready'
step 08-411e69997 'feat(guard): say why a help question on a script without help is refused'
step 09-7ecd5f42e 'feat(guard): admit --help on the scripts that only print their usage for it'
step 10-a02d43829 'docs(pipeline-core): state in the references what agents read source to learn, and answer help in three scripts'
step 11-580309dad 'feat(host-return): name where a refused return stopped being JSON and which keys are wrong'
step 12-b32f0f23c 'feat(host-commit): refuse a broken Goldfish handback while the worker can still repair it'
step 13-5ab8eba4b 'fix(host-commit): a completed dispatch also removes its handback refusal count'
step 14-07d246fb4 'feat(hooks): wire the Goldfish return check before the worker is gone'
step 15-5a4383e1f 'fix(host-commit): name the release route for a started slice whose work landed another way'
step 16-9f820da3c 'feat(guard): let onboarding set the commit author it asks for and name the action at runtime initialization'
step 17-6aca6624d 'test(onboarding): add the module the gitleaks adapter imports to the installed plugin fixture'
step 18-aba52cab5 'fix(guard): a read-only search that names the tool only in its pattern is no push attempt, and a refused read offers no override'
step 19-b8a5d87b9 'fix(guard): say a guessed plugin file does not exist on a shell read'
step 20-4d8fff84c 'fix(dispatch): name the recovery route after a lost host commit and rate it a warning'
step 21-191b1714f 'test(verify): register the read-only search guard suite'
step 22-e3242d021 'fix(guard): read a relative commit message file from the directory the command runs in'
step 23-79bc89d43 'fix(dispatch): admit an item briefing behind a disjoint advance at launch'
step 24-422931a38 'feat(dispatch): corrections repair the whole failure class'
step 25-4a3c8c2fe 'feat(routing): a project'"'"'s user config owns its model and effort routing'
step 26-982f9e73f 'chore(routing): project the deep Claude effort into the derived routing files'
step 27-ab209d8ff 'feat(routing): the dispatch admits what the project'"'"'s configuration names'
step 28-b76a1e412 'feat(dispatch): name the effective effort at the Claude subagent stop'
step 29-650a1f914 'fix(dispatch): bind a Claude record to the route the configuration names'
step 30-ff18754a9 'fix(antigravity): read a child'"'"'s commit message file from its own worktree and mark the model line as a notice'
step 31-04882ce63 'fix(close): the impact refusal names the values it accepts'
step 32-ef897377a 'fix(lifecycle): admit the fixed resume card route while the runtime still initializes'
step 33-2826aa137 'feat(antigravity): the dispatch prepare script answers help with the request shape'
step 34-e50844b34 'fix(registry): a normally released writer that left the State settled no longer blocks the next close step'
step 35-4d1d3ce59 'fix(close): bind the Result on the owner route inside the one-shot close and retire its per-call descriptors'
step 36-c440b1f82 'docs(close-feature): state the one-shot owner route and that several owner-route calls in a row are fine'
step 37-1437d6345 'feat(critic): pack small split groups so a round needs as few Critics as the size bound allows'
step 38-2167457ab 'fix(antigravity): keep the same model family silent, name the packet fields in the refusal and list the briefing package fields in the help'
step 39-b3aacaa78 'fix(critic): keep why a Critic return left no record and print it in the merge refusal'
step 40-2fed8ac9c 'fix(dispatch): admit a generated briefing that only lost its final newline'
step 41-27e95aa54 'chore(inventory): file the read-only search guard suite under its capability'
step 42-61986e0a8 'fix(dispatch): tolerate a lost final newline on a routed briefing too'
step 43-60f60f667 'fix(critic): record why an Antigravity Critic message left no return'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 23 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
