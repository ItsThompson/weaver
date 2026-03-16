import Button from "@cloudscape-design/components/button";
import { isElectron } from "../../utils/isElectron";

interface DirectoryPickerProps {
  onSelect: (path: string) => void;
  disabled?: boolean;
}

export function DirectoryPicker({ onSelect, disabled }: DirectoryPickerProps) {
  if (!isElectron()) {
    return null;
  }

  const handleClick = async () => {
    const result = await window.weaver?.selectDirectory();
    if (result) {
      onSelect(result);
    }
  };

  return (
    <Button onClick={handleClick} disabled={disabled}>
      Browse
    </Button>
  );
}
