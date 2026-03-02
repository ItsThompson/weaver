import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useNavigateOnView(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const source = new EventSource('/api/events');

    source.addEventListener('navigate', (event: MessageEvent) => {
      try {
        const { sessionId } = JSON.parse(event.data) as { sessionId: string };
        navigate(`/sessions/${sessionId}`);
      } catch { /* ignore */ }
    });

    return () => source.close();
  }, [navigate]);
}
