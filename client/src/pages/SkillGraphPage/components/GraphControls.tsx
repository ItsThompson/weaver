import { useConfigQuery } from "../../../hooks/queries";
import { useCategoryColors } from "../hooks/useCategoryColors";
import { UNCATEGORIZED_COLOR } from "../constants";
import { colors } from "../../../theme/colors";

export function GraphControls() {
  const { data: configData } = useConfigQuery();
  const resolveColor = useCategoryColors(configData);
  const categories = configData?.config.skill_graph?.categories ?? {};

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: "8px 12px",
        position: "absolute",
        top: 12,
        right: 12,
        background: `var(--color-background-container-content, ${colors.backgroundContainer})`,
        border: `1px solid var(--color-border-divider-default, ${colors.borderDefault})`,
        borderRadius: 6,
        zIndex: 5,
        fontFamily: "var(--font-family-base, 'Open Sans', sans-serif)",
      }}
    >
      {Object.keys(categories).map((name) => (
        <div
          key={name}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: resolveColor(name),
            }}
          />
          <span
            style={{
              fontSize: "var(--font-size-body-s, 12px)",
              color: `var(--color-text-body-secondary, ${colors.textSecondary})`,
            }}
          >
            {name}
          </span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 2,
            background: colors.neutral,
          }}
        />
        <span
          style={{
            fontSize: "var(--font-size-body-s, 12px)",
            color: `var(--color-text-body-secondary, ${colors.textSecondary})`,
          }}
        >
          Workspace
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 2,
            background: UNCATEGORIZED_COLOR,
          }}
        />
        <span
          style={{
            fontSize: "var(--font-size-body-s, 12px)",
            color: `var(--color-text-body-secondary, ${colors.textSecondary})`,
          }}
        >
          Uncategorized
        </span>
      </div>
    </div>
  );
}
