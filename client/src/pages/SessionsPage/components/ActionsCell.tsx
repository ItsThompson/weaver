import type { SessionWithStatus } from '@shared/types';
import { useSessions } from '../../../context/SessionsContext';
import { RenameSession } from '../../../components/RenameSession';

export function ActionsCell({ session }: { session: SessionWithStatus }) {
  const { renameSession } = useSessions();
  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', paddingRight: 8 }}>
      <RenameSession currentName={session.customName} onRename={(name) => renameSession(session.id, name)} />
    </span>
  );
}