import type { ComponentType, ReactNode } from "react";

export function ComposeProviders({
  providers,
  children,
}: {
  providers: ComponentType<{ children: ReactNode }>[];
  children: ReactNode;
}) {
  return providers.reduceRight<ReactNode>(
    (acc, Provider) => <Provider>{acc}</Provider>,
    children,
  );
}
