import { post, getCallerPid } from '../utils.js';

export function view(args: string[]): void {
  const pidIdx = args.indexOf('--pid');
  const pid = pidIdx !== -1 && args[pidIdx + 1] ? parseInt(args[pidIdx + 1], 10) : getCallerPid();

  if (isNaN(pid)) {
    console.error('Invalid PID');
    process.exit(1);
  }

  const { ok, status } = post('/api/view', { pid });

  if (status === 0) {
    console.log('Weaver server not running');
  } else if (ok) {
    console.log('Opening session in Weaver dashboard');
  } else if (status === 404) {
    console.log(`No Weaver session found for PID ${pid}`);
  } else {
    console.log(`Weaver server error (${status})`);
  }
}
