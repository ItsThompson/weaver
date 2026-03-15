import { SkillCategory } from "@weaver/shared/types";
import { CATEGORY_COLORS } from "../constants";

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  [SkillCategory.CORE]: "Core",
  [SkillCategory.LANGUAGE]: "Language",
  [SkillCategory.DOMAIN]: "Domain",
  [SkillCategory.WORKFLOW]: "Workflow",
};

export function GraphControls() {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: "8px 12px",
        position: "absolute",
        top: 12,
        right: 12,
        background: "var(--color-background-container-content, #0f1b2a)",
        border: "1px solid var(--color-border-divider-default, #414d5c)",
        borderRadius: 6,
        zIndex: 5,
        fontFamily: "var(--font-family-base, 'Open Sans', sans-serif)",
      }}
    >
      {Object.values(SkillCategory).map((category) => (
        <div
          key={category}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: CATEGORY_COLORS[category],
            }}
          />
          <span
            style={{
              fontSize: "var(--font-size-body-s, 12px)",
              color: "var(--color-text-body-secondary, #8d99a8)",
            }}
          >
            {CATEGORY_LABELS[category]}
          </span>
        </div>
      ))}
    </div>
  );
}
