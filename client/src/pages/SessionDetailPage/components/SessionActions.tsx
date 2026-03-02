import { useState } from 'react';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import { RenameModal } from '../../../components/RenameModal';

interface SessionActionsProps {
  showTools: boolean;
  onToggleTools: () => void;
  currentName: string | null;
  sessionPid: number;
  onRename: (name: string) => Promise<void>;
}

export function SessionActions({ showTools, onToggleTools, currentName, sessionPid, onRename }: SessionActionsProps) {
  const [renameVisible, setRenameVisible] = useState(false);

  return (
    <>
      <ButtonDropdown
        items={[
          { id: 'toggle-tools', text: showTools ? 'Hide tool execution' : 'View tool execution' },
          { id: 'rename', text: 'Rename session' },
          { id: 'copy-name', text: 'Copy session name' },
          { id: 'copy-pid', text: 'Copy PID' },
        ]}
        onItemClick={({ detail }) => {
          if (detail.id === 'toggle-tools') onToggleTools();
          if (detail.id === 'rename') setRenameVisible(true);
          if (detail.id === 'copy-name') navigator.clipboard.writeText(currentName || 'Unnamed');
          if (detail.id === 'copy-pid') navigator.clipboard.writeText(String(sessionPid));
        }}
        expandToViewport
      >
        Actions
      </ButtonDropdown>
      <RenameModal
        visible={renameVisible}
        currentName={currentName}
        onDismiss={() => setRenameVisible(false)}
        onSave={onRename}
      />
    </>
  );
}
