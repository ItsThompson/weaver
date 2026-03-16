import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import type { WeaverConfig } from "@weaver/shared/types";

interface SkillPathsFieldProps {
  config: WeaverConfig;
  setConfig: React.Dispatch<React.SetStateAction<WeaverConfig>>;
  disabled: boolean;
  pathErrors: Record<string, string>;
}

export function SkillPathsField({
  config,
  setConfig,
  disabled,
  pathErrors,
}: SkillPathsFieldProps) {
  return (
    <FormField
      label="Skill directories"
      description="Full paths to directories containing skill subdirectories. Each directory is scanned for skills to include in the skill graph. The global path (~/.kiro/skills) is always included automatically."
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
        items={config.skill_paths.map((path) => ({ value: path }))}
        addButtonText="Add skill directory"
        removeButtonText="Remove"
        empty="No custom skill directories configured."
        definition={[
          {
            label: "Path",
            control: (item: { value: string }, itemIndex: number) => (
              <Input
                value={item.value}
                onChange={({ detail }) =>
                  setConfig((prev) => ({
                    ...prev,
                    skill_paths: prev.skill_paths.map((entry, i) =>
                      i === itemIndex ? detail.value : entry,
                    ),
                  }))
                }
                placeholder="~/projects/my-app/.kiro/skills"
                disabled={disabled}
                invalid={!!pathErrors[String(itemIndex)]}
              />
            ),
            errorText: (_item: { value: string }, itemIndex: number) =>
              pathErrors[String(itemIndex)] ?? null,
          },
        ]}
        disableAddButton={disabled}
      />
    </FormField>
  );
}
