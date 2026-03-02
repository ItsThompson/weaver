import { post } from '../utils.js';

export function sessions(): void {
  const { ok, status } = post('/api/navigate', { page: 'sessions' });

  if (status === 0) {
    console.log('Weaver server not running');
  } else if (ok) {
    console.log('Opening sessions list in Weaver dashboard');
  } else {
    console.log(`Weaver server error (${status})`);
  }
}
