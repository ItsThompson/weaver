import { useActivityLog } from "../../context/ActivityLogContext";
import { ACTIVITY_COLORS, colors } from "../../theme/colors";

const MAX_VISIBLE = 10;

export function MiniActivityLog() {
  const { entries } = useActivityLog();
  const visible = entries.slice(0, MAX_VISIBLE);

  if (visible.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${colors.borderDivider}`,
        padding: "6px 12px",
      }}
    >
      {visible.map((entry) => (
        <div
          key={entry.id}
          style={{
            fontSize: 11,
            color: colors.textMuted,
            padding: "2px 0",
            display: "flex",
            gap: 6,
          }}
        >
          <span
            style={{ color: ACTIVITY_COLORS[entry.activity], flexShrink: 0 }}
          >
            ●
          </span>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.message}
          </span>
        </div>
      ))}
    </div>
  );
}
