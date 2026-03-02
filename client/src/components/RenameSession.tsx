import { useState } from 'react';
import Button from '@cloudscape-design/components/button';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';

interface RenameSessionProps {
  currentName: string | null;
  onRename: (name: string) => Promise<void>;
}

export function RenameSession({ currentName, onRename }: RenameSessionProps) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');

  const open = () => { setValue(currentName ?? ''); setVisible(true); };

  const save = async () => {
    setVisible(false);
    if (value !== (currentName ?? '')) {
      await onRename(value);
    }
  };

  return (
    <>
      <ButtonDropdown
        variant="inline-icon"
        items={[{ id: 'rename', text: 'Rename session' }]}
        onItemClick={open}
        expandToViewport
      />
      <Modal
        visible={visible}
        onDismiss={() => setVisible(false)}
        header="Rename session"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setVisible(false)}>Cancel</Button>
              <Button variant="primary" onClick={save}>Save</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField label="Session name">
          <Input
            value={value}
            onChange={({ detail }) => setValue(detail.value)}
            onKeyDown={({ detail }) => { if (detail.key === 'Enter') save(); }}
            autoFocus
          />
        </FormField>
      </Modal>
    </>
  );
}
