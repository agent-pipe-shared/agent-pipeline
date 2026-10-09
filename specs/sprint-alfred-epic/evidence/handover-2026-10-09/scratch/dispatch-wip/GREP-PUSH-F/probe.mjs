import { commandIsGitPush, hasFailClosedMarker } from "../../../plugins/pipeline-core/lib/git-cmd.mjs";
const input = JSON.parse(process.argv[2]);
const wrong = { admitted: [], refused: [], adversarial: [] };
for (const [id, , command] of input.admitted) if (commandIsGitPush(command) !== false) wrong.admitted.push(id);
for (const [id, , command] of input.refused) if (commandIsGitPush(command) !== true) wrong.refused.push(id);
for (const [command, expected] of input.adversarial) if (commandIsGitPush(command) !== expected) wrong.adversarial.push(command);
console.log(JSON.stringify({ exportsHasFailClosedMarker: typeof hasFailClosedMarker, wrong, counts: { admitted: input.admitted.length, refused: input.refused.length, adversarial: input.adversarial.length } }));
