import { useState, useEffect, useMemo } from "react";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Multiselect from "@cloudscape-design/components/multiselect";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import type {
  WeaverConfig,
  SkillGraphCategoryConfig,
} from "@weaver/shared/types";
import { useSkillGraphQuery } from "../../../hooks/queries";

interface SkillGraphCategoriesFieldProps {
  config: WeaverConfig;
  setConfig: React.Dispatch<React.SetStateAction<WeaverConfig>>;
  disabled: boolean;
}

interface CategoryRow {
  name: string;
  color: string;
  skills: string[];
}

function toRows(
  categories: Record<string, SkillGraphCategoryConfig>,
): CategoryRow[] {
  return Object.entries(categories).map(([name, entry]) => ({
    name,
    color: entry.color ?? "",
    skills: entry.skills,
  }));
}

function syncConfig(
  rows: CategoryRow[],
  setConfig: React.Dispatch<React.SetStateAction<WeaverConfig>>,
) {
  const categories = rows.reduce<Record<string, SkillGraphCategoryConfig>>(
    (acc, row) => {
      if (!row.name) {
        return acc;
      }
      acc[row.name] = {
        ...(row.color ? { color: row.color } : {}),
        skills: row.skills,
      };
      return acc;
    },
    {},
  );
  setConfig((prev) => ({ ...prev, skill_graph: { categories } }));
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

  const [rows, setRows] = useState<CategoryRow[]>(() =>
    toRows(config.skill_graph?.categories ?? {}),
  );

  useEffect(() => {
    setRows(toRows(config.skill_graph?.categories ?? {}));
  }, [config.skill_graph]);

  const assignedByRow = useMemo(() => {
    const assigned = new Set<string>();
    rows.forEach((row) => row.skills.forEach((skill) => assigned.add(skill)));
    return assigned;
  }, [rows]);

  const updateRows = (updated: CategoryRow[]) => {
    setRows(updated);
    syncConfig(updated, setConfig);
  };

  return (
    <FormField
      label="Skill graph categories"
      description="Define categories with optional colors and assign skills. Skills can belong to at most one category."
    >
      <AttributeEditor
        onAddButtonClick={() =>
          setRows((prev) => [...prev, { name: "", color: "", skills: [] }])
        }
        onRemoveButtonClick={({ detail: { itemIndex } }) =>
          updateRows(rows.filter((_, i) => i !== itemIndex))
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
                onChange={({ detail }) => {
                  const updated = [...rows];
                  updated[itemIndex] = { ...item, name: detail.value };
                  updateRows(updated);
                }}
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
                  onChange={({ detail }) => {
                    const updated = [...rows];
                    updated[itemIndex] = { ...item, color: detail.value };
                    updateRows(updated);
                  }}
                  placeholder="#ff6b6b"
                  disabled={disabled}
                />
                {/^#[0-9a-fA-F]{6}$/.test(item.color) && (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: item.color,
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
            ),
          },
          {
            label: "Skills",
            control: (item: CategoryRow, itemIndex: number) => {
              const otherAssigned = new Set(assignedByRow);
              item.skills.forEach((skill) => otherAssigned.delete(skill));

              const options = allSkillNames.reduce<
                { label: string; value: string }[]
              >((acc, name) => {
                if (!otherAssigned.has(name)) {
                  acc.push({ label: name, value: name });
                }
                return acc;
              }, []);

              return (
                <Multiselect
                  selectedOptions={item.skills.map((skill) => ({
                    label: skill,
                    value: skill,
                  }))}
                  onChange={({ detail }) => {
                    const updated = [...rows];
                    updated[itemIndex] = {
                      ...item,
                      skills: detail.selectedOptions.map(
                        (opt) => opt.value ?? "",
                      ),
                    };
                    updateRows(updated);
                  }}
                  options={options}
                  placeholder="Select skills"
                  disabled={disabled}
                />
              );
            },
          },
        ]}
        disableAddButton={disabled}
      />
    </FormField>
  );
}
