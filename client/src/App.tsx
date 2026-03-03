import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import AppLayout from "@cloudscape-design/components/app-layout";
import SideNavigation, {
  type SideNavigationProps,
} from "@cloudscape-design/components/side-navigation";
import { SessionsPage } from "./pages/SessionsPage";
import { SessionDetailPage } from "./pages/SessionDetailPage";
import { CherrypickPage } from "./pages/CherrypickPage";
import { OrphansPage } from "./pages/OrphansPage/OrphansPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useNavigateOnView } from "./hooks/useNavigateOnView";
import { useSessionNotifications } from "./hooks/useSessionNotifications";
import { useSessionEvents } from "./hooks/useSessionEvents";
import { useConfigQuery } from "./hooks/queries";
import { applyMode, Mode } from "@cloudscape-design/global-styles";
import { NotificationBar } from "./components/NotificationBar";
import { CommandPalette } from "./components/CommandPalette";
import { COMMAND_PALETTE_OPEN_EVENT } from "./constants";

const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: "link", text: "Sessions", href: "/" },
  { type: "link", text: "Cherrypick", href: "/cherrypick" },
  { type: "link", text: "Settings", href: "/settings" },
  { type: "link", text: "Command Palette", href: "#command-palette" },
];

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const { data } = useConfigQuery();
  useNavigateOnView();
  useSessionNotifications();
  useSessionEvents();

  useEffect(() => {
    applyMode(data?.config.dark_mode === false ? Mode.Light : Mode.Dark);
  }, [data?.config.dark_mode]);

  const handleFollow: SideNavigationProps["onFollow"] = (event) => {
    event.preventDefault();
    if (event.detail.href === "#command-palette") {
      document.dispatchEvent(new Event(COMMAND_PALETTE_OPEN_EVENT));
      return;
    }
    navigate(event.detail.href);
  };

  return (
    <>
      <div
        style={
          {
            height: 28,
            WebkitAppRegion: "drag",
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
          } as React.CSSProperties
        }
      />
      <AppLayout
        navigation={
          <SideNavigation
            header={{ text: "Weaver", href: "/" }}
            items={NAV_ITEMS}
            activeHref={location.pathname}
            onFollow={handleFollow}
          />
        }
        navigationOpen={navOpen}
        onNavigationChange={({ detail }) => setNavOpen(detail.open)}
        content={
          <Routes>
            <Route path="/" element={<SessionsPage />} />
            <Route path="/sessions/:id" element={<SessionDetailPage />} />
            <Route path="/cherrypick" element={<CherrypickPage />} />
            <Route path="/sessions/orphans" element={<OrphansPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        }
        toolsHide
      />
      <NotificationBar />
      <CommandPalette />
    </>
  );
}
