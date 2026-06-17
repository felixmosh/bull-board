#!/usr/bin/env node
/* eslint-disable no-console -- CLI script; stdout is its interface */
// Asserts a built Next.js example ships the @bull-board/ui assets in its serverless
// function (guards #444). Usage: node scripts/check-nextjs-trace.mjs <example-dir>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const exampleDir = process.argv[2];
if (!exampleDir) {
  console.error('usage: node scripts/check-nextjs-trace.mjs <example-dir>');
  process.exit(2);
}

const serverDir = join(exampleDir, '.next', 'server');

let traceRel;
try {
  traceRel = readdirSync(serverDir, { recursive: true })
    .map(String)
    .find((f) => f.includes('queues') && f.endsWith('.nft.json'));
} catch {
  console.error(`Could not read ${serverDir} — did \`next build\` run?`);
  process.exit(1);
}

if (!traceRel) {
  console.error(`No queues route trace (*.nft.json) found under ${serverDir}.`);
  process.exit(1);
}

const tracePath = join(serverDir, traceRel);
const { files = [] } = JSON.parse(readFileSync(tracePath, 'utf8'));
const uiFiles = files.filter((f) => f.includes('@bull-board/ui/dist'));
const hasEntry = uiFiles.some((f) => f.endsWith('index.ejs'));
const hasStatic = uiFiles.some((f) => f.includes('@bull-board/ui/dist/static/'));

console.log(`Trace: ${tracePath}`);
console.log(`Traced ${uiFiles.length} @bull-board/ui/dist files into the function.`);

if (!hasEntry || !hasStatic) {
  console.error(
    '\nFAIL: the @bull-board/ui assets are missing from the serverless trace.\n' +
      'This is the #444 regression. Check `outputFileTracingIncludes` (and, in a\n' +
      'monorepo, `outputFileTracingRoot`) in the example\'s next.config.js, and\n' +
      'whether a newer Next.js changed its file-tracing behavior.'
  );
  process.exit(1);
}

console.log('OK: index.ejs and static assets are bundled into the function.');
