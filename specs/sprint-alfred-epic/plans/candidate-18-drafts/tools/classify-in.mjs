// Scratch: classify test files with the case-completion vulnerable-suite classifier of a clone. Usage: node scratch/agent-out/classify-in.mjs <clone> <test-file>...
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [clone, ...files] = process.argv.slice(2);
const { classifyVulnerableSuite } = await import(pathToFileURL(join(resolve(clone), "harness/scripts/check-verify-case-completion.mjs")).href);
for (const file of files) console.log(file, JSON.stringify(classifyVulnerableSuite(readFileSync(join(resolve(clone), file), "utf8"))));
