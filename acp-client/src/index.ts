#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { startTui } from './tui/index.js';

const { values } = parseArgs({
  options: {
    resume: { type: 'string' },
    cwd: { type: 'string' },
    agent: { type: 'string' },
  },
  strict: false,
  allowPositionals: true,
});

startTui({
  cwd: (values.cwd as string) ?? process.cwd(),
  resumeSessionId: values.resume as string | undefined,
  agentCommand: values.agent as string | undefined,
}).catch((err) => {
  process.stderr.write(JSON.stringify({ timestamp: new Date().toISOString(), event: 'fatal', error: String(err) }) + '\n');
  process.exit(1);
});
