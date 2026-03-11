import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const PAGE_ROUTES: Record<string, string> = {
  sessions: "/",
  mini: "/mini",
};

export function useNavigateOnView(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  useEffect(() => {
    const source = new EventSource("/api/events");

    source.addEventListener("navigate", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          sessionId?: string;
          page?: string;
        };
        if (data.sessionId) {
          navigate(`/sessions/${data.sessionId}`);
        } else if (data.page === "toggle") {
          navigate(locationRef.current === "/mini" ? "/" : "/mini");
        } else if (data.page && PAGE_ROUTES[data.page]) {
          navigate(PAGE_ROUTES[data.page]);
        }
      } catch (e) {
        console.warn("Failed to parse navigate event:", e);
      }
    });

    return () => source.close();
  }, [navigate]);
}
