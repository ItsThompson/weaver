import { useEffect } from "react";
import { useDictation } from "../../../hooks/useDictation";

export function useDictationPage() {
  const { state, actions } = useDictation();

  useEffect(() => {
    actions.checkServices();
  }, [actions.checkServices]);

  return { state, actions };
}
