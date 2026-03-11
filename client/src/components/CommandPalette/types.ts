import type { AutosuggestProps } from "@cloudscape-design/components/autosuggest";

export interface WindowEntry {
  label: string;
  href: string;
  description?: string;
  searchableText: string;
}

export type AutosuggestOption = AutosuggestProps.Option;
