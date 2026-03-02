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

  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', paddingRight: 8 }}>
      <ButtonDropdown
        variant="inline-icon"
        items={[{ id: 'rename', text: 'Rename session' }]}
        onItemClick={() => setRenameVisible(true)}
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
