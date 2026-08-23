import { readFileSync } from 'node:fs';
import { sessionStartDecision } from './codex-session-start-hint.mjs';

function main() {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    // invocationNum is 1 on the very first turn of the conversation
    if (input.invocationNum === 1 || input.invocationNum === 0) {
      const decision = sessionStartDecision(process.cwd());
      
      process.stdout.write(JSON.stringify({
        injectSteps: [
          {
            ephemeralMessage: decision.context
          }
        ]
      }) + '\n');
      return;
    }
  } catch (e) {
    // Fail open
  }
  process.stdout.write('{}\n');
}

main();
