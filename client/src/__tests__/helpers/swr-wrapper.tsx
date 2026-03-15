import React from "react";
import { SWRConfig } from "swr";

export function SWRWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SWRConfig, {
    value: { provider: () => new Map(), dedupingInterval: 0 },
    children,
  });
}
