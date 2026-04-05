import { useState, useEffect, useMemo } from "react";
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
import { SkillGraphPage } from "./pages/SkillGraphPage";
import { SkillDetailPage } from "./pages/SkillDetailPage";
import { DictationPage } from "./pages/DictationPage";
import { SnippetsPage } from "./pages/SnippetsPage";
import { MiniPage } from "./pages/MiniPage";
import { useNavigateOnView } from "./hooks/useNavigateOnView";
import { useSessionNotifications } from "./hooks/useSessionNotifications";
import { useSessionEvents } from "./hooks/useSessionEvents";
import { useConfigQuery } from "./hooks/queries";
import { applyMode, Mode } from "@cloudscape-design/global-styles";
import { NotificationBar } from "./components/NotificationBar";
import { CommandPalette } from "./components/CommandPalette";
import { COMMAND_PALETTE_OPEN_EVENT } from "./constants";
import { isElectron } from "./utils/isElectron";
import {
  useHotkeyDictation,
  HotkeyDictationContext,
} from "./hooks/useHotkeyDictation";

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const { active: hotkeyDictationActive } = useHotkeyDictation();
  const { data } = useConfigQuery();
  useNavigateOnView();
  useSessionNotifications();
  useSessionEvents();

  const electron = isElectron();

  const navItems = useMemo<SideNavigationProps.Item[]>(() => {
    const items: SideNavigationProps.Item[] = [
      { type: "link", text: "Sessions", href: "/" },
      { type: "link", text: "Skills", href: "/skills" },
      { type: "link", text: "Cherrypick", href: "/cherrypick" },
    ];
    if (electron) {
      items.push(
        { type: "link", text: "Dictation", href: "/dictation" },
        { type: "link", text: "Snippets", href: "/snippets" },
      );
    }
    items.push(
      { type: "link", text: "Settings", href: "/settings" },
      { type: "link", text: "Command Palette", href: "#command-palette" },
    );
    return items;
  }, [electron]);

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

  const isMini = location.pathname === "/mini";

  if (isMini) {
    return (
      <HotkeyDictationContext.Provider value={hotkeyDictationActive}>
        <MiniPage />
        <CommandPalette />
      </HotkeyDictationContext.Provider>
    );
  }

  return (
    <HotkeyDictationContext.Provider value={hotkeyDictationActive}>
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
            items={navItems}
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
            <Route path="/skills" element={<SkillGraphPage />} />
            <Route path="/skills/:skillName" element={<SkillDetailPage />} />
            {electron && (
              <>
                <Route path="/dictation" element={<DictationPage />} />
                <Route path="/snippets" element={<SnippetsPage />} />
              </>
            )}
          </Routes>
        }
        disableContentPaddings={location.pathname === "/skills"}
        toolsHide
        maxContentWidth={Number.MAX_VALUE}
      />
      <NotificationBar />
      <CommandPalette />
    </HotkeyDictationContext.Provider>
  );
}
