import { useMemo } from "react";
import { useSSE } from "../useSSE";

interface UseServiceEventsOptions {
  onServicesRestarting: () => void;
}

export function useServiceEvents({
  onServicesRestarting,
}: UseServiceEventsOptions): void {
  const handlers = useMemo(
    () => ({ servicesRestarting: onServicesRestarting }),
    [onServicesRestarting],
  );
  useSSE(handlers);
}
