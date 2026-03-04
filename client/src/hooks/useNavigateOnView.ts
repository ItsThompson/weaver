import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PAGE_ROUTES: Record<string, string> = {
  sessions: '/',
  mini: '/mini',
};

export function useNavigateOnView(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const source = new EventSource('/api/events');

    source.addEventListener('navigate', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { sessionId?: string; page?: string };
        if (data.sessionId) {
          navigate(`/sessions/${data.sessionId}`);
        } else if (data.page && PAGE_ROUTES[data.page]) {
          navigate(PAGE_ROUTES[data.page]);
        }
      } catch { /* ignore */ }
    });

    return () => source.close();
  }, [navigate]);
}
