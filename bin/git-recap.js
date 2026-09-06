#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { main } = await import('../src/cli.js');
  main(process.argv.slice(2));
}
