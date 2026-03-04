import { useNavigate } from 'react-router-dom';
import { useSessionsQuery } from '../../hooks/queries';
import { ACTIVITY_COLORS } from '../../utils/activityColors';
import type { SessionWithStatus } from '@weaver/shared/types';

const MAX_SESSIONS = 5;

function displayName(session: SessionWithStatus): string {
  return session.customName || session.cwd.split('/').pop() || session.id.slice(0, 8);
}

export function MiniPage() {
  const { data: sessions } = useSessionsQuery();
  const navigate = useNavigate();

  const openSessions = (sessions ?? [])
    .filter((s) => s.status === 'open')
    .sort((a, b) => new Date(b.lastEventTime).getTime() - new Date(a.lastEventTime).getTime())
    .slice(0, MAX_SESSIONS);

  return (
    <div style={{ background: '#161d26', minHeight: '100vh', color: '#d1d5db', fontFamily: "'Open Sans', sans-serif" }}>
      <div
        style={{
          height: 28,
          WebkitAppRegion: 'drag',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
        } as React.CSSProperties}
      />
      <div style={{ paddingTop: 28 }}>
        {openSessions.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: 13, color: '#6b7280' }}>
            No open sessions
          </div>
        )}
        {openSessions.map((session) => (
          <div
            key={session.id}
            onClick={() => navigate(`/sessions/${session.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            <span style={{ color: ACTIVITY_COLORS[session.activity ?? 'idle'] }}>●</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName(session)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
