import { useMemo } from "react";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Multiselect from "@cloudscape-design/components/multiselect";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import type { WeaverConfig } from "@weaver/shared/types";
import { useSkillGraphQuery } from "../../../../hooks/queries";
import {
  toRows,
  toConfig,
  isValidHex,
  collectAssignedSkills,
  availableSkillOptions,
  updateRowAt,
} from "./utils";
import type { CategoryRow } from "./utils";

interface SkillGraphCategoriesFieldProps {
  config: WeaverConfig;
  setConfig: React.Dispatch<React.SetStateAction<WeaverConfig>>;
  disabled: boolean;
}

export function SkillGraphCategoriesField({
  config,
  setConfig,
  disabled,
}: SkillGraphCategoriesFieldProps) {
  const { data: graphData } = useSkillGraphQuery();
  const allSkillNames = useMemo(
    () => graphData?.nodes.map((node) => node.name) ?? [],
    [graphData],
  );

  const rows = useMemo(
    () => toRows(config.skill_graph?.categories ?? {}),
    [config.skill_graph?.categories],
  );

  const assigned = useMemo(() => collectAssignedSkills(rows), [rows]);

  const syncRows = (updated: CategoryRow[]) => {
    setConfig((prev) => ({
      ...prev,
      skill_graph: { categories: toConfig(updated) },
    }));
  };

  const updateRow = (index: number, patch: Partial<CategoryRow>) => {
    syncRows(updateRowAt(rows, index, patch));
  };

  return (
    <FormField
      label="Skill graph categories"
      description="Define categories with optional colors and assign skills. Skills can belong to at most one category."
    >
      <AttributeEditor
        onAddButtonClick={() =>
          syncRows([...rows, { name: "", color: "", skills: [] }])
        }
        onRemoveButtonClick={({ detail: { itemIndex } }) =>
          syncRows(rows.filter((_, i) => i !== itemIndex))
        }
        items={rows}
        addButtonText="Add category"
        removeButtonText="Remove"
        empty="No categories configured."
        definition={[
          {
            label: "Name",
            control: (item: CategoryRow, itemIndex: number) => (
              <Input
                value={item.name}
                onChange={({ detail }) =>
                  updateRow(itemIndex, { name: detail.value })
                }
                placeholder="e.g. core"
                disabled={disabled}
              />
            ),
          },
          {
            label: "Color",
            control: (item: CategoryRow, itemIndex: number) => (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Input
                  value={item.color}
                  onChange={({ detail }) =>
                    updateRow(itemIndex, { color: detail.value })
                  }
                  placeholder="#ff6b6b"
                  disabled={disabled}
                />
                {isValidHex(item.color) && (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      flexShrink: 0,
                      background: item.color,
                    }}
                  />
                )}
              </div>
            ),
          },
          {
            label: "Skills",
            control: (item: CategoryRow, itemIndex: number) => (
              <Multiselect
                selectedOptions={item.skills.map((skill) => ({
                  label: skill,
                  value: skill,
                }))}
                onChange={({ detail }) =>
                  updateRow(itemIndex, {
                    skills: detail.selectedOptions.flatMap((opt) =>
                      opt.value ? [opt.value] : [],
                    ),
                  })
                }
                options={availableSkillOptions(
                  allSkillNames,
                  assigned,
                  item.skills,
                )}
                filteringType="auto"
                placeholder="Select skills"
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
