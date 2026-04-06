import { useState, useEffect, useCallback, useRef } from "react";
import type { ServicesStatusResponse } from "@weaver/shared/types";
import { getServicesStatus } from "../../utils/api";

interface UseServicesStatusOptions {
  pollInterval?: number;
}

export function useServicesStatus(options: UseServicesStatusOptions = {}) {
  const { pollInterval } = options;
  const [status, setStatus] = useState<ServicesStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const refetch = useCallback(async () => {
    try {
      const data = await getServicesStatus();
      setStatus(data);
    } catch {
      /* fetch failure: keep previous status */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!pollInterval) {
      return;
    }
    intervalRef.current = setInterval(refetch, pollInterval);
    return () => clearInterval(intervalRef.current);
  }, [pollInterval, refetch]);

  return { status, loading, refetch };
}
