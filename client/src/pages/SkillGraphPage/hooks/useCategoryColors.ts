import { useMemo } from "react";
import type { WeaverConfig } from "@weaver/shared/types";
import { DEFAULT_PALETTE, UNCATEGORIZED_COLOR } from "../constants";

export function useCategoryColors(
  config: { config: WeaverConfig } | undefined,
): (category: string | null) => string {
  return useMemo(() => {
    const categories = config?.config.skill_graph?.categories ?? {};
    const colorMap = new Map<string, string>();

    Object.keys(categories).forEach((name, index) => {
      const defined = categories[name].color;
      colorMap.set(
        name,
        defined ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length],
      );
    });

    return (category: string | null) => {
      if (!category) {
        return UNCATEGORIZED_COLOR;
      }
      return colorMap.get(category) ?? UNCATEGORIZED_COLOR;
    };
  }, [config]);
}
