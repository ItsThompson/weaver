import { useState } from 'react';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import Modal from '@cloudscape-design/components/modal';
import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import type { SessionWithStatus } from '@weaver/shared/types';
import { updateSessionName, deleteSession } from '../../../utils/api';
import { revalidateSessions } from '../../../hooks/queries';
import { RenameModal } from '../../../components/RenameModal';

export function ActionsCell({ session }: { session: SessionWithStatus }) {
  const [renameVisible, setRenameVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleRename = async (name: string) => {
    await updateSessionName(session.id, name);
    revalidateSessions();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteSession(session.id);
      revalidateSessions();
    } finally {
      setDeleting(false);
      setDeleteVisible(false);
    }
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
          { id: 'delete', text: 'Delete session' },
        ]}
        onItemClick={({ detail }) => {
          if (detail.id === 'rename') setRenameVisible(true);
          if (detail.id === 'copy-name') navigator.clipboard.writeText(displayName);
          if (detail.id === 'copy-pid') navigator.clipboard.writeText(String(session.pid));
          if (detail.id === 'delete') setDeleteVisible(true);
        }}
        expandToViewport
      />
      <RenameModal
        visible={renameVisible}
        currentName={session.customName}
        onDismiss={() => setRenameVisible(false)}
        onSave={handleRename}
      />
      <Modal
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        header="Delete session"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteVisible(false)}>Cancel</Button>
              <Button variant="primary" loading={deleting} onClick={handleDelete}>Delete</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Alert type="warning">
          This will permanently delete the session log for <strong>{displayName}</strong> (PID {session.pid}). This action cannot be undone.
        </Alert>
      </Modal>
    </span>
  );
}
