import type { CollectionPreferencesProps } from "@cloudscape-design/components/collection-preferences";

type ContentDisplayItem = CollectionPreferencesProps.ContentDisplayItem;

export function toContentDisplay(
  visibleIds: string[],
  defaults: ContentDisplayItem[],
): ContentDisplayItem[] {
  const visibleSet = new Set(visibleIds);
  return defaults.map((item) => ({ ...item, visible: visibleSet.has(item.id) }));
}

export function toVisibleIds(display: ContentDisplayItem[]): string[] {
  return display.filter((d) => d.visible).map((d) => d.id);
}
