import { post } from '../utils.js';

export function rename(pid: number, args: string[]): void {
  const name = args.join(' ').trim();
  if (!name) {
    console.error('Usage: weaver rename <name>');
    process.exit(1);
  }

  const { ok, status } = post('/api/rename', { pid, customName: name });

  if (status === 0) {
    console.log('Weaver server not running');
  } else if (ok) {
    console.log(`Session renamed to "${name}"`);
  } else if (status === 404) {
    console.log(`No Weaver session found for PID ${pid}`);
  } else {
    console.log(`Weaver server error (${status})`);
  }
}
