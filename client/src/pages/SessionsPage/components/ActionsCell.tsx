import { useState } from 'react';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import type { SessionWithStatus } from '@weaver/shared/types';
import { updateSessionName } from '../../../utils/api';
import { revalidateSessions } from '../../../hooks/queries';
import { RenameModal } from '../../../components/RenameModal';

export function ActionsCell({ session }: { session: SessionWithStatus }) {
  const [renameVisible, setRenameVisible] = useState(false);

  const handleRename = async (name: string) => {
    await updateSessionName(session.id, name);
    revalidateSessions();
  };

  const displayName = session.customName || session.id.slice(0, 8);

  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', paddingRight: 8 }}>
      <ButtonDropdown
        variant="inline-icon"
        items={[
          { id: 'rename', text: 'Rename session' },
          { id: 'copy-name', text: 'Copy session name' },
          { id: 'copy-pid', text: 'Copy PID' },
        ]}
        onItemClick={({ detail }) => {
          if (detail.id === 'rename') setRenameVisible(true);
          if (detail.id === 'copy-name') navigator.clipboard.writeText(displayName);
          if (detail.id === 'copy-pid') navigator.clipboard.writeText(String(session.pid));
        }}
        expandToViewport
      />
      <RenameModal
        visible={renameVisible}
        currentName={session.customName}
        onDismiss={() => setRenameVisible(false)}
        onSave={handleRename}
      />
    </span>
  );
}
