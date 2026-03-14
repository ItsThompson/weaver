import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import type { WeaverConfig } from "@weaver/shared/types";

interface TestRunnersFieldProps {
  config: WeaverConfig;
  setConfig: React.Dispatch<React.SetStateAction<WeaverConfig>>;
  disabled: boolean;
}

export function TestRunnersField({
  config,
  setConfig,
  disabled,
}: TestRunnersFieldProps) {
  return (
    <FormField
      label="Test runners"
      description="Patterns used to detect agent-run tests for validation deduplication. Entries are matched against execute_bash commands."
    >
      <AttributeEditor
        onAddButtonClick={() =>
          setConfig((prev) => ({
            ...prev,
            test_runners: [...prev.test_runners, ""],
          }))
        }
        onRemoveButtonClick={({ detail: { itemIndex } }) =>
          setConfig((prev) => ({
            ...prev,
            test_runners: prev.test_runners.filter((_, i) => i !== itemIndex),
          }))
        }
        items={config.test_runners.map((runner) => ({ value: runner }))}
        addButtonText="Add test runner"
        removeButtonText="Remove"
        empty="No test runners configured."
        definition={[
          {
            label: "Command pattern",
            control: (item: { value: string }, itemIndex: number) => (
              <Input
                value={item.value}
                onChange={({ detail }) =>
                  setConfig((prev) => ({
                    ...prev,
                    test_runners: prev.test_runners.map((runner, i) =>
                      i === itemIndex ? detail.value : runner,
                    ),
                  }))
                }
                placeholder="e.g. jest, pytest, cargo test"
                disabled={disabled}
              />
            ),
          },
        ]}
        disableAddButton={disabled}
      />
    </FormField>
  );
}
