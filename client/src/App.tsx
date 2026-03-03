import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import AppLayout from '@cloudscape-design/components/app-layout';
import SideNavigation, { type SideNavigationProps } from '@cloudscape-design/components/side-navigation';
import { SessionsPage } from './pages/SessionsPage';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { CherrypickPage } from './pages/CherrypickPage';
import { OrphansPage } from './pages/OrphansPage/OrphansPage';
import { SettingsPage } from './pages/SettingsPage';
import { useNavigateOnView } from './hooks/useNavigateOnView';
import { useSessionNotifications } from './hooks/useSessionNotifications';
import { useSessionEvents } from './hooks/useSessionEvents';
import { NotificationBar } from './components/NotificationBar';

const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: 'link', text: 'Sessions', href: '/' },
  { type: 'link', text: 'Cherrypick', href: '/cherrypick' },
  { type: 'link', text: 'Settings', href: '/settings' },
];

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  useNavigateOnView();
  useSessionNotifications();
  useSessionEvents();

  const handleFollow: SideNavigationProps['onFollow'] = (event) => {
    event.preventDefault();
    navigate(event.detail.href);
  };

  return (
  <>
    <div style={{ height: 28, WebkitAppRegion: 'drag', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 } as React.CSSProperties} />
    <AppLayout
      navigation={
        <SideNavigation
          header={{ text: 'Weaver', href: '/' }}
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
  </>
  );
}
