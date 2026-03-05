import ButtonDropdown, { type ButtonDropdownProps } from '@cloudscape-design/components/button-dropdown';

export interface ActionItem {
  id: string;
  text: string;
  action: () => void;
}

interface ActionDropdownProps {
  actions: ActionItem[];
  children?: React.ReactNode;
  variant?: ButtonDropdownProps['variant'];
}

export function ActionDropdown({ actions, children, variant }: ActionDropdownProps) {
  const handlers = Object.fromEntries(actions.map((a) => [a.id, a.action]));

  return (
    <ButtonDropdown
      items={actions.map(({ id, text }) => ({ id, text }))}
      onItemClick={({ detail }) => handlers[detail.id]?.()}
      expandToViewport
      variant={variant}
    >
      {children}
    </ButtonDropdown>
  );
}
