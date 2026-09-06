#!/usr/bin/env node
// No is-main guard: npm installs this as a symlink, and import.meta.url resolves
// symlinks while process.argv[1] does not, so comparing them silently skipped
// main() for every installed user. Nothing imports this file — running is its
// only job.
const { main } = await import('../src/cli.js');
main(process.argv.slice(2));
