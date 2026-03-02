import { post } from '../utils.js';

export function session(pid: number, args: string[]): void {
  const subcommand = args[0];

  // weaver session <PID> — navigate to specific session by PID
  if (subcommand && /^\d+$/.test(subcommand)) {
    const targetPid = parseInt(subcommand, 10);
    const { ok, status } = post('/api/view', { pid: targetPid });

    if (status === 0) {
      console.log('Weaver server not running');
    } else if (ok) {
      console.log(`Opening session for PID ${targetPid} in Weaver dashboard`);
    } else if (status === 404) {
      console.log(`No session found for PID ${targetPid}`);
    } else {
      console.log(`Weaver server error (${status})`);
    }
    return;
  }

  // weaver session list (or no subcommand) — navigate to sessions list
  if (!subcommand || subcommand === 'list') {
    const { ok, status } = post('/api/navigate', { page: 'sessions' });

    if (status === 0) {
      console.log('Weaver server not running');
    } else if (ok) {
      console.log('Opening sessions list in Weaver dashboard');
    } else {
      console.log(`Weaver server error (${status})`);
    }
    return;
  }

  console.error(`Unknown session subcommand: ${subcommand}`);
  console.error('Usage: weaver session [list | <PID>]');
  process.exit(1);
}
