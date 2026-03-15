import { SkillCategory } from "@weaver/shared/types";

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  [SkillCategory.CORE]: "#ff6b6b",
  [SkillCategory.LANGUAGE]: "#4ecdc4",
  [SkillCategory.DOMAIN]: "#45b7d1",
  [SkillCategory.WORKFLOW]: "#96ceb4",
};

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
        bottom: 12,
        left: 12,
        background: "rgba(0,0,0,0.6)",
        borderRadius: 6,
        zIndex: 5,
      }}
    >
      {Object.values(SkillCategory).map((cat) => (
        <div
          key={cat}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: CATEGORY_COLORS[cat],
            }}
          />
          <span style={{ fontSize: 12, color: "#ccc" }}>
            {CATEGORY_LABELS[cat]}
          </span>
        </div>
      ))}
    </div>
  );
}
