import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sessionStartDecision } from './codex-session-start-hint.mjs';

function main() {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    if (input.invocationNum === 1 || input.invocationNum === 0) {
      const rootDir = (input.workspacePaths && input.workspacePaths.length > 0) 
          ? input.workspacePaths[0] 
          : process.cwd();
      const decision = sessionStartDecision(rootDir);

      // Create session bootstrap lock
      const sessionId = input.conversationId || input.session_id || 'default';
      const sessionDir = join(rootDir, '.git', 'agent-pipeline', 'run', `session-${sessionId}`);
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, 'requires-bootstrap.lock'), 'locked\n', 'utf8');

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
