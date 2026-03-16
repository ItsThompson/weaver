import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { DirectoryPicker } from "../../../../components/DirectoryPicker";
import type { WeaverConfig } from "@weaver/shared/types";

interface SkillPathsFieldProps {
  config: WeaverConfig;
  setConfig: React.Dispatch<React.SetStateAction<WeaverConfig>>;
  disabled: boolean;
}

export function SkillPathsField({
  config,
  setConfig,
  disabled,
}: SkillPathsFieldProps) {
  return (
    <FormField
      label="Skill paths"
      description="Directories containing skill subdirectories. Provide the full path (e.g. ~/projects/my-app/.kiro/skills)."
    >
      <AttributeEditor
        onAddButtonClick={() =>
          setConfig((prev) => ({
            ...prev,
            skill_paths: [...prev.skill_paths, ""],
          }))
        }
        onRemoveButtonClick={({ detail: { itemIndex } }) =>
          setConfig((prev) => ({
            ...prev,
            skill_paths: prev.skill_paths.filter((_, i) => i !== itemIndex),
          }))
        }
        items={config.skill_paths.map((skillPath) => ({ value: skillPath }))}
        addButtonText="Add skill path"
        removeButtonText="Remove"
        empty="No skill paths configured. Skills are loaded from ~/.kiro/skills only."
        definition={[
          {
            label: "Path",
            control: (item: { value: string }, itemIndex: number) => (
              <SpaceBetween direction="horizontal" size="xs">
                <Input
                  value={item.value}
                  onChange={({ detail }) =>
                    setConfig((prev) => ({
                      ...prev,
                      skill_paths: prev.skill_paths.map((existing, i) =>
                        i === itemIndex ? detail.value : existing,
                      ),
                    }))
                  }
                  placeholder="~/projects/my-app/.kiro/skills"
                  disabled={disabled}
                />
                <DirectoryPicker
                  onSelect={(path) =>
                    setConfig((prev) => ({
                      ...prev,
                      skill_paths: prev.skill_paths.map((existing, i) =>
                        i === itemIndex ? path : existing,
                      ),
                    }))
                  }
                  disabled={disabled}
                />
              </SpaceBetween>
            ),
          },
        ]}
        disableAddButton={disabled}
      />
    </FormField>
  );
}
